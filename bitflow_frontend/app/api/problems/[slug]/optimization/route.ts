/**
 * GET /api/problems/[slug]/optimization — smallest-design leaderboard.
 * ?sort=fmax — fastest-design leaderboard (timing problems, lib/arena/timing.ts).
 *
 * Each user's best accepted submission, ranked by fewest gates, then lowest
 * logic depth, then earliest (or by highest Fmax, then earliest). Only numbers and usernames are returned, never
 * code. `me` is the caller's own best and rank (null if they have none).
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-utils";
import { PRIVACY_SELECT, publicName } from "@/lib/privacy";

export const dynamic = "force-dynamic";

const TOP = 10;

export async function GET(request: Request, { params }: { params: { slug: string } }) {
  const question = await prisma.question.findUnique({ where: { slug: params.slug }, select: { id: true } });
  if (!question) return NextResponse.json({ error: "Problem not found." }, { status: 404 });

  // ponytail: ranks in memory over at most 5000 scored submissions per problem;
  // move to a GROUP BY query if a problem ever gets more than that.
  const fastest = new URL(request.url).searchParams.get("sort") === "fmax";
  const rows = await prisma.submission.findMany({
    where:   { problemId: question.id, accepted: true, userId: { not: null }, ...(fastest ? { fmaxMhz: { not: null } } : { gateCount: { not: null } }) },
    orderBy: fastest ? [{ fmaxMhz: "desc" }, { createdAt: "asc" }] : [{ gateCount: "asc" }, { logicDepth: "asc" }, { createdAt: "asc" }],
    select:  { userId: true, gateCount: true, logicDepth: true, ffBits: true, fmaxMhz: true, createdAt: true, user: { select: { id: true, username: true, ...PRIVACY_SELECT } } },
    take:    5000,
  });

  const me = await getSessionUser();
  const seen = new Set<string>();
  const board = rows.filter((r) => !seen.has(r.userId!) && seen.add(r.userId!)).map((r, i) => ({
    rank:     i + 1,
    userId:   r.userId!,
    username: r.user ? publicName(r.user, me?.id) : "unknown",   // under-18s appear as "Student xxxx"
    gates:    r.gateCount ?? 0,
    mhz:      r.fmaxMhz ?? null,
    depth:    r.logicDepth ?? 0,
    ffBits:   r.ffBits ?? 0,
    at:       r.createdAt,
  }));

  const mine = me ? board.find((b) => b.userId === me.id) ?? null : null;
  const strip = ({ userId, ...rest }: (typeof board)[number]) => ({ ...rest, isMe: !!me && userId === me.id });

  return NextResponse.json({
    solvers: board.length,
    entries: board.slice(0, TOP).map(strip),
    me:      mine ? strip(mine) : null,
  });
}
