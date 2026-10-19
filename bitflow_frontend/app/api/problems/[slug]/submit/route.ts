/**
 * POST /api/problems/[slug]/submit — Grade a solution on the server.
 *
 * Body: { designCode: string, testbenchCode?: string }
 * Runs the design against the hidden tests (lib/grading.ts), records the
 * submission and, if accepted, awards XP once (lib/record-submission.ts).
 * Returns { submission: SubmissionResult }; on a wrong answer it also carries
 * failingWaveform — the design's own signals on the first failing test — and
 * counterexample — the shortest input sequence where it differs from the reference.
 */

import crypto from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-utils";
import { rateLimit } from "@/lib/rate-limit";
import { counterexampleTable, designPolicyViolation, failingTestWaveform, findCounterexample, gradeDesign, gradingTestbenches } from "@/lib/grading";
import { recordSubmission } from "@/lib/record-submission";
import { metricsOnBackend } from "@/lib/backend";
import { claimDailyBonus, getDailyQuestion } from "@/lib/daily";

export const dynamic = "force-dynamic";

const MAX_SOURCE_CHARS = 512 * 1024;

export async function POST(
  request: Request,
  { params }: { params: { slug: string } }
) {
  const user = await getSessionUser();
  const { success } = rateLimit(request, {
    limit: 10, anonymousLimit: 60, windowMs: 60_000, prefix: "submit",
    key: user ? `user:${user.id}` : undefined,
  });
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

  const violation = designPolicyViolation(designCode, gradingTestbenches(question));
  if (violation) {
    return NextResponse.json({ error: violation }, { status: 422 });
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

  // Started now, awaited below: runs alongside the DB writes.
  const failingWaveform = failingTestWaveform(question, designCode, grade);
  const counterexample  = grade.accepted ? Promise.resolve(null) : findCounterexample(question, designCode);
  // Optimization scores for the leaderboard (accepted designs only; never affects the verdict)
  const metrics = grade.accepted
    ? metricsOnBackend(designCode)
        .then(({ status, data }) => (status === 200 && data?.ok ? { gates: data.gates as number, depth: data.depth as number, ffBits: data.ffBits as number } : null))
        .catch(() => null)
    : Promise.resolve(null);

  const xpReward = grade.accepted ? question.xpReward : 0;   // worth this much on a first solve

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
    xpEarned:        xpReward,
    accepted:    grade.accepted,
  }).catch((err) => {
    // Grading succeeded; don't hide the verdict because the history write failed.
    console.error("[submit] failed to record submission:", err);
    return null;
  });

  const scores = await metrics;
  if (saved && scores) {
    await prisma.submission.update({
      where: { id: saved.id },
      data:  { gateCount: scores.gates, logicDepth: scores.depth, ffBits: scores.ffBits },
    }).catch((err) => console.error("[submit] failed to store metrics:", err));
  }
  const cx = await counterexample;
  if (saved && cx) {
    await prisma.submission.update({ where: { id: saved.id }, data: { counterexample: counterexampleTable(cx) } })
      .catch((err) => console.error("[submit] failed to store counterexample:", err));
  }

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
      xpEarned:        (saved?.xpEarned ?? 0) + dailyBonusXp,   // what was actually awarded
      dailyBonusXp,
      errorMessage:    grade.errorMessage,
      failingWaveform: await failingWaveform,
      counterexample:  cx,
      metrics:         scores,
    },
  });
}
