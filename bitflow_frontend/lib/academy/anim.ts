/**
 * lib/academy/anim.ts — the logic behind the Academy's interactive animations
 * (components/academy/anim/), kept apart from the drawing so scripts/academy.check.ts can test it.
 */
import { type Implicant, primeImplicants, qmPasses } from "@/lib/studio/logic-min";

export const ANIM_IDS = [
  "noise-chain", "place-value", "divide-by-two", "column-add", "number-wheel", "encoder-disc",
  "cmos-gate", "venn", "kmap-neighbours", "qm-merge",
] as const;
export type AnimId = (typeof ANIM_IDS)[number];

// ── A signal through a chain of stages ────────────────────────────────────────
export const LEVEL = { high: 3.4, low: 0.2, inHigh: 2.0, inLow: 0.8 };
/** How an input reads: 1, 0, or null between the thresholds. */
export const reads = (v: number): 0 | 1 | null => (v >= LEVEL.inHigh ? 1 : v <= LEVEL.inLow ? 0 : null);

/**
 * The voltage after each stage. Noise always pushes towards the wrong level, the worst case.
 * Analog stages pass on what they get, so it adds up; digital stages output a clean level again.
 */
export function noiseChain(bit: 0 | 1, noise: number, stages = 5): { analog: number[]; digital: number[] } {
  const clean = bit ? LEVEL.high : LEVEL.low, push = bit ? -noise : noise;
  const clamp = (v: number) => Math.max(0, Math.min(5, v));
  const analog = [clean], digital = [clean];
  for (let i = 0; i < stages; i++) {
    analog.push(clamp(analog[i] + push));
    const got = reads(clamp(digital[i] + push));
    digital.push(got === 1 ? LEVEL.high : got === 0 ? LEVEL.low : clamp(digital[i] + push));
  }
  return { analog, digital };
}

// ── Numbers ───────────────────────────────────────────────────────────────────
export function divideSteps(n: number): { n: number; q: number; r: number }[] {
  const out = [];
  for (let v = Math.max(0, Math.floor(n)); ;) {
    const q = Math.floor(v / 2);
    out.push({ n: v, q, r: v % 2 });
    if (q === 0) return out;
    v = q;
  }
}

export interface AddColumn { a: number; b: number; cin: number; sum: number; cout: number }
/** Column by column, rightmost first. */
export function addColumns(a: number, b: number, w: number): AddColumn[] {
  const out: AddColumn[] = [];
  let cin = 0;
  for (let i = 0; i < w; i++) {
    const x = (a >> i) & 1, y = (b >> i) & 1, total = x + y + cin;
    out.push({ a: x, b: y, cin, sum: total & 1, cout: total >> 1 });
    cin = total >> 1;
  }
  return out;
}
export const asSigned = (v: number, w: number) => (v >= 2 ** (w - 1) ? v - 2 ** w : v);
/** One move round the number wheel: which boundary it crossed, if any. */
export function wheelMove(v: number, by: number, w: number) {
  const m = 2 ** w, raw = v + by, next = ((raw % m) + m) % m;
  const signed = asSigned(v, w) + by;
  return { next, carry: raw >= m || raw < 0, overflow: signed > m / 2 - 1 || signed < -m / 2 };
}

// ── Rotary encoder ────────────────────────────────────────────────────────────
export const toGray = (n: number) => n ^ (n >> 1);
export function fromGray(g: number) { let n = g; for (let s = g >> 1; s; s >>= 1) n ^= s; return n; }
/**
 * What misaligned sensors read at a position in [0, 8): each of the 3 tracks' sensors sits
 * a little ahead or behind, so while the disc crosses a boundary they can disagree.
 */
export function encoderRead(pos: number, code: "binary" | "gray", skew: number): number {
  let word = 0;
  for (let track = 0; track < 3; track++) {
    const sector = Math.floor(pos + (track - 1) * skew + 8) % 8;
    word |= (((code === "gray" ? toGray(sector) : sector) >> track) & 1) << track;
  }
  return code === "gray" ? fromGray(word) : word;
}
/** How far a reading is from the true sector, around the disc. */
export function encoderError(pos: number, code: "binary" | "gray", skew: number) {
  const d = Math.abs(encoderRead(pos, code, skew) - Math.floor(pos));
  return Math.min(d, 8 - d);
}

// ── CMOS ──────────────────────────────────────────────────────────────────────
export type CmosGate = "not" | "nand" | "nor";
/** A PMOS conducts on 0, an NMOS on 1. Series needs both, parallel needs either. */
export function cmosState(gate: CmosGate, a: number, b: number) {
  const pa = a === 0, pb = b === 0, na = a === 1, nb = b === 1;
  const up = gate === "not" ? pa : gate === "nand" ? pa || pb : pa && pb;
  const down = gate === "not" ? na : gate === "nand" ? na && nb : na || nb;
  return { pa, pb, na, nb, up, down, y: up ? 1 : 0 };
}

// ── K-map ─────────────────────────────────────────────────────────────────────
/** The cells one variable away: on a K-map these touch, wrapping round the edges. */
export const neighbours = (m: number, n: number) => Array.from({ length: n }, (_, i) => m ^ (1 << (n - 1 - i)));

// ── Quine-McCluskey, one comparison at a time ─────────────────────────────────
export const keyOf = (t: Implicant) => `${t.value},${t.mask}`;
export type QmStep =
  | { kind: "start"; pass: number }
  | { kind: "merge"; pass: number; a: Implicant; b: Implicant; result: Implicant; repeat: boolean }
  | { kind: "done"; primes: Implicant[] };

export function qmSteps(ones: number[], dontCares: number[]) {
  const passes = qmPasses(ones, dontCares);
  const steps: QmStep[] = [];
  passes.forEach((terms, pass) => {
    steps.push({ kind: "start", pass });
    const seen = new Set<string>();
    for (let i = 0; i < terms.length; i++) {
      for (let j = i + 1; j < terms.length; j++) {
        const a = terms[i], b = terms[j], diff = a.value ^ b.value;
        if (a.mask !== b.mask || diff === 0 || (diff & (diff - 1)) !== 0) continue;
        const result = { value: a.value & ~diff, mask: a.mask | diff };
        steps.push({ kind: "merge", pass, a, b, result, repeat: seen.has(keyOf(result)) });
        seen.add(keyOf(result));
      }
    }
  });
  steps.push({ kind: "done", primes: primeImplicants(ones, dontCares) });
  return { passes, steps };
}
