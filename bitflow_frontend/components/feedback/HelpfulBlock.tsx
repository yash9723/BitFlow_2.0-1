"use client";
/**
 * components/feedback/HelpfulBlock.tsx — "Was this helpful?" at the end of an article or Academy chapter.
 * A thumbs-down asks what was missing (optional). The vote is remembered in this browser per page, and
 * sent as kind "helpful" (lib/feedback.ts); the admin console's Feedback tab totals the votes per page.
 */

import { useEffect, useState } from "react";
import { sendFeedback } from "@/lib/feedback";

const field = "w-full bg-pit border border-rim/60 rounded-lg px-3 py-2 text-[13px] text-pale focus:border-phosphor/60 outline-none";

export default function HelpfulBlock({ target, what = "page" }: { target: string; what?: string }) {
  const key = `bf_helpful_${target}`;
  const [vote, setVote] = useState<"up" | "down" | null>(null);
  const [comment, setComment] = useState("");
  const [stage, setStage] = useState<"ask" | "comment" | "done">("ask");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try { const v = localStorage.getItem(key); if (v === "up" || v === "down") { setVote(v); setStage("done"); } } catch { /* ignore */ }
  }, [key]);

  const send = async (helpful: boolean, message?: string) => {
    const err = await sendFeedback({ kind: "helpful", target, helpful, message });
    if (err) { setError(err); return false; }
    try { localStorage.setItem(key, helpful ? "up" : "down"); } catch { /* ignore */ }
    return true;
  };
  const up = async () => { setVote("up"); if (await send(true)) setStage("done"); };
  const down = () => { setVote("down"); setStage("comment"); };
  const submitDown = async (e: React.FormEvent) => { e.preventDefault(); if (await send(false, comment)) setStage("done"); };

  return (
    <section aria-label="Was this helpful?" className="rounded-xl border border-rim/60 bg-surface/40 p-4 space-y-3 print:hidden">
      {stage === "done" ? (
        <p role="status" className="text-[13px] text-pale">
          {vote === "up" ? "Thanks! Glad it helped." : "Thanks for telling us. We'll use it to improve this " + what + "."}
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[13px] text-pale">Was this {what} helpful?</span>
          <button onClick={up} aria-pressed={vote === "up"}
                  className={`rounded-lg border px-3 py-1.5 text-[13px] ${vote === "up" ? "border-phosphor text-phosphor" : "border-rim text-ghost hover:text-bright"}`}>👍 Yes</button>
          <button onClick={down} aria-pressed={vote === "down"}
                  className={`rounded-lg border px-3 py-1.5 text-[13px] ${vote === "down" ? "border-danger text-danger" : "border-rim text-ghost hover:text-bright"}`}>👎 No</button>
        </div>
      )}
      {stage === "comment" && (
        <form onSubmit={submitDown} className="space-y-2">
          <label className="block space-y-1">
            <span className="text-[11px] text-ghost">What was missing or unclear? (optional)</span>
            <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} maxLength={2000} className={field} />
          </label>
          <button type="submit" className="px-4 py-2 rounded-lg bg-phosphor text-void text-[12px] font-bold hover:bg-phosphor-glow">Send</button>
        </form>
      )}
      {error && <p role="alert" className="text-danger text-[12px]">{error}</p>}
    </section>
  );
}
