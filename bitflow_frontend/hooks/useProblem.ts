"use client";
/**
 * hooks/useProblem.ts — Problem-mode simulation + submission engine
 *
 * SEPARATION FROM useSimulation:
 *   useSimulation owns Sandbox state (persistent editors, workspace storage).
 *   useProblem owns Problem Arena state (injected starter code, verdict tracking).
 *   They share the same backend /simulate endpoint but are independent hooks.
 *
 * RUN vs SUBMIT:
 *   run()    → single simulation with the public testbench (fast feedback)
 *   submit() → POST /api/problems/[slug]/submit; the server runs the hidden
 *              tests, records the submission and awards XP. Hidden tests
 *              never reach the browser.
 *
 * LANGUAGES:
 *   The design can be written in Verilog/SystemVerilog or, when the problem's
 *   ports fit a VHDL entity, in VHDL (graded through its GHDL Verilog netlist by
 *   the same tests). Each language keeps its own editor contents.
 */

import { useState, useCallback, useEffect, useMemo } from "react";
import type { Problem, SubmissionResult } from "@/lib/problem-types";
import type { DesignLanguage, SimulateResponse } from "@/lib/types";
import { runSimulation, checkHealth, submitSolution } from "@/lib/api";
import { saveSubmission } from "@/lib/save-submission";
import { useAuth } from "@/hooks/useAuth";
import { vhdlStarter } from "@/lib/vhdl-starter";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type ProblemRunState =
  | "idle"
  | "running"     // local run in progress
  | "run_done"    // local run completed
  | "submitting"  // submission in progress (multiple testcases)
  | "submitted"   // submission completed
  | "error";      // network/infra error

export interface UseProblemReturn {
  // Editor state (problem-owned, not localStorage)
  designCode:       string;
  testbenchCode:    string;
  setDesignCode:    (v: string) => void;
  setTestbenchCode: (v: string) => void;

  // Design language (VHDL only where vhdlAvailable)
  language:         DesignLanguage;
  vhdlAvailable:    boolean;
  setLanguage:      (l: DesignLanguage) => void;

  // Run state
  runState:         ProblemRunState;
  isRunning:        boolean;
  isSubmitting:     boolean;

  // Results
  runResult:        SimulateResponse | null;   // last local run result
  submission:       SubmissionResult | null;   // last submission result
  errorMsg:         string | null;

  // Submission progress (for UI during sequential evaluation)
  submittingIndex:  number;                    // which testcase is running (0-based)
  submittingTotal:  number;

  // Actions
  run:              () => Promise<void>;
  submit:           () => Promise<SubmissionResult | null>;
  resetToStarter:   () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

export function useProblem(problem: Problem): UseProblemReturn {
  const { user } = useAuth();

  // Pre-warm backend in background on problem page load
  useEffect(() => {
    checkHealth();
  }, []);

  // RISC-V steps carry accepted Verilog into later steps' starters, and SystemVerilog
  // problems teach SV, so both stay Verilog-only.
  const vhdlStart = useMemo(
    () => (problem.category === "riscv" || problem.category === "systemverilog" ? null : vhdlStarter(problem.starterCode)),
    [problem.category, problem.starterCode],
  );

  const [language,      setLanguage]      = useState<DesignLanguage>("verilog");
  const [verilogCode,   setVerilogCode]   = useState(problem.starterCode);
  const [vhdlCode,      setVhdlCode]      = useState(vhdlStart ?? "");
  const [testbenchCode, setTestbenchCode] = useState(problem.publicTestbench);
  const [runState,      setRunState]      = useState<ProblemRunState>("idle");
  const [runResult,     setRunResult]     = useState<SimulateResponse | null>(null);
  const [submission,    setSubmission]    = useState<SubmissionResult | null>(null);
  const [errorMsg,      setErrorMsg]      = useState<string | null>(null);
  const [submittingIndex, setSubmittingIndex] = useState(0);
  const [submittingTotal, setSubmittingTotal] = useState(0);

  const designCode    = language === "vhdl" ? vhdlCode : verilogCode;
  const setDesignCode = language === "vhdl" ? setVhdlCode : setVerilogCode;

  // ── Local run (public testbench) ──────────────────────────────────────────

  const run = useCallback(async () => {
    if (runState === "running" || runState === "submitting") return;
    setRunState("running");
    setErrorMsg(null);
    setRunResult(null);
    try {
      const result = await runSimulation({
        design_v:    designCode,
        testbench_v: testbenchCode,
        timeout:     30,
        lint:        true,
        design_language: language,
        ...(problem.dataFiles ? { files: problem.dataFiles } : {}),
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
        language,
      }).catch(err => console.warn("[useProblem.run] submission save:", err));

    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Network error");
      setRunState("error");
    }
  }, [runState, designCode, testbenchCode, problem, user?.id, language]);

  // ── Submit (graded on the server against hidden tests) ────────────────────

  const submit = useCallback(async (): Promise<SubmissionResult | null> => {
    if (runState === "running" || runState === "submitting") return null;
    setRunState("submitting");
    setSubmittingTotal(1);
    setSubmittingIndex(0);
    setErrorMsg(null);
    try {
      const sub = await submitSolution<SubmissionResult>(problem.slug, designCode, testbenchCode, { language });
      setSubmission(sub);
      setRunState("submitted");
      return sub;
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Network error");
      setRunState("error");
      return null;
    }
  }, [runState, problem.slug, designCode, testbenchCode, language]);

  // ── Reset to starter code ─────────────────────────────────────────────────

  const resetToStarter = useCallback(() => {
    setVerilogCode(problem.starterCode);
    setVhdlCode(vhdlStart ?? "");
    setTestbenchCode(problem.publicTestbench);
    setRunState("idle");
    setRunResult(null);
    setSubmission(null);
    setErrorMsg(null);
  }, [problem, vhdlStart]);

  return {
    designCode,
    testbenchCode,
    setDesignCode,
    setTestbenchCode,
    language,
    vhdlAvailable: vhdlStart !== null,
    setLanguage,
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
