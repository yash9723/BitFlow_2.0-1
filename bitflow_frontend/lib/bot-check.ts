/**
 * lib/bot-check.ts — cheap sign-up spam protection without a third-party CAPTCHA.
 *
 *   • Form token: GET /api/auth/register hands out `<ms>.<hmac>`; the POST must
 *     return it, at least MIN_MS after it was issued (people take seconds to fill
 *     a form, scripts take milliseconds) and within MAX_MS.
 *   • Honeypot: the form has a hidden "website" field; people leave it empty.
 *
 * Rate limits (lib/rate-limit.ts) cap whatever gets past this.
 * ponytail: a token can be reused until it expires; make it single-use (DB) if
 * scripted sign-ups that wait out MIN_MS ever show up.
 */

import crypto from "crypto";

const MIN_MS = 3_000;
const MAX_MS = 24 * 60 * 60 * 1000;

function sign(ts: string): string {
  return crypto.createHmac("sha256", process.env.JWT_SECRET ?? "").update(`signup:${ts}`).digest("base64url");
}

export function newFormToken(now = Date.now()): string {
  return `${now}.${sign(String(now))}`;
}

/** Why this sign-up looks automated, or null if it passes. */
export function botProblem(body: { website?: unknown; formToken?: unknown }, now = Date.now()): string | null {
  if (body.website) return "Registration failed.";
  const [ts = "", sig = ""] = String(body.formToken ?? "").split(".");
  const want = sign(ts);
  const valid = /^\d+$/.test(ts) && sig.length === want.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want));
  const age = now - Number(ts);
  if (!valid || age > MAX_MS) return "This sign-up form has expired. Reload the page and try again.";
  if (age < MIN_MS) return "That was quick! Wait a few seconds and try again.";
  return null;
}
