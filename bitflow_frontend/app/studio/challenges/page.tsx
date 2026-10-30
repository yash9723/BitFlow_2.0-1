/** app/studio/challenges/page.tsx — the graded circuit challenges, by level. Public; signed-in learners see what they solved. */

import Link from "next/link";
import StudioShell from "@/components/studio/StudioShell";
import { getSessionUser } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { CHALLENGES } from "@/lib/studio/circuit-challenges";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Circuit challenges",
  description: "Build circuits against a gate budget: XOR from four NANDs, a 4-bit adder, BCD to 7-segment, a sequence detector. Each one is checked by simulation.",
  alternates: { canonical: "/studio/challenges" },
};

const LEVELS = ["Beginner", "Core", "GATE"] as const;

export default async function ChallengesPage() {
  const user = await getSessionUser();
  const rows = user ? await prisma.lessonProgress.findMany({ where: { userId: user.id, kind: "challenge", done: true }, select: { slug: true } }) : [];
  const solved = new Set(rows.map((r) => r.slug));
  return (
    <StudioShell title="Circuit challenges" path="/studio/challenges">
      <p className="text-[13px] text-ghost max-w-2xl">
        Build each circuit in the editor from the parts allowed, within the gate budget. It is simulated on every input it can see, and a first pass earns XP.
        {user ? ` You have solved ${solved.size} of ${CHALLENGES.length}.` : " Sign in to keep your XP; you can try them all without an account."}
      </p>
      {LEVELS.map((level) => (
        <section key={level} className="mt-6">
          <h2 className="font-display text-[15px] font-semibold">{level}</h2>
          <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {CHALLENGES.filter((c) => c.level === level).map((c) => (
              <Link key={c.id} href={`/studio/challenges/${c.id}`}
                    className="group block p-4 rounded-xl border border-rim/60 bg-surface/40 hover:border-phosphor/50 hover:bg-surface/70 transition-colors">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="font-display text-[14px] font-semibold text-bright group-hover:text-phosphor">{c.title}</h3>
                  <span className={`font-mono text-[10px] shrink-0 ${solved.has(c.id) ? "text-phosphor" : "text-dim"}`}>{solved.has(c.id) ? "✓ solved" : `${c.xp} XP`}</span>
                </div>
                <p className="mt-1 text-[12px] leading-relaxed text-ghost">{c.statement}</p>
                <p className="mt-2 font-mono text-[10px] text-dim">at most {c.budget} gate{c.budget === 1 ? "" : "s"} · {c.parts.join(", ")}</p>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </StudioShell>
  );
}
