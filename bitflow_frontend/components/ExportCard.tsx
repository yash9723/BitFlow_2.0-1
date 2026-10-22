/**
 * components/ExportCard.tsx — LinkedIn-ready snapshot card
 *
 * This component is rendered off-screen (via CSS positioning in page.tsx)
 * and captured by lib/export-image.ts using html-to-image.
 *
 * It is NEVER visible in the normal IDE layout — only in the exported PNG.
 *
 * Layout (portrait, 900px wide):
 *   ┌────────────────────────────────────────────┐
 *   │  ⬡ BitFlow  ·  Sandbox    timestamp  ∿     │  header (64px)
 *   ├──────────────────┬─────────────────────────┤
 *   │  design.v        │  tb.v                   │  code panels (flex)
 *   │  <pre> code      │  <pre> code             │
 *   ├──────────────────┴─────────────────────────┤
 *   │  ∿ Waveform  [signals × time SVG]          │  waveform strip
 *   ├────────────────────────────────────────────┤
 *   │  ✓ success  ws:abc123  Simulated on BitFlow │  footer (48px)
 *   └────────────────────────────────────────────┘
 *
 * Design decisions:
 *   - No external images / fonts that could cause CORS failures during capture.
 *     Google Fonts are loaded via <link> in layout.tsx so they're already in
 *     the browser's font cache and html-to-image can inline them.
 *   - Waveform is an inline SVG from parsedVcd (lib/waveform-svg.ts, also used by
 *     the lab report) — not a screenshot of the live WaveformPanel.
 *   - Code blocks use <pre> with CSS overflow visible so the full source is
 *     captured even if it's longer than the visual height.
 *   - All colours are inline styles (not Tailwind classes) because
 *     html-to-image captures computed CSS, but Tailwind's JIT classes may
 *     not be in the computed stylesheet if the element is off-screen.
 */

"use client";

import React, { forwardRef } from "react";
import type { SimulateResponse } from "@/lib/types";
import type { ParsedVcd } from "@/lib/vcd-parser";
import { waveformSvg } from "@/lib/waveform-svg";
import { mono } from "@/lib/fonts";

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

interface ExportCardProps {
  designCode:    string;
  testbenchCode: string;
  result:        SimulateResponse;
  parsedVcd:     ParsedVcd | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Design tokens — inline so they survive off-screen rendering
// ─────────────────────────────────────────────────────────────────────────────

const C = {
  void:       "#07080a",
  pit:        "#0d0e11",
  surface:    "#1a1b22",
  rim:        "#22232d",
  dim:        "#80839d",
  ghost:      "#9598ac",
  pale:       "#b0b3cc",
  bright:     "#e8eaf6",
  phosphor:   "#00e87a",
  info:       "#4db8ff",
  danger:     "#ff4f4f",
  warn:       "#ffb84d",
} as const;

const CARD_WIDTH  = 900;
const CODE_MAX_H  = 320;  // px — code panels cap height; overflow shown on export
const MAX_SIGNALS = 6;    // show at most 6 signals in export waveform

// ─────────────────────────────────────────────────────────────────────────────
// Status helpers
// ─────────────────────────────────────────────────────────────────────────────

function statusColor(status: string): string {
  if (status === "success")      return C.phosphor;
  if (status === "compile_error" || status === "runtime_error") return C.danger;
  if (status === "timeout")      return C.warn;
  return C.ghost;
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    success:        "PASS",
    compile_error:  "COMPILE ERROR",
    runtime_error:  "RUNTIME ERROR",
    timeout:        "TIMEOUT",
    file_missing:   "FILE MISSING",
    internal_error: "ERROR",
  };
  return map[status] ?? status.toUpperCase();
}

// ─────────────────────────────────────────────────────────────────────────────
// Mini waveform SVG
// Simplified render — no interactions, no zoom, no scroll.
// Shows up to MAX_SIGNALS in a fixed-width SVG.
// ─────────────────────────────────────────────────────────────────────────────

function MiniWaveform({ parsedVcd, width }: { parsedVcd: ParsedVcd; width: number }) {
  // Same renderer as the lab report (lib/waveform-svg.ts); only our own escaped SVG markup goes in.
  const { svg } = waveformSvg(parsedVcd, {}, { width, theme: "dark", maxSignals: MAX_SIGNALS });
  return <div style={{ lineHeight: 0 }} dangerouslySetInnerHTML={{ __html: svg }} />;
}

// ─────────────────────────────────────────────────────────────────────────────
// Code block
// ─────────────────────────────────────────────────────────────────────────────

function CodeBlock({ code, filename }: { code: string; filename: string }) {
  // Simple keyword highlighting via inline spans — no external highlighter
  // needed, avoids CORS issues with Prism/highlight.js CDN in off-screen render.
  return (
    <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
      {/* Tab header */}
      <div
        style={{
          background:  C.surface,
          borderBottom: `1px solid ${C.rim}`,
          padding:     "4px 10px",
          fontFamily:  "monospace",
          fontSize:    10,
          color:       C.pale,
          display:     "flex",
          alignItems:  "center",
          gap:         6,
        }}
      >
        <span style={{ color: C.dim, fontSize: 9 }}>⬡</span>
        {filename}
      </div>
      {/* Code */}
      <pre
        style={{
          margin:      0,
          padding:     "10px 12px",
          background:  C.pit,
          fontFamily:  `${mono.style.fontFamily}, 'Courier New', monospace`,
          fontSize:    9.5,
          lineHeight:  1.55,
          color:       C.pale,
          overflowX:   "hidden",
          whiteSpace:  "pre-wrap",
          wordBreak:   "break-all",
          maxHeight:   CODE_MAX_H,
          overflowY:   "hidden",
        }}
      >
        {code.trim()}
      </pre>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ExportCard — the full card
// ─────────────────────────────────────────────────────────────────────────────

/**
 * forwardRef so page.tsx can get a DOM ref for html-to-image capture.
 */
const ExportCard = forwardRef<HTMLDivElement, ExportCardProps>(
  function ExportCard({ designCode, testbenchCode, result, parsedVcd }, ref) {
    const ts = new Date().toLocaleString("en-US", {
      month:  "short",
      day:    "numeric",
      year:   "numeric",
      hour:   "2-digit",
      minute: "2-digit",
    });

    const durationLabel =
      result.duration_ms >= 1000
        ? `${(result.duration_ms / 1000).toFixed(1)}s`
        : `${Math.round(result.duration_ms)}ms`;

    return (
      <div
        ref={ref}
        style={{
          width:        CARD_WIDTH,
          background:   C.void,
          border:       `1px solid ${C.rim}`,
          borderRadius: 8,
          overflow:     "hidden",
          fontFamily:   `${mono.style.fontFamily}, monospace`,
          // Off-screen — visible to browser layout but not to the user.
          // export-image.ts clones this element into its own container for capture,
          // so the precise position here does not affect the output PNG.
          position:      "fixed",
          top:           0,
          left:          -9999,
          pointerEvents: "none",
        }}
      >
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div
          style={{
            background:   C.surface,
            borderBottom: `1px solid ${C.rim}`,
            padding:      "12px 20px",
            display:      "flex",
            alignItems:   "center",
            justifyContent: "space-between",
          }}
        >
          {/* Left: BitFlow branding */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <img
              src="/bitflow_logo_2.png"
              alt="BitFlow"
              style={{
                width:      28,
                height:     28,
                objectFit:  "contain",
                flexShrink: 0,
              }}
            />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.bright, letterSpacing: "0.05em" }}>
                BitFlow
              </div>
              <div style={{ fontSize: 9, color: C.dim, letterSpacing: "0.15em", textTransform: "uppercase" }}>
                Sandbox
              </div>
            </div>
          </div>

          {/* Right: timestamp + duration */}
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 10, color: C.ghost }}>{ts}</div>
            <div style={{ fontSize: 9, color: C.dim, marginTop: 2 }}>
              simulation: {durationLabel}
            </div>
          </div>
        </div>

        {/* ── Code panels (side by side) ────────────────────────────────── */}
        <div style={{ display: "flex", borderBottom: `1px solid ${C.rim}` }}>
          <CodeBlock code={designCode}    filename="design.v" />
          <div style={{ width: 1, background: C.rim, flexShrink: 0 }} />
          <CodeBlock code={testbenchCode} filename="tb.v" />
        </div>

        {/* ── Waveform strip (only when VCD produced) ───────────────────── */}
        {parsedVcd && parsedVcd.signals.length > 0 && (
          <div style={{ borderBottom: `1px solid ${C.rim}` }}>
            {/* Waveform header */}
            <div
              style={{
                background: C.surface,
                padding:    "5px 12px",
                display:    "flex",
                alignItems: "center",
                gap:        8,
                borderBottom: `1px solid ${C.rim}`,
              }}
            >
              <svg viewBox="0 0 14 10" width={14} height={10} fill="none" stroke={C.info} strokeWidth="1.2">
                <rect x="0.5" y="0.5" width="13" height="9" rx="1" />
                <polyline points="2,5 4,2 6,8 8,3 10,6 12,5" />
              </svg>
              <span style={{ fontFamily: "monospace", fontSize: 9, color: C.ghost, letterSpacing: "0.12em", textTransform: "uppercase" }}>
                Waveform
              </span>
              <span style={{ fontFamily: "monospace", fontSize: 9, color: C.dim }}>
                {parsedVcd.signals.length} signals · {parsedVcd.timescale}
              </span>
            </div>
            <div style={{ padding: "0 0 0 0", background: C.pit }}>
              <MiniWaveform parsedVcd={parsedVcd} width={CARD_WIDTH} />
            </div>
          </div>
        )}

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <div
          style={{
            background: C.surface,
            padding:    "10px 20px",
            display:    "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          {/* Left: status badge */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div
              style={{
                display:      "flex",
                alignItems:   "center",
                gap:          5,
                padding:      "2px 8px",
                borderRadius: 3,
                border:       `1px solid ${statusColor(result.status)}44`,
                background:   `${statusColor(result.status)}14`,
              }}
            >
              <div
                style={{
                  width:        6,
                  height:       6,
                  borderRadius: "50%",
                  background:   statusColor(result.status),
                  flexShrink:   0,
                }}
              />
              <span
                style={{
                  fontFamily: "monospace",
                  fontSize:   9,
                  color:      statusColor(result.status),
                  letterSpacing: "0.1em",
                }}
              >
                {statusLabel(result.status)}
              </span>
            </div>

            <span style={{ fontFamily: "monospace", fontSize: 9, color: C.dim }}>
              ws:{result.workspace_id}
            </span>
          </div>

          {/* Right: branding */}
          <div
            style={{
              fontFamily:    "monospace",
              fontSize:      9,
              color:         C.dim,
              letterSpacing: "0.08em",
            }}
          >
            Simulated on <span style={{ color: C.phosphor }}>BitFlow</span>
          </div>
        </div>
      </div>
    );
  },
);

export default ExportCard;
