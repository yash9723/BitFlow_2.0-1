/**
 * Recovery code — the way back in after a forgotten password (accounts have no email).
 *
 * GET  /api/auth/recovery-code                     → { hasCode }
 * POST /api/auth/recovery-code { currentPassword } → { code }, shown once; replaces any earlier code.
 *      Needs the password so a borrowed signed-in browser can't set one up.
 * Only a scrypt hash is stored. Used at /reset-password (POST /api/auth/reset-password).
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, hashPassword, newRecoveryCode, normalizeRecoveryCode, verifyPassword } from "@/lib/auth-utils";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const row = await prisma.user.findUnique({ where: { id: user.id }, select: { recoveryCodeHash: true } });
  return NextResponse.json({ hasCode: !!row?.recoveryCodeHash });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const { success } = await rateLimit(request, { limit: 10, windowMs: 60_000, prefix: "recovery", key: `user:${user.id}` });
  if (!success) return NextResponse.json({ error: "Too many attempts. Please wait a moment." }, { status: 429 });

  const { currentPassword } = await request.json().catch(() => ({}));
  const row = await prisma.user.findUnique({ where: { id: user.id }, select: { password: true } });
  if (!row || typeof currentPassword !== "string" || !verifyPassword(currentPassword, row.password).ok) {
    return NextResponse.json({ error: "Your password is wrong." }, { status: 400 });
  }

  const code = newRecoveryCode();
  await prisma.user.update({ where: { id: user.id }, data: { recoveryCodeHash: hashPassword(normalizeRecoveryCode(code)) } });
  return NextResponse.json({ code });
}
