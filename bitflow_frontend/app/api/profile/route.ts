import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-utils";
import { problemHref } from "@/lib/problem-href";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function toDateKey(d: Date) {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

// GET /api/profile — aggregated stats for the logged-in user's profile page
export async function GET() {
  try {
    const userId = (await getSessionUser())?.id;

    if (!userId) {
      return NextResponse.json({ user: null });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, role: true, createdAt: true },
    });

    if (!user) {
      return NextResponse.json({ user: null });
    }

    const oneYearAgo = new Date();
    oneYearAgo.setDate(oneYearAgo.getDate() - 365);

    const [xpRecord, solvedProgress, questionCounts, activitySubs, recentAcceptedRaw, totalSubmissions] =
      await Promise.all([
        prisma.userXp.findUnique({ where: { userId } }),
        prisma.userProgress.findMany({
          where: { userId, solved: true },
          select: { question: { select: { difficulty: true } } },
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
      ]);

    // Solved / total counts per difficulty
    const solvedByDifficulty: Record<string, number> = {};
    for (const p of solvedProgress) {
      const diff = p.question.difficulty;
      solvedByDifficulty[diff] = (solvedByDifficulty[diff] || 0) + 1;
    }
    const totalByDifficulty: Record<string, number> = {};
    let totalProblems = 0;
    for (const q of questionCounts) {
      totalByDifficulty[q.difficulty] = q._count._all;
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
    const recentAC: Array<{ title: string; slug: string; href: string; difficulty: string; submittedAt: string }> = [];
    for (const s of recentAcceptedRaw) {
      if (seen.has(s.problemId)) continue;
      seen.add(s.problemId);
      recentAC.push({
        title: s.question.title,
        slug: s.question.slug,
        href: problemHref(s.question),
        difficulty: s.question.difficulty,
        submittedAt: s.createdAt.toISOString(),
      });
      if (recentAC.length >= 10) break;
    }

    return NextResponse.json({
      user,
      totalXp: xpRecord?.totalXp || 0,
      totalSolved: solvedProgress.length,
      totalProblems,
      solvedByDifficulty,
      totalByDifficulty,
      totalSubmissions,
      totalActiveDays: activeDays.length,
      maxStreak,
      activity,
      recentAC,
    });
  } catch (err) {
    console.error("Profile fetch error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}