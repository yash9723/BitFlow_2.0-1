/**
 * lib/lesson-sync.ts — keeps the browser's Lab and Academy progress (lib/lab/progress.ts,
 * lib/academy-progress-storage.ts) and the account's (app/api/progress/lessons) in step.
 *
 * Signed in: what is finished here but not on the account is sent up (it may be guest work),
 * and what the account has comes down. On a shared computer the next person must not inherit
 * the last one's progress, so local progress is cleared when a different account signs in.
 * Guests keep working in localStorage only; reportLesson quietly does nothing for them.
 */
import { doneLessons, clearLabProgress, setDoneLessons } from "@/lib/lab/progress";
import { loadAcademyProgress, saveAcademyProgress } from "@/lib/academy-progress-storage";

export const LESSONS_SYNCED = "bitflow:lessons-synced";
const OWNER = "bitflow_progress_owner";

interface Item { kind: "lab" | "academy"; slug: string; done?: boolean; quizScore?: number; draft?: string | null; hwBoard?: string }
interface Row { kind: string; slug: string; done: boolean; quizScore: number | null }

/** Send progress to the account. Returns the XP it earned (0 for a guest or on failure). */
export async function reportLesson(...items: Item[]): Promise<number> {
  try {
    const res = await fetch("/api/progress/lessons", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items }) });
    return res.ok ? ((await res.json()).xpAwarded ?? 0) : 0;
  } catch { return 0; }
}

/** A lesson's draft saved on the account, or null. */
export async function fetchDraft(kind: Item["kind"], slug: string): Promise<string | null> {
  try {
    const res = await fetch(`/api/progress/lessons?kind=${kind}&slug=${encodeURIComponent(slug)}`);
    return res.ok ? ((await res.json()).draft ?? null) : null;
  } catch { return null; }
}

/** The real board this Lab lesson was verified on, or null. */
export async function fetchHwBoard(slug: string): Promise<string | null> {
  try {
    const res = await fetch(`/api/progress/lessons?kind=lab&slug=${encodeURIComponent(slug)}`);
    return res.ok ? ((await res.json()).hwBoard ?? null) : null;
  } catch { return null; }
}

export async function syncLessons(userId: string): Promise<void> {
  try {
    const owner = localStorage.getItem(OWNER);
    if (owner && owner !== userId) {
      clearLabProgress();
      saveAcademyProgress({ completedTopics: [], quizScores: {} });
    }
    localStorage.setItem(OWNER, userId);
  } catch { /* storage blocked: the account is still the source of truth below */ }

  const res = await fetch("/api/progress/lessons").catch(() => null);
  if (!res?.ok) return;
  const rows: Row[] = (await res.json()).lessons ?? [];
  const has = (kind: string, slug: string) => rows.some((r) => r.kind === kind && r.slug === slug && r.done);

  const academy = loadAcademyProgress();
  const up: Item[] = [
    ...doneLessons().filter((slug) => !has("lab", slug)).map((slug): Item => ({ kind: "lab", slug, done: true })),
    ...academy.completedTopics.filter((slug) => !has("academy", slug))
      .map((slug): Item => ({ kind: "academy", slug, done: true, quizScore: academy.quizScores[slug] ?? 0 })),
  ];
  // Slugs that no longer exist (a renamed lesson) would fail a whole batch, so send them one by one.
  for (const item of up) await reportLesson(item);

  setDoneLessons([...new Set([...doneLessons(), ...rows.filter((r) => r.kind === "lab" && r.done).map((r) => r.slug)])]);
  const fromAccount = rows.filter((r) => r.kind === "academy");
  saveAcademyProgress({
    ...academy,
    completedTopics: [...new Set([...academy.completedTopics, ...fromAccount.filter((r) => r.done).map((r) => r.slug)])],
    quizScores: {
      ...academy.quizScores,
      ...Object.fromEntries(fromAccount.filter((r) => r.quizScore != null).map((r) => [r.slug, Math.max(r.quizScore!, academy.quizScores[r.slug] ?? 0)])),
    },
  });
  window.dispatchEvent(new Event(LESSONS_SYNCED));
}
