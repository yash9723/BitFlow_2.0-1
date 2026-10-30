/**
 * /api/admin/editorial — a problem's editorial (Markdown, shown to solvers only).
 * GET ?slug=…  → { title, editorial }     PUT { slug, editorial } (empty clears it)
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { adminDenied } from "@/lib/auth-utils";
import { auditAdmin } from "@/lib/privacy-server";

export const dynamic = "force-dynamic";

const MAX_EDITORIAL_CHARS = 20_000;

export async function GET(request: Request) {
  const denied = await adminDenied();
  if (denied) return denied;
  const slug = new URL(request.url).searchParams.get("slug") ?? "";
  const q = await prisma.question.findUnique({ where: { slug }, select: { title: true, editorial: true } });
  if (!q) return NextResponse.json({ error: "Problem not found." }, { status: 404 });
  return NextResponse.json(q);
}

export async function PUT(request: Request) {
  const denied = await adminDenied();
  if (denied) return denied;
  const { slug, editorial } = (await request.json().catch(() => ({}))) ?? {};
  if (typeof slug !== "string" || typeof editorial !== "string") return NextResponse.json({ error: "slug and editorial are required." }, { status: 400 });
  if (editorial.length > MAX_EDITORIAL_CHARS) return NextResponse.json({ error: "Editorial is too long." }, { status: 413 });
  const q = await prisma.question.findUnique({ where: { slug }, select: { id: true } });
  if (!q) return NextResponse.json({ error: "Problem not found." }, { status: 404 });
  await prisma.question.update({ where: { slug }, data: { editorial: editorial.trim() || null } });
  await auditAdmin("admin.problem.editorial", slug);
  return NextResponse.json({ ok: true });
}
