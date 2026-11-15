// Metadata and access for one problem. The page itself is a client component that loads the problem and
// needs an account to write, run or submit code. A visitor who is not signed in sees the problem
// statement here instead (read-only, server-rendered so it can be found), with a prompt to sign in.
// What a guest sees is the same text the problem API already sends to a learner's browser minus hints,
// the worked solution and starter code; hidden tests and the reference solution are never selected.
import Link from "next/link";
import type { Metadata } from "next";
import AuthGate from "@/components/AuthGate";
import SiteHeader from "@/components/SiteHeader";
import { getSessionUser } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { GATED, SITE_URL, jsonLd, pageMeta } from "@/lib/site";

const listOf = (json: string): string[] => { try { const v = JSON.parse(json); return Array.isArray(v) ? v.map(String) : []; } catch { return []; } };
const examplesOf = (json: string): { input?: string; output?: string; explanation?: string }[] => { try { const v = JSON.parse(json); return Array.isArray(v) ? v : []; } catch { return []; } };

/** A guest may read a problem that is live and not a "find the bug" problem (those give away their parent's answer). */
const readable = (q: { archived: boolean; unlockAfter: string | null } | null) => !!q && !q.archived && !q.unlockAfter;

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const q = await prisma.question.findUnique({ where: { slug: params.slug }, select: { title: true, difficulty: true, archived: true, unlockAfter: true } });
  if (!q) return { ...GATED, title: "Problem not found" };
  const description = `${q.title}: a ${q.difficulty.toLowerCase()} Verilog problem on BitFlow. Write the module, simulate it and get graded against hidden tests.`;
  return readable(q) ? pageMeta(`/problems/${params.slug}`, q.title, description) : { ...GATED, title: q.title, description };
}

export default async function Layout({ children, params }: { children: React.ReactNode; params: { slug: string } }) {
  const me = await getSessionUser();
  if (me) return <AuthGate>{children}</AuthGate>;

  const q = await prisma.question.findUnique({
    where: { slug: params.slug },
    select: { title: true, difficulty: true, category: true, statement: true, constraints: true, examples: true, xpReward: true, archived: true, unlockAfter: true },
  });
  if (!q || !readable(q)) return <AuthGate>{children}</AuthGate>;   // sends the visitor to sign in

  const statement = q.statement.replace(/^#{1,3}\s*/gm, "").trim();
  const constraints = listOf(q.constraints);
  const examples = examplesOf(q.examples);
  const login = `/login?mode=register&next=${encodeURIComponent(`/problems/${params.slug}`)}`;
  const schema = {
    "@context": "https://schema.org", "@type": "LearningResource", name: q.title,
    description: statement.slice(0, 280), url: `${SITE_URL}/problems/${params.slug}`,
    learningResourceType: "Practice problem", educationalLevel: q.difficulty, about: q.category,
    isAccessibleForFree: true, inLanguage: "en",
  };

  return (
    <div className="min-h-screen bg-void text-bright">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(schema) }} />
      <SiteHeader />
      <main className="max-w-3xl mx-auto px-6 py-10 space-y-6">
        <nav aria-label="Breadcrumb" className="font-mono text-[11px] text-dim">
          <Link href="/problems" className="hover:text-bright">Problems</Link> <span aria-hidden>/</span> {q.category}
        </nav>
        <header className="space-y-2">
          <h1 className="font-serif text-3xl leading-tight">{q.title}</h1>
          <p className="font-mono text-[11px] uppercase tracking-widest text-ghost">{q.difficulty} · {q.category} · {q.xpReward} XP</p>
        </header>

        <div className="rounded-xl border border-phosphor/30 bg-phosphor/5 p-5 flex flex-wrap items-center justify-between gap-4">
          <p className="text-[13px] text-ghost">Sign in to write your solution, run it in the simulator and submit it for grading.</p>
          <Link href={login} className="px-5 py-2.5 rounded-lg bg-phosphor text-void text-[13px] font-bold hover:bg-phosphor-glow transition-colors">
            Sign in or create a free account →
          </Link>
        </div>

        <section className="space-y-3">
          <h2 className="font-display text-lg">Problem</h2>
          <div className="whitespace-pre-wrap text-[14px] text-ghost leading-relaxed">{statement}</div>
        </section>

        {constraints.length > 0 && (
          <section className="space-y-2">
            <h2 className="font-display text-lg">Constraints</h2>
            <ul className="list-disc pl-5 text-[14px] text-ghost space-y-1">{constraints.map((c, i) => <li key={i}>{c}</li>)}</ul>
          </section>
        )}

        {examples.length > 0 && (
          <section className="space-y-3">
            <h2 className="font-display text-lg">Examples</h2>
            {examples.map((e, i) => (
              <div key={i} className="rounded-lg border border-rim/60 bg-surface/40 p-4 text-[13px] space-y-1">
                {e.input != null && <p><span className="text-dim">Input: </span><code className="text-bright">{e.input}</code></p>}
                {e.output != null && <p><span className="text-dim">Output: </span><code className="text-bright">{e.output}</code></p>}
                {e.explanation && <p className="text-ghost">{e.explanation}</p>}
              </div>
            ))}
          </section>
        )}
      </main>
    </div>
  );
}
