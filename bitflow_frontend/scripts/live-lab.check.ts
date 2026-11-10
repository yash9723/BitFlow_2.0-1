/** scripts/live-lab.check.ts — lib/live-lab.ts: the run summary a joined student sends, and how the server reads it back. */
import assert from "node:assert/strict";
import { parseRunSummary, runSummary } from "../lib/live-lab";

const at = new Date("2026-11-10T10:00:00Z");
const r = runSummary({ status: "success", stdout: "PASS reset\nPASS count\nFAIL wrap: got 0\nall done", stderr: "" }, at);
assert.deepEqual(r, { status: "success", passed: 2, failed: 1, firstError: null, at: at.toISOString() });
const e = runSummary({ status: "compile_error", stdout: "", stderr: "design.v:3: syntax error\nI give up." }, at);
assert.equal(e.firstError, "design.v:3: syntax error");
assert.equal(runSummary({ status: "success", stdout: "error ".repeat(100) }, at).firstError!.length, 200, "clamped");

assert.deepEqual(parseRunSummary(r), r, "round trip");
assert.equal(parseRunSummary(null), null);
assert.equal(parseRunSummary({ status: "<script>" }), null, "status is a plain word");
const odd = parseRunSummary({ status: "success", passed: -5, failed: 1e9, firstError: "x".repeat(999), at: "not a date" })!;
assert.deepEqual([odd.passed, odd.failed, odd.firstError!.length], [0, 100_000, 200], "numbers bounded, strings clamped");
assert.ok(!Number.isNaN(Date.parse(odd.at)), "a bad date becomes now");

console.log("live-lab: all checks passed");
