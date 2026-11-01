/**
 * Admin: institutions (college departments on a plan; lib/institution-plan.ts).
 *
 * GET    /api/admin/institutions — every institution with its members, classes, seats in use and plan status
 * POST   /api/admin/institutions { name, slug, plan?, seatLimit?, validUntil? ("YYYY-MM-DD"), notes? }
 * PATCH  /api/admin/institutions { id, ...any of those fields }
 * DELETE /api/admin/institutions?id=… — its classes stay, as personal classes of their teachers
 *
 * Members: /api/admin/institutions/members.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { adminDenied } from "@/lib/auth-utils";
import { auditAdmin } from "@/lib/privacy-server";
import { planStatus, readInstitution, type InstitutionInput } from "@/lib/institution-plan";
import { seatsUsed } from "@/lib/institutions";

export const dynamic = "force-dynamic";

const taken = () => NextResponse.json({ error: "Another institution already uses that address." }, { status: 409 });

export async function GET() {
  const denied = await adminDenied();
  if (denied) return denied;
  const institutions = await prisma.institution.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      members:    { orderBy: { createdAt: "asc" }, select: { role: true, user: { select: { id: true, username: true } } } },
      classrooms: { orderBy: { createdAt: "asc" }, select: { id: true, name: true, owner: { select: { username: true } }, _count: { select: { members: true } } } },
    },
  });
  const rows = await Promise.all(institutions.map(async (i) => {
    const seats = await seatsUsed(i.id);
    return {
      ...i,
      seatsUsed: seats,
      status: planStatus(i, seats),
      members: i.members.map((m) => ({ userId: m.user.id, username: m.user.username, role: m.role })),
      // _count.members includes the class's teachers
      classrooms: i.classrooms.map((c) => ({ id: c.id, name: c.name, teacher: c.owner.username, members: c._count.members })),
    };
  }));
  return NextResponse.json({ institutions: rows });
}

export async function POST(request: Request) {
  const denied = await adminDenied();
  if (denied) return denied;
  const read = readInstitution((await request.json().catch(() => null)) ?? {});
  if ("error" in read) return NextResponse.json({ error: read.error }, { status: 400 });
  const data = read.data as InstitutionInput;
  if (await prisma.institution.count({ where: { slug: data.slug } })) return taken();
  const institution = await prisma.institution.create({ data });
  await auditAdmin("admin.institution.create", institution.id, `${data.name} (${data.plan})`);
  return NextResponse.json({ institution }, { status: 201 });
}

export async function PATCH(request: Request) {
  const denied = await adminDenied();
  if (denied) return denied;
  const body = (await request.json().catch(() => null)) ?? {};
  if (typeof body.id !== "string") return NextResponse.json({ error: "Send {id, ...fields}." }, { status: 400 });
  const read = readInstitution(body, true);
  if ("error" in read) return NextResponse.json({ error: read.error }, { status: 400 });
  if (read.data.slug && (await prisma.institution.count({ where: { slug: read.data.slug, id: { not: body.id } } }))) return taken();
  const { count } = await prisma.institution.updateMany({ where: { id: body.id }, data: read.data });
  if (!count) return NextResponse.json({ error: "No such institution." }, { status: 404 });
  await auditAdmin("admin.institution.update", body.id, Object.keys(read.data).join(", "));
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const denied = await adminDenied();
  if (denied) return denied;
  const id = new URL(request.url).searchParams.get("id") ?? "";
  // Classes are kept (institutionId is set to null); memberships are removed with it.
  const { count } = await prisma.institution.deleteMany({ where: { id } });
  if (!count) return NextResponse.json({ error: "No such institution." }, { status: 404 });
  await auditAdmin("admin.institution.delete", id);
  return NextResponse.json({ ok: true });
}
