"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useServerClock, formatDuration } from "./clock";

type Contest = { id: string; title: string; startsAt: string; endsAt: string; status: "upcoming" | "running" | "ended"; problems: number };

const STATUS_STYLE = {
  running:  "text-phosphor border-phosphor/40",
  upcoming: "text-info border-info/40",
  ended:    "text-dim border-rim",
};

export default function ContestsPage() {
  const [data, setData] = useState<{ now: string; contests: Contest[] } | null>(null);
  const [failed, setFailed] = useState(false);
  const now = useServerClock(data?.now);

  useEffect(() => {
    fetch("/api/contests")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setFailed(true));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl">Contests</h1>
        <p className="text-[12px] text-ghost mt-1">
          Timed problem sets with live standings: most problems solved wins, ties go to the lower penalty time.
        </p>
      </div>

      {failed && <p className="text-[12px] text-danger">Couldn&apos;t load contests.</p>}
      {data && data.contests.length === 0 && <p className="text-[12px] text-dim">No contests yet.</p>}

      <ul className="space-y-3">
        {data?.contests.map((c) => {
          const start = new Date(c.startsAt).getTime(), end = new Date(c.endsAt).getTime();
          const status = now < start ? "upcoming" : now < end ? "running" : "ended";
          return (
            <li key={c.id}>
              <Link href={`/contests/${c.id}`}
                    className="flex flex-wrap items-center justify-between gap-3 border border-rim rounded-xl p-4 bg-pit hover:border-phosphor/40 transition-colors">
                <div className="min-w-0">
                  <div className="font-serif text-lg truncate">{c.title}</div>
                  <div className="text-[11px] text-dim">
                    {new Date(c.startsAt).toLocaleString()} · {formatDuration(end - start)} · {c.problems} problem{c.problems === 1 ? "" : "s"}
                  </div>
                </div>
                <div className="text-right">
                  <span className={`inline-block text-[10px] uppercase tracking-wider border rounded px-2 py-0.5 ${STATUS_STYLE[status]}`}>{status}</span>
                  <div className="text-[11px] text-ghost mt-1">
                    {status === "upcoming" && <>starts in {formatDuration(start - now)}</>}
                    {status === "running" && <>ends in {formatDuration(end - now)}</>}
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
