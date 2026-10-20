/**
 * POST /api/errors — a browser-side crash caught by app/error.tsx or
 * app/global-error.tsx ({ location, message, stack }, see lib/client-error.ts).
 * Stored in the error log for the admin page. Rate-limited; always answers 204.
 */

import { reportError } from "@/lib/error-log";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const none = () => new Response(null, { status: 204 });

export async function POST(request: Request) {
  if (!(await rateLimit(request, { limit: 20, anonymousLimit: 300, windowMs: 60_000, prefix: "client-error" })).success) return none();
  let body: { location?: unknown; message?: unknown; stack?: unknown };
  try {
    body = JSON.parse(await request.text());   // sendBeacon posts text/plain
  } catch {
    return none();
  }
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
  const location = str(body?.location, 200);
  const message  = str(body?.message, 1000);
  if (!location.startsWith("/") || !message) return none();
  await reportError(location, message, { source: "client", stack: str(body?.stack, 4000) || undefined });
  return none();
}
