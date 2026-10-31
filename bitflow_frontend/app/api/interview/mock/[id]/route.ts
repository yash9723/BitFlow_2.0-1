/**
 * /api/interview/mock/[id] — one of your own mock interviews.
 * GET:  { now, mock } with live results.
 * POST: ends it now; Submits after this don't count.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-utils";
import { mockReport } from "@/lib/interview-server";

export const dynamic = "force-dynamic";

async function mine(id: string) {
  const me = await getSessionUser();
  return me ? prisma.mockInterview.findFirst({ where: { id, userId: me.id } }) : null;
}

const NOT_FOUND = () => NextResponse.json({ error: "Mock interview not found." }, { status: 404 });

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const row = await mine(params.id);
  if (!row) return NOT_FOUND();
  const now = new Date();
  return NextResponse.json({ now, mock: await mockReport(row, now) });
}

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const row = await mine(params.id);
  if (!row) return NOT_FOUND();
  const now = new Date();
  if (!row.finishedAt && row.endsAt > now) {
    row.finishedAt = (await prisma.mockInterview.update({ where: { id: row.id }, data: { finishedAt: now }, select: { finishedAt: true } })).finishedAt;
  }
  return NextResponse.json({ now, mock: await mockReport(row, now) });
}
