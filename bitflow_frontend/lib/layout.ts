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
