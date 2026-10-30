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
 *
 * Tri-state buffers and buses: GateSim has no Z level, so a bus is the OR of (en & d) of
 * its drivers, in the simulator and in the Verilog alike. busConflicts() reports two
 * drivers enabled at once, which on real wires would be a short.
 * ponytail: no Z or X level; a bus with no driver enabled reads 0, not floating.
 */
import { type Bit, type BoardNetlist, GateSim, toNumber } from "../gate-sim";
import { nameProblem } from "./logic-min";

export type PartKind =
  | "switch" | "button" | "clock" | "hexin" | "const0" | "const1" | "const"
  | "not" | "and" | "or" | "xor" | "nand" | "nor" | "xnor" | "mux2"
  | "dff" | "tff" | "jkff" | "reg" | "counter"
  | "adder" | "cmp" | "decoder" | "split" | "merge"
  | "mux" | "demux" | "encoder" | "priority" | "bcd7" | "alu" | "shift" | "rom" | "ram" | "keypad" | "probe" | "tri" | "bus"
  | "led" | "seg7" | "hexout"
  | "block";
/** A block's pins: its definition's inputs and outputs (switch/hex-input and LED/display parts), by label. */
export interface BlockPorts { inputs: { name: string; width: number }[]; outputs: { name: string; width: number }[] }
/**
 * w: width in bits (buses; a decoder's select width); value: a constant's value; n: gate inputs; reset: flip-flop reset pin;
 * block/ports: a block instance's definition (a key of Circuit.blocks) and a copy of its pins.
 * n is also a mux's or demux's select bits, a ROM's or RAM's address bits and a bus's drivers; data: a ROM's contents.
 */
export interface Part {
  id: string; kind: PartKind; x: number; y: number; label: string; n?: number; reset?: boolean; w?: number; value?: number;
  block?: string; ports?: BlockPorts; data?: number[];
}
export interface PinRef { part: string; pin: string }
/** bend: where the user dragged the wire's middle run (x of the vertical run; y when it routes backwards). */
export interface Wire { id: string; from: PinRef; to: PinRef; bend?: number }
/** A text note on the canvas: no logic, exported as a comment. */
export interface Note { id: string; x: number; y: number; text: string }
/** probes: the signals the logic analyzer records (default: every input and output). */
/** blocks: reusable subcircuits by module name (each a circuit whose inputs and outputs become the block's pins). */
export interface Circuit { module: string; parts: Part[]; wires: Wire[]; notes?: Note[]; probes?: PinRef[]; blocks?: Library }
export type Library = Record<string, Circuit>;
/** One input change, as the editor records it and the testbench replays it (a bus input's whole value). */
export interface InputEvent { port: string; value: number }

export const INPUT_KINDS: PartKind[] = ["switch", "button", "clock", "hexin", "keypad"];
export const OUTPUT_KINDS: PartKind[] = ["led", "seg7", "hexout"];
const SEQUENTIAL: PartKind[] = ["dff", "tff", "jkff", "reg", "counter", "shift", "ram"];
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

/** A part's width setting: 1..16 bits (a decoder or encoder: 1..4 bits of code). */
export const width = (p: Part) => Math.max(1, Math.min(p.kind === "decoder" || p.kind === "encoder" || p.kind === "priority" ? 4 : MAX_WIDTH, p.w ?? 1));
/** A mux's or demux's select bits (1..3), a ROM's or RAM's address bits (1..8). */
export const selBits = (p: Part) => Math.max(1, Math.min(p.kind === "rom" || p.kind === "ram" ? 8 : 3, p.n ?? (p.kind === "rom" || p.kind === "ram" ? 4 : 2)));
/** A ROM's word at an address, kept inside its width (missing words read 0). */
export const romWord = (p: Part, addr: number) => Math.max(0, Math.floor(p.data?.[addr] ?? 0)) % 2 ** width(p);
/** Segments a..g (bit 0 = a) for BCD digits 0-9; 10-15 stay blank. */
export const BCD7 = [0x3f, 0x06, 0x5b, 0x4f, 0x66, 0x6d, 0x7d, 0x07, 0x7f, 0x6f, 0, 0, 0, 0, 0, 0];
const SEGMENTS = ["a", "b", "c", "d", "e", "f", "g"];
/** ALU operations, by the value of its op input. */
export const ALU_OPS = ["add", "sub", "and", "or", "xor", "slt", "not a", "pass a"];
/** Internal Verilog names a part declares, on top of its label: they must be free too. */
const HELPER_NAMES: Partial<Record<PartKind, string[]>> = {
  alu: ["a", "b", "sub", "sum", "slt"], encoder: ["in"], priority: ["in"], rom: ["data"], ram: ["mem", "i"],
};
export const isSequential = (p: Part) => SEQUENTIAL.includes(p.kind);

export function pins(p: Part): { inputs: string[]; outputs: string[] } {
  const rst = p.reset ? ["rst"] : [];
  const bits = (prefix: string) => Array.from({ length: width(p) }, (_, i) => `${prefix}${i}`);
  switch (p.kind) {
    case "switch": case "button": case "clock": case "hexin": case "const0": case "const1": case "const": return { inputs: [], outputs: ["out"] };
    case "keypad": return { inputs: [], outputs: ["code", "pressed"] };
    case "mux": return { inputs: [...Array.from({ length: 2 ** selBits(p) }, (_, i) => `d${i}`), "s"], outputs: ["y"] };
    case "demux": return { inputs: ["d", "s"], outputs: Array.from({ length: 2 ** selBits(p) }, (_, i) => `y${i}`) };
    case "encoder": case "priority": return { inputs: ["in"], outputs: ["y", "valid"] };
    case "bcd7": return { inputs: ["in"], outputs: SEGMENTS };
    case "alu": return { inputs: ["a", "b", "op"], outputs: ["y", "zero", "cout"] };
    case "shift": return { inputs: ["si", "d", "load", "dir", "clk", ...rst], outputs: ["q", "so"] };
    case "rom": return { inputs: ["addr"], outputs: ["q"] };
    case "ram": return { inputs: ["addr", "d", "we", "clk"], outputs: ["q"] };
    case "probe": return { inputs: ["in"], outputs: [] };
    case "tri": return { inputs: ["d", "en"], outputs: ["y"] };
    case "bus": return { inputs: Array.from({ length: Math.max(2, Math.min(4, p.n ?? 2)) }, (_, i) => `in${i}`), outputs: ["out"] };
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
    case "block": return { inputs: (p.ports?.inputs ?? []).map((x) => x.name), outputs: (p.ports?.outputs ?? []).map((x) => x.name) };
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
    case "mux": case "demux": return pin === "s" ? selBits(p) : w;
    case "keypad": return pin === "code" ? 4 : 1;
    case "encoder": case "priority": return pin === "in" ? 2 ** w : pin === "y" ? w : 1;
    case "bcd7": return pin === "in" ? 4 : 1;
    case "alu": return pin === "op" ? 3 : pin === "a" || pin === "b" || pin === "y" ? w : 1;
    case "shift": return pin === "d" || pin === "q" ? w : 1;
    case "rom": return pin === "addr" ? selBits(p) : w;
    case "ram": return pin === "addr" ? selBits(p) : pin === "d" || pin === "q" ? w : 1;
    case "probe": case "tri": case "bus": return pin === "en" ? 1 : w;
    case "reg": return pin === "d" || pin === "q" ? w : 1;
    case "counter": return pin === "q" ? w : 1;
    case "adder": return pin === "a" || pin === "b" || pin === "sum" ? w : 1;
    case "cmp": return pin === "a" || pin === "b" ? w : 1;
    case "decoder": return pin === "sel" ? w : 2 ** w;
    case "split": return pin === "in" ? w : 1;
    case "merge": return pin === "out" ? w : 1;
    case "block": return [...(p.ports?.inputs ?? []), ...(p.ports?.outputs ?? [])].find((x) => x.name === pin)?.width ?? 1;
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
export const portWidth = (p: Part) => (p.kind === "seg7" ? 7 : p.kind === "keypad" ? 5 : p.kind === "hexin" || p.kind === "hexout" ? width(p) : 1);
/** A number as `w` bits, LSB first. */
export const toBits = (v: number, w: number) => Array.from({ length: w }, (_, i) => Math.floor(v / 2 ** i) % 2);
/** A constant's value, kept inside its width. */
export const constValue = (p: Part) => Math.max(0, Math.floor(p.value ?? 0)) % 2 ** width(p);

/** The pins a block made from `def` has. */
export const blockPorts = (def: Circuit): BlockPorts => ({
  inputs: inputParts(def).map((p) => ({ name: p.label, width: portWidth(p) })),
  outputs: outputParts(def).map((p) => ({ name: p.label, width: portWidth(p) })),
});
const MAX_DEPTH = 8;
/** Does the circuit (or any block in it) hold state? Then testbenches use a clocked random walk. */
export function hasState(c: Circuit, lib: Library = c.blocks ?? {}, depth = 0): boolean {
  return depth <= MAX_DEPTH && c.parts.some((p) => isSequential(p) || (p.kind === "block" && !!lib[p.block ?? ""] && hasState(lib[p.block!], lib, depth + 1)));
}

export interface Compiled {
  net: BoardNetlist;
  /** The nets an output pin drives, LSB first (for colouring wires and showing bus values). */
  bitsOf: (r: PinRef) => Bit[] | undefined;
}

/**
 * The circuit as the board's netlist: input/output parts become ports, everything else gate
 * cells and flip-flops; blocks are inlined from `lib` (the top circuit's library by default).
 */
export function compile(c: Circuit, lib: Library = c.blocks ?? {}): Compiled {
  let next = 2;
  const cells: BoardNetlist["cells"] = [], ports: BoardNetlist["ports"] = {};
  const bitsOf = build(c, { fresh: () => next++, cells, lib, depth: 0 }, null, ports);
  return { net: { ports, cells }, bitsOf };
}

interface Ctx { fresh: () => Bit; cells: BoardNetlist["cells"]; lib: Library; depth: number }
/** A block's binding: the outer nets on each of its input and output pins, by name. */
type Binding = { inputs: Map<string, Bit[]>; outputs: Map<string, Bit[]> } | null;

/**
 * Cells for one circuit. At the top its inputs and outputs become ports; inside a block they
 * are bound to the instance's nets instead. Returns its output pins' nets.
 */
function build(c: Circuit, ctx: Ctx, bind: Binding, ports: BoardNetlist["ports"]): (r: PinRef) => Bit[] | undefined {
  if (ctx.depth > MAX_DEPTH) throw new Error("Blocks are nested too deeply: does a block contain itself?");
  const { fresh, cells } = ctx;
  const fit = (bits: Bit[] | undefined, w: number) => (bits && bits.length === w ? bits : Array<Bit>(w).fill("0"));
  const outBits = new Map<string, Bit[]>();
  for (const p of c.parts) {
    if (p.kind === "keypad") {                                        // one 5-bit port: {pressed, code}
      const all = bind ? fit(bind.inputs.get(p.label), 5) : Array.from({ length: 5 }, fresh);
      outBits.set(`${p.id}.code`, all.slice(0, 4));
      outBits.set(`${p.id}.pressed`, [all[4]]);
      continue;
    }
    for (const o of pins(p).outputs) {
      const w = pinWidth(p, o);
      outBits.set(`${p.id}.${o}`,
        p.kind === "const0" ? ["0"] : p.kind === "const1" ? ["1"]
        : p.kind === "const" ? toBits(constValue(p), w).map((b) => (b ? "1" : "0"))
        : bind && isInput(p) ? fit(bind.inputs.get(p.label), w)        // inside a block: the instance's input nets
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
    if (p.kind === "keypad") { if (!bind) ports[p.label] = { direction: "input", bits: [...out("code"), ...out("pressed")] }; continue; }
    if (isInput(p)) { if (!bind) ports[p.label] = { direction: "input", bits: out() }; continue; }
    if (isOutput(p)) {
      const bits = p.kind === "seg7" ? pins(p).inputs.map(one) : inBits(p, "in");
      if (!bind) ports[p.label] = { direction: "output", bits };
      else bind.outputs.get(p.label)?.forEach((y, i) => cell("$_BUF_", { A: bits[i] ?? "0" }, y));   // drive the instance's output nets
      continue;
    }
    switch (p.kind) {
      case "block": {
        const def = ctx.lib[p.block ?? ""];
        if (!def) break;
        build(def, { ...ctx, depth: ctx.depth + 1 }, {
          inputs: new Map((p.ports?.inputs ?? []).map((i) => [i.name, inBits(p, i.name)])),
          outputs: new Map((p.ports?.outputs ?? []).map((o) => [o.name, out(o.name)])),
        }, ports);
        break;
      }
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
      case "mux": {
        const s = inBits(p, "s");
        out().forEach((y, bit) => {                                      // a tree of 2:1 muxes, LSB of the select first
          let level = pins(p).inputs.slice(0, -1).map((d) => inBits(p, d)[bit]);
          for (const sb of s) level = level.flatMap((a, i, all) => (i % 2 ? [] : [cell("$_MUX_", { A: a, B: all[i + 1], S: sb })]));
          cell("$_BUF_", { A: level[0] }, y);
        });
        break;
      }
      case "demux": {
        const s = inBits(p, "s"), inv = s.map((b) => cell("$_NOT_", { A: b })), d = inBits(p, "d");
        pins(p).outputs.forEach((o, k) => out(o).forEach((y, bit) => {
          cell("$_BUF_", { A: s.reduce<Bit>((acc, b, i) => cell("$_AND_", { A: acc, B: (k >> i) & 1 ? b : inv[i] }), d[bit]) }, y);
        }));
        break;
      }
      case "encoder": case "priority": {
        const ins = inBits(p, "in"), y = out("y");
        const any = (bits: Bit[]) => bits.reduce<Bit>((acc, b) => (acc === "0" ? b : cell("$_OR_", { A: acc, B: b })), "0");
        // Priority: input k counts only if no higher input is set
        let higher: Bit = "0";
        const win: Bit[] = [];
        for (let k = ins.length - 1; k >= 0; k--) {
          win[k] = p.kind === "priority" && higher !== "0" ? cell("$_ANDNOT_", { A: ins[k], B: higher }) : ins[k];
          higher = higher === "0" ? ins[k] : cell("$_OR_", { A: higher, B: ins[k] });
        }
        y.forEach((b, i) => cell("$_BUF_", { A: any(win.filter((_, k) => (k >> i) & 1)) }, b));
        cell("$_BUF_", { A: higher }, out("valid")[0]);
        break;
      }
      case "bcd7": {
        const a = inBits(p, "in");
        SEGMENTS.forEach((seg, i) => cell("$_BUF_", { A: lookup(BCD7.map((v) => (v >> i) & 1), a, cell) }, out(seg)[0]));
        break;
      }
      case "rom": {
        const a = inBits(p, "addr"), words = Array.from({ length: 2 ** selBits(p) }, (_, k) => romWord(p, k));
        out().forEach((y, bit) => cell("$_BUF_", { A: lookup(words.map((v) => Math.floor(v / 2 ** bit) % 2), a, cell) }, y));
        break;
      }
      case "ram": {
        const a = inBits(p, "addr"), d = inBits(p, "d"), clk = one("clk"), inv = a.map((b) => cell("$_NOT_", { A: b }));
        const words = Array.from({ length: 2 ** selBits(p) }, (_, k) => {
          const write = a.reduce<Bit>((acc, b, i) => cell("$_AND_", { A: acc, B: (k >> i) & 1 ? b : inv[i] }), one("we"));
          return d.map((di) => { const q = fresh(); ff(cell("$_MUX_", { A: q, B: di, S: write }), clk, q); return q; });
        });
        out().forEach((y, bit) => {                                      // read: a mux tree over the words
          let level = words.map((word) => word[bit]);
          for (const sb of a) level = level.flatMap((x, i, all) => (i % 2 ? [] : [cell("$_MUX_", { A: x, B: all[i + 1], S: sb })]));
          cell("$_BUF_", { A: level[0] }, y);
        });
        break;
      }
      case "shift": {
        const q = out("q"), d = inBits(p, "d"), load = one("load"), dir = one("dir"), si = one("si"), clk = one("clk");
        q.forEach((b, i) => {
          const right = i === w - 1 ? si : q[i + 1], left = i === 0 ? si : q[i - 1];   // dir = 0 moves towards bit 0, dir = 1 away from it
          ff(cell("$_MUX_", { A: cell("$_MUX_", { A: right, B: left, S: dir }), B: d[i], S: load }), clk, b, rst);
        });
        cell("$_MUX_", { A: q[0], B: q[w - 1], S: dir }, out("so")[0]);
        break;
      }
      case "alu": {
        const a = inBits(p, "a"), b = inBits(p, "b"), [o0, o1, o2] = inBits(p, "op"), y = out("y");
        const n0 = cell("$_NOT_", { A: o0 }), n1 = cell("$_NOT_", { A: o1 }), n2 = cell("$_NOT_", { A: o2 });
        const is = (k: number) => [k & 1 ? o0 : n0, k & 2 ? o1 : n1, k & 4 ? o2 : n2].reduce((acc, s) => cell("$_AND_", { A: acc, B: s }));
        const ops = ALU_OPS.map((_, k) => is(k));
        const sub = cell("$_OR_", { A: ops[1], B: ops[5] });              // subtract for sub and slt: a + ~b + 1
        const addsub = cell("$_OR_", { A: ops[0], B: ops[1] });
        let carry: Bit = sub;
        const sum: Bit[] = [];
        for (let i = 0; i < w; i++) {
          const bx = cell("$_XOR_", { A: b[i], B: sub }), x = cell("$_XOR_", { A: a[i], B: bx });
          sum.push(cell("$_XOR_", { A: x, B: carry }));
          carry = cell("$_OR_", { A: cell("$_AND_", { A: a[i], B: bx }), B: cell("$_AND_", { A: x, B: carry }) });
        }
        // Signed a < b: the sign of a if the signs differ, else the sign of a - b
        const slt = cell("$_MUX_", { A: sum[w - 1], B: a[w - 1], S: cell("$_XOR_", { A: a[w - 1], B: b[w - 1] }) });
        const pick = (terms: [Bit, Bit][]) => terms.map(([en, v]) => cell("$_AND_", { A: en, B: v })).reduce((acc, t) => cell("$_OR_", { A: acc, B: t }));
        let nonzero: Bit = "0";
        y.forEach((yi, i) => {
          const r = pick([[addsub, sum[i]], [ops[2], cell("$_AND_", { A: a[i], B: b[i] })], [ops[3], cell("$_OR_", { A: a[i], B: b[i] })],
            [ops[4], cell("$_XOR_", { A: a[i], B: b[i] })], [ops[5], i === 0 ? slt : "0"], [ops[6], cell("$_NOT_", { A: a[i] })], [ops[7], a[i]]]);
          cell("$_BUF_", { A: r }, yi);
          nonzero = cell("$_OR_", { A: nonzero, B: r });
        });
        cell("$_NOT_", { A: nonzero }, out("zero")[0]);
        cell("$_AND_", { A: addsub, B: carry }, out("cout")[0]);
        break;
      }
      case "tri": out().forEach((y, i) => cell("$_AND_", { A: inBits(p, "d")[i], B: one("en") }, y)); break;
      case "bus": out().forEach((y, bit) => cell("$_BUF_", { A: pins(p).inputs.map((pin) => inBits(p, pin)[bit]).reduce((acc, b) => cell("$_OR_", { A: acc, B: b })) }, y)); break;
      case "probe": break;
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
  return (r) => outBits.get(key(r));
}

/**
 * One output bit of a lookup table as a net: a mux tree over the address bits (LSB first),
 * collapsing wherever both branches are the same constant.
 */
function lookup(table: number[], addr: Bit[], cell: (type: string, conn: Record<string, Bit>) => Bit): Bit {
  let level: Bit[] = table.map((v) => (v ? "1" : "0"));
  for (const s of addr) level = level.flatMap((a, i, all) => (i % 2 ? [] : [a === all[i + 1] ? a : cell("$_MUX_", { A: a, B: all[i + 1], S: s })]));
  return level[0];
}

/** Buses with more than one driver enabled right now; `read` gives a pin's current value. */
export function busConflicts(c: Circuit, read: (r: PinRef) => number): string[] {
  const driver = new Map(c.wires.map((w) => [key(w.to), w.from]));
  return c.parts.filter((p) => p.kind === "bus").filter((p) => pins(p).inputs.filter((pin) => {
    const from = driver.get(`${p.id}.${pin}`), tri = from && c.parts.find((x) => x.id === from.part);
    if (!tri || tri.kind !== "tri") return false;
    const en = driver.get(`${tri.id}.en`);
    return en ? read(en) === 1 : true;                                // an unconnected enable reads 1
  }).length > 1).map((p) => p.label);
}

export interface CircuitIssue { level: "error" | "warning"; msg: string; at?: string }

export function validate(c: Circuit, lib: Library = c.blocks ?? {}): CircuitIssue[] {
  const out: CircuitIssue[] = [];
  for (const p of c.parts.filter((x) => x.kind === "block")) {
    if (!lib[p.block ?? ""]) out.push({ level: "error", msg: `${p.label} uses a block "${p.block}" that doesn't exist any more.`, at: p.id });
  }
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
    if (p.kind === "block") seen.add(`u_${p.label}`);
    for (const h of HELPER_NAMES[p.kind] ?? []) seen.add(`${p.label}_${h}`);
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
      if (p.kind === "shift" && ["si", "d", "load", "dir"].includes(pin)) continue;   // each use of a shift register leaves some of these open
      if (p.kind === "bus") continue;                                                  // a free bus input is just a missing driver
      if (!driven.has(`${p.id}.${pin}`)) out.push({ level: "warning", msg: `${p.label}.${pin} isn't connected, so it reads ${pinDefault(p, pin)}.`, at: p.id });
    }
    if (p.kind === "bus") {
      const froms = c.wires.filter((w) => w.to.part === p.id).map((w) => byId.get(w.from.part));
      if (froms.some((f) => f && f.kind !== "tri")) out.push({ level: "warning", msg: `${p.label} is driven by something other than a tri-state buffer: it can't be switched off the bus.`, at: p.id });
      const ens = froms.filter((f) => f?.kind === "tri").map((f) => c.wires.find((w) => w.to.part === f!.id && w.to.pin === "en")?.from);
      const same = (x?: PinRef, y?: PinRef) => (!x && !y) || (!!x && !!y && x.part === y.part && x.pin === y.pin);
      if (ens.some((e, i) => ens.some((o, j) => j > i && same(e, o)))) out.push({ level: "warning", msg: `Two drivers of ${p.label} share an enable, so they are always on together: a bus conflict.`, at: p.id });
    }
  }
  if (!inputParts(c).length) out.push({ level: "warning", msg: "No inputs: add a switch, button, clock or hex input." });
  if (!outputParts(c).length) out.push({ level: "warning", msg: "No outputs: add an LED, a hex display or a 7-segment display, so there is something to see and test." });
  if (!out.some((i) => i.level === "error")) {
    try { new GateSim(compile(c, lib).net); } catch (e) { out.push({ level: "error", msg: (e as Error).message }); }
  }
  return out;
}

// ── Simulation helpers ───────────────────────────────────────────────────────

/** Every output's value at power-up and after each event (GateSim), as numbers (7-segment: bit 0 = segment a). */
export function expectedOutputs(c: Circuit, events: InputEvent[], lib: Library = c.blocks ?? {}): Record<string, number>[] {
  const sim = new GateSim(compile(c, lib).net);
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
export function defaultEvents(c: Circuit, steps = 48, seed = 1, lib: Library = c.blocks ?? {}): InputEvent[] {
  const ins = inputParts(c);
  if (!ins.length) return [];
  const sequential = hasState(c, lib);
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

/** Structural Verilog: a module for each block the circuit uses (innermost first), then the circuit's own. */
export function generateVerilog(c: Circuit, lib: Library = c.blocks ?? {}): string {
  const order: string[] = [];
  const visit = (x: Circuit, depth: number) => {
    if (depth > MAX_DEPTH) return;
    for (const p of x.parts) {
      const name = p.kind === "block" ? p.block ?? "" : "";
      if (name && lib[name] && !order.includes(name)) { visit(lib[name], depth + 1); if (!order.includes(name)) order.push(name); }
    }
  };
  visit(c, 0);
  const notes = (c.notes ?? []).map((n) => n.text.trim()).filter(Boolean).map((t) => `// Note: ${t.replace(/\s*\n\s*/g, " ")}\n`).join("");
  return `// Generated by BitFlow Studio from a drawn circuit (structural Verilog).
${notes}${order.map((name) => `${moduleText({ ...lib[name], module: name })}\n`).join("")}${moduleText(c)}`;
}

function moduleText(c: Circuit): string {
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
    if (p.kind === "keypad") {
      decls.push(`    wire [3:0] ${sig(p, "code")} = ${p.label}[3:0];`, `    wire ${sig(p, "pressed")} = ${p.label}[4];`);
    } else if (p.kind === "shift") {
      decls.push(`    reg  ${vec(width(p))}${sig(p, "q")} = ${zero(width(p))};`, `    wire ${sig(p, "so")};`);
    } else if (p.kind === "ram") {
      decls.push(`    reg  ${vec(width(p))}${p.label}_mem [0:${2 ** selBits(p) - 1}];`, `    wire ${vec(width(p))}${p.label};`);
    } else if (isSequential(p)) decls.push(`    reg  ${vec(pinWidth(p, "q"))}${p.label} = ${zero(pinWidth(p, "q"))};`);
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
    else if (p.kind === "mux") body.push(`    assign ${p.label} = ${pins(p).inputs.slice(0, -1).map((d, k, all) => (k === all.length - 1 ? src(p, d) : `${src(p, "s")} == ${lit(selBits(p), k)} ? ${src(p, d)} : `)).join("")};`);
    else if (p.kind === "demux") pins(p).outputs.forEach((o, k) => body.push(`    assign ${sig(p, o)} = ${src(p, "s")} == ${lit(selBits(p), k)} ? ${src(p, "d")} : ${zero(width(p))};`));
    else if (p.kind === "encoder" || p.kind === "priority") {
      const inp = `${p.label}_in`, n = 2 ** width(p);
      decls.push(`    wire [${n - 1}:0] ${inp};`);
      body.push(`    assign ${inp} = ${src(p, "in")};`, `    assign ${sig(p, "valid")} = |${inp};`);
      body.push(p.kind === "priority"
        ? `    assign ${sig(p, "y")} = ${Array.from({ length: n - 1 }, (_, i) => `${inp}[${n - 1 - i}] ? ${lit(width(p), n - 1 - i)} : `).join("")}${zero(width(p))};`
        : `    assign ${sig(p, "y")} = ${Array.from({ length: n }, (_, k) => `(${inp}[${k}] ? ${lit(width(p), k)} : ${zero(width(p))})`).join(" | ")};`);
    } else if (p.kind === "bcd7") {
      SEGMENTS.forEach((seg, i) => body.push(`    assign ${sig(p, seg)} = 16'b${[...BCD7].reverse().map((v) => (v >> i) & 1).join("")} >> ${src(p, "in")};`));
    } else if (p.kind === "rom") {
      const W = width(p), D = 2 ** selBits(p);
      const words = Array.from({ length: D }, (_, k) => `${W}'d${romWord(p, D - 1 - k)}`).join(", ");
      decls.push(`    wire [${W * D - 1}:0] ${p.label}_data = {${words}};`);
      body.push(`    assign ${p.label} = ${p.label}_data[${src(p, "addr")} * ${W} +: ${W}];`);
    } else if (p.kind === "ram") {
      decls.push(`    integer ${p.label}_i;`);
      body.push(`    initial for (${p.label}_i = 0; ${p.label}_i < ${2 ** selBits(p)}; ${p.label}_i = ${p.label}_i + 1) ${p.label}_mem[${p.label}_i] = ${zero(width(p))};`);
      body.push(`    always @(posedge ${src(p, "clk")}) if (${src(p, "we")}) ${p.label}_mem[${src(p, "addr")}] <= ${src(p, "d")};`);
      body.push(`    assign ${p.label} = ${p.label}_mem[${src(p, "addr")}];`);
    } else if (p.kind === "shift") {
      const q = sig(p, "q"), W = width(p), si = src(p, "si"), r = p.reset ? src(p, "rst") : null;
      const right = W === 1 ? si : `{${si}, ${q}[${W - 1}:1]}`, left = W === 1 ? si : `{${q}[${W - 2}:0], ${si}}`;
      const next = `if (${src(p, "load")}) ${q} <= ${src(p, "d")}; else ${q} <= ${src(p, "dir")} ? ${left} : ${right};`;
      body.push(r ? `    always @(posedge ${src(p, "clk")} or posedge ${r}) if (${r}) ${q} <= ${zero(W)}; else ${next}` : `    always @(posedge ${src(p, "clk")}) ${next}`);
      body.push(`    assign ${sig(p, "so")} = ${src(p, "dir")} ? ${W === 1 ? q : `${q}[${W - 1}]`} : ${W === 1 ? q : `${q}[0]`};`);
    } else if (p.kind === "alu") {
      // Named copies of the inputs: bit selects can't apply to a literal, and a declaration can't read a wire declared later
      const W = width(p), l = p.label, a = `${l}_a`, b = `${l}_b`, op = src(p, "op"), y = sig(p, "y");
      decls.push(`    wire [${W - 1}:0] ${a}, ${b};`, `    wire ${l}_sub, ${l}_slt;`, `    wire [${W}:0] ${l}_sum;`);
      body.push(`    assign ${a} = ${src(p, "a")};`, `    assign ${b} = ${src(p, "b")};`, `    assign ${l}_sub = ${op} == 3'd1 || ${op} == 3'd5;`);
      body.push(`    assign ${l}_sum = {1'b0, ${a}} + {1'b0, ${l}_sub ? ~${b} : ${b}} + ${l}_sub;`);
      body.push(`    assign ${l}_slt = (${a}[${W - 1}] != ${b}[${W - 1}]) ? ${a}[${W - 1}] : ${l}_sum[${W - 1}];`);
      body.push(`    assign ${y} = ${op} <= 3'd1 ? ${l}_sum[${W - 1}:0] : ${op} == 3'd2 ? ${a} & ${b} : ${op} == 3'd3 ? ${a} | ${b} : ${op} == 3'd4 ? ${a} ^ ${b} : ${op} == 3'd5 ? ${l}_slt : ${op} == 3'd6 ? ~${a} : ${a};`);
      body.push(`    assign ${sig(p, "zero")} = ${y} == ${zero(W)};`, `    assign ${sig(p, "cout")} = ${op} <= 3'd1 && ${l}_sum[${W}];`);
    } else if (p.kind === "tri") body.push(`    assign ${p.label} = ${src(p, "en")} ? ${src(p, "d")} : ${zero(width(p))};   // no Z level: a disabled driver gives 0 (see the bus)`);
    else if (p.kind === "bus") body.push(`    assign ${p.label} = ${pins(p).inputs.map((i) => src(p, i)).join(" | ")};`);
    else if (p.kind === "led" || p.kind === "hexout") body.push(`    assign ${p.label} = ${src(p, "in")};`);
    else if (p.kind === "seg7") body.push(`    assign ${p.label} = {${[...pins(p).inputs].reverse().map((pin) => src(p, pin)).join(", ")}};   // {g..a}`);
    else if (p.kind === "block") {
      const conns = [...(p.ports?.inputs ?? []).map((i) => `.${i.name}(${src(p, i.name)})`), ...(p.ports?.outputs ?? []).map((o) => `.${o.name}(${sig(p, o.name)})`)];
      body.push(`    ${p.block} u_${p.label} (${conns.join(", ")});`);
    }
  }
  return `module ${c.module} (
${ports.join(",\n")}
);
${decls.length ? `${decls.join("\n")}\n` : ""}
${body.join("\n")}
endmodule
`;
}

/** A testbench that starts with every input at 0, applies `events` 5 ns apart, and checks every output after each. */
export function generateTestbench(c: Circuit, events: InputEvent[], lib: Library = c.blocks ?? {}): string {
  const tb = `tb_${c.module}`;
  const outs = outputParts(c), ins = inputParts(c);
  const expected = expectedOutputs(c, events, lib);
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
