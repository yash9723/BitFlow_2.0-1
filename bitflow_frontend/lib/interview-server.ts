/**
 * lib/interview-server.ts — mock interviews in the database (rules: lib/interview.ts).
 * activeMock is also what closes the AI tutor, hints and editorials during a mock.
 */
import { prisma } from "@/lib/prisma";
import { parseSlugs } from "@/lib/contests";
import { mockClosesAt, mockResults, tierOf } from "@/lib/interview";
import { problemHref } from "@/lib/problem-href";

export function activeMock(userId: string) {
  return prisma.mockInterview.findFirst({
    where: { userId, finishedAt: null, endsAt: { gt: new Date() } }, orderBy: { startedAt: "desc" },
  });
}

/** True while this user's running mock includes this problem. */
export async function closedByMock(userId: string, slug: string): Promise<boolean> {
  const mock = await activeMock(userId);
  return !!mock && parseSlugs(mock.problems).includes(slug);
}

type MockRow = { id: string; userId: string; problems: string; startedAt: Date; endsAt: Date; finishedAt: Date | null };

export async function mockReport(m: MockRow, now: Date = new Date()) {
  const slugs = parseSlugs(m.problems);
  const closesAt = mockClosesAt(m);
  const questions = await prisma.question.findMany({
    where: { slug: { in: slugs } }, select: { id: true, slug: true, title: true, difficulty: true, category: true, learningLevel: true },
  });
  const subs = await prisma.submission.findMany({
    where: {
      userId: m.userId, submissionType: "SUBMIT", problemId: { in: questions.map((q) => q.id) },
      createdAt: { gte: m.startedAt, lt: closesAt },
    },
    select: { accepted: true, createdAt: true, gateCount: true, question: { select: { slug: true } } },
    take: 2000,
  });
  const results = mockResults(slugs, m.startedAt, closesAt, subs.map((s) => ({ ...s, slug: s.question.slug })));
  const bySlug = new Map(questions.map((q) => [q.slug, q]));
  const problems = results.flatMap((r) => {
    const q = bySlug.get(r.slug);
    return q ? [{ ...r, title: q.title, difficulty: tierOf(q.difficulty) ?? q.difficulty, href: problemHref(q) }] : [];
  });
  return {
    id: m.id, startedAt: m.startedAt, endsAt: closesAt,
    running: closesAt > now,
    solved: problems.filter((p) => p.solved).length,
    problems,
  };
}
