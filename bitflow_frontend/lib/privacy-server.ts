/**
 * lib/privacy-server.ts — the database side of lib/privacy.ts: the parent consent link,
 * the audit trail (AuditLog; lib/error-log.ts prunes it after LOG_RETENTION_DAYS) and
 * account deletion.
 */
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { clientId } from "@/lib/rate-limit";
import { GUARDIAN_LINK_DAYS } from "@/lib/privacy";

const DAY_MS = 24 * 60 * 60 * 1000;
export const hashToken = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

/** Record what happened (never throws: the audit must not break the request). */
export async function audit(actorId: string | null, action: string, targetId?: string | null, detail?: string): Promise<void> {
  try {
    await prisma.auditLog.create({ data: { actorId, action, targetId: targetId ?? null, detail: detail?.slice(0, 500) ?? null } });
  } catch { /* database down: the request goes on */ }
}

/** A fresh parent link for a minor's account; the previous link stops working. */
export async function newGuardianLink(userId: string): Promise<string> {
  const token = crypto.randomBytes(24).toString("base64url");
  const granted = (await prisma.user.findUnique({ where: { id: userId }, select: { guardianStatus: true } }))?.guardianStatus === "granted";
  await prisma.user.update({
    where: { id: userId },
    // Once a parent has consented the link has no expiry: it is how they withdraw.
    data:  { guardianTokenHash: hashToken(token), guardianTokenExp: granted ? null : new Date(Date.now() + GUARDIAN_LINK_DAYS * DAY_MS) },
  });
  return token;
}

/** The account a parent link belongs to, or null when it is unknown or expired. */
export async function userByGuardianToken(token: unknown) {
  if (typeof token !== "string" || token.length < 20 || token.length > 100) return null;
  const user = await prisma.user.findUnique({
    where:  { guardianTokenHash: hashToken(token) },
    select: { id: true, username: true, birthYear: true, birthMonth: true, guardianStatus: true, guardianAllowAi: true, guardianTokenExp: true, createdAt: true },
  });
  if (!user || (user.guardianTokenExp && user.guardianTokenExp < new Date())) return null;
  return user;
}

/** A keyed hash of the caller's IP, kept as evidence of who gave consent (not used to track anyone). */
export function ipHash(request: Request): string | null {
  const id = clientId(request);
  if (id === "anonymous") return null;
  const key = process.env.BOT_CHECK_SECRET || process.env.JWT_SECRET || process.env.JWT_PRIVATE_KEY || "bitflow-dev";
  return crypto.createHmac("sha256", key).update(id).digest("hex").slice(0, 32);
}

/** Delete an account and everything linked to it; the audit keeps only the fact and the id. */
export async function deleteAccount(userId: string, actorId: string | null, why: string): Promise<void> {
  // Comment reports have no relation to cascade through; everything else goes with the user.
  await prisma.$transaction([
    prisma.commentReport.deleteMany({ where: { userId } }),
    prisma.user.delete({ where: { id: userId } }),
  ]);
  await audit(actorId, "account.deleted", userId, why);
}
