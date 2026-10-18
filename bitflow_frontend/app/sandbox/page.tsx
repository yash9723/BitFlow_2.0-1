/**
 * app/page.tsx — BitFlow IDE layout orchestration (v2)
 *
 * ─── What changed from v1 ─────────────────────────────────────────────────────
 *
 *  All child components (Toolbar, Editor, Terminal, WaveformPanel) are
 *  completely unchanged.  useSimulation hook is completely unchanged.
 *  Only this file — the layout shell — was modified.
 *
 *  NEW: Resizable editor / bottom split (vertical)
 *    A VSplitter bar between the editor row and the bottom panels lets the
 *    user drag up/down to balance screen real estate.  The split is stored
 *    as a fraction (editorFrac) so it scales correctly when the window is
 *    resized.  Default: 68% for editors (satisfies "dominate the screen").
 *
 *  NEW: Resizable left / right editor split (horizontal)
 *    An HSplitter bar between design.v and tb.v lets the user pull either
 *    panel wider.  Stored as leftFrac (0..1).  Default: 50/50.
 *
 *  NEW: Drag overlay div
 *    A zero-content fixed div rendered during any active drag.  It sits
 *    above Monaco's iframe at z-50 and carries the correct resize cursor,
 *    preventing the cursor from flickering to `text` as it crosses editors.
 *    useSplitter already sets document.body.style.userSelect="none" for
 *    the same reason.
 *
 *  NEW: ResizeObserver on the main container
 *    Measures the available height below the toolbar.  On window resize the
 *    pixel height of the editor section is recomputed from editorFrac ×
 *    new container height — the fraction stays fixed, the pixels scale.
 *
 *  NEW: Ctrl+Enter / ⌘+Enter → Run simulation
 *    A global keydown listener; the callback ref pattern ensures the handler
 *    always sees the latest `isRunning` and `simulate` values without being
 *    re-registered on every render.
 *
 * ─── Layout diagram ───────────────────────────────────────────────────────────
 *
 *   ┌──────────────────────────────────────────────────────┐
 *   │  Toolbar (48px, fixed)                               │
 *   ├────────────────────────┬─────────────────────────────┤
 *   │                        │                             │
 *   │   design.v  (Monaco)   │   tb.v  (Monaco)            │ editorFrac × containerH
 *   │                        │                             │
 *   │       ◀ leftFrac ▶     │ ◀ 1−leftFrac ▶             │
 *   ├════════════════════════╪═════════════════════════════╡ ← VSplitter (drag ↕)
 *   │          HSplitter (drag ↔) is the vertical bar above│
 *   ├──────────────────────────────────────────────────────┤
 *   │  Terminal (fixed 240px, fills then scrolls)          │ ┐
 *   ├──────────────────────────────────────────────────────┤ │ (1−editorFrac) × containerH
 *   │  WaveformPanel (220px open / 32px collapsed)         │ ┘
 *   └──────────────────────────────────────────────────────┘
 *
 * ─── Files changed ───────────────────────────────────────────────────────────
 *   MODIFIED  app/page.tsx          ← this file
 *   NEW       hooks/useSplitter.ts  ← reusable drag primitive
 *   UNCHANGED hooks/useSimulation.ts
 *   UNCHANGED components/Toolbar.tsx
 *   UNCHANGED components/Editor.tsx
 *   UNCHANGED components/Terminal.tsx
 *   UNCHANGED components/WaveformPanel.tsx
 *   UNCHANGED lib/vcd-parser.ts
 *   UNCHANGED lib/types.ts
 *   UNCHANGED lib/api.ts
 */

"use client";

import {
  useRef,
  useState,
  useEffect,
  useCallback,
}                                     from "react";
import dynamic                        from "next/dynamic";
import Toolbar                        from "@/components/Toolbar";
import Terminal                       from "@/components/Terminal";
import WaveformPanel                  from "@/components/WaveformPanel";
import TemplateMenu                   from "@/components/TemplateMenu";
import AIAssistantPanel               from "@/components/AIAssistantPanel";
import SynthesisPanel                 from "@/components/SynthesisPanel";
import ExportCard                     from "@/components/ExportCard";
import AuthGate                       from "@/components/AuthGate";
import { useSimulation }              from "@/hooks/useSimulation";
import { useSplitter }                from "@/hooks/useSplitter";
import { useLocalStorage }            from "@/hooks/useLocalStorage";
import { exportProjectZip }           from "@/lib/export-zip";
import { exportSnapshotPng }          from "@/lib/export-image";
import { saveSubmission, loadSubmission, submissionAge } from "@/lib/submission-storage";



// ─────────────────────────────────────────────────────────────────────────────
// Monaco — browser-only, excluded from SSR bundle
// ─────────────────────────────────────────────────────────────────────────────

const Editor = dynamic(() => import("@/components/Editor"), {
  ssr:     false,
  loading: () => <div className="w-full h-full bg-pit animate-pulse" />,
});

// ─────────────────────────────────────────────────────────────────────────────
// Layout constants
// ─────────────────────────────────────────────────────────────────────────────

/** Height of the Toolbar component (must match h-toolbar in tailwind.config). */
const TOOLBAR_H         = 48;

/** Pixel thickness of each splitter bar. */
const SPLITTER_V_H      = 6;   // vertical bar (controls editor height)
const SPLITTER_H_W      = 6;   // horizontal bar (controls left editor width)
const SPLITTER_WF_H     = 6;   // vertical bar (controls terminal vs waveform height)

/** Fraction of container height the editor section occupies at default. */
const DEFAULT_EDITOR_FRAC = 0.68;

/** Fraction of container width the left editor occupies at default. */
const DEFAULT_LEFT_FRAC   = 0.50;

/** Guard rails so neither panel can be completely hidden. */
const MIN_EDITOR_FRAC = 0.12;   // editor can shrink to ~12%
const MAX_EDITOR_FRAC = 0.94;   // editor can grow to ~94%
const MIN_LEFT_FRAC   = 0.15;
const MAX_LEFT_FRAC   = 0.85;

/**
 * waveformFrac: fraction of the bottom section that the Terminal occupies.
 * 1 - waveformFrac is the WaveformPanel share.
 * Default 0.55 → Terminal gets ~55%, WaveformPanel gets ~45%.
 */
const DEFAULT_WAVEFORM_FRAC = 0.55;
const MIN_WAVEFORM_FRAC     = 0.15;   // terminal can be squeezed to ~15%
const MAX_WAVEFORM_FRAC     = 0.88;   // waveform can be squeezed to ~12%

// ─────────────────────────────────────────────────────────────────────────────
// Splitter bar components
// Purely presentational — all state/handlers come from useSplitter() above.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * VSplitter — horizontal bar between the editor row and the bottom panels.
 * Drag it up/down to trade screen space between editors and terminal/waveform.
 */
function VSplitter({
  onMouseDown,
  isDragging,
}: {
  onMouseDown: (e: React.MouseEvent) => void;
  isDragging:  boolean;
}) {
  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize editors vs output panels"
      onMouseDown={onMouseDown}
      className="group flex-none flex items-center justify-center transition-colors duration-100 select-none"
      style={{
        height:     SPLITTER_V_H,
        cursor:     "row-resize",
        background: isDragging
          ? "rgba(0,232,122,0.30)"
          : "var(--color-rim, #22232d)",
        // Expand the visual hit-target on hover without affecting layout
        boxShadow: isDragging
          ? "0 0 0 1px rgba(0,232,122,0.40)"
          : undefined,
      }}
    >
      {/* Grip dots — horizontal row */}
      <div className="flex gap-[3px] pointer-events-none">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="rounded-full transition-colors duration-100"
            style={{
              width:      3,
              height:     3,
              background: isDragging
                ? "rgba(0,232,122,0.80)"
                : "rgba(74,77,96,0.50)",
            }}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * HSplitter — vertical bar between the left and right editor panes.
 * Drag it left/right to shift the design.v / tb.v width balance.
 */
function HSplitter({
  onMouseDown,
  isDragging,
}: {
  onMouseDown: (e: React.MouseEvent) => void;
  isDragging:  boolean;
}) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize design.v vs tb.v editor"
      onMouseDown={onMouseDown}
      className="group flex-none flex flex-col items-center justify-center transition-colors duration-100 select-none"
      style={{
        width:      SPLITTER_H_W,
        cursor:     "col-resize",
        background: isDragging
          ? "rgba(0,232,122,0.30)"
          : "var(--color-rim, #22232d)",
        boxShadow: isDragging
          ? "0 0 0 1px rgba(0,232,122,0.40)"
          : undefined,
      }}
    >
      {/* Grip dots — vertical column */}
      <div className="flex flex-col gap-[3px] pointer-events-none">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="rounded-full transition-colors duration-100"
            style={{
              width:      3,
              height:     3,
              background: isDragging
                ? "rgba(0,232,122,0.80)"
                : "rgba(74,77,96,0.50)",
            }}
          />
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EditorTab — label strip above each Monaco pane
// ─────────────────────────────────────────────────────────────────────────────

function EditorTab({
  filename,
  sublabel,
}: {
  filename:  string;
  sublabel:  string;
}) {
  return (
    <div
      className="flex items-center justify-between px-4 shrink-0 bg-surface border-b border-rim select-none"
      style={{ height: 36 }}
    >
      <div className="flex items-center gap-2">
        <svg
          viewBox="0 0 10 12"
          className="text-dim shrink-0"
          fill="currentColor"
          style={{ width: 10, height: 12 }}
        >
          <path d="M1 0h6l3 3v9H1V0zm6 0v3h3" fillRule="evenodd" />
        </svg>
        <span className="font-mono text-[12px] text-pale">{filename}</span>
      </div>
      <span className="font-mono text-[10px] text-dim tracking-wider">
        {sublabel}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function Page() {
  return (
    <AuthGate>
      <SandboxContent />
    </AuthGate>
  );
}

function SandboxContent() {
  // ── Simulation state — hook completely unchanged ──────────────────────────
  const {
    designCode,
    testbenchCode,
    setDesignCode,
    setTestbenchCode,
    runState,
    isRunning,
    result,
    errorMsg,
    parsedVcd,        // ← sourced from hook; VCD is parsed once there, not again here
    simulate,
    clearResult,
  } = useSimulation();

  // ── AI assistant ──────────────────────────────────────────────────────────

  /**
   * isAIOpen: controls the right-side AI panel visibility.
   * Toggled by the toolbar button; persisted to localStorage so the panel
   * remembers its open/closed state across refreshes.
   */
  const [isAIOpen, setIsAIOpen] = useState(false);
  const [synthOpen, setSynthOpen] = useState(false);
  const toggleAI = useCallback(() => setIsAIOpen((v) => !v), []);

  // ── Export state ──────────────────────────────────────────────────────────

  /**
   * isExporting: true while a ZIP or PNG export is in progress.
   * Used to disable export buttons and show a loading state.
   */
  const [isExporting, setIsExporting] = useState(false);

  /**
   * exportCardRef: ref to the off-screen <ExportCard> DOM node.
   * Passed to exportSnapshotPng() — html-to-image reads from this element.
   */
  const exportCardRef = useRef<HTMLDivElement>(null);

  // ── Submission persistence ────────────────────────────────────────────────

  /**
   * lastSubmission: the stored record from localStorage.
   * Loaded once on mount (SSR-safe via loadSubmission guard).
   * Updated whenever a successful simulation completes.
   */
  const [lastSubmission, setLastSubmission] = useState<ReturnType<typeof loadSubmission>>(null);

  // Load stored submission on mount (client-side only)
  useEffect(() => {
    setLastSubmission(loadSubmission());
  }, []);

  /**
   * Save submission whenever a successful simulation completes.
   * "Successful" = HTTP 200 AND status === "success" (iverilog compiled + ran).
   * Compile errors, timeouts, and runtime errors are NOT saved.
   */
  useEffect(() => {
    if (result?.success) {
      const record = {
          designCode,
          testbenchCode,
          timestamp: Date.now(),
          status: result.success?"success":"error",   // add this
       };
      }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]); // only re-run when result changes, not on every keystroke

  // ── Export handlers ───────────────────────────────────────────────────────

  const handleExportZip = useCallback(async () => {
    if (!result || isExporting) return;
    setIsExporting(true);
    try {
      await exportProjectZip({ designCode, testbenchCode, result });
    } catch (err) {
      console.error("[BitFlow] ZIP export failed:", err);
    } finally {
      setIsExporting(false);
    }
  }, [result, designCode, testbenchCode, isExporting]);

  const handleExportImage = useCallback(async () => {
    if (!result || !exportCardRef.current || isExporting) return;
    setIsExporting(true);
    try {
      await exportSnapshotPng(exportCardRef.current);
    } catch (err) {
      console.error("[BitFlow] PNG export failed:", err);
    } finally {
      setIsExporting(false);
    }
  }, [result, isExporting]);

  // ── Layout state ──────────────────────────────────────────────────────────

  /**
   * containerRef: the div immediately below the Toolbar.
   * Its height is the denominator for editorFrac → pixel conversion.
   * Its width is the denominator for leftFrac → pixel conversion.
   */
  const containerRef = useRef<HTMLDivElement>(null);

  /**
   * containerH: live pixel height of the area below the toolbar.
   * Kept in state so editorH recomputes when the window resizes.
   * Initialised to 0; ResizeObserver populates it after mount.
   */
  const [containerH, setContainerH] = useState(0);

  /**
   * editorFrac: fraction [MIN_EDITOR_FRAC … MAX_EDITOR_FRAC] of containerH
   * the editor row occupies.  Persisted as a fraction so window resize
   * preserves the *proportion*, not the raw pixel count.
   */
  const [editorFrac, setEditorFrac] = useLocalStorage<number>("bitflow_editor_frac", DEFAULT_EDITOR_FRAC);

  /**
   * leftFrac: fraction [MIN_LEFT_FRAC … MAX_LEFT_FRAC] of the editor row
   * width that the left (design.v) panel occupies.
   */
  const [leftFrac, setLeftFrac] = useLocalStorage<number>("bitflow_left_frac", DEFAULT_LEFT_FRAC);

  /**
   * waveformFrac: fraction [MIN … MAX] of the bottom section height that the
   * Terminal occupies.  The remainder goes to the WaveformPanel.
   * Only meaningful when parsedVcd is non-null (waveform splitter is visible).
   */
  const [waveformFrac, setWaveformFrac] = useLocalStorage<number>("bitflow_waveform_frac", DEFAULT_WAVEFORM_FRAC);

  // Derived: editor section pixel height.
  // Falls back to percentage string before containerH is known (avoids
  // a layout flash on the first paint before ResizeObserver fires).
  const editorH: number | string =
    containerH > 0
      ? Math.floor((containerH - SPLITTER_V_H) * editorFrac)
      : "68%";

  /**
   * bottomRef / bottomH: measure the bottom section so the waveform splitter
   * can convert dy pixels → fraction correctly.  Separate from containerH
   * because the bottom section height = containerH − editorH − SPLITTER_V_H.
   */
  const bottomRef = useRef<HTMLDivElement>(null);
  const [bottomH, setBottomH] = useState(0);

  /**
   * Derived: terminal and waveform pixel heights within the bottom section.
   * The waveform splitter bar itself (SPLITTER_WF_H) is subtracted so the
   * two panels together exactly fill the bottom section height.
   */
  const terminalH: number | string =
    bottomH > 0
      ? Math.floor((bottomH - SPLITTER_WF_H) * waveformFrac)
      : "55%";
  const waveformH: number | string =
    bottomH > 0
      ? Math.floor((bottomH - SPLITTER_WF_H) * (1 - waveformFrac))
      : "45%";

  // ── ResizeObserver — measure container below toolbar ─────────────────────

  /**
   * Attached once on mount.  Fires immediately with the initial dimensions,
   * then again on every resize.  On resize we keep editorFrac constant
   * so the editor section scales proportionally — no manual adjustment needed.
   *
   * We only need `setContainerH` here because editorH is a derived value
   * (editorFrac × containerH).  leftFrac is purely horizontal and doesn't
   * depend on containerH.
   */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      setContainerH(entries[0].contentRect.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /**
   * bottomH observer — measures the bottom section separately.
   * Re-fires whenever the bottom div resizes (including when editorFrac changes).
   */
  useEffect(() => {
    const el = bottomRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      setBottomH(entries[0].contentRect.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── Splitter drag callbacks ────────────────────────────────────────────────

  /**
   * handleVDelta: called by useSplitter on each mousemove during a vertical
   * drag.  Converts the dy pixel delta to a fraction change relative to the
   * current container height and clamps to allowed range.
   *
   * Using a functional update (setEditorFrac(f => …)) means we always see
   * the latest fraction even during rapid drags where React batches renders.
   */
  const handleVDelta = useCallback((_dx: number, dy: number) => {
    const h = containerRef.current?.clientHeight ?? 0;
    if (h === 0) return;
    const available = h - SPLITTER_V_H;
    setEditorFrac((f) =>
      Math.max(MIN_EDITOR_FRAC, Math.min(MAX_EDITOR_FRAC, f + dy / available)),
    );
  }, []);

  /**
   * handleHDelta: converts dx → fraction change relative to container width.
   * The container width is re-read on each event (not captured at drag-start)
   * so a window resize mid-drag produces correct results.
   */
  const handleHDelta = useCallback((dx: number, _dy: number) => {
    const w = containerRef.current?.clientWidth ?? window.innerWidth;
    if (w === 0) return;
    setLeftFrac((f) =>
      Math.max(MIN_LEFT_FRAC, Math.min(MAX_LEFT_FRAC, f + dx / w)),
    );
  }, []);

  // useSplitter instances — each returns { handleMouseDown, isDragging }
  const vSplitter  = useSplitter({ axis: "y", onDelta: handleVDelta });
  const hSplitter  = useSplitter({ axis: "x", onDelta: handleHDelta });

  /**
   * handleWFDelta: same pattern as handleVDelta but operates on the bottom
   * section height (bottomH) instead of the full containerH.
   * Reads bottomRef.current so it's always current without re-registration.
   */
  const handleWFDelta = useCallback((_dx: number, dy: number) => {
    const h = bottomRef.current?.clientHeight ?? 0;
    if (h === 0) return;
    const available = h - SPLITTER_WF_H;
    setWaveformFrac((f) =>
      Math.max(MIN_WAVEFORM_FRAC, Math.min(MAX_WAVEFORM_FRAC, f + dy / available)),
    );
  }, []);

  const wfSplitter = useSplitter({ axis: "y", onDelta: handleWFDelta });

  // ── Ctrl+Enter / ⌘+Enter → Run simulation ────────────────────────────────

  /**
   * The handler refs pattern:
   *   • The keydown listener is registered once (empty dep array).
   *   • `isRunning` and `simulate` are kept in refs so the handler always
   *     sees current values without being re-registered on every render.
   *
   * Why not just include [isRunning, simulate] in deps?
   *   Adding them to deps re-registers the listener on every simulation
   *   state change, which causes a brief window (between removeEventListener
   *   and addEventListener) where Ctrl+Enter is silently dropped.
   */
  const isRunningRef = useRef(isRunning);
  const simulateRef  = useRef(simulate);
  useEffect(() => { isRunningRef.current = isRunning; }, [isRunning]);
  useEffect(() => { simulateRef.current  = simulate;  }, [simulate]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        if (!isRunningRef.current) simulateRef.current();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []); // registered once, reads latest values via refs

  // ── Any active drag? (used for drag overlay) ──────────────────────────────
  const isDragging   = vSplitter.isDragging || hSplitter.isDragging || wfSplitter.isDragging;
  const dragCursor   = hSplitter.isDragging ? "col-resize" : "row-resize";

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-void scanlines">

      {/* ── Toolbar (48px, fixed) ───────────────────────────────────────── */}
      <Toolbar
        runState={runState}
        result={result}
        onRun={simulate}
        isAIOpen={isAIOpen}
        onAIToggle={toggleAI}
        onSynthesize={() => setSynthOpen(true)}
        onExportZip={result ? handleExportZip : undefined}
        onExportImage={result ? handleExportImage : undefined}
        isExporting={isExporting}
      />

      {/*
       * ── Action bar — sits between toolbar and editors ────────────────────
       *
       * A slim 32px strip that hosts the TemplateMenu.  Separated from the
       * toolbar so the toolbar stays clean (branding + Run only) and editors
       * have a clear top-left anchor.
       *
       * flex-none: never grows/shrinks — not involved in layout calculations.
       */}
      <div className="flex-none flex items-center justify-between px-4 h-8 bg-surface/60 border-b border-rim/60">
        <div className="flex items-center gap-3">
          <TemplateMenu
            currentDesign={designCode}
            currentTestbench={testbenchCode}
            onDesignChange={setDesignCode}
            onTestbenchChange={setTestbenchCode}
            disabled={isRunning}
          />
          {/* Last submission metadata — shown when a prior successful run exists */}
          {lastSubmission && (
            <span
              className="hidden md:flex items-center gap-1.5 font-mono text-[9px] text-dim/70"
              title={`Last saved: ${new Date(lastSubmission.timestamp).toLocaleString()}`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-phosphor/40" />
              Saved {submissionAge(lastSubmission.timestamp)}
            </span>
          )}
        </div>
        <span className="font-mono text-[8px] text-dim/30 select-none hidden md:block">
          Ctrl+Enter to run
        </span>
      </div>

      {/*
       * ── Drag capture overlay ─────────────────────────────────────────────
       *
       * Rendered whenever ANY splitter is being dragged.  Sits at z-50 so
       * it overlays Monaco's iframe and any other interactive children.
       *
       * Purpose:
       *   1. Holds the correct resize cursor (row-resize / col-resize) so
       *      it doesn't flicker to `text` as the cursor moves over the editor.
       *   2. Swallows pointer events during drag — Monaco gets no hover events
       *      while the user is resizing, preventing unwanted text selections.
       *      (useSplitter also sets body.style.userSelect="none" as a belt-
       *      and-suspenders measure.)
       */}
      {isDragging && (
        <div
          className="fixed inset-0 z-50"
          style={{ cursor: dragCursor }}
        />
      )}

      {/*
       * ── Main container (everything below the toolbar) ────────────────────
       *
       * flex-col: stacks editor row, VSplitter, bottom panels vertically.
       * flex-1 + min-h-0: lets it grow into the remaining viewport height
       *   without spilling past the bottom of the screen.
       * overflow-hidden: no page-level scroll — ever.
       */}
      <div
        ref={containerRef}
        className="flex flex-col flex-1 overflow-hidden min-h-0"
      >

        {/*
         * ── Editor row ───────────────────────────────────────────────────────
         *
         * Height = editorH px (derived from editorFrac × containerH).
         * flex-none prevents the flex parent from shrinking/growing this row —
         * its size is 100% controlled by the VSplitter drag.
         *
         * On the very first render before ResizeObserver fires, editorH is
         * the CSS string "68%" which correctly estimates the layout.  After
         * the first ResizeObserver callback (~1 frame later) it switches to
         * a precise pixel value — imperceptible to the user.
         *
         * border-b: visual separation from the VSplitter.
         */}
        <div
          className="flex flex-row flex-none overflow-hidden border-b border-rim"
          style={{ height: editorH }}
        >
          {/*
           * Left editor — design.v
           *
           * width = leftFrac × 100%.  Explicit percentage so the browser
           * computes pixels; the HSplitter to its right then gets flex-none
           * and the right editor gets flex-1 (remaining width).
           *
           * min-w-0: allows the flex item to shrink below its intrinsic size
           *   (without this, Monaco's minimum content size would prevent
           *   the left panel from getting narrower than ~300px).
           * overflow-hidden: clips Monaco's own scrollbars to this panel.
           */}
          <div
            className="flex flex-col overflow-hidden min-w-0"
            style={{ width: `${leftFrac * 100}%` }}
          >
            <EditorTab filename="design.v" sublabel="DUT" />
            <div className="flex-1 min-h-0">
              <Editor
                value={designCode}
                onChange={setDesignCode}
                language="verilog"
                readOnly={isRunning}
              />
            </div>
          </div>

          {/* Horizontal splitter — drag left/right to resize editor panes */}
          <HSplitter
            onMouseDown={hSplitter.handleMouseDown}
            isDragging={hSplitter.isDragging}
          />

          {/*
           * Right editor — tb.v
           *
           * flex-1: takes all remaining width after the left panel and splitter.
           * min-w-0: same as left panel — prevents Monaco overflow.
           */}
          <div className="flex flex-col flex-1 overflow-hidden min-w-0">
            <EditorTab filename="tb.v" sublabel="Testbench" />
            <div className="flex-1 min-h-0">
              <Editor
                value={testbenchCode}
                onChange={setTestbenchCode}
                language="verilog"
                readOnly={isRunning}
              />
            </div>
          </div>
        </div>

        {/* Vertical splitter — drag up/down to resize editor vs bottom panels */}
        <VSplitter
          onMouseDown={vSplitter.handleMouseDown}
          isDragging={vSplitter.isDragging}
        />

        {/*
         * ── Bottom panels ────────────────────────────────────────────────────
         *
         * flex-1 + min-h-0: grows into whatever vertical space the editor row
         *   doesn't occupy.  flex-col stacks Terminal above WaveformPanel.
         * overflow-hidden: no page-level scroll — panels are individually sized.
         *
         * When there is no waveform (parsedVcd is null), Terminal gets the
         * full bottom section height by omitting the waveform splitter and panel.
         * When waveform is present both panels have explicit pixel heights
         * derived from waveformFrac so the WFSplitter drag works correctly.
         */}
        <div
          ref={bottomRef}
          className="flex flex-col flex-1 min-h-0 overflow-hidden"
        >
          {/* ── Terminal ───────────────────────────────────────────────────── */}
          <div
            className="flex-none overflow-hidden"
            style={{
              height: parsedVcd && result ? terminalH : "100%",
            }}
          >
            <Terminal
              runState={runState}
              result={result}
              errorMsg={errorMsg}
              onClear={clearResult}
            />
          </div>

          {/*
           * WaveformPanel + its own splitter — only rendered when VCD is ready.
           * Unmounting on clearResult resets WaveformPanel's internal zoom/scroll
           * so every new simulation auto-fits to viewport width.
           */}
          {parsedVcd && result && (
            <>
              {/* Splitter between Terminal and WaveformPanel */}
              <VSplitter
                onMouseDown={wfSplitter.handleMouseDown}
                isDragging={wfSplitter.isDragging}
              />

              <div
                className="flex-none overflow-hidden"
                style={{ height: waveformH }}
              >
                <WaveformPanel parsedVcd={parsedVcd} result={result} />
              </div>
            </>
          )}
        </div>
      </div>

      {/*
       * ── AI Assistant Panel ───────────────────────────────────────────────
       *
       * Fixed right-side drawer — overlays the IDE without disrupting the
       * splitter layout.  z-40 keeps it above editors, below the drag overlay.
       * State (chat history) lives in useAI inside AIAssistantPanel so it
       * survives open/close cycles.
       */}
      <SynthesisPanel isOpen={synthOpen} onClose={() => setSynthOpen(false)} designCode={designCode} />

      <AIAssistantPanel
        isOpen={isAIOpen}
        onClose={() => setIsAIOpen(false)}
        designCode={designCode}
        testbenchCode={testbenchCode}
        result={result}
        setDesignCode={setDesignCode}
        setTestbenchCode={setTestbenchCode}
      />

      {/*
       * ── Off-screen ExportCard ────────────────────────────────────────────
       *
       * Always mounted when a result exists so exportCardRef is ready before
       * the user clicks "PNG".  Positioned at left:-9999px so it is fully
       * laid out (html-to-image requires live computed styles) but never visible.
       */}
      {result && (
        <ExportCard
          ref={exportCardRef}
          designCode={designCode}
          testbenchCode={testbenchCode}
          result={result}
          parsedVcd={parsedVcd}
        />
      )}
    </div>
  );
}