/**
 * scripts/announcements.check.ts — self-check for lib/announcements.ts and the release posts
 * (npx tsx scripts/announcements.check.ts).
 */
import assert from "node:assert/strict";
import { announcementProblem, ANNOUNCEMENT_KINDS, badgeText, bodyBlocks, isPublished, isUnread, MAX_BODY, MAX_TITLE, sortAnnouncements } from "../lib/announcements";
import { RELEASE_POSTS } from "../content/announcements";
import { coolingFor, burstAt, DOOM_PALETTE, EDGE, emberAt, FIRE_PALETTE, newFire, nextTheme, paintEmbers, paintFire, stepFire, stoke, stokedCooling } from "../lib/pixel-fire";

// The release posts themselves.
assert.equal(new Set(RELEASE_POSTS.map((p) => p.id)).size, RELEASE_POSTS.length, "ids are unique");
for (const p of RELEASE_POSTS) {
  assert.equal(announcementProblem(p), null, `${p.id}: ${announcementProblem(p)}`);
  assert.ok(!Number.isNaN(new Date(p.publishedAt).getTime()), `${p.id} has a real date`);
  assert.match(p.id, /^[a-z0-9-]+$/, `${p.id}: ids stay simple`);
  assert.doesNotMatch(p.body, /<[a-z/]/i, `${p.id}: posts are plain text`);
}
assert.equal(RELEASE_POSTS.find((p) => p.id === "bitflow-3-apex")?.pinned, true, "the 3.0 post is pinned");

// Validation.
const good = { title: "T", body: "B", kind: "fix" };
assert.equal(announcementProblem(good), null);
assert.ok(announcementProblem({ ...good, title: "  " }));
assert.ok(announcementProblem({ ...good, title: "x".repeat(MAX_TITLE + 1) }));
assert.ok(announcementProblem({ ...good, body: "x".repeat(MAX_BODY + 1) }));
assert.ok(announcementProblem({ ...good, body: 7 }));
assert.ok(announcementProblem({ ...good, kind: "toString" }), "inherited object keys aren't kinds");
assert.ok(announcementProblem({ ...good, kind: "rumour" }));
for (const k of Object.keys(ANNOUNCEMENT_KINDS)) assert.equal(announcementProblem({ ...good, kind: k }), null);

// A post dated in the future isn't shown yet.
const now = new Date("2026-11-01T00:00:00Z");
assert.equal(isPublished({ publishedAt: "2026-10-31T23:59:00Z" }, now), true);
assert.equal(isPublished({ publishedAt: "2026-11-01T00:01:00Z" }, now), false);

// Pinned first, then newest.
const order = sortAnnouncements([
  { id: "old", publishedAt: "2026-01-01" }, { id: "pin-old", pinned: true, publishedAt: "2026-02-01" },
  { id: "new", publishedAt: "2026-03-01" }, { id: "pin-new", pinned: true, publishedAt: "2026-02-15" },
]).map((p) => p.id);
assert.deepEqual(order, ["pin-new", "pin-old", "new", "old"]);

// Unread: posted after the last visit; never visited means everything.
const post = { publishedAt: "2026-10-31T10:00:00Z" };
assert.equal(isUnread(post, null), true);
assert.equal(isUnread(post, "2026-10-31T09:00:00Z"), true);
assert.equal(isUnread(post, "2026-10-31T10:00:00Z"), false);
assert.equal(isUnread(post, new Date("2026-10-31T11:00:00Z")), false);
assert.equal(badgeText(1), "1");
assert.equal(badgeText(9), "9");
assert.equal(badgeText(10), "9+");

// Blocks, and that markup stays text.
assert.deepEqual(bodyBlocks("One\nline.\n\n- a\n- b\n\n\nLast"), [
  { type: "p", text: "One line." }, { type: "ul", items: ["a", "b"] }, { type: "p", text: "Last" },
]);
assert.deepEqual(bodyBlocks("- a\nnot a bullet"), [{ type: "p", text: "- a not a bullet" }]);
assert.deepEqual(bodyBlocks("<script>x</script>"), [{ type: "p", text: "<script>x</script>" }]);
assert.deepEqual(bodyBlocks("  \n\n "), []);

// Pixel fire: a repeatable random source, so a failure here can be reproduced.
let seed = 12345;
const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
const [cols, rows] = [40, 30];
const heat = newFire(cols, rows);
for (let i = 0; i < 200; i++) stepFire(heat, cols, rows, coolingFor(rows), random, i * 0.04);
const hottest = FIRE_PALETTE.length - 1;
assert.ok(heat.every((h) => h >= 0 && h <= hottest), "heat stays inside the palette");
const rowAverage = (y: number) => heat.slice(y * cols, (y + 1) * cols).reduce((a, b) => a + b, 0) / cols;
assert.ok(rowAverage(rows - 1) > hottest * 0.6, "the base keeps burning");
assert.ok(rowAverage(rows - 2) > rowAverage(Math.floor(rows / 2)), "cooler higher up");
assert.ok(rowAverage(Math.floor(rows / 2)) > 0.5, "flames reach the middle");
assert.ok(rowAverage(0) < 1, "the top is clear, so text above stays readable");
assert.ok(heat.slice((rows - 8) * cols).every((h) => h >= 1), "no black speckle low in the fire");
assert.equal(FIRE_PALETTE.length, 16);
assert.deepEqual(FIRE_PALETTE[0], [0, 0, 0]);
for (let i = 1; i < FIRE_PALETTE.length; i++) assert.ok(FIRE_PALETTE[i].every((c, k) => Math.abs(c - FIRE_PALETTE[i - 1][k]) < 100), `palette jump at step ${i}`);
const pixels = new Uint8ClampedArray(heat.length * 4);
paintFire(heat, pixels);
assert.equal(pixels[3], 0, "a cold pixel is transparent");
const baseAlpha = pixels[(rows - 1) * cols * 4 + 3];
assert.equal(baseAlpha, 255, "a hot pixel is solid, with no soft gradient");
let embers = 0;
for (let t = 0; t < 30; t += 0.37) for (let i = 0; i < 20; i++) {
  const e = emberAt(i, t, cols, rows);
  if (!e) continue;
  embers++;
  assert.ok(e.x >= 0 && e.x < cols && e.y >= 0 && e.y < rows, "an ember stays on the canvas");
}
assert.ok(embers > 100, "embers do appear");
paintEmbers(pixels, cols, rows, 12.3);

// Scrolling stokes the fire: taller flames, then back to rest.
const heatAtHeight = (cooling: number, share: number) => {
  const h = newFire(cols, rows);
  for (let i = 0; i < 200; i++) stepFire(h, cols, rows, cooling, random, i * 0.04);
  const y = Math.floor(rows * (1 - share));
  return h.slice(y * cols, (y + 1) * cols).reduce((a, b) => a + b, 0) / cols;
};
const heightAt = (flare: number) => heatAtHeight(stokedCooling(rows, flare), 0.3);
assert.ok(heightAt(1) > heightAt(0), "stoked flames reach higher than resting ones");
assert.equal(stoke(0, 0), 0, "no scrolling, no flare");
assert.equal(stoke(0.5, 100000), 1, "a flare never goes past full");
assert.equal(stoke(0, 100), stoke(0, -100), "either direction stokes it");
let fading = 1; for (let i = 0; i < 60; i++) fading = stoke(fading, 0);
assert.ok(fading < 0.01, "it dies back when scrolling stops");

// The theme turns at a line, with room around it so hovering there doesn't set off burst after burst.
assert.equal(nextTheme(0, 0, 800, 5000), 0, "fire at the top");
assert.equal(nextTheme(0, 799, 800, 5000), 0, "not yet");
assert.equal(nextTheme(0, 800, 800, 5000), 1, "turns a screen down");
assert.equal(nextTheme(1, 700, 800, 5000), 1, "stays turned just above the line");
assert.equal(nextTheme(0, 700, 800, 5000), 0, "and stays fire there on the way down");
assert.equal(nextTheme(1, 480, 800, 5000), 0, "turns back well above it");
assert.equal(nextTheme(0, 400, 800, 500), 1, "a short page still gets there");
assert.equal(nextTheme(0, 0, 800, 0), 0, "a page that can't scroll stays as it is");

// The burst: up over the page at its peak, back in its band afterwards.
assert.equal(burstAt(0).rage, 0, "it builds from nothing");
assert.equal(burstAt(0.6).rage, 1, "out of control at the peak");
assert.equal(burstAt(0).turned, 0, "not turned at the start");
assert.equal(burstAt(0.9).turned, 1, "turned while the fire is still over the page");
assert.equal(burstAt(1.7).rage, 0, "and it has calmed by the end");
assert.equal(burstAt(1.9).done, false);
assert.equal(burstAt(2).done, true);
assert.ok(heatAtHeight(stokedCooling(rows, 0, 1), 0.8) > EDGE, "at the peak the fire licks most of the way up the screen");
assert.ok(heatAtHeight(stokedCooling(rows, 0), 0.6) < EDGE, "normally it keeps to the bottom of the screen");
assert.ok(heatAtHeight(stokedCooling(rows, 1), 0.6) < EDGE, "even stoked");
assert.equal(DOOM_PALETTE.length, FIRE_PALETTE.length, "every heat has a green");
for (const [r, g] of DOOM_PALETTE.slice(1, -1)) assert.ok(g > r, "green outweighs red");
// The turn is dithered: every pixel is pure fire or pure green, never a muddy blend of the two.
const shadesAt = (doom: number) => {
  const painted = new Uint8ClampedArray(heat.length * 4);
  paintFire(heat, painted, doom, cols);
  let red = 0, turned = 0;
  for (let i = 0; i < heat.length; i++) {
    if (heat[i] < EDGE) continue;
    const level = Math.floor(heat[i]), rgb = [painted[i * 4], painted[i * 4 + 1], painted[i * 4 + 2]];
    if (rgb.every((c, k) => c === FIRE_PALETTE[level][k])) red++;
    else if (rgb.every((c, k) => c === DOOM_PALETTE[level][k])) turned++;
    else assert.fail("a pixel is a blend of the two palettes");
  }
  return { red, turned };
};
assert.equal(shadesAt(0).turned, 0, "all fire at the top");
assert.equal(shadesAt(1).red, 0, "all green when fully turned");
const halfway = shadesAt(0.5);
assert.ok(Math.abs(halfway.red - halfway.turned) < (halfway.red + halfway.turned) * 0.2, "about half and half midway");

console.log("announcements: OK");
