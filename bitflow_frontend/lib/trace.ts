/**
 * lib/trace.ts — "Trace the bug": from a failed submission's two DUT waveforms (the learner's and a
 * correct design's, on the same test) to a short list of steps pointing at the learner's own code.
 * Pure, so it runs in the submit route and in scripts/trace.check.ts.
 *
 *   1. The first output that goes wrong, when, and on which clock cycle.
 *   2. The earliest wrong internal signal, among those both designs name the same way (likely the cause).
 *   3. For each, the line of the learner's code that drives it and the values feeding it at that moment.
 *
 * Nothing from the reference leaves the server except what the learner's design already names: the
 * "expected" value of an output (already shown in the waveform) and the time a shared name first differs.
 */
import type { ParsedVcd, VcdSignal } from "@/lib/vcd-parser";
import { blank, driverOf, type SourceFile } from "@/lib/verilog-lang";

/** Window event (detail: 1-based line) that an Editor with `revealLines` highlights and scrolls to. */
export const REVEAL_LINE = "bitflow:reveal-line";

export interface TraceStep {
  /** One sentence on what went wrong. */
  title:  string;
  /** The driving line and the values feeding it, when found. */
  detail: string | null;
  /** 1-based line in the learner's design, or null if it couldn't be found. */
  line:   number | null;
  /** Simulation time the step is about (moves the waveform marker). */
  time:   number;
}

const CLOCK = /^(clk|clock|.*_clk)$/i;
const leaf  = (name: string) => name.slice(name.lastIndexOf(".") + 1);

/** Value at t (the last change at or before t). */
export function valueAt(sig: VcdSignal, t: number): string | undefined {
  let v: string | undefined;
  for (const c of sig.changes) {
    if (c.time > t) break;
    v = c.value;
  }
  return v;
}

/** First time `got` disagrees with `want`; an x bit in `want` is a don't-care. Null if never. */
export function firstDifference(got: VcdSignal, want: VcdSignal): number | null {
  const times = [...new Set([...got.changes, ...want.changes].map((c) => c.time))].sort((a, b) => a - b);
  for (const t of times) {
    const w = valueAt(want, t), g = valueAt(got, t);
    if (w === undefined) continue;
    if (g === undefined || g.length !== w.length || [...w].some((bit, i) => bit !== "x" && bit !== g[i])) return t;
  }
  return null;
}

/** Rising clock edges at or before t: "cycle N". Null without a 1-bit clock. */
export function cycleAt(vcd: ParsedVcd, t: number): number | null {
  const clk = vcd.signals.find((s) => s.width === 1 && CLOCK.test(leaf(s.name)));
  if (!clk) return null;
  let n = 0, prev = "x";
  for (const c of clk.changes) {
    if (c.time > t) break;
    if (prev === "0" && c.value === "1") n++;
    prev = c.value;
  }
  return n;
}

const UNITS = ["fs", "ps", "ns", "us", "ms", "s"];
/** A VCD time in the largest unit it's a whole number of: 15000 at "1ps" → "15 ns". Plain "t=…" without a timescale. */
export function timeText(t: number, timescale: string): string {
  const m = /^\s*(\d+)\s*(fs|ps|ns|us|ms|s)\s*$/.exec(timescale);
  if (!m) return `t=${t}`;
  let v = t * Number(m[1]), u = UNITS.indexOf(m[2]);
  while (u < UNITS.length - 1 && v !== 0 && v % 1000 === 0) { v /= 1000; u++; }
  return `${v} ${UNITS[u]}`;
}

/** Binary VCD value as the learner would read it: decimal for buses (x stays x), 0/1 for bits. */
export function show(v: string | undefined): string {
  if (v === undefined) return "?";
  if (v.length === 1 || /[xz]/i.test(v)) return v;
  return String(parseInt(v, 2));
}

/** Identifiers read on the right-hand side of the statement at `line` (up to its `;`). */
export function rhsSignals(code: string, line: number): string[] {
  const text = blank(code).split("\n").slice(line - 1).join("\n");
  const stmt = text.slice(0, (text.indexOf(";") + 1) || text.length);
  const eq = stmt.search(/<=|(?<![=!<>])=(?!=)/);
  if (eq < 0) return [];
  const rhs = stmt.slice(eq).replace(/\d+'[sS]?[bodhBODH][0-9a-fA-F_xzXZ?]+|\b\d+\b/g, " ");
  const words = rhs.match(/\b[A-Za-z_]\w*\b/g) ?? [];
  return [...new Set(words.filter((w) => !/^(begin|end|if|else|case|endcase|posedge|negedge|or|and|not)$/.test(w)))];
}

interface Pair { name: string; got: VcdSignal; want: VcdSignal; at: number }

const RESET = /^(rst|reset|areset|arst|clr|clear)$/i, RESET_N = /^(rst_n|reset_n|rstn|resetn|arst_n|aresetn)$/i;

/**
 * Of the lines in the same module that assign `name` (driverOf found `first`), the one most likely
 * running at time t: while a reset is active, one with a constant right-hand side (the reset branch);
 * otherwise one that reads other signals. A register usually has both.
 */
function activeLine(code: string, name: string, first: number, vcd: ParsedVcd, prefix: string, t: number): number {
  const lines = blank(code).split("\n");
  let from = first - 1, to = first - 1;
  while (from > 0 && !/\bmodule\b/.test(lines[from])) from--;
  while (to < lines.length - 1 && !/\bendmodule\b/.test(lines[to])) to++;
  const assigns = new RegExp(String.raw`(?:\bassign\s+|(?:^|[;\s)]))${name}(?:\s*\[[^\]]*\])?\s*(?:<=|=(?!=))`);
  const candidates: number[] = [];
  for (let i = from; i <= to; i++) if (assigns.test(lines[i])) candidates.push(i + 1);
  if (candidates.length < 2) return first;
  const inReset = vcd.signals.some((s) => {
    if (s.width !== 1 || !s.name.startsWith(prefix) || s.name.slice(prefix.length).includes(".")) return false;
    const n = s.name.slice(prefix.length), v = valueAt(s, t);
    return (RESET.test(n) && v === "1") || (RESET_N.test(n) && v === "0");
  });
  return candidates.find((l) => (rhsSignals(code, l).length === 0) === inReset) ?? first;
}

/**
 * The steps, or [] if the two runs agree. `yours`/`expected` are the DUT-scoped waveforms (signal
 * names relative to the DUT), `outputs` its output ports, `code` the learner's design (null for a
 * design converted from VHDL: its line numbers wouldn't match, so steps carry no line).
 */
export function traceBug(yours: ParsedVcd, expected: ParsedVcd, outputs: string[], code: string | null): TraceStep[] {
  const isOut = new Set(outputs);
  const diffs: Pair[] = [];
  for (const got of yours.signals) {
    if (CLOCK.test(leaf(got.name))) continue;
    const want = expected.signals.find((s) => s.name === got.name && s.width === got.width);
    if (!want) continue;
    const at = firstDifference(got, want);
    if (at !== null) diffs.push({ name: got.name, got, want, at });
  }
  const out = diffs.filter((d) => isOut.has(d.name)).sort((a, b) => a.at - b.at)[0];
  if (!out) return [];
  // The earliest wrong internal signal; ties prefer one inside a submodule (deeper = nearer the cause).
  const root = diffs
    .filter((d) => !isOut.has(d.name) && d.at <= out.at)
    .sort((a, b) => a.at - b.at || b.name.split(".").length - a.name.split(".").length)[0];

  const files: SourceFile[] = code ? [{ name: "design.v", text: code }] : [];
  const cycleText = (t: number) => {
    const c = cycleAt(yours, t), at = timeText(t, yours.timescale);
    return c === null ? `at ${at}` : `at ${at} (clock cycle ${c})`;
  };
  const describe = (sig: Pair, title: string): TraceStep => {
    const name = leaf(sig.name), scope = sig.name.includes(".") ? sig.name.slice(0, sig.name.lastIndexOf(".")) : "";
    const found = code ? driverOf(files, name, scope) : null;
    const prefix = scope ? `${scope}.` : "";
    const loc = found && code ? { ...found, line: activeLine(code, name, found.line, yours, prefix, sig.at) } : null;
    let detail: string | null = null;
    if (loc && code) {
      const src = code.split("\n")[loc.line - 1]?.trim() ?? "";
      // A clocked (<=) line samples its inputs just before the edge; a combinational one at that moment.
      const clocked = /<=/.test(blank(code).split("\n")[loc.line - 1] ?? "");
      const at = clocked ? sig.at - 1 : sig.at;
      const inputs = rhsSignals(code, loc.line)
        .map((n) => ({ n, s: yours.signals.find((x) => x.name === prefix + n) }))
        .filter((x) => x.s && (clocked || x.n !== name))
        .slice(0, 6)
        .map((x) => `${x.n} = ${show(valueAt(x.s!, at))}`);
      detail = `Line ${loc.line}: ${src.length > 90 ? src.slice(0, 87) + "…" : src}`
        + (inputs.length ? `\n${clocked ? "Just before that clock edge" : "At that moment"}: ${inputs.join(", ")}.` : "");
    }
    return { title, detail, line: loc?.line ?? null, time: sig.at };
  };

  const steps = [describe(out,
    `${leaf(out.name)} first goes wrong ${cycleText(out.at)}: yours is ${show(valueAt(out.got, out.at))}, expected ${show(valueAt(out.want, out.at))}.`)];
  if (root) {
    steps.push(describe(root, root.at < out.at
      ? `Earlier, ${root.name} already differs from a correct design ${cycleText(root.at)}, before any output does. Start looking here.`
      : `${root.name} differs from a correct design at the same moment, so it may be the cause.`));
  } else {
    steps.push({
      title: `No signal inside your design goes wrong before ${leaf(out.name)}, so the mistake is most likely on the line that drives it (or in how its inputs are combined there).`,
      detail: null, line: steps[0].line, time: out.at,
    });
  }
  return steps;
}
