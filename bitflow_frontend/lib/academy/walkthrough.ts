/**
 * lib/academy/walkthrough.ts — the logic behind the Academy's code walkthroughs (components/academy/anim/Walkthrough.tsx):
 * a small Verilog module, stepped one event at a time, with the lines that run, the value of every signal and a sentence
 * for each step. Nothing here is typed in by hand per step: a model of the module produces the values (and, for the
 * drawn circuit, the real circuit engine does), and scripts/walkthrough.check.ts runs the same Verilog in a simulator
 * and compares. Kept apart from the drawing so it can be tested.
 */
import { CIRCUIT_EXAMPLES, type Circuit, expectedOutputs, generateVerilog } from "@/lib/studio/circuit";

export const WALK_IDS = ["walk-assign-gates", "walk-mux-always", "walk-register", "walk-counter", "walk-fsm-101"] as const;
export type WalkId = (typeof WALK_IDS)[number];

/** -1 is "x": a register nobody has written yet. */
export const X = -1;

export interface WalkSignal {
  name: string;
  bits: number;
  /** "in" signals are driven by the reader's story, "out" ones come from the module. */
  dir: "in" | "out" | "state";
  /** Show these names instead of numbers (a state machine's states). */
  names?: string[];
  radix?: "bin" | "dec";
}
export interface WalkStep {
  /** Zero-based lines of `code` that run in this step. */
  lines: number[];
  /** Value of every signal after this step. */
  values: Record<string, number>;
  caption: string;
}
export interface Walk {
  title: string;
  hint: string;
  code: string[];
  signals: WalkSignal[];
  steps: WalkStep[];
  /** "levels": each step sets the inputs and looks at the outputs. "edges": each step is one rising clock edge. */
  style: "levels" | "edges";
  /** What the checker feeds the real simulator, one entry per step. */
  stimulus: Record<string, number>[];
  /** Signals read just before the clock edge of the step, not after (a Mealy output depends on the state it started in). */
  sampleBefore?: string[];
}

const show = (s: WalkSignal, v: number) =>
  v === X ? "x" : s.names ? (s.names[v] ?? String(v)) : s.bits > 1 && s.radix !== "dec" ? v.toString(2).padStart(s.bits, "0") : String(v);
export const formatValue = show;

// ── always @*: a multiplexer ──────────────────────────────────────────────────
const MUX_CODE = [
  "module mux2(input a, input b, input sel, output reg y);",
  "  always @* begin",
  "    if (sel) y = b;",
  "    else     y = a;",
  "  end",
  "endmodule",
];
const MUX_FRAMES: { a: number; b: number; sel: number; changed: string }[] = [
  { a: 0, b: 1, sel: 0, changed: "" },
  { a: 0, b: 1, sel: 1, changed: "sel" },
  { a: 0, b: 0, sel: 1, changed: "b" },
  { a: 1, b: 0, sel: 1, changed: "a" },
  { a: 1, b: 0, sel: 0, changed: "sel" },
];
export function muxWalk(): Walk {
  const steps = MUX_FRAMES.map((f, i): WalkStep => {
    const y = f.sel ? f.b : f.a, before = i ? MUX_FRAMES[i - 1] : null;
    const prevY = before ? (before.sel ? before.b : before.a) : null;
    const picked = f.sel ? "b" : "a";
    const caption = i === 0
      ? `Time zero: a = ${f.a}, b = ${f.b}, sel = ${f.sel}. The block runs once to start. sel is 0, so the else branch runs and y = a = ${y}.`
      : `${f.changed} changed, and ${f.changed} is in the block's sensitivity list (@* means "every signal read inside"), so the block runs again. sel is ${f.sel}, so y = ${picked} = ${y}. ${prevY === y ? "y didn't change." : `y changed from ${prevY} to ${y}.`}`;
    return { lines: [1, f.sel ? 2 : 3], values: { a: f.a, b: f.b, sel: f.sel, y }, caption };
  });
  return {
    title: "An always @* block: a multiplexer", style: "levels", code: MUX_CODE, steps,
    hint: "Step through five changes to the inputs. Each one wakes the block, and the highlighted lines are the ones that run.",
    signals: [{ name: "a", bits: 1, dir: "in" }, { name: "b", bits: 1, dir: "in" }, { name: "sel", bits: 1, dir: "in" }, { name: "y", bits: 1, dir: "out" }],
    stimulus: MUX_FRAMES.map(({ a, b, sel }) => ({ a, b, sel })),
  };
}

// ── always @(posedge clk): a register with a synchronous reset ────────────────
const REG_CODE = [
  "module reg1(input clk, input rst, input d, output reg q);",
  "  always @(posedge clk) begin",
  "    if (rst) q <= 1'b0;",
  "    else     q <= d;",
  "  end",
  "endmodule",
];
const REG_FRAMES: { clk: number; rst: number; d: number }[] = [
  { clk: 0, rst: 0, d: 1 }, { clk: 1, rst: 0, d: 1 }, { clk: 0, rst: 0, d: 0 }, { clk: 1, rst: 0, d: 0 },
  { clk: 0, rst: 0, d: 1 }, { clk: 1, rst: 1, d: 1 }, { clk: 0, rst: 0, d: 1 }, { clk: 1, rst: 0, d: 1 },
];
export function registerWalk(): Walk {
  let q = X;
  const steps = REG_FRAMES.map((f, i): WalkStep => {
    const prev = i ? REG_FRAMES[i - 1] : { clk: 0, rst: 0, d: 0 }, edge = prev.clk === 0 && f.clk === 1, was = q;
    if (edge) q = f.rst ? 0 : f.d;
    const caption = i === 0
      ? "Nothing has happened yet. d = 1, but there has been no clock edge, so q has never been written and is unknown (x)."
      : edge
        ? f.rst
          ? `clk just rose, so the block runs. rst is 1, so q <= 0, whatever d is. Reset wins because it is checked first.`
          : `clk just rose, so the block runs. rst is 0, so q <= d. d is ${f.d}, so q becomes ${q}${was === q ? " (it was already " + q + ")" : ""}.`
        : f.clk === 0 && prev.clk === 1
          ? `clk fell. posedge means only rising edges count, so the block does not run. q holds ${q}.`
          : `d is ${f.d} now, but there is no clock edge, so nothing runs. q keeps ${q}: a register only looks at d at the edge.`;
    return { lines: edge ? [1, f.rst ? 2 : 3] : [], values: { clk: f.clk, rst: f.rst, d: f.d, q }, caption };
  });
  return {
    title: "A register: always @(posedge clk)", style: "levels", code: REG_CODE, steps,
    hint: "q changes only when clk rises. Watch d change in between without q following it.",
    signals: [{ name: "clk", bits: 1, dir: "in" }, { name: "rst", bits: 1, dir: "in" }, { name: "d", bits: 1, dir: "in" }, { name: "q", bits: 1, dir: "out" }],
    stimulus: REG_FRAMES.map((f) => ({ ...f })),
  };
}

// ── a 4-bit counter ───────────────────────────────────────────────────────────
const COUNTER_CODE = [
  "module counter(input clk, input rst, output reg [3:0] count);",
  "  always @(posedge clk) begin",
  "    if (rst) count <= 4'd0;",
  "    else     count <= count + 1'b1;",
  "  end",
  "endmodule",
];
const COUNTER_RST = [0, 1, ...Array(17).fill(0)] as number[];   // first step: no reset yet, second: reset, then 17 counting edges
export function counterWalk(): Walk {
  let count = X;
  const steps = COUNTER_RST.map((rst, i): WalkStep => {
    if (i === 0) return { lines: [], values: { rst: 0, count: X }, caption: "Before the first clock edge, count has never been written, so it is unknown (x). A counter needs a reset to start from a known value." };
    const was = count;
    count = rst ? 0 : (count + 1) % 16;
    const caption = rst
      ? "A clock edge with rst = 1: count <= 0. Now it has a known value."
      : was === 15
        ? "count was 15 (1111). Adding 1 gives 16, which needs five bits, but count has four, so it wraps to 0000. Nothing is lost or flagged: the top bit just doesn't exist."
        : `A clock edge with rst = 0: count <= count + 1, so ${was} becomes ${count}.`;
    return { lines: [1, rst ? 2 : 3], values: { rst, count }, caption };
  });
  return {
    title: "A 4-bit counter", style: "edges", code: COUNTER_CODE, steps,
    hint: "Each step is one rising clock edge. Keep stepping past 15 to see what four bits can't hold.",
    signals: [{ name: "rst", bits: 1, dir: "in" }, { name: "count", bits: 4, dir: "out" }],
    stimulus: COUNTER_RST.map((rst) => ({ rst })),
  };
}

// ── a 101 sequence detector ───────────────────────────────────────────────────
const FSM_CODE = [
  "module det101(input clk, input rst, input x, output z);",
  "  reg [1:0] state;",
  "  localparam S0 = 2'd0, S1 = 2'd1, S2 = 2'd2;",
  "  always @(posedge clk) begin",
  "    if (rst) state <= S0;",
  "    else case (state)",
  "      S0: state <= x ? S1 : S0;",
  "      S1: state <= x ? S1 : S2;",
  "      S2: state <= x ? S1 : S0;",
  "    endcase",
  "  end",
  "  assign z = (state == S2) & x;",
  "endmodule",
];
export const FSM_STATES = ["S0", "S1", "S2"];
/** The bits fed in, one per clock edge (the first edge also has rst = 1). */
export const FSM_INPUT = [1, 0, 1, 0, 1, 1, 0, 0];
export function fsmWalk(): Walk {
  let state = X;
  const stim: Record<string, number>[] = [{ rst: 1, x: 0 }, ...FSM_INPUT.map((x) => ({ rst: 0, x }))];
  const meaning = ["no part of 101 seen", "seen 1", "seen 10"];
  const steps = stim.map(({ rst, x }, i): WalkStep => {
    if (rst) { state = 0; return { lines: [3, 4], values: { rst, x, z: 0, state }, caption: "A clock edge with rst = 1: the machine goes to S0, where it has seen nothing of the pattern yet." }; }
    const was = state, z = was === 2 && x ? 1 : 0;
    const next = was === 0 ? (x ? 1 : 0) : was === 1 ? (x ? 1 : 2) : x ? 1 : 0;
    state = next;
    const line = 6 + was;
    const caption = `Input bit ${x}. The machine was in ${FSM_STATES[was]} (${meaning[was]}), so it goes to ${FSM_STATES[next]}. ${z ? "z = 1: state was S2 and x is 1, so the last three bits were 1, 0, 1. The final 1 can also start the next pattern, which is why S2 with x = 1 goes to S1, not S0." : "z stays 0."}`;
    return { lines: [3, 5, line, 11], values: { rst, x, z, state }, caption };
  });
  return {
    title: "A finite state machine: detecting 101", style: "edges", code: FSM_CODE, steps,
    hint: "Each step is one clock edge with one input bit. z goes high when the last three bits were 1, 0, 1, even if patterns overlap.",
    signals: [{ name: "rst", bits: 1, dir: "in" }, { name: "x", bits: 1, dir: "in" }, { name: "z", bits: 1, dir: "out" }, { name: "state", bits: 2, dir: "state", names: FSM_STATES }],
    stimulus: stim, sampleBefore: ["z"],
  };
}

// ── a drawn circuit and the Verilog it becomes ────────────────────────────────
export interface CircuitWalk extends Walk { circuit: Circuit; forced: Record<string, number>[] }
const HALF_ADDER_ORDER: [number, number][] = [[0, 0], [0, 1], [1, 1], [1, 0]];   // one input changes per step
/** Lines of the generated module that belong to a part: its port declaration, or the assign that drives its name. */
export function partLines(code: string[], label: string): number[] {
  const out: number[] = [];
  code.forEach((l, i) => { const t = l.trim(); if (t.startsWith(`assign ${label} =`) || /^(input|output)\s+wire\s+(\[[^\]]*\]\s*)?/.test(t) && new RegExp(`\\b${label}\\b,?$`).test(t)) out.push(i); });
  return out;
}
export function halfAdderWalk(): CircuitWalk {
  const circuit = CIRCUIT_EXAMPLES.find((e) => e.label === "Half adder")!.circuit;
  const code = generateVerilog(circuit).split("\n").filter((l) => l.trim() !== "" && !l.startsWith("//"));
  const events = HALF_ADDER_ORDER.slice(1).flatMap(([a, b], i) => {
    const [pa, pb] = HALF_ADDER_ORDER[i];
    return [...(a !== pa ? [{ port: "a", value: a }] : []), ...(b !== pb ? [{ port: "b", value: b }] : [])];
  });
  const rows = expectedOutputs(circuit, events);          // the real circuit engine: one row before the first event, then one per event
  const steps = HALF_ADDER_ORDER.map(([a, b], i): WalkStep => {
    const out = rows[i];
    const prev = i ? HALF_ADDER_ORDER[i - 1] : null;
    const moved = prev ? (a !== prev[0] ? "a" : "b") : "";
    // Step 0 shows every line. After that, only the input that moved and the lines whose value changed.
    const nets = (x: number, y: number, o: Record<string, number>) => ({ s_xor: x ^ y, c_and: x & y, sum: o.sum, carry: o.carry });
    const now = nets(a, b, out), was = prev ? nets(prev[0], prev[1], rows[i - 1]) : null;
    const lines = (moved ? [moved] : ["a", "b", "s_xor", "c_and", "sum", "carry"])
      .concat(was ? (Object.keys(now) as (keyof typeof now)[]).filter((k) => now[k] !== was[k]) : [])
      .flatMap((label) => partLines(code, label)).sort((x, y) => x - y);
    const caption = i === 0
      ? `Both inputs are 0. XOR (different?) gives 0 and AND (both 1?) gives 0, so sum = 0 and carry = 0.`
      : `${moved} changed to ${moved === "a" ? a : b}, so a = ${a} and b = ${b}. s_xor = a ^ b = ${a ^ b} and c_and = a & b = ${a & b}, so sum = ${out.sum} and carry = ${out.carry}.${a && b ? " This is 1 + 1 = 10 in binary: sum 0, carry 1." : ""}`;
    return { lines, values: { a, b, sum: out.sum, carry: out.carry }, caption };
  });
  return {
    title: "From gates to Verilog: a half adder", style: "levels", circuit, code, steps,
    hint: "The circuit and its generated Verilog change together. Each step flips one input and the lines that depend on it light up.",
    signals: [{ name: "a", bits: 1, dir: "in" }, { name: "b", bits: 1, dir: "in" }, { name: "sum", bits: 1, dir: "out" }, { name: "carry", bits: 1, dir: "out" }],
    stimulus: HALF_ADDER_ORDER.map(([a, b]) => ({ a, b })),
    forced: HALF_ADDER_ORDER.map(([a, b]) => ({ a, b })),
  };
}

export const WALKS: Record<WalkId, () => Walk> = {
  "walk-assign-gates": halfAdderWalk,
  "walk-mux-always": muxWalk,
  "walk-register": registerWalk,
  "walk-counter": counterWalk,
  "walk-fsm-101": fsmWalk,
};
