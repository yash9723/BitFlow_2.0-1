/**
 * app/api/notice/route.ts — one site-wide notice shown to everyone until they dismiss it
 * (components/SiteNotice.tsx). Accounts have no email, so this is how users are told about
 * a personal-data breach within the DPDP 72-hour window (docs/breach-runbook.md).
 *
 * GET    — the active notice, or null
 * POST   { message } (admin) — publish; replaces any earlier notice
 * DELETE (admin)             — take the notice down
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { adminDenied, getSessionUser } from "@/lib/auth-utils";
import { audit } from "@/lib/privacy-server";

export const dynamic = "force-dynamic";

export async function GET() {
  const notice = await prisma.siteNotice.findFirst({ where: { active: true }, orderBy: { createdAt: "desc" }, select: { id: true, message: true, createdAt: true } })
    .catch(() => null);
  return NextResponse.json({ notice }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const denied = await adminDenied();
  if (denied) return denied;
  const message = String((await request.json().catch(() => ({})))?.message ?? "").trim();
  if (message.length < 5 || message.length > 2000) return NextResponse.json({ error: "Write a notice of 5 to 2000 characters." }, { status: 400 });
  const [, notice] = await prisma.$transaction([
    prisma.siteNotice.updateMany({ where: { active: true }, data: { active: false } }),
    prisma.siteNotice.create({ data: { message } }),
  ]);
  await audit((await getSessionUser())?.id ?? null, "admin.notice.published", notice.id, message.slice(0, 200));
  return NextResponse.json({ notice });
}

export async function DELETE() {
  const denied = await adminDenied();
  if (denied) return denied;
  await prisma.siteNotice.updateMany({ where: { active: true }, data: { active: false } });
  await audit((await getSessionUser())?.id ?? null, "admin.notice.removed");
  return NextResponse.json({ ok: true });
}
