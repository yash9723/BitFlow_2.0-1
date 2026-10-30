/**
 * lib/lesson-progress.ts — store Lab and Academy progress on the account (LessonProgress) and
 * award XP once per lesson. Server-side only.
 *
 * ponytail: Lab goals and Academy quizzes run in the browser, so a determined user could report
 * them without doing them. XP is bounded (first completions only, a fixed list of lessons) and
 * lesson certificates say they are self-checked; re-run the goals on the server if that matters.
 */
import { prisma } from "@/lib/prisma";
import { LESSON_XP, counts, type LessonItem } from "@/lib/lessons";

/** Upsert the items; returns the XP this call awarded. Items must have passed lessonProblem(). */
export async function recordLessons(userId: string, items: LessonItem[]): Promise<number> {
  let awarded = 0;
  for (const { kind, slug, done, quizScore, draft } of items) {
    const key = { userId_kind_slug: { userId, kind, slug } };
    const before = await prisma.lessonProgress.findUnique({ where: key, select: { quizScore: true } });
    const best = quizScore === undefined ? before?.quizScore ?? null : Math.max(quizScore, before?.quizScore ?? 0);
    const row = await prisma.lessonProgress.upsert({
      where:  key,
      create: { userId, kind, slug, quizScore: best, draft: draft ?? null },
      update: { quizScore: best, ...(draft !== undefined ? { draft } : {}) },
      select: { id: true },
    });
    if (!done || !counts(kind, slug, best)) continue;

    // Only the request that flips done from false gets the XP, however many arrive at once.
    const xp = LESSON_XP[kind];
    const { count } = await prisma.lessonProgress.updateMany({
      where: { id: row.id, done: false },
      data:  { done: true, completedAt: new Date(), xpAwarded: xp },
    });
    if (count === 1) {
      await prisma.userXp.upsert({
        where:  { userId },
        create: { userId, totalXp: xp, unlockedModules: JSON.stringify(["mod_logic_gates", "mod_arithmetic"]) },
        update: { totalXp: { increment: xp } },
      });
      awarded += xp;
    }
  }
  return awarded;
}
