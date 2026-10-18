/**
 * DELETE /api/classes/[id]/members?userId=…
 *   A student may remove themselves (leave); a teacher may remove students.
 *   The class owner can't be removed (delete the class instead).
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-utils";
import { classRole } from "@/lib/classes";

export const dynamic = "force-dynamic";

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const role = await classRole(params.id, me);
  if (!role) return NextResponse.json({ error: "Class not found." }, { status: 404 });

  const userId = new URL(request.url).searchParams.get("userId") ?? "";
  if (userId !== me.id && role !== "TEACHER") {
    return NextResponse.json({ error: "Only teachers can remove other members." }, { status: 403 });
  }
  const classroom = await prisma.classroom.findUnique({ where: { id: params.id }, select: { ownerId: true } });
  if (classroom?.ownerId === userId) {
    return NextResponse.json({ error: "The class owner can't leave; delete the class instead." }, { status: 400 });
  }

  const { count } = await prisma.classMember.deleteMany({ where: { classId: params.id, userId } });
  return count
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: "Not a member of this class." }, { status: 404 });
}
