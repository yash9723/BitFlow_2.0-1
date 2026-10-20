/**
 * lib/backend.ts — Server-side client for the FastAPI simulation backend.
 * Used by the /api/simulate proxy and by server-side grading. Never import
 * this from client components: it signs requests with JWT_SECRET.
 */

import { generateBackendJwt } from "@/lib/jwt";

export interface SimulateBody {
  design_v:    string;
  testbench_v: string;
  timeout?:    number;
  files?:      Record<string, string>;
  design_language?:    "verilog" | "vhdl";
  testbench_language?: "verilog" | "vhdl" | "python";
}

export type FormalMode = "bmc" | "prove" | "cover";

// BACKEND_URL is read at runtime; NEXT_PUBLIC_* values are inlined at build time.
export function backendUrl(): string {
  const url = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL;
  if (url) return url;
  if (process.env.NODE_ENV === "production") {
    throw new Error("BACKEND_URL is not set");
  }
  return "http://127.0.0.1:8000";
}

/** POST /simulate on the backend. Returns the HTTP status and parsed body. */
export function simulateOnBackend(body: SimulateBody): Promise<{ status: number; data: any }> {
  return postToBackend("/simulate", body);
}

/** POST /metrics: gate count, flip-flop bits and logic depth of a design. */
export function metricsOnBackend(design_v: string): Promise<{ status: number; data: any }> {
  return postToBackend("/metrics", { design_v });
}

/** POST /fpga: LUT / flip-flop / block RAM / DSP estimate for an iCE40 or Xilinx 7-series part. */
export function fpgaOnBackend(design_v: string, family: "ice40" | "xc7"): Promise<{ status: number; data: any }> {
  return postToBackend("/fpga", { design_v, family });
}

/** POST /board: gate-level netlist for the virtual board (lib/gate-sim.ts). */
export function boardOnBackend(design_v: string): Promise<{ status: number; data: any }> {
  return postToBackend("/board", { design_v });
}

/** POST /equivalence: shortest input sequence (from reset) where two designs differ. */
export function equivalenceOnBackend(gold_v: string, gate_v: string, max_cycles = 16): Promise<{ status: number; data: any }> {
  return postToBackend("/equivalence", { gold_v, gate_v, max_cycles });
}

/** POST /vhdl: VHDL design -> Verilog netlist (GHDL), for the Verilog-only grading and synthesis tools. */
export function vhdlOnBackend(design_vhdl: string): Promise<{ status: number; data: any }> {
  return postToBackend("/vhdl", { design_vhdl });
}

/** Verilog source of a design in either language, or the conversion error. */
export async function designAsVerilog(code: string, language: string | undefined): Promise<{ verilog: string } | { error: string }> {
  if (language !== "vhdl") return { verilog: code };
  const { status, data } = await vhdlOnBackend(code);
  if (status !== 200) return { error: data?.detail || data?.error || "VHDL conversion failed." };
  return data?.ok ? { verilog: data.verilog } : { error: `VHDL error:\n${data?.error ?? "conversion failed"}` };
}

/** POST /formal: bounded check (bmc), induction proof (prove) or cover search of assert/assume/cover. */
export function formalOnBackend(design_v: string, harness_v: string | null, mode: FormalMode, depth = 20): Promise<{ status: number; data: any }> {
  return postToBackend("/formal", { design_v, harness_v, mode, depth });
}

/** POST /synthesize (Yosys) on the backend. */
export function synthesizeOnBackend(design_v: string): Promise<{ status: number; data: any }> {
  return postToBackend("/synthesize", { design_v });
}

async function postToBackend(path: string, body: unknown): Promise<{ status: number; data: any }> {
  const res = await fetch(`${backendUrl()}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization:  `Bearer ${generateBackendJwt()}`,
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    data = { error: text.trim() || res.statusText || "Backend error" };
  }
  return { status: res.status, data };
}
