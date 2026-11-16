"use client";
/**
 * components/feedback/FeedbackDialog.tsx — the feedback form (lib/feedback.ts), used by the site-wide
 * Feedback button, the new-user survey and "Report an issue" on problems.
 *   kind "general" / "problem": a category and a message, in a centred dialog
 *   kind "survey": 1–5 stars and an optional comment, in a corner card (no backdrop; the page stays usable)
 */

import { useEffect, useRef, useState } from "react";
import { CATEGORIES, MAX_MESSAGE, sendFeedback } from "@/lib/feedback";

const field = "w-full bg-pit border border-rim/60 rounded-lg px-3 py-2 text-[13px] text-pale focus:border-phosphor/60 outline-none";
const primary = "px-4 py-2 rounded-lg bg-phosphor text-void text-[12px] font-bold hover:bg-phosphor-glow transition-colors disabled:opacity-50";

interface Props {
  kind: "general" | "problem" | "survey";
  target?: string;
  title: string;
  intro?: string;
  onClose: () => void;
  /** Survey only: "Not now" and "Don't ask again" buttons. */
  onLater?: () => void;
  onNever?: () => void;
  /** Called once the feedback is saved. */
  onSent?: () => void;
}

export default function FeedbackDialog({ kind, target, title, intro, onClose, onLater, onNever, onSent }: Props) {
  const survey = kind === "survey";
  const categories = survey ? [] : CATEGORIES[kind];
  const [category, setCategory] = useState(categories[0]?.value ?? "");
  const [rating, setRating] = useState(0);
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  const first = useRef<HTMLSelectElement | HTMLButtonElement | null>(null);

  useEffect(() => { first.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") (onLater ?? onClose)(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onLater]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (survey && !rating) { setError("Please choose a rating."); return; }
    setState("sending"); setError(null);
    const err = await sendFeedback({ kind, target, website, message, ...(survey ? { rating } : { category }) });
    if (err) { setError(err); setState("idle"); return; }
    setState("sent");
    onSent?.();
  };

  const body = state === "sent" ? (
    <div className="space-y-3" role="status">
      <p className="text-[13px] text-pale">Thank you. We read every message.</p>
      <button onClick={onClose} className={primary}>Close</button>
    </div>
  ) : (
    <form onSubmit={submit} className="space-y-3">
      {intro && <p className="text-[12px] text-ghost">{intro}</p>}
      {survey ? (
        <div role="radiogroup" aria-label="Your rating, 1 to 5" className="flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} of 5`}
                    ref={n === 1 ? (el) => { first.current = el; } : undefined}
                    onClick={() => setRating(n)}
                    className={`text-[24px] leading-none px-0.5 ${n <= rating ? "text-phosphor" : "text-rim hover:text-ghost"}`}>★</button>
          ))}
        </div>
      ) : (
        <label className="block space-y-1">
          <span className="text-[11px] text-ghost">What is it about?</span>
          <select ref={(el) => { first.current = el; }} value={category} onChange={(e) => setCategory(e.target.value)} className={field}>
            {categories.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </label>
      )}
      <label className="block space-y-1">
        <span className="text-[11px] text-ghost">{survey ? "What should we improve? (optional)" : "Tell us more"}</span>
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={survey ? 3 : 5} maxLength={MAX_MESSAGE}
                  required={!survey} className={field} />
      </label>
      {/* Honeypot: hidden from people, filled in by bots. */}
      <input name="website" value={website} onChange={(e) => setWebsite(e.target.value)} tabIndex={-1} autoComplete="off"
             aria-hidden="true" className="absolute -left-[9999px] w-px h-px opacity-0" />
      {error && <p role="alert" className="text-danger text-[12px]">{error}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={state === "sending"} className={primary}>{state === "sending" ? "Sending…" : "Send"}</button>
        {survey ? (
          <>
            {onLater && <button type="button" onClick={onLater} className="text-[11px] text-ghost hover:text-bright">Not now</button>}
            {onNever && <button type="button" onClick={onNever} className="text-[11px] text-dim hover:text-bright">Don&apos;t ask again</button>}
          </>
        ) : (
          <button type="button" onClick={onClose} className="text-[11px] text-ghost hover:text-bright">Cancel</button>
        )}
      </div>
      {!survey && <p className="text-[10px] text-dim">No email needed. We store your message, the page and, if you&apos;re signed in, your account. See the <a href="/privacy" className="underline hover:text-ghost">privacy notice</a>.</p>}
    </form>
  );

  if (survey) {
    return (
      <div role="dialog" aria-labelledby="fb-title"
           className="fixed bottom-4 inset-x-4 sm:right-auto sm:left-4 sm:max-w-sm z-[85] rounded-xl border border-rim bg-pit/95 backdrop-blur p-4 shadow-2xl space-y-2">
        <p id="fb-title" className="text-[14px] text-bright font-semibold">{title}</p>
        {body}
      </div>
    );
  }
  return (
    <div className="fixed inset-0 z-[95] bg-void/80 backdrop-blur-sm flex items-center justify-center px-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="fb-title" className="w-full max-w-md rounded-xl border border-rim bg-pit p-5 shadow-2xl space-y-3">
        <p id="fb-title" className="text-[15px] text-bright font-semibold">{title}</p>
        {body}
      </div>
    </div>
  );
}
