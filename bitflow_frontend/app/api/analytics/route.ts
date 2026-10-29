/**
 * POST /api/analytics — one page view from components/PageViewTracker.tsx
 * (a sendBeacon with {path, referrer}). Cookieless and anonymous: it only bumps
 * the PageView counter for (UTC day, path, referring host). Nothing about the
 * visitor is stored. Always answers 204 so the beacon never errors.
 */

import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { getSessionUser } from "@/lib/auth-utils";
import { isMinor } from "@/lib/privacy";

export const dynamic = "force-dynamic";

const BOT_UA = /bot|crawl|spider|slurp|headless|lighthouse|preview/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const none = () => new Response(null, { status: 204 });

/** "/s/Ab3x…" → "/s/:id", uuids → ":id"; null for paths we don't count. */
function normalizePath(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.startsWith("/") || raw.length > 300) return null;
  const path = raw.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  if (/^\/(api|admin)(\/|$)/.test(path)) return null;
  const segs = path.split("/").map((s, i, all) => (UUID.test(s) || (i === 2 && all[1] === "s") ? ":id" : s));
  return segs.join("/").slice(0, 200);
}

function referrerHost(raw: unknown, ownHost: string | null): string {
  try {
    const host = new URL(String(raw)).hostname.replace(/^www\./, "");
    return host && host !== ownHost?.split(":")[0].replace(/^www\./, "") ? host.slice(0, 100) : "";
  } catch {
    return "";
  }
}

export async function POST(request: Request) {
  const h = request.headers;
  if (h.get("dnt") === "1" || h.get("sec-gpc") === "1" || BOT_UA.test(h.get("user-agent") ?? "")) return none();
  // No tracking of children (DPDP s.9(3)), not even this anonymous counter.
  if (isMinor(await getSessionUser().catch(() => null))) return none();
  if (!(await rateLimit(request, { limit: 120, anonymousLimit: 2000, windowMs: 60_000, prefix: "pageview" })).success) return none();

  let body: { path?: unknown; referrer?: unknown };
  try {
    body = JSON.parse(await request.text());   // sendBeacon posts text/plain
  } catch {
    return none();
  }
  const path = normalizePath(body?.path);
  if (!path) return none();

  const key = { day: new Date().toISOString().slice(0, 10), path, referrer: referrerHost(body.referrer, h.get("host")) };
  try {
    await prisma.pageView.upsert({ where: { day_path_referrer: key }, create: { ...key, count: 1 }, update: { count: { increment: 1 } } });
  } catch {
    // Two first views of a page racing to create the row: the loser just increments.
    await prisma.pageView.update({ where: { day_path_referrer: key }, data: { count: { increment: 1 } } }).catch(() => {});
  }
  return none();
}
