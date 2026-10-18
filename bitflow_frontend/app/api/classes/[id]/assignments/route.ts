/**
 * POST   /api/classes/[id]/assignments — { title, dueAt, problemSlugs[] } (teachers)
 * DELETE /api/classes/[id]/assignments?assignmentId=… (teachers)
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-utils";
import { classRole } from "@/lib/classes";

export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

const MAX_PROBLEMS = 50;

async function requireTeacher(classId: string) {
  const me = await getSessionUser();
  if (!me) return { error: NextResponse.json({ error: "Sign in first." }, { status: 401 }) };
  const role = await classRole(classId, me);
  if (!role) return { error: NextResponse.json({ error: "Class not found." }, { status: 404 }) };
  if (role !== "TEACHER") return { error: NextResponse.json({ error: "Only teachers can manage assignments." }, { status: 403 }) };
  return { me };
}

export async function POST(request: Request, { params }: Params) {
  const { error } = await requireTeacher(params.id);
  if (error) return error;

  const body  = await request.json().catch(() => ({}));
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const dueAt = new Date(body?.dueAt);
  const slugs = Array.isArray(body?.problemSlugs)
    ? [...new Set(body.problemSlugs.filter((s: unknown): s is string => typeof s === "string"))] as string[]
    : [];

  if (!title || title.length > 120) {
    return NextResponse.json({ error: "Title must be 1 to 120 characters." }, { status: 400 });
  }
  if (isNaN(dueAt.getTime())) {
    return NextResponse.json({ error: "A valid due date is required." }, { status: 400 });
  }
  if (slugs.length === 0 || slugs.length > MAX_PROBLEMS) {
    return NextResponse.json({ error: `Pick 1 to ${MAX_PROBLEMS} problems.` }, { status: 400 });
  }
  const found = await prisma.question.count({ where: { slug: { in: slugs } } });
  if (found !== slugs.length) {
    return NextResponse.json({ error: "Some of those problems don't exist." }, { status: 400 });
  }

  const assignment = await prisma.assignment.create({
    data:   { classId: params.id, title, dueAt, problemSlugs: JSON.stringify(slugs) },
    select: { id: true, title: true, dueAt: true },
  });
  return NextResponse.json({ assignment }, { status: 201 });
}

export async function DELETE(request: Request, { params }: Params) {
  const { error } = await requireTeacher(params.id);
  if (error) return error;
  const assignmentId = new URL(request.url).searchParams.get("assignmentId") ?? "";
  // Scoped by classId, so a teacher can't delete another class's assignment.
  const { count } = await prisma.assignment.deleteMany({ where: { id: assignmentId, classId: params.id } });
  return count
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: "Assignment not found." }, { status: 404 });
}
