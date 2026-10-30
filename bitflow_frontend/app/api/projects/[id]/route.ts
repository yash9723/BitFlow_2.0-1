/**
 * GET    /api/projects/[id] — one of your projects, with its files.
 * PATCH  /api/projects/[id] { name?, designCode?, ..., message? } — rename, and/or save new content:
 *        an autosave within a couple of minutes updates the newest version, otherwise (or with a
 *        message) it adds one; the newest MAX_VERSIONS are kept (lib/projects.ts).
 * DELETE /api/projects/[id] — delete it and its history.
 * Other users' projects are 404, so ids can't be probed.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-utils";
import { rateLimit } from "@/lib/rate-limit";
import { MAX_VERSIONS, contentOf, projectContent, projectName, versionAction } from "@/lib/projects";
import { parseCircuit } from "@/lib/studio/circuit-json";

export const dynamic = "force-dynamic";

const notFound = () => NextResponse.json({ error: "Project not found." }, { status: 404 });
const parse = (json: string | null, fallback: unknown) => { try { return json ? JSON.parse(json) : fallback; } catch { return fallback; } };

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Sign in to open projects." }, { status: 401 });
  const p = await prisma.project.findFirst({ where: { id: params.id, ownerId: me.id } });
  if (!p) return notFound();
  const { ownerId: _owner, files, pins, ...rest } = p;
  return NextResponse.json({ project: { ...rest, files: parse(files, []), pins: parse(pins, {}) } });
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Sign in to save projects." }, { status: 401 });
  const { success } = await rateLimit(request, { limit: 90, windowMs: 60_000, prefix: "project-save", key: `user:${me.id}` });
  if (!success) return NextResponse.json({ error: "Saving too often. Please wait a moment." }, { status: 429 });

  const project = await prisma.project.findFirst({ where: { id: params.id, ownerId: me.id }, select: { id: true, kind: true } });
  if (!project) return notFound();
  const body = await request.json().catch(() => ({}));
  const rename = typeof body.name === "string" && body.name.trim() ? { name: projectName(body.name, "") } : {};

  if (body.designCode === undefined) {   // rename only
    if (!rename.name) return NextResponse.json({ error: "Nothing to save." }, { status: 400 });
    const p = await prisma.project.update({ where: { id: project.id }, data: rename, select: { id: true, name: true, updatedAt: true } });
    return NextResponse.json({ project: p, version: "none" });
  }

  const checked = projectContent(body);
  if ("error" in checked) return NextResponse.json({ error: checked.error }, { status: checked.status });
  if (project.kind === "circuit") {
    const problem = parseCircuit(checked.content.designCode);
    if (typeof problem === "string") return NextResponse.json({ error: problem }, { status: 400 });
  }
  const message = typeof body.message === "string" && body.message.trim() ? body.message.trim().slice(0, 120) : null;
  const latest = await prisma.projectVersion.findFirst({ where: { projectId: project.id }, orderBy: { createdAt: "desc" } });
  const action = versionAction(latest ? { ...contentOf(latest), createdAt: latest.createdAt, message: latest.message } : null, checked.content, message);

  const [p] = await prisma.$transaction([
    prisma.project.update({ where: { id: project.id }, data: { ...checked.content, ...rename }, select: { id: true, name: true, updatedAt: true } }),
    ...(action === "update" && latest ? [prisma.projectVersion.update({ where: { id: latest.id }, data: { ...checked.content, ...(message ? { message } : {}) } })] : []),
    ...(action === "create" ? [prisma.projectVersion.create({ data: { projectId: project.id, ...checked.content, message } })] : []),
  ]);
  if (action === "create") {
    const old = await prisma.projectVersion.findMany({ where: { projectId: project.id }, orderBy: { createdAt: "desc" }, skip: MAX_VERSIONS, select: { id: true } });
    if (old.length) await prisma.projectVersion.deleteMany({ where: { id: { in: old.map((v) => v.id) } } });
  }
  return NextResponse.json({ project: p, version: action });
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Sign in to delete projects." }, { status: 401 });
  const { count } = await prisma.project.deleteMany({ where: { id: params.id, ownerId: me.id } });
  return count ? NextResponse.json({ ok: true }) : notFound();
}
