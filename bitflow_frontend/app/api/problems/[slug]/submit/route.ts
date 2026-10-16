/**
 * POST /api/problems/[slug]/submit — Grade a solution on the server.
 *
 * Body: { designCode: string, testbenchCode?: string }
 * Runs the design against the hidden tests (lib/grading.ts), records the
 * submission and, if accepted, awards XP once (lib/record-submission.ts).
 * Returns { submission: SubmissionResult }.
 */

import crypto from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-utils";
import { rateLimit } from "@/lib/rate-limit";
import { gradeDesign } from "@/lib/grading";
import { recordSubmission } from "@/lib/record-submission";
import { claimDailyBonus, getDailyQuestion } from "@/lib/daily";

export const dynamic = "force-dynamic";

const MAX_SOURCE_CHARS = 512 * 1024;

export async function POST(
  request: Request,
  { params }: { params: { slug: string } }
) {
  const { success } = rateLimit(request, { limit: 10, windowMs: 60_000, prefix: "submit" });
  if (!success) {
    return NextResponse.json(
      { error: "Too many submissions. Please wait a moment and try again." },
      { status: 429 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const designCode    = body?.designCode;
  const testbenchCode = typeof body?.testbenchCode === "string" ? body.testbenchCode : "";
  if (typeof designCode !== "string" || !designCode.trim()) {
    return NextResponse.json({ error: "designCode is required." }, { status: 400 });
  }
  if (designCode.length > MAX_SOURCE_CHARS || testbenchCode.length > MAX_SOURCE_CHARS) {
    return NextResponse.json({ error: "Source exceeds 512 KB." }, { status: 413 });
  }

  const question = await prisma.question.findUnique({ where: { slug: params.slug } });
  if (!question) {
    return NextResponse.json({ error: `Problem not found: ${params.slug}` }, { status: 404 });
  }

  let grade;
  try {
    grade = await gradeDesign(question, designCode);
  } catch (err) {
    console.error("[submit] grading failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Simulation backend unavailable" },
      { status: 502 }
    );
  }

  const user     = await getSessionUser();
  const xpEarned = grade.accepted ? question.xpReward : 0;

  const saved = await recordSubmission({
    userId:          user?.id ?? null,
    question,
    designCode,
    testbenchCode,
    submissionType:  "SUBMIT",
    simStatus:       grade.accepted ? "SUCCESS" : "RUNTIME_ERROR",
    simStdout:       grade.stdout,
    simStderr:       grade.stderr,
    simExitCode:     grade.exitCode,
    durationMs:      grade.totalDurationMs,
    testcaseResults: grade.verdicts.map((v) => ({
      id:          v.testcaseId,
      description: v.description,
      passed:      v.passed,
      expected:    v.expectedOutput,
      actual:      v.actualOutput || null,
    })),
    waveformVcd: null,
    xpEarned,
    accepted:    grade.accepted,
  }).catch((err) => {
    // Grading succeeded; don't hide the verdict because the history write failed.
    console.error("[submit] failed to record submission:", err);
    return null;
  });

  // Daily challenge: one-time bonus for solving today's problem today.
  let dailyBonusXp = 0;
  if (user && grade.accepted && saved) {
    const daily = await getDailyQuestion();
    if (daily?.id === question.id) dailyBonusXp = await claimDailyBonus(user.id);
  }

  return NextResponse.json({
    submission: {
      id:              saved?.id ?? crypto.randomUUID(),
      problemId:       question.id,
      timestamp:       Date.now(),
      verdicts:        grade.verdicts,
      passed:          grade.passed,
      total:           grade.total,
      accepted:        grade.accepted,
      totalDurationMs: grade.totalDurationMs,
      submittedCode:   designCode,
      xpEarned:        xpEarned + dailyBonusXp,
      dailyBonusXp,
      errorMessage:    grade.errorMessage,
    },
  });
}
