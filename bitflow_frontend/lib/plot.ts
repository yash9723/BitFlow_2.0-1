/**
 * lib/plot.ts — numbers for the waveform viewer's plots (components/WaveformPanel.tsx):
 * a bus drawn as a line, the X–Y plot of two buses, and the CSV export.
 * Self-check: scripts/plot.check.ts.
 */
import type { VcdChange, VcdSignal } from "./vcd-parser";

/** A VCD value as a number, or null for x/z. Short values were left-extended with 0, so they are positive. */
export function busValue(value: string, width: number, signed: boolean): number | null {
  if (!/^[01]+$/.test(value)) return null;
  const n = parseInt(value, 2);   // ponytail: doubles, so buses wider than 53 bits plot approximately
  return signed && value.length === width && value[0] === "1" ? n - 2 ** width : n;
}

export interface Series {
  points: { t: number; v: number | null }[];
  min: number;
  max: number;
}

/** The signal's values over time, with its range (0..0 when it never has a value). */
export function series(sig: VcdSignal, signed: boolean): Series {
  const points = sig.changes.map((c) => ({ t: c.time, v: busValue(c.value, sig.width, signed) }));
  const known = points.map((p) => p.v).filter((v): v is number => v !== null);
  // A loop, not Math.min(...known): spreading a long signal's values overflows the call stack
  let min = known.length ? known[0] : 0, max = min;
  for (const v of known) { if (v < min) min = v; if (v > max) max = v; }
  return { points, min, max };
}

/** The value of `changes` at time t (the last change at or before it), or null before the first. */
export function valueAt(changes: VcdChange[], t: number): string | null {
  let lo = 0, hi = changes.length - 1, found: string | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (changes[mid].time <= t) { found = changes[mid].value; lo = mid + 1; } else hi = mid - 1;
  }
  return found;
}

/** Every time at which any of the signals changes, ascending. */
export function changeTimes(signals: { changes: VcdChange[] }[]): number[] {
  return [...new Set(signals.flatMap((s) => s.changes.map((c) => c.time)))].sort((a, b) => a - b);
}

/** (x, y) pairs for an X–Y plot: both values at every change of either; pairs with an x/z are left out. */
export function xyPoints(x: VcdSignal, y: VcdSignal, xSigned: boolean, ySigned: boolean): [number, number][] {
  const out: [number, number][] = [];
  for (const t of changeTimes([x, y])) {
    const xv = valueAt(x.changes, t), yv = valueAt(y.changes, t);
    const a = xv === null ? null : busValue(xv, x.width, xSigned);
    const b = yv === null ? null : busValue(yv, y.width, ySigned);
    if (a !== null && b !== null) out.push([a, b]);
  }
  return out;
}

/** CSV with a time column and one column per signal, formatted by `fmt` (empty before a signal's first value). */
export function toCsv(signals: { name: string; changes: VcdChange[]; fmt: (v: string) => string }[]): string {
  const cell = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const rows = [["time", ...signals.map((s) => s.name)].map(cell).join(",")];
  for (const t of changeTimes(signals)) {
    rows.push([String(t), ...signals.map((s) => { const v = valueAt(s.changes, t); return v === null ? "" : cell(s.fmt(v)); })].join(","));
  }
  return rows.join("\n") + "\n";
}
