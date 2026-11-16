/**
 * POST /api/feedback — user feedback (lib/feedback.ts): the new-user survey, the Feedback button,
 * "Was this helpful?" votes and problem issue reports. Open to everyone; rate-limited per user
 * (or per client when signed out); a filled-in honeypot ("website") gets a quiet success.
 * Read in the admin console's Feedback tab (/api/admin/feedback).
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { reportError } from "@/lib/error-log";
import { getSessionUser } from "@/lib/auth-utils";
import { validateFeedback } from "@/lib/feedback";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getSessionUser().catch(() => null);
  const { success } = await rateLimit(request, {
    limit: 20, anonymousLimit: 60, windowMs: 60 * 60_000, prefix: "feedback",
    ...(user ? { key: `user:${user.id}` } : {}),
  });
  if (!success) return NextResponse.json({ error: "That's a lot of feedback in one hour. Please try again later." }, { status: 429 });

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  if (typeof body.website === "string" && body.website.trim()) return NextResponse.json({ ok: true });   // honeypot

  const v = validateFeedback(body);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  try {
    await prisma.feedback.create({ data: { ...v.data, userId: user?.id ?? null } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    await reportError("[POST /api/feedback]", err);
    return NextResponse.json({ error: "Your feedback couldn't be saved. Please try again later." }, { status: 500 });
  }
}
