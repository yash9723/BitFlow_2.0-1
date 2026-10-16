/**
 * GET /api/leaderboard — top students by XP (admins excluded).
 * Returns { entries: [{rank, username, totalXp, solved, isMe}], me } where `me`
 * is the signed-in user's own standing (null for guests).
 * Ties share a rank ("1, 2, 2, 4").
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-utils";

export const dynamic = "force-dynamic";

const LIMIT = 50;
const RANKED = { totalXp: { gt: 0 }, user: { role: { not: "ADMIN" } } };

export async function GET() {
  try {
    const top = await prisma.userXp.findMany({
      where:   RANKED,
      orderBy: [{ totalXp: "desc" }, { updatedAt: "asc" }],
      take:    LIMIT,
      select:  { userId: true, totalXp: true, user: { select: { username: true } } },
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
        username: t.user.username,
        totalXp:  t.totalXp,
        solved:   solvedBy.get(t.userId) ?? 0,
        isMe:     t.userId === me?.id,
      };
    });

    let mine = null;
    if (me) {
      const [xp, solved] = await Promise.all([
        prisma.userXp.findUnique({ where: { userId: me.id }, select: { totalXp: true } }),
        prisma.userProgress.count({ where: { userId: me.id, solved: true } }),
      ]);
      const totalXp = xp?.totalXp ?? 0;
      const ahead = totalXp > 0
        ? await prisma.userXp.count({ where: { ...RANKED, totalXp: { gt: totalXp } } })
        : null;
      mine = {
        username: me.username,
        totalXp,
        solved,
        rank: ahead === null ? null : ahead + 1,   // null until you have XP
      };
    }

    return NextResponse.json({ entries, me: mine });
  } catch (err) {
    console.error("[leaderboard] error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
