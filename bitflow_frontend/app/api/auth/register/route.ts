import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { createSession, hashPassword, passwordProblem, usernameProblem } from "@/lib/auth-utils";
import { botProblem, newFormToken } from "@/lib/bot-check";
import { rateLimit } from "@/lib/rate-limit";
import { reportError } from "@/lib/error-log";
import { CONSENT_VERSION, birthProblem, isMinor } from "@/lib/privacy";
import { audit } from "@/lib/privacy-server";

export const dynamic = "force-dynamic";

/** The sign-up form fetches a fresh form token when it opens (lib/bot-check.ts). */
export function GET() {
  return NextResponse.json({ formToken: newFormToken() });
}

export async function POST(request: Request) {
  // 5/min per client IP; unidentified clients share a roomier bucket (class sign-ups).
  const { success } = await rateLimit(request, { limit: 5, anonymousLimit: 30, windowMs: 60_000, prefix: "register" });
  if (!success) {
    return NextResponse.json(
      { error: "Too many registration attempts. Please wait a moment and try again." },
      { status: 429 }
    );
  }

  try {
    const body = (await request.json()) ?? {};
    const { username, password, role, secretPassword } = body;
    const normalizedUsername = typeof username === "string" ? username.trim() : "";

    if (!normalizedUsername || !password || !role) {
      return NextResponse.json(
        { error: "Username, password, and role are required." },
        { status: 400 }
      );
    }

    if (role !== "STUDENT" && role !== "ADMIN") {
      return NextResponse.json(
        { error: "Invalid role specified." },
        { status: 400 }
      );
    }

    const bot = botProblem(body);
    if (bot) {
      return NextResponse.json({ error: bot }, { status: 400 });
    }

    const badName = usernameProblem(normalizedUsername);
    if (badName) {
      return NextResponse.json({ error: badName }, { status: 400 });
    }

    const weak = passwordProblem(password);
    if (weak) {
      return NextResponse.json({ error: weak }, { status: 400 });
    }

    // DPDP: the notice is accepted before anything is stored, and the age decides
    // whether a parent must consent (lib/privacy.ts).
    if (body.consent !== true) {
      return NextResponse.json({ error: "Please read and accept the privacy notice to create an account." }, { status: 400 });
    }
    const birthYear = Number(body.birthYear), birthMonth = Number(body.birthMonth);
    const badBirth = birthProblem(birthYear, birthMonth);
    if (badBirth) {
      return NextResponse.json({ error: badBirth }, { status: 400 });
    }
    const minor = isMinor({ birthYear, birthMonth });
    if (minor && role === "ADMIN") {
      return NextResponse.json({ error: "Admin accounts need an adult." }, { status: 400 });
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { username: normalizedUsername },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "Username already exists." },
        { status: 400 }
      );
    }

    // Check admin secret password if admin role is selected
    if (role === "ADMIN") {
      const correctSecret = process.env.ADMIN_SECRET;
      if (!correctSecret) {
        return NextResponse.json(
          { error: "Admin registration is disabled on this server." },
          { status: 403 }
        );
      }
      const given = crypto.createHash("sha256").update(String(secretPassword ?? "")).digest();
      const want  = crypto.createHash("sha256").update(correctSecret).digest();
      if (!crypto.timingSafeEqual(given, want)) {
        return NextResponse.json(
          { error: "Incorrect Admin Secret Password. Access Denied." },
          { status: 400 }
        );
      }
    }

    // Create user and hash password
    const passwordHash = hashPassword(password);
    const user = await prisma.user.create({
      data: {
        username: normalizedUsername,
        password: passwordHash,
        role,
        birthYear,
        birthMonth,
        guardianStatus: minor ? "pending" : "none",
        consentVersion: CONSENT_VERSION,
        consentAt:      new Date(),
        xp: {
          create: {
            totalXp: 0,
            unlockedModules: JSON.stringify(["mod_logic_gates", "mod_arithmetic"]),
          },
        },
      },
      select: {
        id: true,
        username: true,
        role: true,
        createdAt: true,
      },
    });

    await createSession(user.id);
    await audit(user.id, "consent.given", user.id, `notice ${CONSENT_VERSION}${minor ? "; under 18, parent consent pending" : ""}`);

    return NextResponse.json({ user, guardianPending: minor });
  } catch (err: any) {
    await reportError("Registration error:", err);
    return NextResponse.json(
      { error: "Registration failed. Please try again." },
      { status: 500 }
    );
  }
}
