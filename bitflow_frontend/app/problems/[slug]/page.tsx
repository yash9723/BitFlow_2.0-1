/**
 * app/problems/[slug]/page.tsx — Individual problem solving page
 *
 * ARCHITECTURE:
 *   This page COMPOSES existing systems:
 *     - Editor       → same component as Sandbox
 *     - Terminal     → same component as Sandbox
 *     - WaveformPanel→ same component as Sandbox
 *     - useSplitter  → same hook as Sandbox
 *     - useProgress  → progress hook (loads from database/API)
 *     - useProblem   → problem-mode state machine (run + submit)
 */

"use client";

import {
  useRef,
  useState,
  useEffect,
  useCallback,
}                             from "react";
import { notFound }           from "next/navigation";
import dynamic                from "next/dynamic";
import ProblemToolbar         from "../../../components/ProblemToolbar";
import ProblemStatement       from "../../../components/ProblemStatement";
import Terminal               from "../../../components/Terminal";
import WaveformPanel          from "../../../components/WaveformPanel";
import { useProblem }         from "../../../hooks/useProblem";
import { useProgress }        from "../../../hooks/useProgress";
import { useSplitter }        from "../../../hooks/useSplitter";
import { parseVcd }           from "@/lib/vcd-parser";
import { recordHintUnlock }   from "@/lib/progress-storage";
import type { ParsedVcd }     from "@/lib/vcd-parser";
import type { RunState }      from "@/lib/types";
import { useMemo }            from "react";
import { parseDiagnostics }   from "@/lib/diagnostics";

// Monaco — browser only
const Editor = dynamic(() => import("@/components/Editor"), {
  ssr:     false,
  loading: () => <div className="w-full h-full bg-pit animate-pulse" />,
});
// Panels start closed, so they load after the page instead of in its first bundle.
const SynthesisPanel = dynamic(() => import("../../../components/SynthesisPanel"), { ssr: false });
const LabReport      = dynamic(() => import("../../../components/LabReport"), { ssr: false });
const AIAssistantPanel = dynamic(() => import("../../../components/AIAssistantPanel"), { ssr: false });

const SPLITTER_H         = 6;
const DEFAULT_LEFT_FRAC  = 0.32;   // Statement panel: 32% width
const DEFAULT_EDIT_FRAC  = 0.70;   // IDE area: 70% height
const DEFAULT_WF_FRAC    = 0.60;   // Terminal: 60% of bottom section

// Inline splitter bar components
function VSplitter({ onMouseDown, isDragging }: { onMouseDown: (e: React.MouseEvent) => void; isDragging: boolean }) {
  return (
    <div
      onMouseDown={onMouseDown}
      className={`h-${SPLITTER_H}px w-full cursor-row-resize shrink-0 select-none transition-colors ${isDragging ? "bg-phosphor/30" : "bg-rim hover:bg-phosphor/20"}`}
      style={{ height: SPLITTER_H }}
    />
  );
}

function HSplitter({ onMouseDown, isDragging }: { onMouseDown: (e: React.MouseEvent) => void; isDragging: boolean }) {
  return (
    <div
      onMouseDown={onMouseDown}
      className={`w-${SPLITTER_H}px h-full cursor-col-resize shrink-0 select-none transition-colors ${isDragging ? "bg-phosphor/30" : "bg-rim hover:bg-phosphor/20"}`}
      style={{ width: SPLITTER_H }}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Inner Problem Solver
// ─────────────────────────────────────────────────────────────────────────────
function ProblemSolverInner({ problem }: { problem: any }) {
  const {
    designCode,
    testbenchCode,
    setDesignCode,
    setTestbenchCode,
    language,
    vhdlAvailable,
    setLanguage,
    runState,
    isRunning,
    isSubmitting,
    runResult,
    submission,
    errorMsg,
    submittingIndex,
    submittingTotal,
    run,
    submit,
  } = useProblem(problem);
  const diagnostics = useMemo(() => parseDiagnostics(runResult?.stdout), [runResult]);
  const [aiAsk, setAiAsk] = useState<{ id: number; prompt: string } | null>(null);

  const {
    progress,
    recordSolve,
    recordAttempt,
  } = useProgress();

  const [tutorOpen, setTutorOpen] = useState(false);
  const [synthOpen, setSynthOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  // ── VCD parsing ────────────────────────────────────────────────────────────
  const [parsedVcd, setParsedVcd] = useState<ParsedVcd | null>(null);

  useEffect(() => {
    const b64 = runResult?.waveform.vcd_base64;
    if (!b64) { setParsedVcd(null); return; }
    try { setParsedVcd(parseVcd(atob(b64))); }
    catch { setParsedVcd(null); }
  }, [runResult?.waveform.vcd_base64]);

  // ── Record submission result → progress ────────────────────────────────────
  useEffect(() => {
    if (!submission) return;
    if (submission.accepted) {
      recordSolve(submission, problem.moduleId);
    } else {
      recordAttempt(problem.id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submission]);

  // ── Keyboard shortcut: Ctrl+Enter → run ───────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && !isRunning && !isSubmitting) {
        e.preventDefault();
        run();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isRunning, isSubmitting, run]);

  // ── Layout geometry ────────────────────────────────────────────────────────
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef    = useRef<HTMLDivElement>(null);
  const [containerH, setContainerH] = useState(0);
  const [bottomH,    setBottomH]    = useState(0);
  const [leftFrac,   setLeftFrac]   = useState(DEFAULT_LEFT_FRAC);
  const [editFrac,   setEditFrac]   = useState(DEFAULT_EDIT_FRAC);
  const [wfFrac,     setWfFrac]     = useState(DEFAULT_WF_FRAC);
  const [designFrac, setDesignFrac] = useState(0.55);  // design.v : 55%, tb.v : 45%

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((e) => setContainerH(e[0].contentRect.height));
    ro.observe(el); return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const el = bottomRef.current;
    if (!el) return;
    const ro = new ResizeObserver((e) => setBottomH(e[0].contentRect.height));
    ro.observe(el); return () => ro.disconnect();
  }, []);

  const handleEditDelta  = useCallback((_dx: number, dy: number) => {
    const h = containerRef.current?.clientHeight ?? 0;
    if (!h) return;
    setEditFrac((f) => Math.max(0.2, Math.min(0.88, f + dy / (h - SPLITTER_H))));
  }, []);
  
  const handleWfDelta    = useCallback((_dx: number, dy: number) => {
    const h = bottomRef.current?.clientHeight ?? 0;
    if (!h) return;
    setWfFrac((f) => Math.max(0.15, Math.min(0.88, f + dy / (h - SPLITTER_H))));
  }, []);

  const editorRowRef = useRef<HTMLDivElement>(null);

  // Horizontal splitter: statement vs IDE
  const stmtSplitter = useSplitter({ axis: "x", onDelta: useCallback((dx: number) => {
    const w = containerRef.current?.clientWidth ?? 0;
    if (!w) return;
    setLeftFrac((f) => Math.max(0.15, Math.min(0.55, f + dx / w)));
  }, []) });
  const editSplitter   = useSplitter({ axis: "y", onDelta: handleEditDelta });
  const wfSplitter     = useSplitter({ axis: "y", onDelta: handleWfDelta });
  const designSplitter = useSplitter({ axis: "x", onDelta: useCallback((dx: number) => {
    const w = editorRowRef.current?.clientWidth ?? containerRef.current?.clientWidth ?? 0;
    if (!w) return;
    setDesignFrac((f) => Math.max(0.2, Math.min(0.8, f + dx / w)));
  }, []) });

  const isDragging = stmtSplitter.isDragging || editSplitter.isDragging || wfSplitter.isDragging || designSplitter.isDragging;

  const editorH  = containerH > 0 ? Math.floor((containerH - SPLITTER_H) * editFrac) : "70%";
  const termH    = bottomH    > 0 ? Math.floor((bottomH    - SPLITTER_H) * wfFrac)   : "60%";
  const waveH    = bottomH    > 0 ? Math.floor((bottomH    - SPLITTER_H) * (1 - wfFrac)) : "40%";

  // ── Hint unlock ────────────────────────────────────────────────────────────
  const handleUnlockHint = useCallback(async (tier: 1 | 2 | 3) => {
    // Send to progress DB sync
    try {
      const res = await fetch("/api/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionType: "hint",
          problemId: problem.id,
          hintTier: tier,
        }),
      });
      const data = await res.json();
      console.log("[BitFlow] Hint sync complete", data);
    } catch (err) {
      console.error("[BitFlow] Failed to sync hint unlock:", err);
    }
  }, [problem.id]);

  // Map ProblemRunState to RunState for Terminal
  const terminalRunState: RunState = (() => {
    if (runState === "running")                       return "running";
    if (runState === "run_done" || runState === "submitted") return "done";
    if (runState === "error")                         return "error";
    return "idle";
  })();

  return (
    <div
      className={`flex flex-col h-screen overflow-hidden bg-void ${isDragging ? "select-none cursor-row-resize" : ""}`}
    >
      {/* Drag overlay — blocks Monaco iframe from stealing mouse events */}
      {isDragging && (
        <div
          className="fixed inset-0 z-50"
          style={{
            cursor: (stmtSplitter.isDragging || designSplitter.isDragging)
              ? "col-resize"
              : "row-resize",
          }}
        />
      )}

      {/* ── Problem Toolbar ──────────────────────────────────────────── */}
      <ProblemToolbar
        title={problem.title}
        difficulty={problem.difficulty}
        xp={progress.totalXp}
        runState={runState}
        submittingIndex={submittingIndex}
        submittingTotal={submittingTotal}
        onRun={run}
        onSubmit={submit}
        onToggleTutor={() => setTutorOpen((v) => !v)}
        onSynthesize={() => setSynthOpen(true)}
        onReport={() => setReportOpen(true)}
      />

      {/* ── Main content ─────────────────────────────────────────────── */}
      <div ref={containerRef} className="flex flex-1 min-h-0 overflow-hidden">

        {/* Statement panel */}
        <div
          className="shrink-0 overflow-hidden border-r border-rim"
          style={{ width: `${leftFrac * 100}%` }}
        >
          <ProblemStatement
            onExplainFailure={() => { setTutorOpen(true); setAiAsk({ id: Date.now(), prompt: "My last submission failed. Help me understand why, without giving me the answer." }); }}
            onReviewDesign={(prompt) => { setTutorOpen(true); setAiAsk({ id: Date.now(), prompt }); }}
            problem={problem}
            progress={progress}
            submission={submission}
            onUnlockHint={handleUnlockHint}
            history={{ slug: problem.slug, currentCode: designCode, onLoad: setDesignCode, refreshOn: [runResult, submission] }}
          />
        </div>

        {/* Horizontal splitter */}
        <HSplitter
          onMouseDown={stmtSplitter.handleMouseDown}
          isDragging={stmtSplitter.isDragging}
        />

        {/* IDE area */}
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">

          {/* Editor section */}
          <div
            ref={editorRowRef}
            className="flex flex-row overflow-hidden shrink-0"
            style={{ height: editorH }}
          >
            {/* design.v */}
            <div
              className="flex flex-col min-w-0 overflow-hidden"
              style={{ flex: `0 0 ${designFrac * 100}%` }}
            >
              <div className="flex items-center justify-between px-4 h-9 shrink-0 bg-surface border-b border-rim">
                <span className="font-mono text-[11px] text-pale">{language === "vhdl" ? "design.vhd" : "design.v"}</span>
                {vhdlAvailable ? (
                  <div className="flex gap-1 font-mono text-[9px]" role="radiogroup" aria-label="Design language">
                    {([["verilog", "Verilog / SV"], ["vhdl", "VHDL"]] as const).map(([id, label]) => (
                      <button key={id} role="radio" aria-checked={language === id} disabled={isRunning || isSubmitting}
                        onClick={() => setLanguage(id)}
                        title={id === "vhdl" ? "Write this design in VHDL: it is converted to Verilog (GHDL) and graded by the same tests" : undefined}
                        className={`px-2 py-0.5 rounded border ${language === id ? "border-phosphor/50 text-phosphor bg-phosphor/10" : "border-rim text-dim hover:text-ghost"}`}>
                        {label}
                      </button>
                    ))}
                  </div>
                ) : (
                  <span className="font-mono text-[9px] text-dim">DUT</span>
                )}
              </div>
              <div className="flex-1 min-h-0">
                <Editor
                  value={designCode}
                  onChange={setDesignCode}
                  language={language === "vhdl" ? "vhdl" : "systemverilog"}
                  readOnly={isRunning || isSubmitting}
                  diagnostics={diagnostics.design}
                />
              </div>
            </div>

            {/* Horizontal splitter between design.v and tb.v */}
            <HSplitter
              onMouseDown={designSplitter.handleMouseDown}
              isDragging={designSplitter.isDragging}
            />

            {/* tb.v */}
            <div
              className="flex flex-col min-w-0 overflow-hidden"
              style={{ flex: `0 0 ${(1 - designFrac) * 100}%` }}
            >
              <div className="flex items-center justify-between px-4 h-9 shrink-0 bg-surface border-b border-rim">
                <span className="font-mono text-[11px] text-pale">tb.v</span>
                <span className="font-mono text-[9px] text-dim">Testbench (public)</span>
              </div>
              <div className="flex-1 min-h-0">
                <Editor
                  value={testbenchCode}
                  onChange={setTestbenchCode}
                  language="verilog"
                  readOnly={isRunning || isSubmitting}
                  diagnostics={diagnostics.tb}
                />
              </div>
            </div>
          </div>

          {/* Vertical splitter (editor/bottom) */}
          <VSplitter
            onMouseDown={editSplitter.handleMouseDown}
            isDragging={editSplitter.isDragging}
          />

          {/* Bottom panels */}
          <div ref={bottomRef} className="flex flex-col flex-1 min-h-0 overflow-hidden">

            {/* Terminal */}
            <div className="shrink-0 overflow-hidden" style={{ height: parsedVcd && runResult ? termH : "100%" }}>
              <Terminal
                runState={terminalRunState}
                result={runResult}
                errorMsg={errorMsg}
                onClear={() => {}}
              />
            </div>

            {/* Waveform */}
            {parsedVcd && runResult && (
              <>
                <VSplitter
                  onMouseDown={wfSplitter.handleMouseDown}
                  isDragging={wfSplitter.isDragging}
                />
                <div className="shrink-0 overflow-hidden" style={{ height: waveH }}>
                  <WaveformPanel parsedVcd={parsedVcd} result={runResult} viewKey={`/problems/${problem.slug}`} />
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <SynthesisPanel isOpen={synthOpen} onClose={() => setSynthOpen(false)} designCode={designCode} language={language} />
      {reportOpen && (
        <LabReport onClose={() => setReportOpen(false)} result={runResult} parsedVcd={parsedVcd} viewKey={`/problems/${problem.slug}`} synthDesign={designCode}
                   problem={{ title: problem.title, difficulty: problem.difficulty, statement: problem.statement, submission }}
                   files={[{ name: language === "vhdl" ? "design.vhd" : "design.v", content: designCode }, { name: "tb.v", content: testbenchCode }]} />
      )}

      <AIAssistantPanel
        isOpen={tutorOpen}
        onClose={() => setTutorOpen(false)}
        designCode={designCode}
        testbenchCode={testbenchCode}
        result={runResult}
        setDesignCode={setDesignCode}
        setTestbenchCode={setTestbenchCode}
        problemSlug={problem.slug}
        ask={aiAsk}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page Wrapper (Dynamic Loader)
// ─────────────────────────────────────────────────────────────────────────────
export default function ProblemPage({
  params,
}: {
  params: { slug: string };
}) {
  const { slug }  = params;
  const [problem, setProblem] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/problems/${slug}`)
      .then((res) => {
        if (!res.ok) throw new Error("Problem not found");
        return res.json();
      })
      .then((data) => {
        setProblem(data.problem);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen bg-void flex flex-col items-center justify-center text-center">
        <div className="w-8 h-8 rounded border-2 border-t-phosphor border-rim animate-spin mb-4" />
        <p className="font-mono text-[11px] text-dim">Loading challenge details...</p>
      </div>
    );
  }

  if (!problem) {
    notFound();
  }

  return <ProblemSolverInner problem={problem} />;
}
