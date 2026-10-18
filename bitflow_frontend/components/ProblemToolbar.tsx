"use client";
/**
 * components/ProblemToolbar.tsx — Top bar for Problem Arena pages
 *
 * Replaces the Sandbox Toolbar on /problems/[slug] pages.
 * Never imported by the Sandbox — clean separation.
 *
 * Contains:
 *   - Back to Learn link
 *   - Problem title + difficulty
 *   - XP display (current total)
 *   - Run Code button (local simulation, public testbench)
 *   - Submit button (hidden testcase evaluation)
 *   - Submission progress indicator
 */

import Link from "next/link";
import type { ProblemRunState } from "@/hooks/useProblem";
import type { Difficulty } from "@/lib/problem-types";

const DIFF_DOT: Record<Difficulty, string> = {
  beginner:     "bg-phosphor",
  intermediate: "bg-info",
  advanced:     "bg-warn",
  arena:        "bg-danger",
};

interface ProblemToolbarProps {
  title:            string;
  difficulty:       Difficulty;
  xp:               number;
  runState:         ProblemRunState;
  submittingIndex:  number;
  submittingTotal:  number;
  onRun:            () => void;
  onSubmit:         () => void;
  onToggleTutor?:   () => void;
  onSynthesize?:    () => void;
}

function SubmittingProgress({
  index,
  total,
}: {
  index: number;
  total: number;
}) {
  const pct = total > 0 ? Math.round(((index) / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-1 bg-surface rounded-full overflow-hidden">
        <div
          className="h-full bg-info transition-all duration-200 rounded-full"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="font-mono text-[9px] text-info/70 tabular-nums">
        {index}/{total}
      </span>
    </div>
  );
}

export default function ProblemToolbar({
  title,
  difficulty,
  xp,
  runState,
  submittingIndex,
  submittingTotal,
  onRun,
  onSubmit,
  onToggleTutor,
  onSynthesize,
}: ProblemToolbarProps) {
  const isRunning    = runState === "running";
  const isSubmitting = runState === "submitting";
  const isBusy       = isRunning || isSubmitting;

  return (
    <header className="h-toolbar shrink-0 flex items-center justify-between px-4 bg-surface border-b border-rim z-10">
      {/* ── Left ────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        {/* Back link */}
        <Link
          href="/learn"
          className="flex items-center gap-1 font-mono text-[10px] text-dim hover:text-ghost transition-colors"
        >
          <svg viewBox="0 0 8 8" className="w-2 h-2 fill-current">
            <path d="M6 1L2 4l4 3" stroke="currentColor" strokeWidth="1" fill="none" />
          </svg>
          Learn
        </Link>

        <span className="text-rim">·</span>

        {/* Logo mark */}
        <img
          src="/bitflow_logo_2.png"
          alt="BitFlow"
          className="w-5 h-5 object-contain rounded opacity-80"
          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
        />

        {/* Difficulty dot + title */}
        <div className="flex items-center gap-2">
          <span className={`w-1.5 h-1.5 rounded-full ${DIFF_DOT[difficulty]}`} />
          <span className="font-mono text-[12px] text-bright font-semibold">
            {title}
          </span>
        </div>
      </div>

      {/* ── Right ───────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        {/* XP display */}
        <div className="hidden sm:flex items-center gap-1 font-mono text-[10px]">
          <span className="text-phosphor/60">◈</span>
          <span className="text-ghost tabular-nums">{xp.toLocaleString()}</span>
          <span className="text-dim">XP</span>
        </div>

        {/* Submission progress */}
        {isSubmitting && (
          <SubmittingProgress index={submittingIndex} total={submittingTotal} />
        )}

        {onSynthesize && (
          <button
            onClick={onSynthesize}
            className="px-3 py-1.5 rounded font-mono text-[11px] tracking-wider uppercase border border-rim text-ghost hover:text-bright hover:border-dim transition-colors"
            title="Synthesize with Yosys: cells, latches, schematic, FSM diagram"
          >
            Synth
          </button>
        )}

        {onToggleTutor && (
          <button
            onClick={onToggleTutor}
            className="px-3 py-1.5 rounded font-mono text-[11px] tracking-wider uppercase border border-rim text-ghost hover:text-bright hover:border-dim transition-colors"
            title="Ask the AI tutor for a hint"
          >
            Tutor
          </button>
        )}

        {/* Run Code button */}
        <button
          onClick={onRun}
          disabled={isBusy}
          className={[
            "flex items-center gap-1.5 px-3 py-1.5 rounded",
            "font-mono text-[11px] tracking-wider uppercase",
            "border transition-all duration-150",
            isBusy
              ? "border-rim text-dim cursor-not-allowed"
              : "border-info/40 bg-info/5 text-info/80 hover:bg-info/15 hover:border-info/70 hover:text-info active:scale-[0.97]",
          ].join(" ")}
          title="Run with public testbench (Ctrl+Enter)"
        >
          {isRunning ? (
            <>
              <span className="w-1 h-1 rounded-full bg-current animate-pulse_soft" />
              Running…
            </>
          ) : (
            <>
              <svg viewBox="0 0 10 10" className="w-2 h-2 fill-current">
                <polygon points="1,1 9,5 1,9" />
              </svg>
              Run
            </>
          )}
        </button>

        {/* Submit button */}
        <button
          onClick={onSubmit}
          disabled={isBusy}
          className={[
            "flex items-center gap-1.5 px-3 py-1.5 rounded",
            "font-mono text-[11px] tracking-wider uppercase font-semibold",
            "border transition-all duration-150",
            isBusy
              ? "border-rim text-dim cursor-not-allowed"
              : [
                  "border-phosphor/60 bg-phosphor/10 text-phosphor",
                  "hover:bg-phosphor/20 hover:border-phosphor",
                  "hover:shadow-[0_0_12px_0_rgba(0,232,122,0.25)]",
                  "active:scale-[0.97]",
                ].join(" "),
          ].join(" ")}
          title="Submit solution (evaluate hidden testcases)"
        >
          {isSubmitting ? (
            <>
              <span className="w-1 h-1 rounded-full bg-current animate-pulse_soft" />
              Judging…
            </>
          ) : (
            <>
              <svg viewBox="0 0 10 10" className="w-2 h-2 fill-current">
                <polyline points="1,5 4,8 9,2" stroke="currentColor" strokeWidth="1.5" fill="none" />
              </svg>
              Submit
            </>
          )}
        </button>
      </div>
    </header>
  );
}