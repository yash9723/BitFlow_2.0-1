/**
 * app/api/problems/route.ts
 *
 * GET  /api/problems          — Returns all problems (with optional filters)
 * POST /api/problems          — Creates a new problem (Admin only)
 *
 * Query params for GET:
 *   ?level=Beginner|Intermediate|Advanced|Arena
 *   ?category=FSM|Combinational|Sequential
 *   ?difficulty=Easy|Medium|Hard|Expert
 *   ?moduleId=mod_logic_gates
 * GET returns list fields only (no statement or code).
 */

import { NextResponse }   from "next/server";
import { prisma }         from "@/lib/prisma";
import { adminDenied }    from "@/lib/auth-utils";
import { reportError } from "@/lib/error-log";
import { auditAdmin } from "@/lib/privacy-server";

export const dynamic = "force-dynamic";


// ─────────────────────────────────────────────────────────────────────────────
// GET — Fetch all problems
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    const level      = searchParams.get("level");
    const category   = searchParams.get("category");
    const difficulty = searchParams.get("difficulty");
    const moduleId   = searchParams.get("moduleId");

    const where: Record<string, unknown> = { archived: false };
    if (level)      where.learningLevel = level;
    if (category)   where.category      = category;
    if (difficulty) where.difficulty    = difficulty;
    if (moduleId)   where.moduleId      = moduleId;

    const questions = await prisma.question.findMany({
      where,
      orderBy: { orderIndex: "asc" },
      // The list only: statements, code and testbenches come from /api/problems/[slug].
      select: {
        id: true, slug: true, title: true, difficulty: true, category: true, tags: true,
        learningLevel: true, orderIndex: true, moduleId: true, xpReward: true,
      },
    });

    const parsed = questions.map(q => ({ ...q, tags: safeParseJson(q.tags, []) }));

    // The problem bank is public and changes only when an admin adds a problem.
    return NextResponse.json({ problems: parsed }, {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" },
    });

  } catch (err) {
    await reportError("[GET /api/problems] error:", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST — Create a new problem (Admin only)
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const denied = await adminDenied();
    if (denied) return denied;

    const body = await request.json();

    const {
      slug, title, difficulty, category, tags, learningLevel,
      orderIndex, moduleId, statement, constraints, examples,
      hints, starterCode, testbenchSkeleton, publicTestbench,
      hiddenTestcases, hiddenTestbench, publicTestcases,
      expectedOutputMode, waveformRequired, xpReward, xpBonusNoHints,
    } = body;

    // Basic validation
    if (!slug || !title || !statement || !starterCode) {
      return NextResponse.json(
        { error: "slug, title, statement, and starterCode are required." },
        { status: 400 }
      );
    }

    // Check for duplicate slug
    const existing = await prisma.question.findUnique({ where: { slug } });
    if (existing) {
      return NextResponse.json(
        { error: `Problem with slug "${slug}" already exists.` },
        { status: 409 }
      );
    }

    const question = await prisma.question.create({
      data: {
        slug,
        title,
        difficulty:         difficulty        ?? "Easy",
        category:           category          ?? "General",
        tags:               JSON.stringify(tags ?? []),
        learningLevel:      learningLevel     ?? "Beginner",
        orderIndex:         orderIndex        ?? 0,
        moduleId:           moduleId          ?? "unknown",
        statement,
        constraints:        JSON.stringify(constraints     ?? []),
        examples:           JSON.stringify(examples        ?? []),
        hints:              JSON.stringify(hints           ?? []),
        starterCode,
        testbenchSkeleton:  testbenchSkeleton ?? null,
        publicTestbench:    publicTestbench   ?? "",
        hiddenTestcases:    JSON.stringify(hiddenTestcases ?? []),
        hiddenTestbench:    hiddenTestbench   ?? null,
        publicTestcases:    JSON.stringify(publicTestcases ?? []),
        expectedOutputMode: expectedOutputMode ?? "stdout_compare",
        waveformRequired:   waveformRequired  ?? false,
        xpReward:           xpReward          ?? 300,
        xpBonusNoHints:     xpBonusNoHints    ?? null,
      },
    });

    await auditAdmin("admin.problem.create", question.slug);
    return NextResponse.json({ problem: question }, { status: 201 });

  } catch (err) {
    await reportError("[POST /api/problems] error:", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper
// ─────────────────────────────────────────────────────────────────────────────

function safeParseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try { return JSON.parse(value) as T; }
  catch { return fallback; }
}
