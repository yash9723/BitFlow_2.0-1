import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-utils";
import { reportError } from "@/lib/error-log";

export const dynamic = "force-dynamic";

function safeParseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function asJsonl(rows: unknown[]) {
  return rows.map((row) => JSON.stringify(row)).join("\n") + "\n";
}

function downloadResponse(body: string, filename: string, contentType: string) {
  return new NextResponse(body, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }
    if (user.role !== "ADMIN") {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const dataset = searchParams.get("dataset") ?? "submissions";
    const format = searchParams.get("format") ?? (dataset === "all" ? "json" : "jsonl");
    const includeWaveforms = searchParams.get("includeWaveforms") === "true";
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

    if (dataset === "submissions") {
      const submissions = await prisma.submission.findMany({
        orderBy: { createdAt: "desc" },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              role: true,
              createdAt: true,
            },
          },
          question: {
            select: {
              id: true,
              slug: true,
              title: true,
              difficulty: true,
              category: true,
              learningLevel: true,
              moduleId: true,
              statement: true,
              publicTestbench: true,
              hiddenTestbench: true,
              expectedOutputMode: true,
              waveformRequired: true,
              xpReward: true,
            },
          },
        },
      });

      const rows = submissions.map((submission) => ({
        id: submission.id,
        createdAt: submission.createdAt,
        user: submission.user
          ? {
              id: submission.user.id,
              username: submission.user.username,
              role: submission.user.role,
              createdAt: submission.user.createdAt,
            }
          : null,
        problem: submission.question,
        submission: {
          type: submission.submissionType,
          attemptNumber: submission.attemptNumber,
          accepted: submission.accepted,
          xpEarned: submission.xpEarned,
        },
        code: {
          design: submission.designCode,
          testbench: submission.testbenchCode,
        },
        simulation: {
          status: submission.simStatus,
          stdout: submission.simStdout,
          stderr: submission.simStderr,
          exitCode: submission.simExitCode,
          durationMs: submission.durationMs,
          testsPassed: submission.numTestsPassed,
          testsTotal: submission.numTestsTotal,
          testcaseResults: safeParseJson(submission.testcaseResults, []),
        },
        ...(includeWaveforms ? { waveformVcd: submission.waveformVcd } : {}),
      }));

      if (format === "json") {
        return downloadResponse(
          JSON.stringify({ exportedAt: new Date().toISOString(), submissions: rows }, null, 2),
          `bitflow-submissions-${timestamp}.json`,
          "application/json; charset=utf-8"
        );
      }

      return downloadResponse(
        asJsonl(rows),
        `bitflow-submissions-${timestamp}.jsonl`,
        "application/x-ndjson; charset=utf-8"
      );
    }

    if (dataset === "all") {
      const [users, progress, xp, questions, submissions] = await Promise.all([
        prisma.user.findMany({
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            username: true,
            role: true,
            createdAt: true,
          },
        }),
        prisma.userProgress.findMany({
          orderBy: { updatedAt: "desc" },
          include: {
            user: { select: { id: true, username: true, role: true } },
            question: { select: { id: true, slug: true, title: true, moduleId: true } },
          },
        }),
        prisma.userXp.findMany({
          include: {
            user: { select: { id: true, username: true, role: true } },
          },
        }),
        prisma.question.findMany({ orderBy: { orderIndex: "asc" } }),
        prisma.submission.findMany({
          orderBy: { createdAt: "desc" },
          include: {
            user: { select: { id: true, username: true, role: true } },
            question: { select: { id: true, slug: true, title: true, moduleId: true } },
          },
        }),
      ]);

      const payload = {
        exportedAt: new Date().toISOString(),
        users,
        progress: progress.map((record) => ({
          ...record,
          hintsUnlocked: safeParseJson(record.hintsUnlocked, []),
        })),
        xp: xp.map((record) => ({
          ...record,
          unlockedModules: safeParseJson(record.unlockedModules, []),
        })),
        questions: questions.map((question) => ({
          ...question,
          tags: safeParseJson(question.tags, []),
          constraints: safeParseJson(question.constraints, []),
          examples: safeParseJson(question.examples, []),
          hints: safeParseJson(question.hints, []),
          hiddenTestcases: safeParseJson(question.hiddenTestcases, []),
          publicTestcases: safeParseJson(question.publicTestcases, []),
        })),
        submissions: submissions.map((submission) => ({
          ...submission,
          testcaseResults: safeParseJson(submission.testcaseResults, []),
          ...(includeWaveforms ? {} : { waveformVcd: undefined }),
        })),
      };

      return downloadResponse(
        JSON.stringify(payload, null, 2),
        `bitflow-all-data-${timestamp}.json`,
        "application/json; charset=utf-8"
      );
    }

    return NextResponse.json(
      { error: "Unsupported dataset. Use dataset=submissions or dataset=all." },
      { status: 400 }
    );
  } catch (err) {
    await reportError("[GET /api/admin/export] error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
