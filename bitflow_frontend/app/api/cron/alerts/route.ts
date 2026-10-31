/**
 * GET /api/cron/alerts?window=<minutes> — how many errors the site logged (ErrorLog) in the
 * last window, by place, and whether that crosses ALERT_THRESHOLD (default 10). Called by
 * .github/workflows/alerts.yml with `Authorization: Bearer $CRON_SECRET`, which fails on a spike
 * so GitHub emails the owner. Counts and places only: the repository is public, messages stay in /admin.
 * It never calls the simulation server, so checking doesn't keep that awake.
 */

import crypto from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const same = (a: string, b: string) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return NextResponse.json({ error: "Alerts aren't set up (CRON_SECRET)." }, { status: 503 });
  if (!same(request.headers.get("authorization") ?? "", `Bearer ${secret}`)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const window = Math.min(1440, Math.max(5, Number(new URL(request.url).searchParams.get("window")) || 30));
  const threshold = Math.max(1, Number(process.env.ALERT_THRESHOLD) || 10);
  const since = new Date(Date.now() - window * 60_000);
  const groups = await prisma.errorLog.groupBy({
    by: ["source", "location"], where: { createdAt: { gte: since } }, _count: { _all: true },
    orderBy: { _count: { location: "desc" } }, take: 10,
  });
  const total = await prisma.errorLog.count({ where: { createdAt: { gte: since } } });
  return NextResponse.json({
    window, total, threshold, alert: total >= threshold,
    byLocation: groups.map((g) => ({ source: g.source, location: g.location.slice(0, 80), count: g._count._all })),
  });
}
