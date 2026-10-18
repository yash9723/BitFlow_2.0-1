import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSession, hashPassword, verifyPassword } from "@/lib/auth-utils";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { username, password, role } = await request.json();
    const normalizedUsername = typeof username === "string" ? username.trim() : "";

    // Max 10 attempts per minute per account: stops password guessing without
    // letting one client lock everyone out (client IPs aren't always known).
    const { success } = rateLimit(request, {
      limit: 10, windowMs: 60_000, prefix: "login", key: `account:${normalizedUsername.toLowerCase()}`,
    });
    if (!success) {
      return NextResponse.json(
        { error: "Too many login attempts. Please wait a moment and try again." },
        { status: 429 }
      );
    }

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

    const user = await prisma.user.findUnique({
      where: { username: normalizedUsername },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Invalid username or password." },
        { status: 400 }
      );
    }

    // Student login should not fail because of a stale/wrong role toggle.
    // Admin login remains explicitly protected.
    if (role === "ADMIN" && user.role !== "ADMIN") {
      return NextResponse.json(
        { error: "This account is not registered as an ADMIN." },
        { status: 400 }
      );
    }

    // Verify password hash
    const { ok, needsRehash } = verifyPassword(password, user.password);
    if (!ok) {
      return NextResponse.json(
        { error: "Invalid username or password." },
        { status: 400 }
      );
    }
    if (needsRehash) {
      await prisma.user.update({
        where: { id: user.id },
        data:  { password: hashPassword(password) },
      });
    }

    await createSession(user.id);

    return NextResponse.json({
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        createdAt: user.createdAt,
      },
    });
  } catch (err: any) {
    console.error("Login error:", err);
    const errorMessage = err?.message || "Internal Server Error";
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
