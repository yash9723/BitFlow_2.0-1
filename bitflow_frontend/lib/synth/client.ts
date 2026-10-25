/**
 * lib/synth/client.ts — synthesis for the Synth panel and the virtual board,
 * run in the browser (lib/synth/worker.ts) so it never waits on the simulator
 * server waking up. Falls back to POST /api/synthesize (same result shape) when
 * the browser can't: no WebAssembly / module workers, the Yosys download fails,
 * or a run takes too long. VHDL needs the server's GHDL, so it always goes there.
 */
import type { BoardId } from "./boards";
import type { BitstreamResult, ExportPins } from "./fpga";
import type { SynthKind } from "./run";

const FIRST_RUN_MS = 120_000;   // includes downloading Yosys (~6 MB)
const RUN_MS       = 30_000;

let worker: Worker | null = null;
let loaded = false;
let seq = 0;
const pending = new Map<number, (msg: { result?: any; failed?: string }) => void>();

/** True once Yosys has run here, so callers can say "loading tools" the first time. */
export const synthToolsLoaded = () => loaded;

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e) => { pending.get(e.data.id)?.(e.data); pending.delete(e.data.id); };
    worker.onerror   = () => reset();
  }
  return worker;
}

/** Kill the worker (a stuck run can't be interrupted otherwise) and fail what was waiting. */
function reset() {
  worker?.terminate();
  worker = null;
  pending.forEach((done) => done({ failed: "worker stopped" }));
  pending.clear();
}

function inBrowser(kind: SynthKind, design: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    const timer = setTimeout(() => { reset(); reject(new Error("timeout")); }, loaded ? RUN_MS : FIRST_RUN_MS);
    pending.set(id, (msg) => {
      clearTimeout(timer);
      if (msg.failed !== undefined) return reject(new Error(msg.failed));
      loaded = true;
      resolve(msg.result);
    });
    getWorker().postMessage({ id, kind, design });
  });
}

async function onServer(kind: SynthKind, designCode: string, language: string): Promise<any> {
  try {
    const res  = await fetch("/api/synthesize", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ designCode, language, ...(kind === "board" ? { board: true } : {}) }),
    });
    const data = await res.json().catch(() => ({}));
    return res.ok ? data : { ok: false, error: data.error ?? `Request failed (${res.status})` };
  } catch {
    return { ok: false, error: "Network error." };
  }
}

/** Draw the schematic and FSM diagrams for a worker result (elkjs, loaded on first use). */
async function withDiagrams(r: any): Promise<any> {
  if (!r?.ok || !("netlist" in r)) return r;
  const { netlist, ...rest } = r;
  const { schematicSvg, fsmSvg } = await import("@/lib/hardware-diagrams");
  const safe = <T,>(p: Promise<T>) => p.catch(() => null);   // a failed layout keeps the numbers
  const [schematic, fsmSvgs] = await Promise.all([
    netlist ? safe(schematicSvg(netlist)) : Promise.resolve(null),
    Promise.all(rest.fsms.map((f: any) => safe(fsmSvg(f)))),
  ]);
  return { ...rest, schematicSvg: schematic, fsms: rest.fsms.map((f: any, i: number) => ({ ...f, svg: fsmSvgs[i] })) };
}

const canRunHere = () => typeof Worker !== "undefined" && typeof WebAssembly !== "undefined";

/** kind "synth": the Synth panel's result; kind "board": the board netlist. Never throws. */
export async function synthesizeDesign(kind: SynthKind, designCode: string, language: "verilog" | "vhdl" = "verilog"): Promise<any> {
  if (language === "vhdl" || !canRunHere()) return onServer(kind, designCode, language);
  let result: any;
  try {
    result = await inBrowser(kind, designCode);
  } catch (err) {
    console.warn("[synth] browser synthesis unavailable, using the server:", err);
    return onServer(kind, designCode, language);
  }
  return withDiagrams(result);
}

// ── Bitstreams for real boards (lib/synth/fpga-worker.ts) ──────────────────
// Browser only: the server has no chip databases for these boards.

const BITSTREAM_FIRST_MS = 360_000;   // first build downloads the tools, a chip database (and for Gowin, Pyodide)
const BITSTREAM_MS       = 90_000;

let fpga: { board: BoardId; worker: Worker; built: boolean } | null = null;
const fpgaPending = new Map<number, (msg: { result?: any; failed?: string }) => void>();

function stopFpga() {
  fpga?.worker.terminate();
  fpga = null;
  fpgaPending.forEach((done) => done({ failed: "worker stopped" }));
  fpgaPending.clear();
}

/** Has a bitstream been built for this board in this tab (tools already downloaded)? */
export const bitstreamToolsLoaded = (board: BoardId) => fpga?.board === board && fpga.built;

/** Synthesize, place, route and pack for a real board, with its pins from port names or `constraints`. Never throws. */
export const buildBitstreamInBrowser = (board: BoardId, design: string, constraints?: string): Promise<BitstreamResult> =>
  runFpga(board, design, false, constraints);

/** The top module, its ports and pin constraints (Yosys only): for exported projects and the constraints editor. Never throws. */
export const exportPinsInBrowser = (board: BoardId, design: string, constraints?: string): Promise<ExportPins> =>
  runFpga(board, design, true, constraints);

function runFpga(board: BoardId, design: string, exportOnly: boolean, constraints?: string): Promise<any> {
  if (!canRunHere()) return Promise.resolve({ ok: false, error: "This browser can't run the FPGA tools (WebAssembly workers are unavailable)." });
  if (fpga && fpga.board !== board) stopFpga();         // one chip database per worker
  if (!fpga) {
    const worker = new Worker(new URL("./fpga-worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e) => { fpgaPending.get(e.data.id)?.(e.data); fpgaPending.delete(e.data.id); };
    worker.onerror   = () => stopFpga();
    fpga = { board, worker, built: false };
  }
  const current = fpga;
  return new Promise((resolve) => {
    const id = ++seq;
    const timer = setTimeout(() => { stopFpga(); resolve({ ok: false, error: "The build took too long. Try again, or try a smaller design." }); },
      current.built ? BITSTREAM_MS : BITSTREAM_FIRST_MS);
    fpgaPending.set(id, (msg) => {
      clearTimeout(timer);
      if (msg.failed !== undefined) return resolve({ ok: false, error: `Couldn't load the FPGA tools (${msg.failed}). Check your connection and try again.` });
      current.built = true;
      resolve(msg.result!);
    });
    current.worker.postMessage({ id, board, design, export: exportOnly, constraints });
  });
}

/**
 * The latest Synth panel results for one design, so the lab report (components/LabReport.tsx)
 * can include them. In memory only: a reload or a different design clears it.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
let lastSynthesis: { design: string; synth?: any; fpga: Record<string, any> } | null = null;
export function rememberSynthesis(design: string, part: { synth?: any; fpga?: Record<string, any> }) {
  if (lastSynthesis?.design !== design) lastSynthesis = { design, fpga: {} };
  if (part.synth) lastSynthesis.synth = part.synth;
  Object.assign(lastSynthesis.fpga, part.fpga ?? {});
}
export const synthesisFor = (design: string) => (lastSynthesis?.design === design ? lastSynthesis : null);
/* eslint-enable @typescript-eslint/no-explicit-any */
