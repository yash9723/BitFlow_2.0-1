/**
 * PATCH /api/share/[id] { title?, public? } — the owner renames a shared design or lists it on /explore.
 * The link stays the same. Its code is updated by sharing its project again (POST /api/share with projectId).
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-utils";
import { guardianPending } from "@/lib/privacy";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in to change a shared design." }, { status: 401 });
  const share = await prisma.sharedDesign.findUnique({ where: { id: params.id }, select: { ownerId: true } });
  // Someone else's design looks the same as a missing one.
  if (!share || share.ownerId !== user.id) return NextResponse.json({ error: "Shared design not found." }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const data: { title?: string; public?: boolean } = {};
  if (typeof body?.title === "string") {
    const title = body.title.trim().slice(0, 80);
    if (!title) return NextResponse.json({ error: "The title can't be empty." }, { status: 400 });
    data.title = title;
  }
  if (typeof body?.public === "boolean") {
    if (body.public && guardianPending(user)) return NextResponse.json({ error: "A parent or guardian needs to approve your account first." }, { status: 403 });
    data.public = body.public;
  }
  if (!Object.keys(data).length) return NextResponse.json({ error: "Nothing to change." }, { status: 400 });

  const updated = await prisma.sharedDesign.update({ where: { id: params.id }, data, select: { id: true, title: true, public: true } });
  return NextResponse.json(updated);
}
