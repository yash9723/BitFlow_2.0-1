/**
 * Admin: change one account.
 *
 * PATCH /api/admin/users/[id] { action: "promote" | "demote" | "ban" | "unban" | "delete" }
 *
 * A ban signs the account out at once and blocks signing in (User.bannedAt, lib/auth-utils.ts).
 * Delete removes the account and everything linked to it. An admin can't act on their own
 * account here, and the last admin can't be removed (lib/admin-rules.ts).
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { adminDenied, getSessionUser } from "@/lib/auth-utils";
import { userActionProblem } from "@/lib/admin-rules";
import { isMinor } from "@/lib/privacy";
import { audit, deleteAccount } from "@/lib/privacy-server";
import { reportError } from "@/lib/error-log";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const denied = await adminDenied();
  if (denied) return denied;
  const actor = (await getSessionUser())!;
  const action = String((await request.json().catch(() => null))?.action ?? "");

  const target = await prisma.user.findUnique({ where: { id: params.id }, select: { id: true, role: true, birthYear: true, birthMonth: true } });
  if (!target) return NextResponse.json({ error: "User not found." }, { status: 404 });
  const admins = await prisma.user.count({ where: { role: "ADMIN", bannedAt: null } });
  const problem = userActionProblem(action, actor.id, { id: target.id, role: target.role, minor: isMinor(target) }, admins);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  try {
    if (action === "delete") {
      await deleteAccount(target.id, actor.id, "deleted by an admin");
      return NextResponse.json({ ok: true, deleted: true });
    }
    if (action === "promote" || action === "demote") {
      await prisma.user.update({ where: { id: target.id }, data: { role: action === "promote" ? "ADMIN" : "STUDENT" } });
    } else if (action === "ban") {
      await prisma.$transaction([
        prisma.user.update({ where: { id: target.id }, data: { bannedAt: new Date() } }),
        prisma.session.deleteMany({ where: { userId: target.id } }),
      ]);
    } else {
      await prisma.user.update({ where: { id: target.id }, data: { bannedAt: null } });
    }
    await audit(actor.id, `admin.user.${action}`, target.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    await reportError("[admin/users PATCH] error:", err);
    return NextResponse.json({ error: "That didn't work. Please try again." }, { status: 500 });
  }
}
