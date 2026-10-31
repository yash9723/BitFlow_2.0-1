"use client";
/** On problem pages during a mock interview: the time left and a way back to the mock. */
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { formatDuration, useServerClock } from "@/app/contests/clock";

type Active = { id: string; endsAt: string };

export default function MockBanner() {
  const pathname = usePathname() ?? "/";
  const onProblem = /^\/(problems|arena)\/.+/.test(pathname);
  const [active, setActive] = useState<Active | null>(null);
  const [serverNow, setServerNow] = useState<string>();
  const now = useServerClock(serverNow);

  useEffect(() => {
    if (!onProblem) { setActive(null); return; }
    fetch("/api/interview/mock").then((r) => (r.ok ? r.json() : null)).then((d) => {
      setActive(d?.active ?? null);
      setServerNow(d?.now);
    }).catch(() => {});
  }, [onProblem, pathname]);

  if (!onProblem || !active) return null;
  const left = new Date(active.endsAt).getTime() - now;
  return (
    <Link href={`/interview/mock/${active.id}`}
          className="fixed bottom-4 left-4 z-40 flex items-center gap-2 px-3 py-1.5 rounded-full border border-phosphor/50 bg-pit shadow-2xl font-mono text-[12px] text-pale hover:text-bright">
      <span className={left > 0 ? "text-phosphor" : "text-danger"}>{left > 0 ? formatDuration(left) : "Time's up"}</span>
      <span>Back to the mock</span>
    </Link>
  );
}
