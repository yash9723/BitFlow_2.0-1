/**
 * app/api/problems/[slug]/route.ts
 *
 * GET /api/problems/[slug]
 * Returns a single problem by slug from the database.
 * Parses all JSON-stringified fields back to arrays/objects.
 */

import { NextResponse } from "next/server";
import { prisma }       from "@/lib/prisma";
import { reportError } from "@/lib/error-log";
import { getSessionUser } from "@/lib/auth-utils";

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
      starterCode:    await carriedStarter(question.starterCode),
      tags:           safeParseJson(question.tags,           []),
      constraints:    safeParseJson(question.constraints,    []),
      examples:       safeParseJson(question.examples,       []),
      hints:          safeParseJson(question.hints,          []),
      publicTestcases: safeParseJson(question.publicTestcases, []),
      dataFiles:       safeParseJson(question.dataFiles, null),
    };

    return NextResponse.json({ problem: parsed });

  } catch (err) {
    await reportError("[problems/slug GET]", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * Project steps (RISC-V track): a starter may contain stub modules wrapped in
 *   // @step <slug>  ...  // @end
 * Each block becomes the learner's latest accepted code for that earlier
 * problem, or stays a stub (with a note) if they haven't solved it yet.
 * Stubs compile on their own, so the plain starter always builds.
 */
const STEP_BLOCK = /\/\/ @step ([\w-]+)[^\n]*\n([\s\S]*?)\/\/ @end[^\n]*\n?/g;

async function carriedStarter(starter: string): Promise<string> {
  const blocks = [...starter.matchAll(STEP_BLOCK)];
  if (!blocks.length) return starter;
  const user = await getSessionUser();
  const steps = await prisma.question.findMany({
    where: { slug: { in: blocks.map((b) => b[1]) } }, select: { id: true, slug: true, title: true },
  });
  const replacements = await Promise.all(blocks.map(async ([, slug, stub]) => {
    const step = steps.find((s) => s.slug === slug);
    const accepted = user && step && await prisma.submission.findFirst({
      where:   { userId: user.id, problemId: step.id, accepted: true },
      orderBy: { createdAt: "desc" },
      select:  { designCode: true },
    });
    const title = step?.title ?? slug;
    return accepted
      ? `// ── From "${title}": your accepted solution ──\n${accepted.designCode.replace(/^\s*`timescale[^\n]*\n/gm, "").trim()}\n\n`
      : `// ── Stub for "${title}". Solve that step and your own code replaces this automatically. ──\n${stub}`;
  }));
  let i = 0;
  return starter.replace(STEP_BLOCK, () => replacements[i++]);
}

function safeParseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
