import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-utils";
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
