"use client";
/**
 * components/HoldButton.tsx — press and hold to confirm a destructive action (idea after a
 * "hold to delete" button seen on designeer.xyz). Pointer: hold for `ms`; letting go early cancels.
 * Keyboard: hold Space or Enter. The fill is slow and linear while you decide and snaps back on release.
 * It replaces a confirm() pop-up only; any server-side check (password, typed word) stays.
 */

import { useRef, useState } from "react";

interface Props {
  onConfirm: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  ms?: number;
  className?: string;
  /** Read by screen readers instead of the label, e.g. "Hold to delete your account". */
  label?: string;
}

export default function HoldButton({ onConfirm, children, disabled, ms = 1500, className = "", label }: Props) {
  const [holding, setHolding] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const start = () => {
    if (disabled || timer.current) return;
    setHolding(true);
    timer.current = setTimeout(() => { timer.current = undefined; setHolding(false); onConfirm(); }, ms);
  };
  const stop = () => { clearTimeout(timer.current); timer.current = undefined; setHolding(false); };
  const key = (e: React.KeyboardEvent, down: boolean) => {
    if (e.key !== " " && e.key !== "Enter") return;
    e.preventDefault();
    if (down) { if (!e.repeat) start(); } else stop();
  };

  return (
    <button type="button" disabled={disabled} aria-label={label}
            onPointerDown={start} onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop}
            onKeyDown={(e) => key(e, true)} onKeyUp={(e) => key(e, false)} onBlur={stop}
            onContextMenu={(e) => e.preventDefault()}
            className={`relative overflow-hidden select-none touch-none ${className}`}>
      <span aria-hidden className="absolute inset-0 origin-left bg-current opacity-20"
            style={{ transform: `scaleX(${holding ? 1 : 0})`, transition: holding ? `transform ${ms}ms linear` : "transform 200ms cubic-bezier(0.23, 1, 0.32, 1)" }} />
      <span className="relative">{children}</span>
    </button>
  );
}
