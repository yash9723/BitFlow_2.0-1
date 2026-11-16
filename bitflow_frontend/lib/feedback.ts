/**
 * lib/feedback.ts — the shape of user feedback (POST /api/feedback) and its validation, shared by the
 * API route and the browser components (components/feedback/*). No server-only imports here.
 *
 *   survey   the new-user popup: an overall rating 1–5 and an optional comment
 *   general  the site-wide Feedback button: a category (bug / idea / other) and a message
 *   helpful  "Was this helpful?" on articles and Academy chapters: helpful true/false, optional comment
 *   problem  "Report an issue" on a practice problem: a category and a message, target = the problem slug
 */

export const FEEDBACK_KINDS = ["survey", "general", "helpful", "problem"] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];

export const CATEGORIES: Record<"general" | "problem", { value: string; label: string }[]> = {
  general: [
    { value: "bug", label: "Something is broken" },
    { value: "idea", label: "An idea or request" },
    { value: "other", label: "Something else" },
  ],
  problem: [
    { value: "wrong-tests", label: "The tests look wrong" },
    { value: "unclear", label: "The statement is unclear" },
    { value: "typo", label: "Typo or formatting" },
    { value: "other", label: "Something else" },
  ],
};

export const MAX_MESSAGE = 2000;

export interface FeedbackInput {
  kind: FeedbackKind;
  rating: number | null;
  helpful: boolean | null;
  category: string | null;
  message: string | null;
  path: string;
  target: string | null;
}

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Check a request body. Returns the clean record, or an error message for the user. */
export function validateFeedback(body: Record<string, unknown>): { ok: true; data: FeedbackInput } | { ok: false; error: string } {
  const kind = body.kind as FeedbackKind;
  if (!FEEDBACK_KINDS.includes(kind)) return { ok: false, error: "Unknown feedback type." };

  const path = text(body.path);
  if (!path.startsWith("/") || path.length > 300) return { ok: false, error: "Invalid page." };
  const target = text(body.target) || null;
  if (target && (target.length > 200 || !/^[\w-]+$/.test(target))) return { ok: false, error: "Invalid page." };

  const message = text(body.message) || null;
  if (message && message.length > MAX_MESSAGE) return { ok: false, error: `Please keep it under ${MAX_MESSAGE} characters.` };

  let rating: number | null = null, helpful: boolean | null = null, category: string | null = null;
  if (kind === "survey") {
    rating = Number(body.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return { ok: false, error: "Please choose a rating from 1 to 5." };
  } else if (kind === "helpful") {
    if (typeof body.helpful !== "boolean") return { ok: false, error: "Invalid vote." };
    helpful = body.helpful;
    if (!target) return { ok: false, error: "Invalid page." };
  } else {
    category = text(body.category);
    if (!CATEGORIES[kind].some((c) => c.value === category)) return { ok: false, error: "Please choose what it's about." };
    if (!message || message.length < 5) return { ok: false, error: "Please tell us a little more (at least 5 characters)." };
    if (kind === "problem" && !target) return { ok: false, error: "Invalid problem." };
  }
  return { ok: true, data: { kind, rating, helpful, category, message, path, target } };
}

/** Browser: send feedback. Resolves to null on success, or an error message to show. */
export async function sendFeedback(input: Partial<FeedbackInput> & { kind: FeedbackKind; website?: string }): Promise<string | null> {
  try {
    const r = await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: window.location.pathname, ...input }),
    });
    if (r.ok) return null;
    const j = await r.json().catch(() => ({}));
    return typeof j.error === "string" ? j.error : `Couldn't send it (HTTP ${r.status}).`;
  } catch {
    return "Couldn't send it. Check your connection and try again.";
  }
}
