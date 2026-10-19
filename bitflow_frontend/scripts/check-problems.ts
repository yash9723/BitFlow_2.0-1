/**
 * scripts/check-problems.ts — verify every problem in the curriculum is sound.
 *
 *   npx tsx scripts/check-problems.ts        (needs iverilog + vvp on PATH)
 *
 * For each Learning Path and Arena problem:
 *   1. starter code compiles with the public testbench and every hidden test
 *      (iverilog -g2012, same as the simulation API);
 *   2. starter code does NOT pass the hidden tests (that would be free XP).
 * And every Sandbox template (lib/templates.ts) compiles, finishes and prints no FAIL.
 * Reference solutions live in the database and are verified against the
 * hidden tests when imported (scripts/import-reference-solutions.ts) or saved
 * from the admin page. Exits 1 if anything fails. Run by the `content` CI job.
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LEARNING_PATH } from "../lib/problems/index";
import { ALL_ARENA_PROBLEMS } from "../lib/arena/index";
import { sentinelPassed, testcasePassed, usesStdoutCompare } from "../lib/grading";
import { TEMPLATES } from "../lib/templates";

interface HiddenTest { name: string; testbench: string; expected: string | null }
interface CheckProblem {
  slug: string; learningLevel: string; expectedOutputMode: string;
  starterCode: string; publicTestbench: string; hidden: HiddenTest[];
  files: Record<string, string>;   // extra input files, e.g. a $readmemh hex file
}
interface RunResult { compiled: boolean; success: boolean; stdout: string; log: string }

function simulate(design: string, testbench: string, files: Record<string, string> = {}): RunResult {
  const dir = mkdtempSync(join(tmpdir(), "bf-check-"));
  try {
    writeFileSync(join(dir, "design.v"), design);
    writeFileSync(join(dir, "tb.v"), testbench);
    for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), content);
    const c = spawnSync("iverilog", ["-g2012", "-o", "a.out", "design.v", "tb.v"],
      { cwd: dir, encoding: "utf8", timeout: 30_000 });
    if (c.error) throw c.error;                       // iverilog missing
    if (c.status !== 0) return { compiled: false, success: false, stdout: "", log: `${c.stdout}${c.stderr}` };
    // stdin from /dev/null like the API sandbox, and SIGKILL on timeout: vvp
    // traps SIGTERM and exits 0, which made a hung design look like a pass.
    const v = spawnSync("vvp", ["a.out"], {
      cwd: dir, encoding: "utf8", timeout: 15_000, killSignal: "SIGKILL",
      maxBuffer: 8 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout = `${v.stdout ?? ""}${v.stderr ?? ""}`;
    return { compiled: true, success: v.status === 0 && !v.error, stdout, log: v.error ? `timed out: ${stdout}` : stdout };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Same accept rule as gradeDesign() in lib/grading.ts. */
function accepted(p: CheckProblem, design: string): { ok: boolean; detail: string } {
  const compare = usesStdoutCompare(p);
  for (const t of p.hidden) {
    const r = simulate(design, t.testbench, p.files);
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
  files: p.dataFiles ?? {},
}));

const errors: string[] = [];
const fail = (slug: string, msg: string) => errors.push(`${slug}: ${msg}`);

for (const p of problems) {
  const pub = simulate(p.starterCode, p.publicTestbench, p.files);
  if (!pub.compiled) fail(p.slug, `starter + public testbench does not compile: ${pub.log.trim().split("\n")[0]}`);

  for (const t of p.hidden) {
    const r = simulate(p.starterCode, t.testbench, p.files);
    if (!r.compiled) fail(p.slug, `starter + ${t.name} does not compile: ${r.log.trim().split("\n")[0]}`);
  }

  if (accepted(p, p.starterCode).ok) fail(p.slug, "starter code already passes the hidden tests");
}

// Sandbox templates: each design + testbench pair must compile, finish and report no failures.
for (const [key, t] of Object.entries(TEMPLATES)) {
  const r = simulate(t.design, t.testbench);
  if (!r.compiled) fail(`template ${key}`, `does not compile: ${r.log.trim().split("\n")[0]}`);
  else if (!r.success || /\bFAIL/.test(r.stdout)) fail(`template ${key}`, r.log.trim().split("\n").slice(-3).join(" | "));
}

console.log(`Checked ${problems.length} problems and ${Object.keys(TEMPLATES).length} Sandbox templates.`);
if (errors.length) {
  console.error(`\n${errors.length} problem(s) found:\n` + errors.map((e) => `  ✗ ${e}`).join("\n"));
  process.exit(1);
}
console.log("All problems OK.");
