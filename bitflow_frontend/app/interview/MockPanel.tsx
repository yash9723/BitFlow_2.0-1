"use client";
/** The mock interview card on /interview: start or resume one, and past results. */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDuration, useServerClock } from "../contests/clock";
import { MOCK_MINUTES } from "@/lib/interview";

type Report = { id: string; startedAt: string; endsAt: string; running: boolean; solved: number; problems: unknown[] };
type Data = { now: string; active: Report | null; history: Report[] };

export default function MockPanel() {
  const router = useRouter();
  const [data, setData] = useState<Data | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const now = useServerClock(data?.now);

  useEffect(() => {
    fetch("/api/interview/mock")
      .then(async (r) => (r.ok ? r.json() : Promise.reject((await r.json().catch(() => ({}))).error ?? "Couldn't load your mock interviews.")))
      .then(setData)
      .catch((e) => setError(String(e)));
  }, []);

  async function start() {
    setStarting(true);
    setError(null);
    try {
      const r = await fetch("/api/interview/mock", { method: "POST" });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error ?? "Couldn't start the mock interview.");
      router.push(`/interview/mock/${body.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStarting(false);
    }
  }

  const active = data?.active && new Date(data.active.endsAt).getTime() > now ? data.active : null;

  return (
    <section className="border border-phosphor/30 rounded-xl p-5 bg-pit space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-lg text-bright">Mock interview</h2>
          <p className="text-[12.5px] text-ghost mt-1 max-w-xl">
            One easy, one medium and one hard problem in {MOCK_MINUTES} minutes, chosen from ones you haven&apos;t solved where possible.
            The AI tutor is off for the whole mock, and hints and editorials are closed on its problems. You get a report at the end.
          </p>
        </div>
        {active ? (
          <Link href={`/interview/mock/${active.id}`} className="shrink-0 text-center px-4 py-2 rounded-lg bg-phosphor text-void text-[13px] font-bold hover:opacity-90">
            Resume · {formatDuration(new Date(active.endsAt).getTime() - now)} left
          </Link>
        ) : (
          <button onClick={start} disabled={starting || !data} className="shrink-0 px-4 py-2 rounded-lg bg-phosphor text-void text-[13px] font-bold hover:opacity-90 disabled:opacity-50">
            {starting ? "Starting…" : "Start the clock"}
          </button>
        )}
      </div>
      {error && <p role="alert" className="text-[12px] text-danger">{error}</p>}
      {!!data?.history.length && (
        <div>
          <h3 className="text-[10px] uppercase tracking-wider text-dim mb-1">Past mocks</h3>
          <ul className="text-[12px] divide-y divide-rim/40">
            {data.history.map((m) => (
              <li key={m.id}>
                <Link href={`/interview/mock/${m.id}`} className="flex items-center justify-between gap-3 py-1.5 text-pale hover:text-bright">
                  <span>{new Date(m.startedAt).toLocaleString()}</span>
                  <span className="font-mono">{m.solved}/{m.problems.length} solved</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
