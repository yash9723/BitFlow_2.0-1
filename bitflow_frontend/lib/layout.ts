/**
 * lib/layout.ts — server-side client for the RTL-to-GDS layout service (layout/app.py on its own server,
 * LAYOUT_URL). Every call is signed for the signed-in learner (lib/jwt.ts generateLayoutJwt). Server only.
 */
import { generateLayoutJwt } from "@/lib/jwt";

/** The files a finished job can serve (must match FILES in layout/app.py). */
export const LAYOUT_FILES = [
  "final_all.webp", "final_placement.webp", "final_routing.webp", "final_clocks.webp",
  "final_worst_path.webp", "final_congestion.webp", "6_final.gds",
] as const;

export const layoutConfigured = () => !!process.env.LAYOUT_URL;

/** The clock period every leaderboard layout uses, so entries are compared at the same constraint. */
export const BOARD_PERIOD_NS = 10;

/**
 * A finished job's results -> what the after-layout leaderboard stores. It ranks only when every sign-off check
 * explicitly passed: a check that didn't run (null/undefined) never counts as a pass. The slow corner is not a gate.
 */
export function layoutVerdict(r: Record<string, unknown> | null | undefined): { area: number | null; slack: number | null; clean: boolean; message: string | null } {
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  if (!r) return { area: null, slack: null, clean: false, message: "The layout finished without results." };
  const failed: string[] = [];
  if (r.drc_violations !== 0) failed.push(r.drc_violations == null ? "routing DRC didn't run" : `${r.drc_violations} routing DRC violations`);
  if (r.drc_deck_violations !== 0) failed.push(r.drc_deck_violations == null ? "the rule-deck DRC didn't run" : `${r.drc_deck_violations} DRC violations`);
  if (r.lvs !== true) failed.push(r.lvs == null ? "LVS didn't run" : "LVS: the layout doesn't match the netlist");
  if (r.lec !== true) failed.push(r.lec == null ? "the equivalence check didn't run" : "the routed netlist differs from synthesis");
  if (r.antenna_violations !== 0) failed.push(r.antenna_violations == null ? "the antenna check didn't run" : `${r.antenna_violations} antenna violations`);
  const area = num(r.area_um2);
  if (area == null) failed.push("no routed area was reported");
  return {
    area, slack: num(r.slack_ns) ?? num(r.wns_ns), clean: failed.length === 0,
    message: failed.length ? `Not ranked: ${failed.join("; ")}.` : null,
  };
}
export const isJobId = (id: string) => /^[a-f0-9]{24}$/.test(id);

export async function layoutFetch(path: string, userId: string, init: RequestInit = {}): Promise<Response> {
  const base = (process.env.LAYOUT_URL ?? "").replace(/\/+$/, "");
  if (!base) throw new Error("LAYOUT_URL is not set");
  return fetch(`${base}${path}`, {
    ...init,
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
    headers: { ...(init.headers ?? {}), Authorization: `Bearer ${generateLayoutJwt(userId)}` },
  });
}
