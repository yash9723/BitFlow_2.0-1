/**
 * lib/heavy-limit.ts — one shared budget per signed-in user for heavy simulator jobs.
 *
 * Heavy jobs (Verilator builds, VHDL and Python testbenches, formal, FPGA, ASIC: lib/backend.ts jobClass) run
 * 2 at a time on the Sydney server (about 0.7 a second in all). Each route already limits its own calls,
 * but those limits add up: one student looping Run on several tools could still fill both slots. This budget
 * is shared across all of them, so a few students can't starve a class. Light runs (Icarus) are not counted.
 */

import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";

/** Heavy jobs one user may start per minute, across every tool (HEAVY_PER_MINUTE overrides it). */
export const HEAVY_PER_MINUTE = (() => { const n = Number(process.env.HEAVY_PER_MINUTE); return Number.isFinite(n) && n > 0 ? Math.floor(n) : 12; })();

/** null when the user is within budget, otherwise the 429 to return. */
export async function heavyBudget(request: Request, userId: string): Promise<NextResponse | null> {
  const { success } = await rateLimit(request, { limit: HEAVY_PER_MINUTE, windowMs: 60_000, prefix: "heavy", key: `user:${userId}` });
  if (success) return null;
  return NextResponse.json(
    { error: "You're running a lot of heavy jobs (Verilator, formal, FPGA, ASIC). Please wait a moment so others can run theirs too." },
    { status: 429, headers: { "Retry-After": "30" } },
  );
}
