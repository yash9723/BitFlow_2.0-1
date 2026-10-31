/** lib/announcements-server.ts — announcements in the database (rules: lib/announcements.ts). */
import { prisma } from "@/lib/prisma";
import { sortAnnouncements } from "@/lib/announcements";

/** What students may see: not archived, and not dated in the future. */
const visible = (now: Date) => ({ archived: false, publishedAt: { lte: now } });

export async function publishedAnnouncements(now: Date = new Date()) {
  const rows = await prisma.announcement.findMany({
    where: visible(now), orderBy: { publishedAt: "desc" }, take: 100,
    select: { id: true, title: true, body: true, kind: true, version: true, pinned: true, publishedAt: true },
  });
  return sortAnnouncements(rows);
}

export async function seenAt(userId: string): Promise<Date | null> {
  const row = await prisma.user.findUnique({ where: { id: userId }, select: { announcementsSeenAt: true } });
  return row?.announcementsSeenAt ?? null;
}

/** The bell's count, and the newest unread pinned post for the dashboard strip. */
export async function unreadSummary(userId: string, now: Date = new Date()) {
  const seen = await seenAt(userId);
  const where = { ...visible(now), ...(seen ? { publishedAt: { lte: now, gt: seen } } : {}) };
  const [unread, pinned] = await Promise.all([
    prisma.announcement.count({ where }),
    prisma.announcement.findFirst({ where: { ...where, pinned: true }, orderBy: { publishedAt: "desc" }, select: { id: true, title: true } }),
  ]);
  return { unread, pinned };
}
