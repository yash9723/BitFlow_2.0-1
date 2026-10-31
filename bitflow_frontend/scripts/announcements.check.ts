/**
 * scripts/announcements.check.ts — self-check for lib/announcements.ts and the release posts
 * (npx tsx scripts/announcements.check.ts).
 */
import assert from "node:assert/strict";
import { announcementProblem, ANNOUNCEMENT_KINDS, badgeText, bodyBlocks, isPublished, isUnread, MAX_BODY, MAX_TITLE, sortAnnouncements } from "../lib/announcements";
import { RELEASE_POSTS } from "../content/announcements";
import { coolingFor, FIRE_PALETTE, newFire, paintFire, stepFire } from "../lib/pixel-fire";

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
for (let i = 0; i < 200; i++) stepFire(heat, cols, rows, coolingFor(rows), random);
const hottest = FIRE_PALETTE.length - 1;
assert.ok(heat.every((h) => h >= 0 && h <= hottest), "heat stays inside the palette");
const rowAverage = (y: number) => heat.slice(y * cols, (y + 1) * cols).reduce((a, b) => a + b, 0) / cols;
assert.ok(rowAverage(rows - 1) > hottest * 0.6, "the base keeps burning");
assert.ok(rowAverage(rows - 2) > rowAverage(Math.floor(rows / 2)), "cooler higher up");
assert.ok(rowAverage(Math.floor(rows / 2)) > 0.5, "flames reach the middle");
assert.ok(rowAverage(0) < 1, "the top is clear, so text above stays readable");
const pixels = new Uint8ClampedArray(heat.length * 4);
paintFire(heat, pixels);
assert.equal(pixels[3], 0, "a cold pixel is transparent");
const baseAlpha = pixels[(rows - 1) * cols * 4 + 3];
assert.equal(baseAlpha, 255, "a hot pixel is solid, with no soft gradient");

console.log("announcements: OK");
