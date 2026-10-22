"use client";
/**
 * components/ArenaToolbar.tsx
 *
 * Top toolbar for the Arena problem solver page.
 * Mirrors ProblemToolbar.tsx visually but operates on ArenaSubmissionResult
 * and ArenaRunState — no coupling to Learning Path types.
 */

import Link from "next/link";
import type { ArenaRunState, UseArenaProblemReturn } from "@/hooks/useArenaProblem";
import type { ArenaSubmissionResult } from "@/lib/arena/types";

interface Props {
  title:      string;
  category:   string;
  hook:       UseArenaProblemReturn;
  onReset:    () => void;
  onToggleTutor?: () => void;
  onSynthesize?:  () => void;
  onReport?:      () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Verdict badge
// ─────────────────────────────────────────────────────────────────────────────

function VerdictBadge({ sub }: { sub: ArenaSubmissionResult | null }) {
  if (!sub) return null;
  const cls = sub.accepted
    ? "border-phosphor/40 bg-phosphor/10 text-phosphor"
    : "border-danger/40  bg-danger/10  text-danger";
  const tooSlow = !sub.accepted && !!sub.timing && sub.passed === sub.total;   // timing problems: right answers, slow clock
  const label = sub.accepted ? "✓ Accepted" : tooSlow ? "✗ Too Slow" : "✗ Wrong Answer";
  return (
    <div className={`font-mono text-[10px] border px-2 py-1 rounded ${cls}`}>
      {label}
      <span className="ml-2 opacity-60">{sub.passed}/{sub.total}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function ArenaToolbar({ title, category, hook, onReset, onToggleTutor, onSynthesize, onReport }: Props) {
  const { isRunning, isSubmitting, run, submit, submission, submittingIndex, submittingTotal } = hook;

  const busy = isRunning || isSubmitting;

  return (
    <header className="h-11 flex items-center justify-between px-4 bg-surface/90 border-b border-rim backdrop-blur-sm shrink-0">

      {/* Left — breadcrumb */}
      <div className="flex items-center gap-2 min-w-0">
        <Link href="/" className="flex items-center gap-1.5 group shrink-0">
          <img
            src="/bitflow_logo_64.png"
            alt="BitFlow"
            className="w-5 h-5 object-contain opacity-80 group-hover:opacity-100 transition-opacity"
          />
          <span className="font-display text-[12px] font-bold text-bright hidden sm:block">BitFlow</span>
        </Link>

        <span className="text-rim hidden sm:block">·</span>

        <Link
          href="/arena"
          className="font-mono text-[10px] text-dim hover:text-ghost transition-colors hidden sm:block"
        >
          Arena
        </Link>

        <span className="text-rim">·</span>

        <span className="font-mono text-[9px] text-dim/60 border border-rim/30 px-1.5 py-0.5 rounded">
          {category}
        </span>

        <span className="font-mono text-[11px] text-pale truncate max-w-[160px]">
          {title}
        </span>
      </div>

      {/* Centre — submission progress */}
      {isSubmitting && (
        <div className="font-mono text-[9px] text-dim/70 tabular-nums">
          Running {submittingIndex + 1}/{submittingTotal}…
        </div>
      )}

      {/* Right — actions */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Last submission verdict */}
        <VerdictBadge sub={submission} />

        {onReport && (
          <button
            onClick={onReport}
            title="Lab report: code, simulation output, waveform and synthesis, ready to print or save as PDF"
            className="font-mono text-[9px] text-dim hover:text-ghost border border-rim/40 hover:border-rim px-2 py-1 rounded transition-all"
          >
            Report
          </button>
        )}

        {onSynthesize && (
          <button
            onClick={onSynthesize}
            className="font-mono text-[9px] text-dim hover:text-ghost border border-rim/40 hover:border-rim px-2 py-1 rounded transition-all"
            title="Synthesize with Yosys: cells, latches, schematic, FSM diagram"
          >
            Synth
          </button>
        )}

        {onToggleTutor && (
          <button
            onClick={onToggleTutor}
            className="font-mono text-[9px] text-dim hover:text-ghost border border-rim/40 hover:border-rim px-2 py-1 rounded transition-all"
            title="Ask the AI tutor for a hint"
          >
            Tutor
          </button>
        )}

        {/* Reset button */}
        <button
          onClick={onReset}
          disabled={busy}
          className="font-mono text-[9px] text-dim hover:text-ghost border border-rim/40 hover:border-rim px-2 py-1 rounded transition-all disabled:opacity-40"
        >
          Reset
        </button>

        {/* Run */}
        <button
          onClick={run}
          disabled={busy}
          className="flex items-center gap-1.5 font-mono text-[10px] text-bright border border-rim/60 hover:border-rim bg-surface/60 hover:bg-surface px-3 py-1.5 rounded transition-all disabled:opacity-50"
        >
          {isRunning ? (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-phosphor animate-pulse" />
              Running…
            </>
          ) : (
            <>
              <svg viewBox="0 0 8 8" className="w-2.5 h-2.5 fill-phosphor" aria-hidden>
                <polygon points="1,1 7,4 1,7" />
              </svg>
              Run
            </>
          )}
        </button>

        {/* Submit */}
        <button
          onClick={() => submit()}
          disabled={busy}
          className="flex items-center gap-1.5 font-mono text-[10px] text-void font-semibold bg-phosphor hover:bg-phosphor/90 px-3 py-1.5 rounded transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-void animate-pulse" />
              Judging…
            </>
          ) : (
            <>
              <svg viewBox="0 0 8 8" className="w-2.5 h-2.5 fill-current" aria-hidden>
                <path d="M1 4l2.5 2.5L7 1.5" strokeWidth="1.2" stroke="currentColor" fill="none" />
              </svg>
              Submit
            </>
          )}
        </button>
      </div>
    </header>
  );
}