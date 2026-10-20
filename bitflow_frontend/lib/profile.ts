/**
 * lib/profile.ts — a learner's profile stats: XP, solved counts, activity,
 * streaks, badges and certificate tracks. Used by GET /api/profile (your own
 * profile) and the public page /u/<username> (only for opted-in profiles).
 */

import { prisma } from "@/lib/prisma";
import { problemHref } from "@/lib/problem-href";
import { currentStreak } from "@/lib/daily";
import { parseSlugs } from "@/lib/contests";
import { trackProgress, type TrackProgress } from "@/lib/tracks";
import type { LearningLevel } from "@/lib/problem-types";

const BEGINNER: LearningLevel = "Verilog Beginner";

// Curriculum tiers (lib/problems) and arena labels (lib/arena) share one scale on the profile
const DIFF_BAND: Record<string, string> = { beginner: "Easy", intermediate: "Medium", advanced: "Hard" };
const band = (d: string) => DIFF_BAND[d] ?? d;

const toDateKey = (d: Date) => d.toISOString().slice(0, 10); // YYYY-MM-DD

export interface ProfileData {
  user: { id: string; username: string; role: string; createdAt: string };
  publicProfile: boolean;
  totalXp: number;
  totalSolved: number;
  totalProblems: number;
  solvedByDifficulty: Record<string, number>;
  totalByDifficulty: Record<string, number>;
  totalSubmissions: number;
  totalActiveDays: number;
  maxStreak: number;
  activity: Record<string, number>;
  recentAC: Array<{ title: string; slug: string; href: string; difficulty: string; submittedAt: string }>;
  badges: Array<{ id: string; label: string; description: string; earned: boolean }>;
  dailyStreak: number;
  tracks: TrackProgress[];
}

export async function profileStats(userId: string): Promise<ProfileData | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, role: true, createdAt: true, publicProfile: true },
  });
  if (!user) return null;

  const oneYearAgo = new Date();
  oneYearAgo.setDate(oneYearAgo.getDate() - 365);

  const [xpRecord, solvedProgress, questionCounts, activitySubs, recentAcceptedRaw, totalSubmissions, beginnerTotal, contests, tracks] =
    await Promise.all([
      prisma.userXp.findUnique({ where: { userId } }),
      prisma.userProgress.findMany({
        where: { userId, solved: true },
        select: { question: { select: { difficulty: true, learningLevel: true } } },
      }),
      prisma.question.groupBy({ by: ["difficulty"], _count: { _all: true } }),
      prisma.submission.findMany({
        where: { userId, createdAt: { gte: oneYearAgo } },
        select: { createdAt: true },
      }),
      prisma.submission.findMany({
        where: { userId, accepted: true },
        orderBy: { createdAt: "desc" },
        take: 30,
        select: {
          createdAt: true,
          problemId: true,
          question: { select: { title: true, slug: true, difficulty: true, category: true, learningLevel: true } },
        },
      }),
      prisma.submission.count({ where: { userId } }),
      prisma.question.count({ where: { learningLevel: BEGINNER } }),
      prisma.contest.findMany({ where: { startsAt: { lte: new Date() } }, select: { startsAt: true, endsAt: true, problemSlugs: true }, take: 200 }),
      trackProgress(userId),
    ]);

  // Took part in a contest: any SUBMIT to one of its problems inside its window
  const contested = contests.length > 0 && !!(await prisma.submission.findFirst({
    where: {
      userId, submissionType: "SUBMIT",
      OR: contests.map((c) => ({
        createdAt: { gte: c.startsAt, lt: c.endsAt },
        question:  { slug: { in: parseSlugs(c.problemSlugs) } },
      })),
    },
    select: { id: true },
  }));

  // Solved / total counts per difficulty
  const solvedByDifficulty: Record<string, number> = {};
  for (const p of solvedProgress) {
    const diff = band(p.question.difficulty);
    solvedByDifficulty[diff] = (solvedByDifficulty[diff] || 0) + 1;
  }
  const totalByDifficulty: Record<string, number> = {};
  let totalProblems = 0;
  for (const q of questionCounts) {
    const diff = band(q.difficulty);
    totalByDifficulty[diff] = (totalByDifficulty[diff] || 0) + q._count._all;
    totalProblems += q._count._all;
  }

  // Activity heatmap (past year) + streaks
  const activity: Record<string, number> = {};
  for (const s of activitySubs) {
    const key = toDateKey(s.createdAt);
    activity[key] = (activity[key] || 0) + 1;
  }
  const activeDays = Object.keys(activity).sort();
  let maxStreak = 0;
  let currentRun = 0;
  let prevTime: number | null = null;
  for (const key of activeDays) {
    const t = new Date(key + "T00:00:00Z").getTime();
    currentRun = prevTime !== null && t - prevTime === 86400000 ? currentRun + 1 : 1;
    maxStreak = Math.max(maxStreak, currentRun);
    prevTime = t;
  }

  // Recent accepted submissions, deduped to one entry per problem
  const seen = new Set<string>();
  const recentAC: ProfileData["recentAC"] = [];
  for (const s of recentAcceptedRaw) {
    if (seen.has(s.problemId)) continue;
    seen.add(s.problemId);
    recentAC.push({
      title: s.question.title,
      slug: s.question.slug,
      href: problemHref(s.question),
      difficulty: band(s.question.difficulty),
      submittedAt: s.createdAt.toISOString(),
    });
    if (recentAC.length >= 10) break;
  }

  const solved = solvedProgress.length;
  const beginnerSolved = solvedProgress.filter((p) => p.question.learningLevel === BEGINNER).length;
  const badges = [
    { id: "first-solve", label: "First Solve",  description: "Solve your first problem",           earned: solved >= 1 },
    { id: "solved-10",   label: "Ten Down",     description: "Solve 10 problems",                  earned: solved >= 10 },
    { id: "solved-25",   label: "Quarter Century", description: "Solve 25 problems",               earned: solved >= 25 },
    { id: "solved-50",   label: "Half Century", description: "Solve 50 problems",                  earned: solved >= 50 },
    { id: "streak-7",    label: "Week Streak",  description: "Be active 7 days in a row",          earned: maxStreak >= 7 },
    { id: "beginner",    label: "Foundations",  description: "Solve every Beginner problem",       earned: beginnerTotal > 0 && beginnerSolved >= beginnerTotal },
    { id: "contest",     label: "Contender",    description: "Submit a solution during a contest", earned: contested },
  ];

  const { publicProfile, ...publicUser } = user;
  return {
    user: { ...publicUser, createdAt: user.createdAt.toISOString() },
    publicProfile,
    badges,
    dailyStreak: currentStreak(xpRecord),
    totalXp: xpRecord?.totalXp || 0,
    totalSolved: solved,
    totalProblems,
    solvedByDifficulty,
    totalByDifficulty,
    totalSubmissions,
    totalActiveDays: activeDays.length,
    maxStreak,
    activity,
    recentAC,
    tracks,
  };
}
