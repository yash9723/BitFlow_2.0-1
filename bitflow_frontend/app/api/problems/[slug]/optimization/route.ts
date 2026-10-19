/**
 * GET /api/problems/[slug]/optimization — smallest-design leaderboard.
 *
 * Each user's best accepted submission, ranked by fewest gates, then lowest
 * logic depth, then earliest. Only numbers and usernames are returned, never
 * code. `me` is the caller's own best and rank (null if they have none).
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-utils";

export const dynamic = "force-dynamic";

const TOP = 10;

export async function GET(_request: Request, { params }: { params: { slug: string } }) {
  const question = await prisma.question.findUnique({ where: { slug: params.slug }, select: { id: true } });
  if (!question) return NextResponse.json({ error: "Problem not found." }, { status: 404 });

  // ponytail: ranks in memory over at most 5000 scored submissions per problem;
  // move to a GROUP BY query if a problem ever gets more than that.
  const rows = await prisma.submission.findMany({
    where:   { problemId: question.id, accepted: true, gateCount: { not: null }, userId: { not: null } },
    orderBy: [{ gateCount: "asc" }, { logicDepth: "asc" }, { createdAt: "asc" }],
    select:  { userId: true, gateCount: true, logicDepth: true, ffBits: true, createdAt: true, user: { select: { username: true } } },
    take:    5000,
  });

  const seen = new Set<string>();
  const board = rows.filter((r) => !seen.has(r.userId!) && seen.add(r.userId!)).map((r, i) => ({
    rank:     i + 1,
    userId:   r.userId!,
    username: r.user?.username ?? "unknown",
    gates:    r.gateCount!,
    depth:    r.logicDepth ?? 0,
    ffBits:   r.ffBits ?? 0,
    at:       r.createdAt,
  }));

  const me = await getSessionUser();
  const mine = me ? board.find((b) => b.userId === me.id) ?? null : null;
  const strip = ({ userId, ...rest }: (typeof board)[number]) => ({ ...rest, isMe: !!me && userId === me.id });

  return NextResponse.json({
    solvers: board.length,
    entries: board.slice(0, TOP).map(strip),
    me:      mine ? strip(mine) : null,
  });
}
