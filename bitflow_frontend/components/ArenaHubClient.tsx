"use client";

import { useEffect, useMemo, useState } from "react";
import { prewarmSimulator } from "@/lib/sim-status";
import Link from "next/link";
import type { DbProblem } from "@/lib/db-loader";

interface ArenaHubClientProps {
  problems: DbProblem[];
}

const DIFFICULTY_ORDER = ["Easy", "Medium", "Hard", "Expert"];

const DIFFICULTY_STYLES: Record<string, { text: string; ring: string; bg: string }> = {
  Easy:   { text: "text-phosphor",    ring: "rgba(0,232,122,.25)",  bg: "bg-phosphor/15" },
  Medium: { text: "text-info",        ring: "rgba(77,184,255,.25)", bg: "bg-info/15" },
  Hard:   { text: "text-warn",        ring: "rgba(255,184,77,.25)", bg: "bg-warn/15" },
  Expert: { text: "text-purple-400",  ring: "rgba(168,85,247,.25)", bg: "bg-purple-400/15" },
};

function difficultyRank(value: string) {
  const index = DIFFICULTY_ORDER.findIndex((item) => item.toLowerCase() === value.toLowerCase());
  return index === -1 ? DIFFICULTY_ORDER.length : index;
}

export default function ArenaHubClient({ problems }: ArenaHubClientProps) {
  useEffect(prewarmSimulator, []);
  const difficulties = Array.from(new Set(problems.map((p) => p.difficulty)))
    .sort((a, b) => difficultyRank(a) - difficultyRank(b) || a.localeCompare(b));

  const [selectedDifficulty, setSelectedDifficulty] = useState("All");

  const visibleProblems = useMemo(() => {
    if (selectedDifficulty === "All") return problems;
    return problems.filter((p) => p.difficulty === selectedDifficulty);
  }, [problems, selectedDifficulty]);

  const byDifficulty = useMemo(() => {
    const groups = new Map<string, DbProblem[]>();
    for (const problem of visibleProblems) {
      const existing = groups.get(problem.difficulty) ?? [];
      existing.push(problem);
      groups.set(problem.difficulty, existing);
    }

    return Array.from(groups.entries()).sort(
      ([a], [b]) => difficultyRank(a) - difficultyRank(b) || a.localeCompare(b)
    );
  }, [visibleProblems]);

  return (
    <main className="min-h-screen bg-void text-bright">
      {/* ambient glow, matches the dashboard/profile treatment */}
      <div
        className="fixed inset-0 pointer-events-none opacity-60"
        style={{
          background:
            "radial-gradient(ellipse 60% 40% at 50% 0%, rgba(0,232,122,.07), transparent 60%)",
        }}
      />

      <header className="sticky top-0 z-10 h-14 flex items-center justify-between px-6 bg-void/70 border-b border-rim/50 backdrop-blur-xl">
        <Link href="/" className="flex items-center gap-3">
          <img src="/bitflow_logo_64.png" alt="BitFlow" className="w-7 h-7 object-contain" />
          <div className="leading-none">
            <div className="font-display text-[13px] font-bold">BitFlow</div>
            <div className="font-mono text-[9px] text-dim uppercase tracking-widest">HDL Arena</div>
          </div>
        </Link>

        <nav className="flex items-center gap-5">
          <Link href="/dashboard" className="font-mono text-[11px] text-ghost hover:text-bright transition-colors">
            Dashboard
          </Link>
          <Link href="/sandbox" className="font-mono text-[11px] text-ghost hover:text-bright transition-colors">
            Sandbox IDE
          </Link>
          <Link href="/learn" className="font-mono text-[11px] text-ghost hover:text-bright transition-colors">
            Learn
          </Link>
          <Link href="/academy" className="font-mono text-[11px] text-ghost hover:text-bright transition-colors">
            Academy
          </Link>
        </nav>
      </header>

      <div className="relative z-[1] max-w-6xl mx-auto px-6 py-10">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-5 mb-10">
          <div>
            <div className="text-[11px] tracking-[0.18em] text-phosphor uppercase mb-2">HDL Arena</div>
            <h1 className="font-serif text-4xl text-bright mb-2">Practice problems.</h1>
            <p className="text-ghost text-sm">Interview-tier problems. No hints. No hand-holding.</p>
          </div>

          {/* difficulty filter — glassy tabs */}
          <div className="flex flex-wrap gap-2">
            {["All", ...difficulties].map((d) => {
              const active = selectedDifficulty === d;
              const style = DIFFICULTY_STYLES[d];
              return (
                <button
                  key={d}
                  onClick={() => setSelectedDifficulty(d)}
                  className={`px-4 py-2 rounded-full text-[11px] font-semibold uppercase tracking-wider border backdrop-blur-md transition-all duration-200 ${
                    active
                      ? `${style ? style.bg : "bg-phosphor/15"} border-phosphor/50 ${style ? style.text : "text-phosphor"}`
                      : "bg-pit/40 border-rim/60 text-ghost hover:text-bright hover:border-muted"
                  }`}
                  style={active ? { boxShadow: `0 0 16px ${style?.ring || "rgba(0,232,122,.25)"}` } : undefined}
                >
                  {d}
                </button>
              );
            })}
          </div>
        </div>

        {byDifficulty.length === 0 ? (
          <div className="rounded-xl border border-rim/60 bg-pit/40 backdrop-blur-md p-10 text-center text-sm text-dim">
            No arena problems found for this difficulty.
          </div>
        ) : (
          byDifficulty.map(([difficulty, groupedProblems]) => {
            const style = DIFFICULTY_STYLES[difficulty] || DIFFICULTY_STYLES.Easy;
            return (
              <section key={difficulty} className="mb-12">
                <h2 className={`text-sm font-bold uppercase tracking-wider mb-4 ${style.text}`}>
                  {difficulty}
                </h2>
                <div className="grid gap-3">
                  {groupedProblems.map((problem) => (
                    <Link
                      key={problem.slug}
                      href={`/arena/${problem.category.toLowerCase()}/${problem.slug}`}
                      className="group flex items-center justify-between gap-4 p-4 rounded-xl
                                 border border-rim/60 border-t-white/10 bg-pit/40 backdrop-blur-md
                                 transition-all duration-300 hover:-translate-y-0.5 hover:border-phosphor/40
                                 hover:shadow-[0_10px_24px_rgba(0,0,0,.35),0_0_20px_rgba(0,232,122,.15)]"
                    >
                      <div className="min-w-0">
                        <div className="font-mono text-sm text-bright group-hover:text-phosphor transition-colors">
                          {problem.title}
                        </div>
                        <div className="text-xs text-ghost mt-1 line-clamp-2">
                          {problem.statement.substring(0, 140)}...
                        </div>
                      </div>
                      <div className="text-xs font-mono text-phosphor shrink-0">
                        +{problem.xpReward} XP
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            );
          })
        )}
      </div>
    </main>
  );
}