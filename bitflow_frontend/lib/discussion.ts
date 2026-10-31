/**
 * lib/discussion.ts — a problem's editorial and comments, open to people who
 * solved it (and admins), so they never spoil it. Comments are plain text,
 * rendered as text (never HTML); a comment reported by 3 people is hidden
 * until an admin looks at it (Admin → Problems → Moderation).
 * Routes: app/api/problems/[slug]/discussion/**, app/api/admin/comments.
 */
import { prisma } from "@/lib/prisma";
import { closedByMock } from "@/lib/interview-server";

export const MAX_COMMENT_CHARS = 2000;
export const HIDE_AFTER_REPORTS = 3;

/** The question if the user may read and post in its discussion, else why not. */
export async function discussionAccess(slug: string, user: { id: string; role: string } | null) {
  const question = await prisma.question.findUnique({ where: { slug }, select: { id: true, title: true, editorial: true } });
  if (!question) return { error: "Problem not found.", status: 404 } as const;
  if (!user) return { error: "Sign in and solve this problem to join its discussion.", status: 401 } as const;
  if (await closedByMock(user.id, slug)) return { error: "The editorial and discussion are closed during your mock interview.", status: 403 } as const;
  if (user.role !== "ADMIN") {
    const progress = await prisma.userProgress.findUnique({
      where: { userId_problemId: { userId: user.id, problemId: question.id } }, select: { solved: true },
    });
    if (!progress?.solved) return { error: "Solve this problem to read its editorial and discussion.", status: 403 } as const;
  }
  return { question } as const;
}

/** Why this comment text can't be posted, or null. */
export function commentProblem(body: unknown): string | null {
  if (typeof body !== "string" || !body.trim()) return "Write something first.";
  if (body.trim().length > MAX_COMMENT_CHARS) return `Keep it under ${MAX_COMMENT_CHARS} characters.`;
  return null;
}
