/**
 * lib/rate-limit.ts
 *
 * Fixed-window rate limiter for Next.js API routes, shared by every server
 * instance: the counters live in the database (RateLimit table), because
 * serverless functions (Vercel) don't share memory. Per client: a signed-in
 * user's id when the caller passes `key`, otherwise the client IP — but only
 * when TRUST_PROXY=true (see clientId()).
 *
 * If the database is unreachable the limiter falls back to this instance's
 * memory rather than failing every request.
 *
 * Usage:
 *   const { success } = await rateLimit(request, { limit: 10, windowMs: 60_000 });
 *   if (!success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
 */

import { prisma } from "@/lib/prisma";

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

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  resetAt: number;
}

/**
 * Client identity for rate limiting. X-Forwarded-For is set by the client
 * unless a trusted reverse proxy overwrites it (Caddy in the `https` compose
 * profile and Vercel both do), so it is only used when TRUST_PROXY=true —
 * otherwise anyone could dodge the limit by sending a fake header.
 * Unidentified clients share one "anonymous" bucket.
 */
export function clientId(request: Request): string {
  if (process.env.TRUST_PROXY === "true") {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim();
    if (ip) return `ip:${ip}`;
  }
  return "anonymous";
}

export async function rateLimit(request: Request, options: RateLimitOptions): Promise<RateLimitResult> {
  const { windowMs, prefix = "rl" } = options;
  const id    = options.key ?? clientId(request);
  const limit = id === "anonymous" ? (options.anonymousLimit ?? options.limit) : options.limit;
  const key   = `${prefix}:${id}`;

  try {
    const { count, resetAt } = await hit(key, windowMs);
    return { success: count <= limit, remaining: Math.max(0, limit - count), resetAt };
  } catch (err) {
    console.error("[rate-limit] database unavailable, using memory:", err);
    return memoryHit(key, limit, windowMs);
  }
}

/** Count one request against `key`; starts a new window when the old one has ended. */
async function hit(key: string, windowMs: number): Promise<{ count: number; resetAt: number }> {
  const now = new Date();
  const freshWindow = () => new Date(now.getTime() + windowMs);
  let row;
  try {
    row = await prisma.rateLimit.upsert({
      where:  { key },
      create: { key, count: 1, resetAt: freshWindow() },
      update: { count: { increment: 1 } },
    });
  } catch {
    // Two first requests raced to create the row; the loser just increments.
    row = await prisma.rateLimit.update({ where: { key }, data: { count: { increment: 1 } } });
  }
  if (row.resetAt <= now) {
    // ponytail: concurrent resets can each start the window at 1 (slightly lenient), fine for abuse limits.
    row = await prisma.rateLimit.update({ where: { key }, data: { count: 1, resetAt: freshWindow() } });
  }
  // Occasionally drop counters whose window ended over an hour ago.
  if (Math.random() < 0.01) {
    prisma.rateLimit.deleteMany({ where: { resetAt: { lt: new Date(now.getTime() - 3_600_000) } } }).catch(() => {});
  }
  return { count: row.count, resetAt: row.resetAt.getTime() };
}

// ── In-memory fallback (database down) ───────────────────────────────────────

const memory = new Map<string, { count: number; resetAt: number }>();

function memoryHit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const entry = memory.get(key);
  if (!entry || entry.resetAt < now) {
    if (memory.size > 10_000) memory.clear();   // bound memory without a timer
    memory.set(key, { count: 1, resetAt: now + windowMs });
    return { success: true, remaining: limit - 1, resetAt: now + windowMs };
  }
  entry.count += 1;
  return { success: entry.count <= limit, remaining: Math.max(0, limit - entry.count), resetAt: entry.resetAt };
}
