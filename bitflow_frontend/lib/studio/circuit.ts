/**
 * lib/studio/circuit.ts — the circuit editor (/studio/circuit): parts and wires,
 * compiled to the board's gate netlist so lib/gate-sim.ts runs them live,
 * structural Verilog export, and a self-checking testbench.
 *
 * Wires carry a pin's width: 1 bit, or a bus up to 16 bits (hex inputs and
 * displays, constants, adders, comparators, registers, counters, splitters and
 * mergers; gates, NOT and MUX work bitwise at any width). A wire joins pins of the
 * same width. Every input pin has at most one driver (unconnected reads 0, an
 * enable reads 1); outputs fan out freely. Flip-flops start at 0. Testbenches
 * change one input at a time (a clock and its data never move at the same
 * instant, so Icarus can't race) and check every output after each change
 * against GateSim. Self-check: scripts/circuit.check.ts.
 */
import { type Bit, type BoardNetlist, GateSim, toNumber } from "../gate-sim";
import { nameProblem } from "./logic-min";

export type PartKind =
  | "switch" | "button" | "clock" | "hexin" | "const0" | "const1" | "const"
  | "not" | "and" | "or" | "xor" | "nand" | "nor" | "xnor" | "mux2"
  | "dff" | "tff" | "jkff" | "reg" | "counter"
  | "adder" | "cmp" | "decoder" | "split" | "merge"
  | "led" | "seg7" | "hexout";
/** w: width in bits (buses; a decoder's select width); value: a constant's value; n: gate inputs; reset: flip-flop reset pin. */
export interface Part { id: string; kind: PartKind; x: number; y: number; label: string; n?: number; reset?: boolean; w?: number; value?: number }
export interface PinRef { part: string; pin: string }
/** bend: where the user dragged the wire's middle run (x of the vertical run; y when it routes backwards). */
export interface Wire { id: string; from: PinRef; to: PinRef; bend?: number }
/** A text note on the canvas: no logic, exported as a comment. */
export interface Note { id: string; x: number; y: number; text: string }
export interface Circuit { module: string; parts: Part[]; wires: Wire[]; notes?: Note[] }
/** One input change, as the editor records it and the testbench replays it (a bus input's whole value). */
export interface InputEvent { port: string; value: number }

export const INPUT_KINDS: PartKind[] = ["switch", "button", "clock", "hexin"];
export const OUTPUT_KINDS: PartKind[] = ["led", "seg7", "hexout"];
const SEQUENTIAL: PartKind[] = ["dff", "tff", "jkff", "reg", "counter"];
const RESERVED = new Set(["errors", "dut"]);
export const MAX_WIDTH = 16;
const GATE_OPS: Record<string, { cell: string; last: string; op: string; invert: boolean }> = {
  and: { cell: "$_AND_", last: "$_AND_", op: "&", invert: false },
  or: { cell: "$_OR_", last: "$_OR_", op: "|", invert: false },
  xor: { cell: "$_XOR_", last: "$_XOR_", op: "^", invert: false },
  nand: { cell: "$_AND_", last: "$_NAND_", op: "&", invert: true },
  nor: { cell: "$_OR_", last: "$_NOR_", op: "|", invert: true },
  xnor: { cell: "$_XOR_", last: "$_XNOR_", op: "^", invert: true },
};

/** A part's width setting: 1..16 bits (a decoder: 1..4 select bits). */
export const width = (p: Part) => Math.max(1, Math.min(p.kind === "decoder" ? 4 : MAX_WIDTH, p.w ?? 1));
export const isSequential = (p: Part) => SEQUENTIAL.includes(p.kind);

export function pins(p: Part): { inputs: string[]; outputs: string[] } {
  const rst = p.reset ? ["rst"] : [];
  const bits = (prefix: string) => Array.from({ length: width(p) }, (_, i) => `${prefix}${i}`);
  switch (p.kind) {
    case "switch": case "button": case "clock": case "hexin": case "const0": case "const1": case "const": return { inputs: [], outputs: ["out"] };
    case "not": return { inputs: ["a"], outputs: ["y"] };
    case "mux2": return { inputs: ["d0", "d1", "s"], outputs: ["y"] };
    case "dff": return { inputs: ["d", "clk", ...rst], outputs: ["q"] };
    case "tff": return { inputs: ["t", "clk", ...rst], outputs: ["q"] };
    case "jkff": return { inputs: ["j", "k", "clk", ...rst], outputs: ["q"] };
    case "reg": return { inputs: ["d", "en", "clk", ...rst], outputs: ["q"] };
    case "counter": return { inputs: ["en", "clk", ...rst], outputs: ["q"] };
    case "adder": return { inputs: ["a", "b", "cin"], outputs: ["sum", "cout"] };
    case "cmp": return { inputs: ["a", "b"], outputs: ["eq", "lt", "gt"] };
    case "decoder": return { inputs: ["sel"], outputs: ["y"] };
    case "split": return { inputs: ["in"], outputs: bits("b") };
    case "merge": return { inputs: bits("b"), outputs: ["out"] };
    case "led": return { inputs: ["in"], outputs: [] };
    case "seg7": return { inputs: ["a", "b", "c", "d", "e", "f", "g"], outputs: [] };
    case "hexout": return { inputs: ["in"], outputs: [] };
    default: return { inputs: ["a", "b", "c", "d"].slice(0, Math.max(2, Math.min(4, p.n ?? 2))), outputs: ["y"] };
  }
}

/** Width of one pin in bits. */
export function pinWidth(p: Part, pin: string): number {
  const w = width(p);
  switch (p.kind) {
    case "hexin": case "hexout": case "const": case "not": case "and": case "or": case "xor": case "nand": case "nor": case "xnor":
      return w;
    case "mux2": return pin === "s" ? 1 : w;
    case "reg": return pin === "d" || pin === "q" ? w : 1;
    case "counter": return pin === "q" ? w : 1;
    case "adder": return pin === "a" || pin === "b" || pin === "sum" ? w : 1;
    case "cmp": return pin === "a" || pin === "b" ? w : 1;
    case "decoder": return pin === "sel" ? w : 2 ** w;
    case "split": return pin === "in" ? w : 1;
    case "merge": return pin === "out" ? w : 1;
    default: return 1;
  }
}

/** What an unconnected input reads: an enable reads 1 (always enabled), everything else 0. */
export const pinDefault = (_p: Part, pin: string) => (pin === "en" ? 1 : 0);

const key = (r: PinRef) => `${r.part}.${r.pin}`;
const isInput = (p: Part) => INPUT_KINDS.includes(p.kind);
const isOutput = (p: Part) => OUTPUT_KINDS.includes(p.kind);
export const inputParts = (c: Circuit) => c.parts.filter(isInput);
export const outputParts = (c: Circuit) => c.parts.filter(isOutput);
/** A port's width (bus inputs and outputs, 7 for a seven-segment display). */
export const portWidth = (p: Part) => (p.kind === "seg7" ? 7 : p.kind === "hexin" || p.kind === "hexout" ? width(p) : 1);
/** A number as `w` bits, LSB first. */
export const toBits = (v: number, w: number) => Array.from({ length: w }, (_, i) => Math.floor(v / 2 ** i) % 2);
/** A constant's value, kept inside its width. */
export const constValue = (p: Part) => Math.max(0, Math.floor(p.value ?? 0)) % 2 ** width(p);

export interface Compiled {
  net: BoardNetlist;
  /** The nets an output pin drives, LSB first (for colouring wires and showing bus values). */
  bitsOf: (r: PinRef) => Bit[] | undefined;
}

/** The circuit as the board's netlist: input/output parts become ports, everything else gate cells and flip-flops. */
export function compile(c: Circuit): Compiled {
  let next = 2;
  const fresh = (): Bit => next++;
  const outBits = new Map<string, Bit[]>();
  for (const p of c.parts) {
    for (const o of pins(p).outputs) {
      const w = pinWidth(p, o);
      outBits.set(`${p.id}.${o}`,
        p.kind === "const0" ? ["0"] : p.kind === "const1" ? ["1"]
        : p.kind === "const" ? toBits(constValue(p), w).map((b) => (b ? "1" : "0"))
        : Array.from({ length: w }, fresh));
    }
  }
  const driver = new Map(c.wires.map((w) => [key(w.to), w.from]));
  /** An input pin's nets: its driver's, if the widths agree (validate() reports a mismatch), else its default. */
  const inBits = (p: Part, pin: string): Bit[] => {
    const w = pinWidth(p, pin);
    const d = driver.get(`${p.id}.${pin}`);
    const src = d && outBits.get(key(d));
    return src && src.length === w ? src : Array(w).fill(pinDefault(p, pin) ? "1" : "0");
  };
  const cells: BoardNetlist["cells"] = [];
  const ports: BoardNetlist["ports"] = {};
  const cell = (type: string, conn: Record<string, Bit>, y: Bit = fresh()): Bit => {
    cells.push({ type, conn: { ...Object.fromEntries(Object.entries(conn).map(([k, v]) => [k, [v]])), Y: [y] } });
    return y;
  };
  const ff = (d: Bit, clk: Bit, q: Bit, rst?: Bit) => cells.push(rst !== undefined
    ? { type: "$_DFF_PP0_", conn: { C: [clk], D: [d], Q: [q], R: [rst] } }
    : { type: "$_DFF_P_", conn: { C: [clk], D: [d], Q: [q] } });

  for (const p of c.parts) {
    const out = (pin = pins(p).outputs[0]) => outBits.get(`${p.id}.${pin}`)!;
    const one = (pin: string) => inBits(p, pin)[0];
    const rst = p.reset ? one("rst") : undefined;
    const w = width(p);
    if (isInput(p)) { ports[p.label] = { direction: "input", bits: out() }; continue; }
    if (p.kind === "led" || p.kind === "hexout") { ports[p.label] = { direction: "output", bits: inBits(p, "in") }; continue; }
    if (p.kind === "seg7") { ports[p.label] = { direction: "output", bits: pins(p).inputs.map(one) }; continue; }
    switch (p.kind) {
      case "not": out().forEach((y, i) => cell("$_NOT_", { A: inBits(p, "a")[i] }, y)); break;
      case "mux2": out().forEach((y, i) => cell("$_MUX_", { A: inBits(p, "d0")[i], B: inBits(p, "d1")[i], S: one("s") }, y)); break;
      case "dff": ff(one("d"), one("clk"), out()[0], rst); break;
      case "tff": { const q = out()[0]; ff(cell("$_XOR_", { A: q, B: one("t") }), one("clk"), q, rst); break; }
      case "jkff": {
        const q = out()[0];
        const set = cell("$_ANDNOT_", { A: one("j"), B: q }), hold = cell("$_ANDNOT_", { A: q, B: one("k") });   // j&~q | ~k&q
        ff(cell("$_OR_", { A: set, B: hold }), one("clk"), q, rst);
        break;
      }
      case "reg": out().forEach((q, i) => ff(cell("$_MUX_", { A: q, B: inBits(p, "d")[i], S: one("en") }), one("clk"), q, rst)); break;
      case "counter": {
        let carry = one("en");                                           // q + en, a half-adder per bit
        for (const q of out()) {
          const sum = cell("$_XOR_", { A: q, B: carry });
          carry = cell("$_AND_", { A: q, B: carry });
          ff(sum, one("clk"), q, rst);
        }
        break;
      }
      case "adder": {
        const a = inBits(p, "a"), b = inBits(p, "b"), sum = out("sum");
        let carry = one("cin");                                          // ripple-carry full adders
        for (let i = 0; i < w; i++) {
          const x = cell("$_XOR_", { A: a[i], B: b[i] });
          cell("$_XOR_", { A: x, B: carry }, sum[i]);
          carry = cell("$_OR_", { A: cell("$_AND_", { A: a[i], B: b[i] }), B: cell("$_AND_", { A: x, B: carry }) });
        }
        cell("$_BUF_", { A: carry }, out("cout")[0]);
        break;
      }
      case "cmp": {
        const a = inBits(p, "a"), b = inBits(p, "b");
        let eq: Bit = "1", lt: Bit = "0", gt: Bit = "0";                 // LSB to MSB: a higher differing bit decides
        for (let i = 0; i < w; i++) {
          const same = cell("$_XNOR_", { A: a[i], B: b[i] });
          gt = cell("$_OR_", { A: cell("$_ANDNOT_", { A: a[i], B: b[i] }), B: cell("$_AND_", { A: same, B: gt }) });
          lt = cell("$_OR_", { A: cell("$_ANDNOT_", { A: b[i], B: a[i] }), B: cell("$_AND_", { A: same, B: lt }) });
          eq = cell("$_AND_", { A: eq, B: same });
        }
        cell("$_BUF_", { A: eq }, out("eq")[0]);
        cell("$_BUF_", { A: lt }, out("lt")[0]);
        cell("$_BUF_", { A: gt }, out("gt")[0]);
        break;
      }
      case "decoder": {
        const sel = inBits(p, "sel"), inv = sel.map((s) => cell("$_NOT_", { A: s }));
        out().forEach((y, k) => {
          const lits = sel.map((s, i) => ((k >> i) & 1 ? s : inv[i]));
          let acc = lits[0];
          for (let i = 1; i < lits.length; i++) acc = cell("$_AND_", { A: acc, B: lits[i] });
          cell("$_BUF_", { A: acc }, y);
        });
        break;
      }
      case "split": inBits(p, "in").forEach((b, i) => cell("$_BUF_", { A: b }, out(`b${i}`)[0])); break;
      case "merge": out().forEach((y, i) => cell("$_BUF_", { A: one(`b${i}`) }, y)); break;
      default: {
        const g = GATE_OPS[p.kind];
        if (!g) break;
        out().forEach((y, bit) => {
          const ins = pins(p).inputs.map((pin) => inBits(p, pin)[bit]);
          let acc = ins[0];
          for (let i = 1; i < ins.length; i++) {
            const last = i === ins.length - 1;
            acc = cell(last ? g.last : g.cell, { A: acc, B: ins[i] }, last ? y : fresh());
          }
        });
      }
    }
  }
  return { net: { ports, cells }, bitsOf: (r) => outBits.get(key(r)) };
}

export interface CircuitIssue { level: "error" | "warning"; msg: string; at?: string }

export function validate(c: Circuit): CircuitIssue[] {
  const out: CircuitIssue[] = [];
  const mp = nameProblem(c.module);
  if (mp) out.push({ level: "error", msg: `Module name "${c.module}" ${mp}.` });
  const seen = new Set<string>([c.module]);
  for (const p of c.parts) {
    if (p.kind === "const0" || p.kind === "const1") continue;
    const np = nameProblem(p.label);
    if (np) out.push({ level: "error", msg: `Label "${p.label}" ${np}.`, at: p.id });
    else if (RESERVED.has(p.label)) out.push({ level: "error", msg: `"${p.label}" is used by the testbench; pick another label.`, at: p.id });
    else if (seen.has(p.label)) out.push({ level: "error", msg: `"${p.label}" is used twice (labels become Verilog names).`, at: p.id });
    seen.add(p.label);
    // A multi-output part's pins become <label>_<pin> in the Verilog: those names must be free too
    if (pins(p).outputs.length > 1) for (const o of pins(p).outputs) seen.add(`${p.label}_${o}`);
  }
  const byId = new Map(c.parts.map((p) => [p.id, p]));
  for (const w of c.wires) {
    const a = byId.get(w.from.part), b = byId.get(w.to.part);
    if (!a || !b) continue;
    const wa = pinWidth(a, w.from.pin), wb = pinWidth(b, w.to.pin);
    if (wa !== wb) {
      out.push({ level: "error", msg: `${a.label}.${w.from.pin} is ${wa} bit${wa === 1 ? "" : "s"} but ${b.label}.${w.to.pin} takes ${wb}: use a splitter/merger or change a width.`, at: b.id });
    }
  }
  const driven = new Set(c.wires.map((w) => key(w.to)));
  for (const p of c.parts) {
    for (const pin of pins(p).inputs) {
      if (!driven.has(`${p.id}.${pin}`)) out.push({ level: "warning", msg: `${p.label}.${pin} isn't connected, so it reads ${pinDefault(p, pin)}.`, at: p.id });
    }
  }
  if (!inputParts(c).length) out.push({ level: "warning", msg: "No inputs: add a switch, button, clock or hex input." });
  if (!outputParts(c).length) out.push({ level: "warning", msg: "No outputs: add an LED, a hex display or a 7-segment display, so there is something to see and test." });
  if (!out.some((i) => i.level === "error")) {
    try { new GateSim(compile(c).net); } catch (e) { out.push({ level: "error", msg: (e as Error).message }); }
  }
  return out;
}

// ── Simulation helpers ───────────────────────────────────────────────────────

/** Every output's value at power-up and after each event (GateSim), as numbers (7-segment: bit 0 = segment a). */
export function expectedOutputs(c: Circuit, events: InputEvent[]): Record<string, number>[] {
  const sim = new GateSim(compile(c).net);
  const outs = outputParts(c);
  const widths = new Map(inputParts(c).map((p) => [p.label, portWidth(p)]));
  const read = () => Object.fromEntries(outs.map((p) => [p.label, toNumber(sim.get(p.label))]));
  const rows = [read()];
  for (const e of events) { sim.set(e.port, toBits(e.value, widths.get(e.port) ?? 1)); rows.push(read()); }
  return rows;
}

/** Deterministic pseudo-random numbers (testbenches must not change between clicks). */
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 2 ** 32);
}

export const MAX_EXHAUSTIVE_INPUTS = 10;

/**
 * Input changes for the testbench. Combinational circuits with at most 10 input bits:
 * a Gray-code walk (one input bit changes per step) through every combination.
 * Otherwise a random walk; with a clock, every other step toggles it.
 */
export function defaultEvents(c: Circuit, steps = 48, seed = 1): InputEvent[] {
  const ins = inputParts(c);
  if (!ins.length) return [];
  const sequential = c.parts.some(isSequential);
  const bits = ins.flatMap((p) => Array.from({ length: portWidth(p) }, (_, i) => ({ port: p.label, i })));
  const state = new Map(ins.map((p) => [p.label, 0]));
  if (!sequential && bits.length <= MAX_EXHAUSTIVE_INPUTS) {
    const events: InputEvent[] = [];
    for (let i = 1; i < 2 ** bits.length; i++) {
      const b = bits[Math.log2(i & -i)];                     // the Gray code flips the lowest set bit of i
      const v = state.get(b.port)! ^ (1 << b.i);
      state.set(b.port, v);
      events.push({ port: b.port, value: v });
    }
    return events;
  }
  const rand = rng(seed);
  const clock = ins.find((p) => p.kind === "clock");
  const data = ins.filter((p) => p !== clock);
  const events: InputEvent[] = [];
  for (let i = 0; i < steps; i++) {
    const pick = clock && (i % 2 === 1 || !data.length) ? clock : data[Math.floor(rand() * data.length)];
    const w = portWidth(pick), cur = state.get(pick.label)!;
    // A bus takes a new random value; a 1-bit input toggles
    const v = w === 1 ? cur ^ 1 : (cur + 1 + Math.floor(rand() * (2 ** w - 1))) % 2 ** w;
    state.set(pick.label, v);
    events.push({ port: pick.label, value: v });
  }
  return events;
}

// ── Verilog ──────────────────────────────────────────────────────────────────

const vec = (w: number) => (w > 1 ? `[${w - 1}:0] ` : "");
const lit = (w: number, v: number) => `${w}'d${v}`;
/** A part's signal for one output pin: its label, or <label>_<pin> when it has several outputs. */
const sig = (p: Part, pin: string) => (pins(p).outputs.length > 1 ? `${p.label}_${pin}` : p.label);

export function generateVerilog(c: Circuit): string {
  const byId = new Map(c.parts.map((p) => [p.id, p]));
  const driver = new Map(c.wires.map((w) => [key(w.to), w.from]));
  /** The expression an input pin reads: its driver's signal, a constant, or its default. */
  const src = (p: Part, pin: string) => {
    const d = driver.get(`${p.id}.${pin}`);
    const from = d && byId.get(d.part);
    if (!from || !d) return lit(pinWidth(p, pin), pinDefault(p, pin)).replace(/^1'd/, "1'b");
    return from.kind === "const0" ? "1'b0" : from.kind === "const1" ? "1'b1" : sig(from, d.pin);
  };
  const ports = [
    ...inputParts(c).map((p) => `    input  wire ${vec(portWidth(p))}${p.label}`),
    ...outputParts(c).map((p) => `    output wire ${vec(portWidth(p))}${p.label}`),
  ];
  const decls: string[] = [], body: string[] = [];
  const zero = (w: number) => (w === 1 ? "1'b0" : lit(w, 0));
  const always = (p: Part, next: string, cond = "") => {
    const clk = src(p, "clk"), q = p.label, r = p.reset ? src(p, "rst") : null;
    const update = `${cond ? `if (${cond}) ` : ""}${q} <= ${next};`;
    body.push(r ? `    always @(posedge ${clk} or posedge ${r}) if (${r}) ${q} <= ${zero(pinWidth(p, "q"))}; else ${update}`
                : `    always @(posedge ${clk}) ${update}`);
  };
  for (const p of c.parts) {
    const g = GATE_OPS[p.kind];
    if (isSequential(p)) decls.push(`    reg  ${vec(pinWidth(p, "q"))}${p.label} = ${zero(pinWidth(p, "q"))};`);
    else if (p.kind === "const") decls.push(`    wire ${vec(width(p))}${p.label} = ${lit(width(p), constValue(p))};`);
    else if (!isInput(p) && !isOutput(p) && p.kind !== "const0" && p.kind !== "const1") {
      for (const o of pins(p).outputs) decls.push(`    wire ${vec(pinWidth(p, o))}${sig(p, o)};`);
    }
    if (g) {
      const e = pins(p).inputs.map((pin) => src(p, pin)).join(` ${g.op} `);
      body.push(`    assign ${p.label} = ${g.invert ? `~(${e})` : e};`);
    } else if (p.kind === "not") body.push(`    assign ${p.label} = ~${src(p, "a")};`);
    else if (p.kind === "mux2") body.push(`    assign ${p.label} = ${src(p, "s")} ? ${src(p, "d1")} : ${src(p, "d0")};`);
    else if (p.kind === "dff") always(p, src(p, "d"));
    else if (p.kind === "tff") always(p, `${p.label} ^ ${src(p, "t")}`);
    else if (p.kind === "jkff") always(p, `(${src(p, "j")} & ~${p.label}) | (~${src(p, "k")} & ${p.label})`);
    else if (p.kind === "reg") always(p, src(p, "d"), src(p, "en") === "1'b1" ? "" : src(p, "en"));
    else if (p.kind === "counter") always(p, `${p.label} + 1'b1`, src(p, "en") === "1'b1" ? "" : src(p, "en"));
    else if (p.kind === "adder") body.push(`    assign {${sig(p, "cout")}, ${sig(p, "sum")}} = ${src(p, "a")} + ${src(p, "b")} + ${src(p, "cin")};`);
    else if (p.kind === "cmp") {
      body.push(`    assign ${sig(p, "eq")} = ${src(p, "a")} == ${src(p, "b")};`);
      body.push(`    assign ${sig(p, "lt")} = ${src(p, "a")} < ${src(p, "b")};`);
      body.push(`    assign ${sig(p, "gt")} = ${src(p, "a")} > ${src(p, "b")};`);
    } else if (p.kind === "decoder") body.push(`    assign ${p.label} = ${lit(2 ** width(p), 1)} << ${src(p, "sel")};`);
    else if (p.kind === "split") {
      body.push(`    assign {${[...pins(p).outputs].reverse().map((o) => sig(p, o)).join(", ")}} = ${src(p, "in")};`);
    } else if (p.kind === "merge") body.push(`    assign ${p.label} = {${[...pins(p).inputs].reverse().map((i) => src(p, i)).join(", ")}};`);
    else if (p.kind === "led" || p.kind === "hexout") body.push(`    assign ${p.label} = ${src(p, "in")};`);
    else if (p.kind === "seg7") body.push(`    assign ${p.label} = {${[...pins(p).inputs].reverse().map((pin) => src(p, pin)).join(", ")}};   // {g..a}`);
  }
  const notes = (c.notes ?? []).map((n) => n.text.trim()).filter(Boolean).map((t) => `// Note: ${t.replace(/\s*\n\s*/g, " ")}\n`).join("");
  return `// Generated by BitFlow Studio from a drawn circuit (structural Verilog).
${notes}module ${c.module} (
${ports.join(",\n")}
);
${decls.length ? `${decls.join("\n")}\n` : ""}
${body.join("\n")}
endmodule
`;
}

/** A testbench that starts with every input at 0, applies `events` 5 ns apart, and checks every output after each. */
export function generateTestbench(c: Circuit, events: InputEvent[]): string {
  const tb = `tb_${c.module}`;
  const outs = outputParts(c), ins = inputParts(c);
  const expected = expectedOutputs(c, events);
  const widths = new Map(ins.map((p) => [p.label, portWidth(p)]));
  const checks = (row: Record<string, number>, at: string) => outs.map((p) =>
    `        if (${p.label} !== ${lit(portWidth(p), row[p.label])}) begin $display("FAIL: ${at}: ${p.label} expected ${row[p.label]}, got %0d", ${p.label}); errors = errors + 1; end`);
  const lines = ["        #5;", ...checks(expected[0], "at start")];
  events.forEach((e, i) => {
    const w = widths.get(e.port) ?? 1;
    lines.push(`        ${e.port} = ${w === 1 ? `1'b${e.value}` : lit(w, e.value)}; #5;   // step ${i + 1}`);
    lines.push(...checks(expected[i + 1], `step ${i + 1} (${e.port}=${e.value})`));
  });
  const conns = [...ins, ...outs].map((p) => `.${p.label}(${p.label})`).join(", ");
  return `\`timescale 1ns / 1ps
// Generated by BitFlow Studio: every input starts at 0; ${events.length} single-input changes, each followed by a check of every output.
module ${tb};
${ins.map((p) => `    reg  ${vec(portWidth(p))}${p.label} = ${portWidth(p) === 1 ? "1'b0" : lit(portWidth(p), 0)};`).join("\n")}
${outs.map((p) => `    wire ${vec(portWidth(p))}${p.label};`).join("\n")}
    integer errors = 0;

    ${c.module} dut (${conns});

    initial begin
        $dumpfile("wave.vcd");
        $dumpvars(0, ${tb});
${lines.join("\n")}
        if (errors == 0) $display("ALL TESTS PASSED");
        else $display("TESTS FAILED: %0d error(s)", errors);
        $finish;
    end
endmodule
`;
}

// ── Examples ──────────────────────────────────────────────────────────────────

const part = (id: string, kind: PartKind, x: number, y: number, label: string, extra: Partial<Part> = {}): Part => ({ id, kind, x, y, label, ...extra });
const wire = (id: string, from: string, fromPin: string, to: string, toPin: string): Wire => ({ id, from: { part: from, pin: fromPin }, to: { part: to, pin: toPin } });

export const CIRCUIT_EXAMPLES: { label: string; circuit: Circuit }[] = [
  { label: "Half adder", circuit: { module: "half_adder", parts: [
    part("p1", "switch", 80, 120, "a"), part("p2", "switch", 80, 240, "b"),
    part("p3", "xor", 300, 120, "s_xor"), part("p4", "and", 300, 260, "c_and"),
    part("p5", "led", 520, 120, "sum"), part("p6", "led", 520, 260, "carry"),
  ], wires: [
    wire("w1", "p1", "out", "p3", "a"), wire("w2", "p2", "out", "p3", "b"),
    wire("w3", "p1", "out", "p4", "a"), wire("w4", "p2", "out", "p4", "b"),
    wire("w5", "p3", "y", "p5", "in"), wire("w6", "p4", "y", "p6", "in"),
  ] } },
  { label: "2:1 mux", circuit: { module: "mux2", parts: [
    part("p1", "switch", 80, 100, "d0"), part("p2", "switch", 80, 200, "d1"), part("p3", "switch", 80, 320, "sel"),
    part("p4", "mux2", 320, 180, "m"), part("p5", "led", 540, 180, "y"),
  ], wires: [
    wire("w1", "p1", "out", "p4", "d0"), wire("w2", "p2", "out", "p4", "d1"), wire("w3", "p3", "out", "p4", "s"),
    wire("w4", "p4", "y", "p5", "in"),
  ] } },
  { label: "2-bit counter", circuit: { module: "counter2", parts: [
    part("p1", "clock", 80, 300, "clk"), part("p2", "button", 80, 400, "rst"),
    part("p3", "not", 260, 120, "n0"), part("p4", "dff", 420, 140, "q0", { reset: true }),
    part("p5", "xor", 260, 260, "x1"), part("p6", "dff", 420, 300, "q1", { reset: true }),
    part("p7", "led", 640, 140, "led0"), part("p8", "led", 640, 300, "led1"),
  ], wires: [
    wire("w1", "p4", "q", "p3", "a"), wire("w2", "p3", "y", "p4", "d"), wire("w3", "p1", "out", "p4", "clk"), wire("w4", "p2", "out", "p4", "rst"),
    wire("w5", "p6", "q", "p5", "a"), wire("w6", "p4", "q", "p5", "b"), wire("w7", "p5", "y", "p6", "d"),
    wire("w8", "p1", "out", "p6", "clk"), wire("w9", "p2", "out", "p6", "rst"),
    wire("w10", "p4", "q", "p7", "in"), wire("w11", "p6", "q", "p8", "in"),
  ] } },
  { label: "Majority vote", circuit: { module: "majority", parts: [
    part("p1", "switch", 80, 100, "a"), part("p2", "switch", 80, 220, "b"), part("p3", "switch", 80, 340, "c"),
    part("p4", "and", 280, 80, "ab"), part("p5", "and", 280, 220, "bc"), part("p6", "and", 280, 360, "ac"),
    part("p7", "or", 480, 220, "maj", { n: 3 }), part("p8", "led", 660, 220, "y"),
  ], wires: [
    wire("w1", "p1", "out", "p4", "a"), wire("w2", "p2", "out", "p4", "b"),
    wire("w3", "p2", "out", "p5", "a"), wire("w4", "p3", "out", "p5", "b"),
    wire("w5", "p1", "out", "p6", "a"), wire("w6", "p3", "out", "p6", "b"),
    wire("w7", "p4", "y", "p7", "a"), wire("w8", "p5", "y", "p7", "b"), wire("w9", "p6", "y", "p7", "c"),
    wire("w10", "p7", "y", "p8", "in"),
  ] } },
  { label: "4-bit adder", circuit: { module: "add4", parts: [
    part("p1", "hexin", 80, 100, "a", { w: 4 }), part("p2", "hexin", 80, 240, "b", { w: 4 }), part("p3", "switch", 80, 360, "cin"),
    part("p4", "adder", 320, 160, "add", { w: 4 }),
    part("p5", "hexout", 540, 140, "sum", { w: 4 }), part("p6", "led", 540, 260, "carry"),
  ], wires: [
    wire("w1", "p1", "out", "p4", "a"), wire("w2", "p2", "out", "p4", "b"), wire("w3", "p3", "out", "p4", "cin"),
    wire("w4", "p4", "sum", "p5", "in"), wire("w5", "p4", "cout", "p6", "in"),
  ] } },
  { label: "Counter to display", circuit: { module: "count_hex", parts: [
    part("p1", "clock", 80, 160, "clk"), part("p2", "button", 80, 280, "rst"), part("p3", "switch", 80, 60, "en"),
    part("p4", "counter", 300, 140, "cnt", { w: 4, reset: true }),
    part("p5", "hexout", 520, 120, "value", { w: 4 }), part("p6", "cmp", 520, 260, "is9", { w: 4 }), part("p7", "const", 300, 320, "nine", { w: 4, value: 9 }),
    part("p8", "led", 720, 290, "at9"),
  ], wires: [
    wire("w1", "p3", "out", "p4", "en"), wire("w2", "p1", "out", "p4", "clk"), wire("w3", "p2", "out", "p4", "rst"),
    wire("w4", "p4", "q", "p5", "in"), wire("w5", "p4", "q", "p6", "a"), wire("w6", "p7", "out", "p6", "b"),
    wire("w7", "p6", "eq", "p8", "in"),
  ] } },
];
