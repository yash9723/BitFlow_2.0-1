/**
 * lib/academy/draw.ts — a short way for an Academy chapter to describe a circuit in code:
 * place parts by label and connect outputs to inputs. Each circuit is compiled and its stated
 * behaviour tested by scripts/academy.check.ts.
 */
import type { Circuit, Part, PartKind, PinRef } from "@/lib/studio/circuit";
import type { Cell } from "@/lib/studio/logic-min";

export interface Draw {
  /** A 1-bit input. */
  sw: (label: string, x: number, y: number) => PinRef;
  clock: (label: string, x: number, y: number) => PinRef;
  /** A bus input, set by clicking its display. */
  hex: (label: string, w: number, x: number, y: number) => PinRef;
  /** A gate (or any part with output y), wired from its inputs in pin order a, b, c, d. */
  gate: (kind: PartKind, label: string, x: number, y: number, ...ins: PinRef[]) => PinRef;
  led: (label: string, x: number, y: number, from: PinRef) => void;
  display: (label: string, w: number, x: number, y: number, from: PinRef) => void;
  /** Any other part; connect it with wire() and read it with pin(). */
  part: (kind: PartKind, label: string, x: number, y: number, extra?: Partial<Part>) => string;
  wire: (from: PinRef, part: string, pin: string) => void;
  pin: (part: string, pin: string) => PinRef;
}

export function draw(module: string, build: (d: Draw) => void): Circuit {
  const c: Circuit = { module, parts: [], wires: [], notes: [] };
  const part: Draw["part"] = (kind, label, x, y, extra = {}) => { c.parts.push({ id: label, kind, label, x, y, ...extra }); return label; };
  const wire: Draw["wire"] = (from, to, pin) => { c.wires.push({ id: `w${c.wires.length}`, from, to: { part: to, pin } }); };
  const pin: Draw["pin"] = (p, name) => ({ part: p, pin: name });
  build({
    part, wire, pin,
    sw: (label, x, y) => pin(part("switch", label, x, y), "out"),
    clock: (label, x, y) => pin(part("clock", label, x, y), "out"),
    hex: (label, w, x, y) => pin(part("hexin", label, x, y, { w }), "out"),
    gate: (kind, label, x, y, ...ins) => {
      const id = part(kind, label, x, y, ins.length > 2 ? { n: ins.length } : {});
      ins.forEach((from, i) => wire(from, id, "abcd"[i]));
      return pin(id, "y");
    },
    led: (label, x, y, from) => wire(from, part("led", label, x, y), "in"),
    display: (label, w, x, y, from) => wire(from, part("hexout", label, x, y, { w }), "in"),
  });
  return c;
}

/** A K-map's cells from its minterms and don't-cares. */
export const cells = (n: number, ones: number[], dontCares: number[] = []): Cell[] =>
  Array.from({ length: 2 ** n }, (_, m) => (ones.includes(m) ? 1 : dontCares.includes(m) ? "x" : 0));

/** Shorthand for the two most common chapter blocks. */
export const p = (text: string) => ({ kind: "text" as const, text });
export const ul = (...items: string[]) => ({ kind: "list" as const, items });
