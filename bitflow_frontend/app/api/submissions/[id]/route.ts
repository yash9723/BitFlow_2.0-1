/**
 * GET /api/submissions/[id] — the design code of one of your own submissions
 * (admins may read any). Only the design is returned: a SUBMIT row's
 * testbench and testcase results come from the hidden tests. Exception:
 * testbench problems, where tb.v is the student's own work (testbenchCode).
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-utils";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const me = await getSessionUser();
  if (!me) {
    return NextResponse.json({ error: "Sign in to view submissions." }, { status: 401 });
  }

  const submission = await prisma.submission.findUnique({
    where:  { id: params.id },
    select: { id: true, userId: true, designCode: true, testbenchCode: true, submissionType: true, createdAt: true,
              question: { select: { problemType: true } } },
  });
  // 404 (not 403) for other users' rows so ids can't be probed.
  if (!submission || (submission.userId !== me.id && me.role !== "ADMIN")) {
    return NextResponse.json({ error: "Submission not found." }, { status: 404 });
  }

  const { userId: _owner, testbenchCode, question, ...rest } = submission;
  const learnerWroteTb = question.problemType === "testbench" || question.problemType === "formal";
  return NextResponse.json({ submission: learnerWroteTb ? { ...rest, testbenchCode } : rest });
}
