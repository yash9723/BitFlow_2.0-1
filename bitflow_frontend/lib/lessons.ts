/**
 * lib/lessons.ts — Board Lab lessons and Academy chapters as one list of things a learner can
 * finish: their slugs, titles, XP, and the "lab:blink" keys class assignments store next to
 * problem slugs (a problem slug never contains a colon).
 * Self-check: scripts/lessons.check.ts.
 */
import { LESSONS } from "@/lib/lab/lessons";
import { ACADEMY_TOPICS } from "@/lib/academy-content";
import { quizPassed } from "@/lib/academy-progress-storage";

export type LessonKind = "lab" | "academy";
export const LESSON_XP: Record<LessonKind, number> = { lab: 20, academy: 15 };
export const LESSON_LEVEL: Record<LessonKind, string> = { lab: "Board Lab", academy: "Academy" };
export const MAX_DRAFT_CHARS = 64_000;

export const lessonSlugs = (kind: LessonKind): string[] =>
  kind === "lab" ? LESSONS.map((l) => l.slug) : ACADEMY_TOPICS.map((t) => t.slug);

export function lessonTitle(kind: LessonKind, slug: string): string | null {
  const found = kind === "lab" ? LESSONS.find((l) => l.slug === slug) : ACADEMY_TOPICS.find((t) => t.slug === slug);
  return found?.title ?? null;
}

export const lessonHref = (kind: LessonKind, slug: string) => (kind === "lab" ? `/lab/${slug}` : `/academy/${slug}`);
export const lessonKey = (kind: LessonKind, slug: string) => `${kind}:${slug}`;

/** The lesson behind a "lab:blink" key, or null when it isn't a key of a real lesson. */
export function parseLessonKey(key: string): { kind: LessonKind; slug: string; title: string } | null {
  const [kind, slug, ...rest] = key.split(":");
  if ((kind !== "lab" && kind !== "academy") || !slug || rest.length) return null;
  const title = lessonTitle(kind, slug);
  return title ? { kind, slug, title } : null;
}

export interface LessonItem { kind: LessonKind; slug: string; done?: boolean; quizScore?: number; draft?: string | null }

/** Why a client-sent item can't be stored, or null. */
export function lessonProblem(item: unknown): string | null {
  const i = item as Partial<LessonItem> | null;
  if (!i || (i.kind !== "lab" && i.kind !== "academy")) return "Unknown lesson kind.";
  if (typeof i.slug !== "string" || !lessonTitle(i.kind, i.slug)) return "Unknown lesson.";
  if (i.quizScore !== undefined && (!Number.isInteger(i.quizScore) || i.quizScore < 0 || i.quizScore > 1000)) return "Bad quiz score.";
  if (i.draft !== undefined && i.draft !== null && (typeof i.draft !== "string" || i.draft.length > MAX_DRAFT_CHARS)) return "Draft too large.";
  return null;
}

/** An Academy chapter counts as finished only with a passing quiz; a Lab lesson when its goals pass. */
export function counts(kind: LessonKind, slug: string, bestQuizScore: number | null | undefined): boolean {
  if (kind === "lab") return true;
  const total = ACADEMY_TOPICS.find((t) => t.slug === slug)?.quiz.length ?? 0;
  return total > 0 && bestQuizScore != null && quizPassed(bestQuizScore, total);
}
