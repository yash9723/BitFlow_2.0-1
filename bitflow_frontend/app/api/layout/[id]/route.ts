/** GET /api/layout/<id> — a layout job's state, stage and (when done) results; see app/api/layout/route.ts. */
import { NextResponse } from "next/server";
import { isJobId, layoutFetch } from "@/lib/layout";
import { getSessionUser, signInRequired } from "@/lib/auth-utils";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) return signInRequired();
  if (!isJobId(params.id)) return NextResponse.json({ error: "No such job." }, { status: 404 });
  try {
    const res = await layoutFetch(`/jobs/${params.id}`, user.id);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return NextResponse.json({ error: data?.detail || "No such job." }, { status: res.status });
    // Only what the page shows: not the service's internal fields.
    const { id, state, stage, message, results, position, files, period_ns, clock, top } = data;
    return NextResponse.json({ id, state, stage, message, results, position, files, periodNs: period_ns, clock, top });
  } catch {
    return NextResponse.json({ error: "The layout service didn't answer." }, { status: 502 });
  }
}
