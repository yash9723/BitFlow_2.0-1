/**
 * app/interview/page.tsx — interview prep: the mock interview, then problems by topic.
 * Only list fields go to the browser, never statements, code or tests.
 */
import Link from "next/link";
import { getSessionUser } from "@/lib/auth-utils";
import { isInterviewProblem, tierOf, TOP_25, TOPICS, type InterviewProblem } from "@/lib/interview";
import { prisma } from "@/lib/prisma";
import { problemHref } from "@/lib/problem-href";
import { solvedSlugs } from "@/lib/unlock";
import MockPanel from "./MockPanel";

export const dynamic = "force-dynamic";

const tagsOf = (json: string) => { try { const t = JSON.parse(json); return Array.isArray(t) ? t.map(String) : []; } catch { return []; } };
const TIER_STYLE: Record<string, string> = { Easy: "text-phosphor", Medium: "text-info", Hard: "text-warn" };

type Row = InterviewProblem & { href: string };

function TopicList({ title, blurb, problems, solved, open }: { title: string; blurb: string; problems: Row[]; solved: Set<string>; open?: boolean }) {
  const done = problems.filter((p) => solved.has(p.slug)).length;
  return (
    <details open={open} className="group border border-rim rounded-xl bg-pit">
      <summary className="flex items-center gap-3 px-4 py-3 cursor-pointer list-none">
        <span className="text-dim text-[11px] transition-transform group-open:rotate-90" aria-hidden>▶</span>
        <span className="min-w-0">
          <span className="block text-[14px] text-bright">{title}</span>
          <span className="block text-[11px] text-ghost">{blurb}</span>
        </span>
        <span className="ml-auto shrink-0 font-mono text-[11px] text-dim">{done}/{problems.length}</span>
      </summary>
      <ul className="grid sm:grid-cols-2 gap-x-4 px-4 pb-3 border-t border-rim/50 pt-2">
        {problems.map((p) => {
          const tier = tierOf(p.difficulty) ?? p.difficulty;
          return (
            <li key={p.slug}>
              <Link href={p.href} className="flex items-center gap-2 py-1.5 text-[12.5px] text-pale hover:text-bright">
                <span className={`w-3 shrink-0 ${solved.has(p.slug) ? "text-phosphor" : "text-dim"}`} aria-label={solved.has(p.slug) ? "Solved" : "Not solved"}>
                  {solved.has(p.slug) ? "✓" : "·"}
                </span>
                <span className="truncate">{p.title}</span>
                <span className={`ml-auto shrink-0 text-[10px] ${TIER_STYLE[tier] ?? "text-dim"}`}>{tier}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </details>
  );
}

export default async function InterviewPage() {
  const [rows, user] = await Promise.all([
    prisma.question.findMany({
      where: { archived: false },
      orderBy: { orderIndex: "asc" },
      select: { slug: true, title: true, difficulty: true, category: true, tags: true, learningLevel: true, problemType: true, unlockAfter: true },
    }),
    getSessionUser(),
  ]);
  const solved = await solvedSlugs(user?.id);
  const pool: Row[] = rows.map((r) => ({ ...r, tags: tagsOf(r.tags), href: problemHref(r) })).filter(isInterviewProblem);
  const bySlug = new Map(pool.map((p) => [p.slug, p]));

  return (
    <div className="space-y-8">
      <div>
        <div className="text-[11px] tracking-[0.18em] text-phosphor uppercase mb-2">Interview prep</div>
        <h1 className="font-serif text-4xl">Practise like the real thing.</h1>
        <p className="text-ghost text-sm mt-2 max-w-2xl">
          Digital design problems by topic, graded against hidden tests. When you feel ready, run a timed mock.
        </p>
      </div>

      <MockPanel />

      <section className="space-y-2">
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-bright">Problems by topic</h2>
        <TopicList open title="Top 25" blurb="A starting set across every topic, chosen by BitFlow."
                   problems={TOP_25.flatMap((s) => bySlug.get(s) ?? [])} solved={solved} />
        {TOPICS.map((t) => (
          <TopicList key={t.id} title={t.title} blurb={t.blurb} problems={pool.filter(t.match)} solved={solved} />
        ))}
      </section>
    </div>
  );
}
