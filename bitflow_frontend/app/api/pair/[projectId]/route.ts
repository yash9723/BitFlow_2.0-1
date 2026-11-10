/**
 * Pair mode for one project (lib/pair.ts). Owner only; anyone else gets 404.
 *
 * GET    { enabled, session: { expiresAt } | null }   enabled: pair mode is set up on this site
 * POST   start a session (or replace its link, which ends the old link's room): { code, expiresAt }. The code is
 *        shown once; only its hash is kept.
 * DELETE end the session: the link stops working and whoever is in the room is disconnected.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-utils";
import { canShareWithClass } from "@/lib/privacy";
import { audit } from "@/lib/privacy-server";
import { PAIR_INVITE_HOURS, inviteCode } from "@/lib/pair";
import { closeRoom, hashInvite, newInviteToken, pairEnabled } from "@/lib/pair-server";

export const dynamic = "force-dynamic";
type Params = { params: { projectId: string } };

async function owner(projectId: string) {
  const me = await getSessionUser();
  if (!me) return { error: NextResponse.json({ error: "Sign in first." }, { status: 401 }) };
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { ownerId: true, pairInvite: { select: { expiresAt: true } } } });
  if (!project || project.ownerId !== me.id) return { error: NextResponse.json({ error: "Project not found." }, { status: 404 }) };
  return { me, invite: project.pairInvite };
}

export async function GET(_req: Request, { params }: Params) {
  const o = await owner(params.projectId);
  if ("error" in o) return o.error;
  let session = o.invite;
  if (session && session.expiresAt < new Date()) {   // expired: tidy up now rather than wait for the sweep
    await prisma.pairInvite.deleteMany({ where: { projectId: params.projectId } });
    await closeRoom(params.projectId);
    session = null;
  }
  return NextResponse.json({ enabled: pairEnabled(), session });
}

export async function POST(_req: Request, { params }: Params) {
  const o = await owner(params.projectId);
  if ("error" in o) return o.error;
  if (!pairEnabled()) return NextResponse.json({ error: "Pair mode isn't available on this site yet." }, { status: 503 });
  if (!canShareWithClass(o.me)) return NextResponse.json({ error: "A parent or guardian needs to approve your account first." }, { status: 403 });
  const token = newInviteToken();
  const expiresAt = new Date(Date.now() + PAIR_INVITE_HOURS * 3600_000);
  const data = { tokenHash: hashInvite(token), expiresAt };
  if (o.invite) await closeRoom(params.projectId);   // a new link: the old one's room ends
  await prisma.pairInvite.upsert({ where: { projectId: params.projectId }, create: { projectId: params.projectId, ...data }, update: data });
  await audit(o.me.id, "pair.invite", params.projectId);
  return NextResponse.json({ code: inviteCode(params.projectId, token), expiresAt });
}

export async function DELETE(_req: Request, { params }: Params) {
  const o = await owner(params.projectId);
  if ("error" in o) return o.error;
  await prisma.pairInvite.deleteMany({ where: { projectId: params.projectId } });
  await closeRoom(params.projectId);
  await audit(o.me.id, "pair.end", params.projectId);
  return NextResponse.json({ ok: true });
}
