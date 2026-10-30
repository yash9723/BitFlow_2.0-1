/**
 * lib/daily.ts — Daily challenge: one problem per UTC day, same for everyone,
 * with a one-time XP bonus for solving it that day. Server-side only.
 */

import crypto from "crypto";
import { prisma } from "@/lib/prisma";

export const DAILY_BONUS_XP = 50;

/** Current UTC date as YYYY-MM-DD. */
export function todayKey(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Deterministic pick: hash of the date indexes into the problems sorted by slug.
 * ponytail: adding problems reshuffles future picks (and can change today's);
 * persist picks in a table if the schedule must be fixed in advance.
 */
export async function getDailyQuestion(day: string = todayKey()) {
  const questions = await prisma.question.findMany({
    where:   { archived: false },
    orderBy: { slug: "asc" },
    select: {
      id: true, slug: true, title: true, difficulty: true,
      category: true, learningLevel: true, xpReward: true,
    },
  });
  if (questions.length === 0) return null;
  const n = crypto.createHash("sha256").update(day).digest().readUInt32BE(0);
  return questions[n % questions.length];
}

/** The UTC day before `day` (YYYY-MM-DD). */
export function previousDay(day: string): string {
  return todayKey(new Date(Date.parse(`${day}T00:00:00Z`) - 86_400_000));
}

/** Streak to show on `day`: it lapses once a whole day passes without a claim. */
export function currentStreak(xp: { lastDailyBonus: string | null; dailyStreak: number } | null, day: string = todayKey()): number {
  if (!xp?.lastDailyBonus) return 0;
  return xp.lastDailyBonus === day || xp.lastDailyBonus === previousDay(day) ? xp.dailyStreak : 0;
}

/**
 * Award the daily bonus once per user per day and extend the streak (+1 if the
 * last claim was yesterday, else back to 1). The UPDATE only matches the
 * lastDailyBonus we read, so two concurrent accepted submissions can't both claim it.
 * Returns the XP awarded (0 if already claimed today).
 */
export async function claimDailyBonus(userId: string, day: string = todayKey()): Promise<number> {
  const xp = await prisma.userXp.findUnique({ where: { userId }, select: { lastDailyBonus: true, dailyStreak: true } });
  if (!xp || xp.lastDailyBonus === day) return 0;
  const { count } = await prisma.userXp.updateMany({
    where: { userId, lastDailyBonus: xp.lastDailyBonus },
    data:  {
      lastDailyBonus: day,
      dailyStreak:    xp.lastDailyBonus === previousDay(day) ? xp.dailyStreak + 1 : 1,
      totalXp:        { increment: DAILY_BONUS_XP },
    },
  });
  return count === 1 ? DAILY_BONUS_XP : 0;
}
