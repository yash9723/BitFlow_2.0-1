/**
 * app/api/privacy/guardian/route.ts — a parent's or guardian's consent for an under-18
 * account (DPDP s.9; lib/privacy.ts). The parent never needs an account: the student shares
 * a one-time link (/guardian/<token>) and the parent opens it on their own device.
 *
 * POST { action: "link" }                    (the student, signed in) — a fresh link; the old one stops working
 * GET  ?token=                               (the parent) — whose account it is and its status
 * POST { token, action: "grant", guardianName, relationship, adultDeclared, allowAi }
 * POST { token, action: "update", allowAi }  — change the AI tutor choice later
 * POST { token, action: "withdraw", confirm: "delete" } — withdraw consent: the account and all
 *                                              its data are deleted (nothing may be processed without it)
 */
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { reportError } from "@/lib/error-log";
import { isMinor } from "@/lib/privacy";
import { SITE_URL } from "@/lib/site";
import { audit, deleteAccount, ipHash, newGuardianLink, userByGuardianToken } from "@/lib/privacy-server";

export const dynamic = "force-dynamic";

const LINK_GONE = "This link has expired or was replaced. Ask the student for a new one from their dashboard.";
// The public origin (lib/site.ts), not the request's host: behind a proxy that can be 0.0.0.0.
const origin = () => SITE_URL.replace(/\/$/, "");

export async function GET(request: Request) {
  const { success } = await rateLimit(request, { limit: 30, windowMs: 60_000, prefix: "guardian" });
  if (!success) return NextResponse.json({ error: "Too many attempts. Please wait a minute." }, { status: 429 });
  const user = await userByGuardianToken(new URL(request.url).searchParams.get("token"));
  if (!user) return NextResponse.json({ error: LINK_GONE }, { status: 404 });
  return NextResponse.json({ username: user.username, status: user.guardianStatus, allowAi: user.guardianAllowAi, createdAt: user.createdAt });
}

export async function POST(request: Request) {
  const { success } = await rateLimit(request, { limit: 20, windowMs: 60_000, prefix: "guardian" });
  if (!success) return NextResponse.json({ error: "Too many attempts. Please wait a minute." }, { status: 429 });
  const body = await request.json().catch(() => ({}));

  try {
    // The student asks for a link to send to their parent.
    if (body?.action === "link") {
      const me = await getSessionUser();
      if (!me) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
      if (!isMinor(me)) return NextResponse.json({ error: "Only accounts under 18 need a parent's consent." }, { status: 400 });
      const token = await newGuardianLink(me.id);
      await audit(me.id, "guardian.link", me.id);
      return NextResponse.json({ link: `${origin()}/guardian/${token}` });
    }

    const user = await userByGuardianToken(body?.token);
    if (!user) return NextResponse.json({ error: LINK_GONE }, { status: 404 });
    const evidence = ipHash(request);

    if (body.action === "grant") {
      const guardianName = typeof body.guardianName === "string" ? body.guardianName.trim().slice(0, 100) : "";
      const relationship = body.relationship === "guardian" ? "guardian" : body.relationship === "parent" ? "parent" : "";
      if (guardianName.length < 2 || !relationship) return NextResponse.json({ error: "Enter your name and how you are related to the student." }, { status: 400 });
      if (body.adultDeclared !== true) return NextResponse.json({ error: "Only an adult parent or legal guardian can give consent." }, { status: 400 });
      const allowAi = body.allowAi === true;
      await prisma.$transaction([
        prisma.guardianConsent.create({ data: { userId: user.id, guardianName, relationship, adultDeclared: true, allowAi, ipHash: evidence } }),
        // The link stays valid without expiry: it is how the parent changes their mind.
        prisma.user.update({ where: { id: user.id }, data: { guardianStatus: "granted", guardianAllowAi: allowAi, guardianTokenExp: null } }),
      ]);
      await audit(null, "guardian.granted", user.id, `${relationship}; AI tutor ${allowAi ? "allowed" : "not allowed"}`);
      return NextResponse.json({ ok: true, status: "granted", allowAi });
    }

    if (user.guardianStatus !== "granted") return NextResponse.json({ error: "No consent has been given on this link yet." }, { status: 400 });

    if (body.action === "update") {
      const allowAi = body.allowAi === true;
      await prisma.user.update({ where: { id: user.id }, data: { guardianAllowAi: allowAi } });
      await audit(null, "guardian.updated", user.id, `AI tutor ${allowAi ? "allowed" : "not allowed"}`);
      return NextResponse.json({ ok: true, allowAi });
    }

    if (body.action === "withdraw") {
      if (body.confirm !== "delete") return NextResponse.json({ error: 'Type "delete" to confirm.' }, { status: 400 });
      await audit(null, "guardian.withdrawn", user.id, "consent withdrawn by the parent; account deleted");
      await deleteAccount(user.id, null, "parent withdrew consent");
      return NextResponse.json({ ok: true, deleted: true });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (err) {
    await reportError("[guardian] error:", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
