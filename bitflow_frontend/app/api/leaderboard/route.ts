/**
 * GET /api/leaderboard — top students by XP (admins excluded). ?period=week ranks by XP earned
 * since Monday 00:00 UTC instead (the XP log, lib/xp.ts).
 * Returns { entries: [{rank, username, totalXp, solved, isMe}], me } where `me`
 * is the signed-in user's own standing (null for guests).
 * Ties share a rank ("1, 2, 2, 4").
 */

import { NextRequest, NextResponse } from "next/server";
import { weekStart } from "@/lib/xp";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-utils";
import { reportError } from "@/lib/error-log";
import { PRIVACY_SELECT, isMinor, publicName } from "@/lib/privacy";

export const dynamic = "force-dynamic";

const LIMIT = 50;
const RANKED = { totalXp: { gt: 0 }, user: { role: { not: "ADMIN" } } };

const USER_SELECT = { id: true, username: true, publicProfile: true, ...PRIVACY_SELECT };
const WEEK_USERS = { user: { role: { not: "ADMIN" } } };

/** This week's top: XP log sums since Monday, highest first. */
async function weekTop(since: Date) {
  const sums = await prisma.xpEvent.groupBy({
    by: ["userId"], where: { createdAt: { gte: since }, ...WEEK_USERS }, _sum: { amount: true },
    orderBy: { _sum: { amount: "desc" } }, take: LIMIT,
  });
  const users = await prisma.user.findMany({ where: { id: { in: sums.map((s) => s.userId) } }, select: USER_SELECT });
  const byId = new Map(users.map((u) => [u.id, u]));
  return sums.filter((s) => byId.has(s.userId)).map((s) => ({ userId: s.userId, totalXp: s._sum.amount ?? 0, user: byId.get(s.userId)! }));
}

export async function GET(req: NextRequest) {
  try {
    const week = req.nextUrl.searchParams.get("period") === "week";
    const since = weekStart();
    const top = week ? await weekTop(since) : await prisma.userXp.findMany({
      where:   RANKED,
      orderBy: [{ totalXp: "desc" }, { updatedAt: "asc" }],
      take:    LIMIT,
      select:  { userId: true, totalXp: true, user: { select: USER_SELECT } },
    });

    const solvedCounts = await prisma.userProgress.groupBy({
      by:     ["userId"],
      where:  { solved: true, userId: { in: top.map((t) => t.userId) } },
      _count: { _all: true },
    });
    const solvedBy = new Map(solvedCounts.map((s) => [s.userId, s._count._all]));

    const me = await getSessionUser();

    let rank = 0;
    let prevXp = -1;
    const entries = top.map((t, i) => {
      if (t.totalXp !== prevXp) {
        rank = i + 1;
        prevXp = t.totalXp;
      }
      return {
        rank,
        username: publicName(t.user, me?.id),   // under-18s appear as "Student xxxx" (lib/privacy.ts)
        profile:  t.user.publicProfile && !isMinor(t.user),   // links to /u/<username> only when opted in
        totalXp:  t.totalXp,
        solved:   solvedBy.get(t.userId) ?? 0,
        isMe:     t.userId === me?.id,
      };
    });

    let mine = null;
    if (me) {
      const [xp, weekXp, solved] = await Promise.all([
        prisma.userXp.findUnique({ where: { userId: me.id }, select: { totalXp: true } }),
        prisma.xpEvent.aggregate({ where: { userId: me.id, createdAt: { gte: since } }, _sum: { amount: true } }),
        prisma.userProgress.count({ where: { userId: me.id, solved: true } }),
      ]);
      const totalXp = week ? weekXp._sum.amount ?? 0 : xp?.totalXp ?? 0;
      // ponytail: weekly rank counts every user's sum; fine at this size, keep a weekly total column if it grows
      const ahead = totalXp <= 0 ? null : week
        ? (await prisma.xpEvent.groupBy({ by: ["userId"], where: { createdAt: { gte: since }, ...WEEK_USERS }, _sum: { amount: true }, having: { amount: { _sum: { gt: totalXp } } } })).length
        : await prisma.userXp.count({ where: { ...RANKED, totalXp: { gt: totalXp } } });
      mine = {
        username: me.username,
        totalXp,
        solved,
        rank: ahead === null ? null : ahead + 1,   // null until you have XP
      };
    }

    return NextResponse.json({ entries, me: mine, period: week ? "week" : "all", since: week ? since.toISOString() : null });
  } catch (err) {
    await reportError("[leaderboard] error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
