/**
 * lib/studio/delay-sim.ts — the circuit editor's Timing panel: an event-driven simulator
 * where each gate takes time, so the glitches and static hazards that lib/gate-sim.ts settles
 * past become visible. It starts from a settled circuit (any bit's value, usually a live
 * GateSim's), applies one input change, and records every net's changes until all is quiet.
 * Self-check: scripts/circuit.check.ts (it must end where GateSim ends).
 * ponytail: transport delay, so a pulse shorter than a gate's delay still passes; real gates
 * filter those (inertial delay). Rise and fall times are equal.
 */
import { type Bit, type BoardNetlist, OPS } from "../gate-sim";
import type { ParsedVcd } from "../vcd-parser";
import { MinHeap } from "./min-heap";

/** A gate's delay by kind, in any time unit; ff: clock edge to output. NAND counts as AND, NOR as OR, XNOR as XOR. */
export interface Delays { not: number; and: number; or: number; xor: number; mux: number; ff: number }
export const DEFAULT_DELAYS: Delays = { not: 1, and: 2, or: 2, xor: 3, mux: 3, ff: 2 };

const KIND: Record<string, keyof Delays | null> = {
  $_BUF_: null, $_NOT_: "not", $_AND_: "and", $_NAND_: "and", $_ANDNOT_: "and", $_OR_: "or", $_NOR_: "or", $_ORNOT_: "or",
  $_XOR_: "xor", $_XNOR_: "xor", $_MUX_: "mux", $_NMUX_: "mux",
};
const MAX_EVENTS = 500_000;
const slot = (b: Bit | undefined) => (typeof b === "number" ? b : b === "1" ? 1 : 0);

interface Gate { op: (a: number, b: number, s: number) => number; a: number; b: number; s: number; y: number; delay: number }
interface Ff { d: number; c: number; q: number; r: number }

export interface Transient {
  /** Each net that changed, with its value before and every change after. */
  changes: Map<number, { t: number; v: number }[]>;
  before: Map<number, number>;
  /** When the last net changed. */
  settled: number;
  /** Stopped at the event limit: a circuit that keeps oscillating. */
  truncated: boolean;
}

export class DelaySim {
  private v: Uint8Array;
  private gates: Gate[] = [];
  private ffs: Ff[] = [];
  private readers = new Map<number, Gate[]>();
  private clocked = new Map<number, Ff[]>();
  private resets = new Map<number, Ff[]>();
  private ports: BoardNetlist["ports"];
  private ffDelay: number;

  constructor(net: BoardNetlist, delays: Delays, init: (b: Bit) => number) {
    this.ports = net.ports;
    this.ffDelay = delays.ff;
    let max = 1;
    const see = (bits: Bit[]) => bits.forEach((b) => { if (typeof b === "number" && b > max) max = b; });
    Object.values(net.ports).forEach((p) => see(p.bits));
    net.cells.forEach((c) => Object.values(c.conn).forEach(see));
    this.v = new Uint8Array(max + 1);
    for (let b = 2; b <= max; b++) this.v[b] = init(b);
    this.v[1] = 1;
    const add = <T,>(m: Map<number, T[]>, k: number, x: T) => { if (k > 1) (m.get(k) ?? m.set(k, []).get(k)!).push(x); };
    for (const { type, conn } of net.cells) {
      if (type.startsWith("$_DFF")) {
        const f: Ff = { d: slot(conn.D[0]), c: slot(conn.C[0]), q: slot(conn.Q[0]), r: conn.R ? slot(conn.R[0]) : -1 };
        this.ffs.push(f);
        add(this.clocked, f.c, f);
        if (f.r >= 0) add(this.resets, f.r, f);
        continue;
      }
      const kind = KIND[type], op = OPS[type];
      if (!op || kind === undefined) throw new Error(`The timing view can't simulate ${type} cells.`);
      const g: Gate = { op, a: slot(conn.A?.[0]), b: slot(conn.B?.[0]), s: slot(conn.S?.[0]), y: slot(conn.Y[0]), delay: kind ? delays[kind] : 0 };
      this.gates.push(g);
      for (const k of ["A", "B", "S"]) if (conn[k]) add(this.readers, slot(conn[k][0]), g);
    }
  }

  value(b: Bit) { return this.v[slot(b)]; }

  /** Set an input port (bits LSB first) at time 0 and run until nothing is left to happen. */
  run(port: string, bits: number[]): Transient {
    const out: Transient = { changes: new Map(), before: new Map(), settled: 0, truncated: false };
    const heap = new MinHeap<{ net: number; v: number }>();
    const projected = new Map<number, number>();         // the value each net is heading for
    let seq = 0, count = 0;
    const schedule = (t: number, net: number, v: number) => {
      if (net < 2 || (projected.get(net) ?? this.v[net]) === v) return;
      projected.set(net, v);
      heap.push(t, seq++, { net, v });
    };
    this.ports[port]?.bits.forEach((b, i) => schedule(0, slot(b), bits[i] ?? 0));
    while (heap.size) {
      const e = heap.pop()!, t = e.key, { net, v } = e.value;
      if (++count > MAX_EVENTS) { out.truncated = true; break; }
      const old = this.v[net];
      if (old === v) continue;
      if (!out.before.has(net)) { out.before.set(net, old); out.changes.set(net, []); }
      out.changes.get(net)!.push({ t, v });
      out.settled = Math.max(out.settled, t);
      this.v[net] = v;
      for (const g of this.readers.get(net) ?? []) schedule(t + g.delay, g.y, g.op(this.v[g.a], this.v[g.b], this.v[g.s]));
      for (const f of this.resets.get(net) ?? []) if (v) schedule(t + this.ffDelay, f.q, 0);
      for (const f of this.clocked.get(net) ?? []) {
        if (v && !(f.r >= 0 && this.v[f.r])) schedule(t + this.ffDelay, f.q, this.v[f.d]);
      }
    }
    return out;
  }
}

export interface Hazard { port: string; bit: number; kind: "static-0" | "static-1" | "dynamic"; edges: number }

/**
 * Outputs that changed more often than they had to. Ends where it started, yet moved: a static
 * hazard (static-1 if it should have stayed 1). Ends changed, in more than one edge: dynamic.
 */
export function findHazards(t: Transient, net: BoardNetlist): Hazard[] {
  const out: Hazard[] = [];
  for (const [port, p] of Object.entries(net.ports)) {
    if (p.direction !== "output") continue;
    p.bits.forEach((b, bit) => {
      const ch = t.changes.get(slot(b));
      if (!ch || ch.length < 2) return;
      if (ch.length % 2 === 0) out.push({ port, bit, kind: t.before.get(slot(b)) ? "static-1" : "static-0", edges: ch.length });
      else out.push({ port, bit, kind: "dynamic", edges: ch.length });
    });
  }
  return out;
}

/** The transient as a parsed VCD, for lib/waveform-svg.ts. A signal is its nets, LSB first. */
export function transientToParsed(t: Transient, signals: { name: string; bits: Bit[] }[], read: (b: Bit) => number): ParsedVcd {
  const end = Math.max(1, t.settled * 1.15, t.settled + 1);
  return {
    timescale: "1 unit",
    maxTime: end,
    signals: signals.map((s, i) => {
      const nets = s.bits.map(slot);
      const startOf = (n: number) => t.before.get(n) ?? read(n);
      const cur = nets.map(startOf);
      const word = () => (cur.length === 1 ? String(cur[0]) : [...cur].reverse().join(""));
      const changes = [{ time: 0, value: word() }];
      const events = nets.flatMap((n, k) => (t.changes.get(n) ?? []).map((c) => ({ ...c, k }))).sort((a, b) => a.t - b.t);
      for (const c of events) {
        cur[c.k] = c.v;
        const last = changes[changes.length - 1];
        if (last.time === c.t) last.value = word(); else changes.push({ time: c.t, value: word() });
      }
      return { id: `t${i}`, name: s.name, width: nets.length, type: "wire", changes };
    }),
  };
}
