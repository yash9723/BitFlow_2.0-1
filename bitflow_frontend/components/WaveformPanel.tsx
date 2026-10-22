/**
 * components/WaveformPanel.tsx — Interactive digital timing diagram (v2)
 *
 * ─── What changed from v1 ────────────────────────────────────────────────────
 *
 *  1. AUTO FIT-TO-WIDTH
 *     ResizeObserver measures the chart container on mount and whenever the
 *     panel is opened.  basePxPerUnit = (containerWidth - PAD_RIGHT) / maxTime
 *     so the full trace fills the viewport at zoom=1.  No button needed.
 *
 *  2. WHEEL / TRACKPAD ZOOM
 *     A native wheel listener (passive:false, so preventDefault works) reads
 *     from refs — never stale closures.  The point under the cursor stays fixed
 *     via scroll compensation: scrollLeft = timeAtCursor×newPpu - screenX.
 *     Applied in a pending-scroll ref + useEffect so DOM has updated before
 *     the scroll is set.  Clamped to [MIN_ZOOM … MAX_ZOOM] relative to fit.
 *
 *  3. VERTICAL TIMELINE CURSOR
 *     The cursor <line> and time <text> are updated via React refs with direct
 *     DOM attribute writes — zero React re-render on every mouse-move pixel.
 *     Only hoverInfo state (signal values) goes through setState.
 *
 *  4. SIGNAL VALUE INSPECTION
 *     getValueAtTime() does a binary search on each signal's sorted changes[].
 *     Formatted value badges appear next to the signal name: green for logic-1,
 *     dim for logic-0, amber for x/z, blue for buses.
 *
 *  5. STICKY SIGNAL LABELS
 *     Unchanged from v1 — the label column is outside the scrollable SVG div
 *     so it never scrolls horizontally.
 *
 * ─── Performance strategy ────────────────────────────────────────────────────
 *
 *  • Waveform paths, grid, and tick labels are in useMemo blocks keyed on
 *    primitive values (pxPerUnit, chartW, maxTime).  They do NOT recompute
 *    on mouse-move.
 *  • Cursor line + time label: direct DOM writes (refs), no re-render.
 *  • Signal value badges (hoverInfo): one setState per mouse-move, only the
 *    label column (3–10 small divs) re-renders.
 *  • handleMouseMove is stable across zoom changes (reads geometry from refs).
 *
 * ─── Only this file changed ──────────────────────────────────────────────────
 *  lib/vcd-parser.ts, lib/types.ts, hooks/useSimulation.ts, app/page.tsx
 *  are all untouched.
 */

"use client";

import React, {
  useRef,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import type { ParsedVcd, VcdSignal, VcdChange } from "@/lib/vcd-parser";
import { binToHex, niceTimeStep } from "@/lib/vcd-parser";
import { downloadVcd } from "@/lib/api";
import { type Radix, defaultRadix, formatWithRadix, nextRadix, RADIX_LABEL } from "@/lib/radix";
import type { SimulateResponse } from "@/lib/types";

// ─────────────────────────────────────────────────────────────────────────────
// Layout constants
// ─────────────────────────────────────────────────────────────────────────────

const LABEL_W   = 136;   // px — fixed label column width (sticky left)
const ROW_H     = 40;    // px — height per signal row (labels + SVG must match)
const AXIS_H    = 26;    // px — time axis band above row 0
const MARKER_COLOR = { a: "#ffb547", b: "#5ab0ff" } as const;   // pinned markers A / B
const SIG_PAD   = 8;     // px — top/bottom inset for waveform within row
const CROSS_W   = 5;     // px — half-width of bus transition chevrons
const PAD_RIGHT = 32;    // px — breathing room after the last timestamp

const MIN_ZOOM  = 0.15;  // 15% of fit-to-width — compact overview
const MAX_ZOOM  = 60;    // 60× fit-to-width — extreme close-up

// ─────────────────────────────────────────────────────────────────────────────
// Internal types
// ─────────────────────────────────────────────────────────────────────────────

interface WaveformPanelProps {
  parsedVcd : ParsedVcd;
  /** The run it came from — enables the VCD download button. */
  result?   : SimulateResponse;
  /** Time ranges to shade red (e.g. where "yours" differs from "expected"). */
  highlights?: { from: number; to: number }[];
  /** Keep hidden rows, order, radix and markers across re-runs (which remount the panel) under this key. */
  viewKey?: string;
}

interface SavedView {
  hidden  : string[];
  order   : string[];
  radixMap: Record<string, Radix>;
  markers : { a: number | null; b: number | null };
}
// ponytail: in-memory only, so views reset on reload; move to sessionStorage if people ask.
const savedViews = new Map<string, SavedView>();

/** Captured on every mouse-move; drives the label-column value badges. */
interface HoverInfo {
  time   : number;
  values : Record<string, string>;   // signalId → raw VCD value string
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Binary-search `changes` for the last entry at or before `time`.
 * Returns null when `time` precedes the first recorded change.
 *
 * O(log n) per signal per mouse-move — negligible for realistic VCD sizes.
 */
function getValueAtTime(changes: VcdChange[], time: number): string | null {
  if (changes.length === 0) return null;
  if (time < changes[0].time) return null;

  let lo = 0;
  let hi = changes.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (changes[mid].time <= time) lo = mid;
    else hi = mid - 1;
  }
  return changes[lo].value;
}

// ─────────────────────────────────────────────────────────────────────────────
// SVG waveform renderers
// Pure functions — receive pxPerUnit as a primitive so useMemo can key on it.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 1-bit signal: phosphor-green step function with subtle high-area fill.
 *
 * Algorithm: walk changes[], emit H (horizontal) to each change time then
 * V (vertical) to the new level.  A closing path provides the faint fill.
 */
function render1bit(
  sig       : VcdSignal,
  rowIndex  : number,
  pxPerUnit : number,
  chartW    : number,
): React.ReactElement {
  const xOf = (t: number) => t * pxPerUnit;

  const yH = rowIndex * ROW_H + AXIS_H + SIG_PAD;           // y when HIGH
  const yL = rowIndex * ROW_H + AXIS_H + ROW_H - SIG_PAD;   // y when LOW
  const yX = (yH + yL) / 2;                                  // y when X/Z

  const toY = (v: string): number =>
    v === "1" ? yH : v === "0" ? yL : yX;

  const { changes } = sig;

  if (changes.length === 0) {
    return (
      <line
        key={sig.id}
        x1={0} y1={yX} x2={chartW} y2={yX}
        stroke="#4a4d60" strokeWidth={1} strokeDasharray="4 3"
      />
    );
  }

  // Build the step-function path
  const startY = changes[0].time === 0 ? toY(changes[0].value) : yX;
  let d = `M 0 ${startY}`;

  for (let j = 0; j < changes.length; j++) {
    const { time, value } = changes[j];
    if (j === 0 && time === 0) continue;   // already at correct y
    d += ` H ${xOf(time)} V ${toY(value)}`;
  }
  d += ` H ${chartW}`;

  return (
    <g key={sig.id}>
      <path
        d={d}
        stroke="#00e87a"
        fill="none"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      {/* Faint green fill under the HIGH segments */}
      <path
        d={`${d} V ${yL} H 0 Z`}
        fill="rgba(0,232,122,0.04)"
        stroke="none"
      />
    </g>
  );
}

/**
 * Multi-bit bus: blue hexagonal segments with centred hex value labels.
 *
 * Each stable region becomes a parallelogram:
 *   left-apex → top-left → top-right → right-apex → bottom-right → bottom-left
 * Transitions overlap by CROSS_W px on each side, giving the classic
 * "crossing wires" look between consecutive values.
 */
function renderBus(
  sig       : VcdSignal,
  rowIndex  : number,
  pxPerUnit : number,
  chartW    : number,
  radix     : Radix,          // ← NEW: controls segment label formatting
): React.ReactElement {
  const xOf = (t: number) => t * pxPerUnit;

  const yH = rowIndex * ROW_H + AXIS_H + SIG_PAD;
  const yL = rowIndex * ROW_H + AXIS_H + ROW_H - SIG_PAD;
  const yM = (yH + yL) / 2;

  if (sig.changes.length === 0) {
    return (
      <g key={sig.id}>
        <line x1={0} y1={yH} x2={chartW} y2={yH} stroke="#4a4d60" strokeWidth={1} strokeDasharray="4 3" />
        <line x1={0} y1={yL} x2={chartW} y2={yL} stroke="#4a4d60" strokeWidth={1} strokeDasharray="4 3" />
        <text x={chartW / 2} y={yM + 4} textAnchor="middle" fontSize={10} fill="#4a4d60" fontFamily="monospace">x</text>
      </g>
    );
  }

  const regions = sig.changes.map((change, idx) => ({
    x1    : xOf(change.time),
    x2    : idx + 1 < sig.changes.length ? xOf(sig.changes[idx + 1].time) : chartW,
    value : change.value,
  }));

  return (
    <g key={sig.id}>
      {regions.map((reg, idx) => {
        const { x1, x2, value } = reg;
        // ← FIX: use formatWithRadix instead of hardcoded binToHex
        const label     = formatWithRadix(value, sig.width, radix);
        const isUnknown = label === "x" || label === "z" || label === "X";

        // First/last regions have flat ends; middle regions have chevrons
        const lx = x1 === 0     ? 0      : x1 + CROSS_W;
        const rx = x2 === chartW ? chartW : x2 - CROSS_W;

        const pts = [
          `${x1},${yM}`, `${lx},${yH}`, `${rx},${yH}`,
          `${x2},${yM}`, `${rx},${yL}`, `${lx},${yL}`,
        ].join(" ");

        const fill   = isUnknown ? "rgba(74,77,96,0.15)"  : "rgba(77,184,255,0.08)";
        const stroke = isUnknown ? "#4a4d60"               : "#4db8ff";
        const color  = isUnknown ? "#4a4d60"               : "#4db8ff";
        const w      = rx - lx;

        return (
          <g key={idx}>
            <polygon points={pts} fill={fill} stroke={stroke} strokeWidth={1} />
            {w > 16 && (
              <text
                x={(lx + rx) / 2} y={yM + 4}
                textAnchor="middle"
                fontSize={w > 32 ? 10 : 8}
                fill={color}
                fontFamily="monospace"
                style={{ userSelect: "none" }}
              >
                {label}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-1 items-center justify-center text-[12px] font-mono text-dim">
      <div className="text-center space-y-1">
        <div className="text-2xl text-dim/40">∿</div>
        <div>No signals found in waveform.</div>
        <div className="text-[11px]">
          Make sure your testbench calls{" "}
          <span className="text-pale">$dumpfile</span> and{" "}
          <span className="text-pale">$dumpvars</span>.
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SignalLabel — rendered in the sticky left column
// Re-renders only when hoverValue changes (one per mouse-move).
// ─────────────────────────────────────────────────────────────────────────────

interface SignalLabelProps {
  sig          : VcdSignal;
  hoverValue   : string | undefined;   // undefined = no cursor; string = live value
  radix        : Radix;
  onRadixChange: (key: string, radix: Radix) => void;
  dimmed       : boolean;              // true when search active and signal doesn't match
  /** Row key: the name, plus "#n" for a repeated name (see WaveformPanel). */
  rowKey       : string;
  onHide       : (key: string) => void;
  /** Drag a label onto another to move it there. */
  onMove       : (from: string, to: string) => void;
}

const SignalLabel = React.memo(function SignalLabel({
  sig,
  hoverValue,
  radix,
  onRadixChange,
  dimmed,
  rowKey,
  onHide,
  onMove,
}: SignalLabelProps) {
  const isBus = sig.width > 1;
  const display = hoverValue !== undefined
    ? formatWithRadix(hoverValue, sig.width, radix)
    : undefined;

  // Value badge colour depends on signal type and current value
  const badgeClass = (() => {
    if (display === undefined) return "";
    if (sig.width === 1) {
      if (display === "1") return "bg-phosphor/20 text-phosphor";
      if (display === "0") return "bg-surface text-ghost";
      return "bg-surface text-warn";      // x or z
    }
    if (display === "x" || display === "z" || display === "X") return "bg-surface text-warn";
    return "bg-info/10 text-info";        // formatted bus value
  })();

  return (
    <div
      className="group flex items-center justify-between px-2 border-b border-rim/30 shrink-0 select-none transition-opacity duration-100 cursor-grab"
      style={{ height: ROW_H, opacity: dimmed ? 0.25 : 1 }}
      draggable
      title="Drag to reorder"
      onDragStart={(e) => { e.dataTransfer.setData("text/x-bitflow-signal", rowKey); e.dataTransfer.effectAllowed = "move"; }}
      onDragOver={(e) => { if (e.dataTransfer.types.includes("text/x-bitflow-signal")) e.preventDefault(); }}
      onDrop={(e) => { e.preventDefault(); const from = e.dataTransfer.getData("text/x-bitflow-signal"); if (from && from !== rowKey) onMove(from, rowKey); }}
    >
      {/* Signal name — truncated with tooltip for long names */}
      <span
        className="font-mono text-[11px] text-pale truncate flex-1 min-w-0 mr-1"
        title={sig.name}
      >
        {sig.name}
      </span>

      {/* Right side: radix button + width badge + live value badge */}
      <div className="flex items-center gap-1 shrink-0">
        {/* Radix cycle button — only for buses */}
        {isBus && (
          <button
            onClick={() => onRadixChange(rowKey, nextRadix(radix))}
            title={`Switch display radix (current: ${radix})`}
            className={[
              "font-mono text-[8px] w-4 h-4 rounded",
              "flex items-center justify-center",
              "text-dim hover:text-info hover:bg-info/10",
              "transition-colors duration-100",
            ].join(" ")}
          >
            {RADIX_LABEL[radix]}
          </button>
        )}

        {isBus && (
          <span className="font-mono text-[9px] text-dim">[{sig.width}]</span>
        )}

        {display !== undefined && (
          <span className={`font-mono text-[9px] px-1 py-px rounded ${badgeClass}`}>
            {display}
          </span>
        )}

        <button
          onClick={() => onHide(rowKey)}
          title={`Hide ${sig.name}`}
          aria-label={`Hide signal ${sig.name}`}
          className="font-mono text-[10px] w-3 text-dim hover:text-danger opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
        >
          ×
        </button>
      </div>
    </div>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export default function WaveformPanel({ parsedVcd, result, highlights, viewKey }: WaveformPanelProps) {
  const saved = viewKey ? savedViews.get(viewKey) : undefined;
  const { signals, maxTime, timescale } = parsedVcd;

  // ── Refs ──────────────────────────────────────────────────────────────────

  /**
   * scrollRef: the horizontally-scrollable chart area.
   * Wheel listener is attached here; mouse coords are measured against it.
   */
  const scrollRef = useRef<HTMLDivElement>(null);

  /**
   * cursorLineRef / cursorLabelRef: updated via direct DOM writes inside
   * handleMouseMove so the cursor moves at 0-latency without React re-renders.
   */
  const cursorLineRef  = useRef<SVGLineElement>(null);
  const cursorLabelRef = useRef<SVGTextElement>(null);

  /**
   * Shadowed state values for stable event-handler closures.
   * The wheel listener is registered once; it reads these refs so it always
   * sees the latest values without being re-created on every render.
   */
  const zoomRef        = useRef(1.0);
  const basePpuRef     = useRef(4);     // basePxPerUnit shadow
  const pxPerUnitRef   = useRef(4);     // pxPerUnit shadow (ppu = base × zoom)
  const chartWRef      = useRef(0);     // chartW shadow
  const maxTimeRef     = useRef(maxTime);

  /**
   * pendingScrollRef: the wheel handler computes the desired scrollLeft for the
   * new zoom level and stores it here.  A useEffect that depends on [zoom]
   * applies it after React has re-rendered (and the SVG has the new width).
   */
  const pendingScrollRef = useRef<number | null>(null);

  /**
   * labelScrollRef: the vertically-scrollable label column.
   * Its scrollTop is kept in sync with scrollRef's scrollTop bidirectionally
   * so both columns always show the same vertical slice of signals.
   */
  const labelScrollRef = useRef<HTMLDivElement>(null);

  // ── State ─────────────────────────────────────────────────────────────────

  const [isOpen,         setIsOpen]         = useState(true);
  const [zoom,           setZoom]           = useState(1.0);
  const [containerWidth, setContainerWidth] = useState(0);
  const [hoverInfo,      setHoverInfo]      = useState<HoverInfo | null>(null);

  // ── Signal search state ────────────────────────────────────────────────────

  /**
   * searchQuery: raw string from the search input.
   * Empty string = no filter active (all signals fully visible).
   * Deliberately NOT in waveformElements useMemo deps — the SVG geometry
   * doesn't change when filtering, only the label opacity.
   */
  const [searchQuery,    setSearchQuery]    = useState<string>("");

  /**
   * dimmedIds: Set of signal IDs whose label and SVG row should be dimmed.
   * Computed with useMemo — runs only when query or signals change.
   *
   * MATCHING RULE — word-segment prefix:
   *   Split the signal name on underscores, then check if any segment
   *   STARTS WITH the query (not contains).  This means:
   *     query "a"     → matches "a", "addr", "a_out" but NOT "carry", "data"
   *     query "cl"    → matches "clk", "clk_en" but NOT "rclk"
   *     query "carry" → matches "carry", "carry_out"
   *   This matches the mental model of HDL signal naming conventions.
   */
  const dimmedIds = useMemo<Set<string>>(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return new Set<string>();

    const matches = (name: string): boolean => {
      const lower = name.toLowerCase();
      // Direct prefix match on the full name
      if (lower.startsWith(q)) return true;
      // Prefix match on any underscore-separated word segment
      return lower.split("_").some((seg) => seg.startsWith(q));
    };

    return new Set(
      signals
        .filter((s) => !matches(s.name))
        .map((s) => s.id),
    );
  }, [searchQuery, signals]);

  /**
   * hidden / order: row keys — the signal name, plus "#n" for its n-th repeat
   * (a testbench and its DUT can both have "count"). Unlike VCD id codes these
   * survive a re-run. Hidden rows are left out; dragged rows follow `order`,
   * and signals not in it keep their VCD order after the ordered ones.
   */
  const [hidden, setHidden] = useState<string[]>(saved?.hidden ?? []);
  const [order,  setOrder]  = useState<string[]>(saved?.order ?? []);

  const rowKey = useMemo(() => {
    const seen = new Map<string, number>();
    const keys = new Map<string, string>();
    for (const s of signals) {
      const n = seen.get(s.name) ?? 0;
      seen.set(s.name, n + 1);
      keys.set(s.id, n ? `${s.name}#${n}` : s.name);
    }
    return keys;
  }, [signals]);

  const visibleSignals = useMemo<VcdSignal[]>(() => {
    const rank = new Map(order.map((n, i) => [n, i]));
    return signals
      .filter((s) => !hidden.includes(rowKey.get(s.id)!))
      .map((s, i) => ({ s, r: rank.get(rowKey.get(s.id)!) ?? order.length + i }))
      .sort((x, y) => x.r - y.r)
      .map(({ s }) => s);
  }, [signals, hidden, order, rowKey]);

  const hiddenCount = signals.filter((s) => hidden.includes(rowKey.get(s.id)!)).length;
  const handleHide  = useCallback((key: string) => setHidden((h) => [...h, key]), []);
  const handleMove  = useCallback((from: string, to: string) => {
    const names = visibleSignals.map((s) => rowKey.get(s.id)!).filter((n) => n !== from);
    names.splice(names.indexOf(to), 0, from);
    setOrder(names);
  }, [visibleSignals, rowKey]);

  /**
   * displaySignals: the ordered list of signals actually rendered.
   *
   * When search is active (dimmedIds is non-empty):
   *   → matching signals first (in their original relative order)
   *   → dimmed signals after (in their original relative order)
   *
   * When search is cleared:
   *   → original VCD order restored exactly
   *
   * This array drives BOTH the label column AND the SVG waveform rows so
   * they always stay in sync.  The original `signals` array from parsedVcd
   * is never mutated.
   */
  const displaySignals = useMemo<VcdSignal[]>(() => {
    if (dimmedIds.size === 0) return visibleSignals;   // no query → current order
    const matched  = visibleSignals.filter((s) => !dimmedIds.has(s.id));
    const unmatched = visibleSignals.filter((s) =>  dimmedIds.has(s.id));
    return [...matched, ...unmatched];
  }, [visibleSignals, dimmedIds]);

  // ── Radix state ────────────────────────────────────────────────────────────

  /**
   * radixMap: per-signal display radix, keyed by row key (see hidden / order).
   * Missing entry → defaultRadix(sig.width).
   * Only buses (width > 1) use dec/hex; 1-bit signals always show "0"/"1".
   *
   * Deliberately separate from waveformElements memo — radix only affects
   * the label column (SignalLabel), not the SVG path geometry.
   */
  const [radixMap,       setRadixMap]       = useState<Record<string, Radix>>(saved?.radixMap ?? {});

  /**
   * handleRadixChange: stable callback passed to each SignalLabel.
   * Only updates the single entry for the changed signal — all other
   * SignalLabel instances are unaffected (React.memo guards them).
   */
  const handleRadixChange = useCallback((key: string, radix: Radix) => {
    setRadixMap((prev) => ({ ...prev, [key]: radix }));
  }, []);

  // ── Derived geometry ──────────────────────────────────────────────────────

  /**
   * basePxPerUnit: makes the complete trace fill the container at zoom=1.
   * Recomputed only when the container resizes or a new VCD is loaded.
   */
  const basePxPerUnit = useMemo(() => {
    if (containerWidth <= PAD_RIGHT || maxTime <= 0) return 4;
    return (containerWidth - PAD_RIGHT) / maxTime;
  }, [containerWidth, maxTime]);

  const pxPerUnit = basePxPerUnit * zoom;
  const chartW    = Math.max(maxTime * pxPerUnit + PAD_RIGHT, containerWidth);
  const svgH      = AXIS_H + displaySignals.length * ROW_H;

  // Keep all shadowed refs current after every render
  useEffect(() => { zoomRef.current      = zoom;         }, [zoom]);
  useEffect(() => { basePpuRef.current   = basePxPerUnit; }, [basePxPerUnit]);
  useEffect(() => { pxPerUnitRef.current = pxPerUnit;    }, [pxPerUnit]);
  useEffect(() => { chartWRef.current    = chartW;       }, [chartW]);
  useEffect(() => { maxTimeRef.current   = maxTime;      }, [maxTime]);

  // ── Apply deferred scroll after zoom re-render ────────────────────────────

  /**
   * The wheel handler stores the target scrollLeft in pendingScrollRef.
   * This effect applies it once the DOM has updated with the new SVG dimensions,
   * preventing the scroll from being clamped to the old (smaller) chart width.
   */
  useEffect(() => {
    if (pendingScrollRef.current !== null && scrollRef.current) {
      scrollRef.current.scrollLeft = Math.max(0, pendingScrollRef.current);
      pendingScrollRef.current = null;
    }
  }, [zoom]);

  // ── ResizeObserver — auto fit-to-width ────────────────────────────────────

  /**
   * Attached to the chart area div.  Fires immediately on mount (and whenever
   * isOpen toggles from false→true, causing the div to re-appear in the DOM).
   * Sets containerWidth, which recalculates basePxPerUnit.
   *
   * Dependency: [isOpen] — the observed element is conditionally rendered,
   * so we re-run the effect when it appears/disappears.
   */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      if (w > 0) setContainerWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [isOpen]);

  // ── Wheel zoom — native listener (passive:false) ──────────────────────────

  /**
   * Why native listener instead of React's onWheel?
   * React synthetic events are always passive in React 17+, so preventDefault
   * is ignored.  We need preventDefault to stop the page from scrolling
   * vertically while zooming horizontally.
   *
   * The handler reads only refs — no stale closures, no re-registration on zoom.
   * Dependency: [isOpen] — re-attach when the chart area enters the DOM.
   */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();

      const factor      = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      const currentZoom = zoomRef.current;
      const newZoom     = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, currentZoom * factor));
      if (Math.abs(newZoom - currentZoom) < 0.0005) return;

      // Identify the VCD time under the cursor so we can keep it fixed.
      const rect         = el.getBoundingClientRect();
      const screenX      = e.clientX - rect.left;                    // px from container left edge
      const contentX     = screenX + el.scrollLeft;                  // px in SVG coordinate space
      const timeAtCursor = contentX / (basePpuRef.current * currentZoom);

      // Compute where that same time should be after zoom and back-calculate scrollLeft.
      const newPpu       = basePpuRef.current * newZoom;
      pendingScrollRef.current = timeAtCursor * newPpu - screenX;

      // Update zoom ref synchronously so rapid wheel events read the latest value.
      zoomRef.current = newZoom;
      setZoom(newZoom);
    };

    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [isOpen]);

  // ── Mouse move — cursor + signal inspection ───────────────────────────────

  /**
   * handleMouseMove is stable across zoom changes because it reads geometry
   * from refs (pxPerUnitRef, chartWRef, maxTimeRef) rather than closed-over
   * state variables.  It's only recreated when signals/maxTime change —
   * i.e. when a new simulation result arrives.
   *
   * Two-track update strategy:
   *   TRACK A — direct DOM writes (cursor line + time label): zero React cost.
   *   TRACK B — setState (hoverInfo): one batched re-render, only label column.
   */
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const el = scrollRef.current;
      if (!el) return;

      const ppu   = pxPerUnitRef.current;
      const cw    = chartWRef.current;
      const tMax  = maxTimeRef.current;
      if (ppu <= 0) return;

      // Convert screen position to SVG content coordinate
      const rect     = el.getBoundingClientRect();
      const contentX = e.clientX - rect.left + el.scrollLeft;
      const time     = Math.max(0, Math.min(tMax, contentX / ppu));

      // ── TRACK A: direct DOM updates (no React re-render) ─────────────────

      if (cursorLineRef.current) {
        cursorLineRef.current.setAttribute("x1", String(contentX));
        cursorLineRef.current.setAttribute("x2", String(contentX));
        cursorLineRef.current.style.visibility = "visible";
      }
      if (cursorLabelRef.current) {
        // Flip label anchor when near the right edge to avoid overflow
        const nearRight = contentX > cw - 72;
        cursorLabelRef.current.setAttribute(
          "x", String(nearRight ? contentX - 5 : contentX + 5),
        );
        cursorLabelRef.current.setAttribute(
          "text-anchor", nearRight ? "end" : "start",
        );
        cursorLabelRef.current.textContent = `${Math.round(time)}`;
        cursorLabelRef.current.style.visibility = "visible";
      }

      // ── TRACK B: React state (label column value badges) ──────────────────

      const values: Record<string, string> = {};
      for (const sig of signals) {
        const v = getValueAtTime(sig.changes, time);
        if (v !== null) values[sig.id] = v;
      }
      setHoverInfo({ time, values });
    },
    [signals],   // stable across zoom/resize — geometry via refs
  );

  const handleMouseLeave = useCallback(() => {
    if (cursorLineRef.current)  cursorLineRef.current.style.visibility  = "hidden";
    if (cursorLabelRef.current) cursorLabelRef.current.style.visibility = "hidden";
    setHoverInfo(null);
  }, []);

  // ── Pinned markers: click sets A, shift-click sets B ──────────────────────

  const [markers, setMarkers] = useState<SavedView["markers"]>(saved?.markers ?? { a: null, b: null });

  useEffect(() => {
    if (viewKey) savedViews.set(viewKey, { hidden, order, radixMap, markers });
  }, [viewKey, hidden, order, radixMap, markers]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el  = scrollRef.current;
    const ppu = pxPerUnitRef.current;
    if (!el || ppu <= 0) return;
    const rect = el.getBoundingClientRect();
    const t    = Math.round(Math.max(0, Math.min(maxTimeRef.current, (e.clientX - rect.left + el.scrollLeft) / ppu)));
    setMarkers((m) => (e.shiftKey ? { ...m, b: t } : { ...m, a: t }));
  }, []);

  /** "40ns" when the timescale is 1<unit>, else "40 × 10ps". */
  const unit  = /^1\s*([a-z]+)$/i.exec(timescale.trim())?.[1];
  const fmtDt = (dt: number) => (unit ? `${dt}${unit}` : `${dt} × ${timescale}`);

  // ── Memoised SVG geometry ─────────────────────────────────────────────────

  /**
   * Waveform paths: recomputed on geometry changes (zoom, resize, new VCD)
   * AND on radix changes (radixMap) — because renderBus embeds the formatted
   * label text directly in the SVG.  Radix changes are rare user interactions
   * (not continuous like mouse-move), so the recompute cost is negligible.
   *
   * Search dimming: dimmedIds is still NOT in this memo's deps.
   * The dimming wrapper memo below handles that without touching geometry.
   */
  const waveformElements = useMemo(
    () =>
      displaySignals.map((sig, ri) => {
        const radix = radixMap[rowKey.get(sig.id)!] ?? defaultRadix(sig.width);
        return sig.width === 1
          ? render1bit(sig, ri, pxPerUnit, chartW)
          : renderBus(sig, ri, pxPerUnit, chartW, radix);
      }),
    [displaySignals, pxPerUnit, chartW, radixMap, rowKey],
  );

  /**
   * dimmedWaveformElements: applies search-driven opacity as a <g> wrapper.
   * This memo depends on dimmedIds (changes with search) but NOT on
   * pxPerUnit/chartW — the expensive path computation is already done above.
   * React sees only a changed `opacity` attribute, not a new subtree.
   */
  const dimmedWaveformElements = useMemo(
    () =>
      waveformElements.map((el, ri) => {
        const sig   = displaySignals[ri];
        const isDim = dimmedIds.has(sig.id);
        return (
          <g key={sig.id} opacity={isDim ? 0.15 : 1} style={{ transition: "opacity 0.1s" }}>
            {el}
          </g>
        );
      }),
    [waveformElements, dimmedIds, displaySignals],
  );

  /**
   * Grid infrastructure: tick lines, tick labels, row dividers.
   * Same dependency set as waveforms.
   */
  const gridElements = useMemo(() => {
    const xOf  = (t: number) => t * pxPerUnit;
    const step = niceTimeStep(maxTime);
    const ticks: number[] = [];
    for (let t = 0; t <= maxTime; t += step) ticks.push(t);

    const tickLines = ticks.map((t) => (
      <line
        key={`tl-${t}`}
        x1={xOf(t)} y1={AXIS_H}
        x2={xOf(t)} y2={svgH}
        stroke="#13141a" strokeWidth={1}
      />
    ));

    const tickLabels = ticks.map((t) => (
      <g key={`tla-${t}`}>
        <line
          x1={xOf(t)} y1={AXIS_H - 5}
          x2={xOf(t)} y2={AXIS_H}
          stroke="#2e3040" strokeWidth={1}
        />
        <text
          x={xOf(t) + 3} y={AXIS_H - 8}
          fontSize={9} fill="#4a4d60"
          fontFamily="monospace"
          style={{ userSelect: "none" }}
        >
          {t}
        </text>
      </g>
    ));

    const rowDividers = displaySignals.map((_, ri) => (
      <line
        key={`rd-${ri}`}
        x1={0}      y1={AXIS_H + (ri + 1) * ROW_H}
        x2={chartW} y2={AXIS_H + (ri + 1) * ROW_H}
        stroke="#1a1b22" strokeWidth={1}
      />
    ));

    return { tickLines, tickLabels, rowDividers };
  }, [displaySignals, pxPerUnit, chartW, svgH, maxTime]);

  // ── Misc derived values ───────────────────────────────────────────────────

  const hasVcd      = result?.waveform.available && result.waveform.vcd_base64;
  const zoomPercent = Math.round(zoom * 100);
  const isAtFit     = Math.abs(zoom - 1.0) < 0.01;

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div
      className={[
        "flex flex-col bg-pit border-t border-rim overflow-hidden h-full",
      ].join(" ")}
    >
      {/* ── Panel header ───────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-3 h-8 shrink-0 bg-surface border-b border-rim">

        {/* Left: icon + metadata + live cursor time */}
        <div className="flex items-center gap-2.5">
          {/* Oscilloscope icon */}
          <svg
            viewBox="0 0 14 10"
            className="w-3.5 h-2.5 text-info shrink-0"
            fill="none" stroke="currentColor" strokeWidth="1.2"
          >
            <rect x="0.5" y="0.5" width="13" height="9" rx="1" />
            <polyline points="2,5 4,2 6,8 8,3 10,6 12,5" />
          </svg>

          <span className="font-mono text-[10px] text-ghost tracking-widest uppercase">
            Waveform
          </span>

          <span className="font-mono text-[9px] text-dim">
            {signals.length} signal{signals.length !== 1 ? "s" : ""}
          </span>
          <span className="font-mono text-[9px] text-dim">· {timescale}</span>
          {maxTime > 0 && (
            <span className="font-mono text-[9px] text-dim">· 0→{maxTime}</span>
          )}

          {/*
           * Live cursor time — shown in header so it's readable without
           * looking away from the signal rows.  Updated by React state
           * (hoverInfo), not by direct DOM write, because it's in a
           * completely different subtree from the SVG.
           */}
          {hoverInfo !== null && (
            <span className="font-mono text-[9px] text-phosphor/80 tabular-nums">
              t&thinsp;=&thinsp;{Math.round(hoverInfo.time)}
            </span>
          )}

          {(markers.a !== null || markers.b !== null) && (
            <span className="flex items-center gap-1.5 font-mono text-[9px] tabular-nums">
              {markers.a !== null && <span style={{ color: MARKER_COLOR.a }}>A={markers.a}</span>}
              {markers.b !== null && <span style={{ color: MARKER_COLOR.b }}>B={markers.b}</span>}
              {markers.a !== null && markers.b !== null && (
                <span className="text-pale">&Delta;={fmtDt(Math.abs(markers.b - markers.a))}</span>
              )}
              <button
                onClick={() => setMarkers({ a: null, b: null })}
                title="Clear markers"
                aria-label="Clear markers"
                className="text-dim hover:text-ghost"
              >
                ×
              </button>
            </span>
          )}
        </div>

        {/* Right: zoom indicator + download + collapse */}
        <div className="flex items-center gap-2">
          {/* Zoom indicator — only shown when not at 1× fit */}
          {!isAtFit && (
            <button
              onClick={() => setZoom(1.0)}
              title="Reset zoom to fit-to-width"
              className={[
                "font-mono text-[9px] px-1.5 py-px rounded",
                "text-dim hover:text-ghost hover:bg-rim/50 transition-colors",
              ].join(" ")}
            >
              {zoomPercent}% ↺
            </button>
          )}

          {/* Scroll-to-zoom hint — only shown at fit level */}
          {isAtFit && (
            <span className="hidden sm:block font-mono text-[8px] text-dim/40 select-none">
              scroll to zoom · click: marker A · shift-click: B
            </span>
          )}

          {hiddenCount > 0 && (
            <button
              onClick={() => setHidden([])}
              className="font-mono text-[9px] px-1.5 py-px rounded text-dim hover:text-ghost hover:bg-rim/50 transition-colors"
            >
              show {hiddenCount} hidden
            </button>
          )}

          {/* Download VCD */}
          {hasVcd && (
            <button
              onClick={() => downloadVcd(result!.waveform.vcd_base64!, "wave.vcd")}
              className={[
                "flex items-center gap-1 px-2 py-0.5",
                "font-mono text-[9px] tracking-wider uppercase",
                "rounded border border-phosphor/30 bg-phosphor/5 text-phosphor/70",
                "hover:bg-phosphor/15 hover:border-phosphor/60 hover:text-phosphor",
                "transition-all duration-100",
              ].join(" ")}
            >
              ↓ wave.vcd
            </button>
          )}

          {/* Collapse / expand toggle */}
          <button
            onClick={() => setIsOpen((v) => !v)}
            title={isOpen ? "Collapse waveform panel" : "Expand waveform panel"}
            aria-label={isOpen ? "Collapse waveform panel" : "Expand waveform panel"}
            className="font-mono text-[10px] text-dim hover:text-ghost transition-colors px-1.5 py-0.5 rounded hover:bg-rim/50 select-none"
          >
            {isOpen ? "▲" : "▼"}
          </button>
        </div>
      </div>

      {/* ── Empty state ────────────────────────────────────────────────────── */}
      {isOpen && signals.length === 0 && <EmptyState />}

      {/* ── Diagram body ───────────────────────────────────────────────────── */}
      {isOpen && signals.length > 0 && (
        <div className="flex flex-1 min-h-0 overflow-hidden">

          {/*
           * ── Left column: sticky search header + scrollable labels ──────────
           * The header (search bar) is position:sticky top-0 so it stays
           * visible as the user scrolls down through many signals.
           * The column itself scrolls vertically in sync with the SVG via
           * the shared labelScrollRef — onScroll mirrors scrollTop to the SVG
           * wrapper and vice-versa.
           */}
          <div
            ref={labelScrollRef}
            className="shrink-0 flex flex-col bg-pit border-r border-rim overflow-y-auto overflow-x-hidden"
            style={{
              width: LABEL_W,
              scrollbarWidth: "none",   // hide scrollbar — driven by SVG scroll
            }}
            onScroll={(e) => {
              // Mirror vertical scroll to SVG area
              const svgEl = scrollRef.current;
              if (svgEl) svgEl.scrollTop = (e.target as HTMLElement).scrollTop;
            }}
          >
            {/* Sticky axis spacer — search input stays pinned at top */}
            <div
              className="sticky top-0 z-10 border-b border-rim/40 bg-pit flex items-center px-2 gap-1.5 shrink-0"
              style={{ height: AXIS_H }}
            >
              {/* Search input */}
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="filter…"
                aria-label="Filter signals by name"
                className={[
                  "flex-1 min-w-0 h-4 px-1",
                  "font-mono text-[9px] text-pale placeholder:text-dim/40",
                  "bg-surface/60 border border-rim/40 rounded",
                  "focus:outline-none focus:border-phosphor/40 focus:bg-surface",
                  "transition-colors duration-100",
                ].join(" ")}
              />
              {/* Clear button — only when search is active */}
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="font-mono text-[9px] text-dim/60 hover:text-ghost shrink-0"
                  aria-label="Clear signal filter"
                >
                  ×
                </button>
              )}
            </div>

            {displaySignals.map((sig) => (
              <SignalLabel
                key={sig.id}
                sig={sig}
                hoverValue={hoverInfo?.values[sig.id]}
                radix={radixMap[rowKey.get(sig.id)!] ?? defaultRadix(sig.width)}
                onRadixChange={handleRadixChange}
                dimmed={dimmedIds.has(sig.id)}
                rowKey={rowKey.get(sig.id)!}
                onHide={handleHide}
                onMove={handleMove}
              />
            ))}
          </div>

          {/*
           * ── Scrollable SVG chart area ────────────────────────────────────
           *
           * overflow-x-auto: horizontal scroll for traces longer than viewport.
           * overflow-y-auto: vertical scroll when signal count exceeds panel height.
           *   ScrollTop is mirrored to the label column via the onScroll handler.
           * cursor-crosshair: signals that hover interactions are available.
           */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-x-auto overflow-y-auto cursor-crosshair select-none"
            style={{ scrollbarWidth: "thin", scrollbarColor: "#22232d transparent" }}
            onClick={handleClick}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            onScroll={(e) => {
              // Mirror vertical scroll back to label column
              const labelEl = labelScrollRef.current;
              if (labelEl) labelEl.scrollTop = (e.target as HTMLElement).scrollTop;
            }}
          >
            {/*
             * Guard: don't render SVG until containerWidth is known.
             * Without this, the first render uses the fallback pxPerUnit=4
             * and the trace appears at the wrong scale for one frame.
             */}
            {containerWidth > 0 && (
              <svg
                width={chartW}
                height={svgH}
                style={{ display: "block" }}
              >
                {/* ── Background fills ──────────────────────────────────── */}
                <rect x={0} y={0} width={chartW} height={svgH}  fill="#0d0e11" />
                <rect x={0} y={0} width={chartW} height={AXIS_H} fill="#13141a" />

                {/* ── Mismatch bands (yours ≠ expected) ─────────────────── */}
                {highlights?.map((h, i) => (
                  <rect key={`hl-${i}`} x={h.from * pxPerUnit} y={AXIS_H}
                        width={Math.max((h.to - h.from) * pxPerUnit, 2)} height={svgH - AXIS_H}
                        fill="#ff4f4f" opacity={0.14} />
                ))}
                {highlights?.[0] && (
                  <g>
                    <line x1={highlights[0].from * pxPerUnit} x2={highlights[0].from * pxPerUnit} y1={AXIS_H} y2={svgH}
                          stroke="#ff4f4f" strokeWidth={1.5} strokeDasharray="3 3" />
                    <text x={highlights[0].from * pxPerUnit + 4} y={AXIS_H - 6} fontSize={9} fill="#ff4f4f" fontFamily="monospace">
                      first difference
                    </text>
                  </g>
                )}

                {/* ── Grid infrastructure ───────────────────────────────── */}
                {gridElements.tickLines}
                {gridElements.rowDividers}
                {gridElements.tickLabels}

                {/* ── Signal waveforms ──────────────────────────────────── */}
                {dimmedWaveformElements}

                {/* ── Pinned markers A / B ──────────────────────────────── */}
                {(["a", "b"] as const).map((k) => {
                  const t = markers[k];
                  if (t === null) return null;
                  const x = t * pxPerUnit;
                  return (
                    <g key={`mk-${k}`} pointerEvents="none">
                      <line x1={x} x2={x} y1={2} y2={svgH} stroke={MARKER_COLOR[k]} strokeWidth={1.25} />
                      <text x={x + 3} y={10} fontSize={9} fill={MARKER_COLOR[k]} fontFamily="monospace">
                        {k.toUpperCase()}
                      </text>
                    </g>
                  );
                })}

                {/*
                 * ── Vertical cursor line ──────────────────────────────────
                 *
                 * Initially hidden with visibility:hidden (not display:none).
                 * visibility:hidden keeps the element in the layout tree,
                 * avoiding a forced reflow when it first becomes visible.
                 *
                 * x1/x2 and visibility are set by direct DOM writes in
                 * handleMouseMove — completely bypassing React's render cycle.
                 */}
                <line
                  ref={cursorLineRef}
                  x1={0} y1={0}
                  x2={0} y2={svgH}
                  stroke="#00e87a"
                  strokeWidth={1}
                  strokeDasharray="3 3"
                  opacity={0.55}
                  style={{ visibility: "hidden" }}
                />

                {/*
                 * ── Cursor time label ─────────────────────────────────────
                 *
                 * Floats in the AXIS_H band, just above the first signal row.
                 * text-anchor flips to "end" when near the right edge so the
                 * label doesn't overflow (computed in handleMouseMove).
                 */}
                <text
                  ref={cursorLabelRef}
                  x={0} y={AXIS_H - 8}
                  fontSize={9}
                  fill="#00e87a"
                  fontFamily="monospace"
                  style={{ visibility: "hidden", userSelect: "none" }}
                />
              </svg>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
/** The learner's own signals on the first failing hidden test (from the submit response). */
export function FailingWaveformView({ data }: {
  data: { testcaseId: string | null; waveform: ParsedVcd; mismatches?: { from: number; to: number }[] };
}) {
  const test = data.testcaseId ? `failing test ${data.testcaseId}` : "the failing test";
  const diff = data.mismatches;
  return (
    <div className="space-y-1">
      <p className="font-mono text-[9px] text-dim">
        {diff
          ? <>Your design on {test}. Each output is shown twice: &ldquo;yours&rdquo; and &ldquo;expected&rdquo; (a correct design on the same test).{" "}
              {diff.length
                ? <span className="text-danger">Red bands mark where they differ; the first difference is at t={diff[0].from}.</span>
                : "They match on this test, so the failure comes from the test's own checks (such as timing or printed output)."}</>
          : <>Your design on {test}: only signals inside your module are shown.</>}
      </p>
      <div className={`h-64 border rounded overflow-hidden ${diff?.length ? "border-danger/40" : "border-rim/60"}`}>
        <WaveformPanel parsedVcd={data.waveform} highlights={diff} />
      </div>
    </div>
  );
}

/** Shortest input sequence (from reset) where the learner's outputs differ from a correct design. */
export function CounterexampleView({ data }: { data: { cycles: number; waveform: ParsedVcd } }) {
  return (
    <div className="space-y-1">
      <p className="font-mono text-[9px] text-dim">
        Where your design goes wrong: starting from reset, these inputs make your outputs (&ldquo;yours&rdquo;) differ
        from a correct design (&ldquo;expected&rdquo;) after {data.cycles} clock step{data.cycles === 1 ? "" : "s"}.
        It is the shortest such sequence.
      </p>
      <div className="h-64 border border-warn/40 rounded overflow-hidden">
        <WaveformPanel parsedVcd={data.waveform} />
      </div>
    </div>
  );
}
