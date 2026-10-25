/**
 * lib/synth/run.ts — the synthesis jobs behind the Synth panel and the virtual
 * board, built on any Yosys runner: YoWASP in the browser (lib/synth/worker.ts)
 * or in Node (scripts/synth-parity.check.ts). Results have the same shape as
 * POST /api/synthesize returns, so callers can fall back to it unchanged.
 */
import {
  BOARD_SCRIPT, MAX_SCHEMATIC_CELLS, METRICS_SCRIPT, SYNTH_SCRIPT,
  boardNetlist, gateMetrics, latchesFromLog, paramNames, parseFsmInfo, summarize, warningsFromOutput,
} from "./yosys";
import { parseYosysMessages } from "../verilog-lang";

type Tree = { [name: string]: Tree | string | Uint8Array };
/** The @yowasp/yosys `runYosys` signature (lib/api.d.ts there). */
export type RunYosys = (args: string[], files: Tree, options: {
  stdout?: ((b: Uint8Array | null) => void) | null;
  stderr?: ((b: Uint8Array | null) => void) | null;
}) => Promise<Tree | undefined> | Tree | undefined;

/** synth: the Synth panel; board: the virtual board's netlist; lint: parse only, for the editor's squiggles. */
export type SynthKind = "synth" | "board" | "lint";

const text = (v: Tree[string] | undefined) => (typeof v === "string" ? v : v instanceof Uint8Array ? new TextDecoder().decode(v) : "");

/** Run a script on design.v; returns the output files, or the error the server would give. */
async function yosys(run: RunYosys, design: string, script: string, args: string[] = []) {
  let output = "";
  const sink = (b: Uint8Array | null) => { if (b) output += new TextDecoder().decode(b); };
  try {
    const files = (await run(["-q", ...args, "-s", "run.ys"], { "design.v": design, "run.ys": script }, { stdout: sink, stderr: sink })) ?? {};
    return { ok: true as const, files, output };
  } catch (err: any) {
    if (typeof err?.code !== "number") throw err;          // not a Yosys exit: let the caller fall back
    const lines = output.trim().split("\n").filter((l) => l.trim());
    return { ok: false as const, error: lines.slice(-15).join("\n") || `yosys exited with code ${err.code}` };
  }
}

/** Gate-level scores (POST /metrics). */
async function metrics(run: RunYosys, design: string) {
  const r = await yosys(run, design, METRICS_SCRIPT);
  if (!r.ok) return null;
  return gateMetrics(JSON.parse(text(r.files["stat.json"]) || "{}"), text(r.files["ltp.txt"]));
}

/**
 * kind "synth": what /api/synthesize returns (summary, latches, warnings, FSMs,
 * gates/depth, schematic and FSM drawings). kind "board": the board netlist.
 * draw turns a netlist / FSM into SVG (lib/hardware-diagrams.ts); without it
 * the result carries `netlist` (when small enough to draw) for drawing later.
 */
export async function synthesize(
  run: RunYosys, kind: SynthKind, design: string,
  draw?: { schematic: (netlist: any) => Promise<string | null>; fsm: (fsm: any) => Promise<string> },
) {
  if (kind === "lint") {
    const r = await yosys(run, design, "read_verilog -sv design.v");
    return { ok: true as const, messages: parseYosysMessages(r.ok ? r.output : r.error) };
  }
  if (kind === "board") {
    const r = await yosys(run, design, BOARD_SCRIPT);
    return r.ok ? boardNetlist(JSON.parse(text(r.files["board.json"]) || "{}")) : r;
  }

  const r = await yosys(run, design, SYNTH_SCRIPT, ["-l", "yosys.log"]);
  if (!r.ok) return r;
  const netlist = JSON.parse(text(r.files["netlist.json"]) || "{}");
  const summary = summarize(JSON.parse(text(r.files["stat.json"]) || "{}"), netlist);
  const fsms    = parseFsmInfo(text(r.files["fsm.txt"]), paramNames(design));
  const top     = Object.entries<any>(netlist.modules ?? {}).find(([, m]) => m.attributes?.top)?.[0] ?? null;
  const drawable = summary.numCells <= MAX_SCHEMATIC_CELLS;

  // A drawing that fails to lay out shouldn't hide the numbers (same as the route).
  const safe = <T,>(p: Promise<T>) => p.catch(() => null);
  const m = await metrics(run, design);       // Yosys runs one at a time
  const [schematicSvg, fsmSvgs] = await Promise.all([
    drawable && draw ? safe(draw.schematic(netlist)) : Promise.resolve(null),
    Promise.all(fsms.map((f) => (draw ? safe(draw.fsm(f)) : Promise.resolve(null)))),
  ]);
  return {
    ok: true as const,
    top,
    ...summary,
    latches:        latchesFromLog(text(r.files["yosys.log"])),
    warnings:       warningsFromOutput(r.output),
    gates:          m?.gates ?? null,
    depth:          m?.depth ?? null,
    schematicSvg,
    schematicLimit: drawable ? null : "This design is too large to draw as a schematic.",
    fsms:           fsms.map((f, i) => ({ ...f, svg: fsmSvgs[i] })),
    ...(draw ? {} : { netlist: drawable ? netlist : null }),
  };
}
