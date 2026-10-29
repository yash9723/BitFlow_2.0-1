import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-utils";
import { reportError } from "@/lib/error-log";
import { canUseAi, guardianPending, isMinor, needsConsent } from "@/lib/privacy";

export const dynamic = "force-dynamic";

// The signed-in user plus the privacy flags the UI acts on (lib/privacy.ts).
export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ user: null });
    return NextResponse.json({
      user: {
        ...user,
        minor:           isMinor(user),
        needsConsent:    needsConsent(user),
        guardianPending: guardianPending(user),
        aiAllowed:       canUseAi(user),
      },
    });
  } catch (err) {
    await reportError("Session fetch error:", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
