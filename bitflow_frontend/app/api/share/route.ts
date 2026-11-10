/**
 * POST /api/share { title?, designCode, testbenchCode, files?, kind?, designLanguage?, testbenchLanguage?, public?, projectId? }
 * — save a Sandbox design as a read-only link, /s/<id>. Signed-in users only; anyone with the link
 * can view and fork it. Sandbox code only: graded-problem solutions are never shared here.
 * kind "circuit": designCode is a drawn circuit's JSON. Under-18s need a parent's consent to share.
 * projectId (one of your saved projects): sharing that project again updates its link, so the URL stays
 * the same, and a project forked from a share keeps the credit. The body is checked by lib/share.ts.
 */

import crypto from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-utils";
import { rateLimit } from "@/lib/rate-limit";
import { guardianPending } from "@/lib/privacy";
import { parseCircuit } from "@/lib/studio/circuit-json";
import { parseShare } from "@/lib/share";

export const dynamic = "force-dynamic";

const ID_CHARS = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";   // no 0/O, 1/l/I
const newId = () => Array.from(crypto.randomBytes(10), (b) => ID_CHARS[b % ID_CHARS.length]).join("");

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in to share designs." }, { status: 401 });
  if (guardianPending(user)) return NextResponse.json({ error: "A parent or guardian needs to approve your account before you can share." }, { status: 403 });

  const { success } = await rateLimit(request, { limit: 10, windowMs: 60_000, prefix: "share", key: `user:${user.id}` });
  if (!success) return NextResponse.json({ error: "Too many share links. Please wait a moment." }, { status: 429 });

  const body = await request.json().catch(() => ({}));
  const circuit = body?.kind === "circuit" && typeof body.designCode === "string" ? parseCircuit(body.designCode) : null;
  if (typeof circuit === "string") return NextResponse.json({ error: circuit }, { status: 400 });
  const parsed = parseShare(body, circuit?.module);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  const c = parsed.content;

  // A project of yours: its existing link is updated, and a fork keeps its credit.
  const project = c.projectId
    ? await prisma.project.findFirst({ where: { id: c.projectId, ownerId: user.id }, select: { id: true, forkOf: true } })
    : null;
  const data = {
    title: c.title, designCode: c.designCode, testbenchCode: c.testbenchCode, kind: c.kind,
    files: c.files.length ? JSON.stringify(c.files) : null, designLang: c.designLang, tbLang: c.tbLang,
  };
  if (project) {
    const existing = await prisma.sharedDesign.findFirst({ where: { ownerId: user.id, projectId: project.id }, select: { id: true } });
    if (existing) {
      await prisma.sharedDesign.update({ where: { id: existing.id }, data });   // `public` stays as the owner set it
      return NextResponse.json({ id: existing.id, url: `/s/${existing.id}`, updated: true });
    }
  }
  const shared = await prisma.sharedDesign.create({
    data: { id: newId(), ownerId: user.id, ...data, public: c.public, projectId: project?.id ?? null, forkOf: project?.forkOf ?? null },
    select: { id: true },
  });
  return NextResponse.json({ id: shared.id, url: `/s/${shared.id}`, updated: false }, { status: 201 });
}
