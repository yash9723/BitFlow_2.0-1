/**
 * GET /api/projects/[id]/versions — the saved versions of one of your projects, newest first.
 * GET /api/projects/[id]/versions?v=<version id> — that version's content (to compare or restore).
 * Other users' projects are 404.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-utils";

export const dynamic = "force-dynamic";

const notFound = () => NextResponse.json({ error: "Project not found." }, { status: 404 });
const parse = (json: string | null, fallback: unknown) => { try { return json ? JSON.parse(json) : fallback; } catch { return fallback; } };

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Sign in to see project history." }, { status: 401 });
  const project = await prisma.project.findFirst({ where: { id: params.id, ownerId: me.id }, select: { id: true } });
  if (!project) return notFound();

  const v = new URL(request.url).searchParams.get("v");
  if (v) {
    const version = await prisma.projectVersion.findFirst({ where: { id: v, projectId: project.id } });
    if (!version) return NextResponse.json({ error: "Version not found." }, { status: 404 });
    const { projectId: _p, files, pins, ...rest } = version;
    return NextResponse.json({ version: { ...rest, files: parse(files, []), pins: parse(pins, {}) } });
  }

  const versions = await prisma.projectVersion.findMany({
    where: { projectId: project.id }, orderBy: { createdAt: "desc" },
    select: { id: true, createdAt: true, message: true, designCode: true, testbenchCode: true },
  });
  return NextResponse.json({
    versions: versions.map(({ designCode, testbenchCode, ...rest }) => ({ ...rest, lines: designCode.split("\n").length + testbenchCode.split("\n").length })),
  });
}
