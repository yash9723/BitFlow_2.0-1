/** scripts/swarm.check.ts — self-check for lib/swarm (npx tsx scripts/swarm.check.ts). */
import assert from "node:assert/strict";
import { LATCH_RING, SIGNALS, type Target, buildTimeline, dissolveOrder, hashSeed, orderTargets, routeWire, sample } from "../lib/swarm/plan";
import { partialPath, pathLength, pointAt, repel } from "../lib/swarm/motion";
import { BOOT_LINES, BOOT_MS, bootFrame } from "../lib/swarm/boot";

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

// options: start shifts everything, speed shortens, labelOffset rotates the labels
const later = buildTimeline(targets, 1280, 800, { start: 1000 });
assert.equal(later.end, tl.end + 1000);
assert.deepEqual(later.jobs.map((j) => j.buildStart), tl.jobs.map((j) => j.buildStart + 1000));
assert.ok(sample(later, 1000).targets.every((t) => t.reveal === 0), "nothing happens before start");
const fast = buildTimeline(targets, 1280, 800, { speed: 2 });
assert.ok(fast.builtAt < tl.builtAt * 0.75, "speed 2 is clearly faster");
const rotated = buildTimeline(targets, 1280, 800, { cursors: 3, labelOffset: 9 });
assert.deepEqual(rotated.cursors.map((c) => c.signal), [9, 0, 1]);
assert.deepEqual(rotated.cursors.map((c) => c.label), [SIGNALS[9], SIGNALS[0], SIGNALS[1]]);

// an "exit" batch further down the page: cursors come from around that view and leave it again
const view = { x: 0, y: 1600, w: 1280, h: 800 };
const below = targets.map((t) => ({ ...t, id: `b-${t.id}`, y: t.y + 1600 }));
const batch = buildTimeline(below, 1280, 800, { cursors: 4, finale: "exit", view, start: 5000, speed: 1.4 });
assert.equal(batch.finale, "exit");
assert.equal(batch.jobs.length, below.length);
const out = sample(batch, batch.end);
assert.ok(out.done && out.latch === 0 && out.targets.every((t) => t.reveal === 1));
const inView = (c: { x: number; y: number }) => c.x > view.x && c.x < view.x + view.w && c.y > view.y && c.y < view.y + view.h;
assert.ok(out.cursors.every((c) => !inView(c)), "exit cursors end outside the view");
assert.ok(sample(batch, 5000).cursors.every((c) => !inView(c)), "and start outside it");
assert.ok(batch.end - 5000 < tl.end, "a scroll batch is shorter than the opening build");

// pixel dissolve order: a deterministic permutation, drifting top to bottom
const order = dissolveOrder(20, 6, 7);
assert.deepEqual(order.slice().sort((a, b) => a - b), Array.from({ length: 120 }, (_, i) => i));
assert.deepEqual(order, dissolveOrder(20, 6, 7));
assert.notDeepEqual(order, dissolveOrder(20, 6, 8));
const meanRow = (xs: number[]) => xs.reduce((s, i) => s + Math.floor(i / 20), 0) / xs.length;
assert.ok(meanRow(order.slice(0, 40)) < meanRow(order.slice(80)), "earlier cells are higher up on average");
assert.equal(dissolveOrder(1, 1, 1).length, 1);
assert.equal(hashSeed("h1"), hashSeed("h1"));
assert.notEqual(hashSeed("h1"), hashSeed("h2"));

// repel: nothing outside the radius, a push straight away inside it
assert.deepEqual(repel({ x: 300, y: 0 }, { x: 0, y: 0 }, 120, 0.7), { x: 0, y: 0 });
const push = repel({ x: 60, y: 0 }, { x: 0, y: 0 }, 120, 0.7);
assert.ok(push.x > 0 && push.y === 0);
assert.ok(repel({ x: 10, y: 0 }, { x: 0, y: 0 }, 120, 0.7).x > push.x, "closer pushes harder");
assert.ok(Math.hypot(...Object.values(repel({ x: 0, y: 0 }, { x: 0, y: 0 }, 120, 0.7))) > 0, "right on top still moves");

// boot: lines appear in order, characters only ever grow, and it is all there by the end
let prev = "";
for (let t = 0; t <= BOOT_MS; t += 10) {
  const f = bootFrame(t);
  const joined = f.lines.join("\n");
  assert.ok(joined.length >= prev.length, `boot text never shrinks (t=${t})`);
  prev = joined;
}
const last = bootFrame(BOOT_MS);
assert.ok(last.done && last.collapse === 1);
assert.equal(last.lines.length, BOOT_LINES.length);
assert.ok(last.lines[3].includes("[############] 100%"), last.lines[3]);
assert.equal(last.lines[4], "> make page");
assert.equal(bootFrame(0).lines.length, 1);
assert.equal(bootFrame(0).collapse, 0);

console.log("swarm: all checks passed");
