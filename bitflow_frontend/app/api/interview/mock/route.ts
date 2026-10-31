/**
 * /api/interview/mock — mock interviews (lib/interview.ts).
 * GET:  { now, active, history } for the signed-in learner. Guests get empty lists, not an error:
 *       components/MockBanner.tsx asks on every problem page.
 * POST: starts one, or returns the one already running.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-utils";
import { rateLimit } from "@/lib/rate-limit";
import { MOCK_MINUTES, pickMockProblems } from "@/lib/interview";
import { activeMock, mockReport } from "@/lib/interview-server";
import { solvedSlugs } from "@/lib/unlock";

export const dynamic = "force-dynamic";

const tagsOf = (json: string) => { try { const t = JSON.parse(json); return Array.isArray(t) ? t.map(String) : []; } catch { return []; } };

export async function GET() {
  const now = new Date();
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ now, active: null, history: [] });
  const rows = await prisma.mockInterview.findMany({ where: { userId: me.id }, orderBy: { startedAt: "desc" }, take: 10 });
  const reports = await Promise.all(rows.map((r) => mockReport(r, now)));
  return NextResponse.json({ now, active: reports.find((r) => r.running) ?? null, history: reports.filter((r) => !r.running) });
}

export async function POST(request: Request) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Sign in to start a mock interview." }, { status: 401 });

  const running = await activeMock(me.id);
  if (running) return NextResponse.json({ id: running.id });

  const { success } = await rateLimit(request, { limit: 10, windowMs: 60 * 60_000, prefix: "mock", key: `user:${me.id}` });
  if (!success) return NextResponse.json({ error: "That's a lot of mocks for one hour. Try again later." }, { status: 429 });

  const rows = await prisma.question.findMany({
    where: { archived: false },
    select: { slug: true, title: true, difficulty: true, category: true, tags: true, learningLevel: true, problemType: true, unlockAfter: true },
  });
  const problems = pickMockProblems(rows.map((r) => ({ ...r, tags: tagsOf(r.tags) })), await solvedSlugs(me.id));
  if (problems.length < 3) return NextResponse.json({ error: "There aren't enough problems for a mock right now." }, { status: 503 });

  const startedAt = new Date();
  const mock = await prisma.mockInterview.create({
    data: { userId: me.id, problems: JSON.stringify(problems), startedAt, endsAt: new Date(startedAt.getTime() + MOCK_MINUTES * 60_000) },
    select: { id: true },
  });
  return NextResponse.json({ id: mock.id }, { status: 201 });
}
