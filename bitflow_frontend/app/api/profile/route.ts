import { NextResponse } from "next/server";
import { destroySession, getSessionUser, verifyPassword } from "@/lib/auth-utils";
import { rateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { profileStats } from "@/lib/profile";
import { reportError } from "@/lib/error-log";

export const dynamic = "force-dynamic";

// GET /api/profile — aggregated stats for the logged-in user's profile page (lib/profile.ts)
export async function GET() {
  try {
    const userId = (await getSessionUser())?.id;
    const data = userId ? await profileStats(userId) : null;
    return NextResponse.json(data ?? { user: null });
  } catch (err) {
    await reportError("Profile fetch error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// PATCH /api/profile { publicProfile: boolean } — opt in or out of the public page /u/<username>
export async function PATCH(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  if (typeof body?.publicProfile !== "boolean") {
    return NextResponse.json({ error: "publicProfile must be true or false." }, { status: 400 });
  }
  await prisma.user.update({ where: { id: user.id }, data: { publicProfile: body.publicProfile } });
  return NextResponse.json({ publicProfile: body.publicProfile });
}

// DELETE /api/profile { password, confirm: "delete" } — delete your account and everything in it
// (progress, submissions, projects, share links, certificates, comments, the classes you teach).
// Admin accounts can't delete themselves here, so the site can't lose its admin by accident.
export async function DELETE(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { success } = await rateLimit(request, { limit: 5, windowMs: 10 * 60_000, prefix: "delete-account", key: `user:${user.id}` });
  if (!success) return NextResponse.json({ error: "Too many attempts. Please wait a few minutes." }, { status: 429 });
  if (user.role === "ADMIN") return NextResponse.json({ error: "Admin accounts can't be deleted from the profile page." }, { status: 403 });

  const { password, confirm } = await request.json().catch(() => ({}));
  if (confirm !== "delete") return NextResponse.json({ error: 'Type "delete" to confirm.' }, { status: 400 });
  const row = await prisma.user.findUnique({ where: { id: user.id }, select: { password: true } });
  if (!row || typeof password !== "string" || !verifyPassword(password, row.password).ok) {
    return NextResponse.json({ error: "That password is wrong." }, { status: 400 });
  }
  try {
    // Comment reports have no relation to cascade through; everything else goes with the user.
    await prisma.$transaction([
      prisma.commentReport.deleteMany({ where: { userId: user.id } }),
      prisma.user.delete({ where: { id: user.id } }),
    ]);
  } catch (err) {
    await reportError("Account deletion failed:", err);
    return NextResponse.json({ error: "The account couldn't be deleted. Please try again." }, { status: 500 });
  }
  await destroySession();
  return NextResponse.json({ ok: true });
}
