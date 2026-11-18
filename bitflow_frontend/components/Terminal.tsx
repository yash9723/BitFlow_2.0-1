/**
 * components/Terminal.tsx — Simulation output panel
 *
 * Renders the bottom panel of the IDE. Shows:
 *   • Idle state:  a helpful prompt line with a blinking cursor
 *   • Running:     animated "waiting" message
 *   • Network err: red error message explaining what went wrong
 *   • Done:        stdout lines + stderr lines + waveform download button
 *
 * Line rendering rules:
 *   • stdout lines are coloured white/grey (like a real terminal).
 *   • stderr lines are coloured red.
 *   • Lines starting with "PASS" get a green tint.
 *   • Lines starting with "FAIL" get a red tint.
 *   • Lines starting with "===" get dimmed (decorative separators).
 *   • The [OK] / [ERROR] / [WARN] prefixes from entrypoint.sh are coloured.
 */

"use client";

import { useEffect, useRef } from "react";
import StatusBadge from "./StatusBadge";
import { downloadVcd } from "@/lib/api";
import type { RunState, SimulateResponse } from "@/lib/types";

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

interface TerminalProps {
  runState: RunState;
  result:   SimulateResponse | null;
  errorMsg: string | null;
  onClear:  () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Line colouring
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Return a Tailwind text-colour class for a given stdout line.
 * This is pure visual decoration — no semantic meaning beyond readability.
 */
function getLineClass(line: string): string {
  if (line.startsWith("PASS"))            return "text-phosphor";
  if (line.startsWith("FAIL"))            return "text-danger";
  if (line.startsWith("ALL TESTS PASSED"))return "text-phosphor font-semibold";
  if (line.startsWith("TESTS FAILED"))   return "text-danger font-semibold";
  if (line.startsWith("[OK]"))            return "text-phosphor/80";
  if (line.startsWith("[ERROR]"))         return "text-danger";
  if (line.startsWith("[WARN]"))          return "text-warn";
  if (line.startsWith("==="))             return "text-dim";
  if (line.startsWith("---"))             return "text-muted";
  if (line.startsWith("t="))             return "text-ghost";   // $monitor lines
  return "text-pale";
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

/** Idle prompt line with blinking cursor */
function IdlePrompt() {
  return (
    <div className="flex items-center gap-2 text-dim font-mono text-[12px]">
      <span className="text-phosphor/50">$</span>
      <span>ready — press Run to start simulation</span>
      <span className="inline-block w-[7px] h-[13px] bg-dim/60 animate-blink" />
    </div>
  );
}

/** Animated waiting state */
function RunningPrompt() {
  return (
    <div className="flex flex-col gap-2 text-[12px] font-mono">
      <div className="flex items-center gap-2 text-phosphor/70">
        <span className="text-phosphor/50">$</span>
        <span>iverilog design.v tb.v &amp;&amp; vvp a.out</span>
      </div>
      <div className="flex items-center gap-2 text-dim">
        <span className="w-2 h-2 rounded-full bg-phosphor animate-pulse_soft" />
        <span>simulation running…</span>
      </div>
    </div>
  );
}

/** Infrastructure / network error */
function NetworkError({ message }: { message: string }) {
  const isColdStart = message.includes("Render") || message.includes("cold starting") || message.includes("rate-limited");

  return (
    <div className="flex flex-col gap-1 font-mono text-[12px]">
      <div className="flex items-center gap-2 text-danger">
        <span>✗</span>
        <span className="font-semibold">Connection failed</span>
      </div>
      <div className="pl-4 text-danger/80 break-all">{message}</div>
      <div className="pl-4 text-dim mt-2 leading-relaxed">
        {isColdStart ? (
          <span>
            💡 <span className="text-pale font-medium">Render Free Tier Notice:</span> Backend services automatically sleep after 15 minutes of inactivity. Please wait 15-20 seconds for the container to wake up and click <span className="text-phosphor">RUN</span> again.
          </span>
        ) : (
          <span>
            Make sure the FastAPI backend is deployed and running cleanly.
          </span>
        )}
      </div>
    </div>
  );
}

/** Render one line of stdout with appropriate colour */
function StdoutLine({ line, index }: { line: string; index: number }) {
  return (
    <div
      className={`font-term text-[11px] leading-[1.7] animate-slide_up whitespace-pre-wrap break-all ${getLineClass(line)}`}
      style={{ animationDelay: `${Math.min(index * 8, 200)}ms` }}
    >
      {line || "\u00A0"} {/* nbsp preserves blank lines */}
    </div>
  );
}

/** Render one line of stderr — always red */
function StderrLine({ line }: { line: string }) {
  if (!line.trim()) return null;
  return (
    <div className="font-term text-[11px] leading-[1.7] text-danger/80 whitespace-pre-wrap break-all">
      {line}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export default function Terminal({
  runState,
  result,
  errorMsg,
  onClear,
}: TerminalProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom whenever new output arrives
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [result, runState]);

  const stdoutLines = result?.stdout.split("\n") ?? [];
  const stderrLines = result?.stderr.split("\n").filter(Boolean) ?? [];
  const hasWaveform = result?.waveform.available && result.waveform.vcd_base64;

  return (
    <div className="flex flex-col h-full bg-pit border-t border-rim overflow-hidden">
      {/* ── Panel header ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-0 h-tabbar shrink-0 border-b border-rim bg-surface">
        <div className="flex items-center gap-3">
          {/* Terminal icon */}
          <svg
            viewBox="0 0 14 14"
            className="w-3.5 h-3.5 text-dim"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.2"
          >
            <polyline points="1,4 5,7 1,10" />
            <line x1="6" y1="10" x2="13" y2="10" />
          </svg>
          <span className="font-term text-[11px] text-ghost tracking-widest uppercase">
            Output
          </span>
          <StatusBadge runState={runState} status={result?.status} />
        </div>

        <div className="flex items-center gap-2">
          {/* VCD download button — only shown when waveform is available */}
          {hasWaveform && (
            <button
              onClick={() =>
                downloadVcd(result!.waveform.vcd_base64!, "wave.vcd")
              }
              className={[
                "flex items-center gap-1.5 px-3 py-1",
                "font-mono text-[10px] tracking-wider uppercase",
                "rounded border border-phosphor/40 bg-phosphor/10 text-phosphor",
                "hover:bg-phosphor/20 hover:border-phosphor/70",
                "transition-all duration-100 active:scale-[0.97]",
              ].join(" ")}
              title={`Download waveform (${(result!.waveform.size_bytes / 1024).toFixed(1)} KB)`}
            >
              {/* Download arrow icon */}
              <svg
                viewBox="0 0 10 10"
                className="w-2.5 h-2.5 fill-current"
              >
                <path d="M5 1 L5 7 M2 5 L5 8 L8 5" stroke="currentColor" strokeWidth="1.2" fill="none" />
                <line x1="1" y1="9" x2="9" y2="9" stroke="currentColor" strokeWidth="1.2" />
              </svg>
              wave.vcd
              <span className="text-phosphor/50 text-[9px]">
                {(result!.waveform.size_bytes / 1024).toFixed(1)}KB
              </span>
            </button>
          )}

          {/* Clear button — only shown after a run */}
          {runState !== "idle" && runState !== "running" && (
            <button
              onClick={onClear}
              className="font-mono text-[10px] text-dim hover:text-ghost transition-colors px-2 py-1 rounded hover:bg-surface"
            >
              clear
            </button>
          )}
        </div>
      </div>

      {/* ── Output body ──────────────────────────────────────────────────── */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-3 space-y-[1px]"
        style={{ scrollbarWidth: "thin", scrollbarColor: "#22232d transparent" }}
      >
        {runState === "idle"    && <IdlePrompt />}
        {runState === "running" && <RunningPrompt />}
        {runState === "error"   && errorMsg && <NetworkError message={errorMsg} />}

        {runState === "done" && result && (
          <>
            {/* Stdout */}
            {stdoutLines.map((line, i) => (
              <StdoutLine key={`out-${i}`} line={line} index={i} />
            ))}

            {/* Stderr (shown after stdout, styled red) */}
            {stderrLines.length > 0 && (
              <div className="mt-2 pt-2 border-t border-rim/50">
                {stderrLines.map((line, i) => (
                  <StderrLine key={`err-${i}`} line={line} />
                ))}
              </div>
            )}

            {/* Waveform notice when available but download button is in header */}
            {result.waveform.available && (
              <div className="mt-3 pt-2 border-t border-rim/50 flex items-center gap-2 text-[11px] font-mono text-dim">
                <span className="text-phosphor/50">◈</span>
                <span>
                  Waveform captured —{" "}
                  <span className="text-phosphor/70">{result.waveform.size_bytes.toLocaleString()} bytes</span>
                  {" "}→ click <span className="text-phosphor">wave.vcd</span> above to download
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
