/**
 * scripts/circuit-cases.ts — small circuits that exercise every circuit-editor part,
 * shared by scripts/circuit.check.ts (behaviour in GateSim) and
 * scripts/studio-sim.check.ts (the generated Verilog agrees on Icarus).
 */
import type { Circuit, Part, PartKind } from "../lib/studio/circuit";

let n = 0;
const P = (kind: PartKind, label: string, extra: Partial<Part> = {}): Part => ({ id: `${label}_id`, kind, label, x: (n++ % 5) * 120, y: 40, ...extra });
const W = (from: string, fromPin: string, to: string, toPin: string) =>
  ({ id: `w${n++}`, from: { part: `${from}_id`, pin: fromPin }, to: { part: `${to}_id`, pin: toPin } });

export const PART_CASES: Record<string, Circuit> = {
  adder4: { module: "adder4", parts: [P("hexin", "a", { w: 4 }), P("hexin", "b", { w: 4 }), P("switch", "cin"), P("adder", "add", { w: 4 }),
    P("hexout", "sum", { w: 4 }), P("led", "cout")],
  wires: [W("a", "out", "add", "a"), W("b", "out", "add", "b"), W("cin", "out", "add", "cin"), W("add", "sum", "sum", "in"), W("add", "cout", "cout", "in")] },

  cmp3: { module: "cmp3", parts: [P("hexin", "a", { w: 3 }), P("hexin", "b", { w: 3 }), P("cmp", "c", { w: 3 }), P("led", "eq"), P("led", "lt"), P("led", "gt")],
  wires: [W("a", "out", "c", "a"), W("b", "out", "c", "b"), W("c", "eq", "eq", "in"), W("c", "lt", "lt", "in"), W("c", "gt", "gt", "in")] },

  decoder3: { module: "decoder3", parts: [P("hexin", "sel", { w: 3 }), P("decoder", "dec", { w: 3 }), P("hexout", "y", { w: 8 })],
  wires: [W("sel", "out", "dec", "sel"), W("dec", "y", "y", "in")] },

  // Split a nibble, swap the middle bits, merge it back
  swap: { module: "swap", parts: [P("hexin", "x", { w: 4 }), P("split", "sp", { w: 4 }), P("merge", "mg", { w: 4 }), P("hexout", "y", { w: 4 })],
  wires: [W("x", "out", "sp", "in"), W("sp", "b0", "mg", "b0"), W("sp", "b1", "mg", "b2"), W("sp", "b2", "mg", "b1"), W("sp", "b3", "mg", "b3"), W("mg", "out", "y", "in")] },

  bitwise: { module: "bitwise", parts: [P("hexin", "a", { w: 4 }), P("hexin", "b", { w: 4 }), P("switch", "s"),
    P("and", "g_and", { w: 4 }), P("xor", "g_xor", { w: 4 }), P("not", "g_not", { w: 4 }), P("mux2", "m", { w: 4 }),
    P("hexout", "y_and", { w: 4 }), P("hexout", "y_xor", { w: 4 }), P("hexout", "y_not", { w: 4 }), P("hexout", "y_mux", { w: 4 })],
  wires: [W("a", "out", "g_and", "a"), W("b", "out", "g_and", "b"), W("a", "out", "g_xor", "a"), W("b", "out", "g_xor", "b"), W("a", "out", "g_not", "a"),
    W("a", "out", "m", "d0"), W("b", "out", "m", "d1"), W("s", "out", "m", "s"),
    W("g_and", "y", "y_and", "in"), W("g_xor", "y", "y_xor", "in"), W("g_not", "y", "y_not", "in"), W("m", "y", "y_mux", "in")] },

  // A register with enable and reset, next to a free-running counter (its unconnected enable reads 1)
  regcount: { module: "regcount", parts: [P("clock", "clk"), P("button", "rst"), P("switch", "load"), P("hexin", "d", { w: 4 }),
    P("reg", "r", { w: 4, reset: true }), P("counter", "cnt", { w: 3 }), P("hexout", "q", { w: 4 }), P("hexout", "count", { w: 3 })],
  wires: [W("d", "out", "r", "d"), W("load", "out", "r", "en"), W("clk", "out", "r", "clk"), W("rst", "out", "r", "rst"),
    W("clk", "out", "cnt", "clk"), W("r", "q", "q", "in"), W("cnt", "q", "count", "in")] },

  tjk: { module: "tjk", parts: [P("clock", "clk"), P("switch", "t"), P("switch", "j"), P("switch", "k"), P("tff", "tq"), P("jkff", "jq", { reset: true }),
    P("button", "rst"), P("led", "t_out"), P("led", "jk_out")],
  wires: [W("t", "out", "tq", "t"), W("clk", "out", "tq", "clk"), W("j", "out", "jq", "j"), W("k", "out", "jq", "k"), W("clk", "out", "jq", "clk"),
    W("rst", "out", "jq", "rst"), W("tq", "q", "t_out", "in"), W("jq", "q", "jk_out", "in")] },

  // A 5-bit constant compared with a bus input
  const5: { module: "const5", parts: [P("hexin", "x", { w: 5 }), P("const", "k", { w: 5, value: 19 }), P("cmp", "c", { w: 5 }), P("led", "hit")],
  wires: [W("x", "out", "c", "a"), W("k", "out", "c", "b"), W("c", "eq", "hit", "in")] },

  mux4: { module: "mux4", parts: [P("hexin", "s", { w: 2 }), P("switch", "d0"), P("switch", "d1"), P("switch", "d2"), P("switch", "d3"), P("mux", "m", { n: 2 }), P("led", "y")],
  wires: [W("s", "out", "m", "s"), W("d0", "out", "m", "d0"), W("d1", "out", "m", "d1"), W("d2", "out", "m", "d2"), W("d3", "out", "m", "d3"), W("m", "y", "y", "in")] },

  // An 8:1 mux of 2-bit values; the inputs left open read 0
  mux8: { module: "mux8", parts: [P("hexin", "s", { w: 3 }), P("hexin", "a", { w: 2 }), P("hexin", "b", { w: 2 }), P("mux", "m", { n: 3, w: 2 }), P("hexout", "y", { w: 2 })],
  wires: [W("s", "out", "m", "s"), W("a", "out", "m", "d0"), W("b", "out", "m", "d7"), W("m", "y", "y", "in")] },

  demux4: { module: "demux4", parts: [P("hexin", "s", { w: 2 }), P("switch", "d"), P("demux", "dm", { n: 2 }), P("led", "y0"), P("led", "y1"), P("led", "y2"), P("led", "y3")],
  wires: [W("s", "out", "dm", "s"), W("d", "out", "dm", "d"), W("dm", "y0", "y0", "in"), W("dm", "y1", "y1", "in"), W("dm", "y2", "y2", "in"), W("dm", "y3", "y3", "in")] },

  encoder4: { module: "encoder4", parts: [P("hexin", "x", { w: 4 }), P("encoder", "e", { w: 2 }), P("hexout", "y", { w: 2 }), P("led", "ok")],
  wires: [W("x", "out", "e", "in"), W("e", "y", "y", "in"), W("e", "valid", "ok", "in")] },

  priority8: { module: "priority8", parts: [P("hexin", "x", { w: 8 }), P("priority", "e", { w: 3 }), P("hexout", "y", { w: 3 }), P("led", "ok")],
  wires: [W("x", "out", "e", "in"), W("e", "y", "y", "in"), W("e", "valid", "ok", "in")] },

  bcd: { module: "bcd", parts: [P("hexin", "d", { w: 4 }), P("bcd7", "dec"), P("seg7", "seg")],
  wires: [W("d", "out", "dec", "in"), ...["a", "b", "c", "d", "e", "f", "g"].map((s) => W("dec", s, "seg", s))] },

  alu3: { module: "alu3", parts: [P("hexin", "a", { w: 3 }), P("hexin", "b", { w: 3 }), P("hexin", "op", { w: 3 }), P("alu", "u", { w: 3 }), P("hexout", "y", { w: 3 }), P("led", "z"), P("led", "c")],
  wires: [W("a", "out", "u", "a"), W("b", "out", "u", "b"), W("op", "out", "u", "op"), W("u", "y", "y", "in"), W("u", "zero", "z", "in"), W("u", "cout", "c", "in")] },

  // At width 1, and with b left open: the Verilog must not index a literal
  alu1: { module: "alu1", parts: [P("switch", "a"), P("hexin", "op", { w: 3 }), P("alu", "u", { w: 1 }), P("led", "y"), P("led", "z"), P("led", "c")],
  wires: [W("a", "out", "u", "a"), W("op", "out", "u", "op"), W("u", "y", "y", "in"), W("u", "zero", "z", "in"), W("u", "cout", "c", "in")] },

  shift4: { module: "shift4", parts: [P("clock", "clk"), P("button", "rst"), P("switch", "si"), P("switch", "load"), P("switch", "dir"), P("hexin", "d", { w: 4 }),
    P("shift", "sr", { w: 4, reset: true }), P("hexout", "q", { w: 4 }), P("led", "so")],
  wires: [W("clk", "out", "sr", "clk"), W("rst", "out", "sr", "rst"), W("si", "out", "sr", "si"), W("load", "out", "sr", "load"), W("dir", "out", "sr", "dir"),
    W("d", "out", "sr", "d"), W("sr", "q", "q", "in"), W("sr", "so", "so", "in")] },

  // Everything optional left open: a plain serial-in, serial-out chain, one bit long
  shift1: { module: "shift1", parts: [P("clock", "clk"), P("switch", "si"), P("shift", "sr", { w: 1 }), P("led", "q"), P("led", "so")],
  wires: [W("clk", "out", "sr", "clk"), W("si", "out", "sr", "si"), W("sr", "q", "q", "in"), W("sr", "so", "so", "in")] },

  rom4: { module: "rom4", parts: [P("hexin", "addr", { w: 2 }), P("rom", "r", { n: 2, w: 4, data: [3, 9, 0, 15] }), P("hexout", "q", { w: 4 })],
  wires: [W("addr", "out", "r", "addr"), W("r", "q", "q", "in")] },

  ram4: { module: "ram4", parts: [P("clock", "clk"), P("switch", "we"), P("hexin", "addr", { w: 2 }), P("hexin", "d", { w: 2 }), P("ram", "mem", { n: 2, w: 2 }), P("hexout", "q", { w: 2 })],
  wires: [W("clk", "out", "mem", "clk"), W("we", "out", "mem", "we"), W("addr", "out", "mem", "addr"), W("d", "out", "mem", "d"), W("mem", "q", "q", "in")] },

  keys: { module: "keys", parts: [P("keypad", "pad"), P("not", "up"), P("hexout", "code", { w: 4 }), P("led", "idle")],
  wires: [W("pad", "code", "code", "in"), W("pad", "pressed", "up", "a"), W("up", "y", "idle", "in")] },

  // Two tri-states on a bus, with a probe watching it (the probe adds nothing to the Verilog)
  tribus: { module: "tribus", parts: [P("hexin", "a", { w: 2 }), P("hexin", "b", { w: 2 }), P("switch", "ea"), P("switch", "eb"), P("tri", "ta", { w: 2 }), P("tri", "tb", { w: 2 }),
    P("bus", "line", { w: 2 }), P("probe", "watch", { w: 2 }), P("hexout", "y", { w: 2 })],
  wires: [W("a", "out", "ta", "d"), W("ea", "out", "ta", "en"), W("b", "out", "tb", "d"), W("eb", "out", "tb", "en"), W("ta", "y", "line", "in0"), W("tb", "y", "line", "in1"),
    W("line", "out", "watch", "in"), W("line", "out", "y", "in")] },
};
