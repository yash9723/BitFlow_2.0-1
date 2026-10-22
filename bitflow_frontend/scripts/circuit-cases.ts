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
};
