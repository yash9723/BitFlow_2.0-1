/**
 * components/Editor.tsx — Monaco Editor wrapper
 *
 * Monaco Editor is a browser-only library (it uses Web Workers and the DOM).
 * This component wraps @monaco-editor/react and adds:
 *   • A loading skeleton that matches the panel background.
 *   • Verilog language configuration (syntax highlighting via the 'verilog'
 *     language ID supported by Monaco out of the box).
 *   • The exact dark theme tokens that match the rest of the UI.
 *   • Read-only mode while a simulation is running.
 *
 * Usage:
 *   <Editor
 *     value={code}
 *     onChange={setCode}
 *     language="verilog"
 *     readOnly={isRunning}
 *   />
 *
 * Note: This file does NOT use `dynamic()` itself — the parent (page.tsx)
 * does `dynamic(() => import('./Editor'), { ssr: false })` so that the
 * entire Editor tree is excluded from the server bundle.
 */

"use client";

import { useRef, useCallback, useEffect } from "react";
import MonacoEditor, { OnMount, BeforeMount, loader } from "@monaco-editor/react";
import type { editor as MonacoEditorNS } from "monaco-editor";
import type { Diagnostic } from "@/lib/diagnostics";

// Load Monaco from our own origin (copied into public/ by scripts/copy-monaco.mjs)
// so the editor works without a third-party CDN.
loader.config({
  paths: {
    vs: "/monaco/vs",
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

interface EditorProps {
  /** Current editor content. */
  value: string;
  /** Called whenever the user edits the content. */
  onChange: (value: string) => void;
  /** Monaco language ID. Use "verilog" for .v files, "plaintext" for others. */
  language?: string;
  /** When true, the editor becomes non-editable (during simulation runs). */
  readOnly?: boolean;
  /** Compiler/lint messages to show as squiggles (lib/diagnostics.ts). */
  diagnostics?: Diagnostic[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Custom theme definition
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Define our custom Monaco theme before the editor mounts.
 * Called once via the `beforeMount` prop — Monaco only needs the theme
 * registered once, even if multiple editor instances are on the page.
 *
 * Token colours match the tailwind.config.ts palette so the editors
 * feel visually integrated with the rest of the dark UI.
 */
const defineTheme: BeforeMount = (monaco) => {
  monaco.editor.defineTheme("phosphor-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [
      // Keywords: module, always, initial, begin, end, if, else, …
      { token: "keyword",           foreground: "00e87a", fontStyle: "bold" },
      // Types: reg, wire, integer, parameter …
      { token: "type",              foreground: "4db8ff" },
      // String literals
      { token: "string",            foreground: "ffb84d" },
      // Numbers (binary, hex, decimal in Verilog: 4'b1010, 8'hFF)
      { token: "number",            foreground: "ff9f4d" },
      // Comments
      { token: "comment",           foreground: "4a4d60", fontStyle: "italic" },
      // Preprocessor directives: `timescale, `define
      { token: "keyword.directive", foreground: "b0b3cc", fontStyle: "italic" },
      // Identifiers (module names, signal names)
      { token: "identifier",        foreground: "e8eaf6" },
      // Operators
      { token: "operator",          foreground: "00b05c" },
      // System tasks: $display, $finish, $dumpfile
      { token: "predefined",        foreground: "4db8ff" },
    ],
    colors: {
      // Editor canvas
      "editor.background":              "#0d0e11",
      "editor.foreground":              "#e8eaf6",
      // Current line highlight
      "editor.lineHighlightBackground": "#1a1b2280",
      // Selection
      "editor.selectionBackground":     "#003d2280",
      "editor.inactiveSelectionBackground": "#003d2240",
      // Find match
      "editor.findMatchBackground":     "#00e87a33",
      "editor.findMatchHighlightBackground": "#00e87a1a",
      // Line numbers
      "editorLineNumber.foreground":    "#2e3040",
      "editorLineNumber.activeForeground": "#4a4d60",
      // Cursor
      "editorCursor.foreground":        "#00e87a",
      // Indent guides
      "editorIndentGuide.background":   "#22232d",
      "editorIndentGuide.activeBackground": "#2e3040",
      // Scrollbar
      "scrollbarSlider.background":     "#2e304060",
      "scrollbarSlider.hoverBackground":"#2e304099",
      // Minimap
      "minimap.background":             "#0d0e11",
    },
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// Monaco editor options
// ─────────────────────────────────────────────────────────────────────────────

const EDITOR_OPTIONS: MonacoEditorNS.IStandaloneEditorConstructionOptions = {
  fontSize:             13,
  fontFamily:           "'JetBrains Mono', 'Fira Code', monospace",
  fontLigatures:        true,
  lineHeight:           22,
  letterSpacing:        0.3,
  // Layout
  minimap:              { enabled: false },   // save horizontal space
  scrollBeyondLastLine: false,
  wordWrap:             "off",
  // Editing niceties
  tabSize:              4,
  insertSpaces:         true,
  autoIndent:           "full",
  formatOnPaste:        true,
  // Gutter
  lineNumbers:          "on",
  glyphMargin:          false,
  folding:              true,
  // Padding
  padding:              { top: 12, bottom: 12 },
  // Scrollbar
  scrollbar: {
    verticalScrollbarSize:   6,
    horizontalScrollbarSize: 6,
    useShadows:              false,
  },
  // Rendering
  renderLineHighlight:  "line",
  cursorBlinking:       "smooth",
  cursorStyle:          "line",
  smoothScrolling:      true,
  // Suggest / intellisense
  suggestOnTriggerCharacters: true,
  quickSuggestions:     { other: true, strings: false, comments: false },
};

// ─────────────────────────────────────────────────────────────────────────────
// Loading skeleton
// ─────────────────────────────────────────────────────────────────────────────

function EditorSkeleton() {
  return (
    <div className="w-full h-full bg-pit flex flex-col gap-2 p-4 animate-pulse">
      {/* Simulate blurred code lines */}
      {Array.from({ length: 12 }).map((_, i) => (
        <div
          key={i}
          className="h-[14px] rounded-sm bg-surface"
          style={{ width: `${40 + ((i * 37) % 45)}%`, opacity: 0.6 }}
        />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function Editor({
  value,
  onChange,
  language = "verilog",
  readOnly = false,
  diagnostics,
}: EditorProps) {
  const editorRef = useRef<MonacoEditorNS.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Parameters<OnMount>[1] | null>(null);
  const diagnosticsRef = useRef(diagnostics);
  diagnosticsRef.current = diagnostics;

  /** Show diagnostics as markers; a missing line clamps to the last one. */
  const applyMarkers = useCallback(() => {
    const editor = editorRef.current, monaco = monacoRef.current;
    const model = editor?.getModel();
    if (!monaco || !model) return;
    const lines = model.getLineCount();
    monaco.editor.setModelMarkers(model, "bitflow", (diagnosticsRef.current ?? []).map((d) => {
      const line = Math.min(Math.max(d.line, 1), lines);
      return {
        severity:        d.severity === "error" ? monaco.MarkerSeverity.Error : monaco.MarkerSeverity.Warning,
        message:         d.message,
        startLineNumber: line,
        startColumn:     d.column ?? model.getLineFirstNonWhitespaceColumn(line) ?? 1,
        endLineNumber:   line,
        endColumn:       model.getLineMaxColumn(line),
      };
    }));
  }, []);

  useEffect(applyMarkers, [diagnostics, applyMarkers]);

  /** Store the editor instance so we can call methods on it if needed. */
  const handleMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    // Activate our custom theme immediately after mount
    editor.updateOptions({ theme: "phosphor-dark" });
    applyMarkers();
  }, [applyMarkers]);

  return (
    <MonacoEditor
      height="100%"
      language={language}
      value={value}
      theme="phosphor-dark"
      loading={<EditorSkeleton />}
      beforeMount={defineTheme}
      onMount={handleMount}
      onChange={(val) => onChange(val ?? "")}
      options={{
        ...EDITOR_OPTIONS,
        readOnly,
        // Dim the editor slightly when read-only to signal "busy"
        ...(readOnly && { opacity: "0.7" }),
      }}
    />
  );
}
