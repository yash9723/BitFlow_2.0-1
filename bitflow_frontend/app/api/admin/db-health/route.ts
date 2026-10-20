import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { adminDenied } from "@/lib/auth-utils";
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
    const denied = await adminDenied();
    if (denied) return denied;

    const [users, submissions, progress, questions, latestUser, latestSubmission] =
      await Promise.all([
        prisma.user.count(),
        prisma.submission.count(),
        prisma.userProgress.count(),
        prisma.question.count(),
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
    const provider = databaseUrl?.startsWith("file:") ? "sqlite" : databaseUrl ? "postgres" : "unknown";
    const t0 = Date.now();
    await prisma.user.findFirst({ select: { id: true } });    // one round trip, for the latency figure

    return NextResponse.json({
      bootId,
      bootedAt,
      now: new Date(),
      databaseUrl,
      provider,
      latencyMs: Date.now() - t0,
      counts: {
        users,
        submissions,
        progress,
        questions,
      },
      latestUser,
      latestSubmission,
    });
  } catch (err) {
    await reportError("[GET /api/admin/db-health] error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
