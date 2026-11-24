/**
 * /api/problems/[slug]/layout-entry — the caller's opt-in entry on the after-layout leaderboard.
 *
 *   POST  lays out the caller's latest accepted SUBMIT on the layout service (lib/layout.ts) at BOARD_PERIOD_NS.
 *         The code comes from that stored submission, never from the request; the top module and clock come from
 *         the backend's ASIC route (Yosys -auto-top, as in the Sandbox's ASIC panel).
 *   GET   the entry's state. While pending it asks the layout service and, once the job ends, stores the routed
 *         area, typical-corner slack and whether every sign-off check passed (lib/layout.ts layoutVerdict).
 *
 * Shares the Sandbox layout's limit (6 per 10 minutes per learner); the service runs one job per learner.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { asicOnBackend, designAsVerilog } from "@/lib/backend";
import { BOARD_PERIOD_NS, isJobId, layoutConfigured, layoutFetch, layoutVerdict } from "@/lib/layout";
import { rateLimit } from "@/lib/rate-limit";
import { getSessionUser, signInRequired } from "@/lib/auth-utils";
import { reportError } from "@/lib/error-log";

export const dynamic = "force-dynamic";

const ENTRY = { id: true, layoutJobId: true, layoutState: true, layoutMessage: true, layoutAreaUm2: true,
                layoutSlackNs: true, layoutPeriodNs: true, layoutClean: true, createdAt: true } as const;

async function latestAccepted(userId: string, slug: string) {
  const q = await prisma.question.findUnique({ where: { slug }, select: { id: true, problemType: true, archived: true } });
  if (!q || q.archived) return { error: NextResponse.json({ error: "Problem not found." }, { status: 404 }) };
  if (q.problemType !== "design") return { error: NextResponse.json({ error: "Only design problems have an after-layout board." }, { status: 400 }) };
  const sub = await prisma.submission.findFirst({
    where: { userId, problemId: q.id, accepted: true, submissionType: "SUBMIT" },
    orderBy: { createdAt: "desc" },
    select: { ...ENTRY, designCode: true, language: true },
  });
  return { sub };
}

const view = (s: { layoutState: string | null; layoutMessage: string | null; layoutAreaUm2: number | null; layoutSlackNs: number | null; layoutPeriodNs: number | null; layoutClean: boolean | null } | null) =>
  s ? { state: s.layoutState, message: s.layoutMessage, area: s.layoutAreaUm2, slack: s.layoutSlackNs, periodNs: s.layoutPeriodNs, ranked: s.layoutClean === true } : { state: null };

export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const user = await getSessionUser();
  if (!user) return signInRequired();
  const { sub, error } = await latestAccepted(user.id, params.slug);
  if (error) return error;
  if (!sub) return NextResponse.json({ state: null, solved: false });
  if (sub.layoutState !== "pending" || !sub.layoutJobId || !isJobId(sub.layoutJobId)) return NextResponse.json({ ...view(sub), solved: true });

  try {
    const res = await layoutFetch(`/jobs/${sub.layoutJobId}`, user.id);
    const job = await res.json().catch(() => ({}));
    if (res.status === 404) {    // the service keeps jobs for a week
      const s = await prisma.submission.update({ where: { id: sub.id }, data: { layoutState: "failed", layoutMessage: "The layout expired before it was read. Lay it out again." }, select: ENTRY });
      return NextResponse.json({ ...view(s), solved: true });
    }
    if (!res.ok || job.state === "queued" || job.state === "running")
      return NextResponse.json({ ...view(sub), solved: true, stage: job.stage ?? null, position: job.position ?? null });
    const data = job.state === "done"
      ? (() => { const v = layoutVerdict(job.results); return { layoutState: "done", layoutMessage: v.message, layoutAreaUm2: v.area, layoutSlackNs: v.slack, layoutClean: v.clean }; })()
      : { layoutState: "failed", layoutMessage: job.message || "The layout failed.", layoutClean: false };
    const s = await prisma.submission.update({ where: { id: sub.id }, data, select: ENTRY });
    return NextResponse.json({ ...view(s), solved: true });
  } catch {
    return NextResponse.json({ ...view(sub), solved: true });   // service unreachable: still pending, ask again later
  }
}

export async function POST(request: Request, { params }: { params: { slug: string } }) {
  const user = await getSessionUser();
  if (!user) return signInRequired();
  if (!layoutConfigured()) return NextResponse.json({ error: "Chip layout isn't available yet." }, { status: 503 });
  const { sub, error } = await latestAccepted(user.id, params.slug);
  if (error) return error;
  if (!sub) return NextResponse.json({ error: "Solve the problem first: the board lays out your accepted solution." }, { status: 400 });
  if (sub.layoutState === "pending") return NextResponse.json(view(sub));
  // a finished entry may be laid out again (e.g. after the scoring changes); the service caches identical jobs
  const { success } = await rateLimit(request, { limit: 6, windowMs: 10 * 60_000, prefix: "layout", key: `user:${user.id}` });
  if (!success) return NextResponse.json({ error: "Too many layouts. Please wait a few minutes." }, { status: 429 });

  const fail = async (message: string, status = 422) => {
    await prisma.submission.update({ where: { id: sub.id }, data: { layoutState: "failed", layoutMessage: message, layoutJobId: null } });
    return NextResponse.json({ error: message }, { status });
  };
  try {
    const converted = await designAsVerilog(sub.designCode, sub.language);
    if ("error" in converted) return fail(converted.error);
    // Top module and clock as the ASIC panel finds them (Yosys -auto-top, the backend's clock guess)
    const asic = await asicOnBackend({ design_v: converted.verilog, testbench_v: null, period_ns: BOARD_PERIOD_NS, clock: null });
    const top = asic.data?.top, clock = asic.data?.timing?.clock ?? null;
    if (asic.status !== 200 || !asic.data?.ok || typeof top !== "string") return fail(asic.data?.error || "Synthesis for layout failed.");
    const res = await layoutFetch("/jobs", user.id, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ verilog: converted.verilog, top, clock: clock ?? "", period_ns: BOARD_PERIOD_NS, platform: "sky130hd" }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 429) return NextResponse.json({ error: data?.detail || "You already have a layout running. Wait for it to finish." }, { status: 429 });
    if (!res.ok) {
      const problems = data?.detail?.problems;
      return fail(Array.isArray(problems) ? problems.join(" ") : data?.detail || "The layout couldn't start.", res.status);
    }
    const s = await prisma.submission.update({
      where: { id: sub.id },
      data: { layoutJobId: data.id, layoutState: "pending", layoutMessage: null, layoutAreaUm2: null, layoutSlackNs: null, layoutPeriodNs: BOARD_PERIOD_NS, layoutClean: null },
      select: ENTRY,
    });
    return NextResponse.json(view(s));
  } catch (err) {
    await reportError("[layout-entry] start failed:", err);
    return NextResponse.json({ error: "The layout service didn't answer. Try again in a minute." }, { status: 502 });
  }
}
