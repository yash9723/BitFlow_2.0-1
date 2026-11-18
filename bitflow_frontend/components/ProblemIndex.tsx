"use client";
/**
 * components/ProblemIndex.tsx — the /problems list: search (title, slug, tags) and filters
 * for level, topic, difficulty, tag, solved state and starred ("saved", this browser only).
 * The filters live in the URL (?q=&level=&category=&difficulty=&tag=&status=&saved=1), so a
 * filtered list can be shared. Layout after designeer.xyz: a Browse sidebar, filter chips with
 * "+N more", and a grid/list toggle (remembered per browser).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import PixelEmpty from "@/components/pixel/PixelEmpty";
import SaveStar from "@/components/SaveStar";
import { useSaved } from "@/lib/saved";

export interface IndexProblem {
  slug: string; title: string; difficulty: string; category: string; level: string;
  tags: string[]; xp: number; href: string; solved: boolean;
  lockedBy: { title: string; href: string } | null;
}

const DIFFICULTY_ORDER = ["beginner", "easy", "intermediate", "medium", "advanced", "hard", "expert"];
const DIFF_DOT: Record<string, string> = { beginner: "bg-phosphor", easy: "bg-phosphor", intermediate: "bg-info", medium: "bg-info", advanced: "bg-warn", hard: "bg-warn", expert: "bg-danger", arena: "bg-danger" };
const field = "bg-void border border-rim rounded-lg px-2 py-1.5 text-[12px] text-pale focus:outline-none focus:border-phosphor/60";
const chip = (on: boolean) => `shrink-0 rounded-full px-3 py-1 text-[12px] transition-colors ${on ? "bg-phosphor text-void font-semibold" : "bg-surface border border-rim text-ghost hover:text-bright"}`;
const side = (on: boolean) => `w-full shrink-0 lg:shrink flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-[12.5px] text-left whitespace-nowrap transition-colors ${on ? "bg-surface text-bright" : "text-ghost hover:text-bright"}`;
const uniq = (xs: string[]) => [...new Set(xs)];
const label = (s: string) => s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const TOPIC_CHIPS = 3;
const VIEW_KEY = "bf:problems-view";

/** Topics by how many problems they have, most first (ties alphabetical). */
export function topicsByCount(problems: Pick<IndexProblem, "category">[]): string[] {
  const n = new Map<string, number>();
  for (const p of problems) n.set(p.category, (n.get(p.category) ?? 0) + 1);
  return [...n].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([c]) => c);
}

export default function ProblemIndex({ problems, signedIn }: { problems: IndexProblem[]; signedIn: boolean }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const saved = useSaved("problems");
  const get = (k: string) => params?.get(k) ?? "";
  const q = get("q"), level = get("level"), category = get("category"), difficulty = get("difficulty"), tag = get("tag"), status = get("status"), onlySaved = get("saved") === "1";

  const [view, setView] = useState<"list" | "grid">("list");
  useEffect(() => { try { if (localStorage.getItem(VIEW_KEY) === "grid") setView("grid"); } catch { /* no storage */ } }, []);
  const pickView = (v: "list" | "grid") => { setView(v); try { localStorage.setItem(VIEW_KEY, v); } catch { /* no storage */ } };
  const more = useRef<HTMLDetailsElement>(null);

  const setParams = (kv: Record<string, string>) => {
    const next = new URLSearchParams(params?.toString());
    for (const [k, v] of Object.entries(kv)) { if (v) next.set(k, v); else next.delete(k); }
    const qs = next.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
  };
  const setParam = (k: string, v: string) => setParams({ [k]: v });

  // In the order the page lists them (app/problems/page.tsx).
  const levels = useMemo(() => uniq(problems.map((p) => p.level)), [problems]);
  const topics = useMemo(() => topicsByCount(problems), [problems]);
  const difficulties = useMemo(() => uniq(problems.map((p) => p.difficulty))
    .sort((a, b) => DIFFICULTY_ORDER.indexOf(a.toLowerCase()) - DIFFICULTY_ORDER.indexOf(b.toLowerCase())), [problems]);
  const tags = useMemo(() => {
    const count = new Map<string, number>();
    for (const p of problems) for (const t of p.tags) count.set(t, (count.get(t) ?? 0) + 1);
    return [...count].sort((a, b) => b[1] - a[1]).map(([t]) => t);
  }, [problems]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return problems.filter((p) =>
      (!needle || p.title.toLowerCase().includes(needle) || p.slug.includes(needle) || p.tags.some((t) => t.toLowerCase().includes(needle))) &&
      (!level || p.level === level) &&
      (!category || p.category.toLowerCase() === category.toLowerCase()) &&
      (!difficulty || p.difficulty.toLowerCase() === difficulty.toLowerCase()) &&
      (!tag || p.tags.includes(tag)) &&
      (!onlySaved || saved.includes(p.slug)) &&
      (!status || (status === "solved" ? p.solved : !p.solved)));
  }, [problems, q, level, category, difficulty, tag, status, onlySaved, saved]);

  const filtered = !!(q || level || category || difficulty || tag || status || onlySaved);
  const shownTopics = topics.slice(0, TOPIC_CHIPS);
  const moreTopics = topics.slice(TOPIC_CHIPS);
  const count = (f: (p: IndexProblem) => boolean) => problems.filter(f).length;
  const dot = (d: string) => DIFF_DOT[d.toLowerCase()] ?? "bg-ghost";

  return (
    <div className="lg:grid lg:grid-cols-[210px_1fr] lg:gap-8 font-mono">
      {/* ── Browse sidebar (a scrolling row on small screens) ── */}
      <aside className="mb-4 lg:mb-0">
        <nav aria-label="Browse problems" className="lg:sticky lg:top-20 flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible pb-1 lg:pb-0">
          <div className="hidden lg:block text-[10px] uppercase tracking-widest text-dim px-2.5 mb-1">Browse</div>
          <button onClick={() => setParams({ level: "", saved: "" })} className={side(!level && !onlySaved)}>
            <span>All problems</span><span className="font-term text-[11px] text-dim">{problems.length}</span>
          </button>
          {levels.map((l) => (
            <button key={l} onClick={() => setParams({ level: l, saved: "" })} className={side(level === l && !onlySaved)}>
              <span className="truncate">{l.replace(/^Verilog /, "")}</span><span className="font-term text-[11px] text-dim">{count((p) => p.level === l)}</span>
            </button>
          ))}
          <div className="hidden lg:block text-[10px] uppercase tracking-widest text-dim px-2.5 mt-4 mb-1">Yours</div>
          <button onClick={() => setParams({ saved: onlySaved ? "" : "1" })} className={side(onlySaved)}>
            <span><span className="text-warn">★</span> Saved</span><span className="font-term text-[11px] text-dim">{saved.length}</span>
          </button>
          {signedIn && (["solved", "unsolved"] as const).map((s) => (
            <button key={s} onClick={() => setParam("status", status === s ? "" : s)} className={side(status === s)}>
              <span>{s === "solved" ? "✓ Solved" : "○ Not solved yet"}</span>
              <span className="font-term text-[11px] text-dim">{count((p) => (s === "solved" ? p.solved : !p.solved))}</span>
            </button>
          ))}
          <p className="hidden lg:block px-2.5 mt-2 text-[10px] text-dim leading-snug">Saved problems stay on this device.</p>
        </nav>
      </aside>

      <div className="space-y-4 min-w-0">
        <div className="flex flex-wrap gap-2 items-center">
          <input type="search" value={q} onChange={(e) => setParam("q", e.target.value)} placeholder="Search problems or tags…"
                 aria-label="Search problems" className={`${field} flex-1 min-w-[12rem]`} />
          <select aria-label="Tag" value={tag} onChange={(e) => setParam("tag", e.target.value)} className={field}>
            <option value="">Any tag</option>
            {tags.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <div role="group" aria-label="View" className="flex rounded-lg border border-rim overflow-hidden">
            {(["list", "grid"] as const).map((v) => (
              <button key={v} onClick={() => pickView(v)} aria-pressed={view === v} title={`${label(v)} view`}
                      className={`px-2.5 py-1.5 text-[12px] ${view === v ? "bg-surface text-phosphor" : "text-dim hover:text-pale"}`}>
                <span aria-hidden>{v === "list" ? "☰" : "▦"}</span><span className="sr-only">{label(v)} view</span>
              </button>
            ))}
          </div>
        </div>

        {/* Chips: difficulty, then the biggest topics and "+N more" */}
        <div className="flex flex-wrap gap-1.5 items-center">
          <button onClick={() => setParams({ difficulty: "", category: "" })} className={chip(!difficulty && !category)}>All</button>
          {difficulties.map((d) => (
            <button key={d} onClick={() => setParam("difficulty", difficulty === d ? "" : d)} className={chip(difficulty === d)}>
              <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle ${dot(d)}`} />{label(d)}
            </button>
          ))}
          <span className="w-px h-5 bg-rim mx-1" aria-hidden />
          {shownTopics.map((c) => (
            <button key={c} onClick={() => setParam("category", category === c ? "" : c)} className={chip(category === c)}>{label(c)}</button>
          ))}
          {moreTopics.length > 0 && (
            <details ref={more} className="relative">
              <summary className={`${chip(moreTopics.includes(category))} list-none cursor-pointer [&::-webkit-details-marker]:hidden`}>
                {moreTopics.includes(category) ? label(category) : `+${moreTopics.length} more`} ▾
              </summary>
              <div className="absolute z-30 mt-1.5 w-56 max-h-72 overflow-y-auto rounded-xl border border-rim bg-pit p-1.5 shadow-2xl">
                {moreTopics.map((c) => (
                  <button key={c} onClick={() => { setParam("category", category === c ? "" : c); more.current?.removeAttribute("open"); }}
                          className={side(category === c)}>
                    <span className="truncate">{label(c)}</span><span className="font-term text-[11px] text-dim">{count((p) => p.category === c)}</span>
                  </button>
                ))}
              </div>
            </details>
          )}
          {filtered && <button onClick={() => router.replace(pathname, { scroll: false })} className="ml-1 text-[11px] text-ghost hover:text-bright underline">Clear</button>}
        </div>

        <p className="font-term text-[11px] text-dim uppercase" role="status">{shown.length} of {problems.length}</p>

        {shown.length === 0 ? (
          <PixelEmpty anim="think" title={onlySaved && saved.length === 0 ? "Nothing saved yet" : "No match"}>
            {onlySaved && saved.length === 0 ? "Star a problem with ☆ to keep it here." : "Try fewer filters."}
          </PixelEmpty>
        ) : view === "grid" ? (
          <ul className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {shown.map((p) => (
              <li key={p.slug} className="group relative flex flex-col gap-2 rounded-xl border border-rim bg-pit p-4 hover:border-phosphor/40 transition-colors">
                <div className="flex items-center gap-2 text-[11px] text-ghost">
                  <span className={`w-1.5 h-1.5 rounded-full ${dot(p.difficulty)}`} />
                  <span>{label(p.difficulty)}</span><span className="text-dim">·</span><span className="truncate">{label(p.category)}</span>
                  <SaveStar kind="problems" id={p.slug} title={p.title} className="ml-auto text-[15px] relative z-10" />
                </div>
                {p.lockedBy
                  ? <span className="text-[14px] text-ghost">🔒 {p.title}</span>
                  : <Link href={p.href} className="text-[14px] text-bright group-hover:text-phosphor after:absolute after:inset-0">{p.title}</Link>}
                <div className="flex flex-wrap gap-1">
                  {p.tags.slice(0, 3).map((t) => <span key={t} className="text-[10px] px-1.5 rounded border border-rim text-dim">{t}</span>)}
                </div>
                {p.lockedBy && <div className="text-[10px] text-dim relative z-10">Opens after <Link href={p.lockedBy.href} className="text-info hover:underline">{p.lockedBy.title}</Link></div>}
                <div className="mt-auto flex items-center justify-between font-term text-[11px] uppercase text-dim">
                  <span>{p.level.replace(/^Verilog /, "")}</span>
                  <span>{p.solved ? <span className="text-phosphor">✓ solved</span> : `${p.xp} XP`}</span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <ul className="divide-y divide-rim/50 border border-rim/60 rounded-xl overflow-hidden">
            {shown.map((p) => (
              <li key={p.slug} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 bg-pit/40 hover:bg-pit">
                <span className="w-4 text-center" aria-label={p.solved ? "Solved" : p.lockedBy ? "Locked" : "Not solved"}>{p.solved ? <span className="text-phosphor">✓</span> : p.lockedBy ? "🔒" : <span className="text-rim">○</span>}</span>
                <div className="flex-1 min-w-[12rem]">
                  {p.lockedBy
                    ? <span className="text-[13px] text-ghost">{p.title}</span>
                    : <Link href={p.href} className="text-[13px] text-bright hover:text-phosphor">{p.title}</Link>}
                  <div className="flex flex-wrap gap-1 mt-1">
                    {p.tags.slice(0, 5).map((t) => (
                      <button key={t} onClick={() => setParam("tag", t)} className="text-[10px] px-1.5 rounded border border-rim text-dim hover:text-pale">{t}</button>
                    ))}
                  </div>
                  {p.lockedBy && <div className="text-[10px] text-dim mt-1">Opens after <Link href={p.lockedBy.href} className="text-info hover:underline">{p.lockedBy.title}</Link></div>}
                </div>
                <span className="text-[11px] text-ghost w-28">{label(p.category)}</span>
                <span className="text-[11px] text-pale w-24">{label(p.difficulty)}</span>
                <span className="text-[11px] text-dim w-14 text-right">{p.xp} XP</span>
                <SaveStar kind="problems" id={p.slug} title={p.title} className="text-[15px] w-5" />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
