/**
 * /api/announcements — the learner's unread announcements (lib/announcements.ts).
 * GET:  { unread, pinned } for the bell and the dashboard strip. Guests get 0, not an error:
 *       the bell asks on every page.
 * POST: marks everything read, when the learner opens /announcements.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-utils";
import { unreadSummary } from "@/lib/announcements-server";

export const dynamic = "force-dynamic";

export async function GET() {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ unread: 0, pinned: null });
  return NextResponse.json(await unreadSummary(me.id).catch(() => ({ unread: 0, pinned: null })));
}

export async function POST() {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  await prisma.user.update({ where: { id: me.id }, data: { announcementsSeenAt: new Date() } });
  return NextResponse.json({ unread: 0 });
}
