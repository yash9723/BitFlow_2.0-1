/**
 * scripts/loadtest.check.ts — the load-test script's own maths and safety rules (npx tsx scripts/loadtest.check.ts).
 * The test itself (scripts/loadtest/loadtest.mjs) is run by hand against a live site; this guards what it reports and when it aborts.
 */
import assert from "node:assert/strict";
import { percentile, summarize, shouldAbort } from "./loadtest/loadtest.mjs";

let n = 0;
const ok = (name: string, fn: () => void) => { fn(); n++; console.log("ok  ", name); };
const s = (status: number, ms = 10) => ({ status, ms, at: Date.now() });

ok("percentile picks from the sorted samples and handles empty input", () => {
  const v = Array.from({ length: 100 }, (_, i) => i + 1);
  assert.equal(percentile(v, 0.5), 51);
  assert.equal(percentile(v, 0.95), 96);
  assert.equal(percentile(v, 0.99), 100);
  assert.equal(percentile([], 0.5), null);
  assert.equal(percentile([7], 0.99), 7);
});

ok("summarize counts codes, ignores network errors in latency, and rates errors correctly", () => {
  const sum = summarize([s(200, 100), s(200, 300), s(429, 20), s(502, 50), s(0, 60000)], 5);
  assert.equal(sum.requests, 5);
  assert.equal(sum.perSecond, 1);
  assert.deepEqual(sum.codes, { 200: 2, 429: 1, 502: 1, net: 1 });
  assert.equal(sum.errorRate, 0.4);          // 502 and the network error; a 429 is the limiter working, not an error
  assert.equal(sum.max, 300);                // the timed-out request's 60 s does not pollute latency
  assert.equal(summarize([], 3).errorRate, 0);
});

ok("auto-abort needs enough samples and more than 5% server errors", () => {
  assert.equal(shouldAbort(Array.from({ length: 10 }, () => s(500))), false, "too few samples to judge");
  const mix = (bad: number, total: number) => [...Array.from({ length: bad }, () => s(503)), ...Array.from({ length: total - bad }, () => s(200))];
  assert.equal(shouldAbort(mix(2, 100)), false);
  assert.equal(shouldAbort(mix(5, 100)), false, "exactly 5% is allowed");
  assert.equal(shouldAbort(mix(6, 100)), true);
  assert.equal(shouldAbort(Array.from({ length: 30 }, () => s(0))), true, "network failures count");
  assert.equal(shouldAbort(Array.from({ length: 50 }, () => s(429))), false, "rate limiting is not a failure");
});

console.log(`\n${n} checks passed`);
