import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-utils";
import { reportError } from "@/lib/error-log";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }
    if (user.role !== "ADMIN") {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }

    const [totalUsers, totalSubmissions, recentUsers] = await Promise.all([
      prisma.user.count(),
      prisma.submission.count(),
      prisma.user.findMany({
        orderBy: { createdAt: "desc" },
        take: 25,
        select: {
          id: true,
          username: true,
          role: true,
          createdAt: true,
          _count: {
            select: {
              progress: true,
              submissions: true,
            },
          },
        },
      }),
    ]);

    return NextResponse.json({ totalUsers, totalSubmissions, users: recentUsers });
  } catch (err) {
    await reportError("[GET /api/admin/users] error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
