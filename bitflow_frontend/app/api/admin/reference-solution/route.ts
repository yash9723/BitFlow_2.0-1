/**
 * Admin: reference solutions (one verified correct design per problem).
 *
 * GET    /api/admin/reference-solution            — every problem and whether it has one
 * GET    /api/admin/reference-solution?slug=…     — one problem's solution, to edit
 * POST   /api/admin/reference-solution { slug, code } — verify against the hidden
 *        tests (same rules as Submit) and store only if it passes
 * DELETE /api/admin/reference-solution?slug=…     — remove it
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-utils";
import { verifyReferenceSolution } from "@/lib/grading";

export const dynamic = "force-dynamic";

const MAX_SOURCE_CHARS = 512 * 1024;

async function requireAdmin() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  return null;
}

export async function GET(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const slug = new URL(request.url).searchParams.get("slug");
  if (slug) {
    const q = await prisma.question.findUnique({
      where:  { slug },
      select: { slug: true, title: true, starterCode: true, referenceSolution: true },
    });
    return q ? NextResponse.json({ problem: q }) : NextResponse.json({ error: "Problem not found." }, { status: 404 });
  }

  const rows = await prisma.question.findMany({
    orderBy: [{ learningLevel: "asc" }, { orderIndex: "asc" }],
    select:  { slug: true, title: true, learningLevel: true, referenceSolution: true },
  });
  return NextResponse.json({
    problems: rows.map(({ referenceSolution, ...r }) => ({ ...r, hasReference: !!referenceSolution })),
  });
}

export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const body = await request.json().catch(() => ({}));
  const slug = typeof body?.slug === "string" ? body.slug : "";
  const code = typeof body?.code === "string" ? body.code : "";
  if (!slug || !code.trim()) {
    return NextResponse.json({ error: "slug and code are required." }, { status: 400 });
  }
  if (code.length > MAX_SOURCE_CHARS) {
    return NextResponse.json({ error: "Source exceeds 512 KB." }, { status: 413 });
  }
  const question = await prisma.question.findUnique({ where: { slug } });
  if (!question) return NextResponse.json({ error: "Problem not found." }, { status: 404 });

  let result;
  try {
    result = await verifyReferenceSolution(question, code);
  } catch (err) {
    console.error("[admin/reference-solution] grading failed:", err);
    return NextResponse.json({ error: "Simulation backend unavailable." }, { status: 502 });
  }
  if (!result.ok) {
    return NextResponse.json({ error: `Not saved: ${result.error}` }, { status: 422 });
  }
  await prisma.question.update({ where: { slug }, data: { referenceSolution: code } });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const slug = new URL(request.url).searchParams.get("slug") ?? "";
  const { count } = await prisma.question.updateMany({ where: { slug }, data: { referenceSolution: null } });
  return count ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Problem not found." }, { status: 404 });
}
