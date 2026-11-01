/**
 * lib/signup-source.ts — the campaign tag an account signed up through (User.signupSource):
 * `?ref=` or `utm_source` on the first visit (components/RefCapture.tsx). Shared by the
 * browser and app/api/auth/register. Self-check: scripts/class-marks.check.ts.
 */

export const REF_STORAGE_KEY = "bitflow:ref";

/** A tag is 1-40 of a-z, 0-9, "-" and "_" (lower-cased); anything else is dropped. */
export function normalizeRef(value: unknown): string {
  if (typeof value !== "string") return "";
  const tag = value.trim().toLowerCase();
  return /^[a-z0-9][a-z0-9_-]{0,39}$/.test(tag) ? tag : "";
}
