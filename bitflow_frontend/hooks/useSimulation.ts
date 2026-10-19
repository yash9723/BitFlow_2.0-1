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
import type { RunState, SimulateResponse, ParsedVcd } from "@/lib/types";
import { useLocalStorage } from "@/hooks/useLocalStorage";

// ─────────────────────────────────────────────────────────────────────────────
// Default editor content — shown on first load
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// Hook return type — explicit so components can import it if needed
// ─────────────────────────────────────────────────────────────────────────────

export interface UseSimulationReturn {
  // Editor content
  designCode:     string;
  testbenchCode:  string;
  setDesignCode:  (v: string) => void;
  setTestbenchCode: (v: string) => void;

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
  const [storedDesignCode,    setDesignCode]    = useLocalStorage<string>("bitflow_design_v",    DEFAULT_DESIGN);
  const [storedTestbenchCode, setTestbenchCode] = useLocalStorage<string>("bitflow_testbench_v", DEFAULT_TESTBENCH);

  const designCode = storedDesignCode.trim() === "" ? DEFAULT_DESIGN : storedDesignCode;
  const testbenchCode = storedTestbenchCode.trim() === "" ? DEFAULT_TESTBENCH : storedTestbenchCode;

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
      const response = await runSimulation({
        design_v:    designCode,
        testbench_v: testbenchCode,
        timeout:     30,
        lint:        true,
      });

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
  }, [runState, designCode, testbenchCode]);

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
    runState,
    isRunning: runState === "running",
    result,
    errorMsg,
    parsedVcd, // ── NEW
    simulate,
    clearResult,
  };
}