/**
 * lib/verilog-monaco.ts — lib/verilog-lang.ts wired into Monaco for Verilog and SystemVerilog:
 * completion (keywords, system tasks, snippets, signals in the current module, modules as a
 * full instantiation), hover, go to definition, find references, rename, signature help on an
 * instance's port list, the outline and Format Document. Registered once per Monaco instance by
 * components/Editor.tsx.
 *
 * Project files: the Sandbox names its files (setVerilogContext). Each gets a Monaco model at
 * file:///<name>, kept in step with the page, so definitions, references and rename work across
 * files; opening another file goes through the page's `open` (it switches tab), and a rename's edits
 * to files that aren't on screen come back through `edit`. Pages that don't name their files
 * (problem pages) get the same features within their open editors.
 */
import type * as Monaco from "monaco-editor";
import {
  KEYWORDS, SNIPPETS, SYSTEM_TASKS, definitionOf, formatVerilog, hoverFor, indexVerilog, instanceAt, instanceSnippet, moduleAt,
  referencesOf, renameProblem, type SourceFile, type VerilogIndex,
} from "./verilog-lang";

export const VERILOG_LANGUAGES = ["verilog", "systemverilog"];

export interface ProjectHandlers {
  /** Show this file (switch tab); the editor that mounts with it reveals the position (takePendingReveal). */
  open?: (name: string) => void;
  /** A file not on screen was changed by a rename. */
  edit?: (name: string, text: string) => void;
}

let context: SourceFile[] = [];
let handlers: ProjectHandlers = {};
let monacoRef: typeof Monaco | null = null;
let syncing = false;
let pendingReveal: { name: string; line: number; column: number } | null = null;
const watched = new WeakSet<object>();

export const uriOf = (name: string) => `file:///${name}`;
const nameOfUri = (uri: Monaco.Uri) => (uri.scheme === "file" ? decodeURIComponent(uri.path.replace(/^\//, "")) : null);
const languageOf = (_name: string) => "systemverilog";   // as the Sandbox's editors: SystemVerilog is a superset

/** The project's Verilog files by name (design.v, other tabs, tb.v). [] when leaving the page. */
export function setVerilogContext(files: SourceFile[], h: ProjectHandlers = {}) {
  context = files;
  handlers = h;
  if (monacoRef) syncModels(monacoRef);
}

/** The cursor's line in the editor showing this project file, or null when it isn't on screen. */
export function cursorLine(name: string): number | null {
  const monaco = monacoRef;
  if (!monaco) return null;
  const uri = monaco.Uri.parse(uriOf(name)).toString();
  return monaco.editor.getEditors().find((e) => e.getModel()?.uri.toString() === uri)?.getPosition()?.lineNumber ?? null;
}

/** Show file:line in the project's editors (switching tab if needed); false if the file isn't in the project. */
export function revealInProject(name: string, line: number, column = 1): boolean {
  const monaco = monacoRef;
  if (!monaco || !context.some((f) => f.name === name)) return false;
  const shown = monaco.editor.getEditors().find((e) => e.getModel()?.uri.toString() === monaco.Uri.parse(uriOf(name)).toString());
  if (shown) {
    shown.setPosition({ lineNumber: line, column });
    shown.revealLineInCenter(line);
    shown.focus();
    return true;
  }
  if (!handlers.open) return false;
  pendingReveal = { name, line, column };
  handlers.open(name);
  return true;
}

/** For an editor mounting with `path`: where a go-to-definition from another file asked to land. */
export function takePendingReveal(path: string): { line: number; column: number } | null {
  if (!pendingReveal || uriOf(pendingReveal.name) !== path) return null;
  const at = pendingReveal;
  pendingReveal = null;
  return { line: at.line, column: at.column };
}

const attached = (monaco: typeof Monaco, model: Monaco.editor.ITextModel) =>
  monaco.editor.getEditors().some((e) => e.getModel() === model);

/** One model per project file; an editor showing the file shares it (Editor's `path`). */
function syncModels(monaco: typeof Monaco) {
  syncing = true;
  try {
    const names = new Set(context.map((f) => f.name));
    for (const f of context) {
      const uri = monaco.Uri.parse(uriOf(f.name));
      let model = monaco.editor.getModel(uri);
      if (!model) model = monaco.editor.createModel(f.text, languageOf(f.name), uri);
      else if (!attached(monaco, model) && model.getValue() !== f.text) model.setValue(f.text);
      if (!watched.has(model)) {
        watched.add(model);
        const m = model;
        m.onDidChangeContent(() => {
          const name = nameOfUri(m.uri);
          if (!syncing && name && !attached(monaco, m)) handlers.edit?.(name, m.getValue());
        });
      }
    }
    for (const m of monaco.editor.getModels()) {
      const name = nameOfUri(m.uri);
      if (name && !names.has(name) && watched.has(m) && !attached(monaco, m)) m.dispose();
    }
  } finally {
    syncing = false;
  }
}

/** The file name a model stands for, or a stand-in for editors of pages that don't name files. */
function nameOf(model: Monaco.editor.ITextModel, current?: Monaco.editor.ITextModel): string {
  const name = nameOfUri(model.uri);
  if (name && context.some((f) => f.name === name)) return name;
  return model === current ? "this file" : "the other editor";
}

function filesFor(monaco: typeof Monaco, current: Monaco.editor.ITextModel): SourceFile[] {
  const files: SourceFile[] = context.map((f) => {
    const m = monaco.editor.getModel(monaco.Uri.parse(uriOf(f.name)));
    return { name: f.name, text: m ? m.getValue() : f.text };       // the model may be ahead of the page by a keystroke
  });
  const named = new Set(files.map((f) => f.name));
  for (const m of monaco.editor.getModels()) {
    if (!VERILOG_LANGUAGES.includes(m.getLanguageId()) || named.has(nameOf(m, current))) continue;
    files.push({ name: nameOf(m, current), text: m.getValue() });
  }
  return files;
}
const indexFor = (monaco: typeof Monaco, current: Monaco.editor.ITextModel): VerilogIndex => indexVerilog(filesFor(monaco, current));

/** The model a file name points at from `current`, if it exists. */
function modelFor(monaco: typeof Monaco, name: string, current: Monaco.editor.ITextModel): Monaco.editor.ITextModel | null {
  if (name === "this file") return current;
  if (name === "the other editor") return monaco.editor.getModels().find((m) => m !== current && VERILOG_LANGUAGES.includes(m.getLanguageId())) ?? null;
  return monaco.editor.getModel(monaco.Uri.parse(uriOf(name)));
}

export function registerVerilog(monaco: typeof Monaco) {
  if (monacoRef === monaco) return;
  monacoRef = monaco;
  syncModels(monaco);
  const { CompletionItemKind: K, CompletionItemInsertTextRule: R, SymbolKind: S } = monaco.languages;
  const wordRange = (position: Monaco.Position, w: Monaco.editor.IWordAtPosition) =>
    new monaco.Range(position.lineNumber, w.startColumn, position.lineNumber, w.endColumn);

  // Go to definition in another project file: switch to its tab (or reveal it if it's on screen).
  monaco.editor.registerEditorOpener({
    openCodeEditor(_source, resource, selection) {
      const name = nameOfUri(resource);
      if (!name || !context.some((f) => f.name === name)) return false;
      const line = selection ? ("startLineNumber" in selection ? selection.startLineNumber : selection.lineNumber) : 1;
      const column = selection ? ("startColumn" in selection ? selection.startColumn : selection.column) : 1;
      const shown = monaco.editor.getEditors().find((e) => e.getModel()?.uri.toString() === resource.toString());
      if (shown) {
        shown.setPosition({ lineNumber: line, column });
        shown.revealLineInCenter(line);
        shown.focus();
        return true;
      }
      if (!handlers.open) return false;
      pendingReveal = { name, line, column };
      handlers.open(name);
      return true;
    },
  });

  for (const lang of VERILOG_LANGUAGES) {

    monaco.languages.registerCompletionItemProvider(lang, {
      triggerCharacters: ["$"],
      provideCompletionItems(model, position) {
        const word = model.getWordUntilPosition(position);
        const before = model.getLineContent(position.lineNumber).slice(0, word.startColumn - 1);
        const dollar = before.endsWith("$");
        const range = new monaco.Range(position.lineNumber, word.startColumn - (dollar ? 1 : 0), position.lineNumber, word.endColumn);
        if (dollar) return { suggestions: SYSTEM_TASKS.map((t) => ({ label: t, kind: K.Function, insertText: t, range })) };

        const index = indexFor(monaco, model);
        const inModule = moduleAt(model.getValue(), position.lineNumber);
        const here = nameOf(model, model);
        const signals = index.decls.filter((d) => d.module === inModule && d.file === here);
        return {
          suggestions: [
            ...signals.map((d) => ({ label: d.name, kind: d.kind.includes("parameter") ? K.Constant : K.Variable, detail: `${d.kind} ${d.range}`.trim(), insertText: d.name, range, sortText: `0${d.name}` })),
            ...index.modules.filter((m) => m.name !== inModule).map((m) => ({
              label: m.name, kind: K.Module, detail: `instantiate ${m.name} (${m.info?.ports.length ?? 0} ports)`,
              insertText: instanceSnippet(m), insertTextRules: R.InsertAsSnippet, range, sortText: `1${m.name}`,
            })),
            ...SNIPPETS.map((s) => ({ label: s.label, kind: K.Snippet, detail: s.detail, insertText: s.body, insertTextRules: R.InsertAsSnippet, range, sortText: `2${s.label}` })),
            ...KEYWORDS.map((k) => ({ label: k, kind: K.Keyword, insertText: k, range, sortText: `3${k}` })),
          ],
        };
      },
    });

    monaco.languages.registerHoverProvider(lang, {
      provideHover(model, position) {
        const w = model.getWordAtPosition(position);
        if (!w) return null;
        const text = hoverFor(indexFor(monaco, model), w.word, moduleAt(model.getValue(), position.lineNumber));
        return text ? { range: wordRange(position, w), contents: [{ value: text }] } : null;
      },
    });

    monaco.languages.registerDefinitionProvider(lang, {
      provideDefinition(model, position) {
        const w = model.getWordAtPosition(position);
        if (!w) return null;
        const at = definitionOf(indexFor(monaco, model), w.word, moduleAt(model.getValue(), position.lineNumber));
        const target = at && modelFor(monaco, at.file, model);
        if (!at || !target) return null;
        const line = target.getLineContent(at.line);
        const col = Math.max(1, line.search(new RegExp(`\\b${w.word}\\b`)) + 1);
        return { uri: target.uri, range: new monaco.Range(at.line, col, at.line, col + w.word.length) };
      },
    });

    monaco.languages.registerReferenceProvider(lang, {
      provideReferences(model, position) {
        const w = model.getWordAtPosition(position);
        if (!w) return [];
        return referencesOf(filesFor(monaco, model), w.word, nameOf(model, model), position.lineNumber).flatMap((l) => {
          const target = modelFor(monaco, l.file, model);
          return target ? [{ uri: target.uri, range: new monaco.Range(l.line, l.column, l.line, l.column + l.length) }] : [];
        });
      },
    });

    monaco.languages.registerRenameProvider(lang, {
      resolveRenameLocation(model, position) {
        const w = model.getWordAtPosition(position);
        if (!w || KEYWORDS.includes(w.word)) return { range: new monaco.Range(1, 1, 1, 1), text: "", rejectReason: "Put the cursor on a module, port or signal name." };
        return { range: wordRange(position, w), text: w.word };
      },
      provideRenameEdits(model, position, newName) {
        const w = model.getWordAtPosition(position);
        const problem = renameProblem(newName);
        if (!w || problem) return { edits: [], rejectReason: problem ?? "Nothing to rename here." };
        const locs = referencesOf(filesFor(monaco, model), w.word, nameOf(model, model), position.lineNumber);
        return {
          edits: locs.flatMap((l) => {
            const target = modelFor(monaco, l.file, model);
            return target ? [{ resource: target.uri, versionId: undefined, textEdit: { range: new monaco.Range(l.line, l.column, l.line, l.column + l.length), text: newName } }] : [];
          }),
        };
      },
    });

    monaco.languages.registerSignatureHelpProvider(lang, {
      signatureHelpTriggerCharacters: ["(", ",", "."],
      signatureHelpRetriggerCharacters: [","],
      provideSignatureHelp(model, position) {
        const before = model.getValueInRange(new monaco.Range(1, 1, position.lineNumber, position.column));
        const hit = instanceAt(indexFor(monaco, model), before);
        if (!hit) return null;
        const ports = hit.module.info!.ports.map((p) => `${p.dir}${p.range ? " " + p.range : ""} ${p.name}`);
        return {
          value: {
            signatures: [{ label: `${hit.module.name} (${ports.join(", ")})`, documentation: `${hit.module.file}, line ${hit.module.line}`, parameters: ports.map((label) => ({ label })) }],
            activeSignature: 0,
            activeParameter: hit.active,
          },
          dispose() {},
        };
      },
    });

    monaco.languages.registerDocumentSymbolProvider(lang, {
      provideDocumentSymbols(model) {
        const index = indexVerilog([{ name: "this file", text: model.getValue() }]);
        const span = (line: number) => new monaco.Range(line, 1, line, model.getLineMaxColumn(line));
        return [
          ...index.modules.map((m) => ({ name: m.name, detail: "module", kind: S.Module, tags: [], range: span(m.line), selectionRange: span(m.line) })),
          ...index.decls.filter((d) => d.module).map((d) => ({ name: d.name, detail: `${d.kind} ${d.range}`.trim(), kind: d.kind.includes("parameter") ? S.Constant : S.Variable, tags: [], range: span(d.line), selectionRange: span(d.line), containerName: d.module! })),
        ];
      },
    });

    monaco.languages.registerDocumentFormattingEditProvider(lang, {
      provideDocumentFormattingEdits(model, options) {
        const formatted = formatVerilog(model.getValue(), options.insertSpaces ? " ".repeat(options.tabSize) : "\t");
        return formatted === model.getValue() ? [] : [{ range: model.getFullModelRange(), text: formatted }];
      },
    });
  }
}
