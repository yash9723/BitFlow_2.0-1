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

import { REVEAL_LINE } from "@/lib/trace";
import { useRef, useCallback, useEffect, useState } from "react";
import MonacoEditor, { OnMount, BeforeMount, loader } from "@monaco-editor/react";
import type { editor as MonacoEditorNS } from "monaco-editor";
import type { Diagnostic } from "@/lib/diagnostics";
import type { Text as YText } from "yjs";
import type { PairAwareness } from "@/lib/pair-binding";
import { VERILOG_LANGUAGES, registerVerilog, takePendingReveal } from "@/lib/verilog-monaco";
import { lintInBrowser } from "@/lib/synth/client";
import { mono } from "@/lib/fonts";
import PixelLoader from "@/components/pixel/PixelLoader";

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
  /** Check the Verilog as you type (Yosys in the browser) and show its errors and warnings. Design files only. */
  lint?: boolean;
  /** A project file's model (lib/verilog-monaco.ts uriOf): shared with cross-file definitions, references and rename. */
  path?: string;
  /** Highlight and scroll to the line sent by a REVEAL_LINE event ("Trace the bug", lib/trace.ts). */
  revealLines?: boolean;
  /** Pair mode: keep this editor in step with a shared text, and show the partner's cursor (lib/pair-binding.ts). */
  collabText?: YText | null;
  collabAwareness?: PairAwareness | null;
}

const LINT_DELAY_MS = 1200;
const STYLE_DELAY_MS = 4000;   // Verible style lint runs on the server, so it waits for a longer pause

type StyleIssue = { line: number; col: number; endCol: number | null; rule: string; severity: string; message: string };

// Verible results by language + text: undo, switching files or resetting to the starter code
// shows the earlier result instead of asking the server again. Oldest entries go first.
const STYLE_CACHE_SIZE = 50;
const styleCache = new Map<string, StyleIssue[]>();

/** Server-side Verible (app/api/style). Style issues only: Yosys above already reports syntax errors. */
async function styleIssues(source: string, language: string): Promise<StyleIssue[] | null> {
  const key = `${language}\0${source}`;
  const cached = styleCache.get(key);
  if (cached) return cached;
  const issues = await fetchStyleIssues(source, language);
  if (issues) {
    styleCache.set(key, issues);
    if (styleCache.size > STYLE_CACHE_SIZE) styleCache.delete(styleCache.keys().next().value!);
  }
  return issues;
}

async function fetchStyleIssues(source: string, language: string): Promise<StyleIssue[] | null> {
  try {
    const res = await fetch("/api/style", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "lint", files: [{ name: language === "systemverilog" ? "design.sv" : "design.v", content: source }] }),
    });
    const data = await res.json();
    return data?.ok ? (data.issues as StyleIssue[]).filter((i) => i.severity !== "error") : null;
  } catch { return null; }
}

/** Shift+Alt+F / "Format Document": Verible's formatter, registered once per Verilog language. */
let formatterRegistered = false;
function registerFormatter(monaco: Parameters<BeforeMount>[0]) {
  if (formatterRegistered) return;
  formatterRegistered = true;
  for (const lang of VERILOG_LANGUAGES) {
    monaco.languages.registerDocumentFormattingEditProvider(lang, {
      async provideDocumentFormattingEdits(model) {
        try {
          const res = await fetch("/api/style", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "format", source: model.getValue(), name: lang === "systemverilog" ? "design.sv" : "design.v" }),
          });
          const data = await res.json();
          if (!data?.ok || typeof data.formatted !== "string") {
            monaco.editor.setModelMarkers(model, "bitflow-format", [{
              severity: monaco.MarkerSeverity.Info, message: data?.error ?? "Couldn't format right now.", source: "Format",
              startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: model.getLineMaxColumn(1),
            }]);
            return [];
          }
          monaco.editor.setModelMarkers(model, "bitflow-format", []);
          return [{ range: model.getFullModelRange(), text: data.formatted }];
        } catch { return []; }
      },
    });
  }
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
const VHDL_KEYWORDS = (
  "abs access after alias all and architecture array assert attribute begin block body buffer bus case component " +
  "configuration constant disconnect downto else elsif end entity exit file for function generate generic group " +
  "guarded if impure in inertial inout is label library linkage literal loop map mod nand new next nor not null of " +
  "on open or others out package port postponed procedure process pure range record register reject rem report " +
  "return rol ror select severity signal shared sla sll sra srl subtype then to transport type unaffected units " +
  "until use variable wait when while with xnor xor context force release"
).split(" ");
const VHDL_TYPES = (
  "std_logic std_logic_vector std_ulogic std_ulogic_vector unsigned signed integer natural positive boolean bit " +
  "bit_vector character string time real"
).split(" ");

const defineTheme: BeforeMount = (monaco) => {
  // Monaco ships no VHDL mode: a small Monarch tokenizer (VHDL is case-insensitive).
  if (!monaco.languages.getLanguages().some((l: { id: string }) => l.id === "vhdl")) {
    monaco.languages.register({ id: "vhdl", extensions: [".vhd", ".vhdl"] });
    monaco.languages.setLanguageConfiguration("vhdl", {
      comments: { lineComment: "--" },
      brackets: [["(", ")"]],
      autoClosingPairs: [{ open: "(", close: ")" }, { open: '"', close: '"' }],
    });
    monaco.languages.setMonarchTokensProvider("vhdl", {
      ignoreCase: true,
      keywords: VHDL_KEYWORDS,
      typeKeywords: VHDL_TYPES,
      tokenizer: {
        root: [
          [/--.*$/, "comment"],
          [/[xXoObB]?"[^"]*"/, "string"],
          [/'[01xzuwlhXZUWLH\-]'/, "number"],
          [/\d+(\.\d+)?(e[+-]?\d+)?/, "number"],
          [/[a-zA-Z_]\w*/, { cases: { "@keywords": "keyword", "@typeKeywords": "type", "@default": "identifier" } }],
          [/<=|=>|:=|\/=|>=|[<>=+\-*&|]/, "operator"],
        ],
      },
    });
  }

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
      { token: "comment",           foreground: "80839d", fontStyle: "italic" },
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
  fontFamily:           `${mono.style.fontFamily}, 'Fira Code', monospace`,
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
    <div className="relative w-full h-full bg-pit flex flex-col gap-2 p-4">
      <div className="absolute inset-0 grid place-items-center"><PixelLoader label="Loading the editor…" /></div>
      {/* Simulate blurred code lines */}
      {Array.from({ length: 12 }).map((_, i) => (
        <div
          key={i}
          className="h-[14px] rounded-sm bg-surface"
          style={{ width: `${40 + ((i * 37) % 45)}%`, opacity: 0.25 }}
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
  lint = false,
  path,
  revealLines = false,
  collabText = null,
  collabAwareness = null,
}: EditorProps) {
  const editorRef = useRef<MonacoEditorNS.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Parameters<OnMount>[1] | null>(null);
  const [mounted, setMounted] = useState(false);
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
        startColumn:     d.column ?? (model.getLineFirstNonWhitespaceColumn(line) || 1),   // 0 on an empty line
        endLineNumber:   line,
        endColumn:       model.getLineMaxColumn(line),
      };
    }));
  }, []);

  useEffect(applyMarkers, [diagnostics, applyMarkers]);

  // Live check: Yosys parses the file a moment after typing stops; its messages get their own markers.
  useEffect(() => {
    const monaco = monacoRef.current, model = editorRef.current?.getModel();
    if (!monaco || !model) return;
    if (!lint || !VERILOG_LANGUAGES.includes(language) || !value.trim()) { monaco.editor.setModelMarkers(model, "bitflow-lint", []); return; }
    const t = setTimeout(async () => {
      const messages = await lintInBrowser(value);
      if (!messages || model.isDisposed() || model.getValue() !== value) return;   // stale: the next run will say
      const lines = model.getLineCount();
      monaco.editor.setModelMarkers(model, "bitflow-lint", messages.map((m) => {
        const line = Math.min(Math.max(m.line, 1), lines);
        return {
          severity: m.severity === "error" ? monaco.MarkerSeverity.Error : monaco.MarkerSeverity.Warning,
          message: m.message, source: "Yosys",
          startLineNumber: line, startColumn: model.getLineFirstNonWhitespaceColumn(line) || 1,
          endLineNumber: line, endColumn: model.getLineMaxColumn(line),
        };
      }));
    }, LINT_DELAY_MS);
    return () => clearTimeout(t);
  }, [value, lint, language]);

  // Industry style (Verible): naming, always_comb/always_ff, default cases… shown as blue "info" squiggles.
  useEffect(() => {
    const monaco = monacoRef.current, model = editorRef.current?.getModel();
    if (!monaco || !model) return;
    if (!lint || !VERILOG_LANGUAGES.includes(language) || !value.trim()) { monaco.editor.setModelMarkers(model, "bitflow-style", []); return; }
    const t = setTimeout(async () => {
      const issues = await styleIssues(value, language);
      if (!issues || model.isDisposed() || model.getValue() !== value) return;
      const lines = model.getLineCount();
      monaco.editor.setModelMarkers(model, "bitflow-style", issues.map((i) => {
        const line = Math.min(Math.max(i.line, 1), lines);
        return {
          severity: monaco.MarkerSeverity.Info, message: `${i.message} [${i.rule}]`, source: "Verible style",
          startLineNumber: line, startColumn: Math.max(i.col, 1),
          endLineNumber: line, endColumn: i.endCol ? i.endCol + 1 : model.getLineMaxColumn(line),
        };
      }));
    }, styleCache.has(`${language}\0${value}`) ? 0 : STYLE_DELAY_MS); // a known result shows at once
    return () => clearTimeout(t);
  }, [value, lint, language]);

  // "Trace the bug": mark the line it points at until the next one (or until the editor goes).
  useEffect(() => {
    if (!revealLines) return;
    let marked: MonacoEditorNS.IEditorDecorationsCollection | null = null;
    const reveal = (e: Event) => {
      const editor = editorRef.current, monaco = monacoRef.current, model = editor?.getModel();
      if (!editor || !monaco || !model) return;
      const line = Math.min(Math.max((e as CustomEvent<number>).detail, 1), model.getLineCount());
      marked?.clear();
      marked = editor.createDecorationsCollection([{
        range: new monaco.Range(line, 1, line, 1),
        options: { isWholeLine: true, className: "bf-trace-line", linesDecorationsClassName: "bf-trace-gutter" },
      }]);
      editor.revealLineInCenter(line);
      editor.setPosition({ lineNumber: line, column: model.getLineFirstNonWhitespaceColumn(line) || 1 });
    };
    window.addEventListener(REVEAL_LINE, reveal);
    return () => { window.removeEventListener(REVEAL_LINE, reveal); marked?.clear(); };
  }, [revealLines]);

  // Pair mode: bound while there's a shared text; loaded only then.
  useEffect(() => {
    const editor = editorRef.current, monaco = monacoRef.current;
    if (!collabText || !editor || !monaco) return;
    let unbind: (() => void) | null = null, gone = false;
    import("@/lib/pair-binding").then(({ bindEditor }) => { if (!gone) unbind = bindEditor(monaco as never, collabText, editor, collabAwareness); });
    return () => { gone = true; unbind?.(); };
  }, [collabText, collabAwareness, mounted]);

  /** Store the editor instance so we can call methods on it if needed. */
  const handleMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    setMounted(true);
    // Activate our custom theme immediately after mount
    editor.updateOptions({ theme: "phosphor-dark" });
    applyMarkers();
    // With two editors on a page (Sandbox: design + testbench) they share one keybinding service, and the rename
    // box's Enter can land on the wrong editor and do nothing. Send these keys to the editor that has the focus.
    const K = monaco.KeyCode, M = monaco.KeyMod;
    const focused = () => monaco.editor.getEditors().find((e) => e.hasWidgetFocus()) ?? editor;
    editor.addCommand(K.Enter, () => focused().trigger("keyboard", "acceptRenameInput", {}), "renameInputVisible");
    editor.addCommand(M.Shift | K.Enter, () => focused().trigger("keyboard", "acceptRenameInputWithPreview", {}), "renameInputVisible");
    editor.addCommand(K.Escape, () => focused().trigger("keyboard", "cancelRenameInput", {}), "renameInputVisible");
    // Opened by a go-to-definition from another file: land on the definition.
    const at = path ? takePendingReveal(path) : null;
    if (at) {
      editor.setPosition({ lineNumber: at.line, column: at.column });
      editor.revealLineInCenter(at.line);
      editor.focus();
    }
  }, [applyMarkers, path]);

  const canFormat = VERILOG_LANGUAGES.includes(language) && !readOnly;
  return (
    <div className="relative h-full">
      <MonacoEditor
        height="100%"
        language={language}
        value={value}
        theme="phosphor-dark"
        loading={<EditorSkeleton />}
        beforeMount={(monaco) => { defineTheme(monaco); registerVerilog(monaco); registerFormatter(monaco); }}
        onMount={handleMount}
        {...(path ? { path, keepCurrentModel: true } : {})}
        onChange={(val) => onChange(val ?? "")}
        options={{
          ...EDITOR_OPTIONS,
          readOnly,
          // Dim the editor slightly when read-only to signal "busy"
          ...(readOnly && { opacity: "0.7" }),
        }}
      />
      {canFormat && (
        <button
          type="button"
          onClick={() => editorRef.current?.getAction("editor.action.formatDocument")?.run()}
          title="Format with Verible (Shift+Alt+F)"
          className="absolute top-2 right-4 z-10 px-2 py-0.5 rounded border border-rim bg-pit/90 text-[10px] font-mono text-ghost hover:text-phosphor hover:border-phosphor/50 transition-colors"
        >
          Format
        </button>
      )}
    </div>
  );
}
