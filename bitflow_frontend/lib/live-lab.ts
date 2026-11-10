/**
 * lib/live-lab.ts — live labs: while a teacher runs one for a class, students who join send their Sandbox code and
 * a summary of their last run (app/api/classes/[id]/live), and the teacher sees everyone at once. Pure helpers here.
 */
import type { SimulateResponse } from "@/lib/types";

/** How often a joined student's Sandbox sends its state, and the fastest the server accepts it. */
export const SNAPSHOT_EVERY_MS = 3_000;
export const SNAPSHOT_MIN_GAP_MS = 2_000;
/** How often the teacher's grid refreshes. */
export const LIVE_REFRESH_MS = 5_000;
export const MAX_NOTE = 500;

export interface RunSummary { status: string; passed: number; failed: number; firstError: string | null; at: string }

/** The last run, small: its status, PASS/FAIL line counts, and the first error line. */
export function runSummary(r: Pick<SimulateResponse, "status" | "stdout"> & { stderr?: string | null }, at = new Date()): RunSummary {
  const lines = `${r.stdout ?? ""}\n${r.stderr ?? ""}`.split("\n");
  return {
    status:     r.status,
    passed:     lines.filter((l) => /\bPASS(ED)?\b/i.test(l)).length,
    failed:     lines.filter((l) => /\bFAIL(ED)?\b/i.test(l)).length,
    firstError: lines.find((l) => /\berror\b/i.test(l))?.trim().slice(0, 200) ?? null,
    at:         at.toISOString(),
  };
}

/** A run summary from a request body, or null if it isn't one (strings clamped, numbers bounded). */
export function parseRunSummary(v: unknown): RunSummary | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? Math.max(0, Math.min(100_000, Math.round(x))) : 0);
  if (typeof o.status !== "string" || !/^[a-z_]{1,32}$/.test(o.status)) return null;
  return {
    status: o.status, passed: num(o.passed), failed: num(o.failed),
    firstError: typeof o.firstError === "string" ? o.firstError.slice(0, 200) : null,
    at: typeof o.at === "string" && !Number.isNaN(Date.parse(o.at)) ? new Date(o.at).toISOString() : new Date().toISOString(),
  };
}
