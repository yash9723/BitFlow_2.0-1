"use client";
/**
 * components/signal/LogicToggle.tsx — a switch drawn as a logic level: the knob carries a 0 or 1 in the
 * pixel font and slides on a transform. A deliberate flip (this is for settings, not things toggled
 * all day) plays a scope pulse and HIGH / LOW. It is a real role="switch" button with keys and focus;
 * the effect only decorates the state, which changes at once.
 */
import { useEffect, useRef } from "react";
import { signal } from "@/lib/signalfx";

export default function LogicToggle({ on, onChange, label, disabled = false }:
  { on: boolean; onChange: () => void; label: string; disabled?: boolean }) {
  const ref = useRef<HTMLButtonElement>(null);
  // React when the state really changes after a click (onChange may save to a server and fail).
  const clicked = useRef(false);
  useEffect(() => { if (clicked.current) { clicked.current = false; signal.level(ref.current, on); } }, [on]);
  return (
    <button ref={ref} type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled}
            onClick={() => { clicked.current = true; onChange(); }}
            className={`relative w-12 h-6 rounded-full shrink-0 border transition-colors duration-200 disabled:opacity-50
                        focus-visible:outline focus-visible:outline-1 focus-visible:outline-phosphor
                        ${on ? "bg-phosphor/20 border-phosphor/70" : "bg-pit border-rim"}`}>
      <span aria-hidden
            className={`absolute top-[3px] left-[3px] w-[18px] h-[18px] rounded-full grid place-items-center font-pixel text-[15px] leading-none
                        transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]
                        ${on ? "translate-x-6 bg-phosphor text-void" : "translate-x-0 bg-rim text-ghost"}`}>
        {on ? "1" : "0"}
      </span>
    </button>
  );
}
