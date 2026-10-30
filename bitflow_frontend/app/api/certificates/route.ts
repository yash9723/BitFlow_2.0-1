/**
 * POST /api/certificates { track } — claim the certificate for a completed
 * track (lib/tracks.ts). Completion is checked here, not trusted from the
 * client. Claiming twice returns the same certificate.
 */

import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { newCertificateId, trackById, trackCounts } from "@/lib/tracks";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const track = trackById(String(body?.track ?? ""));
  if (!track) return NextResponse.json({ error: "Unknown track." }, { status: 400 });

  const existing = await prisma.certificate.findUnique({ where: { userId_track: { userId: user.id, track: track.id } } });
  if (existing) return NextResponse.json({ id: existing.id, url: `/c/${existing.id}` });

  const { total, solved } = await trackCounts(track, user.id);
  if (total === 0 || solved < total) {
    const what = track.lessons ? "Finish every lesson" : "Solve every problem";
    return NextResponse.json({ error: `${what} in ${track.name} first (${solved}/${total}).` }, { status: 403 });
  }

  const cert = await prisma.certificate.create({ data: { id: newCertificateId(), userId: user.id, track: track.id } });
  return NextResponse.json({ id: cert.id, url: `/c/${cert.id}` }, { status: 201 });
}
