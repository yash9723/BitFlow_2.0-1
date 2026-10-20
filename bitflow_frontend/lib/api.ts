/**
 * lib/api.ts — FastAPI backend client
 *
 * All network calls go through this module. Components never import Axios
 * directly — they call the typed functions here.
 *
 * Why centralise this?
 *   - One place to change the base URL (env var → staging → production).
 *   - Typed request/response — callers get autocomplete, not `any`.
 *   - Error normalisation: Axios errors are caught here and re-thrown
 *     as plain Error objects with human-readable messages.
 */

import axios, { AxiosError } from "axios";
import type { SimulateRequest, SimulateResponse } from "./types";
import { trackWake } from "./sim-status";

// ─────────────────────────────────────────────────────────────────────────────
// Axios instance
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The browser only talks to our own Next.js routes; /api/simulate forwards to
 * the FastAPI backend server-side (see lib/backend.ts, BACKEND_URL).
 */
const BASE_URL = "/api/simulate";

const apiClient = axios.create({
  baseURL: BASE_URL,
  // How long (ms) to wait for the HTTP response headers.
  // Simulation itself can take up to 30 s; add buffer for Docker startup.
  timeout: 90_000,
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Error normalisation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert an Axios error into a plain Error with a useful message.
 * This is the only function that knows what the backend's error envelope
 * looks like ({ error: string, detail: string }).
 */
function normaliseError(err: unknown): Error {
  if (axios.isAxiosError(err)) {
    const axErr = err as AxiosError<{ error?: string; detail?: string }>;

    // Network-level failure (server down, connection dropped, timeout)
    if (!axErr.response) {
      return new Error(
        "Cannot reach the BitFlow server. Check your connection and try again."
      );
    }

    // Backend returned a response body
    const data: any = axErr.response.data; // may be a plain string (e.g. proxy 429 page)
    if (typeof data === "string" && data.includes("Too Many Requests")) {
      return new Error("Rate limit reached. Please wait a few seconds before retrying.");
    }
    if (data?.detail) return new Error(data.detail);
    if (data?.error) {
      if (typeof data.error === "string" && data.error.includes("Too Many Requests")) {
        return new Error("Rate limit reached. Please wait a few seconds before retrying.");
      }
      return new Error(data.error);
    }

    // 429 / 502 / 503 / 504 Gateway & Rate limit errors
    if (
      axErr.response.status === 429 ||
      axErr.response.status === 502 ||
      axErr.response.status === 503 ||
      axErr.response.status === 504
    ) {
      return new Error(
        "Simulation server is busy or restarting. Please try again in a few seconds."
      );
    }

    // Fall back to HTTP status text
    return new Error(
      `Server error ${axErr.response.status}: ${axErr.response.statusText || "Bad Gateway"}`
    );
  }

  // Not an Axios error — re-wrap as Error
  return err instanceof Error ? err : new Error(String(err));
}

// ─────────────────────────────────────────────────────────────────────────────
// API functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /simulate
 *
 * Submit Verilog source strings and run the sandbox simulation.
 * Returns the full SimulateResponse on success.
 * Throws a normalised Error on network / infrastructure failure.
 *
 * Note: compile errors and runtime errors are NOT thrown — they come back
 * inside the response body with status !== "success". Only infrastructure
 * failures (backend down, image not found, timeout waiting for HTTP) throw.
 *
 * @param payload - design_v, testbench_v, optional timeout override
 */
export async function runSimulation(
  payload: SimulateRequest,
  retries = 6
): Promise<SimulateResponse> {
  try {
    const { data } = await trackWake(apiClient.post<SimulateResponse>("", payload));
    return data;
  } catch (err) {
    // Retry only real outages (connection dropped, server restarting: 502/503/504).
    // Never retry 429 — each retry would count against the same rate-limit window.
    const isRetryable =
      axios.isAxiosError(err) &&
      (!err.response || (err.response.status && [502, 503, 504].includes(err.response.status)));

    if (isRetryable && retries > 0) {
      const delayMs = Math.min((7 - retries) * 3000, 10000); // 3s, 6s, 9s, 10s, 10s, 10s backoff
      console.log(`[BitFlow] Simulation server unavailable. Auto-retrying in ${delayMs / 1000}s (${retries} attempts left)...`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      return runSimulation(payload, retries - 1);
    }
    throw normaliseError(err);
  }
}

/**
 * POST /api/problems/[slug]/submit
 *
 * Grade a solution on the server against the problem's hidden tests.
 * Returns the SubmissionResult; XP and progress are recorded server-side.
 */
export async function submitSolution<T>(
  slug: string,
  designCode: string,
  testbenchCode: string
): Promise<T> {
  try {
    const { data } = await trackWake(axios.post<{ submission: T }>(
      `/api/problems/${encodeURIComponent(slug)}/submit`,
      { designCode, testbenchCode },
      { timeout: 300_000 } // several hidden testcases, each up to 30 s
    ));
    return data.submission;
  } catch (err) {
    throw normaliseError(err);
  }
}

/**
 * GET /health
 *
 * Called when an editor page opens: wakes the simulator if it is asleep, so
 * it is usually ready by the first Run (lib/sim-status.ts shows the wait).
 * Returns true if the backend responds, false otherwise (never throws).
 */
export async function checkHealth(): Promise<boolean> {
  try {
    await trackWake(axios.get("/api/simulate/health", { timeout: 120_000 }));
    return true;
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// VCD download helper (runs entirely in the browser, no API call needed)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Decode a base64 VCD string and trigger a browser file download.
 *
 * The VCD content comes back from the API as a base64 string embedded in
 * the JSON response. This helper converts it to a Blob and creates a
 * temporary <a> element to trigger the browser's save dialog.
 *
 * @param vcdBase64 - The waveform.vcd_base64 field from SimulateResponse
 * @param filename  - Downloaded filename (default: wave.vcd)
 */
export function downloadVcd(
  vcdBase64: string,
  filename = "wave.vcd"
): void {
  // atob() decodes base64 → binary string; then convert to Uint8Array
  const binary = atob(vcdBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  // Create an object URL from a Blob and click an invisible <a> tag
  const blob = new Blob([bytes], { type: "text/plain" });
  const url  = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href     = url;
  link.download = filename;
  link.click();

  // Clean up the object URL — browsers garbage-collect after a short delay
  // but releasing explicitly is best practice
  setTimeout(() => URL.revokeObjectURL(url), 5_000);
}
