"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useServerClock, formatDuration } from "../clock";

type Result = { solved: boolean; wrong: number; minutes: number | null };
type Row = { rank: number; username: string; solved: number; penalty: number; problems: Record<string, Result>; isMe: boolean };
type Data = {
  now: string;
  penaltyMinutes: number;
  contest: { id: string; title: string; startsAt: string; endsAt: string; status: "upcoming" | "running" | "ended" };
  problems: { label: string; slug: string; title: string; difficulty: string; href: string }[];
  standings: Row[];
  me: Row | null;
};

const REFRESH_MS = 15_000;

function Cell({ r }: { r?: Result }) {
  if (!r) return <span className="text-dim">·</span>;
  if (r.solved) {
    return (
      <span className="text-phosphor" title={`Solved at ${r.minutes} min${r.wrong ? ` after ${r.wrong} wrong` : ""}`}>
        +{r.wrong || ""}<span className="block text-[9px] text-dim">{r.minutes}m</span>
      </span>
    );
  }
  return <span className="text-danger" title={`${r.wrong} wrong`}>−{r.wrong}</span>;
}

export default function ContestPage({ params }: { params: { id: string } }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const now = useServerClock(data?.now);

  const load = useCallback(() => {
    fetch(`/api/contests/${encodeURIComponent(params.id)}`)
      .then(async (r) => (r.ok ? r.json() : Promise.reject((await r.json().catch(() => ({}))).error ?? "Couldn't load the contest.")))
      .then((d) => { setData(d); setError(null); })
      .catch((e) => setError(String(e)));
  }, [params.id]);

  useEffect(() => { load(); }, [load]);

  const start = data ? new Date(data.contest.startsAt).getTime() : 0;
  const end = data ? new Date(data.contest.endsAt).getTime() : 0;
  const status = !data ? null : now < start ? "upcoming" : now < end ? "running" : "ended";

  // Live standings while running; also reload once when the contest starts or ends.
  useEffect(() => {
    if (status !== "running") return;
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, [status, load]);
  const lastStatus = useRef(status);
  useEffect(() => {
    if (lastStatus.current && status !== lastStatus.current) load();
    lastStatus.current = status;
  }, [status, load]);

  if (error && !data) {
    return <div className="space-y-3"><p className="text-[13px] text-danger">{error}</p><Link href="/contests" className="text-[12px] text-info hover:underline">← All contests</Link></div>;
  }
  if (!data) return <p className="text-[12px] text-dim">Loading…</p>;

  const meListed = data.standings.some((r) => r.isMe);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/contests" className="text-[11px] text-dim hover:text-ghost">← All contests</Link>
        <h1 className="font-serif text-3xl mt-1">{data.contest.title}</h1>
        <p className="text-[12px] text-ghost mt-1">
          {new Date(data.contest.startsAt).toLocaleString()} – {new Date(data.contest.endsAt).toLocaleString()}
        </p>
      </div>

      <div className={`border rounded-xl p-4 bg-pit flex flex-wrap items-center justify-between gap-2 ${status === "running" ? "border-phosphor/40" : "border-rim"}`}>
        <span className="text-[11px] uppercase tracking-wider text-ghost">
          {status === "upcoming" ? "Starts in" : status === "running" ? "Ends in" : "Contest over"}
        </span>
        {status !== "ended" && (
          <span className="font-mono text-2xl text-bright" aria-live="off">{formatDuration((status === "upcoming" ? start : end) - now)}</span>
        )}
      </div>

      {status === "upcoming" ? (
        <p className="text-[12px] text-ghost">The problems appear here when the contest starts.</p>
      ) : (
        <>
          <section>
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-bright mb-2">Problems</h2>
            <ul className="grid sm:grid-cols-2 gap-2">
              {data.problems.map((p) => (
                <li key={p.slug}>
                  <Link href={p.href} className="flex items-center gap-3 border border-rim rounded-lg px-3 py-2 bg-pit hover:border-phosphor/40 transition-colors">
                    <span className="font-mono text-phosphor">{p.label}</span>
                    <span className="text-[13px] text-pale truncate">{p.title}</span>
                    <span className="ml-auto text-[10px] text-dim">{p.difficulty}</span>
                  </Link>
                </li>
              ))}
            </ul>
            <p className="text-[10px] text-dim mt-2">
              Only Submits made during the contest count, even for problems you solved before.
              Penalty: minutes from the start to each solve, plus {data.penaltyMinutes} per wrong Submit before it.
            </p>
          </section>

          <section>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-[11px] font-bold uppercase tracking-wider text-bright">Standings</h2>
              {status === "running" && <span className="text-[10px] text-dim">updates every {REFRESH_MS / 1000} s</span>}
            </div>
            {data.standings.length === 0 ? (
              <p className="text-[12px] text-dim">No submissions yet.</p>
            ) : (
              <div className="overflow-x-auto border border-rim rounded-xl bg-pit">
                <table className="w-full text-[12px] font-mono">
                  <thead>
                    <tr className="text-dim text-left border-b border-rim">
                      <th className="font-normal px-3 py-2">#</th>
                      <th className="font-normal px-3 py-2">Who</th>
                      <th className="font-normal px-3 py-2 text-right">Solved</th>
                      <th className="font-normal px-3 py-2 text-right">Penalty</th>
                      {data.problems.map((p) => <th key={p.slug} className="font-normal px-2 py-2 text-center" title={p.title}>{p.label}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {[...data.standings, ...(data.me && !meListed ? [data.me] : [])].map((r) => (
                      <tr key={r.username} className={`border-b border-rim/40 last:border-0 ${r.isMe ? "bg-phosphor/5 text-phosphor" : "text-pale"}`}>
                        <td className="px-3 py-2">{r.rank}</td>
                        <td className="px-3 py-2 truncate max-w-[10rem]">{r.username}</td>
                        <td className="px-3 py-2 text-right">{r.solved}</td>
                        <td className="px-3 py-2 text-right">{r.penalty}</td>
                        {data.problems.map((p) => <td key={p.slug} className="px-2 py-2 text-center"><Cell r={r.problems[p.slug]} /></td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
