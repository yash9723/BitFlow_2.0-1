"use client";
/** components/academy/anim/logic.tsx — chapters 6 to 8: Venn diagrams, K-map neighbours, Quine-McCluskey merging. */

import { useId, useMemo, useState } from "react";
import { keyOf, neighbours, qmSteps } from "@/lib/academy/anim";
import { type Parsed, counterexample, evaluate, parseBool } from "@/lib/studio/boolexpr";
import { kmapLayout, onesIn, sopText, termPattern } from "@/lib/studio/logic-min";
import { AnimCard, Caption, Controls, FADE, INK, LINE, ON, chip, useSteps } from "./Player";

// ── Venn ──────────────────────────────────────────────────────────────────────
const CIRCLES: Record<number, [string, number, number][]> = {
  2: [["A", 92, 86], ["B", 148, 86]],
  3: [["A", 94, 70], ["B", 146, 70], ["C", 120, 112]],
};
const PRESETS = [
  { label: "De Morgan 1", a: "(AB)'", b: "A' + B'" },
  { label: "De Morgan 2", a: "(A + B)'", b: "A'B'" },
  { label: "Absorption", a: "A + AB", b: "A" },
  { label: "Distribution", a: "A + BC", b: "(A + B)(A + C)" },
  { label: "XOR", a: "A ^ B", b: "AB' + A'B" },
  { label: "Not equal", a: "(AB)'", b: "A'B'" },
];

function Diagram({ parsed, names, title }: { parsed: Parsed | string; names: string[]; title: string }) {
  const id = useId().replace(/:/g, "");
  const circles = CIRCLES[names.length], r = names.length === 3 ? 46 : 56;
  return (
    <svg viewBox="0 0 240 172" className="w-full h-auto" role="img" aria-label={`Venn diagram of ${title}`}>
      <defs>
        {circles.map(([n, x, y]) => <clipPath key={n} id={`${id}in${n}`}><circle cx={x} cy={y} r={r} /></clipPath>)}
        {circles.map(([n, x, y]) => <mask key={n} id={`${id}out${n}`} maskUnits="userSpaceOnUse" x={0} y={0} width={240} height={172}><rect width={240} height={172} fill="#fff" /><circle cx={x} cy={y} r={r} fill="#000" /></mask>)}
      </defs>
      {Array.from({ length: 2 ** names.length }, (_, m) => {
        const env = Object.fromEntries(names.map((n, i) => [n, (m >> (names.length - 1 - i)) & 1]));
        const lit = typeof parsed !== "string" && evaluate(parsed.expr, env) === 1;
        let shape = <rect x={2} y={2} width={236} height={168} rx={8} fill={ON} opacity={lit ? 0.75 : 0.03} style={{ transition: FADE }} />;
        names.forEach((n) => { shape = <g {...(env[n] ? { clipPath: `url(#${id}in${n})` } : { mask: `url(#${id}out${n})` })}>{shape}</g>; });
        return <g key={m}>{shape}</g>;
      })}
      <rect x={2} y={2} width={236} height={168} rx={8} fill="none" stroke={LINE} />
      {circles.map(([n, x, y]) => <circle key={n} cx={x} cy={y} r={r} fill="none" stroke={INK} strokeWidth={1.5} />)}
      {circles.map(([n, x, y], i) => {
        const dx = names.length === 2 ? (i ? 34 : -34) : i === 2 ? 0 : i ? 28 : -28, dy = names.length === 2 ? 4 : i === 2 ? 34 : -20;
        return <text key={n} x={x + dx} y={y + dy} textAnchor="middle" fontSize={15} fontWeight={700} fill="#fff" stroke="#000" strokeWidth={3} paintOrder="stroke">{n}</text>;
      })}
    </svg>
  );
}

const read = (src: string): Parsed | string => {
  const p = parseBool(src);
  if (typeof p === "string") return p;
  return p.vars.every((v) => "ABC".includes(v)) ? p : "Use only A, B and C.";
};

export function Venn() {
  const [a, setA] = useState(PRESETS[0].a);
  const [b, setB] = useState(PRESETS[0].b);
  const pa = read(a), pb = read(b);
  const usesC = [pa, pb].some((p) => typeof p !== "string" && p.vars.includes("C"));
  const names = usesC ? ["A", "B", "C"] : ["A", "B"];
  const both = typeof pa !== "string" && typeof pb !== "string";
  const diff = both ? counterexample(pa, pb) : null;
  const box = "w-full px-2 py-1 rounded border border-rim/60 bg-void font-mono text-[14px] text-bright";
  const sides: [string, (s: string) => void, Parsed | string][] = [[a, setA, pa], [b, setB, pb]];
  return (
    <AnimCard title="See an expression as a picture" hint="Each circle is a variable being 1, and the green area is where the expression is 1. If two pictures match, the expressions are equal.">
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((p) => <button key={p.label} type="button" className={chip(a === p.a && b === p.b)} onClick={() => { setA(p.a); setB(p.b); }}>{p.label}</button>)}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {sides.map(([src, set, parsed], i) => (
          <div key={i} className="min-w-0 space-y-1.5">
            <input aria-label={`Expression ${i + 1}`} className={box} value={src} spellCheck={false} onChange={(e) => set(e.target.value)} />
            <Diagram parsed={parsed} names={names} title={src} />
            {typeof parsed === "string" && <p className="text-[12px] text-warn">{parsed}</p>}
          </div>
        ))}
      </div>
      <Caption>
        {!both ? "Type an expression using A, B and C. For example: AB + C'"
          : diff ? <>These are <strong className="text-warn">not equal</strong>. With {Object.entries(diff.env).map(([k, v]) => `${k} = ${v}`).join(", ")}, the first gives {diff.a} and the second gives {diff.b}.</>
          : <>These are <strong className="text-phosphor">equal</strong>: the same area, for every combination of inputs.</>}
      </Caption>
    </AnimCard>
  );
}

// ── K-map neighbours ──────────────────────────────────────────────────────────
export function KmapNeighbours() {
  const [n, setN] = useState(4);
  const [cell, setCell] = useState(5);
  const names = "abcd".slice(0, n).split(""), k = kmapLayout(names), m = cell % 2 ** n;
  const near = neighbours(m, n);
  const bits = (v: number) => v.toString(2).padStart(n, "0");
  const posOf = (x: number) => { for (let r = 0; r < k.rows.length; r++) for (let c = 0; c < k.cols.length; c++) if (k.minterm(r, c) === x) return { r, c }; return { r: 0, c: 0 }; };
  const here = posOf(m);
  const wraps = near.filter((x) => { const p = posOf(x); return Math.abs(p.r - here.r) + Math.abs(p.c - here.c) !== 1; });
  return (
    <AnimCard title="Who touches whom on a K-map" hint="Click any cell. Its neighbours are the cells that differ from it in one variable.">
      <div className="flex gap-1.5">{[3, 4].map((x) => <button key={x} type="button" className={chip(n === x)} aria-pressed={n === x} onClick={() => setN(x)}>{x} variables</button>)}</div>
      <div className="inline-grid gap-1 font-mono" style={{ gridTemplateColumns: `3rem repeat(${k.cols.length}, minmax(0, 3.25rem))` }}>
        <span className="text-[11px] text-dim self-end">{k.rowVars.join("")} \ {k.colVars.join("")}</span>
        {k.cols.map((c) => <span key={c} className="text-center text-[12px] text-ghost">{c.toString(2).padStart(k.colVars.length, "0")}</span>)}
        {k.rows.map((rv, r) => [
          <span key={`r${rv}`} className="text-right pr-1.5 self-center text-[12px] text-ghost">{rv.toString(2).padStart(k.rowVars.length, "0")}</span>,
          ...k.cols.map((_, c) => {
            const x = k.minterm(r, c), isCell = x === m, isNear = near.includes(x);
            return (
              <button key={x} type="button" onClick={() => setCell(x)} aria-pressed={isCell} aria-label={`Cell ${x}, ${bits(x)}${isNear ? ", a neighbour" : ""}`}
                      className={`h-12 rounded border text-[14px] transition-[background-color,border-color,color,transform] duration-200 ease-out ${isCell ? "border-phosphor bg-phosphor/25 text-phosphor font-bold" : isNear ? "border-info/70 bg-info/15 text-info scale-[0.97]" : "border-rim/40 text-dim hover:border-rim"}`}>{x}</button>
            );
          }),
        ])}
      </div>
      <Caption>
        Cell {m} is {bits(m)}. {near.map((x) => `${x} flips ${names[n - 1 - Math.log2(x ^ m)]}`).join(", ")}.
        {wraps.length > 0 && <> {wraps.join(" and ")} {wraps.length === 1 ? "touches" : "touch"} it by wrapping round the edge of the map, so imagine the map rolled into a tube.</>}
      </Caption>
    </AnimCard>
  );
}

// ── Quine-McCluskey ───────────────────────────────────────────────────────────
function parseList(src: string, n: number): number[] | string {
  const out = src.split(/[\s,]+/).filter(Boolean).map(Number);
  if (out.some((x) => !Number.isInteger(x) || x < 0 || x >= 2 ** n)) return `Use whole numbers from 0 to ${2 ** n - 1}.`;
  return [...new Set(out)].sort((a, b) => a - b);
}

export function QmMerge() {
  const [src, setSrc] = useState("0, 1, 2, 5, 6, 7, 8, 9, 10, 14");
  const n = 4, names = ["a", "b", "c", "d"], list = parseList(src, n), key = typeof list === "string" ? "" : list.join();
  const { passes, steps } = useMemo(() => qmSteps(key ? key.split(",").map(Number) : [], []), [key]);
  const s = useSteps(steps.length, key, 800), now = steps[s.step];
  const done = steps.slice(0, s.step + 1);
  const merged = new Set<string>(), made = new Set<string>();
  for (const d of done) if (d.kind === "merge") { merged.add(`${d.pass}:${keyOf(d.a)}`).add(`${d.pass}:${keyOf(d.b)}`); made.add(`${d.pass + 1}:${keyOf(d.result)}`); }
  const isHot = (pass: number, t: { value: number; mask: number }) => now.kind === "merge" && ((pass === now.pass && (keyOf(t) === keyOf(now.a) || keyOf(t) === keyOf(now.b))) || (pass === now.pass + 1 && keyOf(t) === keyOf(now.result)));
  return (
    <AnimCard title="Quine-McCluskey, one merge at a time" hint="Type the minterms of a 4-variable function. Two terms merge when they differ in exactly one bit, and that bit becomes a dash.">
      <label className="block text-[14px] text-ghost">
        Minterms
        <input className="mt-1 w-full px-2 py-1 rounded border border-rim/60 bg-void font-mono text-[14px] text-bright" value={src} spellCheck={false} onChange={(e) => setSrc(e.target.value)} />
      </label>
      {typeof list === "string" && <p className="text-[13px] text-warn">{list}</p>}
      <div className="flex flex-wrap items-start gap-3 font-mono text-[14px] min-h-[12em]">
        {passes.map((terms, pass) => (pass === 0 || terms.some((t) => made.has(`${pass}:${keyOf(t)}`))) && (
          <div key={pass} className="rounded-lg border border-rim/50 p-2">
            <div className="font-sans text-[12px] text-dim mb-1">{pass === 0 ? "Minterms" : `Pass ${pass}`}</div>
            {[...new Set(terms.map(onesIn))].sort((a, b) => a - b).map((count) => (
              <div key={count} className="border-t border-rim/30 first:border-t-0 py-0.5">
                {terms.filter((t) => onesIn(t) === count).map((t) => {
                  if (pass > 0 && !made.has(`${pass}:${keyOf(t)}`)) return null;
                  const hot = isHot(pass, t), used = merged.has(`${pass}:${keyOf(t)}`), prime = now.kind === "done" && !t.merged;
                  return <div key={keyOf(t)} className={`px-1 rounded transition-colors duration-200 ${pass ? "anim-in" : ""} ${hot ? "bg-info/25 text-bright" : prime ? "bg-phosphor/20 text-phosphor font-bold" : used ? "text-dim line-through" : "text-pale"}`}>{termPattern(t, n)}</div>;
                })}
              </div>
            ))}
          </div>
        ))}
      </div>
      <Controls s={s} />
      <Caption>
        {now.kind === "start" ? (now.pass === 0 ? "Sort the minterms by how many 1s they have. Only neighbouring groups can differ by one bit, so you only compare those." : `Pass ${now.pass}: try to merge the terms just made. Only terms with dashes in the same places can merge.`)
          : now.kind === "merge" ? `${termPattern(now.a, n)} and ${termPattern(now.b, n)} differ in one bit, so they merge into ${termPattern(now.result, n)}${now.repeat ? ", which we already have" : ""}. Both get crossed out.`
          : now.primes.length ? <>Nothing else merges. The terms never crossed out are the <strong className="text-phosphor">prime implicants</strong>: {sopText(now.primes, names, "math")}. Next, the chart picks the cheapest set that covers every minterm.</>
          : "No minterms, so the function is always 0."}
      </Caption>
    </AnimCard>
  );
}
