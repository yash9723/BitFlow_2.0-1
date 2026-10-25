/**
 * lib/verilog-monaco.ts — lib/verilog-lang.ts wired into Monaco for Verilog and SystemVerilog:
 * completion (keywords, system tasks, snippets, signals in the current module, modules as a
 * full instantiation), hover, go to definition, the outline and Format Document. The index
 * covers every open Verilog editor plus the project's other files (setVerilogContext).
 * Registered once per Monaco instance by components/Editor.tsx.
 */
import type * as Monaco from "monaco-editor";
import {
  KEYWORDS, SNIPPETS, SYSTEM_TASKS, definitionOf, formatVerilog, hoverFor, indexVerilog, instanceSnippet, moduleAt,
  type SourceFile, type VerilogIndex,
} from "./verilog-lang";

export const VERILOG_LANGUAGES = ["verilog", "systemverilog"];

let context: SourceFile[] = [];
/** Files of the project that aren't open in an editor (the Sandbox's other tabs). */
export const setVerilogContext = (files: SourceFile[]) => { context = files; };

const registered = new WeakSet<object>();

function indexFor(monaco: typeof Monaco, current: Monaco.editor.ITextModel): VerilogIndex {
  const open = monaco.editor.getModels().filter((m) => VERILOG_LANGUAGES.includes(m.getLanguageId()));
  const files: SourceFile[] = open.map((m) => ({ name: m === current ? "this file" : "the other editor", text: m.getValue() }));
  const texts = new Set(files.map((f) => f.text));
  for (const f of context) if (!texts.has(f.text)) files.push(f);   // a file open in an editor counts once
  return indexVerilog(files);
}

export function registerVerilog(monaco: typeof Monaco) {
  if (registered.has(monaco)) return;
  registered.add(monaco);
  const { CompletionItemKind: K, CompletionItemInsertTextRule: R, SymbolKind: S } = monaco.languages;
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
        const signals = index.decls.filter((d) => d.module === inModule && d.file === "this file");
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
        return text ? { range: new monaco.Range(position.lineNumber, w.startColumn, position.lineNumber, w.endColumn), contents: [{ value: text }] } : null;
      },
    });

    monaco.languages.registerDefinitionProvider(lang, {
      provideDefinition(model, position) {
        const w = model.getWordAtPosition(position);
        if (!w) return null;
        const at = definitionOf(indexFor(monaco, model), w.word, moduleAt(model.getValue(), position.lineNumber));
        if (!at || at.file !== "this file") return null;   // other files: the hover says where
        const line = model.getLineContent(at.line);
        const col = Math.max(1, line.search(new RegExp(`\\b${w.word}\\b`)) + 1);
        return { uri: model.uri, range: new monaco.Range(at.line, col, at.line, col + w.word.length) };
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
