/**
 * GET /api/contests/[id] — one contest: its problems and live standings once it
 * has started (before that, only the title and times). Standings rank users by
 * problems solved, then penalty minutes (lib/contests.ts); `me` is the caller's row.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-utils";
import { contestStatus, parseSlugs, PENALTY_MINUTES, standings } from "@/lib/contests";
import { problemHref } from "@/lib/problem-href";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const contest = await prisma.contest.findUnique({ where: { id: params.id } });
  if (!contest) return NextResponse.json({ error: "Contest not found." }, { status: 404 });

  const now = new Date();
  const status = contestStatus(contest, now);
  const base = {
    now, penaltyMinutes: PENALTY_MINUTES,
    contest: { id: contest.id, title: contest.title, startsAt: contest.startsAt, endsAt: contest.endsAt, status },
  };
  if (status === "upcoming") return NextResponse.json({ ...base, problems: [], standings: [], me: null });

  const slugs = parseSlugs(contest.problemSlugs);
  const questions = await prisma.question.findMany({
    where:  { slug: { in: slugs } },
    select: { id: true, slug: true, title: true, difficulty: true, category: true, learningLevel: true },
  });
  const bySlug = new Map(questions.map((q) => [q.slug, q]));
  const problems = slugs.filter((s) => bySlug.has(s)).map((s, i) => {
    const q = bySlug.get(s)!;
    return { label: String.fromCharCode(65 + i), slug: q.slug, title: q.title, difficulty: q.difficulty, href: problemHref(q) };
  });

  // ponytail: in-memory over at most 20000 submits per contest; aggregate in SQL if contests get that big.
  const subs = await prisma.submission.findMany({
    where: {
      problemId: { in: questions.map((q) => q.id) }, submissionType: "SUBMIT", userId: { not: null },
      createdAt: { gte: contest.startsAt, lt: contest.endsAt },
    },
    select: { userId: true, accepted: true, createdAt: true, question: { select: { slug: true } }, user: { select: { username: true } } },
    take: 20_000,
  });
  const rows = standings(subs.map((s) => ({
    userId: s.userId!, username: s.user?.username ?? "unknown", slug: s.question.slug, accepted: s.accepted, createdAt: s.createdAt,
  })), contest.startsAt);

  const me = await getSessionUser();
  const strip = ({ userId, ...r }: (typeof rows)[number]) => ({ ...r, isMe: !!me && userId === me.id });
  const mine = me ? rows.find((r) => r.userId === me.id) : undefined;
  return NextResponse.json({ ...base, problems, standings: rows.slice(0, 100).map(strip), me: mine ? strip(mine) : null });
}
