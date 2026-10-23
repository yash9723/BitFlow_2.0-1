/**
 * lib/studio/cache.ts — the cache simulator (/studio/cache): a set-associative cache with
 * LRU / FIFO / random replacement, write-back or write-through, with or without write
 * allocate. Each miss is classified the textbook way (the "3 Cs"): compulsory (first touch
 * of the block), capacity (a fully associative LRU cache of the same size misses too) or
 * conflict (that cache would have hit). Self-check: scripts/cache.check.ts.
 */

export type Policy = "LRU" | "FIFO" | "random";
export interface CacheConfig {
  sizeBytes: number;          // data capacity
  blockBytes: number;
  ways: number;               // 1 = direct mapped; sizeBytes / blockBytes = fully associative
  policy: Policy;
  writeBack: boolean;         // else write-through
  writeAllocate: boolean;     // a write miss brings the block in
  addrBits: number;
}
export interface Access { op: "R" | "W"; addr: number }
export type Outcome = "hit" | "compulsory" | "capacity" | "conflict";

export interface Line { valid: boolean; tag: number; dirty: boolean; used: number; loaded: number }
export interface Step {
  op: "R" | "W"; addr: number; tag: number; index: number; offset: number;
  outcome: Outcome; way: number | null;          // null: a write miss that didn't allocate
  evicted: { tag: number; dirty: boolean } | null; writeback: boolean; memWrite: boolean;
}
export interface Stats { accesses: number; hits: number; compulsory: number; capacity: number; conflict: number; writebacks: number; memWrites: number; blocksRead: number }

const isPow2 = (n: number) => Number.isInteger(n) && n > 0 && (n & (n - 1)) === 0;
const log2 = (n: number) => Math.round(Math.log2(n));

export function geometry(c: CacheConfig): { sets: number; blocks: number; offsetBits: number; indexBits: number; tagBits: number } | string {
  if (!isPow2(c.sizeBytes) || !isPow2(c.blockBytes)) return "Cache and block sizes must be powers of two.";
  if (c.blockBytes > c.sizeBytes) return "The block is bigger than the cache.";
  const blocks = c.sizeBytes / c.blockBytes;
  if (!isPow2(c.ways) || c.ways > blocks) return `Associativity must be a power of two up to ${blocks} (fully associative).`;
  const sets = blocks / c.ways, offsetBits = log2(c.blockBytes), indexBits = log2(sets), tagBits = c.addrBits - offsetBits - indexBits;
  if (tagBits < 1) return `${c.addrBits}-bit addresses are too short for this cache.`;
  return { sets, blocks, offsetBits, indexBits, tagBits };
}

/** "R 0x1F", "W 64", "0x40" (a read), separated by commas or newlines; # or // starts a comment. */
export function parseTrace(text: string, addrBits = 32): Access[] | string {
  const out: Access[] = [];
  const lines = text.split("\n");
  for (let ln = 0; ln < lines.length; ln++) {
    const line = lines[ln].replace(/(#|\/\/).*$/, "");
    for (const item of line.split(",").map((s) => s.trim()).filter(Boolean)) {
      const m = /^(?:([RrWwLlSs])\s+)?(0[xX][0-9a-fA-F_]+|0[bB][01_]+|\d+)$/.exec(item);
      if (!m) return `Line ${ln + 1}: "${item}" isn't an access. Write R 0x1A2C or W 4096 (a bare address is a read).`;
      const raw = m[2].replace(/_/g, "");
      const addr = /^0[bB]/.test(raw) ? parseInt(raw.slice(2), 2) : Number(raw);
      if (!Number.isSafeInteger(addr) || addr >= 2 ** addrBits) return `Line ${ln + 1}: ${m[2]} doesn't fit in ${addrBits} address bits.`;
      out.push({ op: m[1] && /[WwSs]/.test(m[1]) ? "W" : "R", addr });
    }
  }
  return out;
}

/** Run the trace: every step, the cache's final contents (sets × ways) and the totals. */
export function simulate(c: CacheConfig, trace: Access[], seed = 1): { steps: Step[]; sets: Line[][]; stats: Stats } | string {
  const g = geometry(c);
  if (typeof g === "string") return g;
  const sets: Line[][] = Array.from({ length: g.sets }, () => Array.from({ length: c.ways }, () => ({ valid: false, tag: 0, dirty: false, used: -1, loaded: -1 })));
  const seen = new Set<number>();
  const shadow = new Map<number, number>();          // fully associative LRU of the same capacity, oldest first
  const stats: Stats = { accesses: 0, hits: 0, compulsory: 0, capacity: 0, conflict: 0, writebacks: 0, memWrites: 0, blocksRead: 0 };
  let rnd = seed >>> 0 || 1;
  const random = (n: number) => { rnd = (Math.imul(rnd, 1103515245) + 12345) >>> 0; return (rnd >>> 16) % n; };
  const steps: Step[] = [];

  trace.forEach(({ op, addr }, t) => {
    const block = Math.floor(addr / c.blockBytes);
    const offset = addr % c.blockBytes, index = block % g.sets, tag = Math.floor(block / g.sets);
    const set = sets[index];
    const allocate = op === "R" || c.writeAllocate;

    // The 3 Cs: the fully associative cache decides capacity vs conflict
    const shadowHit = shadow.has(block);
    if (shadowHit || allocate) {
      shadow.delete(block);
      shadow.set(block, t);
      if (shadow.size > g.blocks) shadow.delete(shadow.keys().next().value!);
    }

    let way = set.findIndex((l) => l.valid && l.tag === tag);
    let outcome: Outcome = "hit", evicted: Step["evicted"] = null, writeback = false;
    if (way >= 0) stats.hits++;
    else {
      outcome = !seen.has(block) ? "compulsory" : shadowHit ? "conflict" : "capacity";
      stats[outcome]++;
      if (allocate) {
        way = set.findIndex((l) => !l.valid);
        if (way < 0) {
          way = c.policy === "random" ? random(c.ways)
            : set.reduce((best, l, i) => ((c.policy === "LRU" ? l.used < set[best].used : l.loaded < set[best].loaded) ? i : best), 0);
          evicted = { tag: set[way].tag, dirty: set[way].dirty };
          if (evicted.dirty) { writeback = true; stats.writebacks++; }
        }
        set[way] = { valid: true, tag, dirty: false, used: t, loaded: t };
        stats.blocksRead++;
      }
    }
    seen.add(block);
    if (way >= 0) set[way].used = t;
    let memWrite = false;
    if (op === "W") {
      if (way >= 0 && c.writeBack) set[way].dirty = true;
      else { memWrite = true; stats.memWrites++; }          // write-through, or a write miss that went straight to memory
    }
    stats.accesses++;
    steps.push({ op, addr, tag, index, offset, outcome, way: way >= 0 ? way : null, evicted, writeback, memWrite });
  });
  return { steps, sets, stats };
}

/** Average memory access time in cycles: hit time + miss rate × miss penalty. */
export const amat = (s: Stats, hitTime: number, missPenalty: number) =>
  s.accesses ? hitTime + ((s.accesses - s.hits) / s.accesses) * missPenalty : 0;

// ── Example traces ───────────────────────────────────────────────────────────

const hex = (n: number) => `0x${n.toString(16).toUpperCase()}`;
export const TRACES: { label: string; blurb: string; make: () => string }[] = [
  { label: "Array walk", blurb: "Read 64 consecutive 4-byte words: one miss per block, then hits (spatial locality).",
    make: () => Array.from({ length: 64 }, (_, i) => `R ${hex(0x1000 + 4 * i)}`).join("\n") },
  { label: "Loop twice", blurb: "Walk a 256-byte array twice: the second pass hits if the array fits (temporal locality).",
    make: () => [0, 1].flatMap(() => Array.from({ length: 64 }, (_, i) => `R ${hex(0x2000 + 4 * i)}`)).join("\n") },
  { label: "Rows vs columns", blurb: "Sum a 16×16 int matrix by rows, then by columns: the column walk strides 64 bytes and misses far more.",
    make: () => [
      "# by rows", ...Array.from({ length: 256 }, (_, k) => `R ${hex(0x4000 + 4 * k)}`),
      "# by columns", ...Array.from({ length: 256 }, (_, k) => `R ${hex(0x8000 + 4 * ((k % 16) * 16 + Math.floor(k / 16)))}`),
    ].join("\n") },
  { label: "Conflict thrash", blurb: "Two arrays 1 KB apart, read alternately: a 1 KB direct-mapped cache misses every time; 2-way fixes it.",
    make: () => Array.from({ length: 32 }, (_, i) => `R ${hex(4 * (i >> 1) + (i & 1 ? 1024 : 0))}`).join("\n") },
  { label: "Copy (writes)", blurb: "Copy 32 words from one array to another: watch dirty blocks and write-backs.",
    make: () => Array.from({ length: 32 }, (_, i) => `R ${hex(0x3000 + 4 * i)}\nW ${hex(0x5000 + 4 * i)}`).join("\n") },
];
