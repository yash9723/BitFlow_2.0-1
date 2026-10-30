/**
 * Admin: error log (lib/error-log.ts).
 *
 * GET    /api/admin/errors  — the last 7 days grouped by place + message, newest first
 * DELETE /api/admin/errors  — clear the log
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { adminDenied } from "@/lib/auth-utils";
import { auditAdmin } from "@/lib/privacy-server";

export const dynamic = "force-dynamic";


export async function GET() {
  const denied = await adminDenied();
  if (denied) return denied;

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const groups = await prisma.errorLog.groupBy({
    by: ["source", "location", "message"],
    where: { createdAt: { gte: since } },
    _count: { _all: true },
    _max: { createdAt: true },
    orderBy: { _max: { createdAt: "desc" } },
    take: 50,
  });
  // One stack per group (the latest) so the page stays small.
  const latest = await Promise.all(groups.map((g) => prisma.errorLog.findFirst({
    where: { source: g.source, location: g.location, message: g.message },
    orderBy: { createdAt: "desc" },
    select: { stack: true },
  })));

  return NextResponse.json({
    total: groups.reduce((n, g) => n + g._count._all, 0),
    groups: groups.map((g, i) => ({
      source: g.source, location: g.location, message: g.message,
      count: g._count._all, lastSeen: g._max.createdAt, stack: latest[i]?.stack ?? null,
    })),
  });
}

export async function DELETE() {
  const denied = await adminDenied();
  if (denied) return denied;
  const { count } = await prisma.errorLog.deleteMany({});
  await auditAdmin("admin.errors.clear", null, `${count} entries`);
  return NextResponse.json({ deleted: count });
}
