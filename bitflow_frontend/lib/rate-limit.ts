/**
 * lib/rate-limit.ts
 *
 * Simple in-memory rate limiter for Next.js API routes.
 * Fixed window per client: a signed-in user's id when the caller passes `key`,
 * otherwise the client IP — but only when TRUST_PROXY=true (see clientId()).
 *
 * Usage:
 *   const { success } = await rateLimit(request, { limit: 10, windowMs: 60_000 });
 *   if (!success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// In-memory store — resets on server restart (fine for Render, not for serverless)
const store = new Map<string, RateLimitEntry>();

// Clean up stale entries every 5 minutes to avoid memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (entry.resetAt < now) store.delete(key);
  }
}, 5 * 60 * 1000);

export interface RateLimitOptions {
  /** Max requests allowed per window */
  limit: number;
  /** Window duration in ms (e.g. 60_000 = 1 minute) */
  windowMs: number;
  /** Optional key prefix to namespace different routes */
  prefix?: string;
  /** Who is being limited (e.g. `user:<id>`). Defaults to clientId(request). */
  key?: string;
  /** Limit for the shared bucket used when the client can't be identified. */
  anonymousLimit?: number;
}

/**
 * Client identity for rate limiting. X-Forwarded-For is set by the client
 * unless a trusted reverse proxy overwrites it (Caddy in the `https` compose
 * profile does), so it is only used when TRUST_PROXY=true — otherwise anyone
 * could dodge the limit by sending a fake header. Unidentified clients share
 * one "anonymous" bucket.
 */
export function clientId(request: Request): string {
  if (process.env.TRUST_PROXY === "true") {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim();
    if (ip) return `ip:${ip}`;
  }
  return "anonymous";
}

export function rateLimit(
  request: Request,
  options: RateLimitOptions
): { success: boolean; remaining: number; resetAt: number } {
  const { windowMs, prefix = "rl" } = options;
  const id    = options.key ?? clientId(request);
  const limit = id === "anonymous" ? (options.anonymousLimit ?? options.limit) : options.limit;
  const key   = `${prefix}:${id}`;

  const now = Date.now();
  const entry = store.get(key);

  if (!entry || entry.resetAt < now) {
    // First request in this window
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { success: true, remaining: limit - 1, resetAt: now + windowMs };
  }

  if (entry.count >= limit) {
    return { success: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count += 1;
  return { success: true, remaining: limit - entry.count, resetAt: entry.resetAt };
}
