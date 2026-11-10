/**
 * lib/pair-server.ts — the server side of pair mode (lib/pair.ts): invite tokens, the sync server's address and
 * room tokens, and ending a project's rooms when its session ends. The text syncs through BitFlow's own backend
 * (api/routes/pair.py), which keeps a room only in memory while someone is in it.
 * Server only. Pair mode is off (and hidden) without a backend signing key.
 */
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { reportError } from "@/lib/error-log";
import { backendUrl } from "@/lib/backend";
import { generateBackendJwt, generatePairJwt, hasBackendKey } from "@/lib/jwt";

export const pairEnabled = () => hasBackendKey();

export const newInviteToken = () => crypto.randomBytes(24).toString("base64url");   // 32 characters
export const hashInvite = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

/** The backend that hosts the rooms: one host, so both people land in the same room.
 *  ponytail: a single sync host; shard rooms by project across BACKEND_URLS if one host isn't enough. */
const syncBase = () => (process.env.PAIR_SYNC_URL || backendUrl()).replace(/\/+$/, "");

/** One room per link: a new link or an ended session never reopens an old room (and its old token). */
export const roomFor = (projectId: string, tokenHash: string) => `${projectId}.${tokenHash.slice(0, 16)}`;

/** Where the browser connects, and its token for exactly that room. */
export function roomAccess(projectId: string, tokenHash: string, expiresAt: Date) {
  const room = roomFor(projectId, tokenHash);
  return { server: syncBase().replace(/^http/, "ws") + "/pair", room, token: generatePairJwt(room, expiresAt) };
}

/** End the project's rooms: everyone in them is disconnected and their tokens stop working. */
export async function closeRoom(projectId: string): Promise<void> {
  if (!pairEnabled()) return;
  try {
    const res = await fetch(`${syncBase()}/pair/close`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${generateBackendJwt()}` },
      body: JSON.stringify({ project: projectId }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) await reportError("pair.closeRoom", `${res.status}`);
  } catch (err) { await reportError("pair.closeRoom", err); }
}

/** Ends sessions whose link has expired: their rooms go, then the invites (app/api/cron/alerts runs it). */
export async function sweepExpiredPairs(now = new Date()): Promise<number> {
  const old = await prisma.pairInvite.findMany({ where: { expiresAt: { lt: now } }, select: { projectId: true }, take: 50 });
  for (const { projectId } of old) await closeRoom(projectId);
  await prisma.pairInvite.deleteMany({ where: { projectId: { in: old.map((o) => o.projectId) } } });
  return old.length;
}
