/**
 * GET  /api/projects — your saved Sandbox projects, most recently changed first.
 * POST /api/projects { name?, designCode, testbenchCode, files?, designLanguage?, testbenchLanguage?, pins? }
 *   — save the Sandbox as a new project, with its first version. Signed-in users only.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-utils";
import { rateLimit } from "@/lib/rate-limit";
import { MAX_PROJECTS, projectContent, projectName } from "@/lib/projects";

export const dynamic = "force-dynamic";

export async function GET() {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Sign in to see your projects." }, { status: 401 });
  const projects = await prisma.project.findMany({
    where: { ownerId: me.id }, orderBy: { updatedAt: "desc" }, take: MAX_PROJECTS,
    select: { id: true, name: true, designLanguage: true, updatedAt: true, _count: { select: { versions: true } } },
  });
  return NextResponse.json({
    projects: projects.map(({ _count, ...p }) => ({ ...p, versions: _count.versions })),
    max: MAX_PROJECTS,
  });
}

export async function POST(request: Request) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Sign in to save projects." }, { status: 401 });
  const { success } = await rateLimit(request, { limit: 20, windowMs: 60_000, prefix: "project-new", key: `user:${me.id}` });
  if (!success) return NextResponse.json({ error: "Too many new projects. Please wait a moment." }, { status: 429 });

  const body = await request.json().catch(() => ({}));
  const checked = projectContent(body);
  if ("error" in checked) return NextResponse.json({ error: checked.error }, { status: checked.status });
  if (await prisma.project.count({ where: { ownerId: me.id } }) >= MAX_PROJECTS) {
    return NextResponse.json({ error: `You have ${MAX_PROJECTS} projects, the most there can be. Delete one to save another.` }, { status: 409 });
  }

  const { content } = checked;
  const project = await prisma.project.create({
    data: { ownerId: me.id, name: projectName(body.name, content.designCode), ...content, versions: { create: { ...content, message: "Created" } } },
    select: { id: true, name: true, updatedAt: true },
  });
  return NextResponse.json({ project }, { status: 201 });
}
