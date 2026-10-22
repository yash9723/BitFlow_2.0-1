/**
 * lib/studio/wave.ts — the timing-diagram designer (/studio/timing): a cycle-based
 * diagram model, a WaveDrom-style SVG renderer, WaveJSON import/export, a
 * testbench generator, and a diagram sampled from a simulation's waveform.
 *
 * Timing convention (shared by the testbench and fromVcd): cycle i starts at the
 * i-th rising clock edge. Inputs change just after the edge (cycle 0's values are
 * already applied before the first edge); outputs are checked in the middle of
 * the cycle. An X in an output means "don't check". Without a clock row each
 * cycle is one `period`: inputs applied at its start, outputs checked halfway.
 * Self-check: scripts/wave.check.ts.
 */
import { ansiPorts } from "../vhdl-starter";
import { nameProblem } from "./logic-min";

export interface WaveSignal {
  name: string;
  dir: "clock" | "in" | "out";
  width: number;
  /** One entry per cycle: "0" "1" "x" "z", a number (decimal, or 0x/h hex) for buses, or "." = same as before. */
  values: string[];
  /** Rows sampled from a simulation keep the samples for the other direction here (see fromVcd and setDir). */
  alt?: string[];
}

/**
 * The row with a new direction. A sampled row swaps in its other samples: an input's
 * value is what the design captured at the next edge, an output's is read mid-cycle.
 */
export function setDir(s: WaveSignal, dir: WaveSignal["dir"]): WaveSignal {
  const flips = s.alt && dir !== "clock" && s.dir !== "clock" && (dir === "out") !== (s.dir === "out");
  return flips ? { ...s, dir, values: s.alt!, alt: s.values } : { ...s, dir };
}
export interface WaveDiagram { title: string; cycles: number; period: number; signals: WaveSignal[] }

export const MAX_CYCLES = 64;
/** Where the Waveform panel leaves a sampled diagram for /studio/timing to open. */
export const FROM_SIM_KEY = "bitflow_studio_wave_from_sim";
export const MAX_WIDTH = 32;

// ── Values ────────────────────────────────────────────────────────────────────

/** The value of each cycle with "." resolved (a leading "." is x). */
export function resolved(s: WaveSignal, cycles: number): string[] {
  const out: string[] = [];
  let last = "x";
  for (let i = 0; i < cycles; i++) {
    const v = (s.values[i] ?? ".").trim().toLowerCase();
    if (v !== "." && v !== "") last = v;
    out.push(last);
  }
  return out;
}

/** A bus value as a number, or null for x / z / something that isn't a number. */
export function numberOf(v: string): number | null {
  const t = v.trim().toLowerCase().replace(/_/g, "");
  if (/^\d+$/.test(t)) return Number(t);
  const hex = /^(?:0x|h|'h)([0-9a-f]+)$/.exec(t);
  if (hex) return parseInt(hex[1], 16);
  const bin = /^(?:0b|b|'b)([01]+)$/.exec(t);
  if (bin) return parseInt(bin[1], 2);
  return null;
}

const isUnknown = (v: string) => v === "x" || v === "z";

export interface WaveIssue { level: "error" | "warning"; msg: string }

export function validate(d: WaveDiagram): WaveIssue[] {
  const out: WaveIssue[] = [];
  const err = (msg: string) => out.push({ level: "error", msg });
  if (!Number.isInteger(d.cycles) || d.cycles < 1 || d.cycles > MAX_CYCLES) err(`Use 1 to ${MAX_CYCLES} cycles.`);
  if (!(d.period >= 2 && d.period <= 1000)) err("The clock period must be 2 to 1000 ns.");
  const seen = new Set<string>();
  for (const s of d.signals) {
    const p = nameProblem(s.name);
    if (p) err(`Signal "${s.name}" ${p}.`);
    else if (seen.has(s.name)) err(`"${s.name}" is used twice.`);
    else if (["errors", "dut"].includes(s.name)) err(`"${s.name}" is used by the testbench; rename it.`);
    seen.add(s.name);
    if (s.dir === "clock") { if (s.width !== 1) err(`Clock "${s.name}" must be 1 bit.`); continue; }
    if (!Number.isInteger(s.width) || s.width < 1 || s.width > MAX_WIDTH) err(`"${s.name}" needs a width from 1 to ${MAX_WIDTH}.`);
    resolved(s, d.cycles).forEach((v, i) => {
      if (isUnknown(v)) return;
      if (s.width === 1 ? v !== "0" && v !== "1" : numberOf(v) === null) err(`${s.name}, cycle ${i}: "${v}" isn't a ${s.width === 1 ? "0, 1, x or z" : "number, x or z"}.`);
      else if (s.width > 1 && numberOf(v)! >= 2 ** s.width) err(`${s.name}, cycle ${i}: ${v} doesn't fit in ${s.width} bits.`);
    });
  }
  if (d.signals.filter((s) => s.dir === "clock").length > 1) err("Use one clock row (the testbench drives a single clock).");
  if (!d.signals.some((s) => s.dir === "out")) out.push({ level: "warning", msg: "No output rows, so the testbench has nothing to check." });
  return out;
}

// ── SVG ───────────────────────────────────────────────────────────────────────

export const GEOM = { labelW: 120, cycleW: 52, rowH: 36, top: 26, pad: 8 };

const esc = (s: string) => s.replace(/[<>&"]/g, (c) => `&#${c.charCodeAt(0)};`);
const COLOR = { clock: "#8b8fa3", in: "#00e87a", out: "#ffb547", bus: "#4db8ff", grid: "#1d1f29", text: "#c8cad6", dim: "#4a4d60", x: "#3a3d4f" };

/** The whole diagram as a standalone SVG document (also what the editor shows). */
export function diagramSvg(d: WaveDiagram): string {
  const { labelW, cycleW, rowH, top, pad } = GEOM;
  const w = labelW + d.cycles * cycleW + 12, h = top + d.signals.length * rowH + 8;
  const xOf = (c: number) => labelW + c * cycleW;
  const parts: string[] = [`<rect width="${w}" height="${h}" fill="#0d0e11"/>`];
  for (let c = 0; c <= d.cycles; c++) {
    parts.push(`<line x1="${xOf(c)}" y1="${top - 6}" x2="${xOf(c)}" y2="${h - 6}" stroke="${COLOR.grid}" stroke-dasharray="2 3"/>`);
    if (c < d.cycles) parts.push(`<text x="${xOf(c) + cycleW / 2}" y="${top - 10}" text-anchor="middle" font-size="9" fill="${COLOR.dim}" font-family="monospace">${c}</text>`);
  }
  d.signals.forEach((s, r) => {
    const y0 = top + r * rowH, hi = y0 + pad, lo = y0 + rowH - pad, mid = (hi + lo) / 2;
    const label = s.width > 1 ? `${s.name}[${s.width - 1}:0]` : s.name;
    parts.push(`<text x="${labelW - 10}" y="${mid + 4}" text-anchor="end" font-size="12" font-family="monospace" fill="${COLOR[s.dir === "clock" ? "clock" : s.dir]}">${esc(label)}</text>`);
    if (s.dir === "clock") {
      let p = `M ${xOf(0)} ${lo}`;
      for (let c = 0; c < d.cycles; c++) p += ` V ${hi} H ${xOf(c) + cycleW / 2} V ${lo} H ${xOf(c + 1)}`;
      parts.push(`<path d="${p}" fill="none" stroke="${COLOR.clock}" stroke-width="1.5"/>`);
      for (let c = 0; c < d.cycles; c++) parts.push(`<path d="M ${xOf(c) - 3} ${mid + 3} L ${xOf(c)} ${mid - 3} L ${xOf(c) + 3} ${mid + 3}" fill="none" stroke="${COLOR.clock}"/>`);
      return;
    }
    const vals = resolved(s, d.cycles);
    const runs: { from: number; to: number; v: string }[] = [];
    vals.forEach((v, c) => {
      const last = runs[runs.length - 1];
      if (last && last.v === v) last.to = c + 1; else runs.push({ from: c, to: c + 1, v });
    });
    for (const { from, to, v } of runs) {
      const x1 = xOf(from), x2 = xOf(to);
      if (v === "x") {
        parts.push(`<rect x="${x1}" y="${hi}" width="${x2 - x1}" height="${lo - hi}" fill="${COLOR.x}" fill-opacity="0.45"/>`);
        parts.push(`<path d="${Array.from({ length: Math.ceil((x2 - x1) / 8) }, (_, k) => `M ${x1 + k * 8} ${lo} L ${Math.min(x1 + k * 8 + 8, x2)} ${hi}`).join(" ")}" stroke="#55596e" stroke-width="0.8"/>`);
      } else if (v === "z") {
        parts.push(`<line x1="${x1}" y1="${mid}" x2="${x2}" y2="${mid}" stroke="${COLOR.bus}" stroke-width="1.5"/>`);
      } else if (s.width === 1) {
        const y = v === "1" ? hi : lo;
        parts.push(`<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${COLOR[s.dir]}" stroke-width="1.6"/>`);
      } else {
        const k = Math.min(5, (x2 - x1) / 4);
        parts.push(`<polygon points="${x1},${mid} ${x1 + k},${hi} ${x2 - k},${hi} ${x2},${mid} ${x2 - k},${lo} ${x1 + k},${lo}" fill="rgba(77,184,255,0.08)" stroke="${s.dir === "out" ? COLOR.out : COLOR.bus}" stroke-width="1.2"/>`);
        parts.push(`<text x="${(x1 + x2) / 2}" y="${mid + 4}" text-anchor="middle" font-size="11" font-family="monospace" fill="${COLOR.text}">${esc(v)}</text>`);
      }
    }
    if (s.width === 1) {                                 // vertical edges between levels
      for (let c = 1; c < d.cycles; c++) {
        const a = vals[c - 1], b = vals[c];
        if (a !== b && (a === "0" || a === "1") && (b === "0" || b === "1")) parts.push(`<line x1="${xOf(c)}" y1="${hi}" x2="${xOf(c)}" y2="${lo}" stroke="${COLOR[s.dir]}" stroke-width="1.6"/>`);
      }
    }
  });
  const title = d.title.trim() ? `<title>${esc(d.title)}</title>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${title}${parts.join("")}</svg>`;
}

// ── WaveJSON (WaveDrom) ───────────────────────────────────────────────────────

/** WaveDrom's WaveJSON for the diagram (clock rows become "p"). */
export function toWaveJson(d: WaveDiagram): string {
  const signal = d.signals.map((s) => {
    if (s.dir === "clock") return { name: s.name, wave: "p" + ".".repeat(Math.max(0, d.cycles - 1)) };
    const vals = resolved(s, d.cycles);
    let wave = "";
    const data: string[] = [];
    vals.forEach((v, i) => {
      if (i > 0 && v === vals[i - 1]) wave += ".";
      else if (isUnknown(v) || s.width === 1) wave += v;
      else { wave += "="; data.push(v); }
    });
    return data.length ? { name: s.name, wave, data } : { name: s.name, wave };
  });
  return JSON.stringify({ signal, ...(d.title ? { head: { text: d.title } } : {}) }, null, 2);
}

/**
 * A diagram from WaveJSON. Supports clocks (p n P N), levels (0 1 h l H L x z),
 * "." and data cells (= and 2-9, taking the next `data` item); groups are
 * flattened and spacers dropped. Directions aren't in WaveJSON: rows come in as
 * inputs, so mark the outputs afterwards.
 */
export function fromWaveJson(text: string): WaveDiagram {
  const doc = JSON.parse(text);
  if (!Array.isArray(doc?.signal)) throw new Error('This isn\'t WaveJSON: expected { "signal": [...] }.');
  const flat: { name?: string; wave?: string; data?: string[] | string }[] = [];
  const walk = (items: unknown[]) => items.forEach((it) => {
    if (Array.isArray(it)) walk(it.slice(1));
    else if (it && typeof it === "object" && "wave" in it) flat.push(it as { name?: string; wave?: string; data?: string[] | string });
  });
  walk(doc.signal);
  if (!flat.length) throw new Error("No signals with a wave were found.");
  const cycles = Math.min(MAX_CYCLES, Math.max(...flat.map((s) => (s.wave ?? "").replace(/\|/g, "").length), 1));
  const used = new Set<string>();
  const signals: WaveSignal[] = flat.map((s, i) => {
    let name = String(s.name ?? `s${i}`).replace(/[^A-Za-z0-9_]/g, "_").replace(/^(\d)/, "_$1") || `s${i}`;
    while (used.has(name)) name += "_";
    used.add(name);
    const wave = (s.wave ?? "").replace(/\|/g, "");
    if (/^[pnPN]/.test(wave)) return { name, dir: "clock" as const, width: 1, values: [] };
    const data = Array.isArray(s.data) ? s.data.map(String) : typeof s.data === "string" ? s.data.split(/\s+/) : [];
    let k = 0;
    const values = [...wave].slice(0, cycles).map((ch) => {
      if (ch === ".") return ".";
      if (/[=2-9]/.test(ch)) return data[k++] ?? "x";
      if (/[1hH]/.test(ch)) return "1";
      if (/[0lL]/.test(ch)) return "0";
      if (ch === "z") return "z";
      return "x";
    });
    if (!/[=2-9]/.test(wave)) return { name, dir: "in" as const, width: 1, values };
    const biggest = Math.max(0, ...values.map(numberOf).filter((n): n is number => n !== null));
    return { name, dir: "in" as const, width: Math.min(MAX_WIDTH, Math.max(2, Math.ceil(Math.log2(biggest + 1)))), values };
  });
  const title = typeof doc.head?.text === "string" ? doc.head.text : "";
  return { title, cycles, period: 10, signals };
}

// ── Testbench ─────────────────────────────────────────────────────────────────

const range = (w: number) => (w > 1 ? `[${w - 1}:0] ` : "");
const literal = (v: string, w: number) => (v === "x" || v === "z" ? `${w}'b${v.repeat(w)}` : `${w}'d${w === 1 ? v : numberOf(v)}`);

/** A module with the diagram's ports and an empty body, to start a design from the diagram. */
export function stubModule(d: WaveDiagram, module: string): string {
  const ports = d.signals.map((s) => (s.dir === "out" ? `    output reg  ${range(s.width)}${s.name}` : `    input  wire ${range(s.width)}${s.name}`));
  const clk = d.signals.find((s) => s.dir === "clock");
  return `// Generated by BitFlow Studio from the timing diagram${d.title ? ` "${d.title}"` : ""}: fill in the logic.
module ${module} (
${ports.join(",\n")}
);
${clk ? `    always @(posedge ${clk.name}) begin\n        // registered logic\n    end\n` : `    always @(*) begin\n        // combinational logic\n    end\n`}endmodule
`;
}

/** The module name of `design` and the problems connecting the diagram to it (ports by name). */
export function matchDesign(d: WaveDiagram, design: string): { module: string; problems: string[] } {
  const parsed = ansiPorts(design);
  if (!parsed) return { module: "", problems: ["Paste one module whose ports are declared in its header (module m (input wire a, output reg y); no parameters)."] };
  const problems: string[] = [];
  const ports = new Map(parsed.ports.map((p) => [p.name, p]));
  for (const s of d.signals) {
    const p = ports.get(s.name);
    if (!p) { problems.push(`The module has no port "${s.name}".`); continue; }
    const want = s.dir === "out" ? "out" : "in";
    if (p.dir !== want) problems.push(`"${s.name}" is ${p.dir === "out" ? "an output" : "an input"} of the module but ${want === "out" ? "an output" : "an input"} row in the diagram.`);
    const width = p.hi === null ? 1 : p.hi - p.lo + 1;
    if (width !== s.width) problems.push(`"${s.name}" is ${width} bit${width === 1 ? "" : "s"} in the module and ${s.width} in the diagram.`);
  }
  for (const p of parsed.ports) if (p.dir === "in" && !d.signals.some((s) => s.name === p.name)) problems.push(`Input "${p.name}" has no row, so it would float (z).`);
  return { module: parsed.name, problems };
}

/** A self-checking testbench that plays the diagram's inputs and checks its outputs (timing at the top of this file). */
export function generateTestbench(d: WaveDiagram, module: string): string {
  const tb = `tb_${module}`;
  const clk = d.signals.find((s) => s.dir === "clock");
  const ins = d.signals.filter((s) => s.dir === "in"), outs = d.signals.filter((s) => s.dir === "out");
  const inVals = new Map(ins.map((s) => [s.name, resolved(s, d.cycles)]));
  const outVals = new Map(outs.map((s) => [s.name, resolved(s, d.cycles)]));
  const half = d.period / 2;
  const set = (list: WaveSignal[], c: number) => list.map((s) => `${s.name} = ${literal(inVals.get(s.name)![c], s.width)};`).join(" ");
  const lines: string[] = [];
  if (ins.length) lines.push(`        ${set(ins, 0)}`);
  for (let c = 0; c < d.cycles; c++) {
    lines.push(`        // cycle ${c}`);
    const changed = c > 0 ? ins.filter((s) => inVals.get(s.name)![c] !== inVals.get(s.name)![c - 1]) : [];
    if (clk) {
      lines.push(`        @(posedge ${clk.name});`);
      if (changed.length) lines.push(`        #1 ${set(changed, c)}`);
      lines.push(`        #${changed.length ? half - 1 : half};`);
    } else {
      if (changed.length) lines.push(`        ${set(changed, c)}`);
      lines.push(`        #${half};`);
    }
    for (const s of outs) {
      const want = outVals.get(s.name)![c];
      if (want === "x") continue;
      lines.push(`        if (${s.name} !== ${literal(want, s.width)}) begin $display("FAIL: cycle ${c}: ${s.name} expected ${want}, got %0d", ${s.name}); errors = errors + 1; end`);
    }
    if (!clk) lines.push(`        #${half};`);
  }
  const decl = [
    ...(clk ? [`    reg ${clk.name} = 0;`] : []),
    ...ins.map((s) => `    reg  ${range(s.width)}${s.name};`),
    ...outs.map((s) => `    wire ${range(s.width)}${s.name};`),
  ];
  const conns = d.signals.map((s) => `.${s.name}(${s.name})`).join(", ");
  return `\`timescale 1ns / 1ps
// Generated by BitFlow Studio from the timing diagram${d.title ? ` "${d.title}"` : ""}.
// ${clk ? `Inputs change just after each rising edge of ${clk.name}; outputs are checked mid-cycle.` : `Each cycle is ${d.period} ns: inputs at its start, outputs checked halfway.`} X in an output row isn't checked.
module ${tb};
${decl.join("\n")}
    integer errors = 0;

    ${module} dut (${conns});
${clk ? `\n    always #${half} ${clk.name} = ~${clk.name};\n` : ""}
    initial begin
        $dumpfile("wave.vcd");
        $dumpvars(0, ${tb});
${lines.join("\n")}
        if (errors == 0) $display("ALL TESTS PASSED");
        else $display("TESTS FAILED: %0d error(s)", errors);
        $finish;
    end
endmodule
`;
}

// ── From a simulation ─────────────────────────────────────────────────────────

interface VcdLike { name: string; width: number; changes: { time: number; value: string }[] }

/** Nanoseconds per VCD time unit for a $timescale like "1ps" or "10 ns" (1 when it can't be read). */
export function nsPerUnit(timescale: string): number {
  const m = /^\s*(\d+)\s*(fs|ps|ns|us|ms|s)\s*$/i.exec(timescale);
  if (!m) return 1;
  const unit = { fs: 1e-6, ps: 1e-3, ns: 1, us: 1e3, ms: 1e6, s: 1e9 }[m[2].toLowerCase() as "ns"];
  return Number(m[1]) * unit;
}

function valueAt(changes: VcdLike["changes"], t: number): string | null {
  let v: string | null = null;
  for (const c of changes) { if (c.time > t) break; v = c.value; }
  return v;
}

/**
 * A diagram sampled from a waveform. With a 1-bit `clk`/`clock` signal, cycle i
 * starts at the i-th rising edge; a row's input value for the cycle is its value
 * at the next edge (what the design captured there, even when the testbench drove
 * it right on the edge) and its output value is read 3/4 of the way through the
 * cycle, after it settles; the testbench uses the same convention. Without a
 * clock the run is cut into equal steps. Rows come in as inputs, carrying their
 * output samples in `alt`: setDir() swaps them when a row is marked as an output.
 */
/** `unitNs`: nanoseconds per VCD time unit (nsPerUnit of the VCD's $timescale), for the clock period. */
export function fromVcd(signals: VcdLike[], maxTime: number, maxCycles = 32, unitNs = 1): WaveDiagram {
  const clock = signals.find((s) => s.width === 1 && /^(clk|clock)$/i.test(s.name.split(".").pop()!));
  let inTimes: number[], outTimes: number[];
  let period = 10;
  const rises = clock ? clock.changes.filter((c, i) => c.value === "1" && (i === 0 ? c.time > 0 : clock.changes[i - 1].value !== "1")).map((c) => c.time) : [];
  if (clock && rises.length >= 2) {
    const edges = rises.slice(0, maxCycles + 1);
    const step = edges[1] - edges[0];
    const starts = edges.slice(0, maxCycles);
    inTimes = starts.map((t, i) => edges[i + 1] ?? t + step);
    outTimes = starts.map((t, i) => t + ((edges[i + 1] ?? t + step) - t) * 0.75);
    period = Math.min(1000, Math.max(2, Math.round(step * unitNs)));
  } else {
    const n = Math.min(maxCycles, 16);
    const step = Math.max(1, maxTime / n);
    outTimes = Array.from({ length: n }, (_, i) => i * step + step * 0.75);
    inTimes = outTimes;
  }
  const used = new Set<string>();
  const rows: WaveSignal[] = signals.map((s) => {
    let name = s.name.split(".").pop()!.replace(/[^A-Za-z0-9_]/g, "_");
    while (used.has(name)) name += "_";
    used.add(name);
    if (s === clock && rises.length >= 2) return { name, dir: "clock", width: 1, values: [] };
    const sample = (times: number[]) => {
      const vals = times.map((t) => {
        const v = valueAt(s.changes, t);
        if (v === null || /x/i.test(v)) return "x";
        if (/z/i.test(v)) return "z";
        return s.width === 1 ? v : String(parseInt(v, 2));
      });
      return vals.map((v, i) => (i > 0 && v === vals[i - 1] ? "." : v));
    };
    return { name, dir: "in", width: Math.min(s.width, MAX_WIDTH), values: sample(inTimes), alt: sample(outTimes) };
  });
  return { title: "From a simulation", cycles: Math.max(1, outTimes.length), period, signals: rows };
}

// ── Examples ──────────────────────────────────────────────────────────────────

const row = (name: string, dir: WaveSignal["dir"], width: number, wave: string): WaveSignal =>
  ({ name, dir, width, values: dir === "clock" ? [] : wave.split(" ") });

export const WAVE_EXAMPLES: { label: string; diagram: WaveDiagram }[] = [
  { label: "Counter with enable", diagram: { title: "4-bit counter with enable", cycles: 10, period: 10, signals: [
    row("clk", "clock", 1, ""),
    row("rst", "in", 1, "1 . 0 . . . . . . ."),
    row("en", "in", 1, "0 . 1 . . 0 . 1 . ."),
    row("count", "out", 4, "0 . . 1 2 3 3 3 4 5"),
  ] } },
  { label: "D flip-flop", diagram: { title: "D flip-flop", cycles: 8, period: 10, signals: [
    row("clk", "clock", 1, ""),
    row("d", "in", 1, "0 1 1 0 1 0 0 1"),
    row("q", "out", 1, "x 0 1 1 0 1 0 0"),
  ] } },
  { label: "AND gate (no clock)", diagram: { title: "AND gate", cycles: 4, period: 10, signals: [
    row("a", "in", 1, "0 0 1 1"),
    row("b", "in", 1, "0 1 0 1"),
    row("y", "out", 1, "0 0 0 1"),
  ] } },
];
