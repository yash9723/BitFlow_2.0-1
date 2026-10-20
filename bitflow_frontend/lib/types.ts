/**
 * lib/types.ts — TypeScript type definitions
 *
 * These types mirror the Pydantic models in the FastAPI backend (api/models.py).
 * Keeping them in one file means:
 *   - The editor autocompletes the exact field names the backend returns.
 *   - If the API changes, there's one place to update on the frontend.
 *   - Components stay clean — they import types, not raw `any` objects.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Request
// ─────────────────────────────────────────────────────────────────────────────

/**
 * JSON body sent to POST /simulate.
 * Matches SimulateJsonRequest in api/models.py.
 */
export type DesignLanguage    = "verilog" | "vhdl";
export type TestbenchLanguage = "verilog" | "vhdl" | "python";

export interface SimulateRequest {
  /** Full source of design.v */
  design_v: string;

  /** Full source of tb.v */
  testbench_v: string;

  /** Extra input files next to design.v, e.g. a $readmemh hex file. */
  files?: Record<string, string>;

  /** Language of design_v (default verilog, which includes the SystemVerilog subset). */
  design_language?: DesignLanguage;

  /** Language of testbench_v: Verilog, VHDL (needs a VHDL design) or a cocotb Python module. */
  testbench_language?: TestbenchLanguage;

  /**
   * Override timeout in seconds (1–120).
   * Omit to use the server default (30 s).
   */
  timeout?: number;

  /** Also run Verilator lint on design_v; findings are appended to stdout. */
  lint?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Response
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Waveform metadata block inside SimulateResponse.
 * Matches WaveformInfo in api/models.py.
 */
export interface WaveformInfo {
  /** True if the testbench called $dumpfile and the VCD file was written. */
  available: boolean;

  /** Raw byte size of wave.vcd (0 if not available). */
  size_bytes: number;

  /**
   * Base64-encoded VCD file content.
   * Decode with atob() or Buffer.from(str, "base64") to get raw bytes.
   * Null if not available or if the server has include_vcd_in_response=false.
   */
  vcd_base64: string | null;
}

/**
 * Status tags returned by the backend.
 * Using a union type (not enum) keeps TypeScript strict
 * without runtime overhead.
 */
export type SimulationStatus =
  | "success"        // $finish reached cleanly
  | "compile_error"  // iverilog rejected the source
  | "runtime_error"  // vvp crashed mid-simulation
  | "timeout"        // simulation exceeded time limit
  | "file_missing"   // design.v or tb.v not found in workspace
  | "internal_error" // unexpected server-side error
  | "unknown";       // fallback for unrecognised exit codes

/**
 * Full response from POST /simulate.
 * Matches SimulateResponse in api/models.py.
 */
export interface SimulateResponse {
  /** Human-readable outcome tag — see SimulationStatus. */
  status: SimulationStatus;

  /** Raw exit code from the container entrypoint (0 = success). */
  exit_code: number;

  /** Convenience boolean — true iff status === "success". */
  success: boolean;

  /**
   * Combined stdout:
   *   - iverilog compile output
   *   - vvp $display / $monitor lines
   *
   * This is what should appear in the terminal panel.
   */
  stdout: string;

  /**
   * Stderr from:
   *   - entrypoint.sh
   *   - iverilog diagnostics
   *   - runtime failures
   *
   * Show alongside stdout in the terminal, styled differently (red).
   */
  stderr: string;

  /** Waveform metadata and optional base64 VCD payload. */
  waveform: WaveformInfo;

  /** Wall-clock duration of the entire sandbox run (milliseconds). */
  duration_ms: number;

  /**
   * Short ID of the temp workspace.
   * Useful for correlating frontend actions with backend logs.
   */
  workspace_id: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// UI state
// ─────────────────────────────────────────────────────────────────────────────

/**
 * States used by:
 *   - Run button
 *   - Terminal panel
 *   - Loading indicators
 *
 * Managed centrally inside hooks/useSimulation.ts.
 */
export type RunState =
  | "idle"     // initial state, no run yet
  | "running"  // waiting for backend response
  | "done"     // response received (success or compile/runtime error)
  | "error";   // network / infrastructure failure

// ─────────────────────────────────────────────────────────────────────────────
// Waveform / VCD types
// Re-exported from lib/vcd-parser.ts
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Re-export waveform parser types so components can import from one place:
 *
 *   import type { ParsedVcd } from "@/lib/types"
 *
 * instead of:
 *
 *   import type { ParsedVcd } from "@/lib/vcd-parser"
 *
 * This keeps the frontend architecture cleaner as the project grows.
 */
export type {
  VcdChange,
  VcdSignal,
  ParsedVcd,
} from "@/lib/vcd-parser";