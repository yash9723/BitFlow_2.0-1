/**
 * app/api/privacy/consent/route.ts — your consent record (DPDP, lib/privacy.ts).
 *
 * GET  — what you agreed to and when, the parent consents on your account, and the
 *        privacy-related events in the audit trail.
 * POST { consent: true, birthYear?, birthMonth? } — accept the current notice. Accounts made
 *        before the notice existed also give their month and year of birth here (once; a
 *        correction later goes through /contact, so safe mode can't be switched off by hand).
 */
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { CONSENT_VERSION, birthProblem, isMinor } from "@/lib/privacy";
import { audit } from "@/lib/privacy-server";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const [row, guardians, events] = await Promise.all([
    prisma.user.findUnique({ where: { id: user.id }, select: { consentVersion: true, consentAt: true, guardianStatus: true, guardianAllowAi: true, nomineeName: true, nomineeContact: true } }),
    prisma.guardianConsent.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, select: { guardianName: true, relationship: true, allowAi: true, createdAt: true } }),
    prisma.auditLog.findMany({
      where:   { targetId: user.id, OR: [{ action: { startsWith: "consent." } }, { action: { startsWith: "guardian." } }, { action: { startsWith: "data." } }] },
      orderBy: { createdAt: "desc" }, take: 50, select: { action: true, detail: true, createdAt: true },
    }),
  ]);
  return NextResponse.json({ ...row, currentVersion: CONSENT_VERSION, minor: isMinor(user), guardians, events });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { success } = await rateLimit(request, { limit: 10, windowMs: 60_000, prefix: "consent", key: `user:${user.id}` });
  if (!success) return NextResponse.json({ error: "Too many attempts. Please wait a minute." }, { status: 429 });

  const body = await request.json().catch(() => ({}));
  if (body?.consent !== true) return NextResponse.json({ error: "Tick the box to accept the privacy notice." }, { status: 400 });

  const data: { consentVersion: string; consentAt: Date; birthYear?: number; birthMonth?: number; guardianStatus?: string } =
    { consentVersion: CONSENT_VERSION, consentAt: new Date() };
  let minor = isMinor(user);
  if (!user.birthYear) {
    const birthYear = Number(body.birthYear), birthMonth = Number(body.birthMonth);
    const bad = birthProblem(birthYear, birthMonth);
    if (bad) return NextResponse.json({ error: bad }, { status: 400 });
    minor = isMinor({ birthYear, birthMonth });
    if (minor && user.role === "ADMIN") return NextResponse.json({ error: "Admin accounts need an adult." }, { status: 400 });
    // A minor's profile can't stay public (lib/privacy.ts safe mode).
    Object.assign(data, { birthYear, birthMonth, guardianStatus: minor ? "pending" : "none", ...(minor ? { publicProfile: false } : {}) });
  }
  await prisma.user.update({ where: { id: user.id }, data });
  await audit(user.id, "consent.given", user.id, `notice ${CONSENT_VERSION}${data.guardianStatus === "pending" ? "; under 18, parent consent pending" : ""}`);
  return NextResponse.json({ ok: true, minor, guardianPending: minor && (data.guardianStatus ?? user.guardianStatus) !== "granted" });
}
