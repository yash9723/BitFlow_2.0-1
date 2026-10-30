/**
 * GET /api/classes/[id]/analytics — for the class's teachers: per assigned
 * problem, how many students solved it, how many submits it took, who is stuck
 * (5+ graded submits, none accepted), the test most often failed, and pairs of
 * accepted designs that look copied (lib/similarity.ts, score >= 0.9).
 * Students get 403, non-members 404 (as /api/classes/[id]).
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-utils";
import { classProgress, classRole } from "@/lib/classes";
import { similarity } from "@/lib/similarity";

export const dynamic = "force-dynamic";

const STUCK_AFTER = 5;
const SIMILAR = 0.9;
// ponytail: loads up to MAX_SUBMITS graded submissions and compares accepted designs pairwise
// per problem (fine for classes of tens of students); aggregate in SQL if classes grow to hundreds.
const MAX_SUBMITS = 20_000;

const firstFailure = (json: string): string | null => {
  try {
    const t = (JSON.parse(json || "[]") as { passed?: boolean; description?: string }[]).find((x) => !x.passed);
    return t?.description || null;
  } catch {
    return null;
  }
};

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Sign in to view this class." }, { status: 401 });
  const role = await classRole(params.id, me);
  if (!role) return NextResponse.json({ error: "Class not found." }, { status: 404 });
  if (role !== "TEACHER") return NextResponse.json({ error: "Only teachers can see class analytics." }, { status: 403 });

  const progress = await classProgress(params.id);
  // Submissions exist only for problems: assigned lessons ("lab:blink" keys) have none.
  const slugs = [...new Set(progress.assignments.flatMap((a) => a.problems.map((p) => p.slug)))].filter((s) => !s.includes(":"));
  const questions = await prisma.question.findMany({ where: { slug: { in: slugs } }, select: { id: true, slug: true, starterCode: true } });
  const studentIds = progress.students.map((s) => s.id);
  const name = new Map(progress.students.map((s) => [s.id, s.username]));
  const where = { userId: { in: studentIds }, problemId: { in: questions.map((q) => q.id) }, submissionType: "SUBMIT" };

  const [submits, accepted] = await Promise.all([
    prisma.submission.findMany({
      where, take: MAX_SUBMITS, orderBy: { createdAt: "desc" },
      select: { userId: true, problemId: true, accepted: true, createdAt: true, testcaseResults: true },
    }),
    prisma.submission.findMany({
      where: { ...where, accepted: true }, take: MAX_SUBMITS, orderBy: { createdAt: "desc" },
      select: { userId: true, problemId: true, designCode: true },
    }),
  ]);

  const problems = slugs.map((slug) => {
    const q = questions.find((x) => x.slug === slug)!;
    const info = progress.assignments.flatMap((a) => a.problems).find((p) => p.slug === slug)!;
    const mine = submits.filter((s) => s.problemId === q.id);
    const perStudent = new Map<string, { submits: number; solved: boolean }>();
    for (const s of mine) {
      const row = perStudent.get(s.userId!) ?? { submits: 0, solved: false };
      row.submits++; row.solved ||= s.accepted;
      perStudent.set(s.userId!, row);
    }
    const failures = new Map<string, number>();
    for (const s of mine) if (!s.accepted) { const f = firstFailure(s.testcaseResults); if (f) failures.set(f, (failures.get(f) ?? 0) + 1); }
    const [test, count] = [...failures].sort((a, b) => b[1] - a[1])[0] ?? [];

    // Latest accepted design per student, compared pairwise.
    const latest = new Map<string, string>();
    for (const s of accepted) if (s.problemId === q.id && !latest.has(s.userId!)) latest.set(s.userId!, s.designCode);
    const designs = [...latest];
    const similar: { a: string; b: string; score: number }[] = [];
    for (let i = 0; i < designs.length; i++) for (let j = i + 1; j < designs.length; j++) {
      const score = similarity(designs[i][1], designs[j][1], q.starterCode);
      if (score !== null && score >= SIMILAR) similar.push({ a: name.get(designs[i][0])!, b: name.get(designs[j][0])!, score: Math.round(score * 100) / 100 });
    }

    return {
      slug, title: info.title, href: info.href,
      assignments: progress.assignments.filter((a) => a.problems.some((p) => p.slug === slug)).map((a) => a.title),
      solved: [...perStudent.values()].filter((r) => r.solved).length,
      tried: perStudent.size,
      submits: mine.length,
      stuck: [...perStudent].filter(([, r]) => !r.solved && r.submits >= STUCK_AFTER).map(([id]) => name.get(id)!),
      commonFailure: test ? { test, count } : null,
      similar: similar.sort((x, y) => y.score - x.score).slice(0, 10),
    };
  });

  const lastSubmit = new Map<string, Date>();
  const submitCount = new Map<string, number>();
  for (const s of submits) {
    submitCount.set(s.userId!, (submitCount.get(s.userId!) ?? 0) + 1);
    if (!lastSubmit.has(s.userId!)) lastSubmit.set(s.userId!, s.createdAt);
  }
  return NextResponse.json({
    students: progress.students.length,
    problems,
    activity: progress.students.map((s) => ({ username: s.username, submits: submitCount.get(s.id) ?? 0, lastSubmit: lastSubmit.get(s.id) ?? null })),
  });
}
