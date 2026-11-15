import crypto from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSession, hashPassword, verifyPassword } from "@/lib/auth-utils";
import { rateLimit } from "@/lib/rate-limit";
import { reportError } from "@/lib/error-log";

export const dynamic = "force-dynamic";

// Checked when the username is unknown, so that reply takes as long as a wrong password
// and the form can't be timed to find accounts.
const NO_SUCH_USER = hashPassword(crypto.randomBytes(16).toString("hex"));
const invalid = () => NextResponse.json({ error: "Invalid username or password." }, { status: 400 });

export async function POST(request: Request) {
  try {
    const { username, password, role } = await request.json();
    const normalizedUsername = typeof username === "string" ? username.trim() : "";

    // Max 10 attempts per minute per account: stops password guessing without
    // letting one client lock everyone out (client IPs aren't always known).
    const { success } = await rateLimit(request, {
      limit: 10, windowMs: 60_000, prefix: "login", key: `account:${normalizedUsername.toLowerCase()}`,
    });
    if (!success) {
      return NextResponse.json(
        { error: "Too many login attempts. Please wait a moment and try again." },
        { status: 429 }
      );
    }

    if (!normalizedUsername || typeof password !== "string" || !password) {
      return NextResponse.json(
        { error: "Username and password are required." },
        { status: 400 }
      );
    }

    // Optional: the sign-in form no longer sends it (the account's own role decides where it lands).
    if (role !== undefined && role !== "STUDENT" && role !== "ADMIN") {
      return NextResponse.json(
        { error: "Invalid role specified." },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { username: normalizedUsername },
    });

    // Verify password hash (against a throwaway hash when there is no such user)
    const { ok, needsRehash } = verifyPassword(password, user?.password ?? NO_SUCH_USER);
    if (!user || !ok) return invalid();

    // Everything below comes only after the password is right, so it doesn't reveal which usernames exist.
    // Student login should not fail because of a stale/wrong role toggle.
    // Admin login remains explicitly protected.
    if (role === "ADMIN" && user.role !== "ADMIN") {
      return NextResponse.json(
        { error: "This account is not registered as an ADMIN." },
        { status: 400 }
      );
    }
    if (user.bannedAt) {
      return NextResponse.json({ error: "This account has been suspended. Use the contact form if you think that's a mistake." }, { status: 403 });
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
    // The details go to the error log, not to the client (database errors name hosts and tables).
    await reportError("Login error:", err);
    return NextResponse.json(
      { error: "Sign-in failed. Please try again." },
      { status: 500 }
    );
  }
}
