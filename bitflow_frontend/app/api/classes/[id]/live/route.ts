/**
 * Live lab for a class (lib/live-lab.ts). Members only; others get 404.
 *
 * GET    teachers: the lab and every joined student's code, last run and note.
 *        students: whether a lab is running, whether they joined, and the teacher's note.
 * POST   { action: "start" }                  teacher: start a lab (no-op if one is running)
 *        { action: "join" }                   student: share their Sandbox with the class's teachers
 *        { action: "snapshot", designCode, testbenchCode, files?, run? }   joined student: their latest state
 *        { action: "note", userId, note }     teacher: a note shown in that student's Sandbox
 * DELETE teachers: end the lab (every snapshot is deleted with it). Students: leave it (theirs is deleted).
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-utils";
import { classRole } from "@/lib/classes";
import { PRIVACY_SELECT, canShareWithClass, publicName } from "@/lib/privacy";
import { audit } from "@/lib/privacy-server";
import { projectContent } from "@/lib/projects";
import { MAX_NOTE, SNAPSHOT_MIN_GAP_MS, parseRunSummary } from "@/lib/live-lab";

export const dynamic = "force-dynamic";
type Params = { params: { id: string } };

const notFound = () => NextResponse.json({ error: "Class not found." }, { status: 404 });
function parse<T>(s: string | null, fallback: T): T {
  try { return s ? JSON.parse(s) : fallback; } catch { return fallback; }
}

async function member(classId: string) {
  const me = await getSessionUser();
  if (!me) return { error: NextResponse.json({ error: "Sign in first." }, { status: 401 }) };
  const role = await classRole(classId, me);
  if (!role) return { error: notFound() };
  return { me, role };
}

export async function GET(_req: Request, { params }: Params) {
  const m = await member(params.id);
  if ("error" in m) return m.error;
  const lab = await prisma.liveLab.findUnique({ where: { classId: params.id } });
  if (m.role === "STUDENT") {
    const mine = lab ? await prisma.liveSnapshot.findUnique({ where: { labId_userId: { labId: lab.id, userId: m.me.id } }, select: { note: true } }) : null;
    return NextResponse.json({ lab: lab ? { startedAt: lab.startedAt } : null, joined: !!mine, note: mine?.note ?? null, canJoin: canShareWithClass(m.me) });
  }
  if (!lab) return NextResponse.json({ lab: null, students: [] });
  const snaps = await prisma.liveSnapshot.findMany({
    where: { labId: lab.id }, orderBy: { joinedAt: "asc" },
    select: { files: true, run: true, note: true, updatedAt: true, user: { select: { id: true, username: true, ...PRIVACY_SELECT } } },
  });
  return NextResponse.json({
    lab: { startedAt: lab.startedAt },
    students: snaps.map((s) => ({
      userId: s.user.id, name: publicName(s.user, m.me.id), files: parse(s.files, []), run: parse(s.run, null),
      note: s.note, updatedAt: s.updatedAt,
    })),
  });
}

export async function POST(req: Request, { params }: Params) {
  const m = await member(params.id);
  if ("error" in m) return m.error;
  const body = await req.json().catch(() => null);
  const action = body?.action;
  const teacher = m.role === "TEACHER";

  if (action === "start" && teacher) {
    const lab = await prisma.liveLab.upsert({ where: { classId: params.id }, create: { classId: params.id, startedBy: m.me.id }, update: {} });
    await audit(m.me.id, "live.start", params.id);
    return NextResponse.json({ lab: { startedAt: lab.startedAt } });
  }
  if (action === "note" && teacher) {
    if (typeof body.userId !== "string" || typeof body.note !== "string") return NextResponse.json({ error: "userId and note are required." }, { status: 400 });
    const lab = await prisma.liveLab.findUnique({ where: { classId: params.id }, select: { id: true } });
    const { count } = lab
      ? await prisma.liveSnapshot.updateMany({ where: { labId: lab.id, userId: body.userId }, data: { note: body.note.trim().slice(0, MAX_NOTE) || null } })
      : { count: 0 };
    return count ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "That student isn't in the lab." }, { status: 404 });
  }
  if ((action === "join" || action === "snapshot") && !teacher) {
    const lab = await prisma.liveLab.findUnique({ where: { classId: params.id }, select: { id: true } });
    if (!lab) return NextResponse.json({ error: "No live lab is running in this class." }, { status: 409 });
    if (action === "join") {
      if (!canShareWithClass(m.me)) {
        return NextResponse.json({ error: "A parent or guardian needs to approve your account before you can share your work with a class." }, { status: 403 });
      }
      await prisma.liveSnapshot.upsert({ where: { labId_userId: { labId: lab.id, userId: m.me.id } }, create: { labId: lab.id, userId: m.me.id }, update: {} });
      await audit(m.me.id, "live.join", params.id);
      return NextResponse.json({ joined: true });
    }
    const content = projectContent({ designCode: body.designCode, testbenchCode: body.testbenchCode, files: body.files });
    if ("error" in content) return NextResponse.json({ error: content.error }, { status: content.status });
    const files = [
      { name: "design", content: content.content.designCode },
      { name: "testbench", content: content.content.testbenchCode },
      ...parse<{ name: string; content: string }[]>(content.content.files, []),
    ];
    const run = parseRunSummary(body.run);
    // One write per gap per student: a burst of saves updates nothing (and costs one query).
    const { count } = await prisma.liveSnapshot.updateMany({
      where: { labId: lab.id, userId: m.me.id, updatedAt: { lt: new Date(Date.now() - SNAPSHOT_MIN_GAP_MS) } },
      data:  { files: JSON.stringify(files), ...(run ? { run: JSON.stringify(run) } : {}) },
    });
    const mine = await prisma.liveSnapshot.findUnique({ where: { labId_userId: { labId: lab.id, userId: m.me.id } }, select: { note: true } });
    if (!mine) return NextResponse.json({ error: "Join the lab first." }, { status: 409 });
    return NextResponse.json({ saved: count === 1, note: mine.note });
  }
  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}

export async function DELETE(_req: Request, { params }: Params) {
  const m = await member(params.id);
  if ("error" in m) return m.error;
  if (m.role === "TEACHER") {
    await prisma.liveLab.deleteMany({ where: { classId: params.id } });
    await audit(m.me.id, "live.end", params.id);
    return NextResponse.json({ ended: true });
  }
  const lab = await prisma.liveLab.findUnique({ where: { classId: params.id }, select: { id: true } });
  if (lab) await prisma.liveSnapshot.deleteMany({ where: { labId: lab.id, userId: m.me.id } });
  return NextResponse.json({ left: true });
}
