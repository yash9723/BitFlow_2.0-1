/**
 * scripts/contest.check.ts — self-check for lib/contests.ts (npx tsx scripts/contest.check.ts).
 */
import assert from "node:assert/strict";
import { contestStatus, parseSlugs, standings, type ContestSubmission } from "../lib/contests";

const start = new Date("2026-10-19T10:00:00Z");
const at = (min: number) => new Date(start.getTime() + min * 60_000);
const sub = (user: string, slug: string, min: number, accepted: boolean): ContestSubmission =>
  ({ userId: user, username: user, slug, accepted, createdAt: at(min) });

const rows = standings([
  // ann: solves a at 10 after 1 wrong (10 + 20), b at 30 → 2 solved, penalty 60
  sub("ann", "a", 5, false), sub("ann", "a", 10, true), sub("ann", "b", 30, true),
  sub("ann", "a", 40, false),                       // after solving: ignored
  // bob: solves a and b with no wrong answers, penalty 25 + 35 = 60: ties with ann
  sub("bob", "b", 35, true), sub("bob", "a", 25, true),   // out of order on purpose
  // cat: one solve, fast → ranks below everyone with two
  sub("cat", "a", 1, true), sub("cat", "b", 2, false), sub("cat", "b", 3, false),
  // dan: only wrong answers
  sub("dan", "a", 1, false),
], start);

assert.deepEqual(rows.map((r) => [r.username, r.solved, r.penalty, r.rank]),
  [["ann", 2, 60, 1], ["bob", 2, 60, 1], ["cat", 1, 1, 3], ["dan", 0, 0, 4]]);
assert.deepEqual(rows[0].problems.a, { solved: true, wrong: 1, minutes: 10 }, "wrong after solving doesn't count");
assert.deepEqual(rows[2].problems.b, { solved: false, wrong: 2, minutes: null });

assert.equal(contestStatus({ startsAt: at(0), endsAt: at(60) }, at(-1)), "upcoming");
assert.equal(contestStatus({ startsAt: at(0), endsAt: at(60) }, at(0)), "running");
assert.equal(contestStatus({ startsAt: at(0), endsAt: at(60) }, at(60)), "ended");
assert.deepEqual(parseSlugs('["a", 3, "b"]'), ["a", "b"]);
assert.deepEqual(parseSlugs("not json"), []);

console.log("contests: all checks passed");
