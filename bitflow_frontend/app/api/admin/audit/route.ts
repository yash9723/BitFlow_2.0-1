/** GET /api/admin/audit — the latest 200 entries of the audit trail (kept a year: lib/privacy.ts), with who did what. */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { adminDenied } from "@/lib/auth-utils";

export const dynamic = "force-dynamic";

export async function GET() {
  const denied = await adminDenied();
  if (denied) return denied;
  const rows = await prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
  const ids = [...new Set(rows.flatMap((r) => (r.actorId ? [r.actorId] : [])))];
  const names = new Map((await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, username: true } })).map((u) => [u.id, u.username]));
  return NextResponse.json({
    entries: rows.map((r) => ({
      id: r.id, createdAt: r.createdAt, action: r.action, targetId: r.targetId, detail: r.detail,
      actor: r.actorId ? names.get(r.actorId) ?? "(deleted account)" : "system or parent link",
    })),
  });
}
