/**
 * GET /api/admin/problems — every problem with what an admin needs to triage it:
 * level, type, submits and solve rate (all time), and whether its reference solution
 * (or, for testbench/formal problems, its mutants) has been imported.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { adminDenied } from "@/lib/auth-utils";

export const dynamic = "force-dynamic";

export async function GET() {
  const denied = await adminDenied();
  if (denied) return denied;

  const [questions, withRef, withMutants, submits, accepted, solvers] = await Promise.all([
    prisma.question.findMany({
      select: { id: true, slug: true, title: true, difficulty: true, category: true, learningLevel: true,
                problemType: true, moduleId: true, orderIndex: true, xpReward: true, archived: true, adminEditedAt: true },
      orderBy: [{ learningLevel: "asc" }, { orderIndex: "asc" }],
    }),
    // ids only: the reference and mutant texts are large and only their presence matters here
    prisma.question.findMany({ where: { referenceSolution: { not: null } }, select: { id: true } }),
    prisma.question.findMany({ where: { mutants: { not: null } }, select: { id: true } }),
    prisma.submission.groupBy({ by: ["problemId"], where: { submissionType: "SUBMIT" }, _count: { _all: true } }),
    prisma.submission.groupBy({ by: ["problemId"], where: { submissionType: "SUBMIT", accepted: true }, _count: { _all: true } }),
    prisma.userProgress.groupBy({ by: ["problemId"], where: { solved: true }, _count: { _all: true } }),
  ]);

  const count = (rows: { problemId: string; _count: { _all: number } }[]) => new Map(rows.map((r) => [r.problemId, r._count._all]));
  const subs = count(submits), oks = count(accepted), solved = count(solvers);
  const ref = new Set(withRef.map((q) => q.id)), mut = new Set(withMutants.map((q) => q.id));

  return NextResponse.json({
    problems: questions.map((q) => ({
      ...q,
      submits:      subs.get(q.id) ?? 0,
      accepted:     oks.get(q.id) ?? 0,
      solvers:      solved.get(q.id) ?? 0,
      hasReference: ref.has(q.id),
      hasMutants:   mut.has(q.id),
    })),
  });
}
