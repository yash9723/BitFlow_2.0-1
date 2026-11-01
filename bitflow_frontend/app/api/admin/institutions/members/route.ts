/**
 * Admin: an institution's teachers and heads.
 *
 * POST   { institutionId, username, role: "HEAD" | "TEACHER" } — adds the account, and moves the
 *        personal classes it owns into the institution (classes it creates later join too).
 * PATCH  { institutionId, userId, role } — change the role
 * DELETE ?institutionId=…&userId=… — removes the member; their classes stay with the institution
 *        (detach them with /api/admin/institutions/classes)
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { adminDenied } from "@/lib/auth-utils";
import { auditAdmin } from "@/lib/privacy-server";
import { INSTITUTION_ROLES } from "@/lib/institution-plan";

export const dynamic = "force-dynamic";

const badRole = () => NextResponse.json({ error: "The role must be HEAD or TEACHER." }, { status: 400 });

export async function POST(request: Request) {
  const denied = await adminDenied();
  if (denied) return denied;
  const body = (await request.json().catch(() => null)) ?? {};
  const role = body.role ?? "TEACHER";
  if (!(INSTITUTION_ROLES as readonly unknown[]).includes(role)) return badRole();
  const [institution, user] = await Promise.all([
    typeof body.institutionId === "string" ? prisma.institution.findUnique({ where: { id: body.institutionId }, select: { id: true, name: true } }) : null,
    typeof body.username === "string" ? prisma.user.findUnique({
      where: { username: body.username.trim() },
      select: { id: true, username: true, institutionMembership: { select: { institution: { select: { id: true, name: true } } } } },
    }) : null,
  ]);
  if (!institution) return NextResponse.json({ error: "No such institution." }, { status: 404 });
  if (!user) return NextResponse.json({ error: "No account has that username." }, { status: 404 });
  const current = user.institutionMembership?.institution;
  if (current && current.id !== institution.id) {
    return NextResponse.json({ error: `${user.username} already belongs to ${current.name}. Remove them there first.` }, { status: 409 });
  }

  const [, moved] = await prisma.$transaction([
    prisma.institutionMember.upsert({
      where:  { userId: user.id },
      create: { institutionId: institution.id, userId: user.id, role },
      update: { role },
    }),
    prisma.classroom.updateMany({ where: { ownerId: user.id, institutionId: null }, data: { institutionId: institution.id } }),
  ]);
  await auditAdmin("admin.institution.member.add", institution.id, `${user.username} as ${role}; ${moved.count} classes moved in`);
  return NextResponse.json({ ok: true, classesMoved: moved.count }, { status: 201 });
}

export async function PATCH(request: Request) {
  const denied = await adminDenied();
  if (denied) return denied;
  const body = (await request.json().catch(() => null)) ?? {};
  if (!(INSTITUTION_ROLES as readonly unknown[]).includes(body.role)) return badRole();
  const { count } = await prisma.institutionMember.updateMany({
    where: { institutionId: String(body.institutionId ?? ""), userId: String(body.userId ?? "") },
    data:  { role: body.role },
  });
  if (!count) return NextResponse.json({ error: "Not a member of that institution." }, { status: 404 });
  await auditAdmin("admin.institution.member.role", String(body.institutionId), `${body.userId} → ${body.role}`);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const denied = await adminDenied();
  if (denied) return denied;
  const url = new URL(request.url);
  const institutionId = url.searchParams.get("institutionId") ?? "", userId = url.searchParams.get("userId") ?? "";
  const { count } = await prisma.institutionMember.deleteMany({ where: { institutionId, userId } });
  if (!count) return NextResponse.json({ error: "Not a member of that institution." }, { status: 404 });
  await auditAdmin("admin.institution.member.remove", institutionId, userId);
  return NextResponse.json({ ok: true });
}
