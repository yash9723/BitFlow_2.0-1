/** scripts/swarm.check.ts — self-check for lib/swarm (npx tsx scripts/swarm.check.ts). */
import assert from "node:assert/strict";
import { LATCH_RING, SIGNALS, type Target, buildTimeline, orderTargets, routeWire, sample } from "../lib/swarm/plan";
import { partialPath, pathLength, pointAt } from "../lib/swarm/motion";

// a landing page above the fold at 1280×800: nav, badge, heading, paragraph, buttons, stats, chip, card row
const targets: Target[] = [
  { id: "chip", kind: "place", x: 820, y: 120, w: 400, h: 560 },
  { id: "nav", kind: "place", x: 0, y: 0, w: 1280, h: 64 },
  { id: "badge", kind: "place", x: 40, y: 130, w: 210, h: 30 },
  { id: "h1", kind: "type", x: 40, y: 185, w: 330, h: 110 },
  { id: "lede", kind: "type", x: 40, y: 320, w: 440, h: 70 },
  { id: "cta", kind: "place", x: 40, y: 420, w: 360, h: 48 },
  { id: "stats", kind: "place", x: 40, y: 510, w: 440, h: 70 },
];
const tl = buildTimeline(targets, 1280, 800);

// ordering: top-down, and rows left to right
assert.deepEqual(orderTargets(targets).map((t) => t.id), ["nav", "badge", "chip", "h1", "lede", "cta", "stats"]);

// every target built exactly once
assert.equal(tl.jobs.length, targets.length);
assert.deepEqual(new Set(tl.jobs.map((j) => j.target.id)), new Set(targets.map((t) => t.id)));

// the whole swarm turns up, the shell prompt leads, and with more cursors than blocks every block still has its own cursor
assert.equal(tl.cursors.length, SIGNALS.length);
assert.equal(new Set(SIGNALS).size, SIGNALS.length, "labels are unique");
assert.equal(tl.jobs[0].cursor, 0);
assert.equal(tl.cursors[0].label, "root@bitflow:~#");
assert.equal(SIGNALS.length, 10);
assert.ok(SIGNALS.every((s) => !/[<>&"]/.test(s)), "labels are plain text");
assert.equal(new Set(tl.jobs.map((j) => j.cursor)).size, tl.jobs.length);
// cursors without a block don't just sit there: they wander while the page is built
const idle = tl.cursors.filter((_, c) => !tl.jobs.some((j) => j.cursor === c));
assert.ok(idle.length > 0);
for (const c of idle) {
  const hops = c.segments.filter((s) => s.t1 <= tl.builtAt && (s.path[0].x !== s.path[1].x || s.path[0].y !== s.path[1].y));
  assert.ok(hops.length >= 3, `${c.label} wanders`);
}

// only the first block has no wire; each wire is traced before its block is built
assert.equal(tl.jobs[0].wire, null);
for (const j of tl.jobs.slice(1)) {
  assert.ok(j.wire && j.wire.length >= 2, `${j.target.id} has a wire`);
  const w = j.wire!;
  for (let i = 1; i < w.length; i++) assert.ok(w[i].x === w[i - 1].x || w[i].y === w[i - 1].y, "wires are axis-aligned");
  const end = w[w.length - 1];
  assert.equal(end.x, j.target.x, "the wire ends at the block's start point");
  assert.ok(j.buildStart >= j.wireStart && j.buildEnd > j.buildStart && j.done >= j.buildEnd);
}

// a cursor never does two things at once
for (const c of tl.cursors) {
  for (let i = 1; i < c.segments.length; i++) assert.ok(c.segments[i].t0 >= c.segments[i - 1].t1 - 1e-6, `${c.label} segments overlap`);
}

// short enough to sit through
assert.ok(tl.end < 5500, `intro ends in ${Math.round(tl.end)}ms`);
assert.ok(tl.latchAt > tl.builtAt && tl.end > tl.latchAt);

// sampling: nothing visible at 0, everything visible and done at the end
const f0 = sample(tl, 0);
assert.ok(f0.targets.every((t) => t.reveal === 0 && t.box === null));
assert.equal(f0.done, false);
const fEnd = sample(tl, tl.end);
assert.ok(fEnd.targets.every((t) => t.reveal === 1));
assert.ok(fEnd.done && fEnd.latch === 1);
for (const c of fEnd.cursors) assert.ok(Math.hypot(c.x - tl.latchPoint.x, c.y - tl.latchPoint.y) <= LATCH_RING + 1, "cursors converge");

// mid-drag: a dashed box growing from the block's corner; mid-type: a caret inside the line
const place = tl.jobs.find((j) => j.target.id === "cta")!;
const mid = sample(tl, (place.buildStart + place.buildEnd) / 2).targets.find((t) => t.id === "cta")!;
assert.ok(mid.box && mid.box.w > 0 && mid.box.w < place.target.w && mid.reveal === 0);
const typed = tl.jobs.find((j) => j.target.id === "lede")!;
const midT = sample(tl, (typed.buildStart + typed.buildEnd) / 2).targets.find((t) => t.id === "lede")!;
assert.ok(midT.caret !== null && midT.caret > typed.target.x && midT.caret < typed.target.x + typed.target.w);
assert.ok(midT.reveal > 0 && midT.reveal < 1);

// routing and polyline helpers
assert.deepEqual(routeWire({ x: 0, y: 0 }, { x: 10, y: 0 }), [{ x: 0, y: 0 }, { x: 10, y: 0 }]);
assert.deepEqual(routeWire({ x: 0, y: 0 }, { x: 10, y: 20 }), [{ x: 0, y: 0 }, { x: 0, y: 10 }, { x: 10, y: 10 }, { x: 10, y: 20 }]);
assert.deepEqual(routeWire({ x: 0, y: 20 }, { x: 10, y: 0 }), [{ x: 0, y: 20 }, { x: 5, y: 20 }, { x: 5, y: 0 }, { x: 10, y: 0 }]);
const L = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }];
assert.equal(pathLength(L), 20);
assert.deepEqual(pointAt(L, 0.75), { x: 10, y: 5 });
assert.deepEqual(partialPath(L, 0.25), [{ x: 0, y: 0 }, { x: 5, y: 0 }]);

// a single block and an empty page don't break anything
assert.equal(buildTimeline([targets[1]], 400, 800, 4).cursors.length, 4);
assert.equal(buildTimeline(targets, 400, 800, 3).jobs.length, targets.length, "fewer cursors than blocks still builds everything");
const empty = buildTimeline([], 400, 800);
assert.ok(sample(empty, empty.end).done);

console.log("swarm: all checks passed");
