"use client";
/**
 * components/studio/Kmap.tsx — a K-map with its groups, walked through one group at a time
 * (lib/studio/logic-min.ts). Used by the truth-table tool, where cells can be edited, and
 * inside the circuit editor, where the map shows the circuit's own function and the row the
 * switches are on now. 5-6 inputs draw as sheets of 4-variable maps.
 */

import { useEffect, useMemo, useState } from "react";
import {
  type Cell, type Implicant, groupRects, kmapSheets, minimizationSteps, onesIn, posText, sheetTerm, sopText, termPattern,
} from "@/lib/studio/logic-min";

export const KMAP_COLORS = ["#00e87a", "#4db8ff", "#ffb547", "#ff6bcb", "#a78bfa", "#f87171", "#2dd4bf", "#facc15"];
const show = (c: Cell) => (c === "x" ? "X" : String(c));
const textOf = (form: "sop" | "pos") => (form === "sop" ? sopText : posText);

/** One map, or its sheets. groups: the terms to draw, each with its palette index. */
export function Kmap({ names, cells, groups, form, onCell, mark, title }: {
  names: string[]; cells: Cell[]; groups: { term: Implicant; color: number }[]; form: "sop" | "pos";
  onCell?: (m: number) => void; mark?: number; title: string;
}) {
  const { outer, sheets, inner: k } = kmapSheets(names);
  const innerBits = names.length - outer.length;
  const C = outer.length ? 40 : 52, L = outer.length ? 50 : 64, T = 40;     // cell size, left and top label space
  const W = L + k.cols.length * C + 8, H = T + k.rows.length * C + 8;
  const bits = (v: number, w: number) => (w ? v.toString(2).padStart(w, "0") : "");
  const sheetLabel = (s: number) => outer.map((nm, i) => `${nm}=${(s >> (outer.length - 1 - i)) & 1}`).join(" ");
  return (
    <div className={outer.length ? "grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-[720px]" : ""}>
      {sheets.map((s) => {
        const base = s << innerBits;
        return (
          <div key={s} className="min-w-0">
            {outer.length > 0 && <div className="font-mono text-[11px] text-pale mb-1">{sheetLabel(s)}</div>}
            <svg viewBox={`0 0 ${W} ${H}`} className={`w-full h-auto select-none ${outer.length ? "" : "max-w-[420px]"}`} role="img"
                 aria-label={`K-map of ${title}${outer.length ? `, ${sheetLabel(s)}` : ""}`}>
              <text x={L - 8} y={T - 22} textAnchor="end" fontSize={11} fill="#8b8fa3" fontFamily="monospace">{k.rowVars.join("")}</text>
              <text x={L + 4} y={T - 22} fontSize={11} fill="#8b8fa3" fontFamily="monospace">{k.colVars.join("")}</text>
              <line x1={L - 30} y1={T - 30} x2={L} y2={T} stroke="#2e3040" />
              {k.cols.map((cv, c) => (
                <text key={c} x={L + c * C + C / 2} y={T - 8} textAnchor="middle" fontSize={11} fill="#c8cad6" fontFamily="monospace">{bits(cv, k.colVars.length)}</text>
              ))}
              {k.rows.map((rv, r) => (
                <text key={r} x={L - 8} y={T + r * C + C / 2 + 4} textAnchor="end" fontSize={11} fill="#c8cad6" fontFamily="monospace">{bits(rv, k.rowVars.length) || "–"}</text>
              ))}
              {k.rows.map((_, r) => k.cols.map((_, c) => {
                const m = base | k.minterm(r, c), v = cells[m];
                return (
                  <g key={`${r}-${c}`} data-cell={m} onClick={onCell ? () => onCell(m) : undefined} style={onCell ? { cursor: "pointer" } : undefined}>
                    <rect x={L + c * C} y={T + r * C} width={C} height={C} fill={m === mark ? "#1b2a3a" : "#111218"} stroke={m === mark ? "#4db8ff" : "#2e3040"} strokeWidth={m === mark ? 2 : 1} />
                    <text x={L + c * C + 4} y={T + r * C + 11} fontSize={8} fill="#4a4d60" fontFamily="monospace">{m}</text>
                    <text x={L + c * C + C / 2} y={T + r * C + C / 2 + 6} textAnchor="middle" fontSize={17} fontFamily="monospace"
                          fill={v === 1 ? "#00e87a" : v === "x" ? "#ffb547" : "#4a4d60"} fontWeight={v === 1 ? 700 : 400}>{show(v)}</text>
                  </g>
                );
              }))}
              {groups.map(({ term, color }, gi) => {
                const part = sheetTerm(term, s, innerBits);
                if (!part) return null;
                return groupRects(part, k).map((g, pi) => {
                  const inset = 4 + (gi % 4) * 3, stroke = KMAP_COLORS[color % KMAP_COLORS.length];
                  return (
                    <rect key={`${gi}-${pi}`} x={L + g.c * C + inset} y={T + g.r * C + inset} width={g.w * C - 2 * inset} height={g.h * C - 2 * inset}
                          rx={10} fill={stroke} fillOpacity={0.07} stroke={stroke} strokeWidth={2} pointerEvents="none">
                      <title>{textOf(form)([term], names, "math")}</title>
                    </rect>
                  );
                });
              })}
            </svg>
          </div>
        );
      })}
    </div>
  );
}

/** The map plus its working: Next / Back through the groups, essential ones first. */
export function KmapStudy({ names, cells, terms, form, onCell, mark, title }: {
  names: string[]; cells: Cell[]; terms: Implicant[]; form: "sop" | "pos";
  onCell?: (m: number) => void; mark?: number; title: string;
}) {
  const n = names.length;
  const m = useMemo(() => minimizationSteps(n, cells, form), [n, cells, form]);
  const [shown, setShown] = useState<number | null>(null);     // null: every group
  const stepKey = JSON.stringify([cells, form]);
  useEffect(() => setShown(null), [stepKey]);
  const colorOf = (t: Implicant) => Math.max(0, terms.findIndex((x) => x.value === t.value && x.mask === t.mask));
  const visible = shown === null ? m.steps : m.steps.slice(0, shown);
  const btn = "px-2 py-0.5 rounded border border-rim/60 text-ghost hover:text-bright disabled:opacity-40";
  const what = form === "sop" ? "1" : "0";
  return (
    <div className="space-y-3">
      <Kmap names={names} cells={cells} groups={visible.map((s) => ({ term: s.term, color: colorOf(s.term) }))} form={form} onCell={onCell} mark={mark} title={title} />
      {m.steps.length > 0 && (
        <div className="font-mono text-[11px] space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-dim">Grouping</span>
            <button className={btn} onClick={() => setShown(0)} disabled={shown === 0}>Start</button>
            <button className={btn} onClick={() => setShown(Math.max(0, (shown ?? m.steps.length) - 1))} disabled={shown === 0}>Back</button>
            <button className={btn} onClick={() => setShown(Math.min(m.steps.length, (shown ?? 0) + 1))} disabled={shown !== null && shown >= m.steps.length}>Next</button>
            <button className={btn} onClick={() => setShown(null)} disabled={shown === null}>All</button>
            {shown !== null && <span className="text-dim">{shown} of {m.steps.length}</span>}
          </div>
          {shown === 0 && <p className="text-ghost">Every {what} must end up in a group. A group holds 1, 2, 4, 8... cells in a rectangle, wrapping around the edges. Don&apos;t-cares can join a group but needn&apos;t be covered.</p>}
          {shown !== null && shown > 0 && (() => {
            const s = m.steps[shown - 1];
            return (
              <p className="text-ghost">
                <span style={{ color: KMAP_COLORS[colorOf(s.term) % KMAP_COLORS.length] }}>{textOf(form)([s.term], names, "math")}</span>
                {" "}groups {s.minterms.length} cell{s.minterms.length === 1 ? "" : "s"} ({s.minterms.join(", ")}) and newly covers {s.fresh.join(", ")}.{" "}
                {s.essential
                  ? <>It is <span className="text-pale">essential</span>: the only group that can cover a cell.</>
                  : <>It covers what the essential groups left, at the lowest cost.</>}
              </p>
            );
          })()}
        </div>
      )}
    </div>
  );
}

/** The same answer by Quine-McCluskey: merge passes, then the prime implicant chart. */
export function QmWorking({ names, cells, form }: { names: string[]; cells: Cell[]; form: "sop" | "pos" }) {
  const n = names.length;
  const m = useMemo(() => minimizationSteps(n, cells, form), [n, cells, form]);
  const chosen = (t: Implicant) => m.steps.some((s) => s.term.value === t.value && s.term.mask === t.mask);
  const isEssential = (t: Implicant) => m.essentials.some((e) => e.value === t.value && e.mask === t.mask);
  return (
    <details className="font-mono text-[11px]">
      <summary className="cursor-pointer text-info">Quine-McCluskey working</summary>
      <p className="mt-2 text-ghost">
        Terms that differ in one bit merge; the bit becomes a dash. A term that merges (crossed out) isn&apos;t prime.
        Rows are grouped by how many 1s they have, because only neighbouring groups can merge.
      </p>
      <div className="mt-2 flex flex-wrap gap-3">
        {m.passes.map((pass, i) => (
          <div key={i} className="rounded border border-rim/50 p-2">
            <div className="text-dim mb-1">{i === 0 ? "Minterms" : `Pass ${i}`}</div>
            {[...new Set(pass.map(onesIn))].sort((a, b) => a - b).map((ones) => (
              <div key={ones} className="border-t border-rim/30 first:border-t-0 py-0.5">
                {pass.filter((t) => onesIn(t) === ones).map((t) => (
                  <div key={`${t.value},${t.mask}`} className={t.merged ? "text-dim line-through" : "text-phosphor"}>{termPattern(t, n)}</div>
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>
      {m.primes.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <div className="text-dim mb-1">Prime implicant chart: the essential primes cover a column alone; the rest is the cheapest cover of what remains.</div>
          <table className="text-center">
            <thead><tr>
              <th className="px-2 text-left font-normal text-dim">prime</th>
              <th className="px-2 text-left font-normal text-dim">term</th>
              {m.targets.map((c) => <th key={c} className="px-1.5 font-normal text-pale">{c}</th>)}
            </tr></thead>
            <tbody>
              {m.primes.map((p) => (
                <tr key={`${p.value},${p.mask}`} className={`border-t border-rim/30 ${chosen(p) ? "text-phosphor" : "text-ghost"}`}>
                  <td className="px-2 text-left whitespace-nowrap">{termPattern(p, n)}{isEssential(p) ? " *" : ""}</td>
                  <td className="px-2 text-left whitespace-nowrap">{textOf(form)([p], names, "math")}</td>
                  {m.targets.map((c) => <td key={c} className="px-1.5">{(c & ~p.mask) === p.value ? "×" : ""}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-1 text-dim">* essential. Green rows are the minimal answer.</div>
        </div>
      )}
    </details>
  );
}
