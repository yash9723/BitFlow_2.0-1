/**
 * lib/grading.ts — Server-side grading of a submitted design.
 *
 * Runs the design against the question's hidden testbench / hidden testcases
 * on the simulation backend and computes the verdict. Hidden tests never
 * leave the server; the client only sees the resulting verdicts.
 */

import type { Testcase, TestcaseVerdict } from "@/lib/problem-types";
import type { SimulateResponse } from "@/lib/types";
import { simulateOnBackend } from "@/lib/backend";

export interface GradableQuestion {
  learningLevel:      string;
  expectedOutputMode: string;
  publicTestbench:    string;
  hiddenTestbench:    string | null;
  hiddenTestcases:    string; // JSON-stringified Testcase[]
}

export interface GradeResult {
  verdicts:        TestcaseVerdict[];
  passed:          number;
  total:           number;
  accepted:        boolean;
  totalDurationMs: number;
  stdout:          string | null;
  stderr:          string | null;
  exitCode:        number | null;
  errorMessage?:   string;
}

/**
 * Compare actual stdout against expected output.
 *   1. "ALL TESTS PASSED" sentinel → stdout contains it and no FAIL lines.
 *   2. Otherwise every expected line must appear somewhere in actual
 *      (actual may contain extra compiler/VCD lines).
 */
export function compareStdout(actual: string, expected: string): boolean {
  const normalise = (s: string) =>
    s.trim().split("\n").map((l) => l.trim()).filter(Boolean);

  const actualLines   = normalise(actual);
  const expectedLines = normalise(expected);

  if (expectedLines.length === 1 && expectedLines[0] === "ALL TESTS PASSED") {
    return (
      actual.includes("ALL TESTS PASSED") &&
      !actual.includes("TESTS FAILED") &&
      !actual.includes("FAIL:")
    );
  }

  return expectedLines.every((el) => actualLines.some((al) => al.includes(el)));
}

/** Single-testbench verdict: "ALL TESTS PASSED" or no FAIL lines. */
function sentinelPassed(r: SimulateResponse): boolean {
  const stdout = r.stdout ?? "";
  return (
    r.success &&
    (stdout.includes("ALL TESTS PASSED") ||
      (!stdout.includes("FAIL") && !stdout.includes("TESTS FAILED")))
  );
}

async function simulate(design: string, testbench: string): Promise<SimulateResponse> {
  const { status, data } = await simulateOnBackend({
    design_v:    design,
    testbench_v: testbench,
    timeout:     30,
  });
  if (status !== 200) {
    throw new Error(data?.detail || data?.error || `Simulation backend returned ${status}`);
  }
  return data as SimulateResponse;
}

function parseTestcases(json: string): Testcase[] {
  try {
    const v = JSON.parse(json || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/** Grade a design. Throws only on backend/infrastructure failure. */
export async function gradeDesign(q: GradableQuestion, designCode: string): Promise<GradeResult> {
  const testcases = parseTestcases(q.hiddenTestcases);

  // Single testbench: the hidden one, or the public one if the problem has none.
  if (testcases.length === 0) {
    const r = await simulate(designCode, q.hiddenTestbench || q.publicTestbench);
    const ok = sentinelPassed(r);
    return {
      verdicts:        [],
      passed:          ok ? 1 : 0,
      total:           1,
      accepted:        ok,
      totalDurationMs: r.duration_ms ?? 0,
      stdout:          r.stdout ?? null,
      stderr:          r.stderr ?? null,
      exitCode:        r.exit_code ?? null,
      errorMessage:    ok ? undefined : r.stderr || r.stdout || "Tests failed",
    };
  }

  const compare =
    q.learningLevel === "Arena" ||
    q.expectedOutputMode === "stdout_compare" ||
    q.expectedOutputMode === "signal_compare";

  const verdicts: TestcaseVerdict[] = [];
  let totalDurationMs = 0;

  for (const tc of testcases) {
    const r = await simulate(designCode, tc.testbench);
    const stdout = r.stdout ?? "";
    totalDurationMs += r.duration_ms ?? 0;

    const passed = !r.success
      ? false
      : compare
        ? compareStdout(stdout, tc.expected)
        : !stdout.includes("FAIL") && !stdout.includes("TESTS FAILED");

    verdicts.push({
      testcaseId:     tc.id,
      description:    tc.description,
      passed,
      actualOutput:   stdout,
      expectedOutput: tc.expected,
      durationMs:     r.duration_ms ?? 0,
      ...(r.success ? {} : { error: r.stderr || `Exit status: ${r.status}` }),
    });
  }

  const passedCount = verdicts.filter((v) => v.passed).length;
  return {
    verdicts,
    passed:   passedCount,
    total:    testcases.length,
    accepted: passedCount === testcases.length,
    totalDurationMs,
    stdout:   null,
    stderr:   null,
    exitCode: null,
  };
}
