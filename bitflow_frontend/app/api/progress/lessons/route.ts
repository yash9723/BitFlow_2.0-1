/**
 * app/api/progress/lessons/route.ts — your Board Lab and Academy progress (lib/lesson-progress.ts).
 *
 * GET                  — every lesson you've touched (no drafts)
 * GET ?kind=&slug=     — that lesson's saved draft
 * POST { items: [{ kind, slug, done?, quizScore?, draft? }] } — up to MAX_ITEMS; returns the XP awarded
 */
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { reportError } from "@/lib/error-log";
import { lessonProblem, type LessonItem } from "@/lib/lessons";
import { recordLessons } from "@/lib/lesson-progress";

export const dynamic = "force-dynamic";

const MAX_ITEMS = 100;
const MAX_BODY = 200_000;

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const kind = params.get("kind"), slug = params.get("slug");
  if (kind && slug) {
    const row = await prisma.lessonProgress.findUnique({ where: { userId_kind_slug: { userId: user.id, kind, slug } }, select: { draft: true } });
    return NextResponse.json({ draft: row?.draft ?? null });
  }
  const lessons = await prisma.lessonProgress.findMany({
    where:  { userId: user.id },
    select: { kind: true, slug: true, done: true, quizScore: true, completedAt: true },
  });
  return NextResponse.json({ lessons });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { success } = await rateLimit(request, { limit: 60, windowMs: 60_000, prefix: "lessons", key: `user:${user.id}` });
  if (!success) return NextResponse.json({ error: "Too many updates; try again in a minute." }, { status: 429 });

  const raw = await request.text();
  if (raw.length > MAX_BODY) return NextResponse.json({ error: "Too large." }, { status: 413 });
  let items: unknown;
  try { items = JSON.parse(raw)?.items; } catch { return NextResponse.json({ error: "Bad JSON." }, { status: 400 }); }
  if (!Array.isArray(items) || items.length === 0 || items.length > MAX_ITEMS) {
    return NextResponse.json({ error: `Send 1 to ${MAX_ITEMS} items.` }, { status: 400 });
  }
  const bad = items.map(lessonProblem).find(Boolean);
  if (bad) return NextResponse.json({ error: bad }, { status: bad === "Draft too large." ? 413 : 400 });

  try {
    return NextResponse.json({ xpAwarded: await recordLessons(user.id, items as LessonItem[]) });
  } catch (err) {
    await reportError("[progress/lessons] error:", err);
    return NextResponse.json({ error: "Couldn't save your progress." }, { status: 500 });
  }
}
