/**
 * /api/admin/comments — moderation (lib/discussion.ts).
 * GET ?filter=reported|hidden|recent: comments with their problem and author.
 * PATCH { id, hidden }: hide or restore a comment (restoring clears its reports).
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { adminDenied } from "@/lib/auth-utils";
import { problemHref } from "@/lib/problem-href";
import { auditAdmin } from "@/lib/privacy-server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = await adminDenied();
  if (denied) return denied;
  const filter = new URL(request.url).searchParams.get("filter") ?? "reported";
  const where = filter === "hidden" ? { hidden: true } : filter === "recent" ? {} : { reports: { gt: 0 } };
  const rows = await prisma.comment.findMany({
    where, take: 100,
    orderBy: filter === "reported" ? [{ reports: "desc" }, { createdAt: "desc" }] : { createdAt: "desc" },
    select: { id: true, body: true, hidden: true, reports: true, createdAt: true, user: { select: { username: true } },
              question: { select: { slug: true, title: true, learningLevel: true, category: true } } },
  });
  return NextResponse.json({
    comments: rows.map(({ question, user, ...c }) => ({ ...c, username: user.username, problem: question.title, href: problemHref(question) })),
  });
}

export async function PATCH(request: Request) {
  const denied = await adminDenied();
  if (denied) return denied;
  const { id, hidden } = (await request.json().catch(() => ({}))) ?? {};
  if (typeof id !== "string" || typeof hidden !== "boolean") return NextResponse.json({ error: "id and hidden are required." }, { status: 400 });
  const found = await prisma.comment.findUnique({ where: { id }, select: { id: true } });
  if (!found) return NextResponse.json({ error: "Comment not found." }, { status: 404 });
  if (hidden) await prisma.comment.update({ where: { id }, data: { hidden: true } });
  else await prisma.$transaction([
    prisma.commentReport.deleteMany({ where: { commentId: id } }),
    prisma.comment.update({ where: { id }, data: { hidden: false, reports: 0 } }),
  ]);
  await auditAdmin("admin.comment.moderate", id, hidden ? "hidden" : "restored");
  return NextResponse.json({ ok: true });
}
