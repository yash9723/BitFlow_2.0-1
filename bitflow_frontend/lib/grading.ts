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

// ─────────────────────────────────────────────────────────────────────────────
// Design policy for graded submissions
//
// The design is simulated together with the testbench, so without limits a
// wrong design could print "ALL TESTS PASSED" itself, end the simulation with
// $finish before any check runs, or poke the testbench's variables. Graded
// designs may therefore only use synthesizable-style constructs. (Run is not
// affected — debug prints are fine there.)
// ─────────────────────────────────────────────────────────────────────────────

const ALLOWED_SYSTEM_FUNCTIONS = new Set([
  "$clog2", "$signed", "$unsigned", "$bits", "$size", "$high", "$low", "$left", "$right",
  "$countones", "$onehot", "$onehot0", "$isunknown", "$readmemh", "$readmemb",
  "$time", "$realtime", "$stime", "$rtoi", "$itor", "$realtobits", "$bitstoreal",
  "$random", "$urandom", "$urandom_range",
]);
const ALLOWED_DIRECTIVES = new Set(["timescale", "default_nettype"]);

/** Why a design may not be graded, or null if it is acceptable. */
export function designPolicyViolation(design: string, testbenches: string[]): string | null {
  const code = design
    .replace(/\/\*[\s\S]*?\*\//g, " ")        // block comments
    .replace(/\/\/.*$/gm, " ")                  // line comments
    .replace(/"(?:\.|[^"\\n])*"/g, '""');     // string literals

  for (const [task] of code.matchAll(/\$[A-Za-z_][\w$]*/g)) {
    if (!ALLOWED_SYSTEM_FUNCTIONS.has(task)) {
      return `${task} isn't allowed in a submitted design. Simulation-only statements ` +
        `($display, $finish, file I/O, …) are fine with Run but not in graded designs — remove them and submit again.`;
    }
  }
  for (const [, directive] of code.matchAll(/`([A-Za-z_]\w*)/g)) {
    if (!ALLOWED_DIRECTIVES.has(directive)) {
      return `Compiler directive \`${directive} isn't allowed in a submitted design.`;
    }
  }
  const kw = code.match(/\b(force|release|deassign)\b/);
  if (kw) return `'${kw[1]}' isn't allowed in a submitted design.`;

  const tbModules = new Set(
    testbenches.flatMap((tb) => [...tb.matchAll(/\bmodule\s+([A-Za-z_]\w*)/g)].map((m) => m[1])),
  );
  for (const name of tbModules) {
    if (new RegExp(`\\b${name}\\b`).test(code)) {
      return `A submitted design can't refer to the testbench ('${name}').`;
    }
  }
  return null;
}

/** All testbench sources a question is graded with (for designPolicyViolation). */
export function gradingTestbenches(q: GradableQuestion): string[] {
  const cases = parseTestcases(q.hiddenTestcases);
  return [q.publicTestbench, q.hiddenTestbench ?? "", ...cases.map((c) => c.testbench)].filter(Boolean);
}

/** Single-testbench verdict: "ALL TESTS PASSED" or no FAIL lines. */
export function sentinelPassed(success: boolean, stdout: string): boolean {
  return (
    success &&
    (stdout.includes("ALL TESTS PASSED") ||
      (!stdout.includes("FAIL") && !stdout.includes("TESTS FAILED")))
  );
}

/** Whether hidden testcases are judged by comparing stdout with `expected`. */
export function usesStdoutCompare(q: { learningLevel: string; expectedOutputMode: string }): boolean {
  return (
    q.learningLevel === "Arena" ||
    q.expectedOutputMode === "stdout_compare" ||
    q.expectedOutputMode === "signal_compare"
  );
}

/** Verdict for one hidden testcase run. */
export function testcasePassed(success: boolean, stdout: string, expected: string, compare: boolean): boolean {
  if (!success) return false;
  return compare
    ? compareStdout(stdout, expected)
    : !stdout.includes("FAIL") && !stdout.includes("TESTS FAILED");
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
    const ok = sentinelPassed(r.success, r.stdout ?? "");
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

  const compare = usesStdoutCompare(q);

  // Testcases are independent, so run them concurrently (verdict order is kept).
  // The API's MAX_CONCURRENT_SIMULATIONS semaphore bounds the actual load.
  const verdicts: TestcaseVerdict[] = await Promise.all(
    testcases.map(async (tc) => {
      const r = await simulate(designCode, tc.testbench);
      const stdout = r.stdout ?? "";
      return {
        testcaseId:     tc.id,
        description:    tc.description,
        passed:         testcasePassed(r.success, stdout, tc.expected, compare),
        actualOutput:   stdout,
        expectedOutput: tc.expected,
        durationMs:     r.duration_ms ?? 0,
        ...(r.success ? {} : { error: r.stderr || `Exit status: ${r.status}` }),
      };
    })
  );
  const totalDurationMs = verdicts.reduce((sum, v) => sum + v.durationMs, 0);

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
