import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { createSession, hashPassword } from "@/lib/auth-utils";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  // 5/min per client IP; unidentified clients share a roomier bucket (class sign-ups).
  const { success } = rateLimit(request, { limit: 5, anonymousLimit: 30, windowMs: 60_000, prefix: "register" });
  if (!success) {
    return NextResponse.json(
      { error: "Too many registration attempts. Please wait a moment and try again." },
      { status: 429 }
    );
  }

  try {
    const { username, password, role, secretPassword } = await request.json();
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

    return NextResponse.json({ user });
  } catch (err: any) {
    console.error("Registration error:", err);
    const errorMessage = err?.message || "Internal Server Error";
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
