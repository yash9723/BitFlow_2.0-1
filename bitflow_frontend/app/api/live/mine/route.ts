/**
 * GET /api/live/mine — live labs running in classes where you're a student, for the Sandbox's banner:
 * { canJoin, labs: [{ classId, className, joined, note }] }. Empty when signed out.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-utils";
import { canShareWithClass } from "@/lib/privacy";

export const dynamic = "force-dynamic";

export async function GET() {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ canJoin: false, labs: [] });
  const labs = await prisma.liveLab.findMany({
    where:  { classroom: { members: { some: { userId: me.id, role: "STUDENT" } } } },
    select: { classId: true, classroom: { select: { name: true } }, snapshots: { where: { userId: me.id }, select: { note: true } } },
  });
  return NextResponse.json({
    canJoin: canShareWithClass(me),
    labs: labs.map((l) => ({ classId: l.classId, className: l.classroom.name, joined: l.snapshots.length > 0, note: l.snapshots[0]?.note ?? null })),
  });
}
