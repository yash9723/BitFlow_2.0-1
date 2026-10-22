/**
 * /api/problems/[slug]/discussion — the editorial and comments (lib/discussion.ts).
 * GET:  { editorial, comments } for people who solved the problem (and admins).
 * POST: { body } adds a comment; rate-limited.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-utils";
import { rateLimit } from "@/lib/rate-limit";
import { commentProblem, discussionAccess } from "@/lib/discussion";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { slug: string } }) {
  const user = await getSessionUser();
  const access = await discussionAccess(params.slug, user);
  // Not solved yet (or signed out) is the normal state on every problem page, not a failed request:
  // answer 200 with only the reason, so browsers don't log an error. Nothing else is sent.
  if ("error" in access) {
    return access.status === 404
      ? NextResponse.json({ error: access.error }, { status: 404 })
      : NextResponse.json({ locked: access.error });
  }

  const comments = await prisma.comment.findMany({
    where:   { questionId: access.question.id, hidden: false },
    orderBy: { createdAt: "asc" },
    take:    500,
    select:  { id: true, body: true, createdAt: true, userId: true, user: { select: { username: true } },
               reportedBy: { where: { userId: user!.id }, select: { userId: true } } },
  });
  return NextResponse.json({
    editorial: access.question.editorial,
    comments:  comments.map((c) => ({
      id: c.id, body: c.body, createdAt: c.createdAt, username: c.user.username,
      mine: c.userId === user!.id, reported: c.reportedBy.length > 0,
    })),
  });
}

export async function POST(request: Request, { params }: { params: { slug: string } }) {
  const user = await getSessionUser();
  const access = await discussionAccess(params.slug, user);
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });

  // Checked before the rate limit, so fixing a typo doesn't use up the allowance.
  const body = (await request.json().catch(() => ({})))?.body;
  const problem = commentProblem(body);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  const { success } = await rateLimit(request, { limit: 5, windowMs: 10 * 60_000, prefix: "comment", key: `user:${user!.id}` });
  if (!success) return NextResponse.json({ error: "You're posting quickly. Please wait a few minutes." }, { status: 429 });

  const c = await prisma.comment.create({
    data:   { questionId: access.question.id, userId: user!.id, body: body.trim() },
    select: { id: true, body: true, createdAt: true },
  });
  return NextResponse.json({ comment: { ...c, username: user!.username, mine: true, reported: false } }, { status: 201 });
}
