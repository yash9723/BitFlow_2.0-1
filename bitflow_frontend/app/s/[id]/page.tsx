/**
 * /s/[id] — a shared Sandbox design, read-only. Public: anyone with the link
 * can read it; "Open in my Sandbox" copies it into their own editors.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import ForkButton from "@/components/ForkButton";
import SiteHeader from "@/components/SiteHeader";

export const dynamic = "force-dynamic";

async function getShared(id: string) {
  return prisma.sharedDesign.findUnique({
    where:  { id },
    select: { title: true, designCode: true, testbenchCode: true, files: true, createdAt: true, owner: { select: { username: true } } },
  });
}

export async function generateMetadata({ params }: { params: { id: string } }) {
  const s = await getShared(params.id);
  return { title: s ? s.title : "Design not found" };   // the root layout adds " · BitFlow"
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

/** Extra design files of a multi-file project, if any. */
function parseFiles(json: string | null): { name: string; content: string }[] {
  try {
    const v = JSON.parse(json || "[]");
    return Array.isArray(v) ? v.filter((f) => typeof f?.name === "string" && typeof f?.content === "string") : [];
  } catch {
    return [];
  }
}

export default async function SharedDesignPage({ params }: { params: { id: string } }) {
  const s = await getShared(params.id);
  if (!s) notFound();
  const files = parseFiles(s.files);

  return (
    <div className="min-h-screen bg-void text-bright">
      <SiteHeader />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.18em] text-phosphor">Shared design</div>
            <h1 className="font-serif text-3xl break-words">{s.title}</h1>
            <p className="text-[12px] text-dim mt-1">
              by {s.owner.username} · {s.createdAt.toISOString().slice(0, 10)}
            </p>
          </div>
          <ForkButton designCode={s.designCode} testbenchCode={s.testbenchCode} files={files} />
        </div>
        <div className="grid lg:grid-cols-2 gap-4">
          <Code name="design.v" code={s.designCode} />
          <Code name="tb.v" code={s.testbenchCode} />
          {files.map((f) => <Code key={f.name} name={f.name} code={f.content} />)}
        </div>
      </main>
    </div>
  );
}
