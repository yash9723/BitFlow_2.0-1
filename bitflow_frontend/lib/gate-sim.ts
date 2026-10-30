/**
 * lib/gate-sim.ts — cycle simulator for the gate-level netlists from POST /board.
 *
 * Runs in the browser, so the virtual board costs the server nothing however
 * fast it is clocked. The netlist has only 1-bit gates and edge flip-flops,
 * some with an asynchronous set/reset (the server's dffunmap turned enables,
 * sync resets and memories into gates).
 *
 * Bits are Yosys net ids (always >= 2), so slots 0 and 1 hold the constants
 * "0" and "1"; "x"/"z" read as 0. Every net starts at 0, like a powered-up
 * FPGA with no initial values. Port values are arrays of bits, LSB first.
 * Self-check: scripts/gate-sim.check.ts.
 */

export type Bit = number | string;

export interface BoardNetlist {
  ports: Record<string, { direction: string; bits: Bit[] }>;
  cells: { type: string; conn: Record<string, Bit[]> }[];
}

type Op = (a: number, b: number, s: number) => number;

export const OPS: Record<string, Op> = {
  $_BUF_:    (a) => a,
  $_NOT_:    (a) => a ^ 1,
  $_AND_:    (a, b) => a & b,
  $_NAND_:   (a, b) => (a & b) ^ 1,
  $_OR_:     (a, b) => a | b,
  $_NOR_:    (a, b) => (a | b) ^ 1,
  $_XOR_:    (a, b) => a ^ b,
  $_XNOR_:   (a, b) => a ^ b ^ 1,
  $_ANDNOT_: (a, b) => a & (b ^ 1),
  $_ORNOT_:  (a, b) => a | (b ^ 1),
  $_MUX_:    (a, b, s) => (s ? b : a),
  $_NMUX_:   (a, b, s) => (s ? b : a) ^ 1,
};

/** Rounds of clock edges per input change before giving up (a register clocking itself). */
const MAX_ROUNDS = 64;

const slot = (b: Bit | undefined) => (typeof b === "number" ? b : b === "1" ? 1 : 0);

interface Gate { op: Op; a: number; b: number; s: number; y: number }
/** r/s: async reset/set nets (-1 = none), active when equal to rOn/sOn; reset wins. */
interface Ff   { d: number; c: number; q: number; neg: boolean; last: number; r: number; rOn: number; rVal: number; s: number; sOn: number }

// $_DFF_P_ / $_DFF_N_, $_DFF_<clk><rst><value>_ (async reset to value), $_DFFSR_<clk><set><rst>_
const DFF   = /^\$_DFF_([NP])_$/;
const ADFF  = /^\$_DFF_([NP])([NP])([01])_$/;
const DFFSR = /^\$_DFFSR_([NP])([NP])([NP])_$/;
const on    = (pol: string) => (pol === "P" ? 1 : 0);

export class GateSim {
  readonly ports: BoardNetlist["ports"];
  readonly gateCount: number;
  private v: Uint8Array;
  private gates: Gate[] = [];
  private ffs: Ff[] = [];

  /** Throws on an unsupported cell or a combinational loop. */
  constructor(net: BoardNetlist) {
    this.ports = net.ports;
    let max = 1;
    const see = (bits: Bit[]) => bits.forEach((b) => { if (typeof b === "number" && b > max) max = b; });
    Object.values(net.ports).forEach((p) => see(p.bits));
    net.cells.forEach((c) => Object.values(c.conn).forEach(see));
    this.v = new Uint8Array(max + 1);
    this.v[1] = 1;

    const gates: Gate[] = [];
    for (const { type, conn } of net.cells) {
      const ff = DFF.exec(type) ?? ADFF.exec(type) ?? DFFSR.exec(type);
      if (ff) {
        const sr = type.startsWith("$_DFFSR_");
        this.ffs.push({
          d: slot(conn.D[0]), c: slot(conn.C[0]), q: slot(conn.Q[0]), neg: ff[1] === "N", last: 0,
          r:    conn.R ? slot(conn.R[0]) : -1,
          rOn:  on(sr ? ff[3] : ff[2] ?? "P"),
          rVal: sr ? 0 : Number(ff[3] ?? 0),
          s:    sr ? slot(conn.S[0]) : -1,
          sOn:  on(sr ? ff[2] : "P"),
        });
        continue;
      }
      const op = OPS[type];
      if (!op) throw new Error(`The board can't simulate ${type} cells.`);
      gates.push({ op, a: slot(conn.A?.[0]), b: slot(conn.B?.[0]), s: slot(conn.S?.[0]), y: slot(conn.Y[0]) });
    }
    this.gateCount = gates.length;

    // Order gates so each one's inputs are computed before it (Kahn's algorithm).
    const driver = new Map<number, number>();
    gates.forEach((g, i) => driver.set(g.y, i));
    const pending = new Array(gates.length).fill(0);
    const users: number[][] = gates.map(() => []);
    gates.forEach((g, i) => {
      for (const input of [g.a, g.b, g.s]) {
        const d = driver.get(input);
        if (d !== undefined) { pending[i]++; users[d].push(i); }
      }
    });
    const ready = gates.map((_, i) => i).filter((i) => pending[i] === 0);
    for (let k = 0; k < ready.length; k++) {
      this.gates.push(gates[ready[k]]);
      for (const u of users[ready[k]]) if (--pending[u] === 0) ready.push(u);
    }
    if (this.gates.length < gates.length) {
      throw new Error("The design has a combinational loop (logic feeding back into itself without a register).");
    }

    this.evaluate();
    for (const f of this.ffs) f.last = this.v[f.c];   // power-up is not a clock edge
    this.propagate();                                  // but async resets already active do apply
  }

  /** Drive an input port (bits LSB first) and let the design react, clock edges included. */
  set(name: string, bits: number[]): void {
    this.ports[name]?.bits.forEach((b, i) => { if (typeof b === "number") this.v[b] = bits[i] ? 1 : 0; });
    this.propagate();
  }

  /** Current value of a port, LSB first. */
  get(name: string): number[] {
    return (this.ports[name]?.bits ?? []).map((b) => this.v[slot(b)]);
  }

  /** Current value of one net (a cell connection), e.g. to colour a wire. */
  net(b: Bit): number {
    return this.v[slot(b)] ?? 0;
  }

  private evaluate(): void {
    const v = this.v;
    for (const g of this.gates) v[g.y] = g.op(v[g.a], v[g.b], v[g.s]);
  }

  private propagate(): void {
    const v = this.v;
    for (let round = 0; ; round++) {
      this.evaluate();
      // Every flip-flop decides its next value before any of them changes.
      const next: [Ff, number][] = [];
      for (const f of this.ffs) {
        const c = v[f.c];
        const edge = f.neg ? f.last === 1 && c === 0 : f.last === 0 && c === 1;
        f.last = c;
        const q = f.r >= 0 && v[f.r] === f.rOn ? f.rVal
                : f.s >= 0 && v[f.s] === f.sOn ? 1
                : edge ? v[f.d] : v[f.q];
        if (q !== v[f.q]) next.push([f, q]);
      }
      if (next.length === 0) return;
      if (round >= MAX_ROUNDS) throw new Error("The clock never settles: a register clocks itself.");
      for (const [f, q] of next) v[f.q] = q;
    }
  }
}

/** Bits (LSB first) to a number; ports wider than 32 bits keep their low 32. */
export const toNumber = (bits: number[]) => bits.slice(0, 32).reduce((n, b, i) => n + b * 2 ** i, 0);
