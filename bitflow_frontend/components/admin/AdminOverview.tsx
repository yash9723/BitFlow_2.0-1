"use client";
/** components/admin/AdminOverview.tsx — the console's first tab: health of the site at a glance. */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Card, Failed, Loading, Stat, getJson, pct } from "./ui";

interface Day { day: string; runs: number; submits: number; accepted: number; signups: number }
interface ProblemStat { slug: string; title: string; href: string; submits: number; accepted: number; rate: number }
interface Overview {
  users:       { total: number; new7d: number; active7d: number };
  submissions: { total: number; last7d: number; acceptRate7d: number | null };
  perDay:      Day[];
  problems:    { total: number; withReference: number; needsMutants: string[]; noReference: string[] };
  mostAttempted: ProblemStat[];
  hardest:       ProblemStat[];
  errors7d:    number;
}

/** Runs + submits per day as stacked bars, accepted submits as the brighter part. */
function ActivityChart({ days }: { days: Day[] }) {
  const max = Math.max(1, ...days.map((d) => d.runs + d.submits));
  const W = 28, H = 120;
  return (
    <div className="space-y-2">
      <svg viewBox={`0 0 ${days.length * W} ${H + 18}`} className="w-full h-[150px]" role="img"
           aria-label="Runs and submissions per day, last 14 days">
        {days.map((d, i) => {
          const total = d.runs + d.submits, h = (total / max) * H, hs = (d.submits / max) * H, ha = (d.accepted / max) * H;
          const x = i * W + 4;
          return (
            <g key={d.day}>
              <title>{`${d.day}: ${d.runs} runs, ${d.submits} submits (${d.accepted} accepted), ${d.signups} sign-ups`}</title>
              <rect x={x} y={H - h} width={W - 8} height={h} fill="#4db8ff" opacity={0.25} rx={2} />
              <rect x={x} y={H - hs} width={W - 8} height={hs} fill="#4db8ff" opacity={0.55} rx={2} />
              <rect x={x} y={H - ha} width={W - 8} height={ha} fill="#00e87a" opacity={0.9} rx={2} />
              {d.signups > 0 && <circle cx={x + (W - 8) / 2} cy={H - h - 6} r={2.5} fill="#ffb84d" />}
              <text x={x + (W - 8) / 2} y={H + 13} textAnchor="middle" fontSize={8} fill="#80839d">{d.day.slice(8)}</text>
            </g>
          );
        })}
      </svg>
      <div className="flex flex-wrap gap-4 text-[9px] text-dim">
        <span><span className="inline-block w-2 h-2 mr-1 rounded-sm" style={{ background: "#4db8ff", opacity: 0.3 }} />runs</span>
        <span><span className="inline-block w-2 h-2 mr-1 rounded-sm" style={{ background: "#4db8ff", opacity: 0.6 }} />submits</span>
        <span><span className="inline-block w-2 h-2 mr-1 rounded-sm" style={{ background: "#00e87a" }} />accepted</span>
        <span><span className="inline-block w-2 h-2 mr-1 rounded-full" style={{ background: "#ffb84d" }} />sign-ups that day</span>
      </div>
    </div>
  );
}

function ProblemList({ rows, empty }: { rows: ProblemStat[]; empty: string }) {
  if (!rows.length) return <p className="text-[10px] text-dim">{empty}</p>;
  return (
    <table className="w-full text-[10px]">
      <tbody>
        {rows.map((r) => (
          <tr key={r.slug} className="border-b border-rim/20 last:border-0">
            <td className="py-1.5 pr-2"><Link href={r.href} className="text-pale hover:text-info">{r.title}</Link></td>
            <td className="py-1.5 text-right text-dim whitespace-nowrap">{r.submits} submits</td>
            <td className={`py-1.5 pl-3 text-right font-bold ${r.rate < 0.3 ? "text-danger" : r.rate < 0.6 ? "text-warn" : "text-phosphor"}`}>{pct(r.rate)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Pings the simulator API through /api/simulate/health (it wakes it if it's asleep). */
function SimulatorStatus() {
  const [state, setState] = useState<{ ok: boolean; ms: number } | "checking">("checking");
  const check = useCallback(async () => {
    setState("checking");
    const t0 = performance.now();
    const ok = await fetch("/api/simulate/health").then((r) => r.ok, () => false);
    setState({ ok, ms: Math.round(performance.now() - t0) });
  }, []);
  useEffect(() => { check(); }, [check]);
  if (state === "checking") return <Stat label="Simulator API" value="…" hint="checking (a cold start takes up to a minute)" tone="info" />;
  return <Stat label="Simulator API" value={state.ok ? "Up" : "Down"} tone={state.ok ? (state.ms > 5000 ? "warn" : "phosphor") : "danger"}
               hint={<>{state.ok ? `${state.ms} ms${state.ms > 5000 ? " (was asleep)" : ""}` : "no response"} · <button onClick={check} className="underline">recheck</button></>} />;
}

export default function AdminOverview() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => { setError(null); getJson<Overview>("/api/admin/overview").then(setData, (e) => setError(e.message)); }, []);
  useEffect(load, [load]);

  if (error) return <Failed message={error} retry={load} />;
  if (!data) return <Loading what="overview" />;
  const attention = data.problems.needsMutants.length + data.problems.noReference.length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <Stat label="Users" value={data.users.total} hint={`+${data.users.new7d} this week`} />
        <Stat label="Active (7 d)" value={data.users.active7d} hint="ran or submitted code" tone="phosphor" />
        <Stat label="Runs + submits (7 d)" value={data.submissions.last7d} hint={`${data.submissions.total} all time`} tone="info" />
        <Stat label="Accept rate (7 d)" value={pct(data.submissions.acceptRate7d)} hint="of graded submits" tone="phosphor" />
        <Stat label="Errors (7 d)" value={data.errors7d} hint="server + browser" tone={data.errors7d ? "warn" : "phosphor"} />
        <SimulatorStatus />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Card title="Activity, last 14 days" subtitle="Hover a bar for the numbers" className="xl:col-span-2">
          <ActivityChart days={data.perDay} />
        </Card>
        <Card title="Needs attention" subtitle={`${data.problems.withReference} of ${data.problems.total} problems have a reference solution`}>
          {attention === 0 ? (
            <p className="text-[10px] text-phosphor">Every problem is fully set up.</p>
          ) : (
            <div className="space-y-3 text-[10px]">
              {data.problems.needsMutants.length > 0 && (
                <div>
                  <div className="text-danger font-bold">Can&apos;t be solved yet ({data.problems.needsMutants.length})</div>
                  <p className="text-dim">Testbench / formal problems with no bugs imported. Upload their model in Problems → Reference solutions.</p>
                  <p className="text-ghost break-words">{data.problems.needsMutants.join(", ")}</p>
                </div>
              )}
              {data.problems.noReference.length > 0 && (
                <div>
                  <div className="text-warn font-bold">No reference solution ({data.problems.noReference.length})</div>
                  <p className="text-dim">Still gradable, but wrong answers get no waveform diff or counterexample.</p>
                  <p className="text-ghost break-words">{data.problems.noReference.slice(0, 20).join(", ")}{data.problems.noReference.length > 20 ? " …" : ""}</p>
                </div>
              )}
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Hardest problems (30 d)" subtitle="Lowest accept rate, at least 5 submits">
          <ProblemList rows={data.hardest} empty="Not enough submissions yet." />
        </Card>
        <Card title="Most attempted (30 d)">
          <ProblemList rows={data.mostAttempted} empty="No submissions yet." />
        </Card>
      </div>
    </div>
  );
}
