"use client";

import { useState, useRef, useEffect } from "react";
import type { ArenaProblem } from "@/lib/arena/types";
import { useArenaProblem } from "@/hooks/useArenaProblem";
import { ArenaProblemStatement } from "@/components/ArenaProblemStatement";
import SubmissionHistory from "@/components/SubmissionHistory";
import { ArenaToolbar } from "@/components/ArenaToolbar";
import ScrollUnlock from "@/components/ScrollUnlock";
import Editor from "@/components/Editor";
import AIAssistantPanel from "@/components/AIAssistantPanel";
import SynthesisPanel from "@/components/SynthesisPanel";
import Terminal from "@/components/Terminal";
import WaveformPanel, { FailingWaveformView } from "@/components/WaveformPanel";
import { WaveformPanelWrapper } from "./WaveformPanelWrapper";

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
            {hook.submission?.failingWaveform && <FailingWaveformView data={hook.submission.failingWaveform} />}
            <details className="group">
              <summary className="font-mono text-[11px] font-semibold text-pale cursor-pointer select-none">Your attempts</summary>
              <div className="mt-2">
                <SubmissionHistory
                  slug={problem.slug}
                  currentCode={hook.designCode}
                  onLoad={hook.setDesignCode}
                  refreshOn={[hook.runResult, hook.submission]}
                />
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
              </div>
              <div className="flex-1 overflow-hidden">
                <Editor
                  value={hook.designCode}
                  onChange={hook.setDesignCode}
                  language="verilog"
                />
              </div>
            </div>

            <div className="flex-1 overflow-hidden flex flex-col min-w-0">
            <div className="h-8 flex items-center justify-between px-3 bg-surface/60 border-b border-rim/40 shrink-0">
              <span className="font-mono text-[10px] text-ghost">tb.v</span>
              <span className="font-mono text-[8px] text-dim/50 border border-rim/30 px-1 py-0.5 rounded">
                Write Your Testbench
               </span>
               </div>
                 <div className="flex-1 overflow-hidden">
                  <Editor
                    value={hook.testbenchCode}
                    onChange={hook.setTestbenchCode}
                    language="verilog"
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
      />
    </div>
  );
}