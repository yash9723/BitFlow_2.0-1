/**
 * GET /api/admin/overview — numbers for the admin Overview tab: users, activity,
 * submissions per day (14 days), problems needing attention, recent errors.
 * Days are bucketed here, not in SQL, so the query works on SQLite and Postgres.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { adminDenied } from "@/lib/auth-utils";
import { problemHref } from "@/lib/problem-href";

export const dynamic = "force-dynamic";

const DAY = 86_400_000;
const DAYS = 14;
// ponytail: per-day buckets come from fetching the window's rows; past ~50k submissions in 14 days,
// switch to a SQL date_trunc groupBy (Postgres only) or a daily rollup table.
const MAX_ROWS = 50_000;

const dayKey = (d: Date) => d.toISOString().slice(0, 10);

export async function GET() {
  const denied = await adminDenied();
  if (denied) return denied;

  const now = Date.now();
  const since = new Date(now - (DAYS - 1) * DAY);
  since.setUTCHours(0, 0, 0, 0);
  const week = new Date(now - 7 * DAY);
  const month = new Date(now - 30 * DAY);

  const [users, newUsers, submissions, recent, signups, activeUsers, questions, withRef, withMutants, errors7d, attempts, accepted] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: week } } }),
    prisma.submission.count(),
    prisma.submission.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true, submissionType: true, accepted: true }, take: MAX_ROWS }),
    prisma.user.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true }, take: MAX_ROWS }),
    prisma.submission.groupBy({ by: ["userId"], where: { createdAt: { gte: week }, userId: { not: null } } }),
    prisma.question.findMany({ select: { id: true, slug: true, title: true, problemType: true, learningLevel: true, category: true } }),
    // ids only: the reference and mutant texts are large and only their presence matters here
    prisma.question.findMany({ where: { referenceSolution: { not: null } }, select: { id: true } }),
    prisma.question.findMany({ where: { mutants: { not: null } }, select: { id: true } }),
    prisma.errorLog.count({ where: { createdAt: { gte: week } } }),
    prisma.submission.groupBy({ by: ["problemId"], where: { submissionType: "SUBMIT", createdAt: { gte: month } }, _count: { _all: true } }),
    prisma.submission.groupBy({ by: ["problemId"], where: { submissionType: "SUBMIT", accepted: true, createdAt: { gte: month } }, _count: { _all: true } }),
  ]);

  const perDay = Array.from({ length: DAYS }, (_, i) => ({ day: dayKey(new Date(since.getTime() + i * DAY)), runs: 0, submits: 0, accepted: 0, signups: 0 }));
  const byDay = new Map(perDay.map((d) => [d.day, d]));
  for (const s of recent) {
    const d = byDay.get(dayKey(s.createdAt));
    if (!d) continue;
    if (s.submissionType === "SUBMIT") { d.submits++; if (s.accepted) d.accepted++; } else d.runs++;
  }
  for (const u of signups) { const d = byDay.get(dayKey(u.createdAt)); if (d) d.signups++; }

  // Problem health over the last 30 days: most attempted, and hardest (lowest acceptance, ≥ 5 submits).
  const byId = new Map(questions.map((q) => [q.id, q]));
  const acc = new Map(accepted.map((a) => [a.problemId, a._count._all]));
  const health = attempts.map((a) => {
    const q = byId.get(a.problemId);
    const ok = acc.get(a.problemId) ?? 0;
    return { slug: q?.slug ?? a.problemId, title: q?.title ?? a.problemId, href: q ? problemHref(q) : "#", submits: a._count._all, accepted: ok, rate: ok / a._count._all };
  });

  // Problems a learner can't finish (graded by mutants, none imported), or without the reference
  // that powers waveform diffs and counterexamples.
  const hasRef = new Set(withRef.map((q) => q.id)), hasMutants = new Set(withMutants.map((q) => q.id));
  const needsMutants = questions.filter((q) => (q.problemType === "testbench" || q.problemType === "formal") && !hasMutants.has(q.id));
  const noReference  = questions.filter((q) => q.problemType === "design" && !hasRef.has(q.id));
  const week7 = perDay.slice(-7);
  const submits7 = week7.reduce((n, d) => n + d.submits, 0);

  return NextResponse.json({
    users:         { total: users, new7d: newUsers, active7d: activeUsers.length },
    submissions:   { total: submissions, last7d: week7.reduce((n, d) => n + d.runs + d.submits, 0),
                     acceptRate7d: submits7 ? week7.reduce((n, d) => n + d.accepted, 0) / submits7 : null },
    perDay,
    problems:      { total: questions.length, withReference: hasRef.size,
                     needsMutants: needsMutants.map((q) => q.slug), noReference: noReference.map((q) => q.slug) },
    mostAttempted: [...health].sort((a, b) => b.submits - a.submits).slice(0, 6),
    hardest:       health.filter((h) => h.submits >= 5).sort((a, b) => a.rate - b.rate).slice(0, 6),
    errors7d,
  });
}
