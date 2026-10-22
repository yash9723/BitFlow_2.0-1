/**
 * lib/studio/circuit-import.ts — Verilog to a drawn circuit. The board netlist from
 * synthesizeDesign("board", code) (1-bit gates and flip-flops, lib/gate-sim.ts) becomes
 * editor parts: bus ports become a hex input and splitter / merger and hex display, cells
 * become gates, multiplexers and D flip-flops. Laid out in columns by logic depth.
 * Self-check: scripts/circuit.check.ts (round trip through compile()).
 */
import type { Bit, BoardNetlist } from "../gate-sim";
import { type Circuit, type Part, type PartKind, type PinRef, type Wire, MAX_WIDTH } from "./circuit";
import { nextLabel, size } from "./circuit-edit";

export const MAX_IMPORT_CELLS = 150;
const COL = 150, GAP = 26, TOP = 40;

const GATES: Record<string, PartKind> = { $_AND_: "and", $_NAND_: "nand", $_OR_: "or", $_NOR_: "nor", $_XOR_: "xor", $_XNOR_: "xnor" };
const DFF = /^\$_DFF_([NP])(?:([NP])0)?_$/;     // plain, or async reset to 0

/** The circuit for a synthesized design, or why it can't be drawn. */
export function netlistToCircuit(net: BoardNetlist, module: string): Circuit | string {
  const alias = new Map<Bit, Bit>();               // $_BUF_ only renames a net
  for (const c of net.cells) if (c.type === "$_BUF_") alias.set(c.conn.Y[0], c.conn.A[0]);
  const real = (b: Bit): Bit => { for (let i = 0; alias.has(b) && i < 10000; i++) b = alias.get(b)!; return b; };
  const cells = net.cells.filter((c) => c.type !== "$_BUF_");
  if (cells.length > MAX_IMPORT_CELLS) return `The design synthesizes to ${cells.length} gates; the editor draws up to ${MAX_IMPORT_CELLS}.`;

  const parts: Part[] = [], wires: Wire[] = [];
  const driver = new Map<Bit, PinRef>();           // net -> the pin that drives it
  const needs: { bit: Bit; to: PinRef }[] = [];   // input pins still to wire to a net
  const used = new Set<string>([module]);
  let n = 0;
  const add = (kind: PartKind, want: string, extra: Partial<Part> = {}): Part => {
    const p: Part = { id: `p${++n}`, kind, label: nextLabel(want.replace(/[^A-Za-z0-9_]/g, "_") || "x", used), x: 0, y: 0, ...extra };
    used.add(p.label);
    parts.push(p);
    return p;
  };
  const link = (from: PinRef, to: PinRef) => wires.push({ id: `w${++n}`, from, to });

  const ports = Object.entries(net.ports);
  for (const [name, port] of ports) {
    const w = port.bits.length;
    if (w > MAX_WIDTH) return `Port ${name} is ${w} bits wide; the editor handles up to ${MAX_WIDTH}.`;
    if (port.direction === "input") {
      if (w === 1) driver.set(port.bits[0], { part: add(/^(clk|clock)/i.test(name) ? "clock" : "switch", name).id, pin: "out" });
      else {
        const hx = add("hexin", name, { w }), sp = add("split", `${name}_bits`, { w });
        link({ part: hx.id, pin: "out" }, { part: sp.id, pin: "in" });
        port.bits.forEach((b, i) => driver.set(b, { part: sp.id, pin: `b${i}` }));
      }
    } else if (port.direction !== "output") return `Port ${name} is ${port.direction}; the editor has inputs and outputs only.`;
  }
  for (const [name, port] of ports) {
    if (port.direction !== "output") continue;
    const w = port.bits.length;
    if (w === 1) needs.push({ bit: port.bits[0], to: { part: add("led", name).id, pin: "in" } });
    else {
      const mg = add("merge", `${name}_bus`, { w }), hx = add("hexout", name, { w });
      link({ part: mg.id, pin: "out" }, { part: hx.id, pin: "in" });
      port.bits.forEach((b, i) => needs.push({ bit: b, to: { part: mg.id, pin: `b${i}` } }));
    }
  }

  const not = (input: Bit | PinRef): PinRef => {
    const p = add("not", "n");
    if (typeof input === "object") link(input, { part: p.id, pin: "a" }); else needs.push({ bit: input, to: { part: p.id, pin: "a" } });
    return { part: p.id, pin: "y" };
  };
  for (const { type, conn } of cells) {
    const A = conn.A?.[0], B = conn.B?.[0], Y = conn.Y?.[0];
    const gate = GATES[type], ff = DFF.exec(type);
    if (gate) {
      const g = add(gate, "g");
      needs.push({ bit: A, to: { part: g.id, pin: "a" } }, { bit: B, to: { part: g.id, pin: "b" } });
      driver.set(Y, { part: g.id, pin: "y" });
    } else if (type === "$_NOT_") driver.set(Y, not(A));
    else if (type === "$_ANDNOT_" || type === "$_ORNOT_") {      // A & ~B, A | ~B
      const g = add(type === "$_ANDNOT_" ? "and" : "or", "g");
      needs.push({ bit: A, to: { part: g.id, pin: "a" } });
      link(not(B), { part: g.id, pin: "b" });
      driver.set(Y, { part: g.id, pin: "y" });
    } else if (type === "$_MUX_" || type === "$_NMUX_") {
      const m = add("mux2", "m");
      needs.push({ bit: A, to: { part: m.id, pin: "d0" } }, { bit: B, to: { part: m.id, pin: "d1" } }, { bit: conn.S[0], to: { part: m.id, pin: "s" } });
      const y = { part: m.id, pin: "y" };
      driver.set(Y, type === "$_MUX_" ? y : not(y));
    } else if (ff) {
      const q = add("dff", "q", { reset: !!ff[2] });
      needs.push({ bit: conn.D[0], to: { part: q.id, pin: "d" } });
      if (ff[1] === "P") needs.push({ bit: conn.C[0], to: { part: q.id, pin: "clk" } });
      else link(not(conn.C[0]), { part: q.id, pin: "clk" });             // falling edge: invert the clock
      if (ff[2] === "P") needs.push({ bit: conn.R[0], to: { part: q.id, pin: "rst" } });
      else if (ff[2] === "N") link(not(conn.R[0]), { part: q.id, pin: "rst" });
      driver.set(conn.Q[0], { part: q.id, pin: "q" });
    } else {
      return type.startsWith("$_DFF")
        ? `The design has a ${type} flip-flop (set, or reset to 1); the editor's flip-flops reset to 0.`
        : `The design uses ${type} cells, which the editor has no part for.`;
    }
  }

  const consts: Partial<Record<"0" | "1", PinRef>> = {};
  for (const { bit, to } of needs) {
    const b = real(bit);
    const v = b === "1" ? "1" : "0";                 // constants; x, z and undriven nets read as 0
    link(driver.get(b) ?? (consts[v] ??= { part: add(v === "1" ? "const1" : "const0", v === "1" ? "one" : "zero").id, pin: "out" }), to);
  }

  layout(parts, wires);
  return { module, parts, wires, notes: [] };
}

/** Columns by logic depth (longest path from an input; flip-flop feedback ignored), rows ordered by their sources. */
function layout(parts: Part[], wires: Wire[]) {
  const srcs = new Map<string, string[]>(parts.map((p) => [p.id, []]));
  for (const w of wires) srcs.get(w.to.part)!.push(w.from.part);
  const byId = new Map(parts.map((p) => [p.id, p]));
  const isSource = (p: Part) => ["switch", "clock", "hexin", "const0", "const1"].includes(p.kind);
  const isSink = (p: Part) => ["led", "hexout", "merge"].includes(p.kind);
  const level = new Map<string, number>(), active = new Set<string>();
  const lvl = (id: string): number => {
    const p = byId.get(id)!;
    if (level.has(id)) return level.get(id)!;
    if (isSource(p) || active.has(id)) return 0;                         // an input, or a loop through a flip-flop
    active.add(id);
    const v = 1 + Math.max(0, ...srcs.get(id)!.filter((s) => !isSink(byId.get(s)!)).map(lvl));
    active.delete(id);
    level.set(id, v);
    return v;
  };
  const last = Math.max(0, ...parts.filter((p) => !isSink(p)).map((p) => lvl(p.id)));
  const hasMerge = parts.some((p) => p.kind === "merge");
  const col = (p: Part) => (p.kind === "merge" ? last + 1 : isSink(p) ? last + (hasMerge ? 2 : 1) : lvl(p.id));

  const rowOf = new Map<string, number>();         // 0..1: how far down its column a part is
  const columns: Part[][] = [];
  for (const p of parts) (columns[col(p)] ??= []).push(p);
  columns.forEach((list, c) => {
    if (!list) return;
    const key = (p: Part) => {                     // the average height of its sources to the left
      const rows = srcs.get(p.id)!.map((s) => rowOf.get(s)).filter((r): r is number => r !== undefined);
      return rows.length ? rows.reduce((a, b) => a + b, 0) / rows.length : 2;
    };
    if (c > 0) list.sort((a, b) => key(a) - key(b));
    let y = TOP;
    list.forEach((p, i) => {
      p.x = TOP + c * COL;
      p.y = y;
      y += size(p).h + GAP;
      rowOf.set(p.id, i / list.length);
    });
  });
}
