/**
 * lib/studio/circuit-analysis.ts — the circuit editor's logic analyzer and timing view
 * (components/studio/CircuitTool.tsx): a recorded trace of probed signals as a parsed
 * VCD (drawn by lib/waveform-svg.ts) or VCD text to download, and the longest
 * combinational path through the gate netlist (unit gate delays).
 * Self-check: scripts/circuit.check.ts.
 */
import type { Bit, BoardNetlist } from "../gate-sim";
import type { ParsedVcd } from "../vcd-parser";

// ── Logic analyzer ───────────────────────────────────────────────────────────

export interface Probe { name: string; width: number }
/** steps[i] = every probe's value after step i (step 0 = power-up). */
export interface Trace { probes: Probe[]; steps: number[][] }

const bin = (v: number, w: number) => (w === 1 ? String(v & 1) : v.toString(2).padStart(w, "0"));
/** The steps recorded for these probes: rows from before the probes changed are left out (the editor draws once before it restarts the trace). */
const current = (t: Trace) => t.steps.filter((row) => row.length === t.probes.length);

/** The trace as a parsed VCD (time unit: one step), keeping only the changes. */
export function traceToParsed(t: Trace): ParsedVcd {
  const steps = current(t);
  return {
    timescale: "1 step",
    maxTime: Math.max(1, steps.length),
    signals: t.probes.map((p, i) => {
      const changes: { time: number; value: string }[] = [];
      steps.forEach((row, s) => { if (s === 0 || row[i] !== steps[s - 1][i]) changes.push({ time: s, value: bin(row[i], p.width) }); });
      return { id: `p${i}`, name: p.name, width: p.width, type: "wire", changes };
    }),
  };
}

/** VCD text for the trace, one time unit per step, for any waveform viewer. */
export function traceToVcd(t: Trace, module = "circuit"): string {
  const id = (i: number) => String.fromCharCode(33 + (i % 90)) + (i >= 90 ? String(Math.floor(i / 90)) : "");
  const lines = ["$timescale 1ns $end", `$scope module ${module} $end`,
    ...t.probes.map((p, i) => `$var wire ${p.width} ${id(i)} ${p.name.replace(/\s+/g, "_")} $end`),
    "$upscope $end", "$enddefinitions $end"];
  const steps = current(t);
  steps.forEach((row, s) => {
    const changed = row.map((v, i) => [v, i] as const).filter(([v, i]) => s === 0 || v !== steps[s - 1][i]);
    if (!changed.length) return;
    lines.push(`#${s}`);
    for (const [v, i] of changed) lines.push(t.probes[i].width === 1 ? `${v & 1}${id(i)}` : `b${bin(v, t.probes[i].width)} ${id(i)}`);
  });
  lines.push(`#${steps.length}`);
  return `${lines.join("\n")}\n`;
}

// ── Timing ───────────────────────────────────────────────────────────────────

export interface LongestPath {
  /** Gate delays on the path (buffers count 0). */
  delay: number;
  /** Nets from the start (an input or a flip-flop output) to the end, in order. */
  nets: number[];
}

/**
 * The longest combinational path: from input ports and flip-flop outputs to output
 * ports and flip-flop inputs, every gate one unit of delay ($_BUF_: none, so
 * splitters and mergers are free). Assumes no combinational loops (validate() rejects them).
 */
export function longestPath(net: BoardNetlist): LongestPath {
  const driver = new Map<number, { inputs: Bit[]; delay: number }>();
  const ends: Bit[] = [];
  for (const c of net.cells) {
    if (c.type.startsWith("$_DFF")) { ends.push(c.conn.D[0]); continue; }
    driver.set(Number(c.conn.Y[0]), { inputs: ["A", "B", "S"].flatMap((k) => c.conn[k] ?? []), delay: c.type === "$_BUF_" ? 0 : 1 });
  }
  for (const p of Object.values(net.ports)) if (p.direction === "output") ends.push(...p.bits);
  const arrival = new Map<number, number>(), from = new Map<number, number>();
  const at = (b: Bit): number => {
    if (typeof b !== "number") return -1;                         // constants start nothing
    const known = arrival.get(b);
    if (known !== undefined) return known;
    const d = driver.get(b);
    let t = 0;
    if (d) {
      let best = -1, src: number | undefined;
      for (const i of d.inputs) { const a = at(i); if (a > best) { best = a; src = Number(i); } }
      t = Math.max(0, best) + d.delay;
      if (src !== undefined && best >= 0) from.set(b, src);
    }
    arrival.set(b, t);
    return t;
  };
  let delay = -1, end: number | undefined;
  for (const e of ends) {
    if (typeof e !== "number") continue;
    const a = at(e);
    if (a > delay) { delay = a; end = e; }
  }
  const nets: number[] = [];
  for (let n = end; n !== undefined; n = from.get(n)) nets.unshift(n);
  return { delay: Math.max(0, delay), nets };
}
