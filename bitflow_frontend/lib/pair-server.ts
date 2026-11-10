/**
 * lib/pair-server.ts — the server side of pair mode (lib/pair.ts): the Liveblocks secret, invite tokens, and
 * deleting a project's room when its session ends so Liveblocks keeps no copy of the code.
 * Server only: imports the secret key's client. Pair mode is off (and hidden) until LIVEBLOCKS_SECRET_KEY is set.
 */
import crypto from "crypto";
import { Liveblocks } from "@liveblocks/node";
import { prisma } from "@/lib/prisma";
import { reportError } from "@/lib/error-log";
import { roomFor } from "@/lib/pair";

let client: Liveblocks | null = null;
/** The Liveblocks API client, or null while pair mode isn't set up. */
export function liveblocks(): Liveblocks | null {
  const secret = process.env.LIVEBLOCKS_SECRET_KEY;
  if (!secret?.startsWith("sk_")) return null;
  return (client ??= new Liveblocks({ secret }));
}

export const newInviteToken = () => crypto.randomBytes(24).toString("base64url");   // 32 characters
export const hashInvite = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

/** Delete the project's room (and the code in it). A room that was never made is fine. */
export async function closeRoom(projectId: string): Promise<void> {
  const lb = liveblocks();
  if (!lb) return;
  try { await lb.deleteRoom(roomFor(projectId)); }
  catch (err) { if ((err as { status?: number }).status !== 404) await reportError("pair.closeRoom", err); }
}

/** Ends sessions whose link has expired: their rooms go, then the invites (app/api/cron/alerts runs it). */
export async function sweepExpiredPairs(now = new Date()): Promise<number> {
  const old = await prisma.pairInvite.findMany({ where: { expiresAt: { lt: now } }, select: { projectId: true }, take: 50 });
  for (const { projectId } of old) await closeRoom(projectId);
  await prisma.pairInvite.deleteMany({ where: { projectId: { in: old.map((o) => o.projectId) } } });
  return old.length;
}
