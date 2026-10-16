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

/**
 * Award the daily bonus once per user per day. A single conditional UPDATE,
 * so two concurrent accepted submissions can't both claim it.
 * Returns the XP awarded (0 if already claimed today).
 */
export async function claimDailyBonus(userId: string, day: string = todayKey()): Promise<number> {
  const { count } = await prisma.userXp.updateMany({
    where: { userId, OR: [{ lastDailyBonus: null }, { lastDailyBonus: { not: day } }] },
    data:  { lastDailyBonus: day, totalXp: { increment: DAILY_BONUS_XP } },
  });
  return count === 1 ? DAILY_BONUS_XP : 0;
}
