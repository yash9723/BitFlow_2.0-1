/**
 * scripts/ascii-chips.check.ts — self-check for the drifting ASCII chips (npx tsx scripts/ascii-chips.check.ts):
 * the chip shapes (lib/ascii-chips/chips.ts) and the flock they drift in (lib/ascii-chips/flock.ts).
 */
import assert from "node:assert/strict";
import { KINDS, chips } from "../lib/ascii-chips/chips";
import { Flock } from "../lib/ascii-chips/flock";
import { INK_DARK, INK_LIT, type Ink } from "../lib/ascii-chips/ink";
import { lineGlyph } from "../lib/ascii-chips/renderer";

const out: Ink = { r: 0, g: 0, b: 0, kind: 0, glyphs: null, au: 0, av: 0 };

// Every chip is there at its centre, and nothing it draws lies beyond its reach: the renderer only looks
// that far, so anything further out would be cut off.
for (const kind of KINDS) {
  assert.ok(kind.sample(0, 0, out, 0, 1), `${kind.name}: drawn at its centre`);
  let hits = 0;
  for (const t of [0, 0.7, 1.9]) {
    for (let u = -0.7; u <= 0.7; u += 0.01) {
      for (let v = -0.7; v <= 0.7; v += 0.01) {
        if (!kind.sample(u, v, out, t, 3)) continue;
        hits++;
        assert.ok(Math.hypot(u, v) <= kind.reach, `${kind.name}: (${u.toFixed(2)}, ${v.toFixed(2)}) is inside its reach`);
      }
    }
  }
  assert.ok(hits > 500, `${kind.name}: covers more than a speck`);
}

// The seven-segment digit lights the segments of the digit it is on: at t = 0, chip 0 shows 0, which
// lights the top bar and leaves the middle one dark.
const seg7 = KINDS.find((k) => k.name === "seg7")!;
seg7.sample(0.25, 0, out, 0, 0);
assert.equal(out.kind, INK_LIT, "seg7: 0 lights the top bar");
seg7.sample(0, 0, out, 0, 0);
assert.equal(out.kind, INK_DARK, "seg7: 0 leaves the middle bar dark");

// Line glyphs follow the angle (screen space, y down).
assert.deepEqual([0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4].map(lineGlyph), ["-", "\\", "|", "/"]);

// The flock fills the screen at once, keeps its size while chips leave and come back, and stays sorted
// far to near so the near chips draw over the far ones.
const flock = new Flock(chips, chips.defaults);
flock.resize(1200, 800);
assert.equal(flock.creatures.length, flock.target, "the flock is seeded at its target size");
assert.ok(flock.target > 3 && flock.target <= chips.max!, `a sensible number of chips (${flock.target})`);
for (let i = 0; i < 60 * 120; i++) flock.step(1 / 60);
assert.equal(flock.creatures.length, flock.target, "still that size two minutes on");
for (const c of flock.creatures) {
  assert.ok(Number.isFinite(c.x) && Number.isFinite(c.y) && Number.isFinite(c.angle), "every chip is somewhere");
  assert.ok(c.x > -400 && c.x < 1600 && c.y > -400 && c.y < 1200, "and not far off screen");
}
assert.ok(flock.creatures.every((c, i, all) => i === 0 || all[i - 1].roll <= c.roll), "sorted far to near");

// A chip that has crossed comes back in upstream: heading up and to the right, that is the left or bottom edge.
const c = flock.creatures[0];
flock.reenter(c);
assert.ok(c.x < 0 || c.y > 800, "re-enters from an upstream edge");

console.log("ascii-chips: ok");
