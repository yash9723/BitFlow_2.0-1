/** scripts/palette.check.ts — self-check for lib/palette.ts (npx tsx scripts/palette.check.ts). */
import assert from "node:assert/strict";
import { type PaletteItem, rank, score } from "../lib/palette";

const items: PaletteItem[] = [
  { id: "a", title: "Sandbox IDE", group: "Page", keywords: "editor simulate" },
  { id: "b", title: "Circuit editor", group: "Studio" },
  { id: "c", title: "4-bit up counter", group: "Practice", keywords: "Sequential" },
  { id: "d", title: "Clock divider", group: "Arena", keywords: "Sequential counter" },
  { id: "e", title: "Truth table & K-map", group: "Studio" },
];
const ids = (q: string) => rank(items, q).map((i) => i.id);

assert.equal(score("", "x"), 0);
assert.equal(score("xyz", "circuit"), -1, "letters must all appear in order");
assert.ok(score("circ", "Circuit editor") > score("circ", "a circular thing"), "prefix beats a later substring");
assert.ok(score("ce", "Circuit editor") > score("ce", "practice"), "word starts beat letters mid-word");
assert.deepEqual(ids(""), ["a", "b", "c", "d", "e"], "an empty query keeps the order");
assert.equal(ids("circuit")[0], "b");
assert.equal(ids("kmap")[0], "e", "fuzzy across punctuation");
assert.deepEqual(ids("counter"), ["c", "d"], "title match first, then keyword match");
assert.equal(ids("cnt")[0], "c");
assert.deepEqual(ids("zzz"), []);
assert.equal(ids("sim")[0], "a", "keywords match too");
assert.equal(rank(items, "e", 2).length, 2, "limit");
console.log("palette: all checks passed");
