/**
 * POST /api/contact — the contact form (app/contact). Stores the message for the admin
 * console's Messages tab. Rate-limited per client; a filled-in honeypot field ("website",
 * hidden from people) gets a quiet success so bots don't learn anything.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { reportError } from "@/lib/error-log";

export const dynamic = "force-dynamic";

const LIMITS = { name: 100, email: 200, subject: 150, message: 5000 };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export async function POST(request: Request) {
  const { success } = await rateLimit(request, { limit: 5, anonymousLimit: 30, windowMs: 60 * 60_000, prefix: "contact" });
  if (!success) return NextResponse.json({ error: "Too many messages from here. Please try again in an hour." }, { status: 429 });

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  if (text(body.website)) return NextResponse.json({ ok: true });          // honeypot

  const name = text(body.name), email = text(body.email), subject = text(body.subject) || "(no subject)", message = text(body.message);
  const problem =
    !name ? "Please enter your name."
    : name.length > LIMITS.name ? `Your name can be at most ${LIMITS.name} characters.`
    : !EMAIL.test(email) || email.length > LIMITS.email ? "Please enter a valid email address, so we can reply."
    : subject.length > LIMITS.subject ? `The subject can be at most ${LIMITS.subject} characters.`
    : message.length < 10 ? "Please write a little more (at least 10 characters)."
    : message.length > LIMITS.message ? `The message can be at most ${LIMITS.message} characters.`
    : null;
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  try {
    await prisma.contactMessage.create({ data: { name, email, subject, message } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    await reportError("[POST /api/contact]", err);
    return NextResponse.json({ error: "Your message couldn't be saved. Please try again later." }, { status: 500 });
  }
}
