"use client";
/**
 * components/ProblemIndex.tsx — the /problems list: search (title, slug, tags) and filters
 * for level, topic, difficulty, tag and solved state. The filters live in the URL
 * (?q=&level=&category=&difficulty=&tag=&status=), so a filtered list can be shared.
 */
import { useMemo } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export interface IndexProblem {
  slug: string; title: string; difficulty: string; category: string; level: string;
  tags: string[]; xp: number; href: string; solved: boolean;
  lockedBy: { title: string; href: string } | null;
}

const LEVELS = ["Beginner", "Intermediate", "Advanced", "Arena"];
const DIFFICULTY_ORDER = ["beginner", "easy", "intermediate", "medium", "advanced", "hard", "expert"];
const field = "bg-void border border-rim rounded-lg px-2 py-1.5 text-[12px] text-pale focus:outline-none focus:border-phosphor/60";
const uniq = (xs: string[]) => [...new Set(xs)];
const label = (s: string) => s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export default function ProblemIndex({ problems, signedIn }: { problems: IndexProblem[]; signedIn: boolean }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const get = (k: string) => params?.get(k) ?? "";
  const q = get("q"), level = get("level"), category = get("category"), difficulty = get("difficulty"), tag = get("tag"), status = get("status");

  const setParam = (k: string, v: string) => {
    const next = new URLSearchParams(params?.toString());
    if (v) next.set(k, v); else next.delete(k);
    const qs = next.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
  };

  const categories = useMemo(() => uniq(problems.map((p) => p.category)).sort(), [problems]);
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
      (!status || (status === "solved" ? p.solved : !p.solved)));
  }, [problems, q, level, category, difficulty, tag, status]);

  const filtered = !!(q || level || category || difficulty || tag || status);
  return (
    <div className="space-y-4 font-mono">
      <div className="flex flex-wrap gap-2 items-center">
        <input type="search" value={q} onChange={(e) => setParam("q", e.target.value)} placeholder="Search problems or tags…"
               aria-label="Search problems" className={`${field} flex-1 min-w-[12rem]`} />
        <select aria-label="Level" value={level} onChange={(e) => setParam("level", e.target.value)} className={field}>
          <option value="">All levels</option>
          {LEVELS.map((l) => <option key={l} value={l}>{l === "Arena" ? "Arena" : `${l} path`}</option>)}
        </select>
        <select aria-label="Topic" value={category} onChange={(e) => setParam("category", e.target.value)} className={field}>
          <option value="">All topics</option>
          {categories.map((c) => <option key={c} value={c}>{label(c)}</option>)}
        </select>
        <select aria-label="Difficulty" value={difficulty} onChange={(e) => setParam("difficulty", e.target.value)} className={field}>
          <option value="">Any difficulty</option>
          {difficulties.map((d) => <option key={d} value={d}>{label(d)}</option>)}
        </select>
        <select aria-label="Tag" value={tag} onChange={(e) => setParam("tag", e.target.value)} className={field}>
          <option value="">Any tag</option>
          {tags.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        {signedIn && (
          <select aria-label="Solved" value={status} onChange={(e) => setParam("status", e.target.value)} className={field}>
            <option value="">Solved or not</option>
            <option value="solved">Solved</option>
            <option value="unsolved">Not solved yet</option>
          </select>
        )}
        {filtered && <button onClick={() => router.replace(pathname, { scroll: false })} className="text-[11px] text-ghost hover:text-bright underline">Clear</button>}
      </div>

      <p className="text-[11px] text-dim" role="status">{shown.length} of {problems.length}</p>

      {shown.length === 0 ? (
        <p className="text-[13px] text-ghost py-10 text-center">No problem matches. Try fewer filters.</p>
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
              <span className="text-[11px] text-ghost w-28">{p.level === "Arena" ? "Arena" : `${p.level} path`}</span>
              <span className="text-[11px] text-ghost w-28">{label(p.category)}</span>
              <span className="text-[11px] text-pale w-24">{label(p.difficulty)}</span>
              <span className="text-[11px] text-dim w-14 text-right">{p.xp} XP</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
