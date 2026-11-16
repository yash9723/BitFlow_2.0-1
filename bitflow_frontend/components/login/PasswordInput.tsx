"use client";

import React, { useState } from "react";

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "onFocus" | "onBlur"> & {
  id: string;
  onFocus?: () => void;
  onBlur?: () => void;
  label: string;
  hint?: string;
  admin?: boolean;
  /** Fires when the eye toggle shows or hides the value (Bitzy peeks). */
  onShownChange?: (shown: boolean) => void;
  /** Fires on every key with whether Caps Lock is on. */
  onCapsLock?: (on: boolean) => void;
};

/** Password field with a keyboard-reachable show/hide toggle. */
export default function PasswordInput({ id, label, hint, admin, onShownChange, onCapsLock, onFocus, onBlur, className, ...input }: Props) {
  const [shown, setShown] = useState(false);
  const caps = (e: React.KeyboardEvent<HTMLInputElement>) => onCapsLock?.(e.getModifierState("CapsLock"));

  return (
    <div>
      <label htmlFor={id} className={`block font-mono text-caption mb-1.5 ${admin ? "text-info" : "text-pale"}`}>{label}</label>
      {/* Focus counts for the input and its eye toggle together, so moving between them isn't a blur. */}
      <div
        className="relative"
        onFocus={() => onFocus?.()}
        onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onBlur?.(); }}
      >
        <input
          {...input}
          id={id}
          type={shown ? "text" : "password"}
          onKeyDown={caps}
          onKeyUp={caps}
          className={`bf-input w-full h-11 rounded-lg px-3.5 pr-11 font-mono text-body focus:outline-none focus:ring-2 transition-[border-color,box-shadow] ${
            admin
              ? "bg-void/60 border border-info/40 text-info placeholder-info/25 focus:border-info focus:ring-info/25"
              : "bg-void/60 border border-rim text-bright placeholder-dim/50 focus:border-phosphor focus:ring-phosphor/25"
          } ${className ?? ""}`}
        />
        <button
          type="button"
          onClick={() => { setShown(!shown); onShownChange?.(!shown); }}
          aria-pressed={shown}
          aria-label={shown ? "Hide password" : "Show password"}
          className={`absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 rounded-md transition-colors focus-visible:outline focus-visible:outline-1 ${
            admin ? "text-info/70 hover:text-info focus-visible:outline-info" : "text-ghost hover:text-phosphor focus-visible:outline-phosphor"
          }`}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {shown ? (
              <path d="M3 3l18 18M10.58 10.58a2 2 0 002.83 2.83M9.88 5.09A9.77 9.77 0 0112 5c5.05 0 8.7 3.55 10 7-.42 1.13-1.05 2.19-1.86 3.12M6.53 6.53C4.5 7.86 2.94 9.77 2 12c1.3 3.45 4.95 7 10 7 1.4 0 2.7-.27 3.86-.75" />
            ) : (
              <>
                <path d="M2 12c1.3-3.45 4.95-7 10-7s8.7 3.55 10 7c-1.3 3.45-4.95 7-10 7s-8.7-3.55-10-7z" />
                <circle cx="12" cy="12" r="3" />
              </>
            )}
          </svg>
        </button>
      </div>
      {hint && <span className="block font-mono text-caption text-dim/70 mt-1">{hint}</span>}
    </div>
  );
}
