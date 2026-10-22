import { getArenaHubRows } from "@/lib/db-loader";
import ArenaHubClient, { type HubProblem } from "@/components/ArenaHubClient";
import { getSessionUser } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { problemHref } from "@/lib/problem-href";
import { solvedSlugs } from "@/lib/unlock";

export const dynamic = "force-dynamic";

export default async function ArenaHubPage() {
  const [problems, user] = await Promise.all([getArenaHubRows(), getSessionUser()]);
  const solved = await solvedSlugs(user?.id);

  // Find-the-bug problems name the problem that unlocks them.
  const parentSlugs = problems.map((p) => p.unlockAfter).filter((s): s is string => !!s);
  const parents = new Map((await prisma.question.findMany({
    where: { slug: { in: parentSlugs } }, select: { slug: true, title: true, learningLevel: true, category: true },
  })).map((q) => [q.slug, q]));

  // Only list fields go to the browser: a locked problem's starter code would give its parent's answer away.
  const list: HubProblem[] = problems.map((p) => {
    const parent = p.unlockAfter ? parents.get(p.unlockAfter) : undefined;
    return {
      slug: p.slug, title: p.title, difficulty: p.difficulty, category: p.category, xpReward: p.xpReward,
      blurb: p.statement.replace(/\]\([^)]*\)/g, "]").replace(/[*#[\]]/g, "").slice(0, 140),
      locked: parent && !solved.has(parent.slug) ? { title: parent.title, href: problemHref(parent) } : null,
    };
  });

  return <ArenaHubClient problems={list} />;
}
