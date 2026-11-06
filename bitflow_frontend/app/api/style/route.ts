/**
 * POST /api/style — Verible style lint and formatting (backend api/routes/style.py).
 *
 * Body: { action: "lint", files: [{ name, content }] } -> { ok, issues: [...] }
 *       { action: "format", source, name? }            -> { ok, formatted } | { ok: false, error }
 * Open to guests like /api/synthesize; rate-limited, since the editor calls it as people type.
 */

import { NextResponse } from "next/server";
import { styleOnBackend } from "@/lib/backend";
import { rateLimit } from "@/lib/rate-limit";
import { getSessionUser, signInRequired } from "@/lib/auth-utils";
import { reportError } from "@/lib/error-log";

export const dynamic = "force-dynamic";

const MAX_SOURCE_CHARS = 512 * 1024;
const MAX_FILES = 16;

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return signInRequired();
  const { success } = await rateLimit(request, {
    limit: 40, anonymousLimit: 120, windowMs: 60_000, prefix: "style",
    key: user ? `user:${user.id}` : undefined,
  });
  if (!success) return NextResponse.json({ error: "Too many requests. Please wait a moment." }, { status: 429 });

  const body = await request.json().catch(() => ({}));
  let payload: unknown;
  if (body?.action === "lint") {
    const files = Array.isArray(body.files) ? body.files : [];
    const ok = files.length > 0 && files.length <= MAX_FILES && files.every(
      (f: any) => typeof f?.name === "string" && typeof f?.content === "string" && f.content.length <= MAX_SOURCE_CHARS);
    if (!ok) return NextResponse.json({ error: `files: 1–${MAX_FILES} of { name, content } up to 512 KB each.` }, { status: 400 });
    payload = { files: files.map((f: any) => ({ name: f.name, content: f.content })) };
  } else if (body?.action === "format") {
    if (typeof body.source !== "string" || !body.source.trim() || body.source.length > MAX_SOURCE_CHARS) {
      return NextResponse.json({ error: "source is required (up to 512 KB)." }, { status: 400 });
    }
    payload = { source: body.source, name: typeof body.name === "string" ? body.name : "design.sv" };
  } else {
    return NextResponse.json({ error: 'action must be "lint" or "format".' }, { status: 400 });
  }

  try {
    const { status, data } = await styleOnBackend(body.action, payload);
    return NextResponse.json(data, { status });
  } catch (err) {
    await reportError("[style] backend unreachable:", err);
    return NextResponse.json({ error: "Style checker unavailable." }, { status: 502 });
  }
}
