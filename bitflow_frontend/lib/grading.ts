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
import { parseVcd, type ParsedVcd } from "@/lib/vcd-parser";

export interface GradableQuestion {
  learningLevel:      string;
  expectedOutputMode: string;
  publicTestbench:    string;
  hiddenTestbench:    string | null;
  hiddenTestcases:    string; // JSON-stringified Testcase[]
  dataFiles?:         string | null; // JSON {filename: content}
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

async function simulate(design: string, testbench: string, files?: Record<string, string> | null): Promise<SimulateResponse> {
  const { status, data } = await simulateOnBackend({
    design_v:    design,
    testbench_v: testbench,
    timeout:     30,
    ...(files ? { files } : {}),
  });
  if (status !== 200) {
    throw new Error(data?.detail || data?.error || `Simulation backend returned ${status}`);
  }
  return data as SimulateResponse;
}

function parseDataFiles(json: string | null | undefined): Record<string, string> | null {
  try {
    const v = JSON.parse(json || "null");
    return v && typeof v === "object" ? v : null;
  } catch {
    return null;
  }
}

function parseTestcases(json: string): Testcase[] {
  try {
    const v = JSON.parse(json || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/**
 * A reference solution is accepted only under the rules a learner's Submit
 * uses: the design policy, then every hidden test. Throws only on backend failure.
 */
export async function verifyReferenceSolution(
  q: GradableQuestion, code: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const violation = designPolicyViolation(code, gradingTestbenches(q));
  if (violation) return { ok: false, error: violation };
  const grade = await gradeDesign(q, code);
  if (grade.accepted) return { ok: true };
  const failed = grade.verdicts.find((v) => !v.passed);
  const why = failed
    ? `fails hidden test ${failed.testcaseId}${failed.description ? ` (${failed.description})` : ""}`
    : grade.errorMessage || "fails the hidden tests";
  return { ok: false, error: why.slice(0, 500) };
}

/** Grade a design. Throws only on backend/infrastructure failure. */
export async function gradeDesign(q: GradableQuestion, designCode: string): Promise<GradeResult> {
  const testcases = parseTestcases(q.hiddenTestcases);
  const files     = parseDataFiles(q.dataFiles);

  // Single testbench: the hidden one, or the public one if the problem has none.
  if (testcases.length === 0) {
    const r = await simulate(designCode, q.hiddenTestbench || q.publicTestbench, files);
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
      const r = await simulate(designCode, tc.testbench, files);
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

// ─────────────────────────────────────────────────────────────────────────────
// Waveform of the design on the first failing hidden test
//
// The test is re-run with an extra top module that dumps only the DUT
// instance, and the VCD is filtered to that scope here, so testbench
// internals (expected values, checkers) never reach the browser.
// ─────────────────────────────────────────────────────────────────────────────

const MAX_WAVEFORM_CHANGES = 200_000;

/** "<tbModule>.<dutInstance>" for the instance of a design module in the testbench. */
export function dutScope(design: string, testbench: string): string | null {
  const tbModule = testbench.match(/\bmodule\s+([A-Za-z_]\w*)/)?.[1];
  if (!tbModule) return null;
  for (const [, mod] of design.matchAll(/\bmodule\s+([A-Za-z_]\w*)/g)) {
    // <mod> [#(...)] <instance> (
    const inst = testbench.match(new RegExp(`\\b${mod}\\s*(?:#\\s*\\([^;]*?\\)\\s*)?([A-Za-z_]\\w*)\\s*\\(`));
    if (inst) return `${tbModule}.${inst[1]}`;
  }
  return null;
}

export interface FailingWaveform {
  /** Hidden testcase it was captured on (null for single-testbench problems). */
  testcaseId: string | null;
  waveform:   ParsedVcd;
}

/** DUT-only waveform for the first failing test, or null if unavailable. */
export async function failingTestWaveform(
  q: GradableQuestion, designCode: string, grade: GradeResult,
): Promise<FailingWaveform | null> {
  if (grade.accepted) return null;
  const cases  = parseTestcases(q.hiddenTestcases);
  const failed = grade.verdicts.findIndex((v) => !v.passed);
  const testbench = cases.length ? cases[failed]?.testbench : q.hiddenTestbench || q.publicTestbench;
  if (!testbench) return null;

  const scope = dutScope(designCode, testbench);
  if (!scope) return null;

  try {
    const r = await simulate(
      designCode,
      `${testbench}\nmodule __bf_dump;\n  initial begin $dumpfile("wave.vcd"); $dumpvars(0, ${scope}); end\nendmodule\n`,
      parseDataFiles(q.dataFiles),
    );
    const b64 = r.waveform?.vcd_base64;
    if (!b64) return null;
    const waveform = parseVcd(Buffer.from(b64, "base64").toString("utf8"), scope);
    const changes  = waveform.signals.reduce((n, s) => n + s.changes.length, 0);
    if (waveform.signals.length === 0 || changes > MAX_WAVEFORM_CHANGES) return null;
    return { testcaseId: cases.length ? grade.verdicts[failed].testcaseId : null, waveform };
  } catch (err) {
    console.warn("[grading] failing-test waveform unavailable:", err);
    return null;
  }
}
