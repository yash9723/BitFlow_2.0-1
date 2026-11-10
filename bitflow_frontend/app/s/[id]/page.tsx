/**
 * /s/[id] — a shared Sandbox design, read-only. Public: anyone with the link can read it; "Fork into my
 * projects" saves a copy as their own project, crediting this one. A shared circuit shows its Verilog and
 * opens in the circuit editor. The owner can rename it and list it on /explore; Verilog designs can be
 * embedded (/embed/[id]). Under-18s appear as "Student xxxx".
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-utils";
import ForkButton from "@/components/ForkButton";
import ShareControls from "@/components/ShareControls";
import SiteHeader from "@/components/SiteHeader";
import OpenSharedCircuit from "@/components/studio/OpenSharedCircuit";
import { PRIVACY_SELECT, publicName } from "@/lib/privacy";
import { fileNames, parseFiles, runsInBrowser } from "@/lib/share";
import { generateVerilog } from "@/lib/studio/circuit";
import { parseCircuit } from "@/lib/studio/circuit-json";

export const dynamic = "force-dynamic";

const OWNER = { select: { id: true, username: true, ...PRIVACY_SELECT } } as const;

async function getShared(id: string) {
  return prisma.sharedDesign.findUnique({
    where:  { id },
    select: { id: true, title: true, designCode: true, testbenchCode: true, files: true, kind: true, designLang: true, tbLang: true,
              public: true, forkOf: true, forks: true, createdAt: true, updatedAt: true, owner: OWNER },
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

const LANG: Record<string, string> = { verilog: "Verilog", vhdl: "VHDL", python: "cocotb (Python)" };

export default async function SharedDesignPage({ params }: { params: { id: string } }) {
  const [s, me] = await Promise.all([getShared(params.id), getSessionUser()]);
  if (!s) notFound();
  const files = parseFiles(s.files);
  const day = (d: Date) => d.toISOString().slice(0, 10);
  const edited = day(s.updatedAt) !== day(s.createdAt) ? ` · updated ${day(s.updatedAt)}` : "";
  const byline = `by ${publicName(s.owner, me?.id)} · ${day(s.createdAt)}${edited}`;
  const parent = s.forkOf
    ? await prisma.sharedDesign.findUnique({ where: { id: s.forkOf }, select: { id: true, title: true, owner: OWNER } })
    : null;
  const isOwner = me?.id === s.owner.id;

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
            <div className="flex flex-wrap items-center gap-3">
              <ShareControls id={s.id} title={s.title} isOwner={isOwner} isPublic={s.public} embeddable={false} />
              {typeof circuit !== "string" && <OpenSharedCircuit json={s.designCode} />}
            </div>
          </div>
          {typeof circuit === "string" ? <p className="text-[13px] text-danger">{circuit}</p> : <Code name={`${circuit.module}.v`} code={verilog} />}
        </main>
      </div>
    );
  }

  const names = fileNames(s.designLang, s.tbLang);
  return (
    <div className="min-h-screen bg-void text-bright">
      <SiteHeader />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.18em] text-phosphor">
              Shared design · {LANG[s.designLang] ?? s.designLang}{s.tbLang !== s.designLang ? ` + ${LANG[s.tbLang] ?? s.tbLang} testbench` : ""}
            </div>
            <h1 className="font-serif text-3xl break-words">{s.title}</h1>
            <p className="text-[12px] text-dim mt-1">
              {byline}
              {s.forks > 0 && ` · forked ${s.forks} ${s.forks === 1 ? "time" : "times"}`}
            </p>
            {parent && (
              <p className="text-[12px] text-dim mt-1">
                Forked from <Link href={`/s/${parent.id}`} className="text-phosphor hover:underline">{parent.title}</Link> by {publicName(parent.owner, me?.id)}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <ShareControls id={s.id} title={s.title} isOwner={isOwner} isPublic={s.public} embeddable={runsInBrowser(s)} />
            <ForkButton shareId={s.id} designCode={s.designCode} testbenchCode={s.testbenchCode} files={files}
                        designLanguage={s.designLang} testbenchLanguage={s.tbLang} />
          </div>
        </div>
        <div className="grid lg:grid-cols-2 gap-4">
          <Code name={names.design} code={s.designCode} />
          <Code name={names.testbench} code={s.testbenchCode} />
          {files.map((f) => <Code key={f.name} name={f.name} code={f.content} />)}
        </div>
        <p className="text-[12px] text-dim">
          More shared designs on <Link href="/explore" className="text-phosphor hover:underline">Explore</Link>.
        </p>
      </main>
    </div>
  );
}
