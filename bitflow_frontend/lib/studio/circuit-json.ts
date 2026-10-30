/**
 * lib/studio/circuit-json.ts — a circuit that came from outside (a save, a share link, a graded
 * submission): is it the right shape, and how big is it once its blocks are expanded? The
 * server runs this before compiling anything a client sent.
 * Self-check: scripts/circuit-challenges.check.ts.
 */
import type { Circuit, Library, PartKind } from "./circuit";

export const MAX_CIRCUIT_CHARS = 128 * 1024;        // as a saved project's file
const MAX_PARTS = 2000, MAX_WIRES = 10_000, MAX_BLOCKS = 100;

const KNOWN: Record<PartKind, true> = {
  switch: true, button: true, clock: true, hexin: true, const0: true, const1: true, const: true,
  not: true, and: true, or: true, xor: true, nand: true, nor: true, xnor: true, mux2: true,
  dff: true, tff: true, jkff: true, reg: true, counter: true, adder: true, cmp: true, decoder: true, split: true, merge: true,
  mux: true, demux: true, encoder: true, priority: true, bcd7: true, alu: true, shift: true, rom: true, ram: true, keypad: true, probe: true, tri: true, bus: true, tunin: true, tunout: true,
  led: true, seg7: true, hexout: true, block: true,
};

const isRef = (r: unknown) => !!r && typeof (r as { part?: unknown }).part === "string" && typeof (r as { pin?: unknown }).pin === "string";

/** Why this one circuit's shape is wrong, or null. */
function shapeProblem(c: unknown, blockNames: Set<string>): string | null {
  const x = c as Partial<Circuit> | null;
  if (!x || typeof x !== "object" || typeof x.module !== "string") return "That isn't a circuit.";
  if (!Array.isArray(x.parts) || !Array.isArray(x.wires)) return "That isn't a circuit.";
  if (x.parts.length > MAX_PARTS || x.wires.length > MAX_WIRES) return "That circuit is too large.";
  for (const p of x.parts) {
    if (!p || typeof p.id !== "string" || typeof p.label !== "string" || !Object.prototype.hasOwnProperty.call(KNOWN, p.kind)) return "That circuit has a part this editor doesn't know.";
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return "That circuit has a part with no position.";
    if (p.kind === "block" && !blockNames.has(p.block ?? "")) return `That circuit uses a block "${p.block}" it doesn't include.`;
  }
  for (const w of x.wires) if (!w || typeof w.id !== "string" || !isRef(w.from) || !isRef(w.to)) return "That circuit has a broken wire.";
  return null;
}

/** The circuit in a JSON string or a parsed value, checked; or why it can't be used. */
export function parseCircuit(value: unknown): Circuit | string {
  let c: unknown = value;
  if (typeof value === "string") {
    if (value.length > MAX_CIRCUIT_CHARS) return "That circuit is too large.";
    try { c = JSON.parse(value); } catch { return "That isn't a circuit."; }
  }
  const lib = (c as Circuit | null)?.blocks;
  if (lib !== undefined && (typeof lib !== "object" || lib === null || Array.isArray(lib) || Object.keys(lib).length > MAX_BLOCKS)) return "That circuit has too many blocks.";
  const names = new Set(Object.keys(lib ?? {}));
  const problem = shapeProblem(c, names);
  if (problem) return problem;
  for (const def of Object.values(lib ?? {})) { const p = shapeProblem(def, names); if (p) return p; }
  return c as Circuit;
}

/**
 * How many parts the circuit has with every block expanded; Infinity if a block contains
 * itself. Blocks can multiply, so this is what must be limited before compiling.
 */
export function flatPartCount(c: Circuit, lib: Library = c.blocks ?? {}): number {
  const memo = new Map<string, number>(), active = new Set<string>();
  const count = (x: Circuit): number => x.parts.reduce((n, p) => {
    if (p.kind !== "block") return n + 1;
    const name = p.block ?? "";
    if (active.has(name)) return Infinity;
    if (!memo.has(name)) {
      if (!Object.prototype.hasOwnProperty.call(lib, name)) return n + 1;
      active.add(name);
      memo.set(name, count(lib[name]));
      active.delete(name);
    }
    return n + memo.get(name)!;
  }, 0);
  return count(c);
}

/** Every part kind used, blocks included. */
export function kindsUsed(c: Circuit, lib: Library = c.blocks ?? {}): Set<PartKind> {
  const out = new Set<PartKind>();
  for (const x of [c, ...Object.values(lib)]) for (const p of x.parts) out.add(p.kind);
  return out;
}
