/**
 * lib/synth/fpga.ts — build a bitstream for a real iCE40 board:
 * Yosys synth_ice40 → pin assignment from port names (lib/synth/boards.ts) →
 * nextpnr place & route → icepack. Takes the YoWASP tools as arguments, so it
 * runs in the browser (lib/synth/fpga-worker.ts) or Node (scripts/bitstream.check.ts).
 * Versions match the server (Yosys 0.52, nextpnr 0.7).
 */
import { BOARDS, pinout, type Assignment, type BoardId, type PortInfo } from "./boards";
import type { RunYosys } from "./run";

export interface FpgaTools { runYosys: RunYosys; runNextpnrIce40: RunYosys; runIcepack: RunYosys }

export type BitstreamResult =
  | { ok: false; error: string; assignments?: Assignment[] }
  | { ok: true; top: string; bin: Uint8Array; pcf: string; assignments: Assignment[]; notes: string[];
      fmaxMhz: number | null; utilization: Record<string, { used: number; available: number }> };

const CLOCK_MHZ = 12;   // both boards' oscillator

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

export async function buildBitstream(tools: FpgaTools, boardId: BoardId, design: string): Promise<BitstreamResult> {
  const board = BOARDS[boardId];

  const synth = await tool(tools.runYosys, ["-q", "-p", "read_verilog -sv design.v; hierarchy -auto-top; synth_ice40 -json top.json"],
    { "design.v": design }, (l) => /ERROR/.test(l));
  if (!synth.ok) return synth;
  const netlist = JSON.parse(decode(synth.files["top.json"]) || "{}");
  const [top, mod] = Object.entries<any>(netlist.modules ?? {}).find(([, m]) => m.attributes?.top) ?? [];
  if (!top) return { ok: false, error: "No top module found." };

  const ports: Record<string, PortInfo> = Object.fromEntries(
    Object.entries<any>(mod.ports ?? {}).map(([n, p]) => [n, { direction: p.direction, width: p.bits.length }]));
  const pins = pinout(boardId, ports);
  if (pins.error) return { ok: false, error: pins.error, assignments: pins.assignments };

  const pnr = await tool(tools.runNextpnrIce40,
    [...board.nextpnr, "--json", "top.json", "--pcf", "top.pcf", "--freq", String(CLOCK_MHZ),
     "--asc", "top.asc", "--report", "report.json", "--timing-allow-fail", "--seed", "1", "-q"],
    { "top.json": decode(synth.files["top.json"]), "top.pcf": pins.pcf }, (l) => l.startsWith("ERROR"));
  if (!pnr.ok) return pnr;

  const pack = await tool(tools.runIcepack, ["top.asc", "top.bin"], { "top.asc": decode(pnr.files["top.asc"]) }, () => true);
  if (!pack.ok) return pack;
  const bin = pack.files["top.bin"];
  if (!(bin instanceof Uint8Array)) return { ok: false, error: "icepack produced no bitstream." };

  const report = JSON.parse(decode(pnr.files["report.json"]) || "{}");
  const fmax = Object.values<any>(report.fmax ?? {}).map((v) => v.achieved).filter(Boolean);
  const utilization = Object.fromEntries(Object.entries<any>(report.utilization ?? {}).filter(([, v]) => v.used));
  return {
    ok: true, top, bin, pcf: pins.pcf, assignments: pins.assignments, notes: pins.notes, utilization,
    fmaxMhz: fmax.length ? Math.round(Math.min(...fmax) * 10) / 10 : null,
  };
}
