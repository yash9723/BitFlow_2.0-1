"use client";
/**
 * hooks/useArenaProblem.ts — Arena simulation + submission engine
 *
 * Parallel to hooks/useProblem.ts but operates on ArenaProblem objects.
 * Reuses the same backend /simulate endpoint via lib/api.ts runSimulation().
 *
 * submit() is graded server-side (POST /api/problems/[slug]/submit), same as
 * useProblem; hidden testcases never reach the browser.
 */

import { useState, useCallback } from "react";
import type { ArenaProblem, ArenaSubmissionResult } from "@/lib/arena/types";
import type { SimulateResponse } from "@/lib/types";
import { runSimulation, submitSolution } from "@/lib/api";
import { saveSubmission } from "@/lib/save-submission";
import { useAuth } from "@/hooks/useAuth";

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

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

export function useArenaProblem(problem: ArenaProblem): UseArenaProblemReturn {
  const { user } = useAuth();
  const [designCode,    setDesignCode]    = useState(problem.starterCode);
  // Arena exposes the public testbench in the editor (read-only view)
  const [testbenchCode, setTestbenchCode] = useState(problem.testbenchSkeleton);
  const [runState,      setRunState]      = useState<ArenaRunState>("idle");
  const [runResult,     setRunResult]     = useState<SimulateResponse | null>(null);
  const [submission,    setSubmission]    = useState<ArenaSubmissionResult | null>(null);
  const [errorMsg,      setErrorMsg]      = useState<string | null>(null);
  const [submittingIndex, setSubmittingIndex] = useState(0);
  const [submittingTotal, setSubmittingTotal] = useState(0);

  // ── Run against public testbench ──────────────────────────────────────────
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
      }).catch(err => console.warn("[useArenaProblem.run] submission save:", err));

    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Network error");
      setRunState("error");
    }
  }, [runState, designCode, testbenchCode, problem, user?.id]);

  // ── Submit (graded on the server against hidden tests) ────────────────────
  const submit = useCallback(async (): Promise<ArenaSubmissionResult | null> => {
    if (runState === "running" || runState === "submitting") return null;
    setRunState("submitting");
    setSubmittingTotal(1);
    setSubmittingIndex(0);
    setErrorMsg(null);
    try {
      const sub = await submitSolution<ArenaSubmissionResult>(problem.slug, designCode, testbenchCode);
      setSubmission(sub);
      setRunState("submitted");
      return sub;
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Network error");
      setRunState("error");
      return null;
    }
  }, [runState, problem.slug, designCode, testbenchCode]);

  // ── Reset ─────────────────────────────────────────────────────────────────
  const resetToStarter = useCallback(() => {
    setDesignCode(problem.starterCode);
    setTestbenchCode(problem.testbenchSkeleton);
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