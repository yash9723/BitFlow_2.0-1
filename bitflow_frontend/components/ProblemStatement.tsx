"use client";
/**
 * components/ProblemStatement.tsx — Problem description left panel
 *
 * Renders the full problem content:
 *   - Header (title, difficulty badge, XP reward, category)
 *   - Problem statement (Markdown-ish — rendered as pre-formatted text for now)
 *   - Constraints list
 *   - Examples
 *   - Progressive hints (unlock one tier at a time)
 *   - Submission result panel (shown after submit)
 *
 * IMPORTANT: This is a pure display component.
 * All state (hints unlocked, submission result) comes from props.
 * Zero simulation logic lives here.
 */

import React, { useState, memo } from "react";
import type { Problem, SubmissionResult, Hint } from "@/lib/problem-types";
import type { ProgressRecord } from "@/lib/problem-types";
import SubmissionHistory from "./SubmissionHistory";
import OptimizationBoard from "./OptimizationBoard";
import { CounterexampleView, FailingWaveformView } from "./WaveformPanel";

interface ProblemStatementProps {
  problem:    Problem;
  progress:   ProgressRecord;
  submission: SubmissionResult | null;
  onUnlockHint?: (tier: 1 | 2 | 3) => void;
  /** Attempt history (Load / Diff) — shown when given. */
  history?: React.ComponentProps<typeof SubmissionHistory>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Difficulty badge
// ─────────────────────────────────────────────────────────────────────────────

const DIFF_COLOURS: Record<string, string> = {
  beginner:     "text-phosphor border-phosphor/40 bg-phosphor/10",
  intermediate: "text-info border-info/40 bg-info/10",
  advanced:     "text-warn border-warn/40 bg-warn/10",
  arena:        "text-danger border-danger/40 bg-danger/10",
};

function DiffBadge({ difficulty }: { difficulty: string }) {
  return (
    <span className={`font-mono text-[9px] uppercase tracking-widest px-2 py-0.5 rounded border ${DIFF_COLOURS[difficulty] ?? "text-ghost border-rim"}`}>
      {difficulty}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Verdict panel — shown after submission
// ─────────────────────────────────────────────────────────────────────────────

const VerdictPanel = memo(function VerdictPanel({
  result,
}: {
  result: SubmissionResult;
}) {
  const [expanded, setExpanded] = useState(false);
  const pct = result.total > 0 ? Math.round((result.passed / result.total) * 100) : 0;

  return (
    <div className={`rounded border ${result.accepted ? "border-phosphor/40 bg-phosphor/5" : "border-danger/40 bg-danger/5"} overflow-hidden`}>
      {/* Summary row */}
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-2">
          <span className={`font-mono text-[11px] font-bold ${result.accepted ? "text-phosphor" : "text-danger"}`}>
            {result.accepted ? "✓ ACCEPTED" : "✗ WRONG ANSWER"}
          </span>
          {result.xpEarned > 0 && (
            <span className="font-mono text-[9px] text-phosphor/70 bg-phosphor/10 border border-phosphor/20 px-1.5 py-0.5 rounded">
              +{result.xpEarned} XP
            </span>
          )}
        </div>
        {result.verdicts.length > 0 && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="font-mono text-[9px] text-dim hover:text-ghost transition-colors"
          >
            {expanded ? "▲ hide" : "▼ details"}
          </button>
        )}
      </div>

      {/* Progress bar */}
      <div className="mx-3 mb-2 h-1 bg-surface rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${result.accepted ? "bg-phosphor" : "bg-danger"}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="px-3 pb-2 font-mono text-[9px] text-ghost">
        {result.passed}/{result.total} testcases passed · {Math.round(result.totalDurationMs)}ms
      </div>

      {/* Testcase breakdown */}
      {expanded && result.verdicts.length > 0 && (
        <div className="border-t border-rim/40 px-3 py-2 space-y-1.5">
          {result.verdicts.map((v, i) => (
            <div key={v.testcaseId} className="flex items-start gap-2">
              <span className={`shrink-0 font-mono text-[9px] mt-0.5 ${v.passed ? "text-phosphor" : "text-danger"}`}>
                {v.passed ? "✓" : "✗"}
              </span>
              <div className="flex-1 min-w-0">
                <div className="font-mono text-[9px] text-pale truncate">
                  Testcase {i + 1}: {v.description}
                </div>
                {!v.passed && v.error && (
                  <div className="font-mono text-[8px] text-danger/70 mt-0.5 break-all">
                    {v.error}
                  </div>
                )}
              </div>
              <span className="shrink-0 font-mono text-[8px] text-dim">
                {Math.round(v.durationMs)}ms
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Hint block
// ─────────────────────────────────────────────────────────────────────────────

function HintBlock({
  hint,
  unlocked,
  onUnlock,
}: {
  hint:     Hint;
  unlocked: boolean;
  onUnlock: () => void;
}) {
  if (!unlocked) {
    return (
      <button
        onClick={onUnlock}
        className="w-full flex items-center gap-2 px-3 py-2 rounded border border-rim/60 bg-surface/30 hover:border-warn/30 hover:bg-warn/5 transition-all duration-100 text-left"
      >
        <span className="font-mono text-[9px] text-dim">🔒</span>
        <span className="font-mono text-[9px] text-dim">
          Hint {hint.tier} — click to unlock
          {hint.xpCost ? ` (costs ${hint.xpCost} XP)` : " (free)"}
        </span>
      </button>
    );
  }

  return (
    <div className="px-3 py-2 rounded border border-warn/30 bg-warn/5">
      <div className="font-mono text-[8px] text-warn/60 mb-1 uppercase tracking-widest">
        Hint {hint.tier}
      </div>
      <div className="font-mono text-[10px] text-pale leading-relaxed">
        {hint.content}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section wrapper
// ─────────────────────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="font-mono text-[9px] text-dim uppercase tracking-widest border-b border-rim/40 pb-1">
        {title}
      </h3>
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export default function ProblemStatement({
  problem,
  progress,
  submission,
  onUnlockHint,
  history,
}: ProblemStatementProps) {
  const problemProgress = progress.problems[problem.id];
  const hintsUnlocked   = problemProgress?.hintsUnlocked ?? [];
  const solved          = problemProgress?.solved ?? false;

  return (
    <div className="h-full flex flex-col bg-pit overflow-hidden">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="shrink-0 px-4 py-3 border-b border-rim bg-surface/50">
        {/* Breadcrumb */}
        <div className="font-mono text-[8px] text-dim/60 mb-1.5 uppercase tracking-wider">
          {problem.learningLevel} › {problem.category.replace("_", " ")}
        </div>

        {/* Title row */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <h1 className="font-mono text-[14px] font-bold text-bright leading-tight">
            {problem.title}
          </h1>
          {solved && (
            <span className="shrink-0 font-mono text-[9px] text-phosphor bg-phosphor/10 border border-phosphor/30 px-2 py-0.5 rounded">
              ✓ Solved
            </span>
          )}
        </div>

        {/* Meta row */}
        <div className="flex items-center gap-2 flex-wrap">
          <DiffBadge difficulty={problem.difficulty} />
          <span className="font-mono text-[9px] text-dim">+{problem.xpReward} XP</span>
          <span className="font-mono text-[8px] text-dim/50">#{problem.id}</span>
          {problem.tags.slice(0, 3).map((t) => (
            <span key={t} className="font-mono text-[8px] text-dim/60 bg-surface border border-rim/40 px-1.5 py-0.5 rounded">
              {t}
            </span>
          ))}
        </div>
      </div>

      {/* ── Scrollable content ─────────────────────────────────────────── */}
      <div
        className="flex-1 overflow-y-auto px-4 py-4 space-y-5 min-h-0"
        style={{ scrollbarWidth: "thin", scrollbarColor: "#22232d transparent" }}
      >
        {/* Submission result — shown prominently at top after submit */}
        {submission && (
          <Section title="Last Submission">
            <VerdictPanel result={submission} />
            {submission.counterexample && <CounterexampleView data={submission.counterexample} />}
            {submission.failingWaveform && <FailingWaveformView data={submission.failingWaveform} />}
          </Section>
        )}

        {history && (
          <Section title="Your Attempts">
            <SubmissionHistory {...history} />
          </Section>
        )}

        {history && (
          <Section title="Smallest Design">
            <OptimizationBoard slug={history.slug} refreshKey={submission} />
          </Section>
        )}

        {/* Problem statement */}
        <Section title="Problem">
          <pre
            className="font-mono text-[10px] text-pale leading-relaxed whitespace-pre-wrap break-words"
            style={{ fontFamily: "inherit" }}
          >
            {/* Strip markdown headers for simple rendering */}
            {problem.statement.replace(/^#{1,3}\s*/gm, "").trim()}
          </pre>
        </Section>

        {/* Constraints */}
        {problem.constraints.length > 0 && (
          <Section title="Constraints">
            <ul className="space-y-1">
              {problem.constraints.map((c, i) => (
                <li key={i} className="flex items-start gap-2 font-mono text-[10px] text-pale">
                  <span className="text-dim shrink-0 mt-0.5">·</span>
                  <span>{c}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* Examples */}
        {problem.examples.length > 0 && (
          <Section title="Examples">
            {problem.examples.map((ex, i) => (
              <div key={i} className="rounded border border-rim/40 bg-surface/30 overflow-hidden">
                <div className="px-3 py-2 border-b border-rim/30">
                  <div className="font-mono text-[9px] text-dim uppercase tracking-widest mb-1">Input</div>
                  <code className="font-mono text-[10px] text-pale">{ex.input}</code>
                </div>
                <div className="px-3 py-2 border-b border-rim/30">
                  <div className="font-mono text-[9px] text-dim uppercase tracking-widest mb-1">Output</div>
                  <code className="font-mono text-[10px] text-pale">{ex.output}</code>
                </div>
                {ex.explanation && (
                  <div className="px-3 py-2">
                    <div className="font-mono text-[9px] text-dim uppercase tracking-widest mb-1">Explanation</div>
                    <p className="font-mono text-[10px] text-ghost">{ex.explanation}</p>
                  </div>
                )}
              </div>
            ))}
          </Section>
        )}

        {/* Hints */}
        {problem.hints.length > 0 && (
          <Section title="Hints">
            <div className="space-y-2">
              {problem.hints.map((hint) => (
                <HintBlock
                  key={hint.tier}
                  hint={hint}
                  unlocked={hintsUnlocked.includes(hint.tier)}
                  onUnlock={() => onUnlockHint?.(hint.tier)}
                />
              ))}
            </div>
          </Section>
        )}

        {/* Solution explanation — only shown after solve */}
        {solved && problem.solutionExplanation && (
          <Section title="Solution Explanation">
            <div className="px-3 py-2 rounded border border-phosphor/20 bg-phosphor/5">
              <pre className="font-mono text-[10px] text-pale leading-relaxed whitespace-pre-wrap">
                {problem.solutionExplanation}
              </pre>
            </div>
          </Section>
        )}
      </div>
    </div>
  );
}