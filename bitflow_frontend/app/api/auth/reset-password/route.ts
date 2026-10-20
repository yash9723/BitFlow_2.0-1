/**
 * POST /api/auth/reset-password { username, code, newPassword }
 *
 * Forgotten password: a valid recovery code sets a new password, is used up, and
 * ends every session of the account. Wrong username and wrong code get the same
 * answer (and the same scrypt work), so the form can't be used to find accounts.
 * Rate-limited per client and per username.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, normalizeRecoveryCode, passwordProblem, verifyPassword } from "@/lib/auth-utils";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const WINDOW_MS = 15 * 60_000;
const NO_MATCH = "That username and recovery code don't match.";
/** Verified against when the account has no code, so both cases cost the same. */
const DUMMY_HASH = hashPassword("no-recovery-code");

export async function POST(request: Request) {
  const { username, code, newPassword } = await request.json().catch(() => ({}));
  const name = typeof username === "string" ? username.trim() : "";

  // Without TRUST_PROXY every client shares one bucket, so keep that one roomy: the
  // per-username limit is what stops code guessing (80-bit codes, 5 tries / 15 min).
  const perClient  = await rateLimit(request, { limit: 20, anonymousLimit: 300, windowMs: WINDOW_MS, prefix: "reset-ip" });
  const perAccount = await rateLimit(request, { limit: 5, windowMs: WINDOW_MS, prefix: "reset-acct", key: `account:${name.toLowerCase()}` });
  if (!perClient.success || !perAccount.success) {
    return NextResponse.json({ error: "Too many attempts. Please wait 15 minutes and try again." }, { status: 429 });
  }

  if (!name || typeof code !== "string" || !code.trim()) {
    return NextResponse.json({ error: "Username and recovery code are required." }, { status: 400 });
  }
  const weak = passwordProblem(newPassword);
  if (weak) return NextResponse.json({ error: weak }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { username: name }, select: { id: true, recoveryCodeHash: true } });
  const matches = verifyPassword(normalizeRecoveryCode(code), user?.recoveryCodeHash ?? DUMMY_HASH).ok;
  if (!user?.recoveryCodeHash || !matches) {
    return NextResponse.json({ error: NO_MATCH }, { status: 400 });
  }

  // One-time: only succeeds if the code is still the one we just checked.
  const { count } = await prisma.user.updateMany({
    where: { id: user.id, recoveryCodeHash: user.recoveryCodeHash },
    data:  { password: hashPassword(newPassword), recoveryCodeHash: null },
  });
  if (count !== 1) return NextResponse.json({ error: NO_MATCH }, { status: 400 });
  await prisma.session.deleteMany({ where: { userId: user.id } });
  return NextResponse.json({ ok: true });
}
