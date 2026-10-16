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

    // Parse all JSON-stringified fields back to arrays/objects
    const { hiddenTestbench: _hb, hiddenTestcases: _ht, ...publicQuestion } = question;
    const parsed = {
      ...publicQuestion,
      tags:           safeParseJson(question.tags,           []),
      constraints:    safeParseJson(question.constraints,    []),
      examples:       safeParseJson(question.examples,       []),
      hints:          safeParseJson(question.hints,          []),
      publicTestcases: safeParseJson(question.publicTestcases, []),
    };

    return NextResponse.json({ problem: parsed });

  } catch (err) {
  console.error(err);

  return NextResponse.json(
    {
      error: String(err)
    },
    { status: 500 }
  );
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
