/**
 * lib/lab/progress.ts — Board Lab progress and drafts, in this browser only (localStorage),
 * like the Academy's (lib/academy-progress-storage.ts).
 *   bitflow_lab_progress_v1  → ["blink", ...]  slugs of finished lessons
 *   bitflow_lab_code:<slug>  → the lesson's Verilog as last edited
 */
const DONE = "bitflow_lab_progress_v1";
const code = (slug: string) => `bitflow_lab_code:${slug}`;

const read = (key: string) => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key: string, value: string | null) => {
  try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch { /* private mode, quota */ }
};

export function doneLessons(): string[] {
  try { const v = JSON.parse(read(DONE) ?? "[]"); return Array.isArray(v) ? v.filter((s) => typeof s === "string") : []; } catch { return []; }
}
export function markDone(slug: string) {
  const done = doneLessons();
  if (!done.includes(slug)) write(DONE, JSON.stringify([...done, slug]));
}
export const loadDraft = (slug: string) => read(code(slug));
export const saveDraft = (slug: string, text: string | null) => write(code(slug), text);
