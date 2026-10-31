/**
 * /api/admin/announcements — write and manage announcements (Admin → Announcements).
 * GET:   every post, archived too
 * POST:  { title, body, kind, pinned? } publishes now
 * PATCH: { id, title?, body?, kind?, pinned?, archived? } — also stops the seed overwriting this post
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { adminDenied } from "@/lib/auth-utils";
import { auditAdmin } from "@/lib/privacy-server";
import { announcementProblem } from "@/lib/announcements";

export const dynamic = "force-dynamic";

export async function GET() {
  const denied = await adminDenied();
  if (denied) return denied;
  const posts = await prisma.announcement.findMany({ orderBy: { publishedAt: "desc" }, take: 200 });
  return NextResponse.json({ posts });
}

export async function POST(request: Request) {
  const denied = await adminDenied();
  if (denied) return denied;
  const body = await request.json().catch(() => ({}));
  const problem = announcementProblem(body);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  const post = await prisma.announcement.create({
    data: { title: body.title.trim(), body: body.body.trim(), kind: body.kind, pinned: body.pinned === true, adminEditedAt: new Date() },
  });
  await auditAdmin("admin.announcement.create", post.id, post.title.slice(0, 120));
  return NextResponse.json({ post }, { status: 201 });
}

export async function PATCH(request: Request) {
  const denied = await adminDenied();
  if (denied) return denied;
  const body = await request.json().catch(() => ({}));
  const existing = typeof body.id === "string" ? await prisma.announcement.findUnique({ where: { id: body.id } }) : null;
  if (!existing) return NextResponse.json({ error: "Post not found." }, { status: 404 });
  const title = body.title ?? existing.title, text = body.body ?? existing.body, kind = body.kind ?? existing.kind;
  const problem = announcementProblem({ title, body: text, kind });
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  const post = await prisma.announcement.update({
    where: { id: existing.id },
    data: {
      title: title.trim(), body: text.trim(), kind, adminEditedAt: new Date(),
      ...(typeof body.pinned === "boolean" ? { pinned: body.pinned } : {}),
      ...(typeof body.archived === "boolean" ? { archived: body.archived } : {}),
    },
  });
  await auditAdmin("admin.announcement.edit", post.id, post.title.slice(0, 120));
  return NextResponse.json({ post });
}
