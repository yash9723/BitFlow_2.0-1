/**
 * app/problems/page.tsx — every problem on one page (Learning Path and Arena), with search
 * and filters (components/ProblemIndex.tsx). Public; signed-in learners also see what they
 * solved. Only list fields go to the browser, never statements, code or tests.
 */
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import ProblemIndex, { type IndexProblem } from "@/components/ProblemIndex";
import { getSessionUser } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { problemHref } from "@/lib/problem-href";
import { pageMeta } from "@/lib/site";
import { solvedSlugs } from "@/lib/unlock";

export const dynamic = "force-dynamic";
export const metadata = pageMeta("/problems", "All problems",
  "Every Verilog and SystemVerilog problem on BitFlow, from logic gates to RISC-V, FSMs, formal and timing: search by topic, tag and difficulty.");

const tagsOf = (json: string) => { try { const t = JSON.parse(json); return Array.isArray(t) ? t.map(String) : []; } catch { return []; } };

export default async function ProblemsPage() {
  const [rows, user] = await Promise.all([
    prisma.question.findMany({
      orderBy: [{ learningLevel: "asc" }, { orderIndex: "asc" }],
      select: { slug: true, title: true, difficulty: true, category: true, tags: true, learningLevel: true, xpReward: true, unlockAfter: true },
    }),
    getSessionUser(),
  ]);
  const solved = await solvedSlugs(user?.id);
  const bySlug = new Map(rows.map((r) => [r.slug, r]));
  const problems: IndexProblem[] = rows.map((r) => {
    const parent = r.unlockAfter ? bySlug.get(r.unlockAfter) : undefined;
    return {
      slug: r.slug, title: r.title, difficulty: r.difficulty, category: r.category, level: r.learningLevel,
      tags: tagsOf(r.tags), xp: r.xpReward, href: problemHref(r), solved: solved.has(r.slug),
      // "Find the bug" problems open once their parent is solved.
      lockedBy: parent && !solved.has(parent.slug) ? { title: parent.title, href: problemHref(parent) } : null,
    };
  });

  return (
    <div className="min-h-screen bg-void text-bright flex flex-col">
      <SiteHeader />
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <div>
          <h1 className="font-display text-3xl font-bold">All problems</h1>
          <p className="text-[13px] text-ghost mt-1">
            {problems.length} problems{user ? `, ${problems.filter((p) => p.solved).length} solved` : ""}. Search by name or tag, or narrow by level, topic and difficulty.
          </p>
        </div>
        <ProblemIndex problems={problems} signedIn={!!user} />
      </main>
      <SiteFooter />
    </div>
  );
}
