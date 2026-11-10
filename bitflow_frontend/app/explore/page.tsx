/**
 * /explore — shared designs their owners chose to list (SharedDesign.public, set on /s/[id]).
 * Most forked first, or newest (?sort=new). Under-18s appear as "Student xxxx" (lib/privacy.ts).
 */

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-utils";
import SiteHeader from "@/components/SiteHeader";
import { PRIVACY_SELECT, publicName } from "@/lib/privacy";

export const dynamic = "force-dynamic";
export const metadata = { title: "Explore shared designs", description: "Verilog, VHDL and circuit designs shared by BitFlow learners: open, run and fork them." };

const PAGE = 60;
const LANG: Record<string, string> = { verilog: "Verilog", vhdl: "VHDL" };

export default async function ExplorePage({ searchParams }: { searchParams: { sort?: string } }) {
  const newest = searchParams.sort === "new";
  const [designs, me] = await Promise.all([
    prisma.sharedDesign.findMany({
      where: { public: true },
      orderBy: newest ? [{ updatedAt: "desc" }] : [{ forks: "desc" }, { updatedAt: "desc" }],
      take: PAGE,
      select: { id: true, title: true, kind: true, designLang: true, tbLang: true, forks: true, updatedAt: true, owner: { select: { id: true, username: true, ...PRIVACY_SELECT } } },
    }),
    getSessionUser(),
  ]);
  const tab = (on: boolean) => `px-3 py-1 rounded-md text-[11px] font-mono ${on ? "bg-phosphor/15 text-phosphor" : "text-dim hover:text-pale"}`;

  return (
    <div className="min-h-screen bg-void text-bright">
      <SiteHeader />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-phosphor">Community</div>
            <h1 className="font-serif text-3xl">Explore shared designs</h1>
            <p className="text-[12px] text-dim mt-1">Open one to read it, run it, or fork it into your own projects. Share yours from the Sandbox.</p>
          </div>
          <nav className="flex gap-1" aria-label="Sort">
            <Link href="/explore" className={tab(!newest)}>Most forked</Link>
            <Link href="/explore?sort=new" className={tab(newest)}>Newest</Link>
          </nav>
        </div>
        {designs.length === 0 ? (
          <p className="text-[13px] text-dim">Nothing listed yet. Share a design from the Sandbox, then tick &quot;Listed on Explore&quot; on its page.</p>
        ) : (
          <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {designs.map((d) => (
              <li key={d.id}>
                <Link href={`/s/${d.id}`} className="block h-full rounded-lg border border-rim bg-shaft p-4 hover:border-phosphor/50 transition-colors">
                  <div className="text-[10px] uppercase tracking-[0.14em] text-phosphor">
                    {d.kind === "circuit" ? "Circuit" : (LANG[d.designLang] ?? d.designLang) + (d.tbLang === "python" ? " · cocotb" : "")}
                  </div>
                  <div className="mt-1 font-semibold break-words">{d.title}</div>
                  <div className="mt-2 text-[11px] text-dim font-mono">
                    {publicName(d.owner, me?.id)} · {d.updatedAt.toISOString().slice(0, 10)}{d.forks > 0 ? ` · ${d.forks} ${d.forks === 1 ? "fork" : "forks"}` : ""}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
