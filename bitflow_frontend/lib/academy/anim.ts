/**
 * lib/academy/anim.ts — the logic behind the Academy's interactive animations
 * (components/academy/anim/), kept apart from the drawing so scripts/academy.check.ts can test it.
 */
import { type Implicant, primeImplicants, qmPasses } from "@/lib/studio/logic-min";

export const ANIM_IDS = [
  "noise-chain", "place-value", "divide-by-two", "column-add", "number-wheel", "encoder-disc",
  "cmos-gate", "venn", "kmap-neighbours", "qm-merge",
  "inverter-curve", "load-delay", "compare-bits", "mux-router", "adder-race", "shift-add", "booth",
  "sr-latch", "latch-vs-ff", "shift-register", "ripple-vs-sync", "ring-johnson", "fsm-detector", "state-minimize",
  "setup-hold", "timing-budget", "metastable", "memory-grid", "dram-refresh", "pla-program", "lut-explorer",
  "sampling", "quantize", "sar-adc", "dac-bits", "blocking-nonblocking", "circuit-to-verilog",
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

/**
 * A 5 V CMOS inverter's transfer curve. ponytail: a smooth illustrative curve, not a transistor
 * model; the shape and the thresholds are right, the exact voltages in between aren't measured.
 */
export const inverterOut = (vin: number, vdd = 5) => vdd / (1 + Math.exp((vin - vdd / 2) * 6));
/** Each transistor conducts past its threshold (1 V here), so mid-swing both are on at once. */
export const inverterState = (vin: number, vdd = 5, vt = 1) => ({ nmos: vin > vt, pmos: vin < vdd - vt });

/**
 * A gate driving n others: one resistance charging the wire and the input capacitances.
 * Illustrative values: 1 kΩ, 10 pF of wire, 5 pF per input. tau in ns, power for one
 * full charge and discharge per clock cycle.
 */
export function loadModel(n: number, mhz: number, volts: number) {
  const pf = 10 + 5 * n, tau = pf, halfPeriod = 500 / mhz;
  const high = 1 / (1 + Math.exp(-halfPeriod / tau));         // the steady-state swing of an RC square wave
  return { pf, tau, delay: 0.69 * tau, high, low: 1 - high, ok: high >= 0.7, milliwatts: (pf * volts * volts * mhz) / 1000, halfPeriod };
}
/** The output of that RC over two cycles, in steady state, as a fraction of the supply. */
export function rcWave(halfPeriod: number, tau: number, samples = 200) {
  const high = 1 / (1 + Math.exp(-halfPeriod / tau)), low = 1 - high;
  return Array.from({ length: samples + 1 }, (_, i) => {
    const t = (i / samples) * 4 * halfPeriod, phase = t % (2 * halfPeriod), rising = phase < halfPeriod;
    const dt = rising ? phase : phase - halfPeriod;
    return rising ? 1 - (1 - low) * Math.exp(-dt / tau) : high * Math.exp(-dt / tau);
  });
}

// ── Comparing, from the top bit down ──────────────────────────────────────────
export function compareSteps(a: number, b: number, w: number) {
  const out: { bit: number; a: number; b: number; verdict: "same" | "greater" | "less" }[] = [];
  for (let bit = w - 1; bit >= 0; bit--) {
    const x = (a >> bit) & 1, y = (b >> bit) & 1;
    out.push({ bit, a: x, b: y, verdict: x === y ? "same" : x > y ? "greater" : "less" });
    if (x !== y) break;
  }
  return out;
}

// ── Carry timing, in gate delays (each AND or OR counts as one, however wide) ─────
export const rippleCarryTime = (i: number) => 2 * i;
export const claLevels = (n: number) => { let levels = 1; for (let span = 4; span < n; span *= 4) levels++; return levels; };
/** Carry i in an n-bit lookahead adder of 4-bit groups: carries at group boundaries arrive sooner. */
export function claCarryTime(i: number, n: number) {
  const levels = claLevels(n);
  let k = 0;
  for (let v = i; k < levels - 1 && v % 4 === 0; v /= 4) k++;
  return 3 + 4 * (levels - 1) - 2 * k;
}

// ── Multiplying ───────────────────────────────────────────────────────────────
export function shiftAddSteps(a: number, b: number, w: number) {
  const out: { bit: number; on: number; partial: number; total: number }[] = [];
  let total = 0;
  for (let bit = 0; bit < w; bit++) {
    const on = (b >> bit) & 1, partial = on ? a << bit : 0;
    total += partial;
    out.push({ bit, on, partial, total });
  }
  return out;
}

export interface BoothRow { pair: string; op: "add" | "sub" | "none"; a: number; q: number; q1: number }
/**
 * Booth's algorithm on w-bit two's complement: A (shown in w bits), Q and Q₋₁ after each step's
 * operation and arithmetic shift. A is kept as a true signed value, one bit wider than shown,
 * because A − M overflows w bits when M is the most negative number.
 */
export function boothSteps(m: number, multiplier: number, w: number) {
  const mask = 2 ** w - 1, M = asSigned(m & mask, w);
  let a = 0, q = multiplier & mask, q1 = 0;
  const rows: BoothRow[] = [];
  for (let i = 0; i < w; i++) {
    const pair = `${q & 1}${q1}`, op = pair === "10" ? "sub" : pair === "01" ? "add" : "none";
    if (op === "sub") a -= M;
    if (op === "add") a += M;
    q1 = q & 1;
    q = (q >> 1) | ((a & 1) << (w - 1));
    a >>= 1;
    rows.push({ pair, op, a: a & mask, q, q1 });
  }
  return { rows, product: a * 2 ** w + q };
}

// ── Storing a bit ─────────────────────────────────────────────────────────────
/**
 * A NOR latch, one gate delay at a time, from where it is now: both gates update together.
 * Returns each state until it stops changing; `settles` is false if it never does
 * (both inputs released together from S = R = 1).
 */
export function srSteps(s: number, r: number, q: number, qn: number, limit = 8) {
  const nor = (a: number, b: number) => (a | b) ^ 1;
  const out: { q: number; qn: number }[] = [];
  for (let i = 0; i < limit; i++) {
    const next = { q: nor(r, qn), qn: nor(s, q) };
    if (next.q === q && next.qn === qn) return { steps: out, settles: true };
    out.push(next);
    q = next.q; qn = next.qn;
  }
  return { steps: out, settles: false };
}

/** One tick of a latch and a flip-flop watching the same signals. */
export function latchFfTick(prev: { clk: number; latch: number; ff: number }, clk: number, d: number) {
  return { clk, d, latch: clk ? d : prev.latch, ff: clk && !prev.clk ? d : prev.ff };
}

/** One clock of a shift register, leftmost bit first. */
export function shiftStep(bits: number[], serialIn: number, dir: "right" | "left") {
  return dir === "right"
    ? { bits: [serialIn, ...bits.slice(0, -1)], out: bits[bits.length - 1] }
    : { bits: [...bits.slice(1), serialIn], out: bits[0] };
}

// ── Counters ──────────────────────────────────────────────────────────────────
/** A ripple counter's values after a clock edge: each stage toggles only when the one before falls. */
export function rippleSteps(v: number, w: number) {
  const out: number[] = [];
  let cur = v;
  for (let bit = 0; bit < w; bit++) {
    const was = (cur >> bit) & 1;
    cur ^= 1 << bit;
    out.push(cur);
    if (!was) break;
  }
  return out;
}
export const ringNext = (b: number[]) => [b[b.length - 1], ...b.slice(0, -1)];
export const johnsonNext = (b: number[]) => [b[b.length - 1] ^ 1, ...b.slice(0, -1)];

// ── State machines ────────────────────────────────────────────────────────────
export interface MachineState { name: string; next: [number, number]; out: number }
/** "101" detectors, allowing overlaps. Moore: output by state. Mealy: output on the transition into a match. */
export const MOORE_101: MachineState[] = [
  { name: "S0", next: [0, 1], out: 0 }, { name: "S1", next: [2, 1], out: 0 },
  { name: "S10", next: [0, 3], out: 0 }, { name: "S101", next: [2, 1], out: 1 },
];
export const MEALY_101: MachineState[] = [
  { name: "S0", next: [0, 1], out: 0 }, { name: "S1", next: [2, 1], out: 0 }, { name: "S10", next: [0, 1], out: 0 },
];
export const mealyOut = (state: number, input: number) => (state === 2 && input === 1 ? 1 : 0);

/** Moore state minimization: the partition after each round of splitting by where states go. */
export function partitionSteps(states: MachineState[]) {
  const groups = states.map((s) => s.out);
  const rounds: number[][] = [[...groups]];
  for (;;) {
    const last = rounds[rounds.length - 1];
    const keys = states.map((s, i) => `${last[i]}:${last[s.next[0]]},${last[s.next[1]]}`);
    const ids = [...new Set(keys)];
    const next = keys.map((k) => ids.indexOf(k));
    if (new Set(next).size === new Set(last).size) return rounds;
    rounds.push(next);
  }
}
/** A 7-state machine with redundant states, for the minimization animation. */
export const REDUCIBLE: MachineState[] = [
  { name: "A", next: [1, 2], out: 0 }, { name: "B", next: [3, 4], out: 0 }, { name: "C", next: [3, 4], out: 0 },
  { name: "D", next: [0, 5], out: 0 }, { name: "E", next: [0, 6], out: 0 }, { name: "F", next: [0, 5], out: 1 }, { name: "G", next: [0, 5], out: 1 },
];

// ── Timing ────────────────────────────────────────────────────────────────────
/** What a flip-flop captures when D changes at `edge` ns relative to the clock edge (negative: before it). */
export const captureResult = (edge: number, setup: number, hold: number) => (edge <= -setup ? "new" : edge >= hold ? "old" : "metastable");

/** One register-to-register path, in ns. skew > 0: the capturing clock arrives later. */
export function timingBudget(t: { clkToQ: number; logic: number; shortest: number; setup: number; hold: number; skew: number; period: number }) {
  const need = t.clkToQ + t.logic + t.setup - t.skew;
  return { need, setupSlack: t.period - need, fmaxMhz: 1000 / need, holdSlack: t.clkToQ + t.shortest - t.hold - t.skew };
}

/** How long a flip-flop stays undecided if D changed `delta` (a fraction of the rail) from the balance point. */
export const resolveTime = (delta: number, tau: number) => tau * Math.log(1 / delta);
/** Mean time between failures of a synchronizer with `settle` ns to resolve. Illustrative tau = 0.2 ns, T0 = 0.1 ns. */
export const mtbfSeconds = (settle: number, clockMhz: number, dataMhz: number) => Math.exp(settle / 0.2) / (0.1e-9 * clockMhz * 1e6 * dataMhz * 1e6);

// ── Memory and programmable logic ─────────────────────────────────────────────
export const memoryBits = (addressBits: number, width: number) => 2 ** addressBits * width;
export const chipsNeeded = (words: number, width: number, chipWords: number, chipWidth: number) => Math.ceil(words / chipWords) * Math.ceil(width / chipWidth);
/** DRAM: stored charge leaks away, and a refresh reads each cell and writes it back at full charge. */
export const dramLeak = (q: number[], rate: number) => q.map((v) => v * (1 - rate));
export const dramRefresh = (q: number[]) => q.map((v) => (v >= 0.5 ? 1 : 0));

/** A PLA: each product term connects to some of a, a', b, b', c, c'; each output ORs some terms. */
export interface Pla { and: number[][]; or: number[][] }
export const plaTerm = (cols: number[], inputs: number[]) => cols.length > 0 && cols.every((col) => (col % 2 ? inputs[col >> 1] ^ 1 : inputs[col >> 1]) === 1);
export const plaEval = (p: Pla, inputs: number[]) => p.or.map((terms) => (terms.some((r) => plaTerm(p.and[r], inputs)) ? 1 : 0));
const minterm = (m: number) => [0, 1, 2].map((i) => (i * 2) + (((m >> (2 - i)) & 1) ? 0 : 1));
/** The full adder from the decoder example, on a PLA: 7 terms, sharing m7 between the outputs. */
export const PLA_FULL_ADDER: Pla = { and: [1, 2, 4, 7, 3, 5, 6].map(minterm), or: [[0, 1, 2, 3], [4, 5, 6, 3]] };
export const lutRead = (bits: number[], inputs: number[]) => bits[inputs.reduce((n, b) => n * 2 + b, 0)];

// ── Analog and digital ────────────────────────────────────────────────────────
/** The frequency a sine of f appears to have when sampled at fs; signed, because the alias can run backwards. */
export const aliasFreq = (f: number, fs: number) => f - fs * Math.round(f / fs);
export const quantizeCode = (v: number, bits: number, vref: number) => Math.min(2 ** bits - 1, Math.floor((v / vref) * 2 ** bits));
export const snrDb = (bits: number) => 6.02 * bits + 1.76;
export const dacOut = (code: number, bits: number, vref: number) => (vref * code) / 2 ** bits;
export function sarSteps(vin: number, vref: number, bits: number) {
  const out: { bit: number; trial: number; volts: number; keep: boolean; code: number }[] = [];
  let code = 0;
  for (let bit = bits - 1; bit >= 0; bit--) {
    const trial = code | (1 << bit), volts = dacOut(trial, bits, vref), keep = vin >= volts;
    if (keep) code = trial;
    out.push({ bit, trial, volts, keep, code });
  }
  return out;
}

// ── Verilog ───────────────────────────────────────────────────────────────────
/** `a <= b; b <= a;` against `a = b; b = a;`: the two registers after each line. */
export function assignSteps(kind: "blocking" | "nonblocking", a: number, b: number) {
  return kind === "blocking"
    ? [{ a: b, b }, { a: b, b }, { a: b, b }]
    : [{ a, b }, { a, b }, { a: b, b: a }];
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
