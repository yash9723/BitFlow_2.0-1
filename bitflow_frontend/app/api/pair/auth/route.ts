/**
 * POST /api/pair/auth { room, invite? } — a Liveblocks token for a project's pair room (lib/pair.ts), asked for by
 * the browser's Liveblocks client (hooks/usePair.ts). Given only to a signed-in account allowed to share
 * (canShareWithClass), while the project has a live session, and only to its owner or the holder of its link.
 * Errors come back as { error, reason } so the client stops retrying and shows the reason.
 */
import crypto from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-utils";
import { canShareWithClass, publicName } from "@/lib/privacy";
import { audit } from "@/lib/privacy-server";
import { rateLimit } from "@/lib/rate-limit";
import { reportError } from "@/lib/error-log";
import { colorFor, parseInvite, projectOfRoom } from "@/lib/pair";
import { hashInvite, liveblocks } from "@/lib/pair-server";

export const dynamic = "force-dynamic";

const refuse = (reason: string, status: number) => NextResponse.json({ error: "forbidden", reason }, { status });
const sameHash = (a: string, b: string) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

export async function POST(req: Request) {
  const lb = liveblocks();
  if (!lb) return refuse("Pair mode isn't available on this site yet.", 503);
  const me = await getSessionUser();
  if (!me) return refuse("Sign in to pair.", 401);
  if (!(await rateLimit(req, { limit: 30, windowMs: 60_000, prefix: "pair-auth", key: `user:${me.id}` })).success) return refuse("Too many tries; wait a minute.", 429);
  if (!canShareWithClass(me)) return refuse("A parent or guardian needs to approve your account first.", 403);

  const body = await req.json().catch(() => ({}));
  const projectId = projectOfRoom(body?.room);
  if (!projectId) return refuse("That isn't a pair room.", 400);
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

  const lbSession = lb.prepareSession(me.id, { userInfo: { name: publicName(me, null), color: colorFor(me.id), owner: isOwner } });
  lbSession.allow(body.room, lbSession.FULL_ACCESS);
  const { status, body: token } = await lbSession.authorize();
  if (status !== 200) {   // a bad key or an outage: logged here, a plain reason for the browser
    await reportError("pair.authorize", `${status} ${token.slice(0, 300)}`);
    return refuse("Pairing isn't working right now. Try again later.", 502);
  }
  return new Response(token, { status, headers: { "Content-Type": "application/json" } });
}
