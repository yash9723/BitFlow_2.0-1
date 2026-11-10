/**
 * lib/daily.ts — Daily challenge: one problem per UTC day, same for everyone,
 * with a one-time XP bonus for solving it that day. Server-side only.
 */

import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { logXp } from "@/lib/xp";

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

export const MAX_FREEZES = 2;   // a 7-day run earns a streak freeze; you can hold this many

type StreakState = { lastDailyBonus: string | null; dailyStreak: number; streakFreezes?: number };

/** Whole UTC days from `from` to `to` (YYYY-MM-DD). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** Streak to show on `day`: it lapses once more days pass without a claim than there are freezes to cover them. */
export function currentStreak(xp: StreakState | null, day: string = todayKey()): number {
  if (!xp?.lastDailyBonus) return 0;
  const gap = daysBetween(xp.lastDailyBonus, day);
  return gap >= 0 && gap - 1 <= (xp.streakFreezes ?? 0) ? xp.dailyStreak : 0;
}

/**
 * Streak and freezes after claiming on `day`. Each missed day since the last claim uses a freeze;
 * more missed days than freezes starts the streak again at 1. Every 7th day in a row earns a freeze.
 */
export function nextStreak(xp: StreakState, day: string): { streak: number; freezes: number } {
  let freezes = xp.streakFreezes ?? 0;
  const missed = xp.lastDailyBonus ? daysBetween(xp.lastDailyBonus, day) - 1 : Infinity;
  let streak = 1;
  if (missed >= 0 && missed <= freezes) { streak = xp.dailyStreak + 1; freezes -= missed; }
  if (streak % 7 === 0) freezes = Math.min(MAX_FREEZES, freezes + 1);
  return { streak, freezes };
}

/**
 * Award the daily bonus once per user per day and extend the streak (nextStreak). The UPDATE only
 * matches the lastDailyBonus we read, so two concurrent accepted submissions can't both claim it.
 * Returns the XP awarded (0 if already claimed today).
 */
export async function claimDailyBonus(userId: string, day: string = todayKey()): Promise<number> {
  const xp = await prisma.userXp.findUnique({ where: { userId }, select: { lastDailyBonus: true, dailyStreak: true, streakFreezes: true } });
  if (!xp || xp.lastDailyBonus === day) return 0;
  const { streak, freezes } = nextStreak(xp, day);
  const { count } = await prisma.userXp.updateMany({
    where: { userId, lastDailyBonus: xp.lastDailyBonus },
    data:  { lastDailyBonus: day, dailyStreak: streak, streakFreezes: freezes, totalXp: { increment: DAILY_BONUS_XP } },
  });
  if (count !== 1) return 0;
  await logXp(userId, DAILY_BONUS_XP, `daily:${day}`);
  return DAILY_BONUS_XP;
}
