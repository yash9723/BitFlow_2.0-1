/**
 * lib/quests.ts — daily quests: three a day from QUESTS, the same for everyone (UTC day), with
 * progress counted from that day's XP log (lib/xp.ts). Claiming one awards its XP once, keyed
 * quest:<day>:<id> in the log. Pure except loadQuests / claimQuest.
 */
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { awardXp } from "@/lib/xp";
import { todayKey } from "@/lib/daily";

type Ev = { source: string; amount: number };
export type Quest = { id: string; title: string; xp: number; target: number; count: (evs: Ev[], day: string) => number };

const earned = (evs: Ev[], prefix: string) => evs.filter((e) => e.source.startsWith(prefix)).length;

export const QUESTS: Quest[] = [
  { id: "solve1",    title: "Solve a problem",                  xp: 20, target: 1,   count: (e) => earned(e, "problem:") },
  { id: "solve2",    title: "Solve 2 problems",                 xp: 40, target: 2,   count: (e) => earned(e, "problem:") },
  { id: "solve3",    title: "Solve 3 problems",                 xp: 60, target: 3,   count: (e) => earned(e, "problem:") },
  { id: "lesson",    title: "Finish a lesson or Academy topic", xp: 30, target: 1,   count: (e) => earned(e, "lesson:") - earned(e, "lesson:challenge:") },
  { id: "challenge", title: "Pass a Studio circuit challenge",  xp: 30, target: 1,   count: (e) => earned(e, "lesson:challenge:") },
  { id: "daily",     title: "Solve today's daily challenge",    xp: 25, target: 1,   count: (e, day) => earned(e, `daily:${day}`) },
  { id: "earn100",   title: "Earn 100 XP",                      xp: 40, target: 100, count: (e) => e.filter((x) => !x.source.startsWith("quest:")).reduce((n, x) => n + x.amount, 0) },
];

/** The day's three quests: a hash of the date shuffles QUESTS. At most one of the solve-N quests. */
export function questsFor(day: string): Quest[] {
  const rank = (q: Quest) => crypto.createHash("sha256").update(`${day}:${q.id}`).digest().readUInt32BE(0);
  const picked: Quest[] = [];
  for (const q of [...QUESTS].sort((a, b) => rank(a) - rank(b))) {
    if (q.id.startsWith("solve") && picked.some((p) => p.id.startsWith("solve"))) continue;
    picked.push(q);
    if (picked.length === 3) break;
  }
  return picked;
}

const dayRange = (day: string) => ({ gte: new Date(`${day}T00:00:00Z`), lt: new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000) });

/** Today's quests with the user's progress. */
export async function loadQuests(userId: string, day: string = todayKey()) {
  const evs = await prisma.xpEvent.findMany({ where: { userId, createdAt: dayRange(day) }, select: { source: true, amount: true } });
  return questsFor(day).map((q) => {
    const progress = Math.min(q.target, q.count(evs, day));
    return { id: q.id, title: q.title, xp: q.xp, target: q.target, progress, done: progress >= q.target, claimed: evs.some((e) => e.source === `quest:${day}:${q.id}`) };
  });
}

/** Claim a finished quest; returns the XP awarded, or null if it isn't today's or isn't finished. */
export async function claimQuest(userId: string, id: string, day: string = todayKey()): Promise<number | null> {
  const q = (await loadQuests(userId, day)).find((x) => x.id === id);
  if (!q?.done) return null;
  return awardXp(userId, q.xp, `quest:${day}:${id}`);
}
