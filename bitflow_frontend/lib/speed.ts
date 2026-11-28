/**
 * lib/speed.ts — the "fastest after layout" sweep: lay a solution out again down a fixed ladder of clock periods
 * and keep the tightest one that still meets timing. Pure; app/api/problems/[slug]/speed-entry runs it.
 *
 * Calibration on the layout server (2026-11-29): a miss ends "done" with negative slack (a "failed" job counts as a
 * miss too); OpenROAD repairs timing toward whatever period it is given, so "period - slack" at one period is not
 * the design's limit, but pass/fail followed the period (counter passed down to 1 ns; 16-bit gcd passed 2.5 ns and
 * missed 1.3 ns). Everyone uses the same ladder, so identical designs hit the service's cache and entries compare.
 */
export const LADDER = [8, 5, 3.5, 2.5, 1.8, 1.3, 1.0];
/** Layouts per entry beyond its 10 ns one; the server runs one job at a time, so keep it small. */
export const MAX_RUNS = 4;

/** One rung: pass is null while its layout runs. */
export interface Run { periodNs: number; jobId: string | null; pass: boolean | null; slackNs: number | null }
/** The entry's clean layout at the board period: where the sweep starts and the score it can't fall below. */
export interface Base { periodNs: number; slackNs: number }

/** The first rung at or below the critical path the base layout measured (the floor if it's faster than that). */
export function startRung(base: Base): number {
  const path = base.periodNs - base.slackNs;
  return LADDER.find((p) => p <= path) ?? LADDER[LADDER.length - 1];
}

/**
 * What to lay out next: go down the ladder while rungs pass, stop at the first miss; if the first rung misses, go up
 * until one passes. At most MAX_RUNS layouts. Never re-runs a rung, never goes above the base period.
 */
export function nextPeriod(base: Base, runs: Run[]): number | null {
  if (runs.some((r) => r.pass === null)) return null;               // one is still running
  if (runs.length >= MAX_RUNS) return null;
  if (!runs.length) return startRung(base);
  const tried = new Set(runs.map((r) => r.periodNs));
  const last = runs[runs.length - 1];
  const passed = runs.some((r) => r.pass);
  if (last.pass) {
    if (runs.some((r) => !r.pass)) return null;                     // came up to a pass after misses: done
    const lower = LADDER.find((p) => p < last.periodNs && !tried.has(p));
    return lower ?? null;
  }
  if (passed) return null;                                           // went down to a miss: done
  const higher = [...LADDER].reverse().find((p) => p > last.periodNs && p < base.periodNs && !tried.has(p));
  return higher ?? null;
}

/** The score: MHz at the tightest passing rung, from that layout's critical path; the base layout if none passed. */
export function speedScore(base: Base, runs: Run[]): { mhz: number; periodNs: number; slackNs: number } {
  const best = runs.filter((r) => r.pass && r.slackNs != null).sort((a, b) => a.periodNs - b.periodNs)[0];
  const at = best ? { periodNs: best.periodNs, slackNs: best.slackNs! } : base;
  const path = Math.max(at.periodNs - at.slackNs, 0.01);
  return { mhz: Math.round(100_000 / path) / 100, periodNs: at.periodNs, slackNs: at.slackNs };
}
