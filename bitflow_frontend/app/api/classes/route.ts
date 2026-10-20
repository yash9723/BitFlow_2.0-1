/**
 * GET  /api/classes — classes I teach or belong to.
 * POST /api/classes — create a class { name }; the creator becomes its teacher.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-utils";
import { rateLimit } from "@/lib/rate-limit";
import { newJoinCode } from "@/lib/classes";

export const dynamic = "force-dynamic";

export async function GET() {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Sign in to see your classes." }, { status: 401 });

  const memberships = await prisma.classMember.findMany({
    where:   { userId: me.id },
    orderBy: { joinedAt: "desc" },
    select: {
      role: true,
      classroom: {
        select: {
          id: true, name: true,
          owner:  { select: { username: true } },
          _count: { select: { members: true, assignments: true } },
        },
      },
    },
  });

  return NextResponse.json({
    classes: memberships.map(({ role, classroom: c }) => ({
      id: c.id, name: c.name, role, teacher: c.owner.username,
      members: c._count.members, assignments: c._count.assignments,
    })),
  });
}

export async function POST(request: Request) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Sign in to create a class." }, { status: 401 });
  if (!(await rateLimit(request, { limit: 10, windowMs: 60 * 60_000, prefix: "class-create", key: `user:${me.id}` })).success) {
    return NextResponse.json({ error: "Too many classes created. Try again later." }, { status: 429 });
  }

  const body = await request.json().catch(() => ({}));
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name || name.length > 80) {
    return NextResponse.json({ error: "Class name must be 1 to 80 characters." }, { status: 400 });
  }

  // Join codes are unique; on the (very unlikely) collision, try a fresh code.
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const classroom = await prisma.classroom.create({
        data: {
          name, joinCode: newJoinCode(), ownerId: me.id,
          members: { create: { userId: me.id, role: "TEACHER" } },
        },
        select: { id: true, name: true, joinCode: true },
      });
      return NextResponse.json({ classroom }, { status: 201 });
    } catch (err: any) {
      if (err?.code !== "P2002") throw err;
    }
  }
  return NextResponse.json({ error: "Couldn't create the class. Please try again." }, { status: 500 });
}
