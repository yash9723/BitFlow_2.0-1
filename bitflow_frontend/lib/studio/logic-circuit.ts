/**
 * lib/studio/logic-circuit.ts — a truth table as a drawn circuit: the K-map tool's "Build
 * circuit" (components/studio/LogicTool.tsx). Takes the minimal SOP or POS of each output
 * and builds it from AND/OR/NOT, or from NAND or NOR gates alone, laid out the way a textbook
 * draws two-level logic: inputs and inverters, a rail per literal, then the gate levels.
 * Gates on the canvas take up to 4 inputs, so longer terms cascade. Terms and inverters
 * shared between outputs are built once. Self-check: scripts/logic-circuit.check.ts.
 * ponytail: a literal feeding the second level directly (y = a + bc) can cross a first-level
 * gate on the canvas; the wires are right, only the drawing is tight.
 */
import type { Circuit, Part, PartKind, PinRef, Wire } from "./circuit";
import { SNAP, size } from "./circuit-edit";
import { type Implicant, type TruthTable, literals, minimizePos, minimizeSop } from "./logic-min";

export type CircuitForm = "sop" | "pos" | "nand" | "nor";

export const FORM_LABELS: Record<CircuitForm, string> = {
  sop: "AND-OR (SOP)", pos: "OR-AND (POS)", nand: "NAND only", nor: "NOR only",
};

const MAX_FANIN = 4;
const TOP = 40, ROW = 100, RAIL_GAP = 14, LANE = 12, GATE_GAP = 26, INV_X = 130;

/** Where the truth-table tool leaves a circuit for the editor to pick up when it opens. */
export const CIRCUIT_INCOMING_KEY = "bitflow_studio_circuit_incoming";

/** How many gates a circuit uses (whatever their inputs), the cost the forms are compared by. */
export const gateCount = (c: Circuit) => c.parts.filter((p) => ["not", "and", "or", "xor", "nand", "nor", "xnor"].includes(p.kind)).length;

interface Gate { part: Part; level: number }

export function circuitFromTable(t: TruthTable, form: CircuitForm, module = "logic_fn"): Circuit {
  const n = t.inputs.length;
  const parts: Part[] = [], wires: Wire[] = [], gates: Gate[] = [];
  const used = new Set<string>([module, ...t.inputs, ...t.outputs.map((o) => o.name)]);
  let id = 0;
  const label = (want: string) => {
    let name = want;
    for (let i = 2; used.has(name); i++) name = `${want}${i}`;
    used.add(name);
    return name;
  };
  const add = (kind: PartKind, name: string, extra: Partial<Part> = {}): Part => {
    const p: Part = { id: `p${++id}`, kind, label: name, x: 0, y: 0, ...extra };
    parts.push(p);
    return p;
  };
  const link = (from: PinRef, to: PinRef) => wires.push({ id: `w${++id}`, from, to });

  const switches = t.inputs.map((name) => add("switch", name));
  const levelOf = new Map<string, number>();         // a part's gate level (a switch and its inverter: 0)

  /** One gate over pins (at most 4), remembered by what it reads so a repeat is shared. */
  const built = new Map<string, PinRef>();
  const gate = (kind: PartKind, ins: PinRef[]): PinRef => {
    const k = `${kind}:${ins.map((r) => `${r.part}.${r.pin}`).sort().join(",")}`;
    const hit = built.get(k);
    if (hit) return hit;
    const count = Math.max(2, ins.length);
    const p = add(kind, label(`g${gates.length + 1}`), count > 2 ? { n: count } : {});
    ["a", "b", "c", "d"].slice(0, count).forEach((pin, i) => link(ins[i] ?? ins[0], { part: p.id, pin }));   // one input: both pins tied (a NAND or NOR as an inverter)
    const level = 1 + Math.max(...ins.map((r) => levelOf.get(r.part) ?? 0));
    levelOf.set(p.id, level);
    gates.push({ part: p, level });
    const out = { part: p.id, pin: "y" };
    built.set(k, out);
    return out;
  };
  /** The gate a NAND- or NOR-only form is made of. */
  const prim: PartKind = form === "nor" ? "nor" : "nand";
  const invert = (r: PinRef) => gate(prim, [r]);
  /** AND or OR of any number of pins, cascading past 4 inputs. */
  const tree = (kind: "and" | "or", ins: PinRef[]): PinRef => {
    if (ins.length === 1) return ins[0];
    if (ins.length <= MAX_FANIN) return gate(kind, ins);
    return tree(kind, [gate(kind, ins.slice(0, MAX_FANIN)), ...ins.slice(MAX_FANIN)]);
  };
  /** NAND (or NOR) of any number of pins: past 4 inputs, the first four are combined and re-inverted. */
  const inverting = (ins: PinRef[]): PinRef => {
    if (ins.length <= MAX_FANIN) return gate(prim, ins);
    return inverting([invert(gate(prim, ins.slice(0, MAX_FANIN))), ...ins.slice(MAX_FANIN)]);
  };

  const inverters = new Map<number, Part>();
  const literal = (i: number, positive: boolean): PinRef => {
    const from = { part: switches[i].id, pin: "out" };
    if (positive) return from;
    let inv = inverters.get(i);
    if (!inv) {
      const pure = form === "nand" || form === "nor";
      inv = add(pure ? prim : "not", label(`n_${t.inputs[i]}`));
      link(from, { part: inv.id, pin: "a" });
      if (pure) link(from, { part: inv.id, pin: "b" });
      inverters.set(i, inv);
    }
    return { part: inv.id, pin: "y" };
  };
  /** A term's literals; in a POS the term came from the zeros, so its literals are complemented. */
  const lits = (term: Implicant, complement: boolean): PinRef[] => t.inputs.flatMap((_, i) => {
    const bit = 1 << (n - 1 - i);
    return term.mask & bit ? [] : [literal(i, !!(term.value & bit) !== complement)];
  });
  const constant = (one: boolean): PinRef => {
    const existing = parts.find((p) => p.kind === (one ? "const1" : "const0"));
    return { part: (existing ?? add(one ? "const1" : "const0", one ? "one" : "zero")).id, pin: "out" };
  };

  const leds: { part: Part; from: PinRef }[] = [];
  for (const o of t.outputs) {
    const isSop = form === "sop" || form === "nand";
    const terms = isSop ? minimizeSop(n, o.cells) : minimizePos(n, o.cells);
    let out: PinRef;
    if (!terms.length) out = constant(!isSop);       // no ones: 0; no zeros: 1
    else if (terms.some((x) => literals(x, n) === 0)) out = constant(isSop);
    else if (terms.length === 1 && literals(terms[0], n) === 1) out = lits(terms[0], !isSop)[0];   // y = a, in any form
    else if (form === "sop") out = tree("or", terms.map((x) => tree("and", lits(x, false))));
    else if (form === "pos") out = tree("and", terms.map((x) => tree("or", lits(x, true))));
    else {
      // NAND-NAND for a SOP; NOR-NOR for a POS. A one-literal term still needs its inversion
      out = inverting(terms.map((x) => { const ls = lits(x, !isSop); return ls.length === 1 ? invert(ls[0]) : inverting(ls); }));
    }
    leds.push({ part: add("led", o.name), from: out });
  }
  for (const { part, from } of leds) link(from, { part: part.id, pin: "in" });

  place(n, switches, inverters, gates, leds, parts, wires);
  return { module, parts, wires, notes: [] };
}

const snapped = (v: number) => Math.round(v / SNAP) * SNAP;

/** Inputs and inverters on the left, a vertical rail per literal, then a column per gate level, then the outputs. */
function place(n: number, switches: Part[], inverters: Map<number, Part>, gates: Gate[], leds: { part: Part; from: PinRef }[], parts: Part[], wires: Wire[]) {
  const byId = new Map(parts.map((p) => [p.id, p]));
  switches.forEach((s, i) => { s.x = 40; s.y = TOP + i * ROW; });
  for (const [i, p] of inverters) { p.x = INV_X; p.y = TOP + i * ROW + 40; }
  parts.filter((p) => p.kind === "const0" || p.kind === "const1").forEach((p, i) => { p.x = 40; p.y = TOP + (n + i) * ROW; });

  // The rails: one x per literal (a switch's true value, and its inverter's)
  const railX = new Map<string, number>();
  let x = INV_X + 90;
  for (let i = 0; i < n; i++) {
    railX.set(switches[i].id, x); x += RAIL_GAP;
    const inv = inverters.get(i);
    if (inv) { railX.set(inv.id, x); x += RAIL_GAP; }
  }

  // Gate columns, each after a gap wide enough for the wires that turn in it
  const levels = [...new Set(gates.map((g) => g.level))].sort((a, b) => a - b);
  const levelOfPart = new Map(gates.map((g) => [g.part.id, g.level]));
  const turning = (lv: number) => wires.filter((w) => !railX.has(w.from.part) && levelOfPart.get(w.to.part) === lv).length;
  const column = (lv: number) => gates.filter((g) => g.level === lv);
  const height = (lv: number) => column(lv).reduce((h, g) => h + size(g.part).h + GATE_GAP, -GATE_GAP);
  const tallest = Math.max(n * ROW, ...levels.map(height));
  x += 30;
  for (const lv of levels) {
    x += turning(lv) ? turning(lv) * LANE + 24 : 0;
    let y = TOP + (tallest - height(lv)) / 2;        // centred, so the lines fan in evenly
    for (const g of column(lv)) { g.part.x = x; g.part.y = snapped(y); y += size(g.part).h + GATE_GAP; }
    x += Math.max(...column(lv).map((g) => size(g.part).w));
  }

  // Outputs level with what drives them, pushed apart if they would overlap
  const ledX = snapped(x + 40 + leds.length * LANE);
  const wanted = (l: { from: PinRef }) => { const a = byId.get(l.from.part)!; return a.y + size(a).h / 2 - 18; };
  let lastY = -Infinity;
  for (const l of [...leds].sort((a, b) => wanted(a) - wanted(b))) {
    l.part.x = ledX;
    l.part.y = snapped(Math.max(wanted(l), lastY + 50));
    lastY = l.part.y;
  }

  // Each wire turns on its literal's rail, or on a lane of its own in the gap before where it ends
  const lanes = new Map<number, number>();
  for (const w of wires) {
    const a = byId.get(w.from.part)!, b = byId.get(w.to.part)!;
    if (a.kind === "switch" && (b === inverters.get(switches.indexOf(a)))) continue;   // the short hop to its own inverter
    const rail = railX.get(w.from.part);
    if (rail !== undefined) { w.bend = rail; continue; }
    const k = lanes.get(b.x) ?? 0;
    lanes.set(b.x, k + 1);
    w.bend = b.x - 16 - k * LANE;
  }
}
