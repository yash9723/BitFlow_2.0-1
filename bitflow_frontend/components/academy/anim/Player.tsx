"use client";
/**
 * components/academy/anim/Player.tsx — what the Academy's animations share: a titled card, and
 * step controls. Nothing moves until the reader presses something, and they can always step by
 * hand. Motion is CSS transitions on state changes; app/globals.css removes it for people who
 * ask for reduced motion, and the steps still work.
 */

import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";

export const ON = "#00e87a";
export const OFF = "#4a4d60";
export const BUS = "#5aa9e6";
export const WARN = "#ffb547";
export const BAD = "#ff6b6b";
export const LINE = "#6b6f85";
export const INK = "#c8cad6";
/** State changes on screen (explanatory motion, so a little slower than UI). */
export const FADE = "fill 240ms cubic-bezier(0.23, 1, 0.32, 1), stroke 240ms cubic-bezier(0.23, 1, 0.32, 1), opacity 240ms cubic-bezier(0.23, 1, 0.32, 1)";
export const MOVE = "transform 420ms cubic-bezier(0.77, 0, 0.175, 1)";
export const btn = "px-2.5 py-1 rounded border border-rim/60 text-[13px] text-ghost hover:text-bright hover:border-rim disabled:opacity-40 disabled:hover:text-ghost transition-colors";
export const chip = (on: boolean) => `px-2.5 py-1 rounded border text-[13px] transition-colors ${on ? "border-phosphor/60 bg-phosphor/10 text-phosphor" : "border-rim/60 text-ghost hover:text-bright"}`;

export function AnimCard({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <figure className="rounded-xl border border-phosphor/20 bg-pit overflow-hidden">
      <figcaption className="px-4 py-2.5 border-b border-rim/40 bg-phosphor/5">
        <div className="text-[14px] font-semibold text-bright">{title}</div>
        {hint && <div className="text-[13px] text-ghost mt-0.5">{hint}</div>}
      </figcaption>
      <div className="p-4 space-y-3">{children}</div>
    </figure>
  );
}

export interface Steps { step: number; count: number; playing: boolean; set: (n: number) => void; toggle: () => void }

/** Steps 0..count-1. Goes back to the start when `reset` changes. */
export function useSteps(count: number, reset: unknown, ms = 1200): Steps {
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const last = useRef(reset);
  useEffect(() => {
    if (last.current !== reset) { last.current = reset; setStep(0); setPlaying(false); }
  }, [reset]);
  useEffect(() => {
    if (!playing) return;
    if (step >= count - 1) { setPlaying(false); return; }
    const id = window.setTimeout(() => setStep((s) => s + 1), ms);
    return () => window.clearTimeout(id);
  }, [playing, step, count, ms]);
  const set = useCallback((n: number) => { setPlaying(false); setStep(Math.max(0, Math.min(count - 1, n))); }, [count]);
  const toggle = useCallback(() => {
    if (playing) { setPlaying(false); return; }
    if (step >= count - 1) setStep(0);
    setPlaying(true);
  }, [playing, step, count]);
  return { step: Math.min(step, count - 1), count, playing, set, toggle };
}

export function Controls({ s }: { s: Steps }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className={btn} onClick={s.toggle}>{s.playing ? "Pause" : s.step >= s.count - 1 ? "Replay" : "Play"}</button>
      <button type="button" className={btn} onClick={() => s.set(s.step - 1)} disabled={s.step === 0}>Back</button>
      <button type="button" className={btn} onClick={() => s.set(s.step + 1)} disabled={s.step >= s.count - 1}>Next</button>
      <span className="text-[12px] text-dim tabular-nums">Step {s.step + 1} of {s.count}</span>
    </div>
  );
}

/** The sentence that goes with the current step; screen readers hear it too. */
export function Caption({ children }: { children: ReactNode }) {
  return <p role="status" className="text-[14px] leading-relaxed text-pale min-h-[2.75em]">{children}</p>;
}
