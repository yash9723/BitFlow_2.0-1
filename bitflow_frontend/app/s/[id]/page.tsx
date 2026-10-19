/**
 * /s/[id] — a shared Sandbox design, read-only. Public: anyone with the link
 * can read it; "Open in my Sandbox" copies it into their own editors.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import ForkButton from "@/components/ForkButton";

export const dynamic = "force-dynamic";

async function getShared(id: string) {
  return prisma.sharedDesign.findUnique({
    where:  { id },
    select: { title: true, designCode: true, testbenchCode: true, createdAt: true, owner: { select: { username: true } } },
  });
}

export async function generateMetadata({ params }: { params: { id: string } }) {
  const s = await getShared(params.id);
  return { title: s ? `${s.title} · BitFlow` : "Design not found · BitFlow" };
}

function Code({ name, code }: { name: string; code: string }) {
  return (
    <section className="min-w-0">
      <div className="text-[11px] font-mono text-ghost mb-1">{name}</div>
      <pre className="overflow-auto max-h-[60vh] rounded-lg border border-rim bg-shaft p-3 text-[12px] leading-relaxed text-pale font-mono">
        {code || "// (empty)"}
      </pre>
    </section>
  );
}

export default async function SharedDesignPage({ params }: { params: { id: string } }) {
  const s = await getShared(params.id);
  if (!s) notFound();

  return (
    <div className="min-h-screen bg-void text-bright">
      <header className="sticky top-0 z-10 h-14 flex items-center justify-between px-4 sm:px-6 border-b border-rim/50 bg-void/80 backdrop-blur-md">
        <Link href="/" className="font-display font-bold text-lg hover:text-phosphor transition-colors">BitFlow</Link>
        <Link href="/sandbox" className="text-[12px] text-ghost hover:text-bright transition-colors">Sandbox IDE</Link>
      </header>
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.18em] text-phosphor">Shared design</div>
            <h1 className="font-serif text-3xl break-words">{s.title}</h1>
            <p className="text-[12px] text-dim mt-1">
              by {s.owner.username} · {s.createdAt.toISOString().slice(0, 10)}
            </p>
          </div>
          <ForkButton designCode={s.designCode} testbenchCode={s.testbenchCode} />
        </div>
        <div className="grid lg:grid-cols-2 gap-4">
          <Code name="design.v" code={s.designCode} />
          <Code name="tb.v" code={s.testbenchCode} />
        </div>
      </main>
    </div>
  );
}
