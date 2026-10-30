/**
 * Admin: edit one problem.
 *
 * GET   /api/admin/problems/[slug] — everything the editor shows, hidden tests included (admins only)
 * PATCH /api/admin/problems/[slug] { title?, statement?, difficulty?, category?, tags?, xpReward?,
 *       archived?, starterCode?, publicTestbench?, hiddenTestbench?, hiddenTestcases? }
 *
 * A change to what decides passing is saved only if the reference solution still passes and the
 * starter still fails, so an edit can't quietly make a problem impossible or free. Archiving hides
 * a problem from learners but keeps its submissions, and archived or edited rows are left alone by
 * the seed that runs on every deploy (adminEditedAt, prisma/seed.ts).
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { adminDenied } from "@/lib/auth-utils";
import { problemEdit } from "@/lib/admin-rules";
import { gradeDesign, verifyReferenceSolution } from "@/lib/grading";
import { reportError } from "@/lib/error-log";
import { auditAdmin } from "@/lib/privacy-server";

export const dynamic = "force-dynamic";

type Params = { params: { slug: string } };

export async function GET(_request: Request, { params }: Params) {
  const denied = await adminDenied();
  if (denied) return denied;
  const q = await prisma.question.findUnique({
    where:  { slug: params.slug },
    select: {
      slug: true, title: true, statement: true, difficulty: true, category: true, tags: true, xpReward: true, archived: true, adminEditedAt: true,
      problemType: true, learningLevel: true, starterCode: true, publicTestbench: true, hiddenTestbench: true, hiddenTestcases: true,
      referenceSolution: true,
    },
  });
  if (!q) return NextResponse.json({ error: "Problem not found." }, { status: 404 });
  const { referenceSolution, ...rest } = q;
  return NextResponse.json({ problem: { ...rest, hasReference: !!referenceSolution } });
}

export async function PATCH(request: Request, { params }: Params) {
  const denied = await adminDenied();
  if (denied) return denied;

  const edit = problemEdit(await request.json().catch(() => null));
  if ("error" in edit) return NextResponse.json({ error: edit.error }, { status: 400 });
  const question = await prisma.question.findUnique({ where: { slug: params.slug } });
  if (!question) return NextResponse.json({ error: "Problem not found." }, { status: 404 });

  let mutants: string | undefined;
  if (edit.gradingChanged) {
    if (!question.referenceSolution) {
      return NextResponse.json({ error: "Upload a reference solution first: without one, a change to the tests or starter can't be verified." }, { status: 409 });
    }
    const updated = { ...question, ...edit.data } as typeof question;
    try {
      const reference = await verifyReferenceSolution(updated, question.referenceSolution);
      if (!reference.ok) return NextResponse.json({ error: `Not saved: the reference solution no longer passes (${reference.error}).` }, { status: 422 });
      if ("mutants" in reference && reference.mutants) mutants = JSON.stringify(reference.mutants);
      if (updated.problemType === "design" && (await gradeDesign(updated, updated.starterCode)).accepted) {
        return NextResponse.json({ error: "Not saved: the starter code already passes, so the problem would be free." }, { status: 422 });
      }
    } catch (err) {
      await reportError("[admin/problems PATCH] verification failed:", err);
      return NextResponse.json({ error: "Simulator unavailable, so the change couldn't be verified. Nothing was saved." }, { status: 502 });
    }
  }

  await prisma.question.update({
    where: { slug: params.slug },
    data:  { ...edit.data, ...(mutants ? { mutants } : {}), adminEditedAt: new Date() },
  });
  await auditAdmin("admin.problem.edit", params.slug, Object.keys(edit.data).join(", "));
  return NextResponse.json({ ok: true, verified: edit.gradingChanged });
}
