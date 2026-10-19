/**
 * app/api/problems/[slug]/route.ts
 *
 * GET /api/problems/[slug]
 * Returns a single problem by slug from the database.
 * Parses all JSON-stringified fields back to arrays/objects.
 */

import { NextResponse } from "next/server";
import { prisma }       from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: { slug: string } }
) {
  try {
    const { slug } = params;
    const question = await prisma.question.findUnique({
      where: { slug },
    });

    if (!question) {
      return NextResponse.json(
        { error: `Problem not found: ${slug}` },
        { status: 404 }
      );
    }

    // Hidden tests and the reference solution never leave the server.
    const {
      hiddenTestbench: _hb, hiddenTestcases: _ht, referenceSolution: _ref, mutants: _mut, ...publicQuestion
    } = question;
    // Parse all JSON-stringified fields back to arrays/objects
    const parsed = {
      ...publicQuestion,
      tags:           safeParseJson(question.tags,           []),
      constraints:    safeParseJson(question.constraints,    []),
      examples:       safeParseJson(question.examples,       []),
      hints:          safeParseJson(question.hints,          []),
      publicTestcases: safeParseJson(question.publicTestcases, []),
      dataFiles:       safeParseJson(question.dataFiles, null),
    };

    return NextResponse.json({ problem: parsed });

  } catch (err) {
    console.error("[problems/slug GET]", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

function safeParseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
