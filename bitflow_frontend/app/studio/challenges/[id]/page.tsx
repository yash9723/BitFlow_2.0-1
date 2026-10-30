/** app/studio/challenges/[id]/page.tsx — one circuit challenge, in the circuit editor. Public; XP needs an account. */

import { notFound } from "next/navigation";
import StudioShell from "@/components/studio/StudioShell";
import { CircuitTool } from "@/components/studio/loaders";
import { getSessionUser } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { challengeById } from "@/lib/studio/circuit-challenges";

export const dynamic = "force-dynamic";

export function generateMetadata({ params }: { params: { id: string } }) {
  const c = challengeById(params.id);
  return c ? { title: `${c.title}: circuit challenge`, description: c.statement, alternates: { canonical: `/studio/challenges/${c.id}` } } : { title: "Challenge not found" };
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
