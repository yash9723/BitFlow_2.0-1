/** scripts/revamp.check.ts — the designeer-inspired pieces: receipt text, month totals, the problem filter. */
import assert from "node:assert/strict";
import { receiptText } from "../components/SubmissionReceipt";
import { monthTotals } from "../components/ProfileView";

const r = { id: "abc123", problemId: "p", timestamp: Date.UTC(2026, 10, 18, 9, 5), passed: 2, total: 3, accepted: false,
  totalDurationMs: 41.6, submittedCode: "", xpEarned: 0,
  verdicts: [{ testcaseId: "a", description: "reset", passed: true, actualOutput: "", expectedOutput: "", durationMs: 10 },
             { testcaseId: "b", description: "count", passed: true, actualOutput: "", expectedOutput: "", durationMs: 10 },
             { testcaseId: "c", description: "wrap", passed: false, actualOutput: "", expectedOutput: "", durationMs: 10 }] };
const t = receiptText(r, "Counter");
assert.match(t, /VERDICT {3}WRONG ANSWER/); assert.match(t, /TESTS {5}2\/3/); assert.match(t, /TIME {6}42 ms/);
assert.match(t, /FAIL #3 wrap/); assert.ok(!/XP/.test(t), "no XP line without XP");
assert.match(receiptText({ ...r, accepted: true, passed: 3, xpEarned: 20 }, "Counter"), /XP {8}\+20/);

const m = monthTotals({ "2026-11-02": 3, "2026-11-30": 1, "2026-01-15": 2, "2025-11-30": 9 }, new Date(Date.UTC(2026, 10, 18)));
assert.equal(m.length, 12); assert.equal(m[11].key, "2026-11"); assert.equal(m[11].count, 4);
assert.equal(m[0].key, "2025-12"); assert.equal(m.find((x) => x.key === "2026-01")!.count, 2);
assert.equal(m.reduce((s, x) => s + x.count, 0), 6, "older than 12 months is left out");

console.log("revamp: ok");

// starred items: malformed storage counts as empty; topics biggest first
import { parseSaved } from "../lib/saved";
import { topicsByCount } from "../components/ProblemIndex";
assert.deepEqual(parseSaved(null), []); assert.deepEqual(parseSaved("{bad"), []); assert.deepEqual(parseSaved('["a",2,"b"]'), ["a", "b"]);
assert.deepEqual(topicsByCount([{ category: "fsm" }, { category: "alu" }, { category: "fsm" }, { category: "mux" }]), ["fsm", "alu", "mux"]);
console.log("revamp saved/topics: ok");
