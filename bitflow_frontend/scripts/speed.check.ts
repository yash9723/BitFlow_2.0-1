/** npx tsx scripts/speed.check.ts — lib/speed.ts: the fastest-after-layout ladder. */
import assert from "node:assert/strict";
import { LADDER, MAX_RUNS, nextPeriod, speedScore, startRung, type Run } from "../lib/speed";

const run = (periodNs: number, pass: boolean | null, slackNs: number | null = pass ? 0.1 : -0.5): Run => ({ periodNs, jobId: "j", pass, slackNs });

// gcd, from the server (10 ns slack 6.1, so the path is 3.9 ns): starts at 3.5, passes 2.5, misses 1.8 -> 2.5 wins
const gcd = { periodNs: 10, slackNs: 6.1 };
assert.equal(startRung(gcd), 3.5);
assert.equal(nextPeriod(gcd, []), 3.5);
assert.equal(nextPeriod(gcd, [run(3.5, true)]), 2.5);
assert.equal(nextPeriod(gcd, [run(3.5, true), run(2.5, true, 0.04)]), 1.8);
assert.equal(nextPeriod(gcd, [run(3.5, true), run(2.5, true, 0.04), run(1.8, false)]), null, "went down to a miss: done");
assert.deepEqual(speedScore(gcd, [run(3.5, true), run(2.5, true, 0.04), run(1.8, false)]), { mhz: 406.5, periodNs: 2.5, slackNs: 0.04 });
// one still running: wait
assert.equal(nextPeriod(gcd, [run(3.5, null)]), null);
// the counter is faster than the floor: stops at 1 ns
const ctr = { periodNs: 10, slackNs: 9.2 };
assert.equal(startRung(ctr), 1.0);
assert.equal(nextPeriod(ctr, [run(1.0, true, 0.05)]), null);
assert.equal(speedScore(ctr, [run(1.0, true, 0.05)]).mhz, 1052.63);
// the first rung misses: go up until one passes, then stop
assert.equal(nextPeriod(gcd, [run(3.5, false)]), 5);
assert.equal(nextPeriod(gcd, [run(3.5, false), run(5, true)]), null);
assert.equal(speedScore(gcd, [run(3.5, false), run(5, true, 1)]).periodNs, 5);
// nothing passes: the base layout's own speed, and never above the base period
assert.equal(nextPeriod(gcd, [run(3.5, false), run(5, false), run(8, false)]), null);
assert.deepEqual(speedScore(gcd, [run(3.5, false), run(5, false), run(8, false)]), { mhz: 256.41, periodNs: 10, slackNs: 6.1 });
// capped: never more than MAX_RUNS layouts, even while still passing
const many = LADDER.slice(0, MAX_RUNS).map((p) => run(p, true));
assert.equal(nextPeriod({ periodNs: 10, slackNs: 1 }, many), null);
// a failed job (pass false, no slack) is a miss, never a score
assert.equal(speedScore(gcd, [run(3.5, true, 0.2), run(2.5, false, null)]).periodNs, 3.5);
console.log("speed: all checks passed");
