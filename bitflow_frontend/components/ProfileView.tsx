"use client";
/**
 * components/ProfileView.tsx — a learner's profile: stats, badges, solved ring,
 * activity heatmap, recent solves and certificates. `own` adds the account
 * controls (public-profile switch, logout, security, certificate claiming) on a separate
 * Settings tab (#settings); without it this is the public page /u/<username>.
 * Layout ideas from portfolios on designeer.xyz: a dotted-leader index for the stats,
 * month counts beside the heatmap, dated rows for recent solves, and certificate tracks
 * drawn as a disk scan (one cell per problem).
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import AccountSecurity from "@/components/AccountSecurity";
import AccountData from "@/components/AccountData";
import { useAuth } from "@/hooks/useAuth";
import type { ProfileData } from "@/lib/profile";
import SiteHeader from "@/components/SiteHeader";
import PixelBar from "@/components/pixel/PixelBar";
import PixelEmpty from "@/components/pixel/PixelEmpty";
import { PixelIcon, badgeIcon } from "@/components/pixel/PixelIcon";
import { levelFromXp, tierFromXp } from "@/lib/levels";
import { useCelebrate } from "@/components/pixel/CelebrationProvider";
import BitzyWatcher from "@/components/pixel/BitzyWatcher";
import LogicToggle from "@/components/signal/LogicToggle";
import PixelFire from "@/components/PixelFire";
import { signal } from "@/lib/signalfx";
import type { Animation } from "@/lib/pixel/bitzy";

/** Days since the last day with any activity (Infinity if none). Keys are YYYY-MM-DD. */
function daysSinceActive(activity: Record<string, number>, now = Date.now()) {
  const last = Object.keys(activity).filter((k) => activity[k] > 0).sort().pop();
  return last ? Math.floor((now - Date.parse(last + "T00:00:00Z")) / 86_400_000) : Infinity;
}
/** Bitzy's mood: cheering after a solve this week; asleep after two idle weeks, but only on your own page. */
export function companionMood(days: number, own: boolean): Animation {
  if (days <= 7) return "cheer";
  return own && days > 14 ? "sleep" : "idle";
}

/** An anime "scouter" readout: the number counts up once, in the pixel font. Still with reduced motion. */
function PowerLevel({ value }: { value: number }) {
  const [shown, setShown] = useState(value);
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || value <= 0) return;
    let raf = 0; const t0 = performance.now(), dur = 900;
    const tick = (t: number) => { const k = Math.min(1, (t - t0) / dur); setShown(Math.round(value * (1 - (1 - k) ** 3))); if (k < 1) raf = requestAnimationFrame(tick); };
    setShown(0); raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <span className="font-pixel text-[26px] leading-none text-phosphor tabular-nums" aria-label={`${value} XP`}>{shown.toLocaleString()}</span>;
}

/** A table-of-contents row: label, dotted leader, value. */
function Leader({ label, value, tone = "text-bright" }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <div className="flex items-baseline gap-2 font-term text-[11px] uppercase">
      <span className="text-ghost shrink-0">{label}</span>
      <span aria-hidden className="flex-1 min-w-4 border-b border-dotted border-dim/60 translate-y-[-3px]" />
      <span className={`shrink-0 tabular-nums normal-case ${tone}`}>{value}</span>
    </div>
  );
}

/** A track as a disk scan: one cell per problem, solved cells lit. */
function ScanCells({ solved, total, label }: { solved: number; total: number; label: string }) {
  return (
    <div role="img" aria-label={`${label}: ${solved} of ${total} solved`} className="flex flex-wrap gap-[3px] mt-1.5">
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={`w-[9px] h-[9px] rounded-[1px] sig-boot ${i < solved ? "bg-phosphor shadow-[0_0_4px_rgba(0,232,122,0.6)]" : "bg-rim/70"}`}
              style={{ animationDelay: `${Math.min(i, 40) * 15}ms` }} />
      ))}
    </div>
  );
}

/** Submissions per month for the last 12 months, oldest first. Keys are YYYY-MM-DD. */
export function monthTotals(activity: Record<string, number>, now = new Date()): { key: string; label: string; count: number }[] {
  const out: { key: string; label: string; count: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const key = d.toISOString().slice(0, 7);
    out.push({ key, label: MONTH_NAMES[d.getUTCMonth()], count: 0 });
  }
  for (const [day, n] of Object.entries(activity)) { const m = out.find((o) => o.key === day.slice(0, 7)); if (m) m.count += n; }
  return out;
}

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
        <LogicToggle on={on} onChange={toggle} label="Public profile" disabled={busy} />
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
  const celebrate = useCelebrate();
  const shown = own ? tracks : tracks.filter((t) => ids[t.id]);
  if (!shown.length) return null;

  const claim = async (track: string) => {
    setError(null);
    const res = await fetch("/api/certificates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ track }) });
    const json = await res.json().catch(() => ({}));
    if (res.ok) { setIds((m) => ({ ...m, [track]: json.id })); celebrate({ kind: "badge", label: "Certificate" }); }
    else setError(json.error ?? "Couldn't claim the certificate.");
  };

  return (
    <div className="border border-rim rounded-xl p-6 bg-pit">
      <div className="text-[11px] font-bold uppercase tracking-wider text-bright mb-1">Certificates</div>
      {own && <p className="text-[11px] text-ghost mb-4">Solve every problem in a track to earn a certificate. Claimed certificates are public at their own link, so you can share and verify them.</p>}
      <ul className="space-y-3 mt-3">
        {shown.map((t) => {
          const id = ids[t.id];
          return (
            <li key={t.id} className="flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span className={`text-[12.5px] ${id ? "text-phosphor" : "text-bright"}`}>{id ? "★ " : ""}{t.name}</span>
                  {own && <span className="text-[10.5px] text-ghost font-mono shrink-0">{t.solved}/{t.total}</span>}
                </div>
                {own && (t.total <= 60
                  ? <ScanCells solved={t.solved} total={t.total} label={`${t.name} progress`} />
                  : <PixelBar value={t.solved} max={t.total} label={`${t.name} progress`} height={6} className="mt-1.5" />)}
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
  // Own profile: Overview or Settings (#settings), so account controls don't bury the stats.
  const [tab, setTab] = useState<"overview" | "settings">("overview");
  useEffect(() => { if (own && location.hash === "#settings") setTab("settings"); }, [own]);
  const pick = (t: "overview" | "settings") => { setTab(t); history.replaceState(null, "", t === "settings" ? "#settings" : location.pathname); };
  const months = monthTotals(data.activity);
  const busiest = Math.max(1, ...months.map((m) => m.count));

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
      <SiteHeader />

      {own && (
        <div role="tablist" aria-label="Profile" className="max-w-6xl mx-auto px-6 pt-6 flex gap-1 font-term text-[11px] uppercase">
          {(["overview", "settings"] as const).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => pick(t)}
                    className={`px-3 py-1.5 rounded-md border transition-colors ${tab === t ? "border-phosphor/50 text-phosphor bg-phosphor/10" : "border-rim text-ghost hover:text-bright"}`}>
              {t}
            </button>
          ))}
        </div>
      )}

      {own && tab === "settings" ? (
        <div className="max-w-3xl mx-auto px-6 py-8 grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
          <div className="space-y-6">
            <PublicProfileCard username={data.user.username} initial={data.publicProfile} />
            <AccountSecurity />
          </div>
          <div className="space-y-6">
            <AccountData />
            <div className="border border-rim rounded-xl p-5 bg-pit">
            {own && (
              <button
                onClick={async () => {
                  setLoggingOut(true);
                  await logout();
                }}
                disabled={loggingOut}
                className="w-full py-2 rounded-lg border border-danger/30 text-[11px] font-semibold uppercase tracking-wider text-danger hover:bg-danger/10 transition-colors disabled:opacity-50"
              >
                {loggingOut ? "Logging out…" : "Logout"}
              </button>
            )}
            </div>
          </div>
        </div>
      ) : (
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
                <div className={`text-[10px] uppercase tracking-wider ${tier.color}`}>{tier.label} · <span className="font-pixel text-[15px] normal-case tracking-normal">LV {levelFromXp(data.totalXp).level}</span></div>
              </div>
            </div>
            <div className="text-[11px] text-dim">Member since {memberSince}</div>
          </div>

          <div className="border border-rim rounded-xl p-5 bg-pit flex items-center gap-4">
            <BitzyWatcher size={72} rest={companionMood(daysSinceActive(data.activity), own)} />
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-wider text-dim">Power level</div>
              <PowerLevel value={data.totalXp} />
              {data.dailyStreak >= 3 && (
                <div className="flex items-center gap-1.5 mt-1 text-[11px] text-warn">
                  <PixelFire cell={3} className="w-4 h-5" /> {data.dailyStreak}-day streak
                </div>
              )}
            </div>
          </div>

          <div className="border border-rim rounded-xl p-5 bg-pit">
            <div className="text-[11px] font-bold uppercase tracking-wider text-bright mb-4">Stats</div>
            <div className="space-y-2.5">
              <Leader label="Total XP" value={data.totalXp.toLocaleString()} tone="text-phosphor" />
              <Leader label="Solved" value={`${data.totalSolved}/${data.totalProblems}`} />
              <Leader label="Active days" value={data.totalActiveDays} />
              <Leader label="Max streak" value={`${data.maxStreak} ${data.maxStreak === 1 ? "day" : "days"}`} />
              <Leader label="Daily streak" value={`${data.dailyStreak} ${data.dailyStreak === 1 ? "day" : "days"}`} tone="text-warn" />
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
                    onMouseEnter={b.earned ? (e) => { if (matchMedia("(hover: hover) and (pointer: fine)").matches) signal.glint(e.currentTarget); } : undefined}
                    className={`rounded-lg border px-2.5 py-2 ${b.earned ? "border-phosphor/40 bg-phosphor/10" : "border-rim opacity-50"}`}>
                  <div className={`flex items-center gap-1.5 text-[11px] font-semibold ${b.earned ? "text-phosphor" : "text-ghost"}`}>
                    <PixelIcon name={badgeIcon(b.id)} size={24} className={b.earned ? "" : "grayscale opacity-60"} />
                    {b.label}
                  </div>
                  <div className="text-[9px] text-dim leading-snug mt-0.5">{b.description}</div>
                  <span className="sr-only">{b.earned ? "Earned" : "Not earned yet"}</span>
                </li>
              ))}
            </ul>
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
                        className={`w-[10px] h-[10px] rounded-[2px] sig-boot ${levelForCount(day.count)}`}
                        style={{ animationDelay: `${wi * 12}ms` }}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>
            {/* Month rail: submissions per month, last 12 months */}
            <ol className="mt-4 grid grid-cols-6 sm:grid-cols-12 gap-1.5 font-term text-[11px]" aria-label="Submissions per month">
              {months.map((m, i) => (
                <li key={m.key} title={`${m.key}: ${m.count} submission${m.count === 1 ? "" : "s"}`} className="flex flex-col items-center gap-1">
                  <span className="relative w-full h-8 rounded-sm bg-rim/40 overflow-hidden">
                    <span className={`absolute inset-x-0 bottom-0 origin-bottom ${m.count ? "bg-phosphor/70" : ""}`}
                          style={{ height: `${(m.count / busiest) * 100}%` }} />
                  </span>
                  <span className={i === 11 ? "text-phosphor" : "text-dim"}>{m.label}</span>
                  <span className="text-ghost tabular-nums">{m.count}</span>
                </li>
              ))}
            </ol>
          </div>

          {/* Recent AC */}
          <div className="border border-rim rounded-xl p-6 bg-pit">
            <div className="text-[11px] font-bold uppercase tracking-wider text-bright mb-4">Recent AC</div>
            {data.recentAC.length === 0 ? (
              <PixelEmpty compact title="No solves yet">{own ? "Solve a problem in the Arena to see it here." : "Nothing accepted yet."}</PixelEmpty>
            ) : (
              <div className="space-y-2">
                {data.recentAC.map((s, i) => (
                  <Link
                    key={i}
                    href={s.href}
                    className="flex items-baseline gap-3 px-3 py-2 rounded-lg hover:bg-void/60 transition-colors group"
                  >
                    <span className="w-14 shrink-0 font-term text-[11px] uppercase text-dim tabular-nums">
                      {new Date(s.submittedAt).toLocaleDateString("en-US", { month: "short", day: "2-digit" })}
                    </span>
                    <span className="text-[12.5px] text-pale group-hover:text-bright transition-colors truncate">
                      {s.title}
                    </span>
                    <span aria-hidden className="flex-1 min-w-4 border-b border-dotted border-rim translate-y-[-3px]" />
                    <span className={`shrink-0 font-term text-[11px] uppercase ${diffColor(s.difficulty).text}`}>
                      {s.difficulty}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>
      )}
    </div>
  );
}
