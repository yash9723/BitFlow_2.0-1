/**
 * app/api/ai/tools/[tool]/route.ts — what the tutor agent (agents/tutor/) may look up while it answers.
 *
 * POST /api/ai/tools/get_problem | get_last_result | get_hint_status | get_hint   with  Authorization: Bearer <agent token>
 * The token (lib/agent-auth.ts) names one student and one problem and lives two minutes, so every tool reads exactly
 * that student's view of that problem. Replies are plain text built by lib/tutor-data.ts, an allow-list: anything the
 * student is not meant to see yet (grading material, answers, locked hints) cannot come out of here, and the select
 * below names only the fields the views use (scripts/tutor-agent.check.ts keeps it that way).
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { bearer, verifyAgentToken } from "@/lib/agent-auth";
import { canUseAi } from "@/lib/privacy";
import { hintStatus, hintView, lastResultView, problemView, tutorMayRead } from "@/lib/tutor-data";
import { reportError } from "@/lib/error-log";

export const dynamic = "force-dynamic";

const TOOLS = ["get_problem", "get_last_result", "get_hint_status", "get_hint"] as const;
const text = (t: string, status = 200) => NextResponse.json({ text: t }, { status });

export async function POST(req: NextRequest, { params }: { params: { tool: string } }) {
  let claims;
  try { claims = verifyAgentToken(bearer(req.headers.get("authorization"))); }
  catch { return NextResponse.json({ error: "The agent link is not configured." }, { status: 503 }); }
  if (!claims) return NextResponse.json({ error: "Invalid or expired token." }, { status: 401 });
  if (!(TOOLS as readonly string[]).includes(params.tool)) return NextResponse.json({ error: "Unknown tool." }, { status: 404 });

  const { success } = await rateLimit(req, { limit: 40, windowMs: 60_000, prefix: "ai-tool", key: `user:${claims.sub}` });
  if (!success) return NextResponse.json({ error: "Too many lookups. Answer with what you have." }, { status: 429 });

  try {
    // Checked again here, not only when the token was issued: a guardian can withdraw permission mid-conversation.
    const user = await prisma.user.findUnique({ where: { id: claims.sub } });
    if (!user || !canUseAi(user as any)) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

    const q = await prisma.question.findUnique({
      where: { slug: claims.slug },
      select: { id: true, title: true, difficulty: true, category: true, statement: true, constraints: true, examples: true, hints: true, unlockAfter: true, archived: true },
    });
    if (!tutorMayRead(q)) return text("This problem is not available to the tutor.", 404);
    const question = q!;

    if (params.tool === "get_problem") return text(problemView(question));

    if (params.tool === "get_last_result") {
      const last = await prisma.submission.findFirst({
        where: { userId: claims.sub, problemId: question.id, submissionType: "SUBMIT" }, orderBy: { createdAt: "desc" },
        select: { accepted: true, numTestsPassed: true, numTestsTotal: true, testcaseResults: true, simStdout: true, counterexample: true },
      });
      return text(lastResultView(last));
    }

    const progress = await prisma.userProgress.findUnique({ where: { userId_problemId: { userId: claims.sub, problemId: question.id } }, select: { hintsUnlocked: true } });
    let unlocked: number[] = [];
    try { unlocked = (JSON.parse(progress?.hintsUnlocked || "[]") as unknown[]).filter((n): n is number => typeof n === "number"); } catch { /* none */ }

    if (params.tool === "get_hint_status") return text(hintStatus(question, unlocked));

    const body = await req.json().catch(() => ({}));
    const hint = hintView(question, unlocked, Number(body?.tier));
    return text(hint.ok ? hint.text : hint.reason, hint.ok ? 200 : 403);
  } catch (err) {
    await reportError("[ai tools] error", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: "Lookup failed." }, { status: 500 });
  }
}
