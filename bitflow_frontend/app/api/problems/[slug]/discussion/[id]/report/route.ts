/**
 * POST /api/problems/[slug]/discussion/[id]/report — flag a comment for the
 * admins. One report per person; at HIDE_AFTER_REPORTS it is hidden until an
 * admin decides (Admin → Problems → Moderation).
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-utils";
import { discussionAccess, HIDE_AFTER_REPORTS } from "@/lib/discussion";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: { slug: string; id: string } }) {
  const user = await getSessionUser();
  const access = await discussionAccess(params.slug, user);
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });
  const c = await prisma.comment.findUnique({ where: { id: params.id }, select: { questionId: true, userId: true } });
  if (!c || c.questionId !== access.question.id) return NextResponse.json({ error: "Comment not found." }, { status: 404 });
  if (c.userId === user!.id) return NextResponse.json({ error: "You can't report your own comment." }, { status: 400 });

  const already = await prisma.commentReport.findUnique({ where: { commentId_userId: { commentId: params.id, userId: user!.id } } });
  if (!already) {
    await prisma.commentReport.create({ data: { commentId: params.id, userId: user!.id } });
    const { reports } = await prisma.comment.update({ where: { id: params.id }, data: { reports: { increment: 1 } }, select: { reports: true } });
    if (reports >= HIDE_AFTER_REPORTS) await prisma.comment.update({ where: { id: params.id }, data: { hidden: true } });
  }
  return NextResponse.json({ ok: true });
}
