/**
 * /api/admin/debug-problems — "find the bug" problems (lib/debug-problems.ts).
 * GET:  problems that can have one, and whether they do.
 * POST: { slug } creates or refreshes the one for that problem. One per request
 *       (a few simulations each), so the admin page walks the list.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { adminDenied } from "@/lib/auth-utils";
import { canHaveDebugVersion, createDebugProblem, DEBUG_PREFIX } from "@/lib/debug-problems";
import { reportError } from "@/lib/error-log";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const denied = await adminDenied();
  if (denied) return denied;
  const questions = await prisma.question.findMany({
    select: { slug: true, title: true, problemType: true, referenceSolution: true, unlockAfter: true, learningLevel: true },
    orderBy: [{ learningLevel: "asc" }, { orderIndex: "asc" }],
  });
  const existing = new Set(questions.filter((q) => q.unlockAfter).map((q) => q.slug));
  return NextResponse.json({
    problems: questions.filter(canHaveDebugVersion).map((q) => ({
      slug: q.slug, title: q.title, learningLevel: q.learningLevel, hasDebug: existing.has(DEBUG_PREFIX + q.slug),
    })),
  });
}

export async function POST(request: Request) {
  const denied = await adminDenied();
  if (denied) return denied;
  const slug = (await request.json().catch(() => ({})))?.slug;
  if (typeof slug !== "string" || !slug) return NextResponse.json({ error: "slug is required." }, { status: 400 });
  try {
    return NextResponse.json(await createDebugProblem(slug));
  } catch (err) {
    await reportError("[admin/debug-problems POST]", err);
    return NextResponse.json({ ok: false, error: "The simulator couldn't be reached. Try again." }, { status: 502 });
  }
}
