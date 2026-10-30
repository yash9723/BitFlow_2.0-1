/**
 * Admin: contests.
 *
 * POST   /api/admin/contests { title, startsAt, endsAt, problemSlugs: string[] }
 *        — times are ISO strings; every slug must be an existing problem
 * GET    /api/admin/contests?id=… — one contest with its problem slugs, for editing
 * PATCH  /api/admin/contests { id, title, startsAt, endsAt, problemSlugs } — the problem list
 *        is locked once the contest has started, because standings depend on it
 * DELETE /api/admin/contests?id=…
 * (Listing is the public GET /api/contests.)
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { adminDenied } from "@/lib/auth-utils";
import { auditAdmin } from "@/lib/privacy-server";

export const dynamic = "force-dynamic";

const MAX_PROBLEMS = 26;              // labelled A–Z
const MAX_DAYS     = 31;


/** The contest fields in a request, or a 400 response saying what's wrong. */
async function contestFields(body: Record<string, unknown> | null) {
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const startsAt = new Date(String(body?.startsAt));
  const endsAt = new Date(String(body?.endsAt));
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

  return { data: { title, startsAt, endsAt, problemSlugs: JSON.stringify(unique) } };
}

export async function GET(request: Request) {
  const denied = await adminDenied();
  if (denied) return denied;
  const contest = await prisma.contest.findUnique({ where: { id: new URL(request.url).searchParams.get("id") ?? "" } });
  return contest ? NextResponse.json({ contest }) : NextResponse.json({ error: "Contest not found." }, { status: 404 });
}

export async function POST(request: Request) {
  const denied = await adminDenied();
  if (denied) return denied;
  const fields = await contestFields(await request.json().catch(() => null));
  if (fields instanceof NextResponse) return fields;
  const contest = await prisma.contest.create({ data: fields.data });
  await auditAdmin("admin.contest.create", contest.id, contest.title);
  return NextResponse.json({ contest }, { status: 201 });
}

export async function PATCH(request: Request) {
  const denied = await adminDenied();
  if (denied) return denied;
  const body = await request.json().catch(() => null);
  const current = await prisma.contest.findUnique({ where: { id: String(body?.id ?? "") } });
  if (!current) return NextResponse.json({ error: "Contest not found." }, { status: 404 });
  const fields = await contestFields(body);
  if (fields instanceof NextResponse) return fields;
  if (current.startsAt <= new Date() && fields.data.problemSlugs !== current.problemSlugs) {
    return NextResponse.json({ error: "This contest has started, so its problems can't change. Title and times still can." }, { status: 400 });
  }
  const contest = await prisma.contest.update({ where: { id: current.id }, data: fields.data });
  await auditAdmin("admin.contest.edit", contest.id, contest.title);
  return NextResponse.json({ contest });
}

export async function DELETE(request: Request) {
  const denied = await adminDenied();
  if (denied) return denied;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required." }, { status: 400 });
  const { count } = await prisma.contest.deleteMany({ where: { id } });
  if (count) await auditAdmin("admin.contest.delete", id);
  return count ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Contest not found." }, { status: 404 });
}
