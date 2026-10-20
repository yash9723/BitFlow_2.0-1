/** DELETE /api/problems/[slug]/discussion/[id] — remove your own comment (admins: any). */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-utils";

export const dynamic = "force-dynamic";

export async function DELETE(_request: Request, { params }: { params: { slug: string; id: string } }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const c = await prisma.comment.findUnique({ where: { id: params.id }, select: { userId: true, question: { select: { slug: true } } } });
  if (!c || c.question.slug !== params.slug) return NextResponse.json({ error: "Comment not found." }, { status: 404 });
  if (c.userId !== user.id && user.role !== "ADMIN") return NextResponse.json({ error: "You can only delete your own comments." }, { status: 403 });
  await prisma.comment.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
