/**
 * POST /api/problems/[slug]/submit — Grade a solution on the server.
 *
 * Body: { designCode: string, testbenchCode?: string, language?: "vhdl", testbenchLanguage?: "python" }
 * Runs the design against the hidden tests (lib/grading.ts), records the
 * submission and, if accepted, awards XP once (lib/record-submission.ts).
 * A VHDL design is converted to Verilog (GHDL) first and graded by the same tests.
 * Testbench problems grade the student's testbench (Verilog or cocotb) against
 * mutants of the given DUT; formal problems grade a property harness the same way.
 * Returns { submission: SubmissionResult }; on a wrong answer it also carries
 * failingWaveform — the design's own signals on the first failing test — and
 * counterexample — the shortest input sequence where it differs from the reference.
 */

import crypto from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-utils";
import { lockedBehind } from "@/lib/unlock";
import { rateLimit } from "@/lib/rate-limit";
import {
  counterexampleTable, designPolicyViolation, measureFmax, timingTarget, failingTestWaveform, findCounterexample, formalPolicyViolation, gradeDesign, publicVerdicts,
  gradeFormal, gradeTestbench, gradingTestbenches, testbenchPolicyViolation,
} from "@/lib/grading";
import { recordSubmission } from "@/lib/record-submission";
import { designAsVerilog, metricsOnBackend } from "@/lib/backend";
import { claimDailyBonus, getDailyQuestion } from "@/lib/daily";
import { reportError } from "@/lib/error-log";

export const dynamic = "force-dynamic";

const MAX_SOURCE_CHARS = 512 * 1024;

export async function POST(
  request: Request,
  { params }: { params: { slug: string } }
) {
  const user = await getSessionUser();
  const { success } = await rateLimit(request, {
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
  const lock = await lockedBehind(question, user?.id);
  if (lock) {
    return NextResponse.json({ error: `Solve "${lock.title}" first.`, locked: lock }, { status: 403 });
  }

  // Testbench problems grade the student's tb against the given DUT and its bugs;
  // formal problems grade the student's property harness the same way.
  const isTestbench = question.problemType === "testbench";
  const isFormal    = question.problemType === "formal";
  const writesTb    = isTestbench || isFormal;
  const language          = !writesTb && body?.language === "vhdl" ? "vhdl" : "verilog";
  const testbenchLanguage = isTestbench && body?.testbenchLanguage === "python" ? "python" : "verilog";
  if (writesTb && !testbenchCode.trim()) {
    return NextResponse.json({ error: "testbenchCode is required." }, { status: 400 });
  }

  // A VHDL design is graded through its Verilog netlist; everything below uses gradedCode.
  let gradedCode: string = designCode;
  if (language === "vhdl") {
    try {
      const converted = await designAsVerilog(designCode, "vhdl");
      if ("error" in converted) return NextResponse.json({ error: converted.error }, { status: 422 });
      gradedCode = converted.verilog;
    } catch (err) {
      await reportError("[submit] VHDL conversion failed:", err);
      return NextResponse.json({ error: "Simulation backend unavailable" }, { status: 502 });
    }
  }

  const violation = isFormal
    ? formalPolicyViolation(testbenchCode)
    : isTestbench
      ? (testbenchLanguage === "python" ? null : testbenchPolicyViolation(testbenchCode))   // the API vets cocotb code
      : designPolicyViolation(gradedCode, gradingTestbenches(question));
  if (violation) {
    return NextResponse.json({ error: violation }, { status: 422 });
  }

  let grade;
  try {
    grade = isFormal    ? await gradeFormal(question, testbenchCode)
          : isTestbench ? await gradeTestbench(question, testbenchCode, testbenchLanguage)
          :               await gradeDesign(question, gradedCode);
  } catch (err) {
    await reportError("[submit] grading failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Simulation backend unavailable" },
      { status: 502 }
    );
  }

  // Timing problems (lib/arena/timing.ts): a correct design must also reach the target clock.
  const timing = writesTb ? null : timingTarget(question.slug);
  let fmaxMhz: number | null = null;
  let tooSlow = false;
  if (timing && grade.accepted) {
    const t = await measureFmax(gradedCode, timing.wrapper)
      .catch((err): { error: string } => ({ error: err instanceof Error ? err.message : String(err) }));
    if ("mhz" in t) fmaxMhz = t.mhz;
    if (!("mhz" in t) || t.mhz < timing.targetMhz) {
      tooSlow = true;
      grade = {
        ...grade, accepted: false,
        errorMessage: "mhz" in t
          ? `Every result is correct, but the design reaches ${t.mhz} MHz on the iCE40-HX8K and the target is ${timing.targetMhz} MHz. Shorten the longest path between registers.`
          : `Every result is correct, but the timing check couldn't run: ${t.error}`,
      };
    }
  }

  // Started now, awaited below: runs alongside the DB writes.
  const failingWaveform = writesTb ? Promise.resolve(null) : failingTestWaveform(question, gradedCode, grade);
  const counterexample  = grade.accepted || writesTb || tooSlow ? Promise.resolve(null) : findCounterexample(question, gradedCode);
  // Optimization scores for the leaderboard (accepted designs only; never affects the verdict)
  const metrics = grade.accepted && !writesTb
    ? metricsOnBackend(gradedCode)
        .then(({ status, data }) => (status === 200 && data?.ok ? { gates: data.gates as number, depth: data.depth as number, ffBits: data.ffBits as number } : null))
        .catch(() => null)
    : Promise.resolve(null);

  const xpReward = grade.accepted ? question.xpReward : 0;   // worth this much on a first solve

  const saved = await recordSubmission({
    userId:          user?.id ?? null,
    question,
    designCode:      writesTb ? question.starterCode : designCode,
    testbenchCode,
    language:        testbenchLanguage === "python" ? "python" : language,
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
  }).catch(async (err) => {
    // Grading succeeded; don't hide the verdict because the history write failed.
    await reportError("[submit] failed to record submission:", err);
    return null;
  });

  const scores = await metrics;
  if (saved && scores) {
    await prisma.submission.update({
      where: { id: saved.id },
      data:  { gateCount: scores.gates, logicDepth: scores.depth, ffBits: scores.ffBits },
    }).catch((err) => reportError("[submit] failed to store metrics:", err));
  }
  if (saved && fmaxMhz !== null) {
    await prisma.submission.update({ where: { id: saved.id }, data: { fmaxMhz } })
      .catch((err) => reportError("[submit] failed to store fmax:", err));
  }
  const cx = await counterexample;
  if (saved && cx) {
    await prisma.submission.update({ where: { id: saved.id }, data: { counterexample: counterexampleTable(cx) } })
      .catch((err) => reportError("[submit] failed to store counterexample:", err));
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
      verdicts:        publicVerdicts(grade.verdicts),
      passed:          grade.passed,
      total:           grade.total,
      accepted:        grade.accepted,
      totalDurationMs: grade.totalDurationMs,
      submittedCode:   writesTb ? testbenchCode : designCode,
      xpEarned:        (saved?.xpEarned ?? 0) + dailyBonusXp,   // what was actually awarded
      dailyBonusXp,
      errorMessage:    grade.errorMessage,
      failingWaveform: await failingWaveform,
      counterexample:  cx,
      metrics:         scores,
      timing:          timing ? { fmaxMhz, targetMhz: timing.targetMhz } : null,
    },
  });
}
