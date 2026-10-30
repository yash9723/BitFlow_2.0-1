/**
 * lib/studio/circuit-challenges.ts — graded circuit-building tasks (/studio/challenges): the
 * allowed parts, a gate budget, and a spec checked against the student's circuit on GateSim.
 * Combinational specs are checked on every input row; sequential ones against a model over a
 * fixed random walk, clocked from power-up. The same grader runs in the browser for instant
 * feedback and on the server (POST /api/studio/challenges/[id]) before any XP.
 * The specs are public like the rest of the repo; worked solutions live in private/.
 * Self-check: scripts/circuit-challenges.check.ts.
 */
import { GateSim, toNumber } from "../gate-sim";
import { type Circuit, type Library, type PartKind, type Wire, compile, toBits, validate } from "./circuit";
import { flatPartCount, kindsUsed } from "./circuit-json";

export type Values = Record<string, number>;
export interface PortSpec { name: string; width?: number; clock?: boolean }
interface CombSpec { kind: "comb"; f: (i: Values) => Partial<Values> }
/** A model of the behaviour: starts at state 0; `next` is taken at each rising clock edge. */
interface SeqSpec { kind: "seq"; next: (state: number, i: Values) => number; out: (state: number) => Values }

export interface CircuitChallenge {
  id: string; title: string; level: "Beginner" | "Core" | "GATE"; xp: number;
  statement: string; hint: string;
  inputs: PortSpec[]; outputs: PortSpec[];
  /** The logic parts allowed. Inputs, outputs, wiring aids and blocks are always allowed. */
  parts: PartKind[];
  /** The most gates allowed, counted as 2-input gates: a 3-input AND is two. Flip-flops don't count. */
  budget: number;
  spec: CombSpec | SeqSpec;
}

export const FREE_PARTS: PartKind[] = ["switch", "button", "clock", "hexin", "const0", "const1", "const", "led", "hexout", "split", "merge", "probe", "tunin", "tunout", "block"];
export const LEVEL_XP = { Beginner: 15, Core: 25, GATE: 40 } as const;
const MAX_FLAT_PARTS = 400;
const SEQ_CYCLES = 400;
const SEGMENTS = [0x3f, 0x06, 0x5b, 0x4f, 0x66, 0x6d, 0x7d, 0x07, 0x7f, 0x6f];
const GATES: PartKind[] = ["not", "and", "or", "xor", "nand", "nor", "xnor"];
const ins = (...names: string[]): PortSpec[] => names.map((name) => ({ name }));
const CLK: PortSpec = { name: "clk", clock: true };

export const CHALLENGES: CircuitChallenge[] = [
  {
    id: "half-adder", title: "Half adder", level: "Beginner", xp: LEVEL_XP.Beginner, parts: ["xor", "and"], budget: 2,
    statement: "Add two bits. sum is the low bit of a + b, carry the high bit.",
    hint: "Write the truth table: sum is 1 when the inputs differ; carry when both are 1.",
    inputs: ins("a", "b"), outputs: ins("sum", "carry"),
    spec: { kind: "comb", f: ({ a, b }) => ({ sum: a ^ b, carry: a & b }) },
  },
  {
    id: "not-from-nand", title: "NOT from NAND", level: "Beginner", xp: LEVEL_XP.Beginner, parts: ["nand"], budget: 1,
    statement: "NAND is universal: every gate can be built from it. Start with the inverter. y is the opposite of a.",
    hint: "A pin's output can drive both inputs of a gate.",
    inputs: ins("a"), outputs: ins("y"),
    spec: { kind: "comb", f: ({ a }) => ({ y: a ^ 1 }) },
  },
  {
    id: "and-from-nand", title: "AND from NAND", level: "Beginner", xp: LEVEL_XP.Beginner, parts: ["nand"], budget: 2,
    statement: "Build y = a AND b from NAND gates alone.",
    hint: "NAND is AND followed by an inversion. Undo the inversion.",
    inputs: ins("a", "b"), outputs: ins("y"),
    spec: { kind: "comb", f: ({ a, b }) => ({ y: a & b }) },
  },
  {
    id: "or-from-nand", title: "OR from NAND", level: "Beginner", xp: LEVEL_XP.Beginner, parts: ["nand"], budget: 3,
    statement: "Build y = a OR b from NAND gates alone.",
    hint: "De Morgan: a + b = (a' · b')'.",
    inputs: ins("a", "b"), outputs: ins("y"),
    spec: { kind: "comb", f: ({ a, b }) => ({ y: a | b }) },
  },
  {
    id: "even-parity", title: "Even parity bit", level: "Beginner", xp: LEVEL_XP.Beginner, parts: ["xor"], budget: 3,
    statement: "p makes the number of 1s among a, b, c, d and p even, as a simple error check on a 4-bit word would.",
    hint: "XOR of two bits is 1 when an odd number of them are 1, and that keeps working as you chain XORs.",
    inputs: ins("a", "b", "c", "d"), outputs: ins("p"),
    spec: { kind: "comb", f: ({ a, b, c, d }) => ({ p: a ^ b ^ c ^ d }) },
  },
  {
    id: "t-from-d", title: "T flip-flop from D", level: "Beginner", xp: LEVEL_XP.Beginner, parts: ["dff", "xor"], budget: 1,
    statement: "On each rising clock edge q toggles if t is 1 and holds if t is 0. Use a D flip-flop.",
    hint: "The next state is q XOR t.",
    inputs: [{ name: "t" }, CLK], outputs: ins("q"),
    spec: { kind: "seq", next: (s, { t }) => s ^ t, out: (s) => ({ q: s }) },
  },
  {
    id: "xor-from-nand", title: "XOR from four NANDs", level: "Core", xp: LEVEL_XP.Core, parts: ["nand"], budget: 4,
    statement: "Build y = a XOR b from at most four NAND gates. The obvious way takes five.",
    hint: "Let n = (ab)'. Then y = ((a·n)' · (b·n)')'. One gate is shared.",
    inputs: ins("a", "b"), outputs: ins("y"),
    spec: { kind: "comb", f: ({ a, b }) => ({ y: a ^ b }) },
  },
  {
    id: "full-adder-nand", title: "Full adder from NAND", level: "Core", xp: LEVEL_XP.Core, parts: ["nand"], budget: 9,
    statement: "Add three bits: a + b + cin gives sum and cout, using at most nine NAND gates.",
    hint: "Two four-NAND XORs chained, sharing their middle gates; cout takes one more NAND.",
    inputs: ins("a", "b", "cin"), outputs: ins("sum", "cout"),
    spec: { kind: "comb", f: ({ a, b, cin }) => ({ sum: a ^ b ^ cin, cout: (a & b) | (cin & (a ^ b)) }) },
  },
  {
    id: "mux4-gates", title: "4:1 multiplexer from gates", level: "Core", xp: LEVEL_XP.Core, parts: ["not", "and", "or"], budget: 13,
    statement: "y follows d0 to d3, chosen by the select lines: s1 s0 = 00 picks d0, 11 picks d3.",
    hint: "One 3-input AND per data line, enabled by its select pattern, all ORed. A 3-input AND counts as two gates and a 4-input OR as three.",
    inputs: ins("d0", "d1", "d2", "d3", "s1", "s0"), outputs: ins("y"),
    spec: { kind: "comb", f: ({ d0, d1, d2, d3, s1, s0 }) => ({ y: [d0, d1, d2, d3][2 * s1 + s0] }) },
  },
  {
    id: "comparator-2bit", title: "2-bit comparator", level: "Core", xp: LEVEL_XP.Core, parts: GATES, budget: 12,
    statement: "Compare two unsigned 2-bit numbers: exactly one of gt, eq and lt is 1.",
    hint: "Compare from the top bit: a is greater if a1 > b1, or the top bits match and a0 > b0. Once you have two of the outputs, the third is a NOR of them.",
    inputs: [{ name: "a", width: 2 }, { name: "b", width: 2 }], outputs: ins("gt", "eq", "lt"),
    spec: { kind: "comb", f: ({ a, b }) => ({ gt: +(a > b), eq: +(a === b), lt: +(a < b) }) },
  },
  {
    id: "ripple-adder-4", title: "4-bit ripple-carry adder", level: "Core", xp: LEVEL_XP.Core, parts: ["xor", "and", "or"], budget: 20,
    statement: "Add two 4-bit numbers and a carry in. Split the buses into bits, chain four full adders, and merge the sum.",
    hint: "A full adder is five gates. Make one, press Ctrl+G to turn it into a block, and place four: a block's gates are still counted.",
    inputs: [{ name: "a", width: 4 }, { name: "b", width: 4 }, { name: "cin" }], outputs: [{ name: "sum", width: 4 }, { name: "cout" }],
    spec: { kind: "comb", f: ({ a, b, cin }) => { const t = a + b + cin; return { sum: t & 15, cout: t >> 4 }; } },
  },
  {
    id: "jk-from-d", title: "JK flip-flop from D", level: "Core", xp: LEVEL_XP.Core, parts: ["dff", "not", "and", "or"], budget: 5,
    statement: "On each rising edge: j k = 00 holds, 01 resets, 10 sets, 11 toggles.",
    hint: "The characteristic equation: next q = j·q' + k'·q.",
    inputs: [{ name: "j" }, { name: "k" }, CLK], outputs: ins("q"),
    spec: { kind: "seq", next: (s, { j, k }) => (j & (s ^ 1)) | ((k ^ 1) & s), out: (s) => ({ q: s }) },
  },
  {
    id: "mod6-counter", title: "Mod-6 counter", level: "Core", xp: LEVEL_XP.Core, parts: ["dff", ...GATES], budget: 8,
    statement: "q counts 0, 1, 2, 3, 4, 5 and back to 0, one step per rising clock edge. It starts at 0.",
    hint: "Three flip-flops. Tabulate each next-state bit for the six states, treat 6 and 7 as don't-cares, and use the K-map tool to minimize them.",
    inputs: [CLK], outputs: [{ name: "q", width: 3 }],
    spec: { kind: "seq", next: (s) => (s + 1) % 6, out: (s) => ({ q: s }) },
  },
  {
    id: "bcd-7seg", title: "BCD to 7-segment", level: "GATE", xp: LEVEL_XP.GATE, parts: GATES, budget: 36,
    statement: "Drive segments a to g for the digit on bcd, 0 to 9. Inputs 10 to 15 never occur, so use them as don't-cares. 6 and 9 have their tails, and 7 is a, b, c.",
    hint: "Put each segment in the K-map tool with 10 to 15 as X. Several segments share terms: build a shared term once.",
    inputs: [{ name: "bcd", width: 4 }], outputs: ins("a", "b", "c", "d", "e", "f", "g"),
    spec: { kind: "comb", f: ({ bcd }) => {
      if (bcd > 9) return {};
      const bit = (i: number) => (SEGMENTS[bcd] >> i) & 1;
      return { a: bit(0), b: bit(1), c: bit(2), d: bit(3), e: bit(4), f: bit(5), g: bit(6) };
    } },
  },
  {
    id: "traffic-light", title: "Traffic light", level: "GATE", xp: LEVEL_XP.GATE, parts: ["dff", ...GATES], budget: 3,
    statement: "Exactly one of green, yellow and red is on. It starts green, then each rising clock edge moves green to yellow to red to green.",
    hint: "Three states fit in two flip-flops, and power-up (all 0) must be green. Pick an encoding where the outputs are nearly the state bits.",
    inputs: [CLK], outputs: ins("green", "yellow", "red"),
    spec: { kind: "seq", next: (s) => (s + 1) % 3, out: (s) => ({ green: +(s === 0), yellow: +(s === 1), red: +(s === 2) }) },
  },
  {
    id: "detect-101", title: "101 sequence detector", level: "GATE", xp: LEVEL_XP.GATE, parts: ["dff", ...GATES], budget: 8,
    statement: "Watch the serial input x, sampled on each rising clock edge. After an edge, y is 1 exactly when the last three bits sampled were 1, 0, 1; overlaps count, so 10101 gives two hits. This is a Moore machine: y doesn't change with x between edges.",
    hint: "Four states: nothing, saw 1, saw 10, saw 101. Draw it in the FSM designer first. With a good encoding one flip-flop is just x, delayed.",
    inputs: [{ name: "x" }, CLK], outputs: ins("y"),
    spec: { kind: "seq",
      next: (s, { x }) => [[0, 1], [2, 1], [0, 3], [2, 1]][s][x],
      out: (s) => ({ y: +(s === 3) }) },
  },
];

export const challengeById = (id: string) => CHALLENGES.find((c) => c.id === id);
export const challengeKey = (id: string) => `bitflow_challenge_${id}`;
const moduleOf = (ch: CircuitChallenge) => ch.id.replace(/-/g, "_");

/** The circuit a challenge starts from: its inputs on the left, outputs on the right, nothing between. */
export function starterCircuit(ch: CircuitChallenge): Circuit {
  const parts: Circuit["parts"] = [];
  ch.inputs.forEach((p, i) => parts.push({ id: `in_${p.name}`, label: p.name, x: 60, y: 60 + i * 70,
    ...(p.clock ? { kind: "clock" as const } : (p.width ?? 1) > 1 ? { kind: "hexin" as const, w: p.width } : { kind: "switch" as const }) }));
  ch.outputs.forEach((p, i) => parts.push({ id: `out_${p.name}`, label: p.name, x: 640, y: 60 + i * 70,
    ...((p.width ?? 1) > 1 ? { kind: "hexout" as const, w: p.width } : { kind: "led" as const }) }));
  return { module: moduleOf(ch), parts, wires: [] as Wire[], notes: [] };
}

export interface Grade {
  ok: boolean;
  /** Why it failed: the circuit's shape or size, in words. Null for a failing test or a pass. */
  reason: string | null;
  /** Gates used, counted as 2-input gates. Null if it couldn't be compiled. */
  gates: number | null;
  /** The first input where the outputs were wrong. */
  failing?: { step: string; inputs: Values; wrong: { name: string; expected: number; got: number }[] };
  /** Works, but over the gate budget. */
  overBudget?: boolean;
}

/** Deterministic pseudo-random bits, so the browser and the server test the same walk. */
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return (s >>> 16) / 65536; };
}

export function gradeCircuit(ch: CircuitChallenge, c: Circuit, lib: Library = c.blocks ?? {}): Grade {
  const fail = (reason: string, gates: number | null = null): Grade => ({ ok: false, reason, gates });
  const allowed = new Set<PartKind>([...ch.parts, ...FREE_PARTS]);
  const banned = [...kindsUsed(c, lib)].filter((k) => !allowed.has(k));
  if (banned.length) return fail(`This challenge doesn't allow ${banned.join(", ")}. You can use: ${ch.parts.join(", ")}.`);
  if (flatPartCount(c, lib) > MAX_FLAT_PARTS) return fail(`That is more than ${MAX_FLAT_PARTS} parts with its blocks expanded.`);

  const issues = validate(c, lib).filter((i) => i.level === "error");
  if (issues.length) return fail(issues[0].msg);
  let net, sim: GateSim;
  try { net = compile(c, lib).net; sim = new GateSim(net); } catch (e) { return fail((e as Error).message); }

  for (const [list, direction] of [[ch.inputs, "input"], [ch.outputs, "output"]] as const) {
    for (const p of list) {
      const port = net.ports[p.name], want = p.width ?? 1;
      if (!port || port.direction !== direction) return fail(`It needs an ${direction} labelled ${p.name}.`);
      if (port.bits.length !== want) return fail(`${p.name} must be ${want} bit${want === 1 ? "" : "s"} wide, but it is ${port.bits.length}.`);
    }
  }
  const gates = net.cells.filter((x) => x.type !== "$_BUF_" && !x.type.startsWith("$_DFF")).length;
  const put = (name: string, v: number, w = 1) => sim.set(name, toBits(v, w));
  const data = ch.inputs.filter((p) => !p.clock);
  const compare = (want: Partial<Values>) => Object.entries(want).flatMap(([name, expected]) => {
    const got = toNumber(sim.get(name));
    return got === expected ? [] : [{ name, expected: expected as number, got }];
  });

  if (ch.spec.kind === "comb") {
    const bits = data.reduce((n, p) => n + (p.width ?? 1), 0);
    for (let row = 0; row < 2 ** bits; row++) {
      const inputs: Values = {};
      let shift = bits;
      for (const p of data) {
        const w = p.width ?? 1;
        shift -= w;
        inputs[p.name] = Math.floor(row / 2 ** shift) % 2 ** w;
        put(p.name, inputs[p.name], w);
      }
      const wrong = compare(ch.spec.f(inputs));
      if (wrong.length) return { ok: false, reason: null, gates, failing: { step: "With these inputs", inputs, wrong } };
    }
  } else {
    const clk = ch.inputs.find((p) => p.clock)!.name, rand = rng(0x5eed);
    let state = 0;
    const inputs: Values = Object.fromEntries(data.map((p) => [p.name, 0]));
    const before = compare(ch.spec.out(0));
    if (before.length) return { ok: false, reason: null, gates, failing: { step: "At power-up, before any clock edge", inputs: { ...inputs }, wrong: before } };
    for (let cycle = 1; cycle <= SEQ_CYCLES; cycle++) {
      for (const p of data) { inputs[p.name] = Math.floor(rand() * 2 ** (p.width ?? 1)); put(p.name, inputs[p.name], p.width ?? 1); }
      const moved = compare(ch.spec.out(state));
      if (moved.length) return { ok: false, reason: null, gates, failing: { step: `Before clock edge ${cycle}, the inputs alone changed the output`, inputs: { ...inputs }, wrong: moved } };
      state = ch.spec.next(state, inputs);
      put(clk, 1);
      const wrong = compare(ch.spec.out(state));
      put(clk, 0);
      const after = wrong.length ? wrong : compare(ch.spec.out(state));
      if (after.length) return { ok: false, reason: null, gates, failing: { step: wrong.length ? `After clock edge ${cycle}` : `After clock edge ${cycle}, when the clock fell`, inputs: { ...inputs }, wrong: after } };
    }
  }
  if (gates > ch.budget) return { ok: false, reason: null, gates, overBudget: true };
  return { ok: true, reason: null, gates };
}
