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

interface PageProps {
  params: Promise<{ category: string; slug: string }>;
}

export default async function ArenaPage({ params }: PageProps) {
  const { slug } = await params;

  // Fetch from DB (not hardcoded lib/arena/fsm.ts)
  const problem = await getArenaProblemBySlugFromDb(slug);

  if (!problem) {
    notFound();
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
    problemType:      (problem as { problemType?: string }).problemType === "testbench" ? "testbench" as const : "design" as const,
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