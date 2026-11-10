/**
 * lib/xp.ts — the XP log (XpEvent) behind the weekly leaderboard and daily quests. Server-side only.
 *
 * logXp:   record an award that the caller has already added to UserXp.totalXp (problems, lessons,
 *          the daily bonus each guard their own once-only award).
 * awardXp: log and add in one go, for awards whose only once-guard is the log itself (quests).
 */
import { prisma } from "@/lib/prisma";

const isDuplicate = (err: unknown) => (err as { code?: string })?.code === "P2002";

/** Log an award already added to totalXp. Never throws: a failed log mustn't fail the submission. */
export async function logXp(userId: string, amount: number, source: string): Promise<void> {
  if (amount <= 0) return;
  try {
    await prisma.xpEvent.create({ data: { userId, amount, source } });
  } catch (err) {
    if (!isDuplicate(err)) console.error("[xp] log failed:", err);
  }
}

/** Log and add `amount` once per (user, source); returns the XP awarded (0 if already awarded). */
export async function awardXp(userId: string, amount: number, source: string): Promise<number> {
  try {
    await prisma.xpEvent.create({ data: { userId, amount, source } });
  } catch (err) {
    if (isDuplicate(err)) return 0;
    throw err;
  }
  await prisma.userXp.upsert({
    where:  { userId },
    create: { userId, totalXp: amount, unlockedModules: JSON.stringify(["mod_logic_gates", "mod_arithmetic"]) },
    update: { totalXp: { increment: amount } },
  });
  return amount;
}

/** Monday 00:00 UTC of the week containing `d`. */
export function weekStart(d: Date = new Date()): Date {
  const day = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  return new Date(day.getTime() - ((day.getUTCDay() + 6) % 7) * 86_400_000);
}
