/**
 * lib/sim/browser-sim.ts — "Run" in the browser (Icarus Verilog as WebAssembly, lib/sim/icarus.ts), with the
 * simulation server as the fallback.
 *
 *   runPreferBrowser(payload, useBrowser) — same contract as lib/api.ts runSimulation
 *
 * Only Verilog/SystemVerilog designs with a Verilog testbench run here; VHDL, cocotb and Verilator
 * (assertions, coverage) need the server. A fresh worker per run keeps runs independent; the browser
 * caches the 2.9 MB of WebAssembly after the first. Grading (Submit) never comes here: hidden tests stay
 * on the server.
 */
import { runSimulation } from "@/lib/api";
import type { SimulateRequest, SimulateResponse } from "@/lib/types";
import { missingSystemTask, type IcarusRequest } from "./icarus";

export const RUN_LIMIT_MS  = 10_000;   // simulation time allowed once the engine is loaded
export const LOAD_LIMIT_MS = 60_000;   // first download on a slow connection

export class BrowserSimUnavailable extends Error {}

const stopped = (): SimulateResponse => ({
  status: "timeout", exit_code: 3, success: false,
  stdout: "--- Simulating (in your browser) ---",
  stderr: `[ERROR] Simulation ran longer than ${RUN_LIMIT_MS / 1000}s and was stopped. A testbench without $finish runs forever; `
        + "for long simulations, switch the simulator to \"Icarus (server)\".",
  waveform: { available: false, size_bytes: 0, vcd_base64: null },
  duration_ms: RUN_LIMIT_MS, workspace_id: "browser",
});

export function runInBrowser(req: IcarusRequest): Promise<SimulateResponse> {
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL("./icarus.worker.ts", import.meta.url), { type: "module" });
    } catch (err) {
      reject(new BrowserSimUnavailable(String(err)));
      return;
    }
    let timer: ReturnType<typeof setTimeout>;
    const finish = (fn: () => void) => { clearTimeout(timer); worker.terminate(); fn(); };
    timer = setTimeout(() => finish(() => reject(new BrowserSimUnavailable("the simulator took too long to load"))), LOAD_LIMIT_MS);
    worker.onmessage = (e: MessageEvent<{ type: string; result?: SimulateResponse; error?: string }>) => {
      if (e.data.type === "ready") {
        clearTimeout(timer);
        timer = setTimeout(() => finish(() => resolve(stopped())), RUN_LIMIT_MS);
      } else if (e.data.type === "result") finish(() => resolve(e.data.result!));
      else finish(() => reject(new BrowserSimUnavailable(e.data.error ?? "unavailable")));
    };
    worker.onerror = (e) => finish(() => reject(new BrowserSimUnavailable(e.message || "worker error")));
    worker.postMessage(req);
  });
}

/** The editor's live check: compile the whole project (design files + testbench) and return the compiler's output, or null if the engine can't start. */
export async function compileInBrowser(design: string, testbench: string): Promise<string | null> {
  if (typeof Worker === "undefined") return null;
  try {
    return (await runInBrowser({ design, testbench, compileOnly: true })).stdout;
  } catch {
    return null;
  }
}

/** Can this run happen in the browser? Verilog design and testbench, Icarus semantics. */
export const browserEligible = (p: SimulateRequest) =>
  (p.design_language ?? "verilog") === "verilog" && (p.testbench_language ?? "verilog") === "verilog" && p.simulator !== "verilator";

/** runSimulation, in the browser when it can be; on the server otherwise, or if the browser engine can't start. */
export async function runPreferBrowser(payload: SimulateRequest, useBrowser: boolean): Promise<SimulateResponse> {
  if (!useBrowser || !browserEligible(payload) || typeof Worker === "undefined") return runSimulation(payload);
  try {
    const res = await runInBrowser({ design: payload.design_v, testbench: payload.testbench_v, files: payload.files });
    const missing = missingSystemTask(res.stdout);
    if (!missing) return res;
    const server = await runSimulation(payload);
    return { ...server, stdout: `[note] ${missing} isn't in the in-browser simulator; this run used the server.
${server.stdout}` };
  } catch (err) {
    if (!(err instanceof BrowserSimUnavailable)) throw err;
    const res = await runSimulation(payload);
    return { ...res, stdout: `[note] The in-browser simulator couldn't start (${err.message}); this run used the server.\n${res.stdout}` };
  }
}
