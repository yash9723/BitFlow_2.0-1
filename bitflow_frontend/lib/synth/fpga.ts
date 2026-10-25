/**
 * lib/synth/fpga.ts — build a bitstream for a real board: Yosys synth_<family> →
 * pin assignment from port names (lib/synth/boards.ts) → nextpnr place & route →
 * the family's packer (icepack / ecppack / gowin_pack). Takes the YoWASP tools as
 * arguments, so it runs in the browser (lib/synth/fpga-worker.ts) or Node
 * (scripts/bitstream.check.ts). Versions: Yosys 0.52, nextpnr-ice40/ecp5 0.7,
 * nextpnr-himbaechel-gowin 0.10 with apicula 0.31.
 */
import { BOARDS, pinout, type Assignment, type Board, type BoardId, type Family, type PortInfo } from "./boards";
import type { ConstraintFormat } from "./constraints";
import { type PnrSummary, pnrSummary } from "./pnr";
import type { RunYosys } from "./run";

/** runNextpnr / runPack: nextpnr-<family> and icepack, ecppack or gowin_pack. */
export interface FpgaTools { runYosys: RunYosys; runNextpnr: RunYosys; runPack: RunYosys }

export type BitstreamResult =
  | { ok: false; error: string; assignments?: Assignment[] }
  | { ok: true; top: string; bin: Uint8Array; file: string; constraints: string; format: ConstraintFormat;
      assignments: Assignment[]; notes: string[];
      fmaxMhz: number | null; utilization: Record<string, { used: number; available: number }>;
      /** Placement and critical paths for the floorplan (components/Floorplan.tsx); iCE40 only. */
      pnr: PnrSummary | null };

export type ExportPins =
  | { ok: false; error: string; assignments?: Assignment[] }
  | { ok: true; top: string; constraints: string; format: ConstraintFormat; assignments: Assignment[]; notes: string[] };

const decode = (v: unknown) => (typeof v === "string" ? v : v instanceof Uint8Array ? new TextDecoder().decode(v) : "");

/** Run one tool; on a non-zero exit, the error lines it printed. */
async function tool(run: RunYosys, args: string[], files: Record<string, string | Uint8Array>, keep: (line: string) => boolean) {
  let log = "";
  const sink = (b: Uint8Array | null) => { if (b) log += new TextDecoder().decode(b); };
  try {
    return { ok: true as const, files: (await run(args, files, { stdout: sink, stderr: sink })) ?? {} };
  } catch (err: any) {
    if (typeof err?.code !== "number") throw err;
    const lines = log.split("\n").filter(keep);
    return { ok: false as const, error: (lines.length ? lines : log.trim().split("\n")).slice(-8).join("\n") || `exit code ${err.code}` };
  }
}

const SYNTH: Record<Family, string> = {
  ice40: "synth_ice40 -json top.json", ecp5: "synth_ecp5 -json top.json", gowin: "synth_gowin -json top.json",
  xilinx: "proc; write_json top.json", intel: "proc; write_json top.json",   // export only: just the ports
};

/** Synthesize and assign pins: the top module, its netlist and the board's constraints. */
async function synthAndPins(runYosys: RunYosys, boardId: BoardId, design: string) {
  const synth = await tool(runYosys, ["-q", "-p", `read_verilog -sv design.v; hierarchy -auto-top; ${SYNTH[BOARDS[boardId].family]}`],
    { "design.v": design }, (l) => /ERROR/.test(l));
  if (!synth.ok) return synth;
  const json = decode(synth.files["top.json"]);
  const netlist = JSON.parse(json || "{}");
  const [top, mod] = Object.entries<any>(netlist.modules ?? {}).find(([, m]) => m.attributes?.top) ?? [];
  if (!top) return { ok: false as const, error: "No top module found." };
  const ports: Record<string, PortInfo> = Object.fromEntries(
    Object.entries<any>(mod.ports ?? {}).map(([n, p]) => [n, { direction: p.direction, width: p.bits.length }]));
  const pins = pinout(boardId, ports);
  if (pins.error) return { ok: false as const, error: pins.error, assignments: pins.assignments };
  return { ok: true as const, top, json, pins };
}

/** Place, route and pack for one family: the tool runs and the bitstream file they produce. */
function flow(board: Board, constraints: string): { nextpnr: string[]; files: Record<string, string>; routed: string; pack: string[]; out: string } {
  const common = ["--freq", String(board.clockMhz), "--report", "report.json", "--timing-allow-fail", "--seed", "1", "-q"];
  switch (board.family) {
    case "ice40": return {
      nextpnr: [...board.nextpnr, "--json", "top.json", "--pcf", "top.pcf", "--asc", "top.asc", "--write", "placed.json", ...common],
      files: { "top.pcf": constraints }, routed: "top.asc", pack: ["top.asc", "top.bin"], out: "top.bin" };
    case "ecp5": return {
      nextpnr: [...board.nextpnr, "--json", "top.json", "--lpf", "top.lpf", "--textcfg", "top.config", ...common],
      files: { "top.lpf": constraints }, routed: "top.config", pack: ["--compress", "top.config", "top.bit"], out: "top.bit" };
    default: return {
      nextpnr: ["--json", "top.json", "--write", "pnr.json", ...board.nextpnr, "--vopt", "cst=top.cst", ...common],
      files: { "top.cst": constraints }, routed: "pnr.json", pack: ["-d", board.chip, "-o", "top.fs", "pnr.json"], out: "top.fs" };
  }
}

export async function buildBitstream(tools: FpgaTools, boardId: BoardId, design: string): Promise<BitstreamResult> {
  const board = BOARDS[boardId];
  const s = await synthAndPins(tools.runYosys, boardId, design);
  if (!s.ok) return s;
  const f = flow(board, s.pins.constraints);

  const pnr = await tool(tools.runNextpnr, f.nextpnr, { "top.json": s.json, ...f.files }, (l) => l.startsWith("ERROR"));
  if (!pnr.ok) return pnr;
  const pack = await tool(tools.runPack, f.pack, { [f.routed]: decode(pnr.files[f.routed]) }, () => true);
  if (!pack.ok) return pack;
  const out = pack.files[f.out];
  const bin = typeof out === "string" ? new TextEncoder().encode(out) : out;   // gowin_pack writes text
  if (!(bin instanceof Uint8Array) || bin.length === 0) return { ok: false, error: "The packer produced no bitstream." };

  const report = JSON.parse(decode(pnr.files["report.json"]) || "{}");
  const summary = pnrSummary(report, JSON.parse(decode(pnr.files["placed.json"]) || "{}"), board.grid ?? { width: 0, height: 0 });
  return {
    ok: true, top: s.top, bin, file: `${s.top}.${f.out.split(".")[1]}`, constraints: s.pins.constraints, format: s.pins.format,
    assignments: s.pins.assignments, notes: s.pins.notes,
    utilization: summary.utilization, fmaxMhz: summary.fmax[0]?.mhz ?? null, pnr: board.grid ? summary : null,
  };
}

/** For boards built with the vendor's tools (Xilinx, Intel): the top module and its pin constraints. */
export async function portsForExport(runYosys: RunYosys, boardId: BoardId, design: string): Promise<ExportPins> {
  const s = await synthAndPins(runYosys, boardId, design);
  if (!s.ok) return s;
  return { ok: true, top: s.top, constraints: s.pins.constraints, format: s.pins.format, assignments: s.pins.assignments, notes: s.pins.notes };
}
