/**
 * GET /api/profile/export — everything BitFlow keeps about you, as a JSON download: account,
 * XP, progress, submissions (your code, and the testbench only where you wrote it; never the
 * hidden tests or their results), projects with their history, share links, certificates,
 * comments and classes. Never your password or sessions. Rate limited.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-utils";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const MAX_SUBMISSIONS = 5000;   // the most recent; a very busy account says so in the file
const parse = (json: string | null) => { try { return json ? JSON.parse(json) : null; } catch { return json; } };

export async function GET(request: Request) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Sign in to download your data." }, { status: 401 });
  const { success } = await rateLimit(request, { limit: 3, windowMs: 60 * 60_000, prefix: "export", key: `user:${me.id}` });
  if (!success) return NextResponse.json({ error: "You can download your data 3 times an hour. Please try again later." }, { status: 429 });

  const id = me.id;
  const [user, xp, progress, submissions, projects, shares, certificates, comments, memberships, owned] = await Promise.all([
    prisma.user.findUnique({ where: { id }, select: { username: true, role: true, publicProfile: true, createdAt: true } }),
    prisma.userXp.findUnique({ where: { userId: id }, select: { totalXp: true, dailyStreak: true, lastDailyBonus: true, updatedAt: true } }),
    prisma.userProgress.findMany({ where: { userId: id }, orderBy: { createdAt: "asc" },
      select: { solved: true, attempts: true, firstSolvedAt: true, xpEarned: true, question: { select: { slug: true, title: true } } } }),
    prisma.submission.findMany({ where: { userId: id }, orderBy: { createdAt: "desc" }, take: MAX_SUBMISSIONS + 1,
      select: { createdAt: true, submissionType: true, language: true, accepted: true, numTestsPassed: true, numTestsTotal: true,
                xpEarned: true, gateCount: true, logicDepth: true, fmaxMhz: true, designCode: true, testbenchCode: true,
                question: { select: { slug: true, title: true, problemType: true } } } }),
    prisma.project.findMany({ where: { ownerId: id }, orderBy: { createdAt: "asc" },
      select: { name: true, designCode: true, testbenchCode: true, files: true, designLanguage: true, testbenchLanguage: true, pins: true, createdAt: true, updatedAt: true,
                versions: { orderBy: { createdAt: "asc" }, select: { createdAt: true, message: true, designCode: true, testbenchCode: true, files: true, designLanguage: true, testbenchLanguage: true, pins: true } } } }),
    prisma.sharedDesign.findMany({ where: { ownerId: id }, select: { id: true, title: true, designCode: true, testbenchCode: true, files: true, createdAt: true } }),
    prisma.certificate.findMany({ where: { userId: id }, select: { id: true, track: true, issuedAt: true } }),
    prisma.comment.findMany({ where: { userId: id }, select: { body: true, hidden: true, createdAt: true, question: { select: { slug: true } } } }),
    prisma.classMember.findMany({ where: { userId: id }, select: { role: true, joinedAt: true, classroom: { select: { name: true } } } }),
    prisma.classroom.findMany({ where: { ownerId: id }, select: { name: true, joinCode: true, createdAt: true } }),
  ]);
  if (!user) return NextResponse.json({ error: "Account not found." }, { status: 404 });

  const data = {
    exportedAt: new Date().toISOString(),
    site: "bitflowvlsi.tech",
    account: user,
    xp,
    progress: progress.map(({ question, ...p }) => ({ problem: question.slug, title: question.title, ...p })),
    submissions: submissions.slice(0, MAX_SUBMISSIONS).map(({ question, testbenchCode, ...s }) => ({
      problem: question.slug, title: question.title, ...s,
      // The testbench is yours only on testbench and formal problems; elsewhere it is the problem's.
      ...(question.problemType === "testbench" || question.problemType === "formal" ? { testbenchCode } : {}),
    })),
    ...(submissions.length > MAX_SUBMISSIONS ? { submissionsNote: `Only your ${MAX_SUBMISSIONS} most recent submissions are included.` } : {}),
    projects: projects.map((p) => ({ ...p, files: parse(p.files), pins: parse(p.pins), versions: p.versions.map((v) => ({ ...v, files: parse(v.files), pins: parse(v.pins) })) })),
    shareLinks: shares.map((s) => ({ ...s, url: `/s/${s.id}`, files: parse(s.files) })),
    certificates: certificates.map((c) => ({ ...c, url: `/c/${c.id}` })),
    comments: comments.map(({ question, ...c }) => ({ problem: question.slug, ...c })),
    classes: { member: memberships.map((m) => ({ name: m.classroom.name, role: m.role, joined: m.joinedAt })), teaching: owned },
  };
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="bitflow-${user.username}-${date}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
