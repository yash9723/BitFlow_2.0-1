/**
 * components/TemplateMenu.tsx — Verilog template loader dropdown
 *
 * ─── Purpose ─────────────────────────────────────────────────────────────────
 * Lets the user load a pre-written Verilog design + testbench pair into both
 * Monaco editors with a single click.  Sandbox-only feature — NOT connected to
 * any future problem-solving mode.  Loading replaces both editors (appending left
 * two top modules and a stale testbench that no longer compiled); it asks first
 * if either editor holds the user's own code.
 *
 * ─── Architecture ────────────────────────────────────────────────────────────
 * Purely presentational after the initial render.  All state mutations go
 * through the setDesignCode / setTestbenchCode callbacks from useSimulation —
 * this component owns no state of its own beyond the controlled select value.
 *
 * ─── Adding templates ────────────────────────────────────────────────────────
 * Add entries to lib/templates.ts only.  This component has no hardcoded
 * template data.
 */

"use client";

import { useState, useCallback } from "react";
import { TEMPLATES, TEMPLATE_ORDER, type VerilogTemplate } from "@/lib/templates";
import {
  DEFAULT_DESIGN, DEFAULT_DESIGN_VHDL, DEFAULT_TESTBENCH, DEFAULT_TESTBENCH_COCOTB, DEFAULT_TESTBENCH_VHDL,
} from "@/hooks/useSimulation";

/** Code the user hasn't written: empty, a starter, or an unmodified template. */
const PRISTINE = new Set(
  [DEFAULT_DESIGN, DEFAULT_TESTBENCH, DEFAULT_DESIGN_VHDL, DEFAULT_TESTBENCH_VHDL, DEFAULT_TESTBENCH_COCOTB, "",
   ...Object.values(TEMPLATES).flatMap((t) => [t.design, t.testbench])]
    .map((c) => c.trim()),
);

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

interface TemplateMenuProps {
  /** Current content of design.v editor — checked before it is replaced. */
  currentDesign:     string;
  /** Current content of tb.v editor — checked before it is replaced. */
  currentTestbench:  string;
  /** loadProject from useSimulation — fills both editors and switches their languages. */
  onLoad:            (template: VerilogTemplate) => void;
  /** Disable during simulation runs so a template load doesn't race. */
  disabled?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function TemplateMenu({
  currentDesign,
  currentTestbench,
  onLoad,
  disabled = false,
}: TemplateMenuProps) {
  /**
   * selectedKey: the currently displayed option in the <select>.
   * "" = the placeholder "Load template…" option.
   * Resets to "" after loading so the placeholder is shown again —
   * this signals to the user that the template was applied.
   */
  const [selectedKey, setSelectedKey] = useState<string>("");

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const key = e.target.value;
      if (!key) return;

      const template = TEMPLATES[key];
      if (!template) return;

      const edited = !PRISTINE.has(currentDesign.trim()) || !PRISTINE.has(currentTestbench.trim());
      if (edited && !window.confirm(`Replace the code in both editors with "${template.label}"? Your current design and testbench will be lost.`)) {
        e.target.value = "";
        return;
      }
      onLoad(template);

      // Reset to placeholder after a brief tick so the user sees the
      // selection flash before it returns — confirms the load happened.
      setSelectedKey(key);
      setTimeout(() => setSelectedKey(""), 800);
    },
    [currentDesign, currentTestbench, onLoad],
  );

  return (
    <div className="flex items-center gap-1.5">
      {/* Label */}
      <span className="font-mono text-[9px] text-dim tracking-wider uppercase select-none hidden sm:block">
        Template
      </span>

      {/*
       * Native <select> — intentionally kept as a native element.
       * Reason: a custom dropdown adds ~80 lines of positioning/focus
       * management for no gain in this context.  The native select
       * is keyboard-accessible by default and renders correctly on all
       * platforms.  We style it to match the dark theme.
       */}
      <select
        value={selectedKey}
        onChange={handleChange}
        disabled={disabled}
        aria-label="Load a Verilog template into the editors"
        className={[
          "font-mono text-[10px] h-6",
          "bg-surface border border-rim rounded",
          "text-ghost hover:text-pale hover:border-muted",
          "focus:outline-none focus:border-phosphor/50 focus:text-pale",
          "transition-colors duration-100",
          "px-1.5 pr-4 cursor-pointer",
          "disabled:opacity-40 disabled:cursor-not-allowed",
          // The dropdown arrow can't be easily styled cross-browser without
          // extra wrapper divs; the native arrow is acceptable here.
          "appearance-none",
          // Custom chevron via background-image would require an inline style;
          // keeping appearance-none here so the browser renders its own arrow
          // is intentional — we trade visual consistency for simplicity.
        ].join(" ")}
        style={{
          // Reset native appearance completely so Tailwind classes apply
          WebkitAppearance: "none",
          MozAppearance:    "none",
          // Inline dropdown arrow using a data-URI SVG — no external asset needed
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%234a4d60' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E")`,
          backgroundRepeat:   "no-repeat",
          backgroundPosition: "right 6px center",
          paddingRight:       "22px",
        }}
      >
        {/* Placeholder — shown when no template is selected */}
        <option value="" disabled style={{ color: "#4a4d60" }}>
          Load template…
        </option>

        {TEMPLATE_ORDER.map((key) => {
          const t = TEMPLATES[key];
          if (!t) return null;
          return (
            <option
              key={key}
              value={key}
              style={{ backgroundColor: "#13141a", color: "#b0b3cc" }}
            >
              {t.label}
            </option>
          );
        })}
      </select>
    </div>
  );
}