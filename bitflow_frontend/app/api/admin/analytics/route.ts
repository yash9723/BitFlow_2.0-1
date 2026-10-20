/**
 * GET /api/admin/analytics?days=30 — page-view report for the admin page:
 * views per day, top pages and top referring sites over the last `days` days.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { adminDenied } from "@/lib/auth-utils";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = await adminDenied();
  if (denied) return denied;

  const days  = Math.min(Math.max(Number(new URL(request.url).searchParams.get("days")) || 30, 1), 365);
  const since = new Date(Date.now() - (days - 1) * 86_400_000).toISOString().slice(0, 10);
  const where = { day: { gte: since } };

  const [byDay, byPath, byReferrer] = await Promise.all([
    prisma.pageView.groupBy({ by: ["day"], where, _sum: { count: true }, orderBy: { day: "asc" } }),
    prisma.pageView.groupBy({ by: ["path"], where, _sum: { count: true }, orderBy: { _sum: { count: "desc" } }, take: 15 }),
    prisma.pageView.groupBy({ by: ["referrer"], where: { ...where, referrer: { not: "" } }, _sum: { count: true }, orderBy: { _sum: { count: "desc" } }, take: 10 }),
  ]);
  const views = (r: { _sum: { count: number | null } }) => r._sum.count ?? 0;

  return NextResponse.json({
    days,
    total:     byDay.reduce((n, r) => n + views(r), 0),
    perDay:    byDay.map((r) => ({ day: r.day, views: views(r) })),
    pages:     byPath.map((r) => ({ path: r.path, views: views(r) })),
    referrers: byReferrer.map((r) => ({ host: r.referrer, views: views(r) })),
  });
}
