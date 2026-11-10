/**
 * POST /api/share/[id]/fork — save a shared design as one of your projects, crediting the original
 * (Project.forkOf), and count the fork on the share. Returns the project and its content, which
 * components/ForkButton.tsx opens in the Sandbox. Circuits open in the circuit editor instead.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-utils";
import { rateLimit } from "@/lib/rate-limit";
import { MAX_PROJECTS } from "@/lib/projects";
import { parseFiles } from "@/lib/share";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Sign in to fork designs into your projects." }, { status: 401 });
  const { success } = await rateLimit(request, { limit: 20, windowMs: 60_000, prefix: "share-fork", key: `user:${me.id}` });
  if (!success) return NextResponse.json({ error: "Too many forks. Please wait a moment." }, { status: 429 });

  const s = await prisma.sharedDesign.findUnique({
    where: { id: params.id },
    select: { id: true, title: true, designCode: true, testbenchCode: true, files: true, kind: true, designLang: true, tbLang: true },
  });
  if (!s || s.kind !== "sandbox") return NextResponse.json({ error: "Shared design not found." }, { status: 404 });
  if (await prisma.project.count({ where: { ownerId: me.id } }) >= MAX_PROJECTS) {
    return NextResponse.json({ error: `You have ${MAX_PROJECTS} projects, the most there can be. Delete one to fork this.` }, { status: 409 });
  }

  const content = {
    designCode: s.designCode, testbenchCode: s.testbenchCode, files: s.files,
    designLanguage: s.designLang, testbenchLanguage: s.tbLang, pins: null,
  };
  const [project] = await prisma.$transaction([
    prisma.project.create({
      data: { ownerId: me.id, name: s.title.slice(0, 80), kind: "sandbox", forkOf: s.id, ...content,
              versions: { create: { ...content, message: `Forked from /s/${s.id}` } } },
      select: { id: true, name: true },
    }),
    prisma.sharedDesign.update({ where: { id: s.id }, data: { forks: { increment: 1 } } }),
  ]);
  return NextResponse.json({
    project,
    content: { designCode: s.designCode, testbenchCode: s.testbenchCode, files: parseFiles(s.files), designLanguage: s.designLang, testbenchLanguage: s.tbLang },
  }, { status: 201 });
}
