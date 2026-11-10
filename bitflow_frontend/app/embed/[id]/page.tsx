/**
 * /embed/[id] — a shared design as a small read-only player for other sites' <iframe>s (lib/share.ts
 * embedSnippet). No site chrome (components/SiteChrome.tsx) and no sign-in; this path alone may be framed
 * by any origin (next.config.js). Verilog designs run in the viewer's browser.
 */

import { prisma } from "@/lib/prisma";
import EmbedPlayer from "@/components/EmbedPlayer";
import { PRIVACY_SELECT, publicName } from "@/lib/privacy";
import { fileNames, parseFiles, runsInBrowser } from "@/lib/share";

export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: { id: string } }) {
  const s = await prisma.sharedDesign.findUnique({ where: { id: params.id }, select: { title: true } });
  return { title: s?.title ?? "Design not found", robots: { index: false } };   // the root layout adds " · BitFlow"
}

export default async function EmbedPage({ params }: { params: { id: string } }) {
  const s = await prisma.sharedDesign.findUnique({
    where:  { id: params.id },
    select: { id: true, title: true, designCode: true, testbenchCode: true, files: true, kind: true, designLang: true, tbLang: true,
              owner: { select: { id: true, username: true, ...PRIVACY_SELECT } } },
  });
  if (!s || s.kind !== "sandbox") {
    return <div className="h-screen grid place-items-center bg-void text-dim font-mono text-[12px]">This design isn&apos;t available.</div>;
  }
  return (
    <EmbedPlayer id={s.id} title={s.title} author={publicName(s.owner)} names={fileNames(s.designLang, s.tbLang)}
                 designCode={s.designCode} testbenchCode={s.testbenchCode} files={parseFiles(s.files)} runnable={runsInBrowser(s)} />
  );
}
