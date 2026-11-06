/**
 * app/api/simulate/route.ts — Secure server-side proxy to FastAPI
 *
 * The browser calls this route; it signs a short-lived JWT and forwards the
 * request to the FastAPI backend (lib/backend.ts), so JWT_SECRET never
 * reaches the browser and the backend can't be called directly.
 *
 * Running code needs a session (anyone can read the site and open the Sandbox; the run itself is an
 * account action). It is also rate-limited per user (lib/rate-limit.ts).
 */

import { NextResponse } from "next/server";
import { simulateOnBackend } from "@/lib/backend";
import { rateLimit } from "@/lib/rate-limit";
import { getSessionUser, signInRequired } from "@/lib/auth-utils";
import { reportError } from "@/lib/error-log";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return signInRequired();
  const { success } = await rateLimit(request, {
    limit: 30, anonymousLimit: 120, windowMs: 60_000, prefix: "simulate",
    key: user ? `user:${user.id}` : undefined,
  });
  if (!success) {
    return NextResponse.json(
      { error: "Too Many Requests — please wait a few seconds before running again." },
      { status: 429 }
    );
  }

  try {
    const body = await request.json();
    const { status, data } = await simulateOnBackend(body);
    return NextResponse.json(data, { status });
  } catch (err: any) {
    await reportError("[Simulate Proxy] Error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to reach simulation backend" },
      { status: 502 }
    );
  }
}
