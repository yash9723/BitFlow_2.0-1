/**
 * lib/tt-replay.ts — turn the Sandbox's last testbench run (its VCD) into vectors for Tiny Tapeout's cocotb test:
 * the inputs the testbench drove and the outputs the design gave, on TT's pins. test.py (lib/tinytapeout.ts) replays
 * them on the tt_um_* wrapper, so TT's test action checks the chip against the learner's own testbench.
 *
 * Clocked designs: one snapshot just before each rising clock edge (inputs, and the outputs they produce after the
 * previous edge). Combinational: one after each input change has settled. Refuses rather than guesses: no or several
 * matching instances, an input changing on the clock edge itself (the recording can't say which value the flip-flop
 * saw), a negedge-clocked design. Output bits recorded as x/z are not checked; input bits recorded as x/z drive 0.
 */
import type { ParsedVcd, VcdSignal } from "@/lib/vcd-parser";
import type { TtMapping } from "@/lib/tinytapeout";

export const MAX_VECTORS = 2000;

/** One replay step: bytes for TT's inputs, expected outputs as MSB-first strings with "-" for unchecked bits. */
export interface Vector { ui: number; uio: number; rstN: number; uo: string; uioOut: string }
export interface Replay { clocked: boolean; vectors: Vector[]; truncated: boolean }

/** A VCD value as `width` bits, MSB first, extended on the left as VCD does (x and z extend, 0/1 extend with 0). */
function bits(value: string, width: number): string {
  if (value.length >= width) return value.slice(-width);
  const pad = value[0] === "x" || value[0] === "z" ? value[0] : "0";
  return pad.repeat(width - value.length) + value;
}

/** The value just before `t`; "x" before the first change. */
function valueBefore(s: VcdSignal, t: number): string {
  let v = "x";
  for (const c of s.changes) { if (c.time < t) v = c.value; else break; }
  return bits(v, s.width);
}

export function recordReplay(vcd: ParsedVcd | null, map: TtMapping, design: string): Replay | { error: string } {
  if (!vcd) return { error: "run your testbench first (with $dumpvars) so there's a recording to replay" };
  if (map.clock && new RegExp(`negedge\\s+${map.clock}\\b`).test(design))
    return { error: "the design uses the falling clock edge; TT's test can't replay that reliably" };

  // The instance of the design: the one scope that has every mapped port at the right width
  const want = new Map<string, number>();
  for (const p of map.pins) want.set(p.port, p.width);
  if (map.clock) want.set(map.clock, 1);
  if (map.reset) want.set(map.reset.name, 1);
  const scopes = new Map<string, Map<string, VcdSignal>>();
  for (const s of vcd.signals) {
    const sc = s.scope ?? "";
    if (!scopes.has(sc)) scopes.set(sc, new Map());
    if (!scopes.get(sc)!.has(s.name)) scopes.get(sc)!.set(s.name, s);
  }
  // A testbench often names its signals like the ports (tb.a drives tb.dut.a): both scopes match, with the same
  // values. The instance is the deepest match; two at the same depth are two instances, which we can't choose between.
  const depth = (sc: string) => (sc ? sc.split(".").length : 0);
  const matches = [...scopes.entries()].filter(([, sigs]) => [...want].every(([n, w]) => sigs.get(n)?.width === w))
    .sort((a, b) => depth(b[0]) - depth(a[0]));
  if (matches.length === 0) return { error: `the recording has no instance of ${map.top} with all its ports at these widths (dump the whole hierarchy: $dumpvars(0, tb))` };
  if (matches.length > 1 && depth(matches[0][0]) === depth(matches[1][0])) return { error: `the recording has several instances of ${map.top}; keep one in the testbench` };
  const sig = matches[0][1];

  const inputNames = [...new Set([...map.pins.filter((p) => !p.out).map((p) => p.port), ...(map.reset ? [map.reset.name] : [])])];
  const inputSigs = inputNames.map((n) => sig.get(n)!);

  let times: number[];
  if (map.clock) {
    let prev = "x";
    times = [];
    for (const c of sig.get(map.clock)!.changes) { if (c.value === "1" && prev === "0") times.push(c.time); prev = c.value; }
    if (!times.length) return { error: "the clock never rises in the recording" };
    const race = times.find((t) => inputSigs.some((s) => s.changes.some((c) => c.time === t)));
    if (race !== undefined) return { error: `an input changes exactly on the clock edge at time ${race}: change inputs just after the edge (@(posedge clk); #1;) and run again` };
  } else {
    const changes = [...new Set(inputSigs.flatMap((s) => s.changes.map((c) => c.time)))].sort((a, b) => a - b);
    if (!changes.length) return { error: "the inputs never change in the recording" };
    times = [...changes.slice(1), vcd.maxTime + 1];   // just before the next change: everything has settled
  }

  const truncated = times.length > MAX_VECTORS;
  const vectors = times.slice(0, MAX_VECTORS).map((t): Vector => {
    let ui = 0, uio = 0;
    const uo = Array<string>(8).fill("-"), uioOut = Array<string>(8).fill("-");
    for (const p of map.pins) {
      const b = valueBefore(sig.get(p.port)!, t)[p.width - 1 - p.bit];
      if (p.out) (p.bus === "uo" ? uo : uioOut)[7 - p.index] = b === "0" || b === "1" ? b : "-";
      else if (b === "1") { if (p.bus === "ui") ui |= 1 << p.index; else uio |= 1 << p.index; }
    }
    // the reset reaches the design through the wrapper: rst_n directly (active low) or inverted (active high)
    const r = map.reset ? valueBefore(sig.get(map.reset.name)!, t) : "x";
    const rstN = !map.reset ? 1 : map.reset.activeLow ? (r === "0" ? 0 : 1) : (r === "1" ? 0 : 1);
    return { ui, uio, rstN, uo: uo.join(""), uioOut: uioOut.join("") };
  });
  return { clocked: !!map.clock, vectors, truncated };
}
