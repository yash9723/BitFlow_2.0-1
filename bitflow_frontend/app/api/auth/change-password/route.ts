/**
 * POST /api/auth/change-password { currentPassword, newPassword }
 * Signed-in users only. Other sessions of the account are ended; this one stays.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { endSessions, getSessionUser, hashPassword, passwordProblem, verifyPassword } from "@/lib/auth-utils";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const { success } = await rateLimit(request, { limit: 10, windowMs: 60_000, prefix: "pwchange", key: `user:${user.id}` });
  if (!success) return NextResponse.json({ error: "Too many attempts. Please wait a moment." }, { status: 429 });

  const { currentPassword, newPassword } = await request.json().catch(() => ({}));
  const weak = passwordProblem(newPassword);
  if (weak) return NextResponse.json({ error: weak }, { status: 400 });

  const row = await prisma.user.findUnique({ where: { id: user.id }, select: { password: true } });
  if (!row || typeof currentPassword !== "string" || !verifyPassword(currentPassword, row.password).ok) {
    return NextResponse.json({ error: "Your current password is wrong." }, { status: 400 });
  }

  await prisma.user.update({ where: { id: user.id }, data: { password: hashPassword(newPassword) } });
  await endSessions(user.id, true);
  return NextResponse.json({ ok: true });
}
