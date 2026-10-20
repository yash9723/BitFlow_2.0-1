"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Entry = { rank: number; username: string; profile: boolean; totalXp: number; solved: number; isMe: boolean };
type Mine = { username: string; totalXp: number; solved: number; rank: number | null } | null;
type Daily = {
  date: string;
  bonusXp: number;
  claimedToday: boolean;
  problem: { title: string; difficulty: string; learningLevel: string; xpReward: number; href: string } | null;
};

const PODIUM = ["text-warn", "text-pale", "text-info"]; // 1st, 2nd, 3rd

export default function LeaderboardPage() {
  const [board, setBoard] = useState<{ entries: Entry[]; me: Mine } | null>(null);
  const [daily, setDaily] = useState<Daily | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch("/api/leaderboard")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setBoard)
      .catch(() => setFailed(true));
    fetch("/api/daily")
      .then((r) => (r.ok ? r.json() : null))
      .then(setDaily)
      .catch(() => {});
  }, []);

  const meOnBoard = board?.entries.some((e) => e.isMe);

  return (
    <div className="min-h-screen bg-void text-bright">
      <header className="sticky top-0 z-10 h-14 flex items-center justify-between px-6 border-b border-rim/50 bg-void/80 backdrop-blur-md">
        <Link href="/" className="font-display font-bold text-lg hover:text-phosphor transition-colors">
          BitFlow
        </Link>
        <nav className="flex items-center gap-4 sm:gap-6 text-[12px] text-ghost">
          <Link href="/sandbox" className="hidden sm:inline hover:text-bright transition-colors">Sandbox IDE</Link>
          <Link href="/learn" className="hover:text-bright transition-colors">Learning</Link>
          <Link href="/arena" className="hover:text-bright transition-colors">Arena</Link>
          <span className="text-phosphor" aria-current="page">Leaderboard</span>
        </nav>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        <div>
          <h1 className="font-serif text-3xl">Leaderboard</h1>
          <p className="text-[12px] text-ghost mt-1">
            Ranked by total XP. Solve problems — and the daily challenge — to climb.
          </p>
        </div>

        {daily?.problem && (
          <Link
            href={daily.problem.href}
            className="block border border-phosphor/30 rounded-xl p-5 bg-pit hover:border-phosphor/60 transition-colors group"
          >
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-[0.18em] text-phosphor mb-1">
                  Daily challenge · {daily.date}
                </div>
                <div className="font-serif text-lg text-bright group-hover:text-phosphor transition-colors truncate">
                  {daily.problem.title}
                </div>
                <div className="text-[11px] text-dim mt-1">
                  {daily.problem.learningLevel} · {daily.problem.difficulty}
                </div>
              </div>
              <div className="text-right shrink-0">
                {daily.claimedToday ? (
                  <span className="text-[11px] text-phosphor">✓ Bonus claimed</span>
                ) : (
                  <span className="text-[11px] text-warn">+{daily.bonusXp} XP bonus today</span>
                )}
              </div>
            </div>
          </Link>
        )}

        <div className="border border-rim rounded-xl bg-pit overflow-x-auto">
          {failed ? (
            <div className="p-6 text-[12px] text-danger">Couldn&apos;t load the leaderboard. Try refreshing.</div>
          ) : !board ? (
            <div className="p-6 text-[12px] text-ghost">
              <span className="text-phosphor">►</span> loading leaderboard<span className="animate-blink">_</span>
            </div>
          ) : board.entries.length === 0 ? (
            <div className="p-6 text-[12px] text-dim">
              No one has earned XP yet — solve a problem to take the top spot.
            </div>
          ) : (
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-dim border-b border-rim">
                  <th scope="col" className="text-left font-normal px-5 py-3 w-16">Rank</th>
                  <th scope="col" className="text-left font-normal px-2 py-3">Student</th>
                  <th scope="col" className="text-right font-normal px-2 py-3 w-24">Solved</th>
                  <th scope="col" className="text-right font-normal px-5 py-3 w-28">XP</th>
                </tr>
              </thead>
              <tbody>
                {board.entries.map((e) => (
                  <tr
                    key={e.username}
                    className={`border-b border-rim/40 last:border-0 ${e.isMe ? "bg-phosphor/10" : "hover:bg-void/40"}`}
                  >
                    <td className={`px-5 py-2.5 font-semibold ${PODIUM[e.rank - 1] ?? "text-ghost"}`}>
                      #{e.rank}
                    </td>
                    <td className="px-2 py-2.5 text-pale truncate max-w-0 w-full">
                      {e.profile
                        ? <Link href={`/u/${encodeURIComponent(e.username)}`} className="hover:text-phosphor hover:underline">{e.username}</Link>
                        : e.username}
                      {e.isMe && <span className="ml-2 text-[10px] text-phosphor uppercase tracking-wider">you</span>}
                    </td>
                    <td className="px-2 py-2.5 text-right text-ghost">{e.solved}</td>
                    <td className="px-5 py-2.5 text-right text-phosphor font-semibold">{e.totalXp.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {board?.me && !meOnBoard && (
          <div className="border border-rim rounded-xl p-5 bg-pit flex items-center justify-between text-[12.5px]">
            <span className="text-ghost">
              Your standing:{" "}
              <span className="text-bright font-semibold">
                {board.me.rank ? `#${board.me.rank}` : "unranked — earn XP to join"}
              </span>
            </span>
            <span className="text-ghost">
              {board.me.solved} solved · <span className="text-phosphor font-semibold">{board.me.totalXp.toLocaleString()} XP</span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
