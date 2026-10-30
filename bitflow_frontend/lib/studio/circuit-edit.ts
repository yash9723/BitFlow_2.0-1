/**
 * lib/studio/circuit-edit.ts — the circuit editor's geometry and editing operations
 * (components/studio/CircuitTool.tsx): part sizes and pin positions, wire routes,
 * selections, box select, move, delete, copy/paste and undo history. Pure functions
 * on lib/studio/circuit.ts circuits. Self-check: scripts/circuit.check.ts.
 */
import {
  type Circuit, type Library, type Note, type Part, type PartKind, type PinRef, type Wire, INPUT_KINDS, OUTPUT_KINDS, blockPorts, pinWidth, pins,
} from "./circuit";
import { nameProblem } from "./logic-min";

export const SNAP = 10;

// ── Geometry ──────────────────────────────────────────────────────────────────

export function size(p: Part): { w: number; h: number } {
  const { inputs, outputs } = pins(p);
  const n = inputs.length;
  switch (p.kind) {
    case "switch": case "button": case "clock": case "const0": case "const1": return { w: 60, h: 36 };
    case "hexin": case "const": return { w: 76, h: 40 };
    case "led": return { w: 44, h: 36 };
    case "hexout": return { w: 76, h: 44 };
    case "seg7": return { w: 60, h: 104 };
    case "mux2": return { w: 56, h: 76 };
    case "mux": return { w: 60, h: Math.max(76, n * 18 + 12) };
    case "demux": return { w: 60, h: Math.max(76, outputs.length * 18 + 12) };
    case "encoder": case "priority": return { w: 76, h: 60 };
    case "bcd7": return { w: 70, h: 118 };
    case "alu": return { w: 84, h: 92 };
    case "shift": return { w: 84, h: n * 20 + 24 };
    case "rom": return { w: 76, h: 60 };
    case "ram": return { w: 84, h: n * 20 + 24 };
    case "keypad": return { w: 156, h: 124 };
    case "probe": return { w: 64, h: 30 };
    case "tri": return { w: 56, h: 44 };
    case "bus": return { w: 44, h: Math.max(44, n * 18 + 12) };
    case "dff": case "tff": case "jkff": return { w: 64, h: n * 20 + 24 };
    case "reg": case "counter": return { w: 76, h: n * 20 + 24 };
    case "adder": return { w: 76, h: 84 };
    case "cmp": return { w: 70, h: 76 };
    case "decoder": return { w: 70, h: 56 };
    case "split": case "merge": return { w: 44, h: Math.max(40, Math.max(n, outputs.length) * 14 + 12) };
    case "not": return { w: 56, h: 36 };
    case "block": return { w: 100, h: Math.max(44, Math.max(n, outputs.length) * 20 + 24) };
    default: return { w: 64, h: Math.max(44, n * 16 + 12) };
  }
}

/** Inputs spread down the left edge, outputs down the right. */
export function pinPos(p: Part, pin: string): { x: number; y: number } {
  const { w, h } = size(p);
  const { inputs, outputs } = pins(p);
  const i = inputs.indexOf(pin);
  if (i >= 0) return { x: p.x, y: p.y + ((i + 1) * h) / (inputs.length + 1) };
  const o = Math.max(0, outputs.indexOf(pin));
  return { x: p.x + w, y: p.y + ((o + 1) * h) / (outputs.length + 1) };
}

/** A note's text wrapped at 28 characters a line. */
export const noteLines = (n: Note) => n.text.split("\n").flatMap((l) => l.match(/.{1,28}(\s|$)|\S+/g) ?? [""]);
/** A note's box: about 6.5 px per character. */
export function noteSize(n: Note): { w: number; h: number } {
  const lines = noteLines(n);
  return { w: Math.max(80, Math.min(28, Math.max(...lines.map((l) => l.length))) * 6.5 + 16), h: lines.length * 14 + 12 };
}

/** Does the wire run forwards (output left of input)? Backward wires route around the parts. */
export const forward = (a: { x: number }, b: { x: number }) => b.x >= a.x + 16;

/**
 * Orthogonal route. A forward wire runs right, down/up at `bend` (or a default that `lane`
 * staggers so wires sharing a gap don't overlap), then right again; a backward (feedback)
 * wire loops around through y = `bend` (default: halfway).
 */
export function wirePoints(a: { x: number; y: number }, b: { x: number; y: number }, lane = 0, bend?: number): [number, number][] {
  if (forward(a, b)) {
    const room = Math.max(0, (b.x - a.x) / 2 - 8);
    const mx = bend !== undefined ? Math.max(a.x + 8, Math.min(b.x - 8, bend))
                                  : Math.round((a.x + b.x) / 2 + Math.max(-room, Math.min(room, lane)));
    return [[a.x, a.y], [mx, a.y], [mx, b.y], [b.x, b.y]];
  }
  const midY = bend ?? Math.round((a.y + b.y) / 2);
  return [[a.x, a.y], [a.x + 12, a.y], [a.x + 12, midY], [b.x - 12, midY], [b.x - 12, b.y], [b.x, b.y]];
}
export const wirePath = (a: { x: number; y: number }, b: { x: number; y: number }, lane = 0, bend?: number) =>
  wirePoints(a, b, lane, bend).map(([x, y], i) => (i === 0 ? `M ${x} ${y}` : i % 2 ? `H ${x}` : `V ${y}`)).join(" ");

/** The smallest box around every part and note (null for an empty circuit). */
export function bounds(c: Circuit): { x: number; y: number; w: number; h: number } | null {
  const boxes = [
    ...c.parts.map((p) => ({ x: p.x, y: p.y - 14, ...size(p) })),
    ...(c.notes ?? []).map((n) => ({ x: n.x, y: n.y, ...noteSize(n) })),
  ];
  if (!boxes.length) return null;
  const x = Math.min(...boxes.map((b) => b.x)), y = Math.min(...boxes.map((b) => b.y));
  return { x, y, w: Math.max(...boxes.map((b) => b.x + b.w)) - x, h: Math.max(...boxes.map((b) => b.y + b.h + 14)) - y };
}

// ── Selection ─────────────────────────────────────────────────────────────────

export interface Selection { parts: string[]; wires: string[]; notes: string[] }
export const NONE: Selection = { parts: [], wires: [], notes: [] };
export const isEmpty = (s: Selection) => !s.parts.length && !s.wires.length && !s.notes.length;
export const selectAll = (c: Circuit): Selection =>
  ({ parts: c.parts.map((p) => p.id), wires: c.wires.map((w) => w.id), notes: (c.notes ?? []).map((n) => n.id) });

/** Parts and notes touching the rectangle, plus the wires between those parts. */
export function inRect(c: Circuit, r: { x1: number; y1: number; x2: number; y2: number }): Selection {
  const [x1, x2] = [Math.min(r.x1, r.x2), Math.max(r.x1, r.x2)], [y1, y2] = [Math.min(r.y1, r.y2), Math.max(r.y1, r.y2)];
  const hits = (x: number, y: number, w: number, h: number) => x < x2 && x + w > x1 && y < y2 && y + h > y1;
  const parts = c.parts.filter((p) => { const s = size(p); return hits(p.x, p.y, s.w, s.h); }).map((p) => p.id);
  const inside = new Set(parts);
  return {
    parts,
    wires: c.wires.filter((w) => inside.has(w.from.part) && inside.has(w.to.part)).map((w) => w.id),
    notes: (c.notes ?? []).filter((n) => { const s = noteSize(n); return hits(n.x, n.y, s.w, s.h); }).map((n) => n.id),
  };
}

/** Union of two selections (shift-select), or `b` toggled within `a`. */
export function merge(a: Selection, b: Selection, toggle = false): Selection {
  const one = (x: string[], y: string[]) => toggle
    ? [...x.filter((id) => !y.includes(id)), ...y.filter((id) => !x.includes(id))]
    : [...new Set([...x, ...y])];
  return { parts: one(a.parts, b.parts), wires: one(a.wires, b.wires), notes: one(a.notes, b.notes) };
}

// ── Edits ─────────────────────────────────────────────────────────────────────

/** Move the selected parts and notes by (dx, dy); a hand-bent wire between two moved parts moves its bend too. */
export function move(c: Circuit, s: Selection, dx: number, dy: number): Circuit {
  if (!dx && !dy) return c;
  const ps = new Set(s.parts), ns = new Set(s.notes);
  const byId = new Map(c.parts.map((p) => [p.id, p]));
  const isForward = (w: Wire) => {
    const a = byId.get(w.from.part), b = byId.get(w.to.part);
    return !!a && !!b && forward(pinPos(a, w.from.pin), pinPos(b, w.to.pin));
  };
  return {
    ...c,
    parts: c.parts.map((p) => (ps.has(p.id) ? { ...p, x: p.x + dx, y: p.y + dy } : p)),
    notes: c.notes?.map((n) => (ns.has(n.id) ? { ...n, x: n.x + dx, y: n.y + dy } : n)),
    wires: c.wires.map((w) => (w.bend !== undefined && ps.has(w.from.part) && ps.has(w.to.part)
      ? { ...w, bend: w.bend + (isForward(w) ? dx : dy) } : w)),
  };
}

/** Delete the selection; removing a part removes its wires. */
export function remove(c: Circuit, s: Selection): Circuit {
  const ps = new Set(s.parts), ws = new Set(s.wires), ns = new Set(s.notes);
  return {
    ...c,
    parts: c.parts.filter((p) => !ps.has(p.id)),
    wires: c.wires.filter((w) => !ws.has(w.id) && !ps.has(w.from.part) && !ps.has(w.to.part)),
    notes: c.notes?.filter((n) => !ns.has(n.id)),
  };
}

export interface Clip { parts: Part[]; wires: Wire[]; notes: Note[] }

/** The selected parts and notes, with every wire between two selected parts (selected or not). */
export function copy(c: Circuit, s: Selection): Clip {
  const ps = new Set(s.parts), ns = new Set(s.notes);
  return {
    parts: c.parts.filter((p) => ps.has(p.id)),
    wires: c.wires.filter((w) => ps.has(w.from.part) && ps.has(w.to.part)),
    notes: (c.notes ?? []).filter((n) => ns.has(n.id)),
  };
}

/** "a" -> "a2", "sw3" -> "sw4": the next label not in `used`. */
export function nextLabel(label: string, used: Set<string>): string {
  if (!used.has(label)) return label;
  const num = /\d+$/.exec(label);
  const base = num && num.index > 0 ? label.slice(0, num.index) : label;
  for (let i = num && num.index > 0 ? Number(num[0]) + 1 : 2; ; i++) if (!used.has(`${base}${i}`)) return `${base}${i}`;
}

/** Paste a clip offset by (dx, dy): new ids, labels renamed where they would clash. Returns the pasted selection. */
export function paste(c: Circuit, clip: Clip, dx: number, dy: number, uid: (prefix: string) => string): { circuit: Circuit; sel: Selection } {
  const used = new Set([c.module, ...c.parts.map((p) => p.label)]);
  const ids = new Map<string, string>();
  const parts = clip.parts.map((p) => {
    const id = uid("p"), label = nextLabel(p.label, used);
    ids.set(p.id, id);
    used.add(label);
    return { ...p, id, label, x: p.x + dx, y: p.y + dy };
  });
  const wires = clip.wires.filter((w) => ids.has(w.from.part) && ids.has(w.to.part)).map((w) => ({
    id: uid("w"), from: { ...w.from, part: ids.get(w.from.part)! }, to: { ...w.to, part: ids.get(w.to.part)! },
  }));
  const notes = clip.notes.map((n) => ({ ...n, id: uid("n"), x: n.x + dx, y: n.y + dy }));
  return {
    circuit: { ...c, parts: [...c.parts, ...parts], wires: [...c.wires, ...wires], notes: [...(c.notes ?? []), ...notes] },
    sel: { parts: parts.map((p) => p.id), wires: wires.map((w) => w.id), notes: notes.map((n) => n.id) },
  };
}

// ── Blocks (subcircuits) ─────────────────────────────────────────────────────

/** Why `name` can't name a new block in `top`, or null. */
export function blockNameIssue(top: Circuit, name: string): string | null {
  const np = nameProblem(name);
  if (np) return `"${name}" ${np}.`;
  if (name === top.module || top.blocks?.[name]) return `"${name}" is already used.`;
  return null;
}

/** Does block `name` contain block `target` (or is it `target`)? A block can't be placed inside one of these. */
export function usesBlock(lib: Library, name: string, target: string, depth = 0): boolean {
  if (name === target || depth > 8) return true;
  return (lib[name]?.parts ?? []).some((p) => p.kind === "block" && !!p.block && usesBlock(lib, p.block, target, depth + 1));
}

/**
 * Turn the selected parts into block `name`: wires crossing the selection become its pins
 * (one input per outside signal, one output per inside signal used outside), and the parts
 * are replaced by one instance of it. Returns the new circuit and the block's definition,
 * or why it can't be done.
 */
export function makeBlock(c: Circuit, s: Selection, name: string, uid: (prefix: string) => string):
  { circuit: Circuit; def: Circuit; instance: string } | string {
  const inside = c.parts.filter((p) => s.parts.includes(p.id));
  if (!inside.length) return "Select the parts to put in the block first.";
  if (inside.some((p) => INPUT_KINDS.includes(p.kind) || OUTPUT_KINDS.includes(p.kind))) {
    return "Leave switches, clocks, LEDs and displays out of the selection: the wires crossing it become the block's pins.";
  }
  const ps = new Set(inside.map((p) => p.id));
  const byId = new Map(c.parts.map((p) => [p.id, p]));
  const k = (r: PinRef) => `${r.part}.${r.pin}`;
  const used = new Set<string>();
  for (const p of inside) {
    used.add(p.label);
    if (pins(p).outputs.length > 1) for (const o of pins(p).outputs) used.add(`${p.label}_${o}`);
    if (p.kind === "block") used.add(`u_${p.label}`);
  }
  const portName = (want: string) => { const n = nextLabel(want.replace(/[^A-Za-z0-9_]/g, "_"), used); used.add(n); return n; };
  const pinName = (r: PinRef) => { const p = byId.get(r.part)!; return pins(p).outputs.length > 1 ? `${p.label}_${r.pin}` : p.label; };

  const b = bounds({ ...c, parts: inside, notes: [] })!;
  const crossingIn = c.wires.filter((w) => ps.has(w.to.part) && !ps.has(w.from.part) && byId.has(w.from.part));
  const crossingOut = c.wires.filter((w) => ps.has(w.from.part) && !ps.has(w.to.part) && byId.has(w.to.part));
  const at = (r: PinRef) => pinPos(byId.get(r.part)!, r.pin).y;

  // One input port per outside source, in top-to-bottom order of where it enters
  const ins = new Map<string, Part>();
  for (const w of [...crossingIn].sort((x, y) => at(x.to) - at(y.to))) {
    if (ins.has(k(w.from))) continue;
    const src = byId.get(w.from.part)!, wd = pinWidth(src, w.from.pin);
    const kind: PartKind = src.kind === "clock" ? "clock" : wd > 1 ? "hexin" : "switch";
    ins.set(k(w.from), { id: uid("p"), kind, label: portName(pinName(w.from)), x: b.x - 120, y: b.y + ins.size * 60, ...(wd > 1 ? { w: wd } : {}) });
  }
  // One output port per inside source used outside: named after the LED/display it drove, if any
  const outs = new Map<string, Part>();
  for (const w of [...crossingOut].sort((x, y) => at(x.from) - at(y.from))) {
    if (outs.has(k(w.from))) continue;
    const sink = byId.get(w.to.part)!, wd = pinWidth(byId.get(w.from.part)!, w.from.pin);
    const want = OUTPUT_KINDS.includes(sink.kind) ? sink.label : `${pinName(w.from)}_out`;
    outs.set(k(w.from), { id: uid("p"), kind: wd > 1 ? "hexout" : "led", label: portName(want), x: b.x + b.w + 80, y: b.y + outs.size * 60, ...(wd > 1 ? { w: wd } : {}) });
  }
  const split = (key: string): PinRef => { const i = key.lastIndexOf("."); return { part: key.slice(0, i), pin: key.slice(i + 1) }; };

  const def: Circuit = {
    module: name,
    parts: [...ins.values(), ...inside, ...outs.values()],
    wires: [
      ...c.wires.filter((w) => ps.has(w.from.part) && ps.has(w.to.part)),
      ...crossingIn.map((w) => ({ id: uid("w"), from: { part: ins.get(k(w.from))!.id, pin: "out" }, to: w.to })),
      ...[...outs].map(([src, o]) => ({ id: uid("w"), from: split(src), to: { part: o.id, pin: "in" } })),
    ],
    notes: (c.notes ?? []).filter((n) => s.notes.includes(n.id)),
  };

  const outer = new Set(c.parts.filter((p) => !ps.has(p.id)).map((p) => p.label));
  const inst: Part = { id: uid("p"), kind: "block", block: name, ports: blockPorts(def), label: nextLabel(`${name}1`, outer), x: 0, y: 0 };
  const sz = size(inst);
  inst.x = Math.round((b.x + b.w / 2 - sz.w / 2) / SNAP) * SNAP;
  inst.y = Math.round((b.y + b.h / 2 - sz.h / 2) / SNAP) * SNAP;
  const circuit: Circuit = {
    ...c,
    parts: [...c.parts.filter((p) => !ps.has(p.id)), inst],
    wires: [
      ...c.wires.filter((w) => !ps.has(w.from.part) && !ps.has(w.to.part)),
      ...[...ins].map(([src, i]) => ({ id: uid("w"), from: split(src), to: { part: inst.id, pin: i.label } })),
      ...crossingOut.map((w) => ({ id: uid("w"), from: { part: inst.id, pin: outs.get(k(w.from))!.label }, to: w.to })),
    ],
    notes: (c.notes ?? []).filter((n) => !s.notes.includes(n.id)),
  };
  return { circuit, def, instance: inst.id };
}

/**
 * `top` with block `name` set to `def`: every instance of it (in the top circuit and in
 * other blocks) gets its new pins, and wires to pins it no longer has are dropped.
 */
export function withBlock(top: Circuit, name: string, def: Circuit): Circuit {
  const { blocks: _nested, ...plain } = def;   // the library lives on the top circuit only
  const ports = blockPorts(plain);
  const sync = (x: Circuit): Circuit => {
    if (!x.parts.some((p) => p.kind === "block" && p.block === name)) return x;
    const parts = x.parts.map((p) => (p.kind === "block" && p.block === name ? { ...p, ports } : p));
    const byId = new Map(parts.map((p) => [p.id, p]));
    const has = (r: PinRef, out: boolean) => { const p = byId.get(r.part); return !p || (out ? pins(p).outputs : pins(p).inputs).includes(r.pin); };
    return { ...x, parts, wires: x.wires.filter((w) => has(w.from, true) && has(w.to, false)) };
  };
  const lib: Library = { ...top.blocks, [name]: { ...plain, module: name } };
  return { ...sync(top), blocks: Object.fromEntries(Object.entries(lib).map(([n, d]) => [n, sync(d)])) };
}

/** Rename block `from` to `to` everywhere it is used. */
export function renameBlock(top: Circuit, from: string, to: string): Circuit {
  const re = (x: Circuit): Circuit => ({ ...x, parts: x.parts.map((p) => (p.kind === "block" && p.block === from ? { ...p, block: to } : p)) });
  return {
    ...re(top),
    blocks: Object.fromEntries(Object.entries(top.blocks ?? {}).map(([n, d]) => (n === from ? [to, { ...re(d), module: to }] : [n, re(d)]))),
  };
}

/**
 * Ungroup: replace block instance `instanceId` by a copy of its definition's parts, wired to
 * what the instance's pins were wired to (its port parts disappear). Labels that would clash
 * are renamed. The block stays in the library. Returns the new circuit and the copied parts.
 */
export function ungroupBlock(c: Circuit, instanceId: string, uid: (prefix: string) => string): { circuit: Circuit; sel: Selection } | string {
  const inst = c.parts.find((p) => p.id === instanceId);
  if (!inst || inst.kind !== "block") return "Select one block to ungroup.";
  const def = c.blocks?.[inst.block ?? ""];
  if (!def) return `Block ${inst.block} isn't in this circuit's library.`;
  const portIds = new Set(def.parts.filter((p) => INPUT_KINDS.includes(p.kind) || OUTPUT_KINDS.includes(p.kind)).map((p) => p.id));
  const inner = def.parts.filter((p) => !portIds.has(p.id));
  const portOf = new Map(def.parts.filter((p) => portIds.has(p.id)).map((p) => [p.id, p.label]));

  // copies of the inner parts, centred where the instance was
  const b = bounds({ ...def, parts: inner.length ? inner : def.parts, notes: [] });
  const sz = size(inst);
  const dx = Math.round((inst.x + sz.w / 2 - (b ? b.x + b.w / 2 : 0)) / SNAP) * SNAP;
  const dy = Math.round((inst.y + sz.h / 2 - (b ? b.y + b.h / 2 : 0)) / SNAP) * SNAP;
  const used = new Set([c.module, ...c.parts.filter((p) => p.id !== inst.id).map((p) => p.label)]);
  const ids = new Map<string, string>();
  const parts = inner.map((p) => {
    const id = uid("p"), label = nextLabel(p.label, used);
    used.add(label);
    ids.set(p.id, id);
    return { ...p, id, label, x: p.x + dx, y: p.y + dy };
  });

  // what drove each input pin of the instance, and what each output pin drove
  const drivers = new Map<string, PinRef[]>(), loads = new Map<string, PinRef[]>();
  for (const w of c.wires) {
    if (w.to.part === inst.id) drivers.set(w.to.pin, [...(drivers.get(w.to.pin) ?? []), w.from]);
    if (w.from.part === inst.id) loads.set(w.from.pin, [...(loads.get(w.from.pin) ?? []), w.to]);
  }
  const wires: Wire[] = [];
  for (const w of def.wires) {
    const fromPort = portOf.get(w.from.part), toPort = portOf.get(w.to.part);
    const froms = fromPort !== undefined ? drivers.get(fromPort) ?? [] : ids.has(w.from.part) ? [{ ...w.from, part: ids.get(w.from.part)! }] : [];
    const tos = toPort !== undefined ? loads.get(toPort) ?? [] : ids.has(w.to.part) ? [{ ...w.to, part: ids.get(w.to.part)! }] : [];
    for (const from of froms) for (const to of tos) wires.push({ id: uid("w"), from, to });
  }
  const notes = (def.notes ?? []).map((n) => ({ ...n, id: uid("n"), x: n.x + dx, y: n.y + dy }));
  return {
    circuit: {
      ...c,
      parts: [...c.parts.filter((p) => p.id !== inst.id), ...parts],
      wires: [...c.wires.filter((w) => w.from.part !== inst.id && w.to.part !== inst.id), ...wires],
      notes: [...(c.notes ?? []), ...notes],
      probes: c.probes?.filter((r) => r.part !== inst.id),
    },
    sel: { parts: parts.map((p) => p.id), wires: wires.map((w) => w.id), notes: notes.map((n) => n.id) },
  };
}

// ── Undo history ──────────────────────────────────────────────────────────────

/**
 * Snapshots of the circuit. `push` records the state before an edit; edits in the
 * same `group` within GROUP_MS (one drag, one label being typed) share one entry.
 */
export class History {
  static readonly LIMIT = 200;
  static readonly GROUP_MS = 1200;
  private past: Circuit[] = [];
  private future: Circuit[] = [];
  private group = "";
  private at = 0;

  push(before: Circuit, group = "", now = Date.now()): void {
    if (!(group && group === this.group && now - this.at < History.GROUP_MS)) {
      this.past.push(before);
      if (this.past.length > History.LIMIT) this.past.shift();
    }
    this.future = [];
    this.group = group;
    this.at = now;
  }
  undo(current: Circuit): Circuit | null {
    const prev = this.past.pop();
    if (!prev) return null;
    this.future.push(current);
    this.group = "";
    return prev;
  }
  redo(current: Circuit): Circuit | null {
    const next = this.future.pop();
    if (!next) return null;
    this.past.push(current);
    this.group = "";
    return next;
  }
  get canUndo() { return this.past.length > 0; }
  get canRedo() { return this.future.length > 0; }
  clear() { this.past = []; this.future = []; this.group = ""; }
}
