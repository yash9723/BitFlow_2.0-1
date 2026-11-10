/**
 * POST /api/pair/auth { projectId, invite? } — access to a project's pair room on BitFlow's sync server
 * (lib/pair-server.ts, api/routes/pair.py), asked for by hooks/usePair.ts: { server, room, token, name, color }.
 * Given only to a signed-in account allowed to share (canShareWithClass), while the project has a live session,
 * and only to its owner or the holder of its link. Errors come back as { error, reason } with the reason to show.
 */
import crypto from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-utils";
import { canShareWithClass, publicName } from "@/lib/privacy";
import { audit } from "@/lib/privacy-server";
import { rateLimit } from "@/lib/rate-limit";
import { colorFor, parseInvite } from "@/lib/pair";
import { hashInvite, pairEnabled, roomAccess } from "@/lib/pair-server";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const refuse = (reason: string, status: number) => NextResponse.json({ error: "forbidden", reason }, { status });
const sameHash = (a: string, b: string) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

export async function POST(req: Request) {
  if (!pairEnabled()) return refuse("Pair mode isn't available on this site yet.", 503);
  const me = await getSessionUser();
  if (!me) return refuse("Sign in to pair.", 401);
  if (!(await rateLimit(req, { limit: 30, windowMs: 60_000, prefix: "pair-auth", key: `user:${me.id}` })).success) return refuse("Too many tries; wait a minute.", 429);
  if (!canShareWithClass(me)) return refuse("A parent or guardian needs to approve your account first.", 403);

  const body = await req.json().catch(() => ({}));
  const projectId = typeof body?.projectId === "string" && UUID.test(body.projectId) ? body.projectId : null;
  if (!projectId) return refuse("That isn't a project.", 400);
  const project = await prisma.project.findUnique({
    where: { id: projectId }, select: { ownerId: true, pairInvite: { select: { tokenHash: true, expiresAt: true } } },
  });
  const session = project?.pairInvite;
  if (!project || !session || session.expiresAt < new Date()) return refuse("This pair session has ended.", 403);

  const isOwner = project.ownerId === me.id;
  if (!isOwner) {
    const invite = parseInvite(body?.invite);
    if (!invite || invite.projectId !== projectId || !sameHash(hashInvite(invite.token), session.tokenHash)) {
      return refuse("This pair link isn't valid any more. Ask for a new one.", 403);
    }
    await audit(me.id, "pair.join", projectId);
  }
  return NextResponse.json({
    ...roomAccess(projectId, session.tokenHash, session.expiresAt),
    name: publicName(me, null), color: colorFor(me.id), owner: isOwner,
  });
}
