/**
 * /s/[id] — a shared Sandbox design, read-only. Public: anyone with the link
 * can read it; "Open in my Sandbox" copies it into their own editors. A shared circuit
 * shows its Verilog and opens in the circuit editor. Under-18s appear as "Student xxxx".
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import ForkButton from "@/components/ForkButton";
import SiteHeader from "@/components/SiteHeader";
import OpenSharedCircuit from "@/components/studio/OpenSharedCircuit";
import { PRIVACY_SELECT, publicName } from "@/lib/privacy";
import { generateVerilog } from "@/lib/studio/circuit";
import { parseCircuit } from "@/lib/studio/circuit-json";

export const dynamic = "force-dynamic";

async function getShared(id: string) {
  return prisma.sharedDesign.findUnique({
    where:  { id },
    select: { title: true, designCode: true, testbenchCode: true, files: true, kind: true, createdAt: true, owner: { select: { id: true, username: true, ...PRIVACY_SELECT } } },
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
  const byline = `by ${publicName(s.owner)} · ${s.createdAt.toISOString().slice(0, 10)}`;

  if (s.kind === "circuit") {
    const circuit = parseCircuit(s.designCode);
    let verilog = "";
    try { if (typeof circuit !== "string") verilog = generateVerilog(circuit); } catch { /* still openable: the editor reports what's wrong */ }
    return (
      <div className="min-h-screen bg-void text-bright">
        <SiteHeader />
        <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-[0.18em] text-phosphor">Shared circuit</div>
              <h1 className="font-serif text-3xl break-words">{s.title}</h1>
              <p className="text-[12px] text-dim mt-1">{byline}{typeof circuit === "string" ? "" : ` · ${circuit.parts.length} parts`}</p>
            </div>
            {typeof circuit !== "string" && <OpenSharedCircuit json={s.designCode} />}
          </div>
          {typeof circuit === "string" ? <p className="text-[13px] text-danger">{circuit}</p> : <Code name={`${circuit.module}.v`} code={verilog} />}
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-void text-bright">
      <SiteHeader />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.18em] text-phosphor">Shared design</div>
            <h1 className="font-serif text-3xl break-words">{s.title}</h1>
            <p className="text-[12px] text-dim mt-1">
              {byline}
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
