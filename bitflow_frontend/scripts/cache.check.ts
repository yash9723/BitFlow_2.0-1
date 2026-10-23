/** scripts/cache.check.ts — self-check for lib/studio/cache.ts (npx tsx scripts/cache.check.ts). */
import assert from "node:assert/strict";
import { type Access, type CacheConfig, TRACES, amat, geometry, parseTrace, simulate } from "../lib/studio/cache";

const base: CacheConfig = { sizeBytes: 1024, blockBytes: 16, ways: 1, policy: "LRU", writeBack: true, writeAllocate: true, addrBits: 32 };
const run = (cfg: Partial<CacheConfig>, trace: Access[] | string) => {
  const t = typeof trace === "string" ? parseTrace(trace) : trace;
  if (typeof t === "string") throw new Error(t);
  const r = simulate({ ...base, ...cfg }, t);
  if (typeof r === "string") throw new Error(r);
  return r;
};
const preset = (label: string) => TRACES.find((t) => t.label === label)!.make();
const counts = (s: ReturnType<typeof run>["stats"]) => [s.hits, s.compulsory, s.capacity, s.conflict];

assert.deepEqual(geometry(base), { sets: 64, blocks: 64, offsetBits: 4, indexBits: 6, tagBits: 22 });
assert.deepEqual(geometry({ ...base, ways: 64 }), { sets: 1, blocks: 64, offsetBits: 4, indexBits: 0, tagBits: 28 });
assert.match(geometry({ ...base, ways: 3 }) as string, /power of two/);
assert.match(geometry({ ...base, sizeBytes: 1000 }) as string, /powers of two/);
assert.match(geometry({ ...base, addrBits: 8 }) as string, /too short/);

assert.deepEqual(parseTrace("R 0x10, W 32\n0b101 # read\n// comment\nS 0x40"), [
  { op: "R", addr: 16 }, { op: "W", addr: 32 }, { op: "R", addr: 5 }, { op: "W", addr: 64 }]);
assert.match(parseTrace("R 0x10\nX 5") as string, /Line 2: "X 5"/);
assert.match(parseTrace("R 0x10000", 16) as string, /doesn't fit in 16/);

// Spatial locality: one compulsory miss per 16-byte block
assert.deepEqual(counts(run({}, preset("Array walk")).stats), [48, 16, 0, 0]);
// Temporal: the second pass hits if the array fits; in a 128-byte cache it can't (capacity misses)
assert.deepEqual(counts(run({}, preset("Loop twice")).stats), [112, 16, 0, 0]);
assert.deepEqual(counts(run({ sizeBytes: 128, ways: 8 }, preset("Loop twice")).stats), [96, 16, 16, 0]);
// Conflict: two arrays 1 KB apart thrash a direct-mapped cache; 2-way holds both
assert.deepEqual(counts(run({}, preset("Conflict thrash")).stats), [0, 8, 0, 24]);
assert.deepEqual(counts(run({ ways: 2 }, preset("Conflict thrash")).stats), [24, 8, 0, 0]);
// Row-major sums hit far more than column-major in a small cache
const rc = run({ sizeBytes: 256 }, preset("Rows vs columns")).steps;
const rowMisses = rc.slice(0, 256).filter((s) => s.outcome !== "hit").length, colMisses = rc.slice(256).filter((s) => s.outcome !== "hit").length;
assert.equal(rowMisses, 64);
assert.equal(colMisses, 256);

// Replacement: in a 2-block fully associative cache, A B A C A hits twice with LRU, once with FIFO
const abaca = "R 0x00\nR 0x10\nR 0x00\nR 0x20\nR 0x00";
const fa2 = { sizeBytes: 32, ways: 2 };
assert.equal(run({ ...fa2, policy: "LRU" }, abaca).stats.hits, 2);
assert.equal(run({ ...fa2, policy: "FIFO" }, abaca).stats.hits, 1);
assert.deepEqual(run({ ...fa2, policy: "LRU" }, abaca).steps[3].evicted, { tag: 1, dirty: false }, "LRU evicts B");
const r1 = run({ ...fa2, policy: "random" }, abaca), r2 = run({ ...fa2, policy: "random" }, abaca);
assert.deepEqual(r1.steps, r2.steps, "random replacement is repeatable (seeded)");

// Writes: write-back marks dirty and writes back on eviction; write-through writes every store
const wb = run({ sizeBytes: 32 }, "W 0x00\nW 0x04\nR 0x20");
assert.equal(wb.steps[2].writeback, true);
assert.deepEqual([wb.stats.writebacks, wb.stats.memWrites], [1, 0]);
const wt = run({ sizeBytes: 32, writeBack: false, writeAllocate: false }, "W 0x00\nW 0x04\nR 0x00\nW 0x00");
assert.deepEqual(wt.steps.map((s) => [s.outcome === "hit", s.way, s.memWrite]), [[false, null, true], [false, null, true], [false, 0, false], [true, 0, true]]);
assert.deepEqual([wt.stats.writebacks, wt.stats.memWrites], [0, 3]);
assert.equal(wt.sets[0][0].dirty, false, "write-through never leaves a block dirty");
// Address split
const st = run({}, "R 0x12345678").steps[0];
assert.deepEqual([st.offset, st.index, st.tag], [0x8, 0x27, 0x12345678 >>> 10]);
assert.equal(amat({ accesses: 4, hits: 3, compulsory: 1, capacity: 0, conflict: 0, writebacks: 0, memWrites: 0, blocksRead: 1 }, 1, 50), 13.5);
console.log("cache: all checks passed");
