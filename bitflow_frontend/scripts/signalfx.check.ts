/** scripts/signalfx.check.ts — the signal effects (npx tsx scripts/signalfx.check.ts). */
import assert from "node:assert/strict";
import fs from "node:fs";
import { along, bitSpray, burst, clockSweep, kira, parseXpDetail, pulse, route, sparks, trace, word, wordSize } from "../lib/signalfx/effects";
import { answerFx, failLabel } from "../lib/signalfx";
import { directionFor } from "../lib/pixel/bitzy";

// every effect ends within its life
const a = { x: 10, y: 20 }, b = { x: 200, y: 90 };
let arrived = 0;
for (const [name, fx, life] of [
  ["pulse", pulse(a), 0.45], ["sparks", sparks(a), 0.55], ["burst", burst(a), 0.4], ["kira", kira(a), 0.5],
  ["word", word("PASS", a), 0.8], ["bits", bitSpray(a), 0.7], ["clock", clockSweep({ x: 0, y: 0, w: 80, h: 30 }), 0.7],
  ["trace", trace(a, b, 6, 0.9, () => arrived++), 0.9],
] as const) {
  assert.ok(fx.alive, `${name} starts alive`);
  for (let t = 0; t < life + 0.02; t += 1 / 60) fx.step(1 / 60);
  assert.ok(!fx.alive, `${name} ends within ${life}s`);
}
assert.equal(arrived, 1, "trace calls onArrive exactly once");

// the trace starts at a and ends at b, routed across then down
const path = route(a, b);
assert.deepEqual(along(path, 0), a); assert.deepEqual(along(path, 1), b);
assert.deepEqual(path[1], { x: b.x, y: a.y });

// words stay a readable size
assert.equal(wordSize("OK"), 34); assert.ok(wordSize("FAIL 12/40") >= 14 && wordSize("FAIL 12/40") < 34);

// bitflow:xp detail: old number form and new { total, from }
assert.deepEqual(parseXpDetail(120), { total: 120, from: null });
assert.deepEqual(parseXpDetail({ total: 5, from: { x: 1, y: 2 } }), { total: 5, from: { x: 1, y: 2 } });
assert.deepEqual(parseXpDetail("x"), { total: null, from: null });

// FAIL counts only when real
assert.equal(failLabel(3, 8), "FAIL 3/8"); assert.equal(failLabel(undefined, 8), "FAIL"); assert.equal(failLabel(9, 8), "FAIL");
assert.deepEqual(answerFx(true), { word: "HIGH", glitch: false }); assert.deepEqual(answerFx(false), { word: "LOW", glitch: true });

// a first solve celebrates once: only the hooks call celebrate(), not the pages
for (const f of ["app/problems/[slug]/page.tsx", "components/ArenaSolverClient.tsx"])
  assert.ok(!/celebrate\(/.test(fs.readFileSync(f, "utf8")), `${f} must not celebrate; its hook does`);

// Bitzy looks the right way: 9 directions, straight ahead inside the dead zone
assert.deepEqual(directionFor(5, 5), {});
assert.deepEqual(directionFor(300, 0), { look: 1 });
assert.deepEqual(directionFor(-300, 0), { look: -1 });
assert.deepEqual(directionFor(0, 300), { look: 0, down: true });
assert.deepEqual(directionFor(0, -300), { look: 0, dy: -1 });
assert.deepEqual(directionFor(200, 200), { look: 1, down: true });
assert.deepEqual(directionFor(-200, -200), { look: -1, dy: -1 });

console.log("signalfx: ok");
