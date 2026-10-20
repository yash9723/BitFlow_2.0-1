"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { parseDiagnostics } from "@/lib/diagnostics";
import type { ArenaProblem } from "@/lib/arena/types";
import { useArenaProblem } from "@/hooks/useArenaProblem";
import { ArenaProblemStatement } from "@/components/ArenaProblemStatement";
import { ExplainFailureButton } from "@/components/ProblemStatement";
import SubmissionHistory from "@/components/SubmissionHistory";
import OptimizationBoard from "@/components/OptimizationBoard";
import Discussion from "@/components/Discussion";
import { ArenaToolbar } from "@/components/ArenaToolbar";
import ScrollUnlock from "@/components/ScrollUnlock";
import dynamic from "next/dynamic";
import Terminal from "@/components/Terminal";
import WaveformPanel, { CounterexampleView, FailingWaveformView } from "@/components/WaveformPanel";
import { WaveformPanelWrapper } from "./WaveformPanelWrapper";

// Monaco is browser-only; the panels start closed, so they load after the page.
const Editor = dynamic(() => import("@/components/Editor"), {
  ssr:     false,
  loading: () => <div className="w-full h-full bg-pit animate-pulse" />,
});
const SynthesisPanel   = dynamic(() => import("@/components/SynthesisPanel"), { ssr: false });
const AIAssistantPanel = dynamic(() => import("@/components/AIAssistantPanel"), { ssr: false });

function useWaveformSplitter(initial: number) {
  const [size, setSize] = useState(initial);
  const dragging = useRef(false);
  const startY = useRef(0);
  const startSize = useRef(initial);

  const onMouseDown = (e: React.MouseEvent) => {
    dragging.current = true;
    startY.current = e.clientY;
    startSize.current = size;
    e.preventDefault();
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const delta = e.clientY - startY.current;
      setSize(Math.max(80, Math.min(600, startSize.current - delta)));  // ← inverted
    };
    const onUp = () => { dragging.current = false; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  return { size, onMouseDown };
}

function useArenaSplitter(initial: number) {
  const [size, setSize] = useState(initial);
  const dragging = useRef(false);
  const startY = useRef(0);
  const startSize = useRef(initial);

  const onMouseDown = (e: React.MouseEvent) => {
    dragging.current = true;
    startY.current = e.clientY;
    startSize.current = size;
    e.preventDefault();
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const delta = e.clientY - startY.current;
      setSize(Math.max(80, Math.min(600, startSize.current - delta)));
    };
    const onUp = () => { dragging.current = false; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  return { size, onMouseDown };
}

function useHorizSplitter(initial: number) {
  const [width, setWidth] = useState(initial);
  const dragging = useRef(false);
  const startX = useRef(0);
  const startW = useRef(initial);

  const onMouseDown = (e: React.MouseEvent) => {
    dragging.current = true;
    startX.current = e.clientX;
    startW.current = width;
    e.preventDefault();
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const delta = e.clientX - startX.current;
      setWidth(Math.max(280, Math.min(600, startW.current + delta)));
    };
    const onUp = () => { dragging.current = false; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  return { width, onMouseDown };
}

interface Props {
  problem: ArenaProblem;
}

export function ArenaSolverClient({ problem }: Props) {
  const hook = useArenaProblem(problem);
  const diagnostics = useMemo(() => parseDiagnostics(hook.runResult?.stdout), [hook.runResult]);
  const [aiAsk, setAiAsk] = useState<{ id: number; prompt: string } | null>(null);
  const isTestbench = problem.problemType === "testbench";
  const isFormal    = problem.problemType === "formal";
  const writesTb    = isTestbench || isFormal;   // the DUT is given; the learner writes tb / properties
  const cocotb      = isTestbench && hook.testbenchLanguage === "python";
  const tbFile      = isFormal ? "harness.v" : cocotb ? "test_tb.py" : "tb.v";
  const horiz = useHorizSplitter(380);
  const termSpl = useArenaSplitter(200);
  const waveSpl = useWaveformSplitter(200);
  const [tutorOpen, setTutorOpen] = useState(false);
  const [synthOpen, setSynthOpen] = useState(false);

  const showWaveform =
    hook.runResult?.waveform?.available ||
    (hook.submission?.accepted === false &&
      hook.submission?.verdicts?.some((v) => v.passed));

  return (
    <div className="h-screen flex flex-col bg-void text-bright overflow-hidden">
      <ScrollUnlock />

      <ArenaToolbar
        title={problem.title}
        category={problem.category}
        hook={hook}
        onReset={hook.resetToStarter}
        onToggleTutor={() => setTutorOpen((v) => !v)}
        onSynthesize={() => setSynthOpen(true)}
      />

      <div className="flex flex-1 overflow-hidden">
        <div
          className="shrink-0 border-r border-rim/60 overflow-hidden flex flex-col"
          style={{ width: horiz.width }}
        >
          <ArenaProblemStatement problem={problem}>
            {writesTb && hook.submission && <BugHuntResult result={hook.submission} formal={isFormal} />}
            {hook.submission && !hook.submission.accepted && (
              <ExplainFailureButton onClick={() => { setTutorOpen(true); setAiAsk({ id: Date.now(), prompt: "My last submission failed. Help me understand why, without giving me the answer." }); }} />
            )}
            {hook.submission?.timing && <TimingResult {...hook.submission.timing} />}
            {hook.submission?.counterexample && <CounterexampleView data={hook.submission.counterexample} />}
            {hook.submission?.failingWaveform && <FailingWaveformView data={hook.submission.failingWaveform} />}
            <details className="group">
              <summary className="font-mono text-[11px] font-semibold text-pale cursor-pointer select-none">Your attempts</summary>
              <div className="mt-2">
                <SubmissionHistory
                  slug={problem.slug}
                  file={writesTb ? "testbench" : "design"}
                  currentCode={writesTb ? hook.testbenchCode : hook.designCode}
                  onLoad={writesTb ? hook.setTestbenchCode : hook.setDesignCode}
                  refreshOn={[hook.runResult, hook.submission]}
                />
              </div>
            </details>
            {!writesTb && (
              <details className="group">
                <summary className="font-mono text-[11px] font-semibold text-pale cursor-pointer select-none">
                  {problem.timing ? "Fastest-design leaderboard" : "Smallest-design leaderboard"}
                </summary>
                <div className="mt-2">
                  <OptimizationBoard slug={problem.slug} refreshKey={hook.submission} fastest={!!problem.timing} />
                </div>
              </details>
            )}
            <details className="group">
              <summary className="font-mono text-[11px] font-semibold text-pale cursor-pointer select-none">Editorial &amp; discussion</summary>
              <div className="mt-2">
                <Discussion slug={problem.slug} refreshKey={hook.submission} />
              </div>
            </details>
          </ArenaProblemStatement>
        </div>

        <div
          onMouseDown={horiz.onMouseDown}
          className="w-1.5 cursor-col-resize bg-rim/20 hover:bg-phosphor/30 transition-colors shrink-0"
        />

        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <div className="flex flex-1 overflow-hidden min-h-0">
            <div className="flex-1 border-r border-rim/40 overflow-hidden flex flex-col min-w-0">
              <div className="h-8 flex items-center px-3 bg-surface/60 border-b border-rim/40 shrink-0">
                <span className="font-mono text-[10px] text-ghost">design.v</span>
                {writesTb && <span className="ml-2 font-mono text-[8px] text-dim/70 border border-rim/30 px-1 py-0.5 rounded">DUT · read-only</span>}
              </div>
              <div className="flex-1 overflow-hidden">
                <Editor
                  value={writesTb ? problem.starterCode : hook.designCode}
                  onChange={hook.setDesignCode}
                  language="verilog"
                  diagnostics={diagnostics.design}
                  readOnly={writesTb}
                />
              </div>
            </div>

            <div className="flex-1 overflow-hidden flex flex-col min-w-0">
            <div className="h-8 flex items-center justify-between px-3 bg-surface/60 border-b border-rim/40 shrink-0">
              <span className="font-mono text-[10px] text-ghost">{tbFile}</span>
              {isTestbench ? (
                <div className="flex gap-1 font-mono text-[8px]" role="radiogroup" aria-label="Testbench language">
                  {([["verilog", "Verilog"], ["python", "cocotb (Python)"]] as const).map(([id, label]) => (
                    <button key={id} role="radio" aria-checked={hook.testbenchLanguage === id} onClick={() => hook.setTestbenchLanguage(id)}
                      className={`px-1.5 py-0.5 rounded border ${hook.testbenchLanguage === id ? "border-phosphor/50 text-phosphor bg-phosphor/10" : "border-rim/30 text-dim/70 hover:text-ghost"}`}>
                      {label}
                    </button>
                  ))}
                </div>
              ) : (
                <span className="font-mono text-[8px] text-dim/50 border border-rim/30 px-1 py-0.5 rounded">
                  {isFormal ? "Write properties that catch the bugs" : "Write Your Testbench"}
                </span>
              )}
               </div>
                 <div className="flex-1 overflow-hidden">
                  <Editor
                    value={hook.testbenchCode}
                    onChange={hook.setTestbenchCode}
                    language={cocotb ? "python" : "systemverilog"}
                    diagnostics={diagnostics.tb}
                    readOnly={false}  // ← Always editable in Arena
                  />
                </div>
               </div>
          </div>

          <div
            onMouseDown={termSpl.onMouseDown}
            className="h-1.5 cursor-row-resize bg-rim/20 hover:bg-phosphor/30 transition-colors shrink-0"
          />

          <div style={{ height: termSpl.size }} className="shrink-0 overflow-hidden border-t border-rim/40">
            <Terminal
              runState={
                 hook.runState === "running"
                 ? "running"
                 : hook.runState === "run_done"
                 ? "done"
                 : "idle"
                }
              result={hook.runResult}
              errorMsg={hook.errorMsg}
              onClear={() => {}}
           />
          </div>

          {hook.runResult?.waveform?.available && 
           hook.runResult?.waveform?.vcd_base64 && 
           typeof hook.runResult.waveform.vcd_base64 === 'string' && (
            <>
             <div
               onMouseDown={waveSpl.onMouseDown}
               className="h-1.5 cursor-row-resize bg-rim/20 hover:bg-phosphor/30 transition-colors shrink-0"
             />
             <div style={{ height: waveSpl.size }} className="shrink-0 overflow-hidden border-t border-rim/40">
               <WaveformPanelWrapper
                 vcdBase64={hook.runResult.waveform.vcd_base64} 
                 result={hook.runResult}
              />
            </div>
           </>
          )}
        </div>
      </div>

      <SynthesisPanel isOpen={synthOpen} onClose={() => setSynthOpen(false)} designCode={hook.designCode} />

      <AIAssistantPanel
        isOpen={tutorOpen}
        onClose={() => setTutorOpen(false)}
        designCode={hook.designCode}
        testbenchCode={hook.testbenchCode}
        result={hook.runResult}
        setDesignCode={hook.setDesignCode}
        setTestbenchCode={hook.setTestbenchCode}
        problemSlug={problem.slug}
        ask={aiAsk}
      />
    </div>
  );
}
/** Testbench problems: which of the hidden bugs the student's testbench caught. */
/** Timing problems: how fast the submitted design runs after place and route. */
function TimingResult({ fmaxMhz, targetMhz }: { fmaxMhz: number | null; targetMhz: number }) {
  const fast = fmaxMhz !== null && fmaxMhz >= targetMhz;
  return (
    <div className={`rounded border p-3 font-mono text-[11px] ${fast ? "border-phosphor/40 bg-phosphor/5 text-phosphor" : "border-warn/40 bg-warn/5 text-warn"}`}>
      {fmaxMhz === null ? "Clock speed couldn't be measured." : <>Max clock after place and route: <b>{fmaxMhz} MHz</b></>}
      <span className="text-dim"> (target {targetMhz} MHz on an iCE40-HX8K)</span>
    </div>
  );
}

function BugHuntResult({ result, formal = false }: { formal?: boolean; result: { accepted: boolean; passed: number; total: number; verdicts: { testcaseId: string; description: string; passed: boolean }[]; errorMessage?: string } }) {
  return (
    <div className={`rounded border p-3 space-y-2 ${result.accepted ? "border-phosphor/40 bg-phosphor/5" : "border-warn/40 bg-warn/5"}`}>
      <div className={`font-mono text-[12px] font-bold ${result.accepted ? "text-phosphor" : "text-warn"}`}>
        {result.accepted ? `✓ Caught all ${result.total} bugs` : result.verdicts.length ? `Caught ${result.passed} of ${result.total} bugs` : "Not graded"}
      </div>
      {result.errorMessage && !result.accepted && <p className="font-mono text-[10px] text-ghost">{result.errorMessage}</p>}
      {result.verdicts.length > 0 && (
        <ul className="space-y-0.5 font-mono text-[10px]">
          {result.verdicts.map((v) => (
            <li key={v.testcaseId} className={v.passed ? "text-phosphor" : "text-pale"}>
              {v.passed ? "✓" : "✗"} {v.description.replace(/^(Caught|Missed): /, "")}
            </li>
          ))}
        </ul>
      )}
      {!result.accepted && result.verdicts.some((v) => !v.passed) && (
        <p className="font-mono text-[9px] text-dim">
          {formal
            ? "Each ✗ is a one-line change to the DUT that still satisfies all your properties. Add an assertion that this change would break."
            : "Each ✗ is a one-line change to the DUT that your testbench doesn’t notice. Add checks that would give a different result if that line were wrong."}
        </p>
      )}
    </div>
  );
}
