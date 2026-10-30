"use client";
/**
 * components/academy/ChapterBlocks.tsx — the parts of an Academy chapter (lib/academy-types.ts):
 * text, tables, formulas, live circuits, K-maps, timing diagrams, worked examples and practice
 * questions. Text may use **bold** and `code`, nothing else, so chapters can't carry HTML.
 */

import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useState } from "react";
import Animation from "@/components/academy/anim";
import { Controls, btn, useSteps } from "@/components/academy/anim/Player";
import { KmapStudy, QmWorking } from "@/components/studio/Kmap";
import InteractiveWidget from "@/components/academy/InteractiveWidget";
import type { AcademyBlock } from "@/lib/academy-types";
import { type Cell, minimizePos, minimizeSop, posText, sopText } from "@/lib/studio/logic-min";
import { diagramSvg } from "@/lib/studio/wave";

const CircuitViewer = dynamic(() => import("@/components/studio/CircuitViewer"), {
  ssr: false,
  loading: () => <p className="font-mono text-[12px] text-dim animate-pulse p-4">Loading the circuit…</p>,
});

/** **bold** and `code` inside a line of text. */
export function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*|`[^`]+`)/).map((piece, i) => {
        if (piece.startsWith("**")) return <strong key={i} className="font-semibold text-bright">{piece.slice(2, -2)}</strong>;
        if (piece.startsWith("`")) return <code key={i} className="font-mono text-[0.9em] text-info bg-info/5 px-1 rounded">{piece.slice(1, -1)}</code>;
        return piece;
      })}
    </>
  );
}

const TONES = {
  tip: { box: "border-phosphor/30 bg-phosphor/5", tag: "text-phosphor", label: "Tip" },
  warning: { box: "border-warn/30 bg-warn/5", tag: "text-warn", label: "Watch out" },
  note: { box: "border-info/30 bg-info/5", tag: "text-info", label: "Note" },
};

export function Callout({ tone, text }: { tone: keyof typeof TONES; text: string }) {
  const t = TONES[tone];
  return (
    <div className={`px-4 py-3 rounded-lg border ${t.box} text-[14px] leading-relaxed text-pale`}>
      <span className={`font-semibold text-[12px] mr-2 ${t.tag}`}>{t.label}</span><Rich text={text} />
    </div>
  );
}

function Practice({ block }: { block: Extract<AcademyBlock, { kind: "practice" }> }) {
  const [chosen, setChosen] = useState<number | null>(null);
  const right = chosen === block.correctIndex;
  return (
    <div className="rounded-lg border border-warn/30 bg-warn/5 p-4 space-y-3">
      <div className="font-semibold text-[12px] text-warn">Practice{block.gate ? " · GATE-style" : ""}</div>
      <p className="text-[14px] leading-relaxed text-bright"><Rich text={block.question} /></p>
      <div className="space-y-1.5">
        {block.options.map((opt, i) => {
          const tone = chosen === null ? "border-rim/50 text-ghost hover:border-rim" : i === block.correctIndex ? "border-phosphor/60 bg-phosphor/10 text-phosphor" : i === chosen ? "border-danger/60 bg-danger/10 text-danger" : "border-rim/30 text-dim";
          return <button key={i} type="button" disabled={chosen !== null} onClick={() => setChosen(i)} className={`w-full text-left text-[14px] px-3 py-2 rounded border transition-colors ${tone}`}><span className="text-dim mr-2">{String.fromCharCode(65 + i)}.</span><Rich text={opt} /></button>;
        })}
      </div>
      {chosen !== null && (
        <div role="status" className="text-[14px] leading-relaxed text-pale">
          <span className={`font-semibold mr-1 ${right ? "text-phosphor" : "text-warn"}`}>{right ? "Right." : "Not quite."}</span>
          <Rich text={block.explanation} />
        </div>
      )}
    </div>
  );
}

const NEXT_CELL: Record<string, Cell> = { 0: 1, 1: "x", x: 0 };

function KmapBlock({ block }: { block: Extract<AcademyBlock, { kind: "kmap" }> }) {
  const form = block.form ?? "sop", n = block.names.length;
  const [cells, setCells] = useState(block.cells);
  const terms = useMemo(() => (form === "sop" ? minimizeSop : minimizePos)(n, cells), [form, n, cells]);
  const onCell = block.editable ? (m: number) => setCells(cells.map((c, i) => (i === m ? NEXT_CELL[c] : c))) : undefined;
  return (
    <figure className="rounded-xl border border-rim/60 bg-pit/50 p-4 space-y-3">
      {block.editable && (
        <div className="flex flex-wrap items-center gap-2 text-[13px] text-ghost">
          Click a cell to change it (0, 1, then don&apos;t-care). The groups and the answer update.
          <button type="button" className={btn} onClick={() => setCells(block.cells)}>Reset</button>
        </div>
      )}
      <KmapStudy names={block.names} cells={cells} terms={terms} form={form} title={block.output} onCell={onCell} />
      <p className="font-mono text-[14px] text-bright" role="status">{block.output} = {(form === "sop" ? sopText : posText)(terms, block.names, "math")}</p>
      <figcaption className="text-[13px] text-ghost"><Rich text={block.caption} /></figcaption>
    </figure>
  );
}

function Simplify({ block }: { block: Extract<AcademyBlock, { kind: "simplify" }> }) {
  const s = useSteps(block.steps.length, block.title, 1500);
  return (
    <figure className="rounded-xl border border-rim/60 bg-pit/50 p-4 space-y-3">
      <figcaption className="text-[14px] font-semibold text-bright">{block.title}</figcaption>
      <ol className="space-y-1.5 min-h-[7em]">
        {block.steps.slice(0, s.step + 1).map((line, i) => (
          <li key={i} className={`anim-in flex flex-wrap items-baseline gap-x-3 rounded px-2 py-1 ${i === s.step ? "bg-info/10" : ""}`}>
            <span className="font-mono text-[15px] text-bright">{i ? "= " : ""}{line.expr}</span>
            <span className="text-[13px] text-ghost">{line.law}</span>
          </li>
        ))}
      </ol>
      <Controls s={s} />
    </figure>
  );
}

export default function ChapterBlock({ block }: { block: AcademyBlock }) {
  switch (block.kind) {
    case "text":
      return <p className="text-[15px] leading-7 text-pale"><Rich text={block.text} /></p>;
    case "list": {
      const items = block.items.map((item, i) => <li key={i}><Rich text={item} /></li>);
      const cls = "text-[15px] leading-7 text-pale pl-5 space-y-1";
      return block.ordered ? <ol className={`${cls} list-decimal`}>{items}</ol> : <ul className={`${cls} list-disc`}>{items}</ul>;
    }
    case "table":
      return (
        <figure className="space-y-2">
          <div className="overflow-x-auto rounded-lg border border-rim/60">
            <table className="w-full text-[14px] text-left">
              <thead className="bg-surface/60 text-pale"><tr>{block.headers.map((h, i) => <th key={i} className="px-3 py-2 font-semibold whitespace-nowrap"><Rich text={h} /></th>)}</tr></thead>
              <tbody>
                {block.rows.map((row, r) => <tr key={r} className="border-t border-rim/30">{row.map((cell, i) => <td key={i} className="px-3 py-1.5 text-ghost whitespace-nowrap"><Rich text={cell} /></td>)}</tr>)}
              </tbody>
            </table>
          </div>
          {block.caption && <figcaption className="text-[13px] text-dim"><Rich text={block.caption} /></figcaption>}
        </figure>
      );
    case "formula":
      return (
        <div className="px-4 py-3 rounded-lg bg-surface/40 border border-rim/40 text-center">
          <div className="font-mono text-[15px] text-bright break-words">{block.text}</div>
          {block.note && <div className="mt-1 text-[13px] text-dim"><Rich text={block.note} /></div>}
        </div>
      );
    case "callout":
      return <Callout tone={block.tone} text={block.text} />;
    case "circuit":
      return (
        <figure className="space-y-2">
          <CircuitViewer circuit={block.circuit} slow={block.slow} />
          <figcaption className="text-[13px] text-ghost"><Rich text={block.caption} /></figcaption>
          {block.tryThis && (
            <ul className="text-[14px] leading-relaxed text-pale pl-5 list-disc space-y-0.5">
              {block.tryThis.map((t, i) => <li key={i}><Rich text={t} /></li>)}
            </ul>
          )}
        </figure>
      );
    case "kmap":
      return <KmapBlock block={block} />;
    case "timing":
      return (
        <figure className="space-y-2">
          {/* diagramSvg escapes every piece of text it writes */}
          <div className="overflow-x-auto rounded-xl border border-rim/60 bg-pit [&>svg]:h-auto [&>svg]:max-w-full [&>svg]:min-w-[420px]" dangerouslySetInnerHTML={{ __html: diagramSvg(block.diagram) }} />
          <figcaption className="text-[13px] text-ghost"><Rich text={block.caption} /></figcaption>
        </figure>
      );
    case "example":
      return (
        <details className="group rounded-lg border border-info/30 bg-info/5 p-4">
          <summary className="cursor-pointer text-[14px] font-semibold text-info">Worked example: <span className="text-bright font-normal"><Rich text={block.title} /></span></summary>
          <div className="mt-3 space-y-2 text-[15px] leading-7 text-pale">
            <p><Rich text={block.problem} /></p>
            <ol className="pl-5 list-decimal space-y-1">{block.steps.map((s, i) => <li key={i}><Rich text={s} /></li>)}</ol>
            <p className="pt-1"><span className="font-semibold text-phosphor mr-1">Answer:</span><Rich text={block.answer} /></p>
          </div>
        </details>
      );
    case "practice":
      return <Practice block={block} />;
    case "link":
      return (
        <Link href={block.href} className="block rounded-lg border border-phosphor/30 bg-phosphor/5 px-4 py-3 hover:border-phosphor/60 transition-colors">
          <span className="text-[14px] font-semibold text-phosphor">{block.label} →</span>
          <span className="block text-[13px] text-ghost mt-0.5"><Rich text={block.text} /></span>
        </Link>
      );
    case "widget":
      return <InteractiveWidget id={block.id} />;
    case "anim":
      return <Animation id={block.id} />;
    case "simplify":
      return <Simplify block={block} />;
    case "qm":
      return <div className="rounded-xl border border-rim/60 bg-pit/50 p-4"><QmWorking names={block.names} cells={block.cells} form="sop" /></div>;
    case "code":
      return (
        <figure className="space-y-2">
          <pre className="overflow-x-auto rounded-lg border border-rim/60 bg-pit p-3 font-mono text-[13px] leading-relaxed text-pale">{block.text}</pre>
          {block.caption && <figcaption className="text-[13px] text-ghost"><Rich text={block.caption} /></figcaption>}
        </figure>
      );
  }
}
