import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-utils";
import { reportError } from "@/lib/error-log";

export const dynamic = "force-dynamic";

const bootedAt = new Date();
const bootId = Math.random().toString(36).slice(2, 10);

function sanitizeDatabaseUrl(value: string | undefined) {
  if (!value) return null;
  if (value.startsWith("file:")) return value;
  return value.replace(/:\/\/([^:]+):([^@]+)@/, "://$1:***@");
}

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }
    if (user.role !== "ADMIN") {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }

    const [users, submissions, progress, questions, firstUser, latestUser, latestSubmission] =
      await Promise.all([
        prisma.user.count(),
        prisma.submission.count(),
        prisma.userProgress.count(),
        prisma.question.count(),
        prisma.user.findFirst({
          orderBy: { createdAt: "asc" },
          select: { username: true, createdAt: true },
        }),
        prisma.user.findFirst({
          orderBy: { createdAt: "desc" },
          select: { username: true, createdAt: true },
        }),
        prisma.submission.findFirst({
          orderBy: { createdAt: "desc" },
          select: { id: true, createdAt: true, accepted: true },
        }),
      ]);

    const databaseUrl = sanitizeDatabaseUrl(process.env.DATABASE_URL);
    const usingRenderDisk = databaseUrl?.startsWith("file:/var/data/") ?? false;

    return NextResponse.json({
      bootId,
      bootedAt,
      now: new Date(),
      databaseUrl,
      usingRenderDisk,
      counts: {
        users,
        submissions,
        progress,
        questions,
      },
      firstUser,
      latestUser,
      latestSubmission,
      render: {
        serviceId: process.env.RENDER_SERVICE_ID ?? null,
        externalUrl: process.env.RENDER_EXTERNAL_URL ?? null,
      },
    });
  } catch (err) {
    await reportError("[GET /api/admin/db-health] error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
