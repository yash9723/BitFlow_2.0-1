/**
 * GET    /api/classes/[id] — class page data. Members only.
 *          Teachers: join code, roster, everyone's progress, problem catalog.
 *          Students: their own progress on each assignment.
 *        ?format=csv (teachers) — the progress grid as a CSV download (roll numbers, marks).
 * PATCH  /api/classes/[id] { maxMarks } — teachers: "marks out of N" for the CSV (null for none).
 * DELETE /api/classes/[id] — delete the class (its owner, or a site admin).
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-utils";
import { classProgress, classRole, lessonCatalog, maxMarksProblem, progressCsv } from "@/lib/classes";
import { classPlanNotice } from "@/lib/institutions";

export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

// Catalog order for the assignment picker: easiest levels first.
const LEVELS = ["Beginner", "Intermediate", "Advanced", "Arena"];
const levelRank = (level: string) => {
  const i = LEVELS.findIndex((l) => level.includes(l));
  return i < 0 ? LEVELS.length : i;
};

// 404 (not 403) for non-members, so class ids can't be probed.
const notFound = () => NextResponse.json({ error: "Class not found." }, { status: 404 });

export async function GET(request: Request, { params }: Params) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Sign in to view this class." }, { status: 401 });
  const role = await classRole(params.id, me);
  if (!role) return notFound();

  const classroom = await prisma.classroom.findUnique({
    where:  { id: params.id },
    select: { id: true, name: true, joinCode: true, ownerId: true, maxMarks: true, owner: { select: { username: true } } },
  });
  if (!classroom) return notFound();
  const teacher = role === "TEACHER";

  if (new URL(request.url).searchParams.get("format") === "csv") {
    if (!teacher) return NextResponse.json({ error: "Only teachers can export progress." }, { status: 403 });
    const filename = `${classroom.name.replace(/[^A-Za-z0-9_-]+/g, "_").slice(0, 40) || "class"}-progress.csv`;
    return new NextResponse(progressCsv(await classProgress(params.id), classroom.maxMarks), {
      headers: {
        "Content-Type":        "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control":       "no-store",
      },
    });
  }

  const [progress, roster, catalog, planNotice] = await Promise.all([
    classProgress(params.id, teacher ? undefined : me.id),
    teacher
      ? prisma.classMember.findMany({
          where:   { classId: params.id },
          orderBy: [{ role: "desc" }, { joinedAt: "asc" }],   // TEACHER before STUDENT
          select:  { role: true, joinedAt: true, rollNumber: true, user: { select: { id: true, username: true } } },
        })
      : null,
    teacher
      ? prisma.question.findMany({
          where:   { archived: false },
          orderBy: { orderIndex: "asc" },
          select:  { slug: true, title: true, learningLevel: true, difficulty: true },
        }).then((qs) => [...qs.sort((a, b) => levelRank(a.learningLevel) - levelRank(b.learningLevel)), ...lessonCatalog()])
      : null,
    // The department's plan banner (lapsed, ending, over its seats): teachers only, never blocking.
    teacher ? classPlanNotice(params.id) : null,
  ]);

  return NextResponse.json({
    classroom: {
      id: classroom.id, name: classroom.name, teacher: classroom.owner.username,
      ...(teacher ? { joinCode: classroom.joinCode, maxMarks: classroom.maxMarks } : {}),
    },
    role,
    isOwner: classroom.ownerId === me.id,
    me: me.id,
    progress,
    ...(teacher ? {
      planNotice,
      roster: roster!.map((m) => ({ id: m.user.id, username: m.user.username, role: m.role, joinedAt: m.joinedAt, rollNumber: m.rollNumber })),
      catalog,
    } : {}),
  });
}

export async function PATCH(request: Request, { params }: Params) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const role = await classRole(params.id, me);
  if (!role) return notFound();
  if (role !== "TEACHER") return NextResponse.json({ error: "Only teachers can change class settings." }, { status: 403 });

  const body = await request.json().catch(() => null);
  const maxMarks = body?.maxMarks === "" || body?.maxMarks == null ? null : body.maxMarks;
  const problem = maxMarksProblem(maxMarks);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  await prisma.classroom.update({ where: { id: params.id }, data: { maxMarks } });
  return NextResponse.json({ ok: true, maxMarks });
}

export async function DELETE(_request: Request, { params }: Params) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const classroom = await prisma.classroom.findUnique({ where: { id: params.id }, select: { ownerId: true } });
  if (!classroom || (classroom.ownerId !== me.id && me.role !== "ADMIN")) {
    return (await classRole(params.id, me))
      ? NextResponse.json({ error: "Only the class owner can delete it." }, { status: 403 })
      : notFound();
  }
  await prisma.classroom.delete({ where: { id: params.id } });   // members/assignments cascade
  return NextResponse.json({ ok: true });
}
