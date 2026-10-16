/**
 * lib/record-submission.ts — Persist a submission and, for accepted SUBMITs,
 * mark the problem solved and award XP exactly once. Server-side only.
 */

import { prisma } from "@/lib/prisma";

export interface RecordSubmissionInput {
  userId:          string | null;
  question:        { id: string; moduleId: string };
  designCode:      string;
  testbenchCode:   string;
  submissionType:  "RUN" | "SUBMIT";
  simStatus:       string;
  simStdout:       string | null;
  simStderr:       string | null;
  simExitCode:     number | null;
  durationMs:      number | null;
  testcaseResults: Array<{ id: string; description: string; passed: boolean; expected: string; actual: string | null }>;
  waveformVcd:     string | null;
  xpEarned:        number;
  accepted:        boolean;
}

export async function recordSubmission(input: RecordSubmissionInput) {
  const { userId, question } = input;

  const attemptCount = userId
    ? await prisma.submission.count({ where: { userId, problemId: question.id } })
    : 0;

  const submission = await prisma.submission.create({
    data: {
      userId:          userId ?? undefined,
      problemId:       question.id,
      designCode:      input.designCode,
      testbenchCode:   input.testbenchCode,
      submissionType:  input.submissionType,
      attemptNumber:   attemptCount + 1,
      simStatus:       input.simStatus,
      simStdout:       input.simStdout,
      simStderr:       input.simStderr,
      simExitCode:     input.simExitCode,
      durationMs:      input.durationMs == null ? null : Math.round(input.durationMs), // Int column
      testcaseResults: JSON.stringify(input.testcaseResults),
      numTestsPassed:  input.testcaseResults.filter((t) => t.passed).length,
      numTestsTotal:   input.testcaseResults.length,
      waveformVcd:     input.waveformVcd,
      xpEarned:        input.xpEarned,
      accepted:        input.accepted,
    },
    select: {
      id:             true,
      attemptNumber:  true,
      accepted:       true,
      numTestsPassed: true,
      numTestsTotal:  true,
      xpEarned:       true,
      createdAt:      true,
    },
  });

  if (userId && input.accepted && input.submissionType === "SUBMIT") {
    await markSolved(userId, question, input.xpEarned);
  }
  return submission;
}

/**
 * Mark solved and award XP on the FIRST accepted submission only.
 * The `solved: false` filter / unique-constraint makes this race-safe:
 * two concurrent accepted submits can't both award XP.
 */
async function markSolved(userId: string, question: { id: string; moduleId: string }, xp: number) {
  const now = new Date();
  let firstSolve = false;

  const claimed = await prisma.userProgress.updateMany({
    where: { userId, problemId: question.id, solved: false },
    data:  { solved: true, firstSolvedAt: now, xpEarned: { increment: xp }, attempts: { increment: 1 } },
  });

  if (claimed.count === 1) {
    firstSolve = true;
  } else {
    try {
      await prisma.userProgress.create({
        data: {
          userId, problemId: question.id, solved: true, attempts: 1,
          firstSolvedAt: now, xpEarned: xp, hintsUnlocked: "[]",
        },
      });
      firstSolve = true;
    } catch (err: any) {
      if (err?.code !== "P2002") throw err; // already exists → already solved
      await prisma.userProgress.update({
        where: { userId_problemId: { userId, problemId: question.id } },
        data:  { attempts: { increment: 1 } },
      });
    }
  }

  if (!firstSolve) return;

  const userXp = await prisma.userXp.upsert({
    where:  { userId },
    create: {
      userId,
      totalXp: xp,
      unlockedModules: JSON.stringify(["mod_logic_gates", "mod_arithmetic"]),
    },
    update: { totalXp: { increment: xp } },
  });

  const modules: string[] = JSON.parse(userXp.unlockedModules || "[]");
  if (question.moduleId && !modules.includes(question.moduleId)) {
    await prisma.userXp.update({
      where: { userId },
      data:  { unlockedModules: JSON.stringify([...modules, question.moduleId]) },
    });
  }
}
