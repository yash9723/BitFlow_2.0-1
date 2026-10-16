import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/progress - Fetch user progress
export async function GET() {
  try {
    const userId = (await getSessionUser())?.id;

    if (!userId) {
      return NextResponse.json({
        progress: {
          totalXp: 0,
          problems: {},
          unlockedModules: ["mod_logic_gates", "mod_arithmetic"],
          lastUpdatedAt: Date.now(),
        },
      });
    }

    const userXp = await prisma.userXp.findUnique({
      where: { userId: userId },
    });

    const progressRecords = await prisma.userProgress.findMany({
      where: { userId: userId },
    });

    const problemsRecord: Record<string, any> = {};
    for (const record of progressRecords) {
      problemsRecord[record.problemId] = {
        problemId: record.problemId,
        solved: record.solved,
        firstSolvedAt: record.firstSolvedAt ? record.firstSolvedAt.getTime() : null,
        attempts: record.attempts,
        bestSubmissionId: record.id,
        hintsUnlocked: JSON.parse(record.hintsUnlocked || "[]"),
        xpEarned: record.xpEarned,
      };
    }

    const unlockedModules = userXp?.unlockedModules
      ? JSON.parse(userXp.unlockedModules)
      : ["mod_logic_gates", "mod_arithmetic"];

    return NextResponse.json({
      progress: {
        totalXp: userXp?.totalXp || 0,
        problems: problemsRecord,
        unlockedModules,
        lastUpdatedAt: Date.now(),
      },
    });
  } catch (err) {
    console.error("Fetch progress error:", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}

// POST /api/progress - Record solves, attempts, and hint unlocks
export async function POST(request: Request) {
  try {
    const userId = (await getSessionUser())?.id;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { actionType, problemId, hintTier } = await request.json();

    if (!problemId) {
      return NextResponse.json({ error: "ProblemId is required." }, { status: 400 });
    }

    // Load or create UserProgress record
    let userProgress = await prisma.userProgress.findUnique({
      where: {
        userId_problemId: {
          userId: userId,
          problemId,
        },
      },
    });

    if (!userProgress) {
      userProgress = await prisma.userProgress.create({
        data: {
          userId: userId,
          problemId,
          solved: false,
          attempts: 0,
          xpEarned: 0,
          hintsUnlocked: "[]",
        },
      });
    }

    // Load UserXp
    let userXp = await prisma.userXp.findUnique({
      where: { userId: userId },
    });

    if (!userXp) {
      userXp = await prisma.userXp.create({
        data: {
          userId: userId,
          totalXp: 0,
          unlockedModules: JSON.stringify(["mod_logic_gates", "mod_arithmetic"]),
        },
      });
    }

    // Solves, XP and module unlocks are recorded only by server-side grading
    // (POST /api/problems/[slug]/submit), never from client-reported results.
    if (actionType === "attempt") {
      userProgress = await prisma.userProgress.update({
        where: { id: userProgress.id },
        data: {
          attempts: userProgress.attempts + 1,
        },
      });
    } else if (actionType === "hint") {
      const currentHints = JSON.parse(userProgress.hintsUnlocked || "[]");
      if (hintTier && !currentHints.includes(hintTier)) {
        currentHints.push(hintTier);
        userProgress = await prisma.userProgress.update({
          where: { id: userProgress.id },
          data: {
            hintsUnlocked: JSON.stringify(currentHints),
          },
        });
      }
    }

    // Return the updated overall progress record
    const progressRecords = await prisma.userProgress.findMany({
      where: { userId: userId },
    });

    const problemsRecord: Record<string, any> = {};
    for (const record of progressRecords) {
      problemsRecord[record.problemId] = {
        problemId: record.problemId,
        solved: record.solved,
        firstSolvedAt: record.firstSolvedAt ? record.firstSolvedAt.getTime() : null,
        attempts: record.attempts,
        bestSubmissionId: record.id,
        hintsUnlocked: JSON.parse(record.hintsUnlocked || "[]"),
        xpEarned: record.xpEarned,
      };
    }

    return NextResponse.json({
      progress: {
        totalXp: userXp.totalXp,
        problems: problemsRecord,
        unlockedModules: JSON.parse(userXp.unlockedModules || "[]"),
        lastUpdatedAt: Date.now(),
      },
    });
  } catch (err) {
    console.error("Update progress error:", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
