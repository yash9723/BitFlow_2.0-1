/**
 * lib/unlock.ts — problems that open only after another is solved.
 * A "find the bug" problem (lib/debug-problems.ts) starts from its parent's
 * answer with one line changed, so showing it earlier would give that answer
 * away. Checked wherever its code could reach a browser: the problem API, the
 * Arena page and hub, and submit.
 */
import { prisma } from "@/lib/prisma";
import { problemHref } from "@/lib/problem-href";

export interface Lock { slug: string; title: string; href: string }

/** The problem to solve first, or null when this one is open for the user. */
export async function lockedBehind(q: { unlockAfter?: string | null }, userId: string | null | undefined): Promise<Lock | null> {
  if (!q.unlockAfter) return null;
  const parent = await prisma.question.findUnique({
    where: { slug: q.unlockAfter }, select: { id: true, slug: true, title: true, learningLevel: true, category: true },
  });
  if (!parent) return null;
  if (userId) {
    const progress = await prisma.userProgress.findUnique({
      where: { userId_problemId: { userId, problemId: parent.id } }, select: { solved: true },
    });
    if (progress?.solved) return null;
  }
  return { slug: parent.slug, title: parent.title, href: problemHref(parent) };
}

/** Slugs the user has solved, for marking locked problems in a list. */
export async function solvedSlugs(userId: string | null | undefined): Promise<Set<string>> {
  if (!userId) return new Set();
  const rows = await prisma.userProgress.findMany({ where: { userId, solved: true }, select: { question: { select: { slug: true } } } });
  return new Set(rows.map((r) => r.question.slug));
}
