/**
 * hooks/useSimulation.ts — Simulation state management
 *
 * This hook owns all mutable state related to a simulation run:
 *   • Editor content (design_v, testbench_v)
 *   • Run state (idle → running → done | error)
 *   • The last API response
 *   • Error messages from network failures
 *
 * Why a custom hook?
 *   - Keeps page.tsx and components free of useState/useCallback clutter.
 *   - Makes the simulation logic testable in isolation.
 *   - Provides a clean, typed interface: components only see what they need.
 */

"use client";

import { useState, useCallback, useEffect } from "react";
import { runSimulation, checkHealth } from "@/lib/api";
import { parseVcd } from "@/lib/vcd-parser";
import type { DesignLanguage, RunState, SimulateResponse, ParsedVcd, TestbenchLanguage } from "@/lib/types";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { combineDesign, dataFiles, relabelOutput, type ProjectFile } from "@/lib/project-files";

// ─────────────────────────────────────────────────────────────────────────────
// Default editor content — shown on first load
// ─────────────────────────────────────────────────────────────────────────────

/** localStorage keys of the Sandbox editors (JSON strings); "Fork" on /s/[id] writes them too. */
export const DESIGN_STORAGE_KEY    = "bitflow_design_v";
export const TESTBENCH_STORAGE_KEY = "bitflow_testbench_v";
/** Selected languages; each language keeps its own editor contents under its own key. */
export const DESIGN_LANGUAGE_KEY    = "bitflow_design_lang";
export const TESTBENCH_LANGUAGE_KEY = "bitflow_tb_lang";
/** Design files after design.v (Verilog projects; lib/project-files.ts). */
export const EXTRA_FILES_KEY = "bitflow_extra_files";

export const DEFAULT_DESIGN = `\`timescale 1ns / 1ps

// 4-bit synchronous up-counter with enable and reset
module counter #(
    parameter WIDTH = 4
)(
    input  wire             clk,
    input  wire             rst,
    input  wire             en,
    output reg  [WIDTH-1:0] count
);
    always @(posedge clk) begin
        if (rst)
            count <= {WIDTH{1'b0}};
        else if (en)
            count <= count + 1'b1;
    end
endmodule
`;

export const DEFAULT_TESTBENCH = `\`timescale 1ns / 1ps

module tb_counter;
    reg        clk;
    reg        rst;
    reg        en;
    wire [3:0] count;

    // Instantiate the DUT
    counter #(.WIDTH(4)) dut (
        .clk   (clk),
        .rst   (rst),
        .en    (en),
        .count (count)
    );

    // 100 MHz clock
    initial clk = 0;
    always  #5 clk = ~clk;

    // Waveform dump
    initial begin
        $dumpfile("wave.vcd");
        $dumpvars(0, tb_counter);
    end

    // Stimulus
    initial begin
        $display("=== Counter Test Start ===");
        rst = 1; en = 0;
        repeat(3) @(posedge clk);

        rst = 0; en = 1;
        repeat(20) @(posedge clk);

        $display("Final count: %0d", count);
        $display("=== Test Complete ===");
        $finish;
    end
endmodule
`;

// Same counter (same ports) in VHDL, so the cocotb test below works with either design.
export const DEFAULT_DESIGN_VHDL = `-- 4-bit synchronous up-counter with enable and reset
library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity counter is
    port (
        clk   : in  std_logic;
        rst   : in  std_logic;
        en    : in  std_logic;
        count : out std_logic_vector(3 downto 0)
    );
end entity;

architecture rtl of counter is
    signal c : unsigned(3 downto 0) := (others => '0');
begin
    process (clk) begin
        if rising_edge(clk) then
            if rst = '1' then
                c <= (others => '0');
            elsif en = '1' then
                c <= c + 1;
            end if;
        end if;
    end process;
    count <= std_logic_vector(c);
end architecture;
`;

export const DEFAULT_TESTBENCH_VHDL = `library ieee;
use ieee.std_logic_1164.all;

entity tb_counter is
end entity;

architecture sim of tb_counter is
    signal clk, rst, en : std_logic := '0';
    signal count        : std_logic_vector(3 downto 0);
begin
    dut: entity work.counter port map (clk => clk, rst => rst, en => en, count => count);

    clk <= not clk after 5 ns;      -- 100 MHz clock

    process begin
        report "=== Counter Test Start ===";
        rst <= '1';
        wait for 30 ns;
        rst <= '0';  en <= '1';
        wait for 200 ns;
        report "Final count: " & to_hstring(count);
        assert count = x"4" report "count should have wrapped to 4" severity error;
        std.env.finish;             -- ends the simulation (the clock runs forever)
    end process;
end architecture;
`;

export const DEFAULT_TESTBENCH_COCOTB = `# cocotb testbench: Python coroutines drive and check the design.
# Allowed imports: cocotb, random, math, itertools.
import cocotb
from cocotb.clock import Clock
from cocotb.triggers import ClockCycles, ReadOnly


@cocotb.test()
async def counts_when_enabled(dut):
    cocotb.start_soon(Clock(dut.clk, 10, unit="ns").start())
    dut.rst.value = 1
    dut.en.value = 0
    await ClockCycles(dut.clk, 3)

    dut.rst.value = 0
    dut.en.value = 1
    await ClockCycles(dut.clk, 20)
    await ReadOnly()                 # read after this edge's updates
    cocotb.log.info(f"Final count: {int(dut.count.value)}")
    assert int(dut.count.value) == 20 % 16, f"count = {int(dut.count.value)}"


@cocotb.test()
async def holds_when_disabled(dut):
    cocotb.start_soon(Clock(dut.clk, 10, unit="ns").start())
    dut.rst.value = 1
    dut.en.value = 0
    await ClockCycles(dut.clk, 2)
    dut.rst.value = 0
    await ClockCycles(dut.clk, 5)
    await ReadOnly()
    assert int(dut.count.value) == 0
`;

// ─────────────────────────────────────────────────────────────────────────────
// Hook return type — explicit so components can import it if needed
// ─────────────────────────────────────────────────────────────────────────────

export interface SandboxProject {
  design:             string;
  testbench:          string;
  files?:             ProjectFile[];
  designLanguage?:    DesignLanguage;
  testbenchLanguage?: TestbenchLanguage;
}

export interface UseSimulationReturn {
  // Editor content (of the selected languages)
  designCode:     string;
  testbenchCode:  string;
  setDesignCode:  (v: string) => void;
  setTestbenchCode: (v: string) => void;

  // Languages: a VHDL testbench needs a VHDL design (GHDL can't simulate Verilog)
  designLanguage:       DesignLanguage;
  testbenchLanguage:    TestbenchLanguage;
  setDesignLanguage:    (l: DesignLanguage) => void;
  setTestbenchLanguage: (l: TestbenchLanguage) => void;
  /** Replace both editors (and switch languages), e.g. from a template. */
  loadProject:          (p: SandboxProject) => void;

  /** Design files after design.v (Verilog only), and what tools get: design.v with them appended. */
  extraFiles:           ProjectFile[];
  setExtraFiles:        (files: ProjectFile[]) => void;
  projectDesign:        string;

  // Run lifecycle
  runState:    RunState;
  isRunning:   boolean;

  // Results
  result:      SimulateResponse | null;
  errorMsg:    string | null;   // network / infra error (not compile error)

  // ── NEW: parsed waveform data ──────────────────────────────────────────
  /**
   * Populated after a successful simulation that produced a VCD file.
   * null if no simulation has run, or the last run had no waveform output.
   */
  parsedVcd:   ParsedVcd | null;

  // Actions
  simulate:    () => Promise<void>;
  clearResult: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

export function useSimulation(): UseSimulationReturn {
  // Persisted to localStorage — restored automatically on refresh.
  // Key names are stable strings; changing them clears stored values.
  const [designLanguage,    setDesignLang] = useLocalStorage<DesignLanguage>(DESIGN_LANGUAGE_KEY, "verilog");
  const [testbenchLanguage, setTbLang]     = useLocalStorage<TestbenchLanguage>(TESTBENCH_LANGUAGE_KEY, "verilog");
  const design = {
    verilog: useLocalStorage<string>(DESIGN_STORAGE_KEY, DEFAULT_DESIGN),
    vhdl:    useLocalStorage<string>("bitflow_design_vhdl", DEFAULT_DESIGN_VHDL),
  };
  const testbench = {
    verilog: useLocalStorage<string>(TESTBENCH_STORAGE_KEY, DEFAULT_TESTBENCH),
    vhdl:    useLocalStorage<string>("bitflow_testbench_vhdl", DEFAULT_TESTBENCH_VHDL),
    python:  useLocalStorage<string>("bitflow_testbench_py", DEFAULT_TESTBENCH_COCOTB),
  };
  const DEFAULTS = { verilog: [DEFAULT_DESIGN, DEFAULT_TESTBENCH], vhdl: [DEFAULT_DESIGN_VHDL, DEFAULT_TESTBENCH_VHDL],
                     python: ["", DEFAULT_TESTBENCH_COCOTB] } as const;

  const [storedDesignCode,    setDesignCode]    = design[designLanguage] ?? design.verilog;
  const [storedTestbenchCode, setTestbenchCode] = testbench[testbenchLanguage] ?? testbench.verilog;
  const designCode    = storedDesignCode.trim() === "" ? DEFAULTS[designLanguage][0] : storedDesignCode;
  const testbenchCode = storedTestbenchCode.trim() === "" ? DEFAULTS[testbenchLanguage][1] : storedTestbenchCode;

  const setDesignLanguage = useCallback((l: DesignLanguage) => {
    setDesignLang(l);
    if (l === "verilog" && testbenchLanguage === "vhdl") setTbLang("verilog");
  }, [setDesignLang, setTbLang, testbenchLanguage]);
  const setTestbenchLanguage = useCallback((l: TestbenchLanguage) => {
    setTbLang(l);
    if (l === "vhdl") setDesignLang("vhdl");
  }, [setDesignLang, setTbLang]);
  const loadProject = (p: SandboxProject) => {
    const dl = p.designLanguage ?? "verilog", tl = p.testbenchLanguage ?? "verilog";
    setDesignLang(dl);
    setTbLang(tl);
    design[dl][1](p.design);
    testbench[tl][1](p.testbench);
    setExtraFiles(p.files ?? []);
  };

  // Extra files are Verilog-only; a VHDL project is a single file.
  const [storedExtraFiles, setExtraFiles] = useLocalStorage<ProjectFile[]>(EXTRA_FILES_KEY, []);
  const extraFiles = designLanguage === "verilog" && Array.isArray(storedExtraFiles) ? storedExtraFiles : [];
  const project = combineDesign(designCode, extraFiles);
  const projectDesign = project.multi ? project.code : designCode;

  const [runState,      setRunState]      = useState<RunState>("idle");
  const [result,        setResult]        = useState<SimulateResponse | null>(null);
  const [errorMsg,      setErrorMsg]      = useState<string | null>(null);
  const [parsedVcd,     setParsedVcd]     = useState<ParsedVcd | null>(null);

  // ── Pre-warm backend in background on load ──────────────────────────────────
  useEffect(() => {
    checkHealth();
  }, []);

  /**
   * Kick off a simulation run.
   * Transitions: idle/done/error → running → done | error
   */
  const simulate = useCallback(async () => {
    // Prevent double-submission
    if (runState === "running") return;

    setRunState("running");
    setResult(null);
    setErrorMsg(null);
    setParsedVcd(null); // clear previous waveform while new run is in progress

    try {
      const files = dataFiles(extraFiles);
      const raw = await runSimulation({
        design_v:    projectDesign,
        ...(files ? { files } : {}),
        testbench_v: testbenchCode,
        timeout:     30,
        lint:        true,
        design_language:    designLanguage,
        testbench_language: testbenchLanguage,
      });

      // Messages about the combined design.v point at the file they came from.
      const response = project.multi
        ? { ...raw, stdout: relabelOutput(raw.stdout, project.locate) ?? raw.stdout, stderr: relabelOutput(raw.stderr, project.locate) ?? raw.stderr }
        : raw;

      // The response is always a valid SimulateResponse — even compile errors
      // come back as HTTP 200 with status !== "success". Only network failures
      // end up in the catch block below.
      setResult(response);
      setRunState("done");

      // ── NEW: decode and parse VCD waveform ───────────────────────────────
      // Only attempt parsing when the backend confirms a VCD was produced
      // AND included the base64 payload.
      if (response.waveform.available && response.waveform.vcd_base64) {
        try {
          // atob() decodes base64 → binary string (same as Buffer.from(...,'base64').toString())
          const rawText = atob(response.waveform.vcd_base64);
          const parsed  = parseVcd(rawText);
          setParsedVcd(parsed);
        } catch (parseErr) {
          // Parse failure is non-fatal — terminal output still works fine.
          console.warn("[BitFlow] VCD parse error:", parseErr);
          setParsedVcd(null);
        }
      }
    } catch (err: unknown) {
      // Network-level failure: backend not running, Docker down, etc.
      const message =
        err instanceof Error ? err.message : "An unexpected error occurred.";
      setErrorMsg(message);
      setRunState("error");
    }
  }, [runState, projectDesign, extraFiles, testbenchCode, designLanguage, testbenchLanguage]);  // eslint-disable-line react-hooks/exhaustive-deps

  /** Reset the terminal panel to its idle state. */
  const clearResult = useCallback(() => {
    setResult(null);
    setErrorMsg(null);
    setRunState("idle");
    setParsedVcd(null); // ── NEW: clear waveform on reset
  }, []);

  return {
    designCode,
    testbenchCode,
    setDesignCode,
    setTestbenchCode,
    designLanguage,
    testbenchLanguage,
    setDesignLanguage,
    setTestbenchLanguage,
    loadProject,
    extraFiles,
    setExtraFiles,
    projectDesign,
    runState,
    isRunning: runState === "running",
    result,
    errorMsg,
    parsedVcd, // ── NEW
    simulate,
    clearResult,
  };
}