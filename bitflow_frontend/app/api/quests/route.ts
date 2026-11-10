/**
 * GET  /api/quests — today's three quests with your progress (lib/quests.ts). Sign-in required.
 * POST /api/quests { id } — claim a finished quest's XP (once). 400 if it isn't today's or isn't done.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-utils";
import { claimQuest, loadQuests } from "@/lib/quests";
import { todayKey } from "@/lib/daily";
import { reportError } from "@/lib/error-log";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in to see your quests" }, { status: 401 });
  try {
    return NextResponse.json({ date: todayKey(), quests: await loadQuests(user.id) });
  } catch (err) {
    await reportError("[quests] error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in to claim quests" }, { status: 401 });
  const id = await req.json().then((b) => (typeof b?.id === "string" ? b.id : null), () => null);
  if (!id) return NextResponse.json({ error: "Missing quest id" }, { status: 400 });
  try {
    const xp = await claimQuest(user.id, id);
    if (xp === null) return NextResponse.json({ error: "That quest isn't finished yet" }, { status: 400 });
    return NextResponse.json({ xp, quests: await loadQuests(user.id) });
  } catch (err) {
    await reportError("[quests] claim error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
