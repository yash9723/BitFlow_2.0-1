/**
 * app/arena/[category]/[slug]/page.tsx
 *
 * Server Component — awaits params, fetches problem from DB.
 * Then renders ArenaSolverClient (Client Component).
 */

import { Suspense }                     from "react";
import { notFound }                     from "next/navigation";
import { getArenaProblemBySlugFromDb }  from "@/lib/db-loader";
import { ArenaSolverClient }            from "@/components/ArenaSolverClient";
import Link                             from "next/link";
import { getSessionUser }               from "@/lib/auth-utils";
import { lockedBehind }                 from "@/lib/unlock";

interface PageProps {
  params: Promise<{ category: string; slug: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const problem = await getArenaProblemBySlugFromDb((await params).slug);
  if (!problem) return { title: "Problem not found" };
  return {
    title:       problem.title,
    description: `${problem.title}: a ${String(problem.difficulty).toLowerCase()} ${problem.category} problem in the BitFlow Arena, graded against hidden tests.`,
  };
}

export default async function ArenaPage({ params }: PageProps) {
  const { slug } = await params;

  // Fetch from DB (not hardcoded lib/arena/fsm.ts)
  const problem = await getArenaProblemBySlugFromDb(slug);

  if (!problem) {
    notFound();
  }

  // A find-the-bug problem is one edit from its original's answer (lib/unlock.ts).
  const lock = await lockedBehind(problem as { unlockAfter?: string | null }, (await getSessionUser())?.id);
  if (lock) {
    return (
      <main className="min-h-screen bg-void flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-3 font-mono">
          <div className="text-2xl">🔒</div>
          <h1 className="text-bright text-lg">{problem.title}</h1>
          <p className="text-ghost text-sm">
            This one opens after you solve <Link href={lock.href} className="text-info hover:underline">{lock.title}</Link>:
            it starts from that problem&apos;s answer with one line broken.
          </p>
          <Link href="/arena" className="inline-block text-dim text-xs hover:text-ghost">← Back to the Arena</Link>
        </div>
      </main>
    );
  }

  // Map DbProblem → shape expected by ArenaSolverClient / useArenaProblem
  const arenaProblem = {
    id:               problem.id,
    slug:             problem.slug,
    title:            problem.title,
    category:         problem.category as import("@/lib/arena/types").ArenaCategory,
    difficulty:       problem.difficulty as import("@/lib/arena/types").ArenaDifficulty,
    tags:             problem.tags,
    statement:        problem.statement,
    examples:         problem.examples as import("@/lib/arena/types").ArenaExample[],
    constraints:      problem.constraints,
    starterCode:      problem.starterCode,
    testbenchSkeleton: problem.testbenchSkeleton ?? problem.publicTestbench,
    publicTestbench:  problem.publicTestbench,
    hiddenTestcases:  [],   // graded server-side; never sent to the browser
    xpReward:         problem.xpReward,
    problemType:      (["testbench", "formal"] as const).find((t) => t === (problem as { problemType?: string }).problemType) ?? "design" as const,
    estimatedMin:     30,
  };

  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-screen bg-void">
          <p className="font-mono text-dim text-sm">Loading problem…</p>
        </div>
      }
    >
      <ArenaSolverClient problem={arenaProblem} />
    </Suspense>
  );
}

// Generate static params for known arena problems at build time (optional)
// export async function generateStaticParams() {
//   const problems = await getArenaProblems();
//   return problems.map(p => ({ category: p.category.toLowerCase(), slug: p.slug }));
// }