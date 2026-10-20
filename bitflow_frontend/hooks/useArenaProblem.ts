"use client";
/**
 * hooks/useArenaProblem.ts — Arena simulation + submission engine
 *
 * Parallel to hooks/useProblem.ts but operates on ArenaProblem objects.
 * Reuses the same backend /simulate endpoint via lib/api.ts runSimulation().
 *
 * submit() is graded server-side (POST /api/problems/[slug]/submit), same as
 * useProblem; hidden testcases never reach the browser.
 *
 * Testbench problems can be answered in Verilog or as a cocotb (Python) test
 * module; formal problems are answered with a property harness, and their Run is
 * a bounded formal check (POST /api/formal) shown in the same terminal/waveform.
 */

import { useState, useCallback, useEffect } from "react";
import type { ArenaProblem, ArenaSubmissionResult } from "@/lib/arena/types";
import type { SimulateResponse } from "@/lib/types";
import { runSimulation, submitSolution, checkHealth } from "@/lib/api";
import { saveSubmission } from "@/lib/save-submission";
import { useAuth } from "@/hooks/useAuth";

export type ArenaTestbenchLanguage = "verilog" | "python";

/** Starting point for a cocotb answer to a "find the bugs" problem (the DUT's ports differ per problem). */
export const COCOTB_TB_SKELETON = `# cocotb testbench: the design is the DUT on the left, reachable as \`dut\`.
# A failing assert (or exception) means "bug found". Allowed imports: cocotb, random, math, itertools.
import random
import cocotb
from cocotb.clock import Clock
from cocotb.triggers import ClockCycles, ReadOnly, RisingEdge, Timer


@cocotb.test()
async def finds_bugs(dut):
    # For a clocked design, start a clock first:
    #   cocotb.start_soon(Clock(dut.clk, 10, unit="ns").start())
    # Drive inputs:      dut.a.value = 3
    # Let logic settle:  await Timer(1, unit="ns")    (or await RisingEdge(dut.clk))
    # Check outputs:     assert int(dut.y.value) == expected, "explain the mismatch"
    pass
`;

// ─────────────────────────────────────────────────────────────────────────────
// Run state
// ─────────────────────────────────────────────────────────────────────────────

export type ArenaRunState =
  | "idle"
  | "running"
  | "run_done"
  | "submitting"
  | "submitted"
  | "error";

export interface UseArenaProblemReturn {
  // Editor state
  designCode:       string;
  testbenchCode:    string;
  setDesignCode:    (v: string) => void;
  setTestbenchCode: (v: string) => void;

  // Testbench language (testbench problems only)
  testbenchLanguage:    ArenaTestbenchLanguage;
  setTestbenchLanguage: (l: ArenaTestbenchLanguage) => void;

  // State
  runState:         ArenaRunState;
  isRunning:        boolean;
  isSubmitting:     boolean;

  // Results
  runResult:        SimulateResponse | null;
  submission:       ArenaSubmissionResult | null;
  errorMsg:         string | null;

  // Progress during multi-testcase submission
  submittingIndex:  number;
  submittingTotal:  number;

  // Actions
  run:            () => Promise<void>;
  submit:         () => Promise<ArenaSubmissionResult | null>;
  resetToStarter: () => void;
}

/** A formal check, shaped like a simulation result so the Terminal and waveform show it. */
async function runFormalCheck(design: string, harness: string, depth: number): Promise<SimulateResponse> {
  const t0 = Date.now();
  const res = await fetch("/api/formal", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ designCode: design, harnessCode: harness, mode: "bmc", depth }),
  });
  const r = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(r.error ?? `Formal check failed (${res.status})`);
  const passed = r.status === "passed";
  const verdict = passed
    ? `PASS: no assertion fails within ${depth} clock cycles on this design.`
    : r.status === "failed"
      ? `FAIL: the assertion at ${r.failed?.file}:${r.failed?.line} fails after ${r.failed?.step ?? "?"} steps. The waveform is the solver's counterexample.`
      : `ERROR: ${r.error ?? "the check could not run"}`;
  const vcd: string | null = r.vcd_base64 ?? null;
  return {
    status:       passed ? "success" : r.status === "error" ? "compile_error" : "runtime_error",
    exit_code:    passed ? 0 : 1,
    success:      passed,
    stdout:       `--- Formal check (Yosys + Z3, ${depth} cycles from your assumptions) ---\n${r.log ?? ""}\n\n${verdict}`,
    stderr:       r.status === "error" ? r.error ?? "" : "",
    waveform:     { available: !!vcd, size_bytes: vcd ? vcd.length : 0, vcd_base64: vcd },
    duration_ms:  Date.now() - t0,
    workspace_id: "",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

export function useArenaProblem(problem: ArenaProblem): UseArenaProblemReturn {
  const { user } = useAuth();
  const isFormal = problem.problemType === "formal";
  const [designCode,    setDesignCode]    = useState(problem.starterCode);
  // Arena exposes the public testbench in the editor (read-only view)
  const [verilogTb,     setVerilogTb]     = useState(problem.testbenchSkeleton);
  const [cocotbTb,      setCocotbTb]      = useState(COCOTB_TB_SKELETON);
  const [testbenchLanguage, setTestbenchLanguage] = useState<ArenaTestbenchLanguage>("verilog");
  const [runState,      setRunState]      = useState<ArenaRunState>("idle");
  const [runResult,     setRunResult]     = useState<SimulateResponse | null>(null);

  const testbenchCode    = testbenchLanguage === "python" ? cocotbTb : verilogTb;
  const setTestbenchCode = testbenchLanguage === "python" ? setCocotbTb : setVerilogTb;

  // Wake the simulator (it sleeps when idle) while the learner reads the problem.
  useEffect(() => { checkHealth(); }, []);
  const [submission,    setSubmission]    = useState<ArenaSubmissionResult | null>(null);
  const [errorMsg,      setErrorMsg]      = useState<string | null>(null);
  const [submittingIndex, setSubmittingIndex] = useState(0);
  const [submittingTotal, setSubmittingTotal] = useState(0);

  // ── Run against public testbench (or a formal check of the harness) ───────
  const run = useCallback(async () => {
    if (runState === "running" || runState === "submitting") return;
    setRunState("running");
    setErrorMsg(null);
    setRunResult(null);
    try {
      const result = isFormal
        ? await runFormalCheck(problem.starterCode, testbenchCode, problem.formalDepth ?? 20)
        : await runSimulation({
            design_v:    designCode,
            testbench_v: testbenchCode,
            timeout:     30,
            lint:        true,
            testbench_language: testbenchLanguage,
          });
      setRunResult(result);
      setRunState("run_done");

      // ✅ Save submission to database (fire-and-forget)
      saveSubmission({
        userId:         user?.id,
        problemSlug:    problem.slug,
        designCode:     designCode,
        testbenchCode:  testbenchCode,
        submissionType: "RUN",
        simStatus:      result.success ? "SUCCESS" : "COMPILE_ERROR",
        simStdout:      result.stdout ?? null,
        simStderr:      result.stderr ?? null,
        simExitCode:    result.exit_code ?? null,
        durationMs:     result.duration_ms ?? null,
        testcaseResults: [],
        waveformVcd:    result.waveform?.vcd_base64 ?? null,
        xpEarned:       0,
        accepted:       false,
        language:       testbenchLanguage,
      }).catch(err => console.warn("[useArenaProblem.run] submission save:", err));

    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Network error");
      setRunState("error");
    }
  }, [runState, designCode, testbenchCode, testbenchLanguage, isFormal, problem, user?.id]);

  // ── Submit (graded on the server against hidden tests) ────────────────────
  const submit = useCallback(async (): Promise<ArenaSubmissionResult | null> => {
    if (runState === "running" || runState === "submitting") return null;
    setRunState("submitting");
    setSubmittingTotal(1);
    setSubmittingIndex(0);
    setErrorMsg(null);
    try {
      const sub = await submitSolution<ArenaSubmissionResult>(problem.slug, designCode, testbenchCode, { testbenchLanguage });
      setSubmission(sub);
      setRunState("submitted");
      return sub;
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Network error");
      setRunState("error");
      return null;
    }
  }, [runState, problem.slug, designCode, testbenchCode, testbenchLanguage]);

  // ── Reset ─────────────────────────────────────────────────────────────────
  const resetToStarter = useCallback(() => {
    setDesignCode(problem.starterCode);
    setVerilogTb(problem.testbenchSkeleton);
    setCocotbTb(COCOTB_TB_SKELETON);
    setRunState("idle");
    setRunResult(null);
    setSubmission(null);
    setErrorMsg(null);
  }, [problem]);

  return {
    designCode,
    testbenchCode,
    setDesignCode,
    setTestbenchCode,
    testbenchLanguage,
    setTestbenchLanguage,
    runState,
    isRunning:      runState === "running",
    isSubmitting:   runState === "submitting",
    runResult,
    submission,
    errorMsg,
    submittingIndex,
    submittingTotal,
    run,
    submit,
    resetToStarter,
  };
}
