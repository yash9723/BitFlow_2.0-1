/**
 * Admin: contact-form messages (app/api/contact).
 *
 * GET   /api/admin/messages              — the latest 200, newest first, and how many are open
 * PATCH /api/admin/messages {id, handled} — mark one handled (or open again)
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { adminDenied } from "@/lib/auth-utils";

export const dynamic = "force-dynamic";

export async function GET() {
  const denied = await adminDenied();
  if (denied) return denied;
  const [messages, open] = await Promise.all([
    prisma.contactMessage.findMany({ orderBy: { createdAt: "desc" }, take: 200 }),
    prisma.contactMessage.count({ where: { handled: false } }),
  ]);
  return NextResponse.json({ messages, open });
}

export async function PATCH(request: Request) {
  const denied = await adminDenied();
  if (denied) return denied;
  const body = await request.json().catch(() => null);
  if (typeof body?.id !== "string" || typeof body?.handled !== "boolean") {
    return NextResponse.json({ error: "Send {id, handled}." }, { status: 400 });
  }
  const updated = await prisma.contactMessage.updateMany({ where: { id: body.id }, data: { handled: body.handled } });
  if (!updated.count) return NextResponse.json({ error: "No such message." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
