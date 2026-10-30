/**
 * GET /api/admin/users?q=&page=&sort=new|xp — one page (25) of users for the admin
 * Users tab: role, XP, problems solved, submissions, joined and last active. Never passwords.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { adminDenied } from "@/lib/auth-utils";
import { reportError } from "@/lib/error-log";

export const dynamic = "force-dynamic";

const PAGE = 25;

export async function GET(request: Request) {
  try {
    const denied = await adminDenied();
    if (denied) return denied;

    const params = new URL(request.url).searchParams;
    const q      = (params.get("q") ?? "").trim().slice(0, 40);
    const page   = Math.max(0, Number(params.get("page")) || 0);
    const sort   = params.get("sort") === "xp" ? "xp" : "new";
    // ponytail: `contains` is case-sensitive on Postgres; usernames are mostly lower-case.
    const where  = q ? { username: { contains: q } } : {};

    const [totalUsers, matching, totalSubmissions, users] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where }),
      prisma.submission.count(),
      prisma.user.findMany({
        where,
        orderBy: sort === "xp" ? [{ xp: { totalXp: "desc" } }, { createdAt: "desc" }] : { createdAt: "desc" },
        skip: page * PAGE,
        take: PAGE,
        select: {
          id: true, username: true, role: true, createdAt: true, publicProfile: true, bannedAt: true,
          xp: { select: { totalXp: true } },
          _count: { select: { submissions: true, certificates: true } },
        },
      }),
    ]);

    // Solved count and last activity for just this page of users.
    const ids = users.map((u) => u.id);
    const [solved, last] = await Promise.all([
      prisma.userProgress.groupBy({ by: ["userId"], where: { userId: { in: ids }, solved: true }, _count: { _all: true } }),
      prisma.submission.groupBy({ by: ["userId"], where: { userId: { in: ids } }, _max: { createdAt: true } }),
    ]);
    const solvedBy = new Map(solved.map((s) => [s.userId, s._count._all]));
    const lastBy = new Map(last.map((s) => [s.userId, s._max.createdAt]));

    return NextResponse.json({
      totalUsers, totalSubmissions, matching, page, pageSize: PAGE,
      users: users.map(({ xp, _count, ...u }) => ({
        ...u,
        totalXp:      xp?.totalXp ?? 0,
        solved:       solvedBy.get(u.id) ?? 0,
        submissions:  _count.submissions,
        certificates: _count.certificates,
        lastActive:   lastBy.get(u.id) ?? null,
      })),
    });
  } catch (err) {
    await reportError("[GET /api/admin/users] error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
