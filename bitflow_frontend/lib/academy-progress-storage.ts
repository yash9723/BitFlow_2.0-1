/**
 * lib/academy-progress-storage.ts — Academy-specific progress (localStorage)
 *
 * Separate from problem arena progress-storage.ts — do not modify that file.
 */

import type { AcademyProgress } from "./academy-types";

const STORAGE_KEY = "bitflow_academy_progress_v1";

/** A quiz is passed at 80% or better (the server checks the same: lib/lessons.ts). */
export const quizPassed = (score: number, total: number) => total > 0 && score * 5 >= total * 4;

const DEFAULT_PROGRESS: AcademyProgress = {
  completedTopics: [],
  quizScores:      {},
};

export function loadAcademyProgress(): AcademyProgress {
  if (typeof window === "undefined") return DEFAULT_PROGRESS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PROGRESS;
    const parsed = JSON.parse(raw) as AcademyProgress;
    return {
      completedTopics: parsed.completedTopics ?? [],
      quizScores:      parsed.quizScores ?? {},
      lastVisited:     parsed.lastVisited,
    };
  } catch {
    return DEFAULT_PROGRESS;
  }
}

export function saveAcademyProgress(progress: AcademyProgress): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // Quota exceeded or private browsing — silently ignore
  }
}

export function markTopicVisited(slug: string): void {
  const p = loadAcademyProgress();
  saveAcademyProgress({ ...p, lastVisited: slug });
}

export function markTopicCompleted(slug: string, quizScore?: number): void {
  const p = loadAcademyProgress();
  const completed = p.completedTopics.includes(slug)
    ? p.completedTopics
    : [...p.completedTopics, slug];
  const quizScores =
    quizScore !== undefined
      ? { ...p.quizScores, [slug]: quizScore }
      : p.quizScores;
  saveAcademyProgress({ ...p, completedTopics: completed, quizScores });
}
