/**
 * lib/studio/circuit-edit.ts — the circuit editor's geometry and editing operations
 * (components/studio/CircuitTool.tsx): part sizes and pin positions, wire routes,
 * selections, box select, move, delete, copy/paste and undo history. Pure functions
 * on lib/studio/circuit.ts circuits. Self-check: scripts/circuit.check.ts.
 */
import { type Circuit, type Note, type Part, type Wire, pins } from "./circuit";

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
    case "dff": case "tff": case "jkff": return { w: 64, h: n * 20 + 24 };
    case "reg": case "counter": return { w: 76, h: n * 20 + 24 };
    case "adder": return { w: 76, h: 84 };
    case "cmp": return { w: 70, h: 76 };
    case "decoder": return { w: 70, h: 56 };
    case "split": case "merge": return { w: 44, h: Math.max(40, Math.max(n, outputs.length) * 14 + 12) };
    case "not": return { w: 56, h: 36 };
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
export function wirePath(a: { x: number; y: number }, b: { x: number; y: number }, lane = 0, bend?: number): string {
  if (forward(a, b)) {
    const room = Math.max(0, (b.x - a.x) / 2 - 8);
    const mx = bend !== undefined ? Math.max(a.x + 8, Math.min(b.x - 8, bend))
                                  : Math.round((a.x + b.x) / 2 + Math.max(-room, Math.min(room, lane)));
    return `M ${a.x} ${a.y} H ${mx} V ${b.y} H ${b.x}`;
  }
  const midY = bend ?? Math.round((a.y + b.y) / 2);
  return `M ${a.x} ${a.y} H ${a.x + 12} V ${midY} H ${b.x - 12} V ${b.y} H ${b.x}`;
}

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
