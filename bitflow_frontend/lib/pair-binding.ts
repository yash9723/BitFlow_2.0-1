/**
 * lib/pair-binding.ts — keeps one Monaco editor and one Y.Text (pair mode, lib/pair.ts) in step, and draws the
 * partner's cursor and selection. A port of y-monaco's MonacoBinding (MIT, Kevin Jahns) that takes the Monaco
 * the page already loaded (components/Editor.tsx loads it from /monaco/vs): y-monaco imports monaco-editor's ESM
 * build itself, which would bundle a second copy of the editor.
 *
 * Remote cursors get the classes bf-pair-sel-<clientID> and bf-pair-head-<clientID>; components/PairBar.tsx
 * colours them and labels them with the partner's name.
 */
import * as Y from "yjs";
import type * as MonacoNS from "monaco-editor";

type Monaco = typeof MonacoNS;
type Selection = { anchor: unknown; head: unknown };

/** The parts of the Liveblocks (or y-protocols) awareness the binding uses. */
export interface PairAwareness {
  doc: Y.Doc;
  getStates(): Map<number, unknown>;
  setLocalStateField(field: string, value: never): void;
  on(event: "change", f: () => void): void;
  off(event: "change", f: () => void): void;
}

/** Bind; returns the function that unbinds. The editor takes the Y.Text's content. */
export function bindEditor(monaco: Monaco, ytext: Y.Text, editor: MonacoNS.editor.IStandaloneCodeEditor, awareness: PairAwareness | null): () => void {
  const model = editor.getModel();
  const doc = ytext.doc;
  if (!model || !doc) return () => {};
  const origin = {};   // marks transactions this binding made
  let busy = false;
  const mutex = (f: () => void) => { if (busy) return; busy = true; try { f(); } finally { busy = false; } };

  model.setEOL(monaco.editor.EndOfLineSequence.LF);   // offsets in the model and the Y.Text must agree
  if (model.getValue() !== ytext.toString()) mutex(() => model.setValue(ytext.toString()));

  // Keep the local selection where it was across a remote change.
  let saved: { start: Y.RelativePosition; end: Y.RelativePosition; dir: MonacoNS.SelectionDirection } | null = null;
  const beforeTransaction = () => mutex(() => {
    const sel = editor.getSelection();
    saved = sel && {
      start: Y.createRelativePositionFromTypeIndex(ytext, model.getOffsetAt(sel.getStartPosition())),
      end:   Y.createRelativePositionFromTypeIndex(ytext, model.getOffsetAt(sel.getEndPosition())),
      dir:   sel.getDirection(),
    };
  });
  doc.on("beforeAllTransactions", beforeTransaction);

  // Y.Text → editor (the partner typed).
  const onY = (event: Y.YTextEvent) => mutex(() => {
    let index = 0;
    for (const op of event.delta) {
      if (op.retain !== undefined) index += op.retain;
      else if (typeof op.insert === "string") {
        const p = model.getPositionAt(index);
        model.applyEdits([{ range: new monaco.Range(p.lineNumber, p.column, p.lineNumber, p.column), text: op.insert }]);
        index += op.insert.length;
      } else if (op.delete !== undefined) {
        const a = model.getPositionAt(index), b = model.getPositionAt(index + op.delete);
        model.applyEdits([{ range: new monaco.Range(a.lineNumber, a.column, b.lineNumber, b.column), text: "" }]);
      }
    }
    if (saved) {
      const s = Y.createAbsolutePositionFromRelativePosition(saved.start, doc);
      const e = Y.createAbsolutePositionFromRelativePosition(saved.end, doc);
      if (s && e && s.type === ytext && e.type === ytext) {
        const a = model.getPositionAt(s.index), b = model.getPositionAt(e.index);
        editor.setSelection(monaco.Selection.createWithDirection(a.lineNumber, a.column, b.lineNumber, b.column, saved.dir));
      }
      saved = null;
    }
    render();
  });
  ytext.observe(onY);

  // Editor → Y.Text (you typed).
  const changes = model.onDidChangeContent((e) => mutex(() => {
    doc.transact(() => {
      for (const c of [...e.changes].sort((x, y) => y.rangeOffset - x.rangeOffset)) {
        if (c.rangeLength) ytext.delete(c.rangeOffset, c.rangeLength);
        if (c.text) ytext.insert(c.rangeOffset, c.text);
      }
    }, origin);
  }));

  // Cursors: yours into the awareness, the partner's out of it.
  const decorations = editor.createDecorationsCollection();
  function render() {
    if (!awareness) return;
    const ds: MonacoNS.editor.IModelDeltaDecoration[] = [];
    awareness.getStates().forEach((state, clientID) => {
      const sel = (state as { selection?: Selection } | null)?.selection;
      if (clientID === doc!.clientID || !sel) return;
      const a = Y.createAbsolutePositionFromRelativePosition(Y.createRelativePositionFromJSON(sel.anchor), doc!);
      const h = Y.createAbsolutePositionFromRelativePosition(Y.createRelativePositionFromJSON(sel.head), doc!);
      if (!a || !h || a.type !== ytext || h.type !== ytext) return;
      const [from, to] = a.index <= h.index ? [a.index, h.index] : [h.index, a.index];
      const p = model!.getPositionAt(from), q = model!.getPositionAt(to), head = model!.getPositionAt(h.index);
      if (from !== to) ds.push({ range: new monaco.Range(p.lineNumber, p.column, q.lineNumber, q.column), options: { className: `bf-pair-sel bf-pair-sel-${clientID}` } });
      ds.push({
        range: new monaco.Range(head.lineNumber, head.column, head.lineNumber, head.column),
        options: { beforeContentClassName: `bf-pair-head bf-pair-head-${clientID}`, stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges },
      });
    });
    decorations.set(ds);
  }
  const publish = () => {
    const sel = editor.getSelection();
    if (!awareness || !sel || !editor.hasTextFocus()) return;   // two editors on the page: only the focused one speaks
    let anchor = model.getOffsetAt(sel.getStartPosition()), head = model.getOffsetAt(sel.getEndPosition());
    if (sel.getDirection() === monaco.SelectionDirection.RTL) [anchor, head] = [head, anchor];
    awareness.setLocalStateField("selection", {
      anchor: Y.relativePositionToJSON(Y.createRelativePositionFromTypeIndex(ytext, anchor)),
      head:   Y.relativePositionToJSON(Y.createRelativePositionFromTypeIndex(ytext, head)),
    } as never);
  };
  const cursor = editor.onDidChangeCursorSelection(publish);
  const focus = editor.onDidFocusEditorText(publish);
  awareness?.on("change", render);
  render();

  return () => {
    changes.dispose(); cursor.dispose(); focus.dispose();
    ytext.unobserve(onY);
    doc.off("beforeAllTransactions", beforeTransaction);
    awareness?.off("change", render);
    decorations.clear();
  };
}
