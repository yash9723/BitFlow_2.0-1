/**
 * POST /api/classes/join — join a class as a student with its code { code, rollNumber? }.
 * The optional roll number goes into the teacher's marks export (lib/classes.ts).
 * Rate-limited per account so codes can't be guessed by brute force.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-utils";
import { rateLimit } from "@/lib/rate-limit";
import { canShareWithClass } from "@/lib/privacy";
import { normalizeRoll, rollNumberProblem } from "@/lib/classes";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Sign in to join a class." }, { status: 401 });
  if (!canShareWithClass(me)) {
    // A class shares your progress with its teacher: under-18s need a parent's consent first.
    return NextResponse.json({ error: "Joining a class needs your parent's or guardian's consent first. Share the parent link on your dashboard." }, { status: 403 });
  }
  if (!(await rateLimit(request, { limit: 10, windowMs: 60_000, prefix: "class-join", key: `user:${me.id}` })).success) {
    return NextResponse.json({ error: "Too many attempts. Wait a minute and try again." }, { status: 429 });
  }

  const body = await request.json().catch(() => ({}));
  const code = typeof body?.code === "string" ? body.code.trim().toUpperCase() : "";
  const rollNumber = normalizeRoll(body?.rollNumber);
  const badRoll = rollNumberProblem(rollNumber);
  if (badRoll) return NextResponse.json({ error: badRoll }, { status: 400 });
  const classroom = code
    ? await prisma.classroom.findUnique({ where: { joinCode: code }, select: { id: true, name: true } })
    : null;
  if (!classroom) {
    return NextResponse.json({ error: "No class has that code." }, { status: 404 });
  }

  // Joining twice only updates the roll number (when one is given); a teacher stays a teacher.
  await prisma.classMember.upsert({
    where:  { classId_userId: { classId: classroom.id, userId: me.id } },
    create: { classId: classroom.id, userId: me.id, role: "STUDENT", rollNumber: rollNumber || null },
    update: rollNumber ? { rollNumber } : {},
  });
  return NextResponse.json({ classroom });
}
