/**
 * Admin: user feedback (app/api/feedback).
 *
 * GET   /api/admin/feedback              — the latest 300, the survey score for the last 30 days,
 *                                          and "Was this helpful?" votes per page
 * PATCH /api/admin/feedback {id, handled} — mark one handled (or open again)
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { adminDenied } from "@/lib/auth-utils";

export const dynamic = "force-dynamic";

export async function GET() {
  const denied = await adminDenied();
  if (denied) return denied;
  const since = new Date(Date.now() - 30 * 86_400_000);
  const [items, open, survey, votes] = await Promise.all([
    prisma.feedback.findMany({ orderBy: { createdAt: "desc" }, take: 300 }),
    // Open items that need reading: everything except bare thumbs-up/down votes with no comment.
    prisma.feedback.count({ where: { handled: false, NOT: { kind: "helpful", message: null } } }),
    prisma.feedback.aggregate({ where: { kind: "survey", createdAt: { gte: since } }, _avg: { rating: true }, _count: { _all: true } }),
    prisma.feedback.groupBy({ by: ["target", "helpful"], where: { kind: "helpful" }, _count: { _all: true } }),
  ]);
  const pages = new Map<string, { target: string; up: number; down: number }>();
  for (const v of votes) {
    const p = pages.get(v.target ?? "") ?? { target: v.target ?? "", up: 0, down: 0 };
    if (v.helpful) p.up += v._count._all; else p.down += v._count._all;
    pages.set(p.target, p);
  }
  return NextResponse.json({
    items, open,
    survey: { average: survey._avg.rating, count: survey._count._all },
    helpful: [...pages.values()].sort((a, b) => b.down - a.down || b.up - a.up),
  });
}

export async function PATCH(request: Request) {
  const denied = await adminDenied();
  if (denied) return denied;
  const body = await request.json().catch(() => null);
  if (typeof body?.id !== "string" || typeof body?.handled !== "boolean") {
    return NextResponse.json({ error: "Send {id, handled}." }, { status: 400 });
  }
  // resolvedAt starts the one-year retention clock (lib/error-log.ts prunes it).
  const updated = await prisma.feedback.updateMany({ where: { id: body.id }, data: { handled: body.handled, resolvedAt: body.handled ? new Date() : null } });
  if (!updated.count) return NextResponse.json({ error: "No such feedback." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
