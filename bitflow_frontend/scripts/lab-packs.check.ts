/**
 * scripts/lab-packs.check.ts — every lab pack problem exists in the problem bank and isn't
 * repeated within a pack (npx tsx scripts/lab-packs.check.ts).
 */
import assert from "node:assert/strict";
import { getAllProblems } from "../lib/problems/index";
import { ALL_ARENA_PROBLEMS } from "../lib/arena/index";
import { LAB_PACKS, labPack, packDueDates } from "../lib/lab-packs";

const known = new Set([...getAllProblems().map((p) => p.slug), ...ALL_ARENA_PROBLEMS.map((p: { slug: string }) => p.slug)]);
const ids = new Set<string>();
for (const pack of LAB_PACKS) {
  assert.ok(!ids.has(pack.id), `duplicate pack id ${pack.id}`);
  ids.add(pack.id);
  assert.ok(pack.experiments.length >= 1 && pack.experiments.length <= 20, `${pack.id}: 1-20 experiments`);
  const seen = new Set<string>();
  for (const exp of pack.experiments) {
    assert.ok(exp.title.length <= 120, `${pack.id}: title too long: ${exp.title}`);
    assert.ok(exp.slugs.length >= 1 && exp.slugs.length <= 50, `${pack.id}: ${exp.title} needs 1-50 problems`);
    for (const slug of exp.slugs) {
      assert.ok(known.has(slug), `${pack.id}: unknown problem "${slug}" in ${exp.title}`);
      assert.ok(!seen.has(slug), `${pack.id}: "${slug}" appears twice`);
      seen.add(slug);
    }
  }
}
assert.equal(labPack("verilog-hdl")?.title, "Verilog HDL lab");
assert.equal(labPack("nope"), undefined);
const due = packDueDates(new Date("2027-01-10T18:29:00Z"), 3);
assert.deepEqual(due.map((d) => d.toISOString()), ["2027-01-10T18:29:00.000Z", "2027-01-17T18:29:00.000Z", "2027-01-24T18:29:00.000Z"]);

console.log(`lab-packs: ok (${LAB_PACKS.length} packs, ${LAB_PACKS.reduce((n, p) => n + p.experiments.length, 0)} experiments)`);
