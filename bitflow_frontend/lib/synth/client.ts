/**
 * lib/synth/client.ts — synthesis for the Synth panel and the virtual board,
 * run in the browser (lib/synth/worker.ts) so it never waits on the simulator
 * server waking up. Falls back to POST /api/synthesize (same result shape) when
 * the browser can't: no WebAssembly / module workers, the Yosys download fails,
 * or a run takes too long. VHDL needs the server's GHDL, so it always goes there.
 */
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
