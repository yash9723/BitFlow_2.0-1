/**
 * lib/waveform-svg.ts — a static SVG of a simulation's waveforms, for the lab report
 * (components/LabReport.tsx) and the share card (components/ExportCard.tsx). Pure:
 * takes the parsed VCD and the waveform panel's view (row order, hidden rows, radix,
 * markers) and returns SVG markup. Also the panel's row-ordering rules, so both agree.
 * Self-check: scripts/report.check.ts.
 */

import { type Radix, defaultRadix, formatWithRadix } from "./radix";
import { type ParsedVcd, type VcdSignal, niceTimeStep } from "./vcd-parser";

/** Row keys: the signal name, plus "#n" for its n-th repeat (a testbench and its DUT can both have "count"). */
export function rowKeys(signals: VcdSignal[]): Map<string, string> {
  const seen = new Map<string, number>(), keys = new Map<string, string>();
  for (const s of signals) {
    const n = seen.get(s.name) ?? 0;
    seen.set(s.name, n + 1);
    keys.set(s.id, n ? `${s.name}#${n}` : s.name);
  }
  return keys;
}

/** Visible rows: hidden ones left out, rows in `order` first (in that order), the rest in VCD order. */
export function visibleRows(signals: VcdSignal[], hidden: string[], order: string[], keys = rowKeys(signals)): VcdSignal[] {
  const rank = new Map(order.map((k, i) => [k, i]));
  return signals
    .filter((s) => !hidden.includes(keys.get(s.id)!))
    .map((s, i) => ({ s, r: rank.get(keys.get(s.id)!) ?? order.length + i }))
    .sort((x, y) => x.r - y.r)
    .map(({ s }) => s);
}

export interface WaveView {
  hidden?: string[];
  order?: string[];
  radixMap?: Record<string, Radix>;
  markers?: { a: number | null; b: number | null };
}
export interface WaveSvgOptions {
  /** Total width in px, label column included. */
  width?: number;
  theme?: "light" | "dark";
  maxSignals?: number;
}

const THEMES = {
  dark:  { bg: "#0d0e11", axis: "#1a1b22", grid: "#22232d", text: "#b0b3cc", dim: "#80839d", bit: "#00e87a", bus: "#4db8ff", bad: "#ff4f4f", a: "#ffb84d", b: "#ff6bcb" },
  light: { bg: "#ffffff", axis: "#f3f4f6", grid: "#e5e7eb", text: "#111827", dim: "#6b7280", bit: "#047857", bus: "#1d4ed8", bad: "#dc2626", a: "#b45309", b: "#be185d" },
};
const LABEL_W = 130, ROW_H = 24, AXIS_H = 20, CHAR_W = 5.6, DENSE_PX = 3;

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const r1 = (v: number) => Math.round(v * 10) / 10;

export interface WaveSvg { svg: string; shown: number; total: number; width: number; height: number }

export function waveformSvg(vcd: ParsedVcd, view: WaveView = {}, opts: WaveSvgOptions = {}): WaveSvg {
  const T = THEMES[opts.theme ?? "light"];
  const W = opts.width ?? 900;
  const keys = rowKeys(vcd.signals);
  const all = visibleRows(vcd.signals, view.hidden ?? [], view.order ?? [], keys);
  const rows = all.slice(0, opts.maxSignals ?? 32);
  const H = AXIS_H + rows.length * ROW_H + 4;
  const end = Math.max(vcd.maxTime, 1), chartW = W - LABEL_W - 8;
  const x = (t: number) => r1(LABEL_W + (t / end) * chartW);
  const out: string[] = [];
  const font = `font-family="ui-monospace, Menlo, Consolas, monospace"`;

  out.push(`<rect width="${W}" height="${H}" fill="${T.bg}"/>`);
  out.push(`<rect x="${LABEL_W}" width="${W - LABEL_W}" height="${AXIS_H}" fill="${T.axis}"/>`);
  out.push(`<text x="6" y="14" font-size="9" fill="${T.dim}" ${font}>time (${esc(vcd.timescale || "units")})</text>`);
  const step = niceTimeStep(end);
  for (let t = 0; t <= end; t += step) {
    out.push(`<line x1="${x(t)}" y1="${AXIS_H - 4}" x2="${x(t)}" y2="${H}" stroke="${T.grid}" stroke-width="0.6"/>`);
    out.push(`<text x="${x(t) + 2}" y="13" font-size="8.5" fill="${T.dim}" ${font}>${t}</text>`);
  }

  rows.forEach((s, i) => {
    const top = AXIS_H + i * ROW_H, yH = top + 5, yL = top + ROW_H - 5, yM = (yH + yL) / 2;
    const radix = view.radixMap?.[keys.get(s.id)!] ?? defaultRadix(s.width);
    const name = `${s.name}${s.width > 1 ? `[${s.width - 1}:0]` : ""}`;
    out.push(`<line x1="0" y1="${top + ROW_H}" x2="${W}" y2="${top + ROW_H}" stroke="${T.grid}" stroke-width="0.5"/>`);
    out.push(`<text x="6" y="${yM + 3}" font-size="10" fill="${T.text}" ${font}>${esc(name.length > 20 ? `${name.slice(0, 19)}…` : name)}</text>`);
    if (s.width > 1 && radix !== "hex") out.push(`<text x="${LABEL_W - 6}" y="${yM + 3}" font-size="8" text-anchor="end" fill="${T.dim}" ${font}>${radix}</text>`);

    // A few paths per row however many changes there are: changes in the same pixel column
    // share one vertical stroke, and bus segments narrower than DENSE_PX merge into a busy band.
    const ch = s.changes;
    const level = (v: string) => (/[xz]/i.test(v) ? yM : v === "1" ? yH : yL);
    if (s.width === 1) {
      if (!ch.length) return;
      let d = `M${x(ch[0].time)},${level(ch[0].value)}`, bad = "";
      let col = -1, lo = 0, hi = 0, last = level(ch[0].value);
      const flush = () => { if (col >= 0) d += lo === hi ? ` H${col} V${last}` : ` H${col} V${lo} V${hi} V${last}`; };
      for (let j = 0; j < ch.length; j++) {
        const x1 = x(ch[j].time), y = level(ch[j].value);
        if (/[xz]/i.test(ch[j].value)) bad += ` M${x1},${yM} H${x(j + 1 < ch.length ? ch[j + 1].time : end)}`;
        if (j === 0) continue;
        const px = Math.round(x1);
        if (px !== col) { flush(); col = px; lo = hi = last; }
        if (y < lo) lo = y;
        if (y > hi) hi = y;
        last = y;
      }
      flush();
      d += ` H${x(end)}`;
      out.push(`<path d="${d}" fill="none" stroke="${T.bit}" stroke-width="1.4"/>`);
      if (bad) out.push(`<path d="${bad}" fill="none" stroke="${T.bad}" stroke-width="1.4"/>`);
      return;
    }
    let shapes = "", unknown = "", dense = "", runStart = -1, runEnd = -1;
    const flushRun = () => { if (runStart >= 0) dense += ` M${runStart},${yH} H${runEnd} V${yL} H${runStart} Z`; runStart = -1; };
    for (let j = 0; j < ch.length; j++) {
      const x1 = x(ch[j].time), x2 = x(j + 1 < ch.length ? ch[j + 1].time : end), v = ch[j].value;
      if (x2 - x1 < DENSE_PX) { if (runStart < 0) runStart = x1; runEnd = x2; continue; }
      flushRun();
      const bad = /[xz]/i.test(v), c = bad ? T.bad : T.bus, k = Math.min(3, (x2 - x1) / 2);
      const shape = ` M${x1},${yM} L${r1(x1 + k)},${yH} H${r1(x2 - k)} L${x2},${yM} L${r1(x2 - k)},${yL} H${r1(x1 + k)} Z`;
      if (bad) unknown += shape; else shapes += shape;
      const label = formatWithRadix(v, s.width, radix), room = x2 - x1 - 8;
      if (room >= CHAR_W * 2) {
        const fit = Math.floor(room / CHAR_W);
        const txt = label.length > fit ? `${label.slice(0, Math.max(1, fit - 1))}…` : label;
        out.push(`<text x="${r1((x1 + x2) / 2)}" y="${yM + 3}" font-size="9" text-anchor="middle" fill="${c}" ${font}>${esc(txt)}</text>`);
      }
    }
    flushRun();
    if (dense) out.push(`<path d="${dense}" fill="${T.bus}" fill-opacity="0.3" stroke="${T.bus}" stroke-width="1"/>`);
    if (shapes) out.push(`<path d="${shapes}" fill="${T.bus}" fill-opacity="0.08" stroke="${T.bus}" stroke-width="1"/>`);
    if (unknown) out.push(`<path d="${unknown}" fill="${T.bad}" fill-opacity="0.08" stroke="${T.bad}" stroke-width="1"/>`);
  });

  const m = view.markers;
  for (const id of ["a", "b"] as const) {
    const t = m?.[id];
    if (t === null || t === undefined || t < 0 || t > end) continue;
    out.push(`<line x1="${x(t)}" y1="${AXIS_H}" x2="${x(t)}" y2="${H}" stroke="${T[id]}" stroke-width="1" stroke-dasharray="4 3"/>`);
    out.push(`<text x="${x(t) + 3}" y="${AXIS_H + 10}" font-size="9" font-weight="bold" fill="${T[id]}" ${font}>${id.toUpperCase()}=${t}</text>`);
  }
  if (m && m.a !== null && m.b !== null) {
    out.push(`<text x="${W - 6}" y="13" font-size="9" text-anchor="end" fill="${T.text}" ${font}>Δ = ${Math.abs(m.b - m.a)}</text>`);
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${out.join("")}</svg>`;
  return { svg, shown: rows.length, total: all.length, width: W, height: H };
}
