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
 *   - Waveform is rendered as an inline mini-SVG from parsedVcd data —
 *     not a screenshot of the live WaveformPanel (which would require a ref
 *     chain and SVG serialization). The mini renderer is intentionally simple.
 *   - Code blocks use <pre> with CSS overflow visible so the full source is
 *     captured even if it's longer than the visual height.
 *   - All colours are inline styles (not Tailwind classes) because
 *     html-to-image captures computed CSS, but Tailwind's JIT classes may
 *     not be in the computed stylesheet if the element is off-screen.
 */

"use client";

import React, { forwardRef } from "react";
import type { SimulateResponse } from "@/lib/types";
import type { ParsedVcd, VcdSignal } from "@/lib/vcd-parser";
import { binToHex } from "@/lib/vcd-parser";
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
const WAVE_H      = 160;  // px — mini waveform strip height
const ROW_H       = 26;   // px — signal row height in mini waveform
const AXIS_H      = 18;   // px — time axis height in mini waveform
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

function MiniWaveform({
  parsedVcd,
  width,
}: {
  parsedVcd: ParsedVcd;
  width:     number;
}) {
  const { signals, maxTime } = parsedVcd;
  const displaySigs = signals.slice(0, MAX_SIGNALS);
  const ppu = maxTime > 0 ? (width - 4) / maxTime : 1;
  const svgH = AXIS_H + displaySigs.length * ROW_H;
  const xOf  = (t: number) => t * ppu;

  const paths = displaySigs.map((sig, ri) => {
    const yH = ri * ROW_H + AXIS_H + 3;
    const yL = ri * ROW_H + AXIS_H + ROW_H - 3;
    const yM = (yH + yL) / 2;

    if (sig.width === 1) {
      // 1-bit step function
      if (sig.changes.length === 0) return null;
      let d = `M 0 ${sig.changes[0]?.value === "1" ? yH : yL}`;
      for (let j = 0; j < sig.changes.length; j++) {
        const { time, value } = sig.changes[j];
        if (j === 0 && time === 0) continue;
        d += ` H ${xOf(time)} V ${value === "1" ? yH : yL}`;
      }
      d += ` H ${width}`;
      return (
        <path key={sig.id} d={d} stroke={C.phosphor} fill="none" strokeWidth={1.2} />
      );
    } else {
      // Bus — simple horizontal lines with value label
      const regions = sig.changes.map((c, idx) => ({
        x1: xOf(c.time),
        x2: idx + 1 < sig.changes.length ? xOf(sig.changes[idx + 1].time) : width,
        v:  c.value,
      }));
      return (
        <g key={sig.id}>
          {regions.map((r, idx) => {
            const label = binToHex(r.v);
            const w = r.x2 - r.x1;
            return (
              <g key={idx}>
                <line x1={r.x1} y1={yH} x2={r.x2} y2={yH} stroke={C.info} strokeWidth={1} />
                <line x1={r.x1} y1={yL} x2={r.x2} y2={yL} stroke={C.info} strokeWidth={1} />
                {w > 24 && (
                  <text
                    x={(r.x1 + r.x2) / 2} y={yM + 3.5}
                    textAnchor="middle" fontSize={8}
                    fill={C.info} fontFamily="monospace"
                  >{label}</text>
                )}
              </g>
            );
          })}
        </g>
      );
    }
  });

  // Row dividers
  const dividers = displaySigs.map((_, ri) => (
    <line
      key={`d${ri}`}
      x1={0} y1={AXIS_H + (ri + 1) * ROW_H}
      x2={width} y2={AXIS_H + (ri + 1) * ROW_H}
      stroke={C.rim} strokeWidth={0.5}
    />
  ));

  return (
    <div style={{ display: "flex" }}>
      {/* Signal labels */}
      <div style={{ width: 80, flexShrink: 0 }}>
        <div style={{ height: AXIS_H }} />
        {displaySigs.map((sig) => (
          <div
            key={sig.id}
            style={{
              height:     ROW_H,
              display:    "flex",
              alignItems: "center",
              paddingLeft: 8,
              fontFamily: "monospace",
              fontSize:   9,
              color:      C.pale,
              borderBottom: `0.5px solid ${C.rim}`,
            }}
          >
            {sig.name.length > 10 ? sig.name.slice(0, 9) + "…" : sig.name}
          </div>
        ))}
      </div>

      {/* SVG waveform */}
      <svg
        width={width - 80}
        height={svgH}
        style={{ flexShrink: 0, background: C.pit }}
      >
        <rect x={0} y={0} width={width - 80} height={AXIS_H} fill={C.surface} />
        {dividers}
        {paths}
        {/* Cursor line placeholder: just a time axis label at end */}
        <text x={2} y={AXIS_H - 4} fontSize={7} fill={C.dim} fontFamily="monospace">
          0
        </text>
        <text
          x={width - 84}
          y={AXIS_H - 4}
          textAnchor="end"
          fontSize={7}
          fill={C.dim}
          fontFamily="monospace"
        >
          {maxTime}
        </text>
      </svg>
    </div>
  );
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
