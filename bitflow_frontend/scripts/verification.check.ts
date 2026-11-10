/**
 * scripts/verification.check.ts — self-check for coverage-graded testbench problems
 * (lib/grading.ts coverageShortfall / runFlagged, lib/arena/verification-sv.ts).
 */
import assert from "node:assert/strict";
import { coverageShortfall, runFlagged } from "../lib/grading";
// Parked (not in the Arena registry) while problems are revised; still checked for correctness.
import { SV_VERIFICATION_PROBLEMS } from "../lib/arena/verification-sv";

const pct = (line: number | null, branch: number | null, toggle: number | null = null) =>
  ({ line: { percent: line }, branch: { percent: branch }, toggle: { percent: toggle } });

assert.equal(coverageShortfall(pct(50, 50), undefined), null, "no bar, no check");
assert.equal(coverageShortfall(pct(100, 100), { line: 100, branch: 100 }), null);
assert.equal(coverageShortfall(pct(92, 80), { line: 90 }), null, "only the listed types count");
assert.match(coverageShortfall(pct(60, 100), { line: 90, branch: 100 })!, /^Coverage too low: line 60% \(need 90%\)\. /);
assert.match(coverageShortfall(pct(60, 50), { line: 90, branch: 80 })!, /line 60%.*branch 50%/);
assert.equal(coverageShortfall(pct(100, 100, null), { toggle: 100 }), null, "an unmeasured type is not a shortfall");
assert.match(coverageShortfall(undefined, { line: 90 })!, /No coverage/);

const ok = { success: true, stdout: "ALL TESTS PASSED", assertions: [] };
assert.equal(runFlagged(ok), false);
assert.equal(runFlagged({ ...ok, stdout: "FAIL y=3\nALL TESTS PASSED" }), true, "FAIL wins over the sentinel");
assert.equal(runFlagged({ ...ok, success: false }), true, "didn't finish");
assert.equal(runFlagged({ ...ok, assertions: [{ time: 5 }] as never }), true, "a fired assertion flags the design");

for (const p of SV_VERIFICATION_PROBLEMS) {
  assert.equal(p.problemType, "testbench", p.slug);
  assert.equal(p.verification?.simulator, "verilator", p.slug);
  assert.ok(p.verification?.minCoverage, `${p.slug} has a coverage bar`);
  const dut = /^\s*module\s+(\w+)/m.exec(p.starterCode)?.[1];
  assert.ok(dut && p.testbenchSkeleton.split("\n").some((l) => l.trim().startsWith(dut + " ") && / dut \(/.test(l)),`${p.slug} skeleton instantiates ${dut} as dut`);
  assert.ok(!/##\d/.test(p.testbenchSkeleton), `${p.slug}: Verilator 5.032 rejects ## in cover/assert sequences`);
}
assert.equal(new Set(SV_VERIFICATION_PROBLEMS.map((p) => p.slug)).size, SV_VERIFICATION_PROBLEMS.length, "slugs unique");

console.log(`verification: all checks passed (${SV_VERIFICATION_PROBLEMS.length} problems)`);
