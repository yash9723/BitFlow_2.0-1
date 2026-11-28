/**
 * /api/problems/[slug]/speed-entry — the caller's opt-in entry on the "fastest after layout" board (lib/speed.ts).
 *
 *   POST  starts the sweep for the caller's latest accepted SUBMIT, once its after-layout entry (layout-entry) is
 *         done and clean: the same code, laid out again down a fixed ladder of clock periods.
 *   GET   the sweep's state. Each call reads the running layout; when it ends it records the rung and starts the
 *         next one (lib/speed.ts nextPeriod), until the ladder says done. Closing the tab only pauses it: the next GET
 *         carries on. A rung that couldn't start (the service busy) is retried on the next GET.
 *
 * Code comes from the stored submission, never from the request. Starting counts against the Sandbox layout limit
 * (6 per 10 minutes); the follow-up rungs are bounded by MAX_RUNS instead. Writes are guarded on the job id that was
 * read, so two open tabs can't both move the sweep on.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { asicOnBackend, designAsVerilog } from "@/lib/backend";
import { isJobId, layoutConfigured, layoutFetch, layoutVerdict } from "@/lib/layout";
import { MAX_RUNS, nextPeriod, speedScore, type Base, type Run } from "@/lib/speed";
import { rateLimit } from "@/lib/rate-limit";
import { getSessionUser, signInRequired } from "@/lib/auth-utils";
import { reportError } from "@/lib/error-log";

export const dynamic = "force-dynamic";

interface Sweep { top: string; clock: string; runs: Run[] }

const FIELDS = { id: true, designCode: true, language: true, layoutState: true, layoutClean: true, layoutPeriodNs: true, layoutSlackNs: true,
                 speedJobId: true, speedState: true, speedMessage: true, speedRuns: true, speedMhz: true, speedPeriodNs: true } as const;
interface Row {
  id: string; designCode: string; language: string; layoutState: string | null; layoutClean: boolean | null;
  layoutPeriodNs: number | null; layoutSlackNs: number | null; speedJobId: string | null; speedState: string | null;
  speedMessage: string | null; speedRuns: string | null; speedMhz: number | null; speedPeriodNs: number | null;
}

const parse = (s: string | null): Sweep | null => { try { return s ? JSON.parse(s) as Sweep : null; } catch { return null; } };
const baseOf = (r: Row): Base | null => r.layoutState === "done" && r.layoutClean === true && r.layoutPeriodNs != null && r.layoutSlackNs != null
  ? { periodNs: r.layoutPeriodNs, slackNs: r.layoutSlackNs } : null;

function view(r: Row, extra: Record<string, unknown> = {}) {
  return { solved: true, ready: !!baseOf(r), state: r.speedState, message: r.speedMessage, mhz: r.speedMhz, periodNs: r.speedPeriodNs,
           runs: (parse(r.speedRuns)?.runs ?? []).map((x) => ({ periodNs: x.periodNs, pass: x.pass, slackNs: x.slackNs })), maxRuns: MAX_RUNS, ...extra };
}

async function latestAccepted(userId: string, slug: string) {
  const q = await prisma.question.findUnique({ where: { slug }, select: { id: true, problemType: true, archived: true } });
  if (!q || q.archived) return { error: NextResponse.json({ error: "Problem not found." }, { status: 404 }) };
  if (q.problemType !== "design") return { error: NextResponse.json({ error: "Only design problems have an after-layout board." }, { status: 400 }) };
  const sub = await prisma.submission.findFirst({
    where: { userId, problemId: q.id, accepted: true, submissionType: "SUBMIT" }, orderBy: { createdAt: "desc" }, select: FIELDS,
  });
  return { sub: sub as Row | null };
}

/** Ask the layout service for a layout at `periodNs`: its job id, busy (try again later), or an error. */
async function submitRung(sub: Row, sweep: Sweep, periodNs: number, userId: string): Promise<{ id: string } | { busy: true } | { error: string }> {
  const converted = await designAsVerilog(sub.designCode, sub.language);
  if ("error" in converted) return { error: converted.error };
  const res = await layoutFetch("/jobs", userId, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ verilog: converted.verilog, top: sweep.top, clock: sweep.clock, period_ns: periodNs, platform: "sky130hd" }),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 429 || res.status === 503) return { busy: true };
  if (!res.ok || typeof data.id !== "string")
    return { error: Array.isArray(data?.detail?.problems) ? data.detail.problems.join(" ") : data?.detail || "The layout couldn't start." };
  return { id: data.id };
}

/** Save, but only if no other request moved the sweep on since `expectJob` was read; returns the stored row. */
async function save(sub: Row, expectJob: string | null, data: Record<string, unknown>): Promise<Row> {
  await prisma.submission.updateMany({ where: { id: sub.id, speedJobId: expectJob }, data });
  return ((await prisma.submission.findUnique({ where: { id: sub.id }, select: FIELDS })) as Row | null) ?? sub;
}

/** Start the next rung, or finish the sweep with its score. */
async function advance(sub: Row, sweep: Sweep, base: Base, userId: string, expectJob: string | null): Promise<Row> {
  const next = nextPeriod(base, sweep.runs);
  const finish = (message: string | null) => {
    const s = speedScore(base, sweep.runs);   // a stopped sweep keeps what its finished rungs earned
    return save(sub, expectJob, { speedState: "done", speedJobId: null, speedMessage: message, speedRuns: JSON.stringify(sweep), speedMhz: s.mhz, speedPeriodNs: s.periodNs });
  };
  if (next == null) return finish(null);
  const started = await submitRung(sub, sweep, next, userId);
  if ("error" in started) return finish(`Stopped before ${next} ns: ${started.error}`);
  const run: Run = { periodNs: next, jobId: "id" in started ? started.id : null, pass: null, slackNs: null };
  return save(sub, expectJob, { speedState: "pending", speedMessage: null, speedJobId: run.jobId, speedRuns: JSON.stringify({ ...sweep, runs: [...sweep.runs, run] }) });
}

export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const user = await getSessionUser();
  if (!user) return signInRequired();
  const { sub, error } = await latestAccepted(user.id, params.slug);
  if (error) return error;
  if (!sub) return NextResponse.json({ solved: false });
  const sweep = parse(sub.speedRuns), base = baseOf(sub);
  if (sub.speedState !== "pending" || !sweep || !base) return NextResponse.json(view(sub));

  try {
    const cur = sweep.runs[sweep.runs.length - 1];
    if (!cur || cur.pass !== null) return NextResponse.json(view(await advance(sub, sweep, base, user.id, sub.speedJobId)));
    if (!cur.jobId) {   // the service was busy when this rung was due, or its job expired: start it now
      const started = await submitRung(sub, sweep, cur.periodNs, user.id);
      if ("busy" in started) return NextResponse.json(view(sub, { waiting: true }));
      if ("error" in started) return NextResponse.json(view(await save(sub, sub.speedJobId, { speedState: "failed", speedMessage: started.error })));
      cur.jobId = started.id;
      return NextResponse.json(view(await save(sub, sub.speedJobId, { speedJobId: started.id, speedRuns: JSON.stringify(sweep) })));
    }
    if (!isJobId(cur.jobId)) return NextResponse.json(view(await save(sub, sub.speedJobId, { speedState: "failed", speedMessage: "The speed run lost its layout. Start it again." })));
    const res = await layoutFetch(`/jobs/${cur.jobId}`, user.id);
    const job = await res.json().catch(() => ({}));
    if (res.status === 404) {   // the service forgot the job: run that rung again
      cur.jobId = null;
      return NextResponse.json(view(await save(sub, sub.speedJobId, { speedJobId: null, speedRuns: JSON.stringify(sweep) })));
    }
    if (!res.ok || job.state === "queued" || job.state === "running")
      return NextResponse.json(view(sub, { stage: job.stage ?? null, position: job.position ?? null }));
    // a rung passes when timing is met at the typical corner and every sign-off check passed; a failed job is a miss
    const v = job.state === "done" ? layoutVerdict(job.results) : null;
    cur.pass = !!v && v.clean && v.slack != null && v.slack >= 0;
    cur.slackNs = v?.slack ?? null;
    return NextResponse.json(view(await advance(sub, sweep, base, user.id, sub.speedJobId)));
  } catch (err) {
    await reportError("[speed-entry] poll failed:", err);
    return NextResponse.json(view(sub));   // service unreachable: still pending, ask again later
  }
}

export async function POST(request: Request, { params }: { params: { slug: string } }) {
  const user = await getSessionUser();
  if (!user) return signInRequired();
  if (!layoutConfigured()) return NextResponse.json({ error: "Chip layout isn't available yet." }, { status: 503 });
  const { sub, error } = await latestAccepted(user.id, params.slug);
  if (error) return error;
  if (!sub) return NextResponse.json({ error: "Solve the problem first." }, { status: 400 });
  const base = baseOf(sub);
  if (!base) return NextResponse.json({ error: "Lay out your solution on the After layout tab first: the speed run starts from a clean layout." }, { status: 400 });
  if (sub.speedState === "pending") return NextResponse.json(view(sub));
  const { success } = await rateLimit(request, { limit: 6, windowMs: 10 * 60_000, prefix: "layout", key: `user:${user.id}` });
  if (!success) return NextResponse.json({ error: "Too many layouts. Please wait a few minutes." }, { status: 429 });

  try {
    const converted = await designAsVerilog(sub.designCode, sub.language);
    if ("error" in converted) return NextResponse.json({ error: converted.error }, { status: 422 });
    const asic = await asicOnBackend({ design_v: converted.verilog, testbench_v: null, period_ns: base.periodNs, clock: null });
    const top = asic.data?.top, clock = asic.data?.timing?.clock;
    if (asic.status !== 200 || !asic.data?.ok || typeof top !== "string") return NextResponse.json({ error: asic.data?.error || "Synthesis failed." }, { status: 422 });
    if (!clock) return NextResponse.json({ error: "This design has no clock, so there's no clock speed to measure." }, { status: 400 });
    return NextResponse.json(view(await advance(sub, { top, clock, runs: [] }, base, user.id, sub.speedJobId)));
  } catch (err) {
    await reportError("[speed-entry] start failed:", err);
    return NextResponse.json({ error: "The layout service didn't answer. Try again in a minute." }, { status: 502 });
  }
}
