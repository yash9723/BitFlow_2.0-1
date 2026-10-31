"use client";
/** One mock interview: the clock and problems while it runs, the report once it ends. */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { formatDuration, useServerClock } from "../../../contests/clock";

type Problem = { slug: string; title: string; difficulty: string; href: string; solved: boolean; attempts: number; minutes: number | null; gateCount: number | null };
type Mock = { id: string; startedAt: string; endsAt: string; running: boolean; solved: number; problems: Problem[] };
type Data = { now: string; mock: Mock };

const REFRESH_MS = 15_000;
const OK = async (r: Response) => (r.ok ? r.json() : Promise.reject((await r.json().catch(() => ({}))).error ?? "Couldn't load this mock interview."));

export default function MockInterviewPage({ params }: { params: { id: string } }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ending, setEnding] = useState(false);
  const now = useServerClock(data?.now);
  const url = `/api/interview/mock/${encodeURIComponent(params.id)}`;

  const load = useCallback(() => {
    fetch(url).then(OK).then((d) => { setData(d); setError(null); }).catch((e) => setError(String(e)));
  }, [url]);

  useEffect(() => { load(); }, [load]);

  const end = data ? new Date(data.mock.endsAt).getTime() : 0;
  const running = !!data && now < end;

  useEffect(() => {
    if (!running) return;
    const t = setInterval(load, REFRESH_MS);
    window.addEventListener("focus", load);
    return () => { clearInterval(t); window.removeEventListener("focus", load); };
  }, [running, load]);
  // Reload once when time runs out, for the final results.
  const wasRunning = useRef(false);
  useEffect(() => {
    if (wasRunning.current && !running) load();
    wasRunning.current = running;
  }, [running, load]);

  async function endNow() {
    if (!window.confirm("End the mock now? Submits after this won't count.")) return;
    setEnding(true);
    await fetch(url, { method: "POST" }).then(OK).then(setData).catch((e) => setError(String(e)));
    setEnding(false);
  }

  if (error && !data) {
    return <div className="space-y-3"><p className="text-[13px] text-danger">{error}</p><Link href="/interview" className="text-[12px] text-info hover:underline">← Interview prep</Link></div>;
  }
  if (!data) return <p className="text-[12px] text-dim">Loading…</p>;

  const { mock } = data;
  const took = Math.max(0, end - new Date(mock.startedAt).getTime());

  return (
    <div className="space-y-6">
      <div>
        <Link href="/interview" className="text-[11px] text-dim hover:text-ghost">← Interview prep</Link>
        <h1 className="font-serif text-3xl mt-1">{running ? "Mock interview" : "Mock interview report"}</h1>
        <p className="text-[12px] text-ghost mt-1">Started {new Date(mock.startedAt).toLocaleString()}</p>
      </div>

      {running ? (
        <div className="border border-phosphor/40 rounded-xl p-4 bg-pit flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-ghost">Time left</div>
            <div className="font-mono text-2xl text-bright" aria-live="off">{formatDuration(end - now)}</div>
          </div>
          <button onClick={endNow} disabled={ending} className="px-3 py-1.5 rounded-lg border border-rim text-[12px] text-pale hover:text-bright hover:border-muted disabled:opacity-50">
            {ending ? "Ending…" : "End now"}
          </button>
        </div>
      ) : (
        <div className="border border-rim rounded-xl p-4 bg-pit">
          <div className="font-mono text-2xl text-bright">{mock.solved} of {mock.problems.length} solved</div>
          <p className="text-[12px] text-ghost mt-1">Finished after {formatDuration(took)}.</p>
        </div>
      )}

      <div className="overflow-x-auto border border-rim rounded-xl bg-pit">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-dim text-left border-b border-rim font-mono">
              <th className="font-normal px-3 py-2">Problem</th>
              <th className="font-normal px-3 py-2">Level</th>
              <th className="font-normal px-3 py-2">Result</th>
              <th className="font-normal px-3 py-2 text-right" title="Minutes from the start of the mock to the accepted Submit">Solved at</th>
              <th className="font-normal px-3 py-2 text-right">Submits</th>
              <th className="font-normal px-3 py-2 text-right" title="Two-input gates and muxes after synthesis">Gates</th>
            </tr>
          </thead>
          <tbody>
            {mock.problems.map((p) => (
              <tr key={p.slug} className="border-b border-rim/40 last:border-0 text-pale">
                <td className="px-3 py-2"><Link href={p.href} className="text-info hover:underline">{p.title}</Link></td>
                <td className="px-3 py-2">{p.difficulty}</td>
                <td className={`px-3 py-2 ${p.solved ? "text-phosphor" : running ? "text-dim" : "text-danger"}`}>{p.solved ? "Solved" : running ? "Open" : "Not solved"}</td>
                <td className="px-3 py-2 text-right font-mono">{p.minutes === null ? "–" : `${p.minutes} min`}</td>
                <td className="px-3 py-2 text-right font-mono">{p.attempts}</td>
                <td className="px-3 py-2 text-right font-mono">{p.gateCount ?? "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-dim">
        {running
          ? "Only Submit counts, not Run, even on a problem you solved before. The AI tutor is off until the mock ends, and hints and editorials are closed on these problems."
          : "Only Submits made during the mock are counted. Hints, editorials and the AI tutor are open again."}
      </p>
    </div>
  );
}
