"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AuthGate from "@/components/AuthGate";
import { useAuth } from "../../hooks/useAuth";

type ProfileData = {
  user: { id: string; username: string; role: string; createdAt: string };
  totalXp: number;
  totalSolved: number;
  totalProblems: number;
  solvedByDifficulty: Record<string, number>;
  totalByDifficulty: Record<string, number>;
  totalSubmissions: number;
  totalActiveDays: number;
  maxStreak: number;
  activity: Record<string, number>;
  recentAC: Array<{ title: string; slug: string; href: string; difficulty: string; submittedAt: string }>;
  badges: Array<{ id: string; label: string; description: string; earned: boolean }>;
  dailyStreak: number;
};

// The API folds beginner/intermediate/advanced into Easy/Medium/Hard
const DIFF_ORDER = ["Easy", "Medium", "Hard", "Expert"];
const DIFF_COLOR: Record<string, { ring: string; text: string; bg: string }> = {
  Easy:   { ring: "#00e87a", text: "text-phosphor", bg: "bg-phosphor/10" },
  Medium: { ring: "#4db8ff", text: "text-info",     bg: "bg-info/10" },
  Hard:   { ring: "#ffb84d", text: "text-warn",     bg: "bg-warn/10" },
  Expert: { ring: "#ff4f4f", text: "text-danger",   bg: "bg-danger/10" },
};
const OTHER_COLOR = { ring: "#7a7d96", text: "text-ghost", bg: "bg-void/40" };
const diffColor = (d: string) => DIFF_COLOR[d] ?? OTHER_COLOR;

function tierFromXp(xp: number) {
  if (xp >= 7000) return { label: "Architect", color: "text-phosphor-glow" };
  if (xp >= 3000) return { label: "Engineer", color: "text-phosphor" };
  if (xp >= 1000) return { label: "Builder", color: "text-info" };
  return { label: "Novice", color: "text-ghost" };
}

// Build a 53-week x 7-day grid ending today, Sunday-aligned, for the heatmap.
function buildHeatmapWeeks(activity: Record<string, number>) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(today);
  start.setDate(start.getDate() - 364);
  // Roll back to the Sunday on/before start so columns align to full weeks.
  const startDow = start.getDay();
  start.setDate(start.getDate() - startDow);

  const weeks: { date: Date; key: string; count: number }[][] = [];
  let cursor = new Date(start);
  let week: { date: Date; key: string; count: number }[] = [];

  while (cursor <= today) {
    const key = cursor.toISOString().slice(0, 10);
    week.push({ date: new Date(cursor), key, count: activity[key] || 0 });
    if (cursor.getDay() === 6) {
      weeks.push(week);
      week = [];
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  if (week.length) weeks.push(week);
  return weeks;
}

function levelForCount(count: number) {
  if (count <= 0) return "bg-rim/60";
  if (count === 1) return "bg-phosphor/30";
  if (count === 2) return "bg-phosphor/60";
  return "bg-phosphor";
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function ProfileContent() {
  const { user, logout } = useAuth();
  const [data, setData] = useState<ProfileData | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [editMsg, setEditMsg] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then((json) => setData(json))
      .catch(() => setData(null))
      .finally(() => setLoadingStats(false));
  }, []);

  if (loadingStats || !data || !data.user) {
    return (
      <div className="min-h-screen bg-void text-bright flex items-center justify-center">
        <span className="text-ghost text-sm">
          <span className="text-phosphor">►</span> loading profile
          <span className="animate-blink">_</span>
        </span>
      </div>
    );
  }

  // Known bands first, then any tier the mapping doesn't know, so the ring always sums to totalSolved
  const diffs = [...DIFF_ORDER, ...Object.keys(data.totalByDifficulty).filter((d) => !DIFF_ORDER.includes(d))];
  const weeks = buildHeatmapWeeks(data.activity);
  const tier = tierFromXp(data.totalXp);
  const memberSince = new Date(data.user.createdAt).toLocaleDateString("en-US", { month: "long", year: "numeric" });

  // Month label positions — the week index where each new month first appears.
  const monthLabels: { index: number; label: string }[] = [];
  let lastMonth = -1;
  weeks.forEach((w, i) => {
    const m = w[0].date.getMonth();
    if (m !== lastMonth) {
      monthLabels.push({ index: i, label: MONTH_NAMES[m] });
      lastMonth = m;
    }
  });

  return (
    <div className="min-h-screen bg-void text-bright">
      {/* Nav */}
      <header className="sticky top-0 z-10 h-14 flex items-center justify-between px-6 border-b border-rim/50 bg-void/80 backdrop-blur-md">
        <Link href="/" className="font-display font-bold text-lg hover:text-phosphor transition-colors">
          BitFlow
        </Link>
        <div className="flex items-center gap-6 text-[12px] text-ghost">
          <Link href="/sandbox" className="hover:text-bright transition-colors">Sandbox IDE</Link>
          <Link href="/learn" className="hover:text-bright transition-colors">Learning</Link>
          <Link href="/academy" className="hover:text-bright transition-colors">Academy</Link>
          <Link href="/arena" className="hover:text-bright transition-colors">Arena</Link>
          <Link href="/leaderboard" className="hidden sm:inline hover:text-bright transition-colors">Leaderboard</Link>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        {/* ── Left sidebar ─────────────────────────────────────────── */}
        <aside className="space-y-6">
          <div className="border border-rim rounded-xl p-5 bg-pit">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-16 h-16 rounded-full bg-phosphor text-void flex items-center justify-center font-display font-bold text-2xl shrink-0">
                {data.user.username.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="font-serif text-lg text-bright truncate">{data.user.username}</div>
                <div className={`text-[10px] uppercase tracking-wider ${tier.color}`}>{tier.label}</div>
              </div>
            </div>
            <div className="text-[11px] text-dim mb-4">Member since {memberSince}</div>
            <div className="flex gap-2">
              <button
                onClick={() => setEditMsg("Profile editing is coming soon.")}
                className="flex-1 py-2 rounded-lg border border-rim text-[11px] font-semibold uppercase tracking-wider text-ghost hover:border-phosphor/40 hover:text-phosphor transition-colors"
              >
                Edit Profile
              </button>
              <button
                onClick={async () => {
                  setLoggingOut(true);
                  await logout();
                }}
                disabled={loggingOut}
                className="flex-1 py-2 rounded-lg border border-danger/30 text-[11px] font-semibold uppercase tracking-wider text-danger hover:bg-danger/10 transition-colors disabled:opacity-50"
              >
                {loggingOut ? "Logging out…" : "Logout"}
              </button>
            </div>
            {editMsg && <div className="text-[10px] text-dim mt-2">{editMsg}</div>}
          </div>

          <div className="border border-rim rounded-xl p-5 bg-pit">
            <div className="text-[11px] font-bold uppercase tracking-wider text-bright mb-4">Stats</div>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-[12px]">
                <span className="text-ghost">Total XP</span>
                <span className="text-phosphor font-semibold">{data.totalXp.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between text-[12px]">
                <span className="text-ghost">Problems Solved</span>
                <span className="text-bright font-semibold">{data.totalSolved}</span>
              </div>
              <div className="flex items-center justify-between text-[12px]">
                <span className="text-ghost">Active Days</span>
                <span className="text-bright font-semibold">{data.totalActiveDays}</span>
              </div>
              <div className="flex items-center justify-between text-[12px]">
                <span className="text-ghost">Max Streak</span>
                <span className="text-bright font-semibold">{data.maxStreak} {data.maxStreak === 1 ? "day" : "days"}</span>
              </div>
              <div className="flex items-center justify-between text-[12px]">
                <span className="text-ghost">Daily Challenge Streak</span>
                <span className="text-warn font-semibold">{data.dailyStreak} {data.dailyStreak === 1 ? "day" : "days"}</span>
              </div>
            </div>
          </div>

          <div className="border border-rim rounded-xl p-5 bg-pit">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[11px] font-bold uppercase tracking-wider text-bright">Badges</span>
              <span className="text-[10px] text-dim">{data.badges.filter((b) => b.earned).length}/{data.badges.length}</span>
            </div>
            <ul className="grid grid-cols-2 gap-2">
              {data.badges.map((b) => (
                <li key={b.id} title={b.description}
                    className={`rounded-lg border px-2.5 py-2 ${b.earned ? "border-phosphor/40 bg-phosphor/10" : "border-rim opacity-50"}`}>
                  <div className={`text-[11px] font-semibold ${b.earned ? "text-phosphor" : "text-ghost"}`}>
                    {b.earned ? "★ " : ""}{b.label}
                  </div>
                  <div className="text-[9px] text-dim leading-snug mt-0.5">{b.description}</div>
                  <span className="sr-only">{b.earned ? "Earned" : "Not earned yet"}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="border border-rim rounded-xl p-5 bg-pit">
            <div className="text-[11px] font-bold uppercase tracking-wider text-bright mb-4">Focus</div>
            <div className="text-[12px] text-ghost">Verilog · SystemVerilog</div>
            <div className="text-[10px] text-dim mt-1">Primary HDL on BitFlow</div>
          </div>
        </aside>

        {/* ── Main content ─────────────────────────────────────────── */}
        <main className="space-y-6">
          {/* Solved ring + difficulty breakdown */}
          <div className="border border-rim rounded-xl p-6 bg-pit grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-6 items-center">
            <div className="relative w-32 h-32 shrink-0 mx-auto sm:mx-0">
              <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
                <circle cx="60" cy="60" r="52" fill="none" stroke="#22232d" strokeWidth="10" />
                {(() => {
                  const circumference = 2 * Math.PI * 52;
                  let offsetAcc = 0;
                  return diffs.map((d) => {
                    const solved = data.solvedByDifficulty[d] || 0;
                    const frac = data.totalProblems > 0 ? solved / data.totalProblems : 0;
                    const dash = frac * circumference;
                    const el = (
                      <circle
                        key={d}
                        cx="60"
                        cy="60"
                        r="52"
                        fill="none"
                        stroke={diffColor(d).ring}
                        strokeWidth="10"
                        strokeDasharray={`${dash} ${circumference - dash}`}
                        strokeDashoffset={-offsetAcc}
                        strokeLinecap="round"
                      />
                    );
                    offsetAcc += dash;
                    return el;
                  });
                })()}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="font-serif text-2xl text-bright">{data.totalSolved}</span>
                <span className="text-[9px] text-dim uppercase tracking-wider">/ {data.totalProblems} Solved</span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {diffs.map((d) => (
                <div key={d} className={`rounded-lg border border-rim p-3 text-center ${diffColor(d).bg}`}>
                  <div className={`text-[11px] font-bold uppercase tracking-wider ${diffColor(d).text}`}>{d}</div>
                  <div className="text-[13px] text-bright mt-1">
                    {data.solvedByDifficulty[d] || 0}/{data.totalByDifficulty[d] || 0}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Activity heatmap */}
          <div className="border border-rim rounded-xl p-6 bg-pit overflow-x-auto">
            <div className="flex items-center justify-between mb-4 text-[11px]">
              <span className="text-bright">
                <span className="font-serif text-base mr-1">{data.totalSubmissions}</span>
                submissions in the past year
              </span>
              <span className="text-dim">
                Total active days: <span className="text-bright">{data.totalActiveDays}</span>
                <span className="mx-2">·</span>
                Max streak: <span className="text-bright">{data.maxStreak}</span>
              </span>
            </div>

            <div className="inline-block min-w-full">
              <div className="flex gap-[3px] mb-1 pl-0 relative h-4">
                {monthLabels.map((m) => (
                  <span
                    key={m.index}
                    className="absolute text-[9px] text-dim"
                    style={{ left: `${m.index * 13}px` }}
                  >
                    {m.label}
                  </span>
                ))}
              </div>
              <div className="flex gap-[3px]">
                {weeks.map((week, wi) => (
                  <div key={wi} className="flex flex-col gap-[3px]">
                    {week.map((day, di) => (
                      <div
                        key={di}
                        title={`${day.key}: ${day.count} submission${day.count === 1 ? "" : "s"}`}
                        className={`w-[10px] h-[10px] rounded-[2px] ${levelForCount(day.count)}`}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Recent AC */}
          <div className="border border-rim rounded-xl p-6 bg-pit">
            <div className="text-[11px] font-bold uppercase tracking-wider text-bright mb-4">Recent AC</div>
            {data.recentAC.length === 0 ? (
              <div className="text-[12px] text-dim">No accepted submissions yet — solve a problem in the Arena to see it here.</div>
            ) : (
              <div className="space-y-2">
                {data.recentAC.map((s, i) => (
                  <Link
                    key={i}
                    href={s.href}
                    className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-void/60 transition-colors group"
                  >
                    <span className="text-[12.5px] text-pale group-hover:text-bright transition-colors truncate">
                      {s.title}
                    </span>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className={`text-[10px] uppercase tracking-wide ${diffColor(s.difficulty).text}`}>
                        {s.difficulty}
                      </span>
                      <span className="text-[10px] text-dim">
                        {new Date(s.submittedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

export default function ProfilePage() {
  return (
    <AuthGate>
      <ProfileContent />
    </AuthGate>
  );
}
