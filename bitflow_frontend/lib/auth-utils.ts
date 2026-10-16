import crypto from "crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

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

/** Create a DB-backed session with a random token and set it as the cookie. */
export async function createSession(userId: string): Promise<void> {
  const token = crypto.randomBytes(32).toString("hex");
  await prisma.session.create({
    data: { userId, token, expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
  });
  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure:   process.env.HTTPS === "true",
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

export async function getSessionUser() {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where:  { token },
    select: {
      expiresAt: true,
      user: { select: { id: true, username: true, role: true, createdAt: true } },
    },
  });
  if (!session || session.expiresAt < new Date()) return null;
  return session.user;
}
