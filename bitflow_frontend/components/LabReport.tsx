"use client";
/**
 * components/LabReport.tsx — a printable lab report for the Sandbox and problem pages:
 * aim, the code with line numbers, the simulation result and output, the waveform as
 * the user arranged it (lib/waveform-svg.ts), the last synthesis of this design if the
 * Synth panel ran (lib/synth/client.ts), and notes. Shown as a paper preview; "Print /
 * Save as PDF" prints only the report (the @media print rules in app/globals.css).
 * Problem reports show the title, the statement and the verdict, never hidden tests.
 */

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/hooks/useAuth";
import { synthesisFor } from "@/lib/synth/client";
import type { SimulateResponse } from "@/lib/types";
import type { ParsedVcd } from "@/lib/vcd-parser";
import { waveformSvg } from "@/lib/waveform-svg";
import { getSavedView } from "./WaveformPanel";
import type { FpgaResult, SynthResult } from "./SynthesisPanel";

export interface LabReportProps {
  onClose: () => void;
  /** Problem pages pass the problem and their last graded submission; the Sandbox passes nothing. */
  problem?: { title: string; difficulty?: string; statement?: string; submission?: { accepted: boolean; passed: number; total: number } | null };
  files: { name: string; content: string }[];
  result: SimulateResponse | null;
  parsedVcd: ParsedVcd | null;
  /** The waveform panel's viewKey on this page, to draw the signals as arranged there. */
  viewKey?: string;
  /** The design text the page gives the Synth panel, to find its last results. */
  synthDesign?: string;
}

/** "Accepted: 5/5 tests passed" for a graded submission. */
const verdictText = (s: { accepted: boolean; passed: number; total: number } | null | undefined) =>
  s ? `${s.accepted ? "Accepted" : "Not accepted"}: ${s.passed}/${s.total} tests passed` : null;

const STDOUT_LINES = 80;
const STATUS: Record<string, string> = {
  success: "Compiled and simulated", compile_error: "Compile error", runtime_error: "Runtime error",
  timeout: "Timed out", file_missing: "File missing", internal_error: "Simulator error",
};
const UTIL_NAMES: Record<string, string> = { ICESTORM_LC: "Logic cells", SB_IO: "I/O pins", ICESTORM_RAM: "Block RAM", SB_GB: "Global buffers" };
const svgUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
/** Markdown → readable plain text for the statement excerpt. */
const plain = (md: string) => md.replace(/```[\s\S]*?```/g, "").replace(/^#{1,6}\s*/gm, "").replace(/[*_`]/g, "").replace(/\n{3,}/g, "\n\n").trim();
const topModule = (files: LabReportProps["files"]) => /\bmodule\s+(\w+)/.exec(files[0]?.content ?? "")?.[1];

/** Screen: an editable field. Print: its text (or nothing when empty). */
function Field({ value, onChange, placeholder, rows = 3 }: { value: string; onChange: (v: string) => void; placeholder: string; rows?: number }) {
  return (
    <>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={rows}
                className="print:hidden w-full rounded border border-[#d1d5db] bg-[#f9fafb] px-3 py-2 text-[13px] leading-relaxed text-[#111827] placeholder:text-[#9ca3af] focus:outline-none focus:border-[#2563eb]" />
      {value.trim() && <p className="hidden print:block whitespace-pre-wrap text-[12px] leading-relaxed">{value}</p>}
    </>
  );
}

function H2({ n, children }: { n: number; children: React.ReactNode }) {
  return <h2 className="mt-7 mb-2 text-[15px] font-semibold text-[#111827] border-b border-[#e5e7eb] pb-1 break-after-avoid">{n}. {children}</h2>;
}

export default function LabReport({ onClose, problem, files, result, parsedVcd, viewKey, synthDesign }: LabReportProps) {
  const { user } = useAuth();
  const [title, setTitle] = useState(() => problem?.title ?? `${topModule(files) ?? "Design"}: simulation report`);
  const [aim, setAim] = useState("");
  const [notes, setNotes] = useState("");
  const date = useMemo(() => new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }), []);

  useEffect(() => {
    document.body.classList.add("lab-report-open");
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => { document.body.classList.remove("lab-report-open"); window.removeEventListener("keydown", onKey); };
  }, [onClose]);

  const view = viewKey ? getSavedView(viewKey) : undefined;
  const wave = useMemo(() => (parsedVcd ? waveformSvg(parsedVcd, view, { width: 760, theme: "light" }) : null), [parsedVcd, view]);
  const markers = view?.markers;
  const synth = synthDesign ? synthesisFor(synthDesign) : null;
  const s = synth?.synth as SynthResult | undefined;
  const fpga = Object.entries((synth?.fpga ?? {}) as Record<string, FpgaResult>);
  const out = (result?.stdout ?? "").replace(/\s+$/, "").split("\n");
  const shownFiles = files.filter((f) => f.content.trim());
  const statement = problem?.statement ? plain(problem.statement) : "";
  const verdict = verdictText(problem?.submission);
  let n = 0;

  return createPortal(
    <div id="lab-report-root" className="fixed inset-0 z-[80] overflow-auto bg-[#d1d5db] print:bg-white" role="dialog" aria-modal="true" aria-label="Lab report">
      <div className="print:hidden sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 px-4 py-2 bg-[#111827] text-white font-mono text-[12px]">
        <span>Lab report preview. Edit the title, aim and notes, then print or save as PDF.</span>
        <span className="flex gap-2 shrink-0">
          <button onClick={() => window.print()} className="px-3 py-1 rounded bg-[#2563eb] hover:bg-[#1d4ed8] font-semibold">Print / Save as PDF</button>
          <button onClick={onClose} className="px-3 py-1 rounded border border-white/30 hover:bg-white/10">Close</button>
        </span>
      </div>

      <article className="mx-auto my-6 w-full max-w-[860px] bg-white text-[#111827] shadow-xl px-6 sm:px-10 py-9 print:shadow-none print:my-0 print:px-0 print:py-0 print:max-w-none font-sans">
        <header className="border-b-2 border-[#111827] pb-3">
          <div className="text-[10px] uppercase tracking-[0.2em] text-[#6b7280]">Lab report</div>
          <input value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Report title"
                 className="print:hidden w-full mt-1 text-[24px] font-semibold bg-transparent border-b border-dashed border-[#d1d5db] focus:outline-none focus:border-[#2563eb]" />
          <h1 className="hidden print:block mt-1 text-[24px] font-semibold">{title}</h1>
          <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-[12px] text-[#374151]">
            {user?.username && <span><b>Author:</b> {user.username}</span>}
            <span><b>Date:</b> {date}</span>
            <span><b>Tool:</b> BitFlow {problem ? "problem" : "Sandbox"} · Icarus Verilog</span>
            {problem?.difficulty && <span><b>Level:</b> {problem.difficulty}</span>}
          </div>
        </header>

        <H2 n={++n}>Aim</H2>
        <Field value={aim} onChange={setAim} placeholder="What does this design do, and what are you showing? (optional)" />

        {problem && (statement || verdict) && (
          <>
            <H2 n={++n}>Problem</H2>
            {statement && (
              <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-[#374151]">
                {statement.slice(0, 1500)}{statement.length > 1500 ? " …" : ""}
              </p>
            )}
            {verdict && <p className="mt-2 text-[13px] font-semibold">Result: {verdict}</p>}
          </>
        )}

        <H2 n={++n}>Source code</H2>
        {shownFiles.map((f) => (
          <figure key={f.name} className="mb-4">
            <figcaption className="font-mono text-[11px] font-semibold text-[#374151] mb-1">{f.name} ({f.content.replace(/\s+$/, "").split("\n").length} lines)</figcaption>
            <pre className="font-mono text-[10px] leading-[1.45] border border-[#e5e7eb] rounded bg-[#f9fafb] p-2 whitespace-pre-wrap break-all">
              {f.content.replace(/\s+$/, "").split("\n").map((line, i) => (
                <div key={i} className="flex"><span className="select-none w-8 shrink-0 pr-2 text-right text-[#9ca3af]">{i + 1}</span><span>{line || " "}</span></div>
              ))}
            </pre>
          </figure>
        ))}

        <H2 n={++n}>Simulation</H2>
        {result ? (
          <>
            <p className="text-[12px]">
              <b>Status:</b> {STATUS[result.status] ?? result.status} (exit code {result.exit_code}, {(result.duration_ms / 1000).toFixed(1)} s).
              {/ALL TESTS PASSED/.test(result.stdout) && <> The testbench reported <b>ALL TESTS PASSED</b>.</>}
              {/TESTS FAILED/.test(result.stdout) && <> The testbench reported <b>failures</b>.</>}
            </p>
            {out.join("").trim() && (
              <pre className="mt-2 font-mono text-[10px] leading-[1.4] border border-[#e5e7eb] rounded bg-[#f9fafb] p-2 whitespace-pre-wrap break-all">
                {out.slice(0, STDOUT_LINES).join("\n")}
                {out.length > STDOUT_LINES && `\n… ${out.length - STDOUT_LINES} more lines`}
              </pre>
            )}
          </>
        ) : (
          <p className="text-[12px] text-[#6b7280]">Not simulated yet: run the design before making the report to include its output and waveform.</p>
        )}

        {wave && wave.shown > 0 && parsedVcd && parsedVcd.maxTime > 0 && (
          <>
            <H2 n={++n}>Waveform</H2>
            <figure className="break-inside-avoid">
              <div className="w-full overflow-hidden [&>svg]:w-full [&>svg]:h-auto border border-[#e5e7eb]" dangerouslySetInnerHTML={{ __html: wave.svg }} />
              <figcaption className="mt-1 text-[11px] text-[#6b7280]">
                Figure 1. {wave.shown} of {wave.total} signals, time 0 to {parsedVcd.maxTime} ({parsedVcd.timescale || "simulation units"}).
                {markers && markers.a !== null && markers.b !== null && ` Markers A = ${markers.a}, B = ${markers.b}, Δ = ${Math.abs(markers.b - markers.a)}.`}
                {" "}Signals, order and number formats as arranged in the waveform viewer.
              </figcaption>
            </figure>
          </>
        )}

        {(s || fpga.length > 0) && (
          <>
            <H2 n={++n}>Synthesis</H2>
            {s && (
              <table className="text-[12px] mb-3">
                <tbody>
                  {([["Top module", s.top], ["Cells", s.numCells], ["Flip-flop bits", s.ffBits], ["Gates (2-input equivalent)", s.gates], ["Logic depth", s.depth]] as [string, unknown][])
                    .filter(([, v]) => v !== undefined && v !== null)
                    .map(([k, v]) => <tr key={k}><td className="pr-6 text-[#6b7280]">{k}</td><td className="font-mono">{String(v)}</td></tr>)}
                </tbody>
              </table>
            )}
            {s?.latches && s.latches.length > 0 && <p className="text-[12px] text-[#b45309] mb-2">Latches inferred: {s.latches.join(", ")}</p>}
            {s?.schematicSvg && (
              <figure className="break-inside-avoid mb-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={svgUrl(s.schematicSvg)} alt="Synthesized schematic" className="max-w-full max-h-[520px] border border-[#e5e7eb]" />
                <figcaption className="mt-1 text-[11px] text-[#6b7280]">Schematic after Yosys synthesis{s.top ? ` of ${s.top}` : ""}.</figcaption>
              </figure>
            )}
            {(s?.fsms ?? []).filter((f) => f.svg).map((f, i) => (
              <figure key={i} className="break-inside-avoid mb-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={svgUrl(f.svg!)} alt="Extracted state machine" className="max-w-full max-h-[420px] border border-[#e5e7eb]" />
                <figcaption className="mt-1 text-[11px] text-[#6b7280]">State machine extracted from the design ({f.states.length} states).</figcaption>
              </figure>
            ))}
            {fpga.map(([family, r]) => (
              <p key={family} className="text-[12px] mb-2">
                <b>{r.device ?? family}:</b>{" "}
                {r.resources && `${r.resources.luts} LUTs, ${r.resources.ffs} flip-flops, ${r.resources.bram} block RAMs, ${r.resources.dsp} DSPs, ${r.resources.io} I/O`}
                {r.pnr?.fmax?.length ? `; after place and route: ${r.pnr.fmax.map((f) => `${f.clock} ${f.mhz} MHz`).join(", ")}` : ""}
                {r.pnr?.utilization && `; ${Object.entries(r.pnr.utilization).map(([k, u]) => `${UTIL_NAMES[k] ?? k} ${u.used}/${u.available}`).join(", ")}`}
              </p>
            ))}
          </>
        )}

        <H2 n={++n}>Observations and conclusion</H2>
        <Field value={notes} onChange={setNotes} placeholder="What did the results show? What would you change? (optional)" rows={4} />

        <footer className="mt-8 pt-2 border-t border-[#e5e7eb] text-[10px] text-[#9ca3af]">
          Generated with BitFlow (bitflowvlsi.tech) on {date}.
        </footer>
      </article>
    </div>,
    document.body,
  );
}
