/**
 * Admin: which classes belong to an institution.
 *
 * POST   { institutionId, joinCode } — attach a class by its join code
 * DELETE ?classId=… — detach a class (it becomes a personal class of its teacher again)
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { adminDenied } from "@/lib/auth-utils";
import { auditAdmin } from "@/lib/privacy-server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const denied = await adminDenied();
  if (denied) return denied;
  const body = (await request.json().catch(() => null)) ?? {};
  const code = typeof body.joinCode === "string" ? body.joinCode.trim().toUpperCase() : "";
  const institutionId = typeof body.institutionId === "string" ? body.institutionId : "";
  if (!(await prisma.institution.count({ where: { id: institutionId } }))) return NextResponse.json({ error: "No such institution." }, { status: 404 });
  const classroom = code ? await prisma.classroom.findUnique({ where: { joinCode: code }, select: { id: true, name: true } }) : null;
  if (!classroom) return NextResponse.json({ error: "No class has that join code." }, { status: 404 });
  await prisma.classroom.update({ where: { id: classroom.id }, data: { institutionId } });
  await auditAdmin("admin.institution.class.attach", institutionId, classroom.id);
  return NextResponse.json({ ok: true, classroom });
}

export async function DELETE(request: Request) {
  const denied = await adminDenied();
  if (denied) return denied;
  const classId = new URL(request.url).searchParams.get("classId") ?? "";
  const { count } = await prisma.classroom.updateMany({ where: { id: classId, institutionId: { not: null } }, data: { institutionId: null } });
  if (!count) return NextResponse.json({ error: "That class isn't attached to an institution." }, { status: 404 });
  await auditAdmin("admin.institution.class.detach", null, classId);
  return NextResponse.json({ ok: true });
}
