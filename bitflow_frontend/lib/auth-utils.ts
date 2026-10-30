import crypto from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PRIVACY_SELECT } from "@/lib/privacy";

const SESSION_COOKIE = "bitflow_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 1 week

// Pre-2026-10 hashes: PBKDF2 with one shared salt. Still accepted at login,
// then transparently upgraded to scrypt (see verifyPassword().needsRehash).
const LEGACY_SALT = "bitflow_salt_2026_secure";

/** Hash a password with scrypt and a per-user random salt. Format: scrypt$<salt>$<hash> */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

export function verifyPassword(
  password: string,
  stored: string
): { ok: boolean; needsRehash: boolean } {
  if (stored.startsWith("scrypt$")) {
    const [, salt, hash] = stored.split("$");
    const candidate = crypto.scryptSync(password, salt, 64).toString("hex");
    return { ok: safeEqualHex(candidate, hash), needsRehash: false };
  }
  const legacy = crypto.pbkdf2Sync(password, LEGACY_SALT, 1000, 64, "sha512").toString("hex");
  const ok = safeEqualHex(legacy, stored);
  return { ok, needsRehash: ok };
}

// ── Passwords and recovery codes ───────────────────────────────────────────

export const MIN_PASSWORD_LENGTH = 8;

/** Why a new password isn't acceptable, or null. (Existing shorter passwords still log in.) */
export function passwordProblem(password: unknown): string | null {
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    return `Passwords need at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  return password.length > 200 ? "Passwords can be at most 200 characters." : null;
}

/** Why a new username isn't acceptable, or null. Mirrored by the sign-up form's pattern attribute. */
export function usernameProblem(username: string): string | null {
  return /^[A-Za-z0-9_.-]{3,24}$/.test(username)
    ? null
    : "Usernames are 3–24 characters: letters, numbers, dots, dashes and underscores.";
}

/** 32 symbols without 0/O/1/I, so codes are easy to copy by hand; 256 % 32 == 0 keeps it unbiased. */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** A one-time recovery code, e.g. "K7QM-2XRD-9PLA-WE4T" (80 random bits). */
export function newRecoveryCode(): string {
  const chars = Array.from(crypto.randomBytes(16), (b) => CODE_ALPHABET[b % 32]).join("");
  return chars.match(/.{4}/g)!.join("-");
}

/** Codes are compared case-insensitively and without dashes or spaces. */
export const normalizeRecoveryCode = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, "");

/** End a user's sessions — all of them, or all but the one making this request. */
export async function endSessions(userId: string, keepCurrent: boolean): Promise<void> {
  const token = keepCurrent ? cookies().get(SESSION_COOKIE)?.value : undefined;
  await prisma.session.deleteMany({ where: { userId, ...(token ? { token: { not: token } } : {}) } });
}

/** Create a DB-backed session with a random token and set it as the cookie. */
export async function createSession(userId: string): Promise<void> {
  const token = crypto.randomBytes(32).toString("hex");
  await prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });   // housekeeping
  await prisma.session.create({
    data: { userId, token, expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
  });
  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure:   process.env.HTTPS === "true" || (process.env.NODE_ENV === "production" && process.env.HTTPS !== "false"),
    sameSite: "lax",
    maxAge:   SESSION_TTL_MS / 1000,
    path:     "/",
  });
}

export async function destroySession(): Promise<void> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (token) await prisma.session.deleteMany({ where: { token } });
  cookies().set(SESSION_COOKIE, "", { httpOnly: true, maxAge: 0, path: "/" });
}

/** For admin API routes: a 401/403 response to return, or null when the caller is an admin. */
export async function adminDenied(): Promise<NextResponse | null> {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  return null;
}

export async function getSessionUser() {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where:  { token },
    select: {
      expiresAt: true,
      // The privacy fields drive safe mode for minors and the consent prompt (lib/privacy.ts).
      user: { select: { id: true, username: true, role: true, createdAt: true, bannedAt: true, ...PRIVACY_SELECT } },
    },
  });
  if (!session || session.expiresAt < new Date() || session.user.bannedAt) return null;
  const { bannedAt: _banned, ...user } = session.user;
  return user;
}
