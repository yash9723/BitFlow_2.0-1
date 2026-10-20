/**
 * app/api/submissions/route.ts
 *
 * POST /api/submissions — Save a RUN (public-testbench) result to the
 *                          Submission table. Called by useArenaProblem and
 *                          useProblem after every run. Graded SUBMITs go
 *                          through POST /api/problems/[slug]/submit instead,
 *                          so nothing posted here can award XP.
 *
 * GET  /api/submissions — Fetch submission history for the current user
 *
 * This is the critical LLM training data pipeline.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-utils";
import { recordSubmission } from "@/lib/record-submission";
import { reportError } from "@/lib/error-log";

export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────────────────────
// POST — Save a run
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const {
      problemSlug,      // string (required) — used to find Question.id
      designCode,       // string (required)
      testbenchCode,    // string (required)
      submissionType,   // must be "RUN"
      simStatus,        // "SUCCESS" | "COMPILE_ERROR" | "RUNTIME_ERROR" | "TIMEOUT"
      simStdout,        // string | null
      simStderr,        // string | null
      simExitCode,      // number | null
      durationMs,       // number | null
      waveformVcd,      // string | null (base64)
    } = body;
    const language = ["vhdl", "python"].includes(body?.language) ? body.language as "vhdl" | "python" : "verilog";

    if (!problemSlug || !designCode || !testbenchCode) {
      return NextResponse.json(
        { error: "problemSlug, designCode, and testbenchCode are required." },
        { status: 400 }
      );
    }
    if (submissionType && submissionType !== "RUN") {
      return NextResponse.json(
        { error: "Submissions are graded via POST /api/problems/[slug]/submit." },
        { status: 400 }
      );
    }

    const question = await prisma.question.findUnique({
      where:  { slug: problemSlug },
      select: { id: true, moduleId: true },
    });

    if (!question) {
      console.warn(`[submissions] Problem not found in DB: ${problemSlug}`);
      return NextResponse.json(
        { error: `Problem not found: ${problemSlug}` },
        { status: 404 }
      );
    }

    const user = await getSessionUser();

    const submission = await recordSubmission({
      userId:          user?.id ?? null,
      question,
      designCode,
      testbenchCode,
      language,
      submissionType:  "RUN",
      simStatus:       simStatus ?? "SUCCESS",
      simStdout:       simStdout ?? null,
      simStderr:       simStderr ?? null,
      simExitCode:     simExitCode ?? null,
      durationMs:      durationMs ?? null,
      testcaseResults: [],
      waveformVcd:     waveformVcd ?? null,
      xpEarned:        0,
      accepted:        false,
    });

    return NextResponse.json({ submission }, { status: 201 });

  } catch (err) {
    await reportError("[submissions POST] error:", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET — Fetch submission history for a user
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    // Only your own history; admins may look up any user with ?userId=.
    const me = await getSessionUser();
    if (!me) {
      return NextResponse.json({ error: "Sign in to view submissions." }, { status: 401 });
    }
    const requested    = searchParams.get("userId");
    const userId       = me.role === "ADMIN" && requested ? requested : me.id;
    const problemSlug  = searchParams.get("slug");
    const limit        = Math.min(parseInt(searchParams.get("limit") ?? "50"), 200);

    let whereClause: Record<string, any> = {};

    if (userId) {
      whereClause.userId = userId;
    }

    if (problemSlug) {
      const question = await prisma.question.findUnique({
        where:  { slug: problemSlug },
        select: { id: true },
      });
      if (question) {
        whereClause.problemId = question.id;
      }
    }

    const submissions = await prisma.submission.findMany({
      where:   whereClause,
      orderBy: { createdAt: "desc" },
      take:    limit,
      select: {
        id:             true,
        submissionType: true,
        attemptNumber:  true,
        simStatus:      true,
        numTestsPassed: true,
        numTestsTotal:  true,
        accepted:       true,
        xpEarned:       true,
        createdAt:      true,
        question: {
          select: { slug: true, title: true, difficulty: true },
        },
        user: {
          select: { username: true },
        },
      },
    });

    return NextResponse.json({ submissions });

  } catch (err) {
    await reportError("[submissions GET] error:", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
