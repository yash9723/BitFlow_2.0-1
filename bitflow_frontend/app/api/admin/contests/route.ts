/**
 * Admin: contests.
 *
 * POST   /api/admin/contests { title, startsAt, endsAt, problemSlugs: string[] }
 *        — times are ISO strings; every slug must be an existing problem
 * DELETE /api/admin/contests?id=…
 * (Listing is the public GET /api/contests.)
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-utils";

export const dynamic = "force-dynamic";

const MAX_PROBLEMS = 26;              // labelled A–Z
const MAX_DAYS     = 31;

async function requireAdmin() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  return null;
}

export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const body = await request.json().catch(() => ({}));
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const startsAt = new Date(body?.startsAt);
  const endsAt = new Date(body?.endsAt);
  const slugs: unknown = body?.problemSlugs;

  if (!title || title.length > 100) return NextResponse.json({ error: "Title is required (max 100 characters)." }, { status: 400 });
  if (isNaN(startsAt.getTime()) || isNaN(endsAt.getTime())) return NextResponse.json({ error: "Start and end times are required." }, { status: 400 });
  if (endsAt <= startsAt) return NextResponse.json({ error: "The contest must end after it starts." }, { status: 400 });
  if (endsAt.getTime() - startsAt.getTime() > MAX_DAYS * 86_400_000) return NextResponse.json({ error: `A contest can last at most ${MAX_DAYS} days.` }, { status: 400 });
  if (!Array.isArray(slugs) || slugs.length === 0 || slugs.length > MAX_PROBLEMS || !slugs.every((s) => typeof s === "string")) {
    return NextResponse.json({ error: `Pick 1–${MAX_PROBLEMS} problems.` }, { status: 400 });
  }
  const unique = [...new Set(slugs as string[])];
  const found = await prisma.question.findMany({ where: { slug: { in: unique } }, select: { slug: true } });
  const missing = unique.filter((s) => !found.some((q) => q.slug === s));
  if (missing.length) return NextResponse.json({ error: `Unknown problems: ${missing.join(", ")}` }, { status: 400 });

  const contest = await prisma.contest.create({
    data: { title, startsAt, endsAt, problemSlugs: JSON.stringify(unique) },
  });
  return NextResponse.json({ contest }, { status: 201 });
}

export async function DELETE(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required." }, { status: 400 });
  const { count } = await prisma.contest.deleteMany({ where: { id } });
  return count ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Contest not found." }, { status: 404 });
}
