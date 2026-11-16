/** app/studio/challenges/[id]/page.tsx — one circuit challenge, in the circuit editor. Public; XP needs an account. */

import { notFound } from "next/navigation";
import StudioShell from "@/components/studio/StudioShell";
import { CircuitTool } from "@/components/studio/loaders";
import { getSessionUser } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { challengeById } from "@/lib/studio/circuit-challenges";
import { pageMeta } from "@/lib/site";

export const dynamic = "force-dynamic";

export function generateMetadata({ params }: { params: { id: string } }) {
  const c = challengeById(params.id);
  if (!c) notFound();   // in metadata so the status is a real 404 (app/loading.tsx streams otherwise)
  return pageMeta(`/studio/challenges/${c.id}`, `${c.title}: circuit challenge`, c.statement.length < 100 ? `${c.statement} Build it in your browser; BitFlow checks it by simulation.` : c.statement);
}

export default async function ChallengePage({ params }: { params: { id: string } }) {
  const c = challengeById(params.id);
  if (!c) notFound();
  const user = await getSessionUser();
  const row = user ? await prisma.lessonProgress.findUnique({ where: { userId_kind_slug: { userId: user.id, kind: "challenge", slug: c.id } }, select: { done: true } }) : null;
  return (
    <StudioShell title={c.title} path={`/studio/challenges/${c.id}`}>
      <CircuitTool challengeId={c.id} solved={!!row?.done} />
    </StudioShell>
  );
}
