"use client";
/**
 * components/SubmissionReceipt.tsx — the judge's verdict as a thermal-printer receipt
 * (idea after a "tactile UI" printer seen on designeer.xyz; our own drawing).
 * Real text, not an image: the verdict, tests, time and XP, then one line per hidden test.
 * A new submission feeds a new receipt out of the slot (stepped, like a print head);
 * reduced motion shows it in place. TEAR copies the receipt as plain text.
 */

import { memo, useState } from "react";
import type { SubmissionResult } from "@/lib/problem-types";

const RULE = "-".repeat(30);
const pad = (k: string, v: string) => `${k.padEnd(10)}${v}`;
const verdictOf = (r: SubmissionResult) => (r.accepted ? "ACCEPTED" : r.errorMessage ? "ERROR" : "WRONG ANSWER");

/** The receipt as plain text, for TEAR (copy). */
export function receiptText(r: SubmissionResult, title: string): string {
  const when = new Date(r.timestamp).toISOString().slice(0, 16).replace("T", " ");
  return [
    "BITFLOW JUDGE", RULE,
    pad("PROBLEM", title),
    pad("VERDICT", verdictOf(r)),
    pad("TESTS", `${r.passed}/${r.total}`),
    pad("TIME", `${Math.round(r.totalDurationMs)} ms`),
    ...(r.xpEarned > 0 ? [pad("XP", `+${r.xpEarned}`)] : []),
    RULE,
    ...r.verdicts.map((v, i) => `${v.passed ? "PASS" : "FAIL"} #${i + 1} ${v.description}`),
    RULE, `${when} UTC`, "bitflowvlsi.com",
  ].join("\n");
}

const key = "sig-press rounded border border-rim bg-surface px-2 py-0.5 text-[11px] text-ghost hover:text-bright";

const SubmissionReceipt = memo(function SubmissionReceipt({ result, title }: { result: SubmissionResult; title: string }) {
  const [details, setDetails] = useState(!result.accepted);
  const [torn, setTorn] = useState(false);
  const fail = "text-[#b3261e]";

  const tear = async () => {
    try { await navigator.clipboard.writeText(receiptText(result, title)); setTorn(true); setTimeout(() => setTorn(false), 1600); } catch { /* clipboard blocked */ }
  };

  return (
    <div className="font-term">
      {/* The printer head: LED, model, FEED (test lines) and TEAR (copy). */}
      <div className="relative z-10 flex items-center justify-between gap-2 rounded-lg border border-rim bg-gradient-to-b from-[#262832] to-[#17181f] px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
        <div className="flex items-center gap-2">
          <span aria-hidden className={`w-2 h-2 rounded-full ${result.accepted ? "bg-phosphor shadow-[0_0_6px_#00e87a]" : "bg-danger shadow-[0_0_6px_#ff4f4f]"}`} />
          <span className="text-[11px] text-pale tracking-wider">BF-1 JUDGE</span>
        </div>
        <div className="flex items-center gap-1.5">
          {result.verdicts.length > 0 && (
            <button onClick={() => setDetails((d) => !d)} aria-expanded={details} className={key}>{details ? "FOLD" : "FEED"}</button>
          )}
          <button onClick={tear} className={key} aria-label="Copy the receipt">{torn ? "COPIED" : "TEAR"}</button>
        </div>
      </div>
      {/* The slot, then the paper fed out of it. */}
      <div className="mx-3 -mt-1 h-1.5 rounded-b bg-black/80" aria-hidden />
      <div className="mx-4 overflow-hidden">
        <div key={result.id} role="status" aria-live="polite" className="receipt-paper receipt-feed bg-[#e9eee6] text-[#0b0f0c] px-3 pt-3 pb-5 text-[11px] leading-[1.55]">
          <div className="text-center tracking-widest">BITFLOW JUDGE</div>
          <hr className="my-1.5 border-0 border-t border-dashed border-[#0b0f0c]/40" />
          <Row k="PROBLEM" v={title} />
          <Row k="VERDICT" v={<span className={result.accepted ? "" : fail}>{verdictOf(result)}</span>} />
          <Row k="TESTS" v={`${result.passed}/${result.total}`} />
          <Row k="TIME" v={`${Math.round(result.totalDurationMs)} ms`} />
          {result.xpEarned > 0 && <Row k="XP" v={`+${result.xpEarned}`} />}
          {details && result.verdicts.length > 0 && (
            <>
              <hr className="my-1.5 border-0 border-t border-dashed border-[#0b0f0c]/40" />
              {result.verdicts.map((v, i) => (
                <div key={v.testcaseId} className="flex gap-2">
                  <span className={v.passed ? "" : fail}>{v.passed ? "PASS" : "FAIL"}</span>
                  <span className="flex-1 min-w-0 truncate" title={v.description}>#{i + 1} {v.description}</span>
                  <span className="opacity-60">{Math.round(v.durationMs)}ms</span>
                </div>
              ))}
              {result.verdicts.find((v) => !v.passed && v.error) && (
                <div className={`mt-1 break-all ${fail}`}>{result.verdicts.find((v) => !v.passed && v.error)!.error}</div>
              )}
            </>
          )}
          <hr className="my-1.5 border-0 border-t border-dashed border-[#0b0f0c]/40" />
          <div className="flex justify-between opacity-60">
            <span>{new Date(result.timestamp).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}</span>
            <span>#{result.id.slice(-6)}</span>
          </div>
        </div>
      </div>
    </div>
  );
});

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <span className="w-[72px] shrink-0 opacity-60">{k}</span>
      <span className="flex-1 min-w-0 truncate">{v}</span>
    </div>
  );
}

export default SubmissionReceipt;
