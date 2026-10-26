"use client";
/**
 * components/ProfileView.tsx — a learner's profile: stats, badges, solved ring,
 * activity heatmap, recent solves and certificates. `own` adds the account
 * controls (public-profile switch, logout, security, certificate claiming);
 * without it this is the public page /u/<username>.
 */

import { useState } from "react";
import Link from "next/link";
import AccountSecurity from "@/components/AccountSecurity";
import AccountData from "@/components/AccountData";
import { useAuth } from "@/hooks/useAuth";
import type { ProfileData } from "@/lib/profile";

// lib/profile.ts folds beginner/intermediate/advanced into Easy/Medium/Hard
const DIFF_ORDER = ["Easy", "Medium", "Hard", "Expert"];
const DIFF_COLOR: Record<string, { ring: string; text: string; bg: string }> = {
  Easy:   { ring: "#00e87a", text: "text-phosphor", bg: "bg-phosphor/10" },
  Medium: { ring: "#4db8ff", text: "text-info",     bg: "bg-info/10" },
  Hard:   { ring: "#ffb84d", text: "text-warn",     bg: "bg-warn/10" },
  Expert: { ring: "#ff4f4f", text: "text-danger",   bg: "bg-danger/10" },
};
const OTHER_COLOR = { ring: "#9598ac", text: "text-ghost", bg: "bg-void/40" };
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
  start.setDate(start.getDate() - start.getDay());

  const weeks: { date: Date; key: string; count: number }[][] = [];
  const cursor = new Date(start);
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

/** Own-profile switch for /u/<username>, with a copyable link when on. */
function PublicProfileCard({ username, initial }: { username: string; initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const url = typeof window !== "undefined" ? `${window.location.origin}/u/${encodeURIComponent(username)}` : `/u/${username}`;

  const toggle = async () => {
    setBusy(true);
    const res = await fetch("/api/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ publicProfile: !on }) });
    if (res.ok) setOn(!on);
    setBusy(false);
  };

  return (
    <div className="border border-rim rounded-xl p-5 bg-pit">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-bright">Public profile</div>
          <div className="text-[10.5px] text-ghost mt-1">{on ? "Anyone with the link can see your stats, badges and certificates." : "Only you can see this page."}</div>
        </div>
        <button role="switch" aria-checked={on} aria-label="Public profile" onClick={toggle} disabled={busy}
                className={`relative w-10 h-6 rounded-full shrink-0 transition-colors disabled:opacity-50 ${on ? "bg-phosphor" : "bg-rim"}`}>
          <span className={`absolute top-1 w-4 h-4 rounded-full bg-void transition-all ${on ? "left-5" : "left-1"}`} />
        </button>
      </div>
      {on && (
        <div className="mt-3 flex items-center gap-2">
          <Link href={`/u/${encodeURIComponent(username)}`} className="flex-1 min-w-0 truncate text-[11px] font-mono text-phosphor hover:underline">{url.replace(/^https?:\/\//, "")}</Link>
          <button onClick={() => { navigator.clipboard?.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
                  className="text-[10px] px-2 py-1 rounded border border-rim text-ghost hover:text-bright shrink-0">{copied ? "Copied" : "Copy"}</button>
        </div>
      )}
    </div>
  );
}

/** Certificate tracks: progress, and claim/view buttons on your own profile. */
function CertificatesCard({ tracks, own }: { tracks: ProfileData["tracks"]; own: boolean }) {
  const [ids, setIds] = useState<Record<string, string | null>>(() => Object.fromEntries(tracks.map((t) => [t.id, t.certificateId])));
  const [error, setError] = useState<string | null>(null);
  const shown = own ? tracks : tracks.filter((t) => ids[t.id]);
  if (!shown.length) return null;

  const claim = async (track: string) => {
    setError(null);
    const res = await fetch("/api/certificates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ track }) });
    const json = await res.json().catch(() => ({}));
    if (res.ok) setIds((m) => ({ ...m, [track]: json.id }));
    else setError(json.error ?? "Couldn't claim the certificate.");
  };

  return (
    <div className="border border-rim rounded-xl p-6 bg-pit">
      <div className="text-[11px] font-bold uppercase tracking-wider text-bright mb-1">Certificates</div>
      {own && <p className="text-[11px] text-ghost mb-4">Solve every problem in a track to earn a certificate. Claimed certificates are public at their own link, so you can share and verify them.</p>}
      <ul className="space-y-3 mt-3">
        {shown.map((t) => {
          const id = ids[t.id];
          const pct = t.total ? Math.round((t.solved / t.total) * 100) : 0;
          return (
            <li key={t.id} className="flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span className={`text-[12.5px] ${id ? "text-phosphor" : "text-bright"}`}>{id ? "★ " : ""}{t.name}</span>
                  {own && <span className="text-[10.5px] text-ghost font-mono shrink-0">{t.solved}/{t.total}</span>}
                </div>
                {own && (
                  <div className="h-1.5 rounded-full bg-rim mt-1.5 overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${t.name} progress`}>
                    <div className="h-full bg-phosphor" style={{ width: `${pct}%` }} />
                  </div>
                )}
              </div>
              {id ? (
                <Link href={`/c/${id}`} className="text-[11px] px-3 py-1.5 rounded-lg border border-phosphor/40 text-phosphor hover:bg-phosphor/10 shrink-0">View</Link>
              ) : own && t.complete ? (
                <button onClick={() => claim(t.id)} className="text-[11px] px-3 py-1.5 rounded-lg bg-phosphor text-void font-semibold shrink-0">Claim</button>
              ) : null}
            </li>
          );
        })}
      </ul>
      {error && <p className="text-[11px] text-danger mt-3">{error}</p>}
    </div>
  );
}

export default function ProfileView({ data, own }: { data: ProfileData; own: boolean }) {
  const { logout } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);

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
          <Link href="/academy" className="hidden sm:inline hover:text-bright transition-colors">Academy</Link>
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
                <h1 className="font-serif text-lg text-bright truncate">{data.user.username}</h1>
                <div className={`text-[10px] uppercase tracking-wider ${tier.color}`}>{tier.label}</div>
              </div>
            </div>
            <div className="text-[11px] text-dim">Member since {memberSince}</div>
            {own && (
              <button
                onClick={async () => {
                  setLoggingOut(true);
                  await logout();
                }}
                disabled={loggingOut}
                className="w-full mt-4 py-2 rounded-lg border border-danger/30 text-[11px] font-semibold uppercase tracking-wider text-danger hover:bg-danger/10 transition-colors disabled:opacity-50"
              >
                {loggingOut ? "Logging out…" : "Logout"}
              </button>
            )}
          </div>

          {own && <PublicProfileCard username={data.user.username} initial={data.publicProfile} />}

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

          {own && <AccountSecurity />}
          {own && <AccountData />}
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

          <CertificatesCard tracks={data.tracks} own={own} />

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
              <div className="text-[12px] text-dim">
                {own ? "No accepted submissions yet — solve a problem in the Arena to see it here." : "No accepted submissions yet."}
              </div>
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
