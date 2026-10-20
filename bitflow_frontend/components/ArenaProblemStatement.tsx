"use client";
/**
 * components/ArenaProblemStatement.tsx
 *
 * Left-panel problem statement for the Arena problem solver.
 * Reuses the visual language of ProblemStatement.tsx but with
 * Arena-specific badge colours (danger/red for arena difficulty).
 *
 * Does NOT import anything from lib/problem-types — fully decoupled
 * from the Learning Path type system.
 */

import type { ReactNode } from "react";
import type { ArenaProblem } from "@/lib/arena/types";

// ─────────────────────────────────────────────────────────────────────────────
// Difficulty colours (Arena-specific scale)
// ─────────────────────────────────────────────────────────────────────────────

const DIFF_COLOUR: Record<string, string> = {
  Easy:   "text-phosphor border-phosphor/40 bg-phosphor/10",
  Medium: "text-info    border-info/40    bg-info/10",
  Hard:   "text-warn    border-warn/40    bg-warn/10",
  Expert: "text-danger  border-danger/40  bg-danger/10",
};

// ─────────────────────────────────────────────────────────────────────────────
// Simple markdown-to-jsx — handles the subset used in problem statements
// (headings, bold, inline code, tables, code blocks, lists)
// Re-implements only what ProblemStatement.tsx already does, no new deps.
// ─────────────────────────────────────────────────────────────────────────────

export function renderMarkdown(md: string): React.ReactNode {
  const lines = md.split("\n");
  const out: React.ReactNode[] = [];
  let i = 0;

  const inlineFormat = (text: string): React.ReactNode => {
    const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
    return parts.map((part, idx) => {
      if (part.startsWith("`") && part.endsWith("`"))
        return <code key={idx} className="font-mono text-[10px] bg-surface px-1 py-0.5 rounded text-phosphor border border-rim/30">{part.slice(1, -1)}</code>;
      if (part.startsWith("**") && part.endsWith("**"))
        return <strong key={idx} className="text-bright font-semibold">{part.slice(2, -2)}</strong>;
      return part;
    });
  };

  while (i < lines.length) {
    const line = lines[i];

    // Code block
    if (line.startsWith("```")) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      out.push(
        <pre key={i} className="my-3 p-3 bg-pit rounded border border-rim/40 overflow-x-auto">
          <code className="font-mono text-[10px] text-ghost leading-relaxed">{codeLines.join("\n")}</code>
        </pre>
      );
      i++; continue;
    }

    // Table
    if (line.startsWith("|")) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].startsWith("|")) {
        tableLines.push(lines[i]);
        i++;
      }
      const rows = tableLines
        .filter((l) => !l.match(/^\|[-| :]+\|$/))
        .map((l) => l.split("|").filter((_, idx, arr) => idx > 0 && idx < arr.length - 1).map((c) => c.trim()));
      out.push(
        <div key={i} className="my-3 overflow-x-auto">
          <table className="w-full border-collapse font-mono text-[9px]">
            <thead>
              <tr>
                {rows[0]?.map((h, ci) => (
                  <th key={ci} className="border border-rim/40 px-2 py-1 text-left text-ghost bg-surface/60">{inlineFormat(h)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(1).map((row, ri) => (
                <tr key={ri} className="even:bg-surface/20">
                  {row.map((cell, ci) => (
                    <td key={ci} className="border border-rim/40 px-2 py-1 text-dim">{inlineFormat(cell)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    // Heading
    if (line.startsWith("## "))  { out.push(<h2 key={i} className="font-display text-[14px] font-bold text-bright mt-4 mb-2">{line.slice(3)}</h2>); i++; continue; }
    if (line.startsWith("### ")) { out.push(<h3 key={i} className="font-mono text-[11px] font-semibold text-pale mt-3 mb-1.5">{line.slice(4)}</h3>); i++; continue; }

    // List item
    if (line.startsWith("- ") || line.startsWith("* ")) {
      out.push(<li key={i} className="font-mono text-[10px] text-ghost ml-4 list-disc leading-relaxed">{inlineFormat(line.slice(2))}</li>);
      i++; continue;
    }

    // Blank line
    if (line.trim() === "") { out.push(<div key={i} className="h-2" />); i++; continue; }

    // Paragraph
    out.push(<p key={i} className="font-mono text-[10px] text-ghost leading-relaxed">{inlineFormat(line)}</p>);
    i++;
  }

  return <>{out}</>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  problem: ArenaProblem;
  /** Extra panel content shown under the header (e.g. attempt history). */
  children?: ReactNode;
}

export function ArenaProblemStatement({ problem, children }: Props) {
  const diffCls = DIFF_COLOUR[problem.difficulty] ?? "text-ghost border-rim/40 bg-surface/10";

  return (
    <div className="h-full overflow-y-auto px-5 py-4 space-y-4">

      {/* Header */}
      <div>
        {/* Category + difficulty row */}
        <div className="flex items-center gap-2 mb-2">
          <span className="font-mono text-[8px] text-dim/60 uppercase tracking-widest border border-rim/30 px-1.5 py-0.5 rounded">
            {problem.category}
          </span>
          <span className={`font-mono text-[8px] border px-1.5 py-0.5 rounded uppercase tracking-wider ${diffCls}`}>
            {problem.difficulty}
          </span>
          <span className="font-mono text-[8px] text-dim/50">
            ~{problem.estimatedMin} min
          </span>
        </div>

        {/* Title */}
        <h1 className="font-display text-[18px] font-bold text-bright leading-tight mb-1">
          {problem.title}
        </h1>

        {/* Tags */}
        <div className="flex flex-wrap gap-1.5 mt-2">
          {problem.tags.map((tag) => (
            <span key={tag} className="font-mono text-[8px] text-dim/70 border border-rim/30 bg-surface/30 px-1.5 py-0.5 rounded">
              #{tag}
            </span>
          ))}
        </div>
      </div>

      {children}

      <hr className="border-rim/30" />

      {/* Statement */}
      <div>{renderMarkdown(problem.statement)}</div>

      {/* Examples */}
      {problem.examples.length > 0 && (
        <div>
          <h3 className="font-mono text-[11px] font-semibold text-pale mb-2">Examples</h3>
          {problem.examples.map((ex, idx) => (
            <div key={idx} className="mb-3 rounded border border-rim/40 bg-pit/40 overflow-hidden">
              <div className="px-3 py-2 border-b border-rim/30 bg-surface/40">
                <span className="font-mono text-[9px] text-dim uppercase tracking-wider">Example {idx + 1}</span>
              </div>
              <div className="px-3 py-2 space-y-1.5">
                <div>
                  <span className="font-mono text-[8px] text-dim/60 block mb-0.5">INPUT</span>
                  <code className="font-mono text-[10px] text-phosphor">{ex.input}</code>
                </div>
                <div>
                  <span className="font-mono text-[8px] text-dim/60 block mb-0.5">OUTPUT</span>
                  <code className="font-mono text-[10px] text-info">{ex.output}</code>
                </div>
                {ex.explanation && (
                  <p className="font-mono text-[9px] text-dim/70 italic">{ex.explanation}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Constraints */}
      {problem.constraints.length > 0 && (
        <div>
          <h3 className="font-mono text-[11px] font-semibold text-pale mb-2">Constraints</h3>
          <ul className="space-y-1">
            {problem.constraints.map((c, idx) => (
              <li key={idx} className="font-mono text-[9px] text-ghost flex gap-2">
                <span className="text-phosphor/60 shrink-0">·</span>
                {c}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* XP reward */}
      <div className="flex items-center gap-2 pt-2 border-t border-rim/20">
        <span className="font-mono text-[9px] text-dim">Reward</span>
        <span className="font-mono text-[10px] text-warn font-bold">+{problem.xpReward} XP</span>
      </div>

    </div>
  );
}