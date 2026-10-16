/**
 * GET /api/daily — today's daily challenge (same problem for everyone, UTC day).
 * Solving it today via /api/problems/[slug]/submit awards DAILY_BONUS_XP once.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-utils";
import { DAILY_BONUS_XP, getDailyQuestion, todayKey } from "@/lib/daily";
import { problemHref } from "@/lib/problem-href";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const day = todayKey();
    const q = await getDailyQuestion(day);
    if (!q) return NextResponse.json({ date: day, problem: null });

    const user = await getSessionUser();
    let claimedToday = false;
    if (user) {
      const xp = await prisma.userXp.findUnique({
        where:  { userId: user.id },
        select: { lastDailyBonus: true },
      });
      claimedToday = xp?.lastDailyBonus === day;
    }

    return NextResponse.json({
      date:    day,
      bonusXp: DAILY_BONUS_XP,
      claimedToday,
      problem: {
        slug:          q.slug,
        title:         q.title,
        difficulty:    q.difficulty,
        category:      q.category,
        learningLevel: q.learningLevel,
        xpReward:      q.xpReward,
        href:          problemHref(q),
      },
    });
  } catch (err) {
    console.error("[daily] error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
