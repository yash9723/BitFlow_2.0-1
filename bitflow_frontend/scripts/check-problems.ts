/**
 * scripts/check-problems.ts — verify every problem in the curriculum is sound.
 *
 *   npx tsx scripts/check-problems.ts        (needs iverilog + vvp on PATH)
 *
 * For each Learning Path and Arena problem:
 *   1. starter code compiles with the public testbench and every hidden test
 *      (iverilog -g2012, same as the simulation API);
 *   2. starter code does NOT pass the hidden tests (that would be free XP);
 *   3. if a reference solution exists (lib/problems/reference-solutions.ts),
 *      it passes every hidden test under the grader's own rules (lib/grading.ts).
 * Exits 1 if anything fails. Run by the `content` job in CI.
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LEARNING_PATH } from "../lib/problems/index";
import { ALL_ARENA_PROBLEMS } from "../lib/arena/index";
import { designPolicyViolation, sentinelPassed, testcasePassed, usesStdoutCompare } from "../lib/grading";

// Optional: the reference-solutions file may be kept out of git (it contains
// answers), so load it only if present — the app build must not depend on it.
let REFERENCE_SOLUTIONS: Record<string, string> = {};
try {
  REFERENCE_SOLUTIONS = require("../lib/problems/reference-solutions").REFERENCE_SOLUTIONS;
} catch {
  console.log("(no lib/problems/reference-solutions.ts — skipping reference-solution checks)");
}

interface HiddenTest { name: string; testbench: string; expected: string | null }
interface CheckProblem {
  slug: string; learningLevel: string; expectedOutputMode: string;
  starterCode: string; publicTestbench: string; hidden: HiddenTest[];
}
interface RunResult { compiled: boolean; success: boolean; stdout: string; log: string }

function simulate(design: string, testbench: string): RunResult {
  const dir = mkdtempSync(join(tmpdir(), "bf-check-"));
  try {
    writeFileSync(join(dir, "design.v"), design);
    writeFileSync(join(dir, "tb.v"), testbench);
    const c = spawnSync("iverilog", ["-g2012", "-o", "a.out", "design.v", "tb.v"],
      { cwd: dir, encoding: "utf8", timeout: 30_000 });
    if (c.error) throw c.error;                       // iverilog missing
    if (c.status !== 0) return { compiled: false, success: false, stdout: "", log: `${c.stdout}${c.stderr}` };
    const v = spawnSync("vvp", ["a.out"],
      { cwd: dir, encoding: "utf8", timeout: 15_000, maxBuffer: 8 * 1024 * 1024 });
    const stdout = `${v.stdout ?? ""}${v.stderr ?? ""}`;
    return { compiled: true, success: v.status === 0, stdout, log: stdout };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Same accept rule as gradeDesign() in lib/grading.ts. */
function accepted(p: CheckProblem, design: string): { ok: boolean; detail: string } {
  const compare = usesStdoutCompare(p);
  for (const t of p.hidden) {
    const r = simulate(design, t.testbench);
    const pass = t.expected === null
      ? sentinelPassed(r.success, r.stdout)
      : testcasePassed(r.success, r.stdout, t.expected, compare);
    if (!pass) return { ok: false, detail: `${t.name}: ${r.log.trim().split("\n").slice(-4).join(" | ")}` };
  }
  return { ok: true, detail: "" };
}

function hiddenTests(p: any): HiddenTest[] {
  const cases = p.hiddenTestcases ?? [];
  if (cases.length > 0) {
    return cases.map((tc: any) => ({ name: `testcase ${tc.id}`, testbench: tc.testbench, expected: tc.expected }));
  }
  // Same fallback as the grader: hidden testbench, else the public one.
  return [{ name: "hidden testbench", testbench: p.hiddenTestbench || p.publicTestbench, expected: null }];
}

const problems: CheckProblem[] = [
  ...LEARNING_PATH.levels.flatMap((level) =>
    level.modules.flatMap((m) => m.problems.map((p: any) => ({ ...p, learningLevel: level.title })))),
  ...ALL_ARENA_PROBLEMS.map((p: any) => ({ ...p, learningLevel: "Arena" })),
].map((p: any) => ({
  slug: p.slug,
  learningLevel: p.learningLevel,
  expectedOutputMode: p.expectedOutputMode ?? "stdout_compare",
  starterCode: p.starterCode,
  // Arena problems may only ship a testbench skeleton (users write their own).
  publicTestbench: p.publicTestbench || p.testbenchSkeleton || "",
  hidden: hiddenTests(p),
}));

const errors: string[] = [];
const fail = (slug: string, msg: string) => errors.push(`${slug}: ${msg}`);
const slugs = new Set(problems.map((p) => p.slug));

for (const slug of Object.keys(REFERENCE_SOLUTIONS)) {
  if (!slugs.has(slug)) fail(slug, "reference solution for an unknown problem slug");
}

let checkedRefs = 0;
for (const p of problems) {
  const pub = simulate(p.starterCode, p.publicTestbench);
  if (!pub.compiled) fail(p.slug, `starter + public testbench does not compile: ${pub.log.trim().split("\n")[0]}`);

  for (const t of p.hidden) {
    const r = simulate(p.starterCode, t.testbench);
    if (!r.compiled) fail(p.slug, `starter + ${t.name} does not compile: ${r.log.trim().split("\n")[0]}`);
  }

  if (accepted(p, p.starterCode).ok) fail(p.slug, "starter code already passes the hidden tests");

  const ref = REFERENCE_SOLUTIONS[p.slug];
  if (ref) {
    checkedRefs++;
    const policy = designPolicyViolation(ref, [p.publicTestbench, ...p.hidden.map((t) => t.testbench)]);
    if (policy) fail(p.slug, `reference solution breaks the submit policy: ${policy}`);
    if (!simulate(ref, p.publicTestbench).compiled) fail(p.slug, "reference solution does not compile with the public testbench");
    const res = accepted(p, ref);
    if (!res.ok) fail(p.slug, `reference solution fails hidden tests — ${res.detail}`);
  }
}

console.log(`Checked ${problems.length} problems (${checkedRefs} with reference solutions).`);
if (errors.length) {
  console.error(`\n${errors.length} problem(s) found:\n` + errors.map((e) => `  ✗ ${e}`).join("\n"));
  process.exit(1);
}
console.log("All problems OK.");
