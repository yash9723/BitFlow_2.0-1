/**
 * POST /api/share { title?, designCode, testbenchCode, files? } — save a Sandbox design
 * as a read-only link, /s/<id>. Signed-in users only; anyone with the link can
 * view and fork it. Sandbox code only: graded-problem solutions are never shared here.
 */

import crypto from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-utils";
import { rateLimit } from "@/lib/rate-limit";
import { fileNameProblem, type ProjectFile } from "@/lib/project-files";

export const dynamic = "force-dynamic";

const MAX_SOURCE_CHARS = 128 * 1024;    // per file
const MAX_FILES = 12;                   // extra design files
const ID_CHARS = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";   // no 0/O, 1/l/I

const newId = () => Array.from(crypto.randomBytes(10), (b) => ID_CHARS[b % ID_CHARS.length]).join("");

/** "module counter (" → "counter", for links shared without a title. */
const firstModule = (code: string) => code.match(/\bmodule\s+([A-Za-z_]\w*)/)?.[1];

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in to share designs." }, { status: 401 });

  const { success } = await rateLimit(request, { limit: 10, windowMs: 60_000, prefix: "share", key: `user:${user.id}` });
  if (!success) return NextResponse.json({ error: "Too many share links. Please wait a moment." }, { status: 429 });

  const body = await request.json().catch(() => ({}));
  const { designCode, testbenchCode } = body ?? {};
  if (typeof designCode !== "string" || !designCode.trim() || typeof testbenchCode !== "string") {
    return NextResponse.json({ error: "designCode and testbenchCode are required." }, { status: 400 });
  }
  if (designCode.length > MAX_SOURCE_CHARS || testbenchCode.length > MAX_SOURCE_CHARS) {
    return NextResponse.json({ error: "Each file must be under 128 KB to share." }, { status: 413 });
  }
  // Extra design files: the same names the Sandbox allows, each under the size limit.
  const files: ProjectFile[] = [];
  for (const f of Array.isArray(body.files) ? body.files : []) {
    if (typeof f?.name !== "string" || typeof f?.content !== "string" || f.content.length > MAX_SOURCE_CHARS || fileNameProblem(f.name, files)) {
      return NextResponse.json({ error: "One of the extra files has an invalid name or is over 128 KB." }, { status: 400 });
    }
    files.push({ name: f.name, content: f.content });
  }
  if (files.length > MAX_FILES) return NextResponse.json({ error: `At most ${MAX_FILES} extra files can be shared.` }, { status: 413 });

  const title = (typeof body.title === "string" && body.title.trim() ? body.title.trim() : firstModule(designCode) ?? "Untitled design").slice(0, 80);

  const shared = await prisma.sharedDesign.create({
    data: { id: newId(), ownerId: user.id, title, designCode, testbenchCode, files: files.length ? JSON.stringify(files) : null },
    select: { id: true },
  });
  return NextResponse.json({ id: shared.id, url: `/s/${shared.id}` }, { status: 201 });
}
