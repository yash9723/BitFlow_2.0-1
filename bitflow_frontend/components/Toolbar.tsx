/**
 * components/Toolbar.tsx — Top application bar
 *
 * Contains:
 *   • Branding / logo mark
 *   • Navigation links (Sandbox, Learn, Arena, Academy, Admin)
 *   • "Run Simulation" button (primary action)
 *   • Duration display after a completed run
 *   • Workspace ID (correlates with server logs)
 *   • User profile + logout
 *   • Export buttons
 *
 * The component is purely presentational — all state comes from props.
 * The `onRun` callback is the only action it exposes.
 */

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { RunState, SimulateResponse } from "@/lib/types";
import { useAuth } from "@/hooks/useAuth";

interface ToolbarProps {
  runState:       RunState;
  result:         SimulateResponse | null;
  onRun:          () => void;
  /** Whether the AI panel is currently open */
  isAIOpen:       boolean;
  /** Toggle the AI assistant panel */
  onAIToggle:     () => void;
  /** Opens the Yosys synthesis panel. */
  onSynthesize?:  () => void;
  /** Opens the virtual board (gate-level simulation in the browser). */
  onBoard?:       () => void;
  /** Opens formal verification (assertions proved by a solver). */
  onProve?:       () => void;
  /** Saves the design as a read-only share link (/s/[id]). */
  onShare?:       () => void;
  /** Download project ZIP — only shown when result exists */
  onExportZip?:   () => void;
  /** Export snapshot PNG — only shown when result exists */
  onExportImage?: () => void;
  /** Whether a ZIP/image export is in progress */
  isExporting?:   boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

/** Animated dots shown inside the button while running. */
function RunningIndicator() {
  return (
    <span className="flex items-center gap-[3px]">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1 h-1 rounded-full bg-current animate-pulse_soft"
          style={{ animationDelay: `${i * 0.2}s` }}
        />
      ))}
    </span>
  );
}

/** Chip showing elapsed time after a run. */
function DurationChip({ ms }: { ms: number }) {
  const label = ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`;
  return (
    <span className="font-mono text-[11px] text-ghost px-2 py-0.5 rounded-lg bg-pit/50 backdrop-blur-sm border border-rim/60">
      {label}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Toolbar
// ─────────────────────────────────────────────────────────────────────────────

export default function Toolbar({
  runState,
  result,
  onRun,
  isAIOpen,
  onAIToggle,
  onSynthesize,
  onBoard,
  onProve,
  onShare,
  onExportZip,
  onExportImage,
  isExporting = false,
}: ToolbarProps) {
  const isRunning = runState === "running";
  const pathname  = usePathname();
  const { user, logout } = useAuth();

  return (
    <header className="h-toolbar shrink-0 flex items-center justify-between px-4 bg-void/70 backdrop-blur-xl border-b border-rim/50 z-10">
      {/* ── Left: branding + nav ───────────────────────────────────────── */}
      <div className="flex items-center gap-4">
        {/* BitFlow mark */}
        <div className="flex items-center gap-3">
          <img
            src="/bitflow_logo_64.png"
            alt="BitFlow"
            className="w-7 h-7 object-contain rounded opacity-90"
          />
          <div className="flex flex-col leading-none">
            <span className="font-display text-[13px] font-semibold text-bright tracking-wide">
              BitFlow
            </span>
            <span className="font-mono text-[9px] text-dim tracking-[0.2em] uppercase">
              Sandbox IDE
            </span>
          </div>
        </div>

        {/* ── Nav links ─────────────────────────────────────────────────── */}
        <nav className="hidden sm:flex items-center gap-1">
          {[
            ...(pathname.startsWith("/sandbox") ? [] : [{ href: "/sandbox", label: "Sandbox" }]),
            { href: "/dashboard", label: "Dashboard" },
            { href: "/learn", label: "Learn" },
            { href: "/arena", label: "Arena" },
            { href: "/academy", label: "Academy" },
            { href: "/studio", label: "Studio" },
            { href: "/classes", label: "Classes" },
            { href: "/contests", label: "Contests" },
            ...(user?.role === "ADMIN" ? [{ href: "/admin", label: "Admin" }] : []),
          ].map(({ href, label }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={[
                  "px-2.5 py-1 rounded-lg font-mono text-[11px] tracking-wide transition-colors duration-100",
                  active
                    ? "bg-phosphor/10 backdrop-blur-sm text-phosphor border border-phosphor/30"
                    : "text-ghost hover:text-pale hover:bg-pit/40",
                ].join(" ")}
              >
                {label}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* ── Right: controls ────────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        {/* Duration from last run */}
        {result && <DurationChip ms={result.duration_ms} />}

        {/* Workspace ID — helps correlate with server logs */}
        {result && (
          <span
            className="hidden lg:block font-mono text-[10px] text-dim"
            title="Workspace ID — matches server log prefix ws=..."
          >
            ws:{result.workspace_id}
          </span>
        )}

        {/* ── Export action buttons (only after a successful run) ─────── */}
        {result && (
          <div className="flex items-center gap-1">
            {/* Snapshot PNG */}
            <button
              onClick={onExportImage}
              disabled={isExporting}
              title="Download snapshot PNG (LinkedIn/Twitter)"
              className={[
                "flex items-center gap-1 px-2 py-1 rounded-lg",
                "font-mono text-[9px] tracking-wider",
                "border backdrop-blur-sm transition-all duration-100 select-none",
                isExporting
                  ? "border-rim text-dim cursor-not-allowed"
                  : "border-rim/60 bg-pit/30 text-dim hover:border-info/40 hover:text-info/80 hover:bg-info/10",
              ].join(" ")}
            >
              <svg viewBox="0 0 10 10" className="w-2 h-2 fill-current">
                <rect x="0" y="0" width="10" height="7" rx="1" />
                <line x1="5" y1="8" x2="5" y2="10" stroke="currentColor" strokeWidth="1.5" />
                <line x1="2" y1="8" x2="8" y2="8" stroke="currentColor" strokeWidth="1.5" />
              </svg>
              <span className="hidden sm:inline">PNG</span>
            </button>

            {/* Project ZIP */}
            <button
              onClick={onExportZip}
              disabled={isExporting}
              title="Download project ZIP (design.v + tb.v + wave.vcd)"
              className={[
                "flex items-center gap-1 px-2 py-1 rounded-lg",
                "font-mono text-[9px] tracking-wider",
                "border backdrop-blur-sm transition-all duration-100 select-none",
                isExporting
                  ? "border-rim text-dim cursor-not-allowed"
                  : "border-rim/60 bg-pit/30 text-dim hover:border-phosphor/40 hover:text-phosphor/70 hover:bg-phosphor/10",
              ].join(" ")}
            >
              <svg viewBox="0 0 10 10" className="w-2 h-2" fill="none" stroke="currentColor" strokeWidth="1.2">
                <path d="M5 1 L5 7 M2 5 L5 7 L8 5" />
                <line x1="1" y1="9" x2="9" y2="9" />
              </svg>
              <span className="hidden sm:inline">ZIP</span>
            </button>
          </div>
        )}

        {/* Divider */}
        <div className="w-px h-4 bg-rim mx-1" />

        {onSynthesize && (
          <button
            onClick={onSynthesize}
            title="Synthesize with Yosys: cells, latches, schematic, FSM diagram"
            className="px-3 py-1.5 rounded-lg font-mono text-[11px] font-semibold tracking-wider border border-rim/60 bg-pit/30 text-ghost hover:border-phosphor/40 hover:text-phosphor/80 transition-all duration-150"
          >
            Synth
          </button>
        )}

        {onBoard && (
          <button
            onClick={onBoard}
            title="Run the design on a virtual board: switches, buttons, LEDs, 7-segment"
            className="px-3 py-1.5 rounded-lg font-mono text-[11px] font-semibold tracking-wider border border-rim/60 bg-pit/30 text-ghost hover:border-phosphor/40 hover:text-phosphor/80 transition-all duration-150"
          >
            Board
          </button>
        )}

        {onProve && (
          <button
            onClick={onProve}
            title="Formal verification: prove your assertions hold for every input, or get a counterexample"
            className="px-3 py-1.5 rounded-lg font-mono text-[11px] font-semibold tracking-wider border border-rim/60 bg-pit/30 text-ghost hover:border-phosphor/40 hover:text-phosphor/80 transition-all duration-150"
          >
            Prove
          </button>
        )}

        {onShare && (
          <button
            onClick={onShare}
            title="Copy a read-only link to this design that anyone can open and fork"
            className="px-3 py-1.5 rounded-lg font-mono text-[11px] font-semibold tracking-wider border border-rim/60 bg-pit/30 text-ghost hover:border-phosphor/40 hover:text-phosphor/80 transition-all duration-150"
          >
            Share
          </button>
        )}

        {/* ── AI toggle button ────────────────────────────────────────── */}
        <button
          onClick={onAIToggle}
          title={isAIOpen ? "Close AI assistant" : "Open AI assistant (HDL helper)"}
          aria-label={isAIOpen ? "Close AI assistant" : "Open AI assistant"}
          className={[
            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg",
            "font-mono text-[11px] font-semibold tracking-wider",
            "border backdrop-blur-sm transition-all duration-150 select-none",
            isAIOpen
              ? "border-info/60 bg-info/15 text-info"
              : "border-rim/60 bg-pit/30 text-ghost hover:border-info/40 hover:text-info/70 hover:bg-info/10",
          ].join(" ")}
        >
          {/* Spark icon */}
          <svg viewBox="0 0 10 10" className="w-2.5 h-2.5 fill-current">
            <polygon points="5,0 6,4 10,5 6,6 5,10 4,6 0,5 4,4" />
          </svg>
          AI
        </button>

        {/* Divider */}
        <div className="w-px h-4 bg-rim mx-1" />

        {/* User profile info & logout */}
        {user && (
          <div className="flex items-center gap-2 px-1">
            <span className="text-[10px] text-ghost/85 font-mono">{user.username}</span>
            <span className={`text-[9px] font-mono border px-1.5 py-0.5 rounded-full uppercase tracking-wider ${
              user.role === "ADMIN" 
                ? "border-info/30 bg-info/15 text-info font-bold" 
                : "border-phosphor/30 bg-phosphor/10 text-phosphor"
            }`}>
              {user.role}
            </span>
            <button
              onClick={() => logout()}
              title="Logout session"
              className="px-2 py-0.5 rounded-lg border border-rim/60 bg-pit/30 backdrop-blur-sm text-dim hover:text-danger hover:border-danger/30 text-[9px] font-mono transition-colors"
            >
              Logout
            </button>
          </div>
        )}

        {/* Divider */}
        {user && <div className="w-px h-4 bg-rim mx-1" />}

        {/* Run button */}
        <button
          onClick={onRun}
          disabled={isRunning}
          aria-label={isRunning ? "Simulation running…" : "Run simulation (Ctrl+Enter)"}
          title={isRunning ? undefined : "Run simulation (Ctrl+Enter)"}
          className={[
            "flex items-center gap-2 px-4 py-1.5 rounded-lg",
            "font-mono text-[12px] font-semibold tracking-widest uppercase",
            "border backdrop-blur-sm transition-all duration-150 select-none",
            isRunning
              ? "border-phosphor/30 bg-phosphor/5 text-phosphor/60 cursor-not-allowed"
              : [
                  "border-phosphor/60 bg-phosphor/10 text-phosphor",
                  "hover:bg-phosphor/20 hover:border-phosphor",
                  "active:scale-[0.97]",
                  "hover:shadow-[0_0_16px_0_rgba(0,232,122,0.3)]",
                ].join(" "),
          ].join(" ")}
        >
          {isRunning ? (
            <>
              <RunningIndicator />
              <span>Simulating</span>
            </>
          ) : (
            <>
              <svg viewBox="0 0 10 10" className="w-2.5 h-2.5 fill-current">
                <polygon points="1,1 9,5 1,9" />
              </svg>
              <span>Run</span>
            </>
          )}
        </button>
      </div>
    </header>
  );
}