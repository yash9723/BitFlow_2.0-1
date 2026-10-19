/**
 * GET /api/contests — every contest, newest first, with its status.
 * `now` is the server's clock so countdowns don't depend on the viewer's.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { contestStatus, parseSlugs } from "@/lib/contests";

export const dynamic = "force-dynamic";

export async function GET() {
  const now = new Date();
  const rows = await prisma.contest.findMany({ orderBy: { startsAt: "desc" }, take: 100 });
  return NextResponse.json({
    now,
    contests: rows.map((c) => ({
      id:       c.id,
      title:    c.title,
      startsAt: c.startsAt,
      endsAt:   c.endsAt,
      status:   contestStatus(c, now),
      problems: parseSlugs(c.problemSlugs).length,
    })),
  });
}
