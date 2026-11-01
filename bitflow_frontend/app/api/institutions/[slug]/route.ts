/**
 * GET /api/institutions/[slug] — the department dashboard (lib/institutions.ts): plan, seats,
 *     teachers and one row of numbers per class. For the department's heads and site admins;
 *     everyone else gets 404, so department addresses can't be probed.
 *     ?format=csv — the per-class rows as a CSV download.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-utils";
import { departmentCsv, departmentSummary } from "@/lib/institutions";

export const dynamic = "force-dynamic";

const notFound = () => NextResponse.json({ error: "Department not found." }, { status: 404 });

export async function GET(request: Request, { params }: { params: { slug: string } }) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Sign in to see your department." }, { status: 401 });
  if (me.role !== "ADMIN") {
    const head = await prisma.institutionMember.count({ where: { userId: me.id, role: "HEAD", institution: { slug: params.slug } } });
    if (!head) return notFound();
  }
  const summary = await departmentSummary(params.slug);
  if (!summary) return notFound();

  if (new URL(request.url).searchParams.get("format") === "csv") {
    return new NextResponse(departmentCsv(summary), {
      headers: {
        "Content-Type":        "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${summary.institution.slug}-classes.csv"`,
        "Cache-Control":       "no-store",
      },
    });
  }
  return NextResponse.json(summary);
}
