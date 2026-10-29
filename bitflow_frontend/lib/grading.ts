/**
 * lib/grading.ts — Server-side grading of a submitted design.
 *
 * Runs the design against the question's hidden testbench / hidden testcases
 * on the simulation backend and computes the verdict. Hidden tests never
 * leave the server; the client only sees the resulting verdicts.
 */

import type { Testcase, TestcaseVerdict } from "@/lib/problem-types";
import type { SimulateResponse, TestbenchLanguage } from "@/lib/types";
import { equivalenceOnBackend, formalOnBackend, fpgaOnBackend, simulateOnBackend } from "@/lib/backend";
import { parseVcd, type ParsedVcd, type VcdSignal } from "@/lib/vcd-parser";
import { generateMutants, parseMutants, pickMutants, type Mutant } from "@/lib/mutants";
import { getArenaProblemBySlug } from "@/lib/arena";

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
  // One left-to-right pass, so a "//" or "/*" inside a string can't hide the code after it
  // (and a quote inside a comment can't start a string).
  const code = design.replace(/"(?:\\.|[^"\\\n])*"|\/\*[\s\S]*?(?:\*\/|$)|\/\/[^\n]*/g,
    (m) => (m[0] === '"' ? '""' : " "));

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

export async function simulate(
  design: string, testbench: string, files?: Record<string, string> | null, testbenchLanguage: TestbenchLanguage = "verilog",
): Promise<SimulateResponse> {
  const { status, data } = await simulateOnBackend({
    design_v:    design,
    testbench_v: testbench,
    timeout:     30,
    ...(files ? { files } : {}),
    ...(testbenchLanguage !== "verilog" ? { testbench_language: testbenchLanguage } : {}),
  });
  if (status !== 200) {
    const detail = data?.detail || data?.error;
    throw new Error(typeof detail === "string" ? detail
      : `Simulation backend returned ${status}${detail ? `: ${JSON.stringify(detail).slice(0, 300)}` : ""}`);   // e.g. a validation error list
  }
  return data as SimulateResponse;
}

export function parseDataFiles(json: string | null | undefined): Record<string, string> | null {
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
// ── Testbench problems ("find the bugs") ────────────────────────────────────
// The student writes tb.v for a given, correct DUT (Question.starterCode). It must
// pass that DUT and fail ("catch") each stored mutant of it (Question.mutants).

export interface TestbenchQuestion { starterCode: string; mutants?: string | null; dataFiles?: string | null; slug?: string }

/** Max mutants kept per problem: enough variety, bounded grading cost. */
export const MAX_MUTANTS = 8;

/** A testbench must test behaviour: no reading files (e.g. the DUT's source) or running commands. */
export function testbenchPolicyViolation(tb: string): string | null {
  const task = tb.match(/\$(fopen|fread|fgets|fgetc|fscanf|sscanf|readmem[bh]|system)\b/);
  return task ? `Testbenches here can't use $${task[1]}: check the design's outputs instead.` : null;
}

/** Grade a student testbench (Verilog, or a cocotb Python module). Throws only on backend/infrastructure failure. */
export async function gradeTestbench(q: TestbenchQuestion, tb: string, language: TestbenchLanguage = "verilog"): Promise<GradeResult> {
  const mutants = parseMutants(q.mutants);
  const files = parseDataFiles(q.dataFiles);
  if (mutants.length === 0) {
    return { verdicts: [], passed: 0, total: 0, accepted: false, totalDurationMs: 0, stdout: null, stderr: null, exitCode: null,
             errorMessage: "This problem isn't ready yet: its bugs haven't been generated (an admin needs to import the model testbench)." };
  }
  const simulate_ = (design: string) => simulate(design, tb, files, language);
  const base = await simulate_(q.starterCode);
  if (!sentinelPassed(base.success, base.stdout ?? "")) {
    return {
      verdicts: [], passed: 0, total: mutants.length, accepted: false, totalDurationMs: base.duration_ms ?? 0,
      stdout: base.stdout ?? null, stderr: base.stderr ?? null, exitCode: base.exit_code ?? null,
      errorMessage: base.status === "compile_error"
        ? "Your testbench doesn't compile with the design."
        : "Your testbench reports a failure (or doesn't finish) on the correct design. It must pass the given DUT and only flag broken ones.",
    };
  }
  const verdicts: TestcaseVerdict[] = await Promise.all(mutants.map(async (m) => {
    const r = await simulate_(m.code);
    const caught = !sentinelPassed(r.success, r.stdout ?? "");
    return {
      testcaseId: m.id, description: `${caught ? "Caught" : "Missed"}: ${m.description}`, passed: caught,
      actualOutput: "", expectedOutput: "", durationMs: r.duration_ms ?? 0,
    };
  }));
  const passed = verdicts.filter((v) => v.passed).length;
  return {
    verdicts, passed, total: mutants.length, accepted: passed === mutants.length,
    totalDurationMs: (base.duration_ms ?? 0) + verdicts.reduce((s, v) => s + v.durationMs, 0),
    stdout: base.stdout ?? null, stderr: base.stderr ?? null, exitCode: base.exit_code ?? null,
    errorMessage: passed === mutants.length ? undefined : `Your testbench caught ${passed} of ${mutants.length} bugs.`,
  };
}

/** Model testbench of a testbench problem: must pass the DUT; returns the mutants it catches (they're real bugs). */
async function verifyModelTestbench(q: TestbenchQuestion, tb: string): Promise<{ ok: true; mutants: Mutant[] } | { ok: false; error: string }> {
  const violation = testbenchPolicyViolation(tb);
  if (violation) return { ok: false, error: violation };
  const files = parseDataFiles(q.dataFiles);
  const base = await simulate(q.starterCode, tb, files);
  if (!sentinelPassed(base.success, base.stdout ?? "")) {
    return { ok: false, error: `model testbench fails the correct design: ${(base.stdout || base.stderr || "").trim().split("\n").slice(-3).join(" | ")}`.slice(0, 500) };
  }
  const candidates = generateMutants(q.starterCode);
  const killed: Mutant[] = [];
  for (let i = 0; i < candidates.length; i += 4) {          // bounded parallelism
    const batch = candidates.slice(i, i + 4);
    const runs = await Promise.all(batch.map((m) => simulate(m.code, tb, files)));
    // Keep mutants that compile and that the model testbench flags.
    // Caught by a finished run (FAIL printed or a crash). Not timeouts: grading would wait them out on every submit.
    batch.forEach((m, j) => {
      if ((runs[j].status === "success" || runs[j].status === "runtime_error") && !sentinelPassed(runs[j].success, runs[j].stdout ?? "")) killed.push(m);
    });
  }
  const mutants = pickMutants(killed, MAX_MUTANTS);
  if (mutants.length < 3) return { ok: false, error: `only ${killed.length} of ${candidates.length} mutants are caught by the model testbench; need at least 3` };
  return { ok: true, mutants };
}

// ── Formal problems ("prove it") ────────────────────────────────────────────
// Same shape as testbench problems, but the student writes a property harness: a
// top module that instantiates the given DUT and states assert/assume/cover. It
// must pass a bounded check on the correct DUT and fail it on each stored mutant.

/** Steps the solver searches when grading, unless the problem sets formalDepth (lib/arena/formal.ts). */
export const FORMAL_DEPTH = 20;

export function formalDepth(slug?: string): number {
  return (slug && getArenaProblemBySlug(slug)?.formalDepth) || FORMAL_DEPTH;
}

// ─────────────────────────────────────────────────────────────────────────────
// Timing problems (lib/arena/timing.ts): an accepted design must also reach a
// clock frequency after place and route on an iCE40-HX8K.
// ─────────────────────────────────────────────────────────────────────────────

export function timingTarget(slug?: string) {
  return (slug && getArenaProblemBySlug(slug)?.timing) || null;
}

/** Fmax (MHz, slowest clock) of the design inside the problem's register wrapper, or why it couldn't be measured. */
export async function measureFmax(design: string, wrapper: string): Promise<{ mhz: number } | { error: string }> {
  const { status, data } = await fpgaOnBackend(`${design}\n\n${wrapper}`, "ice40");
  if (status !== 200 || !data?.ok) return { error: data?.error || data?.detail || `FPGA backend returned ${status}` };
  if (!data.pnr?.ok) return { error: data.pnr?.error || "Place and route failed." };
  const fmax: { mhz: number }[] = data.pnr.fmax ?? [];
  return fmax.length ? { mhz: Math.min(...fmax.map((f) => f.mhz)) } : { error: "No clocked path found: is clk connected?" };
}

/** A harness only states properties: no file access or includes (Yosys would read those files). */
export function formalPolicyViolation(harness: string): string | null {
  if (/`\s*include\b/.test(harness)) return "`include isn't allowed in a property harness.";
  return testbenchPolicyViolation(harness);
}

async function formal(design: string, harness: string, depth: number) {
  const { status, data } = await formalOnBackend(design, harness, "bmc", depth);
  if (status !== 200) throw new Error(data?.detail || data?.error || `Formal backend returned ${status}`);
  return data as { status: "passed" | "failed" | "error"; error?: string; failed?: { line: number } | null; log?: string };
}

/** Grade a student property harness. Throws only on backend/infrastructure failure. */
export async function gradeFormal(q: TestbenchQuestion, harness: string): Promise<GradeResult> {
  const mutants = parseMutants(q.mutants);
  if (mutants.length === 0) {
    return { verdicts: [], passed: 0, total: 0, accepted: false, totalDurationMs: 0, stdout: null, stderr: null, exitCode: null,
             errorMessage: "This problem isn't ready yet: its bugs haven't been generated (an admin needs to import the model harness)." };
  }
  const t0 = Date.now();
  const depth = formalDepth(q.slug);
  const base = await formal(q.starterCode, harness, depth);
  if (base.status !== "passed") {
    return {
      verdicts: [], passed: 0, total: mutants.length, accepted: false, totalDurationMs: Date.now() - t0,
      stdout: base.log ?? null, stderr: base.error ?? null, exitCode: null,
      errorMessage: base.status === "error"
        ? `Your harness doesn't compile with the design:\n${base.error ?? ""}`.trim()
        : `An assertion fails on the correct design (line ${base.failed?.line ?? "?"}). A property must hold for the given DUT and only fail on broken ones.`,
    };
  }
  const verdicts: TestcaseVerdict[] = await Promise.all(mutants.map(async (m) => {
    const t = Date.now();
    const caught = (await formal(m.code, harness, depth)).status === "failed";
    return { testcaseId: m.id, description: `${caught ? "Caught" : "Missed"}: ${m.description}`, passed: caught,
             actualOutput: "", expectedOutput: "", durationMs: Date.now() - t };
  }));
  const passed = verdicts.filter((v) => v.passed).length;
  return {
    verdicts, passed, total: mutants.length, accepted: passed === mutants.length, totalDurationMs: Date.now() - t0,
    stdout: base.log ?? null, stderr: null, exitCode: 0,
    errorMessage: passed === mutants.length ? undefined : `Your properties caught ${passed} of ${mutants.length} bugs.`,
  };
}

/** Model harness of a formal problem: must pass the DUT; returns the mutants it catches. */
async function verifyModelHarness(q: TestbenchQuestion, harness: string): Promise<{ ok: true; mutants: Mutant[] } | { ok: false; error: string }> {
  const violation = formalPolicyViolation(harness);
  if (violation) return { ok: false, error: violation };
  const depth = formalDepth(q.slug);
  const base = await formal(q.starterCode, harness, depth);
  if (base.status !== "passed") return { ok: false, error: `model harness ${base.status} on the correct design: ${base.error ?? `line ${base.failed?.line}`}`.slice(0, 500) };
  const candidates = generateMutants(q.starterCode);
  const killed: Mutant[] = [];
  for (let i = 0; i < candidates.length; i += 4) {
    const batch = candidates.slice(i, i + 4);
    const runs = await Promise.all(batch.map((m) => formal(m.code, harness, depth)));
    batch.forEach((m, j) => { if (runs[j].status === "failed") killed.push(m); });
  }
  const mutants = pickMutants(killed, MAX_MUTANTS);
  if (mutants.length < 3) return { ok: false, error: `only ${killed.length} of ${candidates.length} mutants are caught by the model harness; need at least 3` };
  return { ok: true, mutants };
}

export async function verifyReferenceSolution(
  q: GradableQuestion & { problemType?: string; starterCode?: string; mutants?: string | null; slug?: string }, code: string,
): Promise<{ ok: true; mutants?: Mutant[] } | { ok: false; error: string }> {
  if (q.problemType === "testbench") return verifyModelTestbench({ starterCode: q.starterCode ?? "", dataFiles: q.dataFiles }, code);
  if (q.problemType === "formal") return verifyModelHarness({ starterCode: q.starterCode ?? "", slug: q.slug }, code);
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

/**
 * Verdicts as sent to the browser: hidden tests' outputs stay on the server, except the first
 * failing case's (truncated), which the learner needs to debug. Without this, a stdout-compare
 * problem's whole expected output could be read off one submit and hard-coded.
 */
export function publicVerdicts(verdicts: TestcaseVerdict[], max = 2000): TestcaseVerdict[] {
  const firstFail = verdicts.findIndex((v) => !v.passed);
  return verdicts.map((v, i) => i === firstFail
    ? { ...v, actualOutput: v.actualOutput.slice(0, max), expectedOutput: v.expectedOutput.slice(0, max), error: v.error?.slice(0, max) }
    : { ...v, actualOutput: "", expectedOutput: "", error: v.error?.slice(0, 300) });
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
  /**
   * When a reference solution is stored: each output appears as "<out> (yours)"
   * and "<out> (expected)", and these are the time ranges where they differ.
   */
  mismatches?: { from: number; to: number }[];
}

/** Waveform of `design`'s DUT instance on `testbench`, or null. */
async function dutWaveform(design: string, testbench: string, files: Record<string, string> | null): Promise<ParsedVcd | null> {
  const scope = dutScope(design, testbench);
  if (!scope) return null;
  const r = await simulate(
    design,
    `${testbench}\nmodule __bf_dump;\n  initial begin $dumpfile("wave.vcd"); $dumpvars(0, ${scope}); end\nendmodule\n`,
    files,
  );
  const b64 = r.waveform?.vcd_base64;
  return b64 ? parseVcd(Buffer.from(b64, "base64").toString("utf8"), scope) : null;
}

/** Output port names of the module the testbench instantiates (ANSI and non-ANSI headers). */
export function outputPorts(design: string, testbench: string): string[] {
  for (const [, mod, body] of design.matchAll(/\bmodule\s+([A-Za-z_]\w*)([\s\S]*?)\bendmodule\b/g)) {
    if (!new RegExp(`\\b${mod}\\b`).test(testbench)) continue;
    const names = new Set<string>();
    for (const [, list] of body.matchAll(/\boutput\b\s*(?:reg|wire|logic)?\s*(?:signed\s*)?(?:\[[^\]]*\]\s*)?([A-Za-z_]\w*(?:\s*,\s*(?!input\b|output\b|inout\b)[A-Za-z_]\w*)*)/g)) {
      list.split(",").forEach((n) => names.add(n.trim()));
    }
    return [...names];
  }
  return [];
}

/** Time ranges where `got` differs from `want` (an x in `want` is a don't-care), merged. */
export function mismatchRanges(
  pairs: { got: VcdSignal; want: VcdSignal }[], maxTime: number,
): { from: number; to: number }[] {
  const times = [...new Set(pairs.flatMap(({ got, want }) => [...got.changes, ...want.changes].map((c) => c.time)))].sort((a, b) => a - b);
  const ranges: { from: number; to: number }[] = [];
  times.forEach((t, i) => {
    const bad = pairs.some(({ got, want }) => {
      const w = valueAt(want.changes, t), g = valueAt(got.changes, t);
      if (w === undefined) return false;
      if (g === undefined || w.length !== g.length) return true;
      return [...w].some((bit, k) => bit !== "x" && bit !== g[k]);
    });
    if (!bad) return;
    const to = times[i + 1] ?? maxTime;
    const last = ranges[ranges.length - 1];
    if (last && last.to === t) last.to = to;
    else ranges.push({ from: t, to });
  });
  return ranges;
}

/**
 * DUT-only waveform for the first failing test, or null if unavailable. With a
 * stored reference solution, the expected outputs are run on the same test and
 * shown next to the learner's (outputs only — the reference's internals and
 * source never leave the server).
 */
export async function failingTestWaveform(
  q: GradableQuestion & { referenceSolution?: string | null }, designCode: string, grade: GradeResult,
): Promise<FailingWaveform | null> {
  if (grade.accepted) return null;
  const cases  = parseTestcases(q.hiddenTestcases);
  const failed = grade.verdicts.findIndex((v) => !v.passed);
  const testbench = cases.length ? cases[failed]?.testbench : q.hiddenTestbench || q.publicTestbench;
  if (!testbench) return null;
  const files = parseDataFiles(q.dataFiles);
  const testcaseId = cases.length ? grade.verdicts[failed].testcaseId : null;

  try {
    const [waveform, reference] = await Promise.all([
      dutWaveform(designCode, testbench, files),
      q.referenceSolution ? dutWaveform(q.referenceSolution, testbench, files).catch(() => null) : null,
    ]);
    if (!waveform) return null;
    const changes = waveform.signals.reduce((n, s) => n + s.changes.length, 0);
    if (waveform.signals.length === 0 || changes > MAX_WAVEFORM_CHANGES) return null;
    if (!reference) return { testcaseId, waveform };

    // Pair each output port: "<out> (yours)" then "<out> (expected)".
    const outs = new Set(outputPorts(q.referenceSolution!, testbench));
    const pairs: { got: VcdSignal; want: VcdSignal }[] = [];
    const signals: VcdSignal[] = [];
    for (const s of waveform.signals) {
      const want = outs.has(s.name) ? reference.signals.find((r) => r.name === s.name && r.width === s.width) : undefined;
      if (!want) { signals.push(s); continue; }
      const got = { ...s, name: `${s.name} (yours)` };
      const exp = { ...want, id: `expected:${want.id}`, name: `${s.name} (expected)` };
      signals.push(got, exp);
      pairs.push({ got, want: exp });
    }
    if (!pairs.length) return { testcaseId, waveform };
    const maxTime = Math.max(waveform.maxTime, reference.maxTime);
    return { testcaseId, waveform: { ...waveform, signals, maxTime }, mismatches: mismatchRanges(pairs, maxTime) };
  } catch (err) {
    console.warn("[grading] failing-test waveform unavailable:", err);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Counterexample: shortest input sequence where the design and the reference
// solution disagree (formal check on the backend). The reference source never
// leaves the server; only its outputs on this one short sequence are shown.
// ─────────────────────────────────────────────────────────────────────────────

export interface Counterexample {
  /** Steps from reset (the reset step included) to the first difference. */
  cycles:   number;
  waveform: ParsedVcd;
}

const CLOCK_NAME = /^(clk|clock|.*_clk)$/i;
const RESET_NAME = /^(rst|reset|rst_n|reset_n|rstn|resetn|areset|arst|arst_n|aresetn|clr|clear)$/i;

/** Value of a signal at time t (last change at or before t). */
function valueAt(changes: { time: number; value: string }[], t: number): string | undefined {
  let v: string | undefined;
  for (const c of changes) {
    if (c.time > t) break;
    v = c.value;
  }
  return v;
}

/** Miter VCD (in_*, gold_*, gate_*) -> inputs + "out (yours)" / "out (expected)", cut at the first difference. */
export function counterexampleWaveform(raw: ParsedVcd): ParsedVcd {
  const plain = (n: string) => n.replace(/^\\/, "");
  const inputs = raw.signals
    .filter((s) => plain(s.name).startsWith("in_") && !CLOCK_NAME.test(plain(s.name).slice(3)))
    .sort((a, b) => Number(RESET_NAME.test(plain(b.name).slice(3))) - Number(RESET_NAME.test(plain(a.name).slice(3))));   // reset first
  const outs = raw.signals
    .filter((s) => plain(s.name).startsWith("gate_"))
    .map((gate) => ({ name: plain(gate.name).slice(5), gate, gold: raw.signals.find((s) => plain(s.name) === `gold_${plain(gate.name).slice(5)}`) }))
    .filter((o) => o.gold);

  // First time any output differs (an x in the expected value is a don't-care)
  const times = [...new Set(raw.signals.flatMap((s) => s.changes.map((c) => c.time)))].sort((a, b) => a - b);
  const differs = (t: number) => outs.some(({ gate, gold }) => {
    const want = valueAt(gold!.changes, t), got = valueAt(gate.changes, t);
    if (want === undefined || got === undefined || want.length !== got.length) return want !== got;
    return [...want].some((w, i) => w !== "x" && w !== got[i]);
  });
  const cut = times.find(differs) ?? raw.maxTime;

  const trim = <T extends { changes: { time: number }[] }>(s: T, name: string) =>
    ({ ...s, name, changes: s.changes.filter((c) => c.time <= cut) });
  return {
    timescale: "1 step",
    maxTime:   cut + 1,
    signals: [
      ...inputs.map((s) => trim(s, plain(s.name).slice(3))),
      ...outs.flatMap(({ name, gate, gold }) => [trim(gate, `${name} (yours)`), trim(gold!, `${name} (expected)`)]),
    ],
  };
}

/** Counterexample against q.referenceSolution, or null (none stored, no difference found, or unsupported). */
/**
 * The counterexample as a small text table, one row per step from reset:
 * "step | rst | count (yours) | count (expected)". Multi-bit values in decimal
 * (x/z kept as-is). Stored with the submission for the AI tutor.
 */
export function counterexampleTable(cx: Counterexample, maxRows = 24): string {
  const sigs = cx.waveform.signals;
  const times = [...new Set(sigs.flatMap((s) => s.changes.map((c) => c.time)))].sort((a, b) => a - b).slice(0, maxRows);
  const show = (v: string | undefined) =>
    v === undefined ? "?" : /^[01]+$/.test(v) && v.length > 1 ? String(parseInt(v, 2)) : v;
  const rows = times.map((t, i) => [String(i + 1), ...sigs.map((s) => show(valueAt(s.changes, t)))]);
  const header = ["step", ...sigs.map((s) => s.name)];
  return [header, ...rows].map((r) => r.join(" | ")).join("\n");
}

export async function findCounterexample(
  q: GradableQuestion & { referenceSolution?: string | null }, designCode: string,
): Promise<Counterexample | null> {
  if (!q.referenceSolution) return null;
  try {
    const { status, data } = await equivalenceOnBackend(q.referenceSolution, designCode);
    if (status !== 200 || data?.status !== "differs" || !data.vcd_base64) return null;
    const raw = parseVcd(Buffer.from(data.vcd_base64, "base64").toString("utf8"));
    return { cycles: data.cycles, waveform: counterexampleWaveform(raw) };
  } catch (err) {
    console.warn("[grading] counterexample unavailable:", err);
    return null;
  }
}
