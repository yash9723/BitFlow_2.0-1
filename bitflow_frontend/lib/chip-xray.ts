/**
 * lib/chip-xray.ts — "Chip X-ray": link the Sky130 gates from the ASIC flow (api/routes/asic.py, `gates`) back
 * to lines of the learner's Verilog, so the panel can light up a line's gates, jump from a gate to its line,
 * and say how much of the critical path each line costs. Pure; checked by scripts/chip-xray.check.ts.
 *
 * Logic optimisation (abc) drops the source location of the gates it builds, so a gate's line comes from,
 * in order: its own src (flip-flops keep theirs), the src Yosys kept on the net it drives, the line that
 * drives a named signal it feeds (driverOf), or failing all that the first of those found downstream.
 */
import type { YosysModule, YosysNetlist } from "@/lib/hardware-diagrams";
import { parseSrc } from "@/lib/hardware-diagrams";
import { pathCells, type PathStage } from "@/lib/asic-path";
import { driverOf } from "@/lib/verilog-lang";

const PREFIX = "sky130_fd_sc_hd__";
/** Output pins of Sky130 HD cells (the rest are inputs). */
const OUTPUT_PINS = new Set(["X", "Y", "Q", "Q_N", "HI", "LO", "COUT", "SUM", "CO", "S"]);
const anonymous = (net: string) => /^_\d+_$/.test(net) || net.startsWith("$");
const designLines = (src: unknown) => [...new Set(parseSrc(src).filter((s) => s.file === "design.v").map((s) => s.line))];

/** Lines of design.v behind each gate (cell name → lines; empty when none could be found). */
export function gateLines(mod: YosysModule, code: string): Map<string, number[]> {
  const files = [{ name: "design.v", text: code }];
  const bitLines = new Map<number | string, number[]>();
  for (const [name, net] of Object.entries(mod.netnames ?? {})) {
    let lines = designLines(net.attributes?.src);
    if (!anonymous(name)) {
      const at = /^[A-Za-z_]\w*$/.test(name) ? driverOf(files, name, "") : null;
      if (at) lines = [at.line];
      else if (mod.ports?.[name]) continue;          // an input port: its "line" is only the declaration
    }
    if (!lines.length) continue;
    for (const b of net.bits) if (typeof b === "number" && !bitLines.has(b)) bitLines.set(b, lines);
  }
  const consumers = new Map<number | string, string[]>();
  const outBits = new Map<string, (number | string)[]>();
  for (const [name, cell] of Object.entries(mod.cells ?? {})) {
    for (const [pin, bits] of Object.entries(cell.connections)) {
      const out = cell.port_directions?.[pin] === "output" || (!cell.port_directions && OUTPUT_PINS.has(pin));
      if (out) outBits.set(name, [...(outBits.get(name) ?? []), ...bits]);
      else for (const b of bits) consumers.set(b, [...(consumers.get(b) ?? []), name]);
    }
  }
  const own = (name: string): number[] => {
    const lines = designLines(mod.cells![name].attributes?.src);
    if (lines.length) return lines;
    return [...new Set((outBits.get(name) ?? []).flatMap((b) => bitLines.get(b) ?? []))];
  };
  const result = new Map<string, number[]>();
  for (const name of Object.keys(mod.cells ?? {})) {
    // Breadth-first downstream until a gate or net with a line turns up.
    const seen = new Set([name]);
    let frontier = [name], lines: number[] = [];
    for (let depth = 0; depth < 40 && frontier.length; depth++) {
      lines = [...new Set(frontier.flatMap(own))];
      if (lines.length) break;
      frontier = frontier.flatMap((c) => (outBits.get(c) ?? []).flatMap((b) => consumers.get(b) ?? []))
        .filter((c) => !seen.has(c) && (seen.add(c), true));
    }
    result.set(name, lines.sort((a, b) => a - b));
  }
  return result;
}

/**
 * The gates as a netlist the schematic can draw: Sky130 port directions filled in, short cell names
 * ("nand2_1"), and each gate's src set to its lines, so cursor-line highlighting and click-to-source work.
 */
export function xrayNetlist(netlist: YosysNetlist, top: string, code: string | null): { netlist: YosysNetlist; lines: Map<string, number[]> } {
  const mod = netlist.modules?.[top];
  if (!mod) return { netlist, lines: new Map() };
  const cells = Object.fromEntries(Object.entries(mod.cells ?? {}).map(([name, c]) => [name, {
    ...c,
    port_directions: c.port_directions ?? Object.fromEntries(Object.keys(c.connections).map((p) => [p, OUTPUT_PINS.has(p) ? "output" : "input"])),
  }]));
  const fixed: YosysModule = { ...mod, cells };
  const lines = code ? gateLines(fixed, code) : new Map<string, number[]>();
  const drawn = Object.fromEntries(Object.entries(cells).map(([name, c]) => {
    // A gate's own range (a register's whole always block) stays, so any line of it lights the gate.
    const kept = designLines(c.attributes?.src).length ? c.attributes!.src as string : null;
    const l = lines.get(name) ?? [];
    return [name, { ...c, type: c.type.startsWith(PREFIX) ? c.type.slice(PREFIX.length) : c.type,
                    attributes: { ...c.attributes, src: kept ?? (l.map((n) => `design.v:${n}`).join("|") || undefined) } }];
  }));
  return { netlist: { modules: { [top]: { ...fixed, cells: drawn } } }, lines };
}

/** Time on the critical path by source line, slowest first (cells without a line are under null). */
export function pathByLine(stages: PathStage[], lines: Map<string, number[]>): { line: number | null; delay: number; cells: string[] }[] {
  const by = new Map<number | null, { delay: number; cells: string[] }>();
  for (const c of pathCells(stages)) {
    if (c.port) continue;
    const line = lines.get(c.instance)?.[0] ?? null;
    const e = by.get(line) ?? { delay: 0, cells: [] };
    e.delay += c.delay;
    e.cells.push(c.instance);
    by.set(line, e);
  }
  return [...by].map(([line, e]) => ({ line, ...e })).sort((a, b) => b.delay - a.delay);
}
