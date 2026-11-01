/**
 * POST /api/classes/[id]/packs — { packId, firstDueAt } (teachers): adds a lab pack
 * (lib/lab-packs.ts) as one assignment per experiment, due a week apart from firstDueAt.
 * Problems missing from this server's bank (or archived) are left out; an experiment
 * left with none is skipped. Returns how many assignments were created.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-utils";
import { classRole } from "@/lib/classes";
import { labPack, packDueDates } from "@/lib/lab-packs";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const role = await classRole(params.id, me);
  if (!role) return NextResponse.json({ error: "Class not found." }, { status: 404 });
  if (role !== "TEACHER") return NextResponse.json({ error: "Only teachers can manage assignments." }, { status: 403 });
  if (!(await rateLimit(request, { limit: 10, windowMs: 60 * 60_000, prefix: "class-pack", key: `user:${me.id}` })).success) {
    return NextResponse.json({ error: "Too many packs added. Try again later." }, { status: 429 });
  }

  const body = await request.json().catch(() => ({}));
  const pack = labPack(body?.packId);
  if (!pack) return NextResponse.json({ error: "Choose a lab pack." }, { status: 400 });
  const firstDue = new Date(body?.firstDueAt);
  if (isNaN(firstDue.getTime())) return NextResponse.json({ error: "A valid first due date is required." }, { status: 400 });

  const available = new Set((await prisma.question.findMany({
    where:  { slug: { in: pack.experiments.flatMap((e) => e.slugs) }, archived: false },
    select: { slug: true },
  })).map((q) => q.slug));
  const experiments = pack.experiments
    .map((e) => ({ title: e.title, slugs: e.slugs.filter((s) => available.has(s)) }))
    .filter((e) => e.slugs.length);
  if (!experiments.length) return NextResponse.json({ error: "None of this pack's problems are on this server." }, { status: 400 });

  const due = packDueDates(firstDue, experiments.length);
  await prisma.$transaction(experiments.map((e, i) => prisma.assignment.create({
    data: { classId: params.id, title: e.title, dueAt: due[i], problemSlugs: JSON.stringify(e.slugs) },
  })));
  return NextResponse.json({ created: experiments.length, pack: pack.title }, { status: 201 });
}
