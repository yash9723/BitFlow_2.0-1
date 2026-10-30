/**
 * POST /api/studio/challenges/[id] { circuit } — grade a circuit on the server and award the
 * challenge's XP on its first pass. The browser grades too, for instant feedback, but only
 * this one counts. Signed-in users only; the solution is kept in LessonProgress (kind "challenge").
 * lib/studio/circuit-challenges.ts decides the result; lib/lesson-progress.ts awards once.
 */
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-utils";
import { reportError } from "@/lib/error-log";
import { recordChallenge } from "@/lib/lesson-progress";
import { rateLimit } from "@/lib/rate-limit";
import { challengeById, gradeCircuit } from "@/lib/studio/circuit-challenges";
import { MAX_CIRCUIT_CHARS, parseCircuit } from "@/lib/studio/circuit-json";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const ch = challengeById(params.id);
  if (!ch) return NextResponse.json({ error: "No such challenge." }, { status: 404 });
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in to earn XP." }, { status: 401 });
  const { success } = await rateLimit(request, { limit: 20, windowMs: 60_000, prefix: "challenge", key: `user:${user.id}` });
  if (!success) return NextResponse.json({ error: "Too many checks. Please wait a moment." }, { status: 429 });

  const raw = await request.text();
  if (raw.length > MAX_CIRCUIT_CHARS + 100) return NextResponse.json({ error: "That circuit is too large." }, { status: 413 });
  let body: { circuit?: unknown };
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: "Bad JSON." }, { status: 400 }); }
  const circuit = parseCircuit(body?.circuit);
  if (typeof circuit === "string") return NextResponse.json({ error: circuit }, { status: 400 });

  let grade;
  try {
    grade = gradeCircuit(ch, circuit);
  } catch {
    return NextResponse.json({ error: "That circuit couldn't be built." }, { status: 422 });   // malformed part options, not a server fault
  }
  if (!grade.ok) return NextResponse.json({ grade, xpAwarded: 0 });
  try {
    return NextResponse.json({ grade, xpAwarded: await recordChallenge(user.id, ch.id, ch.xp, JSON.stringify(circuit)) });
  } catch (err) {
    await reportError("[studio/challenges] error:", err);
    return NextResponse.json({ error: "Your circuit passed, but saving that failed. Try again." }, { status: 500 });
  }
}
