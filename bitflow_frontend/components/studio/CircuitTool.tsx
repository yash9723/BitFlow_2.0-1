"use client";
/**
 * components/studio/CircuitTool.tsx — /studio/circuit: place gates, flip-flops,
 * switches and LEDs, wire them, and watch them run live (lib/gate-sim.ts via
 * lib/studio/circuit.ts compile()). Exports structural Verilog with a testbench,
 * and hands combinational circuits to the truth-table tool.
 * Loaded client-only (components/studio/loaders.tsx): the draft is in localStorage.
 *
 * Canvas (geometry and edits in lib/studio/circuit-edit.ts): drag a part to move it
 * (and everything selected with it); drag on empty space to box-select; shift-click
 * adds to the selection; drag pin to pin to wire; drag a wire to bend it. Ctrl+wheel
 * zooms, Space+drag or the middle button pans. Keys work while the canvas has focus:
 * undo/redo, copy/cut/paste/duplicate, select all, delete, arrow nudges.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import GeneratedCode from "@/components/studio/GeneratedCode";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { GateSim } from "@/lib/gate-sim";
import {
  type Circuit, type InputEvent, type Note, type Part, type PartKind, type PinRef, type Wire, CIRCUIT_EXAMPLES, INPUT_KINDS,
  compile, defaultEvents, generateTestbench, generateVerilog, inputParts, outputParts, pins, validate,
} from "@/lib/studio/circuit";
import {
  type Clip, type Selection, History, NONE, SNAP, bounds, copy, forward, inRect, isEmpty, merge, move, noteLines, noteSize,
  paste, pinPos, remove, selectAll, size, wirePath,
} from "@/lib/studio/circuit-edit";
import { tableFromNetlist } from "@/lib/studio/logic-min";

const VIEW = { w: 860, h: 520 };
const ZOOM = { min: 0.25, max: 3 };
const uid = (p: string) => `${p}${Math.random().toString(36).slice(2, 8)}`;
const snap = (v: number) => Math.round(v / SNAP) * SNAP;
const CLIP_KEY = "bitflow_circuit_clip";

const LABEL_POOL: Partial<Record<PartKind, string[]>> = {
  switch: ["a", "b", "c", "d", "e", "f", "g", "h"], clock: ["clk", "clk2"], button: ["btn", "rst", "go"],
};
const PREFIX: Record<PartKind, string> = {
  switch: "sw", button: "btn", clock: "clk", const0: "zero", const1: "one", not: "n", and: "g", or: "g", xor: "g",
  nand: "g", nor: "g", xnor: "g", mux2: "m", dff: "q", led: "led", seg7: "seg",
};
function freshLabel(c: Circuit, kind: PartKind): string {
  const used = new Set(c.parts.map((p) => p.label));
  const pooled = LABEL_POOL[kind]?.find((l) => !used.has(l));
  if (pooled) return pooled;
  for (let i = 1; ; i++) if (!used.has(`${PREFIX[kind]}${i}`)) return `${PREFIX[kind]}${i}`;
}

const PALETTE: { kind: PartKind; label: string }[] = [
  { kind: "switch", label: "Switch" }, { kind: "button", label: "Button" }, { kind: "clock", label: "Clock" },
  { kind: "const0", label: "0" }, { kind: "const1", label: "1" },
  { kind: "not", label: "NOT" }, { kind: "and", label: "AND" }, { kind: "or", label: "OR" }, { kind: "xor", label: "XOR" },
  { kind: "nand", label: "NAND" }, { kind: "nor", label: "NOR" }, { kind: "xnor", label: "XNOR" },
  { kind: "mux2", label: "MUX 2:1" }, { kind: "dff", label: "D flip-flop" },
  { kind: "led", label: "LED" }, { kind: "seg7", label: "7-segment" },
];

const SHORTCUTS: [string, string][] = [
  ["Ctrl+Z / Ctrl+Shift+Z", "undo / redo"], ["Ctrl+C / X / V", "copy / cut / paste"], ["Ctrl+D", "duplicate"],
  ["Ctrl+A", "select all"], ["Delete", "delete the selection"], ["Arrows (Shift: ×5)", "nudge the selection"],
  ["Shift+click", "add to / remove from the selection"], ["Drag empty space", "box select"], ["Drag a wire", "bend it"],
  ["Ctrl+wheel", "zoom"], ["Space+drag, middle button", "pan"], ["Esc", "clear the selection"],
];

function valid(c: Circuit | null): c is Circuit {
  return !!c && Array.isArray(c.parts) && Array.isArray(c.wires) && typeof c.module === "string" && (c.notes === undefined || Array.isArray(c.notes));
}

const EMPTY: Circuit = { module: "my_circuit", parts: [], wires: [], notes: [] };

/** The clipboard: kept in localStorage too, so it works across tabs and reloads. */
let clipboard: Clip | null = null;
function readClip(): Clip | null {
  if (clipboard) return clipboard;
  try { const raw = localStorage.getItem(CLIP_KEY); return raw ? (JSON.parse(raw) as Clip) : null; } catch { return null; }
}
function writeClip(clip: Clip) {
  clipboard = clip;
  try { localStorage.setItem(CLIP_KEY, JSON.stringify(clip)); } catch { /* in-memory copy still works */ }
}

// ── Tool ──────────────────────────────────────────────────────────────────────

type Live = { sim: GateSim; netOf: ReturnType<typeof compile>["netOf"] } | null;
type View = { x: number; y: number; z: number };

export default function CircuitTool() {
  const router = useRouter();
  const [stored, setStored] = useLocalStorage<Circuit>("bitflow_studio_circuit", CIRCUIT_EXAMPLES[0].circuit);
  const c = valid(stored) ? stored : CIRCUIT_EXAMPLES[0].circuit;
  const [sel, setSel] = useState<Selection>(NONE);
  const [view, setView] = useState<View>({ x: 0, y: 0, z: 1 });
  const [help, setHelp] = useState(false);

  // Undo history: every edit goes through edit(), which records the state before it
  const cRef = useRef(c);
  cRef.current = c;
  const hist = useRef(new History());
  const [, setHistTick] = useState(0);
  const edit = useCallback((next: Circuit, group = "") => {
    hist.current.push(cRef.current, group);
    setStored(next);
    setHistTick((t) => t + 1);
  }, [setStored]);
  const undo = useCallback(() => {
    const prev = hist.current.undo(cRef.current);
    if (prev) { setStored(prev); setSel(NONE); setHistTick((t) => t + 1); }
  }, [setStored]);
  const redo = useCallback(() => {
    const next = hist.current.redo(cRef.current);
    if (next) { setStored(next); setSel(NONE); setHistTick((t) => t + 1); }
  }, [setStored]);

  // Positions, bends and notes don't change the logic, so editing them doesn't rebuild the simulation or the checks
  const logicKey = JSON.stringify({
    m: c.module, p: c.parts.map((p) => ({ id: p.id, kind: p.kind, label: p.label, n: p.n, reset: p.reset })),
    w: c.wires.map((w) => [w.id, w.from, w.to]),
  });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const issues = useMemo(() => validate(c), [logicKey]);
  const ok = !issues.some((i) => i.level === "error");

  // Live simulation: rebuilt when the logic changes; inputs keep their values, flip-flops restart at 0
  const simRef = useRef<Live>(null);
  const inputsRef = useRef<Record<string, number>>({});
  const [recorded, setRecorded] = useState<InputEvent[]>([]);
  const [, setTick] = useState(0);
  const redraw = () => setTick((t) => t + 1);
  useEffect(() => {
    if (!ok) { simRef.current = null; redraw(); return; }
    const { net, netOf } = compile(c);
    const sim = new GateSim(net);
    for (const p of inputParts(c)) {
      const v = inputsRef.current[p.label] ?? 0;
      inputsRef.current[p.label] = v;
      if (v) sim.set(p.label, [v]);
    }
    simRef.current = { sim, netOf };
    setRecorded([]);                                  // the recording starts from this power-up
    redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logicKey, ok]);

  const drive = useCallback((label: string, v: number) => {
    const s = simRef.current;
    if (!s || inputsRef.current[label] === v) return;
    inputsRef.current[label] = v;
    s.sim.set(label, [v]);
    setRecorded((r) => [...r, { port: label, value: v }]);
    redraw();
  }, []);
  const pulse = useCallback((labels: string[]) => {
    for (const l of labels) drive(l, 1);
    for (const l of labels) drive(l, 0);
  }, [drive]);
  const powerUp = () => {
    for (const p of inputParts(c)) inputsRef.current[p.label] = 0;
    if (ok) { const { net, netOf } = compile(c); simRef.current = { sim: new GateSim(net), netOf }; }
    setRecorded([]);
    redraw();
  };

  // Free-running clock
  const [hz, setHz] = useState(0);
  const clocks = c.parts.filter((p) => p.kind === "clock").map((p) => p.label);
  const clockKey = clocks.join(",");
  useEffect(() => {
    if (!hz || !clockKey || !ok) return;
    const t = setInterval(() => pulse(clockKey.split(",")), 1000 / hz);
    return () => clearInterval(t);
  }, [hz, clockKey, ok, pulse]);

  // ── Selection commands ───────────────────────────────────────────────────────
  const pasteCount = useRef(0);
  const deleteSel = useCallback(() => {
    if (isEmpty(sel)) return;
    edit(remove(cRef.current, sel));
    setSel(NONE);
  }, [sel, edit]);
  const copySel = useCallback(() => {
    if (isEmpty(sel)) return false;
    writeClip(copy(cRef.current, sel));
    pasteCount.current = 0;
    return true;
  }, [sel]);
  const pasteClip = useCallback((clip: Clip | null = readClip()) => {
    if (!clip || (!clip.parts.length && !clip.notes.length)) return;
    const k = ++pasteCount.current;
    const { circuit, sel: pasted } = paste(cRef.current, clip, 20 * k, 20 * k, uid);
    edit(circuit);
    setSel(pasted);
  }, [edit]);
  const duplicate = useCallback(() => {
    if (isEmpty(sel)) return;
    pasteCount.current = 0;
    pasteClip(copy(cRef.current, sel));
  }, [sel, pasteClip]);
  const nudge = useCallback((dx: number, dy: number) => {
    if (!sel.parts.length && !sel.notes.length) return;
    edit(move(cRef.current, sel, dx, dy), "nudge");
  }, [sel, edit]);

  const onKey = (e: React.KeyboardEvent) => {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    let handled = true;
    if (mod && k === "z") (e.shiftKey ? redo : undo)();
    else if (mod && k === "y") redo();
    else if (mod && k === "c") handled = copySel();
    else if (mod && k === "x") { if (copySel()) deleteSel(); }
    else if (mod && k === "v") pasteClip();
    else if (mod && k === "d") duplicate();
    else if (mod && k === "a") setSel(selectAll(cRef.current));
    else if (k === "delete" || k === "backspace") deleteSel();
    else if (k === "escape") { setSel(NONE); setHelp(false); }
    else if (k === "?") setHelp((h) => !h);
    else if (k.startsWith("arrow")) {
      const d = e.shiftKey ? 5 * SNAP : SNAP;
      nudge(k === "arrowleft" ? -d : k === "arrowright" ? d : 0, k === "arrowup" ? -d : k === "arrowdown" ? d : 0);
    } else handled = false;
    if (handled) e.preventDefault();
  };

  // ── Adding things ────────────────────────────────────────────────────────────
  const visibleCentre = () => ({ x: view.x + VIEW.w / view.z / 2, y: view.y + VIEW.h / view.z / 2 });
  const addPart = (kind: PartKind) => {
    const k = c.parts.length, ctr = visibleCentre();
    const p: Part = {
      id: uid("p"), kind, label: freshLabel(c, kind), x: snap(ctr.x - 60 + (k % 6) * 20), y: snap(ctr.y - 60 + (k % 8) * 20),
      ...(kind === "dff" ? { reset: false } : {}),
    };
    edit({ ...c, parts: [...c.parts, p] });
    setSel({ ...NONE, parts: [p.id] });
  };
  const addNote = () => {
    const ctr = visibleCentre();
    const n: Note = { id: uid("n"), x: snap(ctr.x - 60), y: snap(ctr.y - 20), text: "Note: describe this part of the circuit" };
    edit({ ...c, notes: [...(c.notes ?? []), n] });
    setSel({ ...NONE, notes: [n.id] });
  };
  const fit = useCallback(() => {
    const b = bounds(cRef.current);
    if (!b) { setView({ x: 0, y: 0, z: 1 }); return; }
    const z = Math.max(ZOOM.min, Math.min(1.5, VIEW.w / (b.w + 80), VIEW.h / (b.h + 80)));
    setView({ x: b.x - (VIEW.w / z - b.w) / 2, y: b.y - (VIEW.h / z - b.h) / 2, z });
  }, []);
  const load = (circuit: Circuit) => {
    inputsRef.current = {};
    edit(circuit);
    setSel(NONE);
    setHz(0);
    requestAnimationFrame(fit);
  };
  const zoomBy = (f: number) => setView((v) => {
    const z = Math.max(ZOOM.min, Math.min(ZOOM.max, v.z * f));
    const cx = v.x + VIEW.w / v.z / 2, cy = v.y + VIEW.h / v.z / 2;      // keep the centre still
    return { x: cx - VIEW.w / z / 2, y: cy - VIEW.h / z / 2, z };
  });

  const [tbSource, setTbSource] = useState<"auto" | "mine">("auto");
  const events = tbSource === "mine" && recorded.length ? recorded : null;
  const notesKey = JSON.stringify(c.notes ?? []);
  const code = useMemo(
    () => (ok ? { design: generateVerilog(c), testbench: generateTestbench(c, events ?? defaultEvents(c)) } : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [logicKey, ok, events, notesKey],
  );
  const sequential = c.parts.some((p) => p.kind === "dff");
  const tableable = ok && !sequential && inputParts(c).length > 0 && inputParts(c).length <= 6 && outputParts(c).length > 0;
  const toTable = () => {
    const t = tableFromNetlist(compile(c).net);
    if (typeof t === "string") { window.alert(t); return; }
    try { localStorage.setItem("bitflow_studio_logic", JSON.stringify(t)); } catch { window.alert("Your browser blocked local storage."); return; }
    router.push("/studio/logic");
  };

  const btn = "px-2 py-1 rounded border border-rim/60 text-ghost hover:text-bright font-mono text-[11px] disabled:opacity-40";
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold">Circuit editor</h1>
          <p className="text-[12px] text-ghost max-w-3xl">
            Add parts from the palette, drag them into place, and drag from pin to pin to wire them. Click a switch, button or
            clock to drive it: the circuit runs as you build it, and wires light up when they carry a 1. Press <kbd className="text-pale">?</kbd> on
            the canvas for shortcuts.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
          <span className="text-dim">Examples:</span>
          {CIRCUIT_EXAMPLES.map((e) => <button key={e.label} onClick={() => load(e.circuit)} className={btn}>{e.label}</button>)}
          <button onClick={() => load(EMPTY)} className="px-2 py-1 rounded border border-dashed border-rim text-ghost hover:text-bright"
                  title="Start an empty circuit (Ctrl+Z brings the old one back)">New</button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
        <label className="flex items-center gap-2 text-dim">module
          <input value={c.module} onChange={(e) => edit({ ...c, module: e.target.value.trim() }, "module")} aria-label="Module name"
                 className="w-36 bg-pit border border-rim/60 rounded px-2 py-1 text-[12px] text-pale" />
        </label>
        <span className="text-rim">|</span>
        <button className={btn} onClick={undo} disabled={!hist.current.canUndo} title="Undo (Ctrl+Z)">↶ Undo</button>
        <button className={btn} onClick={redo} disabled={!hist.current.canRedo} title="Redo (Ctrl+Shift+Z)">↷ Redo</button>
        <span className="text-rim">|</span>
        <button className={btn} onClick={() => zoomBy(1 / 1.25)} aria-label="Zoom out">−</button>
        <span className="text-dim w-10 text-center">{Math.round(view.z * 100)}%</span>
        <button className={btn} onClick={() => zoomBy(1.25)} aria-label="Zoom in">+</button>
        <button className={btn} onClick={fit} title="Zoom to fit the whole circuit">Fit</button>
        <span className="text-rim">|</span>
        <button className={btn} disabled={!clocks.length || !ok} onClick={() => pulse(clocks)} title="One rising and falling edge on every clock">Step clock</button>
        <label className="flex items-center gap-1 text-dim">run
          <select value={hz} onChange={(e) => setHz(Number(e.target.value))} disabled={!clocks.length || !ok} aria-label="Clock speed"
                  className="bg-pit border border-rim/60 rounded px-1 py-0.5 text-[12px] text-pale">
            {[0, 1, 2, 5, 10, 50].map((h) => <option key={h} value={h}>{h ? `${h} Hz` : "stopped"}</option>)}
          </select>
        </label>
        <button className={btn} onClick={powerUp} title="All inputs to 0, flip-flops to 0, recording cleared">Power up again</button>
        {tableable && <button className={btn} onClick={toTable} title="Open this circuit's truth table and K-map">Truth table →</button>}
      </div>

      <div className="grid gap-5 xl:grid-cols-[150px_minmax(0,1fr)_280px]">
        <div className="flex xl:flex-col flex-wrap gap-1.5 font-mono text-[11px]">
          {PALETTE.map((p) => (
            <button key={p.kind} onClick={() => addPart(p.kind)} className="px-2 py-1.5 rounded border border-rim/60 text-ghost hover:text-bright hover:border-phosphor/50 text-left">
              + {p.label}
            </button>
          ))}
          <button onClick={addNote} className="px-2 py-1.5 rounded border border-dashed border-warn/40 text-ghost hover:text-bright text-left">+ Note</button>
        </div>
        <div className="relative min-w-0">
          <Canvas c={c} edit={edit} sel={sel} setSel={setSel} live={simRef.current} inputs={inputsRef.current} drive={drive} pulse={pulse}
                  view={view} setView={setView} onKey={onKey} />
          {help && (
            <div className="absolute top-2 right-2 z-10 w-72 rounded-lg border border-rim bg-pit/95 p-3 font-mono text-[10px] shadow-xl">
              <div className="flex justify-between mb-1.5"><span className="text-pale uppercase tracking-wider">Shortcuts</span>
                <button className="text-dim hover:text-bright" onClick={() => setHelp(false)}>close</button></div>
              <table><tbody>{SHORTCUTS.map(([k, v]) => <tr key={k}><td className="pr-2 text-info whitespace-nowrap align-top">{k}</td><td className="text-ghost">{v}</td></tr>)}</tbody></table>
            </div>
          )}
        </div>
        <div className="space-y-4 min-w-0">
          <Inspector c={c} edit={edit} sel={sel} onDelete={deleteSel} onDuplicate={duplicate} onHelp={() => setHelp(true)} />
          <Issues issues={issues} onPick={(id) => setSel({ ...NONE, parts: [id] })} />
        </div>
      </div>

      <section className="space-y-3 border-t border-rim/40 pt-5">
        <div className="flex flex-wrap items-center gap-3 font-mono text-[11px]">
          <h2 className="font-display text-[15px] font-semibold">Verilog</h2>
          <span className="text-dim">testbench drives</span>
          <label className="flex items-center gap-1">
            <input type="radio" checked={tbSource === "auto"} onChange={() => setTbSource("auto")} />
            {sequential || inputParts(c).length > 10 ? "a random walk (the clock toggles every other step)" : "every input combination (one change per step)"}
          </label>
          <label className={`flex items-center gap-1 ${recorded.length ? "" : "opacity-50"}`}>
            <input type="radio" disabled={!recorded.length} checked={tbSource === "mine"} onChange={() => setTbSource("mine")} />
            my {recorded.length} input change{recorded.length === 1 ? "" : "s"} since power-up
          </label>
        </div>
        {code ? <GeneratedCode module={c.module} design={code.design} testbench={code.testbench} />
              : <p className="text-[12px] text-dim">Fix the errors above to generate Verilog.</p>}
      </section>
    </div>
  );
}

// ── Canvas ─────────────────────────────────────────────────────────────────────

type Drag =
  | { kind: "move"; group: string; x: number; y: number; base: Circuit; sel: Selection; dx: number; dy: number }
  | { kind: "wire"; from: PinRef; isOutput: boolean; x: number; y: number }
  | { kind: "bend"; group: string; id: string; base: Circuit }
  | { kind: "box"; x1: number; y1: number; x2: number; y2: number; add: boolean; base: Selection }
  | { kind: "pan"; cx: number; cy: number; view: View }
  | null;

function Canvas({ c, edit, sel, setSel, live, inputs, drive, pulse, view, setView, onKey }: {
  c: Circuit; edit: (c: Circuit, group?: string) => void; sel: Selection; setSel: (s: Selection) => void; live: Live;
  inputs: Record<string, number>; drive: (label: string, v: number) => void; pulse: (labels: string[]) => void;
  view: View; setView: (v: View | ((v: View) => View)) => void; onKey: (e: React.KeyboardEvent) => void;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag>(null);
  const space = useRef(false);
  const gesture = useRef(0);
  const vb = { x: view.x, y: view.y, w: VIEW.w / view.z, h: VIEW.h / view.z };

  const toSvg = (e: { clientX: number; clientY: number }) => {
    const ctm = svg.current?.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  };
  const capture = (e: React.PointerEvent) => { try { svg.current?.setPointerCapture(e.pointerId); } catch { /* not an active pointer */ } };
  const focus = () => box.current?.focus({ preventScroll: true });
  const byId = new Map(c.parts.map((p) => [p.id, p]));
  const valueOf = (r: PinRef) => { const n = live?.netOf(r); return live && n !== undefined ? live.sim.net(n) : 0; };
  const has = (list: string[], id: string) => list.includes(id);

  // Ctrl/Cmd+wheel zooms around the pointer (a native listener: React's wheel handlers can't preventDefault)
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height;
      setView((v) => {
        const z = Math.max(ZOOM.min, Math.min(ZOOM.max, v.z * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
        const px = v.x + fx * (VIEW.w / v.z), py = v.y + fy * (VIEW.h / v.z);   // the point under the cursor stays put
        return { x: px - fx * (VIEW.w / z), y: py - fy * (VIEW.h / z), z };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [setView]);

  /** The pin under (x, y), within 9 px. */
  const pinAt = (x: number, y: number): { ref: PinRef; isOutput: boolean } | null => {
    for (const p of c.parts) {
      const { inputs: ins, outputs: outs } = pins(p);
      for (const pin of [...ins, ...outs]) {
        const q = pinPos(p, pin);
        if (Math.hypot(q.x - x, q.y - y) <= 9) return { ref: { part: p.id, pin }, isOutput: outs.includes(pin) };
      }
    }
    return null;
  };

  /** Pointer down on a part or note: select it (shift toggles) and start moving the selection. */
  const startMove = (e: React.PointerEvent, kind: "parts" | "notes", id: string) => {
    e.stopPropagation(); capture(e); focus();
    const one: Selection = { ...NONE, [kind]: [id] };
    if (e.shiftKey) { setSel(merge(sel, one, true)); return; }
    const next = has(sel[kind], id) ? sel : one;
    setSel(next);
    const q = toSvg(e);
    setDrag({ kind: "move", group: `move${++gesture.current}`, x: q.x, y: q.y, base: c, sel: next, dx: 0, dy: 0 });
  };

  const onDown = (e: React.PointerEvent) => {
    focus(); capture(e);
    if (e.button === 1 || space.current) {
      e.preventDefault();
      setDrag({ kind: "pan", cx: e.clientX, cy: e.clientY, view });
      return;
    }
    const q = toSvg(e);
    setDrag({ kind: "box", x1: q.x, y1: q.y, x2: q.x, y2: q.y, add: e.shiftKey, base: sel });
    if (!e.shiftKey) setSel(NONE);
  };

  const onMove = (e: React.PointerEvent) => {
    if (!drag) return;
    if (drag.kind === "pan") {
      const r = svg.current!.getBoundingClientRect();
      const k = VIEW.w / drag.view.z / r.width;
      setView({ ...drag.view, x: drag.view.x - (e.clientX - drag.cx) * k, y: drag.view.y - (e.clientY - drag.cy) * k });
      return;
    }
    const p = toSvg(e);
    if (drag.kind === "move") {
      const dx = snap(p.x - drag.x), dy = snap(p.y - drag.y);
      if (dx === drag.dx && dy === drag.dy) return;
      edit(move(drag.base, drag.sel, dx, dy), drag.group);
      setDrag({ ...drag, dx, dy });
    } else if (drag.kind === "bend") {
      const w = drag.base.wires.find((x) => x.id === drag.id);
      const a = w && drag.base.parts.find((q) => q.id === w.from.part), b = w && drag.base.parts.find((q) => q.id === w.to.part);
      if (!w || !a || !b) return;
      const bend = forward(pinPos(a, w.from.pin), pinPos(b, w.to.pin)) ? snap(p.x) : snap(p.y);
      if (bend !== c.wires.find((x) => x.id === drag.id)?.bend) {
        edit({ ...drag.base, wires: drag.base.wires.map((x) => (x.id === drag.id ? { ...x, bend } : x)) }, drag.group);
      }
    } else if (drag.kind === "box") {
      const next = { ...drag, x2: p.x, y2: p.y };
      setDrag(next);
      const hit = inRect(c, next);
      setSel(drag.add ? merge(drag.base, hit) : hit);
    } else setDrag({ ...drag, x: p.x, y: p.y });
  };

  const onUp = (e: React.PointerEvent) => {
    if (drag?.kind === "wire") {
      const p = toSvg(e);
      const hit = pinAt(p.x, p.y);
      if (hit && hit.isOutput !== drag.isOutput && hit.ref.part !== drag.from.part) {
        const from = drag.isOutput ? drag.from : hit.ref, to = drag.isOutput ? hit.ref : drag.from;
        const w: Wire = { id: uid("w"), from, to };
        edit({ ...c, wires: [...c.wires.filter((x) => !(x.to.part === to.part && x.to.pin === to.pin)), w] });   // one driver per input
        setSel({ ...NONE, wires: [w.id] });
      }
    }
    setDrag(null);
  };

  const pendingFrom = drag?.kind === "wire" ? byId.get(drag.from.part) : undefined;
  const pending = drag?.kind === "wire" && pendingFrom ? pinPos(pendingFrom, drag.from.pin) : null;

  return (
    <div ref={box} tabIndex={0} onKeyDown={onKey}
         onKeyDownCapture={(e) => { if (e.key === " ") { space.current = true; e.preventDefault(); } }}
         onKeyUp={(e) => { if (e.key === " ") space.current = false; }}
         onBlur={() => { space.current = false; }}
         className="border border-rim/60 rounded-xl bg-pit overflow-hidden outline-none focus:border-info/50">
      <svg ref={svg} viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} className="w-full min-w-[640px] h-auto block select-none touch-none" role="application"
           aria-label="Circuit editor" onPointerMove={onMove} onPointerUp={onUp} onPointerDown={onDown}
           onAuxClick={(e) => e.preventDefault()} style={{ cursor: drag?.kind === "pan" ? "grabbing" : undefined }}>
        <defs>
          <pattern id="cgrid" width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="0.8" fill="#1d1f29" /></pattern>
        </defs>
        <rect x={vb.x} y={vb.y} width={vb.w} height={vb.h} fill="url(#cgrid)" />

        {(c.notes ?? []).map((n) => (
          <NoteView key={n.id} n={n} selected={has(sel.notes, n.id)} onDown={(e) => startMove(e, "notes", n.id)} />
        ))}

        {c.wires.map((w, i) => {
          const a = byId.get(w.from.part), b = byId.get(w.to.part);
          if (!a || !b) return null;
          const d = wirePath(pinPos(a, w.from.pin), pinPos(b, w.to.pin), ((i % 5) - 2) * 7, w.bend);
          const on = valueOf(w.from) === 1, selected = has(sel.wires, w.id);
          return (
            <g key={w.id} data-wire={w.id} style={{ cursor: "move" }}
               onPointerDown={(e) => {
                 e.stopPropagation(); capture(e); focus();
                 const one = { ...NONE, wires: [w.id] };
                 if (e.shiftKey) { setSel(merge(sel, one, true)); return; }
                 setSel(one);
                 setDrag({ kind: "bend", group: `bend${++gesture.current}`, id: w.id, base: c });
               }}>
              <path d={d} stroke="transparent" strokeWidth={10} fill="none" />
              <path d={d} stroke={selected ? "#4db8ff" : on ? "#00e87a" : "#4a4d60"} strokeWidth={selected ? 2.5 : 2} fill="none" strokeLinejoin="round" />
            </g>
          );
        })}

        {c.parts.map((p) => (
          <PartView key={p.id} p={p} selected={has(sel.parts, p.id)} valueOf={valueOf}
                    inputValue={inputs[p.label] ?? 0} outputBits={live && (p.kind === "led" || p.kind === "seg7") ? live.sim.get(p.label) : null}
                    onBodyDown={(e) => startMove(e, "parts", p.id)}
                    onPinDown={(e, pin, isOutput) => {
                      e.stopPropagation(); capture(e); focus();
                      const q = toSvg(e);
                      setDrag({ kind: "wire", from: { part: p.id, pin }, isOutput, x: q.x, y: q.y });
                    }}
                    onKnob={(down) => {
                      if (!live) return;
                      if (p.kind === "switch" && down) drive(p.label, (inputs[p.label] ?? 0) ^ 1);
                      if (p.kind === "button") drive(p.label, down ? 1 : 0);
                      if (p.kind === "clock" && down) pulse([p.label]);
                    }} />
        ))}

        {pending && drag?.kind === "wire" && (
          <line x1={pending.x} y1={pending.y} x2={drag.x} y2={drag.y} stroke="#00e87a" strokeDasharray="5 4" strokeWidth={1.5} />
        )}
        {drag?.kind === "box" && (
          <rect x={Math.min(drag.x1, drag.x2)} y={Math.min(drag.y1, drag.y2)} width={Math.abs(drag.x2 - drag.x1)} height={Math.abs(drag.y2 - drag.y1)}
                fill="rgba(77,184,255,0.08)" stroke="#4db8ff" strokeDasharray="4 3" strokeWidth={1 / view.z} />
        )}
        {!c.parts.length && !(c.notes ?? []).length && (
          <text x={vb.x + vb.w / 2} y={vb.y + vb.h / 2} textAnchor="middle" fontSize={14} fill="#4a4d60" fontFamily="monospace">Add parts from the palette</text>
        )}
      </svg>
    </div>
  );
}

function NoteView({ n, selected, onDown }: { n: Note; selected: boolean; onDown: (e: React.PointerEvent) => void }) {
  const { w, h } = noteSize(n);
  return (
    <g data-note={n.id} onPointerDown={onDown} style={{ cursor: "grab" }}>
      <rect x={n.x} y={n.y} width={w} height={h} rx={4} fill="rgba(255,184,77,0.08)" stroke={selected ? "#4db8ff" : "rgba(255,184,77,0.45)"} strokeDasharray={selected ? undefined : "4 3"} />
      {noteLines(n).map((line, i) => (
        <text key={i} x={n.x + 8} y={n.y + 18 + i * 14} fontSize={11} fill="#e8c48a" fontFamily="monospace">{line}</text>
      ))}
    </g>
  );
}

const GATE_SYMBOL: Record<string, string> = { and: "&", or: "≥1", xor: "=1", nand: "&", nor: "≥1", xnor: "=1", not: "1" };

function PartView({ p, selected, valueOf, inputValue, outputBits, onBodyDown, onPinDown, onKnob }: {
  p: Part; selected: boolean; valueOf: (r: PinRef) => number; inputValue: number; outputBits: number[] | null;
  onBodyDown: (e: React.PointerEvent) => void; onPinDown: (e: React.PointerEvent, pin: string, isOutput: boolean) => void;
  onKnob: (down: boolean) => void;
}) {
  const { w, h } = size(p);
  const { inputs, outputs } = pins(p);
  const stroke = selected ? "#4db8ff" : "#5a5e74";
  const outOn = outputs.length ? valueOf({ part: p.id, pin: outputs[0] }) === 1 : false;
  const inverted = ["nand", "nor", "xnor", "not"].includes(p.kind);
  const showPinNames = p.kind === "mux2" || p.kind === "dff" || p.kind === "seg7";

  let body: React.ReactNode;
  if (INPUT_KINDS.includes(p.kind)) {
    const on = p.kind === "clock" ? outOn : inputValue === 1;
    body = (
      <>
        <rect x={p.x} y={p.y} width={w} height={h} rx={6} fill="#13141a" stroke={stroke} />
        <g data-knob={p.label} style={{ cursor: "pointer" }}
           onPointerDown={(e) => { e.stopPropagation(); onKnob(true); }} onPointerUp={(e) => { e.stopPropagation(); onKnob(false); }}
           onPointerLeave={() => { if (p.kind === "button") onKnob(false); }}>
          {p.kind === "switch" && <>
            <rect x={p.x + 8} y={p.y + 10} width={26} height={16} rx={8} fill={on ? "rgba(0,232,122,0.3)" : "#1f2130"} stroke={on ? "#00e87a" : "#3a3d4f"} />
            <circle cx={on ? p.x + 26 : p.x + 16} cy={p.y + 18} r={6} fill={on ? "#00e87a" : "#8b8fa3"} />
          </>}
          {p.kind === "button" && <circle cx={p.x + 20} cy={p.y + 18} r={10} fill={on ? "#00e87a" : "#2a2d3a"} stroke="#8b8fa3" />}
          {p.kind === "clock" && <>
            <rect x={p.x + 6} y={p.y + 8} width={30} height={20} rx={3} fill="#1f2130" stroke={on ? "#00e87a" : "#3a3d4f"} />
            <path d={`M ${p.x + 9} ${p.y + 23} H ${p.x + 15} V ${p.y + 13} H ${p.x + 21} V ${p.y + 23} H ${p.x + 27} V ${p.y + 13} H ${p.x + 33}`} stroke="#8b8fa3" fill="none" />
          </>}
        </g>
      </>
    );
  } else if (p.kind === "const0" || p.kind === "const1") {
    body = <>
      <rect x={p.x} y={p.y} width={w} height={h} rx={6} fill="#13141a" stroke={stroke} />
      <text x={p.x + 24} y={p.y + h / 2 + 5} textAnchor="middle" fontSize={15} fontWeight={700} fontFamily="monospace" fill={p.kind === "const1" ? "#00e87a" : "#8b8fa3"}>{p.kind === "const1" ? "1" : "0"}</text>
    </>;
  } else if (p.kind === "led") {
    const on = outputBits?.[0] === 1;
    body = <>
      <rect x={p.x} y={p.y} width={w} height={h} rx={6} fill="#13141a" stroke={stroke} />
      <circle cx={p.x + 24} cy={p.y + 18} r={11} fill={on ? "#ff5a5a" : "#3a1c1c"} stroke={on ? "#ffb0b0" : "#5a2a2a"}
              style={on ? { filter: "drop-shadow(0 0 6px #ff5a5a)" } : undefined} />
    </>;
  } else if (p.kind === "seg7") {
    const bit = (i: number) => outputBits?.[i] === 1;
    const sx = p.x + 18, sy = p.y + 16, L = 22, T = 5;
    const segs: [number, number, number, number][] = [                 // a..g as rects (x, y, w, h)
      [sx + T, sy, L, T], [sx + L + T, sy + T, T, L], [sx + L + T, sy + L + 2 * T, T, L], [sx + T, sy + 2 * L + 2 * T, L, T],
      [sx, sy + L + 2 * T, T, L], [sx, sy + T, T, L], [sx + T, sy + L + T, L, T],
    ];
    body = <>
      <rect x={p.x} y={p.y} width={w} height={h} rx={6} fill="#0d0e11" stroke={stroke} />
      {segs.map(([x, y, sw, sh], i) => <rect key={i} x={x} y={y} width={sw} height={sh} rx={2} fill={bit(i) ? "#ff5a5a" : "#2a1616"} />)}
    </>;
  } else if (p.kind === "mux2") {
    body = <>
      <path d={`M ${p.x} ${p.y} L ${p.x + w} ${p.y + 14} V ${p.y + h - 14} L ${p.x} ${p.y + h} Z`} fill="#13141a" stroke={stroke} />
      <text x={p.x + w / 2 + 4} y={p.y + h / 2 + 4} textAnchor="middle" fontSize={10} fill="#8b8fa3" fontFamily="monospace">MUX</text>
    </>;
  } else if (p.kind === "dff") {
    const cy = pinPos(p, "clk").y;
    body = <>
      <rect x={p.x} y={p.y} width={w} height={h} rx={4} fill="#13141a" stroke={stroke} />
      <path d={`M ${p.x} ${cy - 5} L ${p.x + 7} ${cy} L ${p.x} ${cy + 5}`} fill="none" stroke="#8b8fa3" />
      <text x={p.x + w - 6} y={p.y + h / 2 + 4} textAnchor="end" fontSize={10} fill="#8b8fa3" fontFamily="monospace">Q</text>
    </>;
  } else {
    body = <>
      <rect x={p.x} y={p.y} width={w - (inverted ? 8 : 0)} height={h} rx={4} fill="#13141a" stroke={stroke} />
      <text x={p.x + (w - 8) / 2} y={p.y + h / 2 + 4} textAnchor="middle" fontSize={12} fontWeight={700} fill="#c8cad6" fontFamily="monospace">{GATE_SYMBOL[p.kind]}</text>
      {inverted && <circle cx={p.x + w - 4} cy={p.y + h / 2} r={4} fill="#13141a" stroke={stroke} />}
    </>;
  }

  return (
    <g data-part={p.label}>
      <g onPointerDown={onBodyDown} style={{ cursor: "grab" }}>{body}</g>
      <text x={p.x + w / 2} y={p.y - 5} textAnchor="middle" fontSize={10} fill={selected ? "#4db8ff" : "#8b8fa3"} fontFamily="monospace">{p.label}</text>
      {inputs.map((pin) => {
        const q = pinPos(p, pin);
        return (
          <g key={pin} data-pin={`${p.label}.${pin}`} onPointerDown={(e) => onPinDown(e, pin, false)} style={{ cursor: "crosshair" }}>
            <circle cx={q.x} cy={q.y} r={8} fill="transparent" />
            <circle cx={q.x} cy={q.y} r={3.5} fill="#0d0e11" stroke="#8b8fa3" />
            {showPinNames && <text x={q.x + 6} y={q.y + 3} fontSize={p.kind === "seg7" ? 7 : 8} fill="#6b6f85" fontFamily="monospace">{pin}</text>}
          </g>
        );
      })}
      {outputs.map((pin) => {
        const q = pinPos(p, pin);
        return (
          <g key={pin} data-pin={`${p.label}.${pin}`} onPointerDown={(e) => onPinDown(e, pin, true)} style={{ cursor: "crosshair" }}>
            <circle cx={q.x} cy={q.y} r={8} fill="transparent" />
            <circle cx={q.x} cy={q.y} r={3.5} fill={outOn ? "#00e87a" : "#0d0e11"} stroke={outOn ? "#00e87a" : "#8b8fa3"} />
          </g>
        );
      })}
    </g>
  );
}

// ── Side panels ────────────────────────────────────────────────────────────────

function Inspector({ c, edit, sel, onDelete, onDuplicate, onHelp }: {
  c: Circuit; edit: (c: Circuit, group?: string) => void; sel: Selection; onDelete: () => void; onDuplicate: () => void; onHelp: () => void;
}) {
  const box = "p-3 rounded-xl border border-rim/60 bg-surface/30 space-y-2 font-mono text-[11px]";
  const field = "w-full bg-pit border border-rim/60 rounded px-2 py-1 text-[12px] text-pale";
  const count = sel.parts.length + sel.wires.length + sel.notes.length;
  const actions = (dup = true) => (
    <span className="flex gap-3">
      {dup && <button onClick={onDuplicate} className="text-dim hover:text-bright" title="Ctrl+D">duplicate</button>}
      <button onClick={onDelete} className="text-dim hover:text-danger" title="Delete">delete</button>
    </span>
  );
  if (!count) {
    return (
      <div className={box}>
        <div className="text-ghost">Nothing selected.</div>
        <ul className="text-dim list-disc pl-4 space-y-1">
          <li>Add parts from the palette; drag a part&apos;s body to move it.</li>
          <li>Drag from an output pin (right) to an input pin (left) to wire them; drag a wire to bend it.</li>
          <li>Drag on empty space to select several parts; Ctrl+C / Ctrl+V copies them.</li>
          <li>Click a switch, button or clock knob to drive it.</li>
        </ul>
        <button onClick={onHelp} className="text-info hover:underline">All keyboard shortcuts (?)</button>
      </div>
    );
  }
  if (count > 1) {
    const many = (n: number, w: string) => (n ? `${n} ${w}${n === 1 ? "" : "s"}` : "");
    return (
      <div className={box}>
        <div className="flex items-center justify-between"><span className="text-ghost uppercase tracking-wider">Selection</span>{actions()}</div>
        <div className="text-pale">{[many(sel.parts.length, "part"), many(sel.wires.length, "wire"), many(sel.notes.length, "note")].filter(Boolean).join(", ")}</div>
        <div className="text-dim">Drag one of them to move them all; arrows nudge; Ctrl+C copies.</div>
      </div>
    );
  }
  if (sel.notes.length) {
    const n = (c.notes ?? []).find((x) => x.id === sel.notes[0]);
    if (!n) return null;
    return (
      <div className={box}>
        <div className="flex items-center justify-between"><span className="text-ghost uppercase tracking-wider">Note</span>{actions()}</div>
        <textarea value={n.text} rows={4} aria-label="Note text" className={field}
                  onChange={(e) => edit({ ...c, notes: (c.notes ?? []).map((x) => (x.id === n.id ? { ...x, text: e.target.value } : x)) }, `note:${n.id}`)} />
        <div className="text-dim">Notes are exported as comments at the top of the Verilog.</div>
      </div>
    );
  }
  if (sel.wires.length) {
    const w = c.wires.find((x) => x.id === sel.wires[0]);
    if (!w) return null;
    const name = (r: PinRef) => `${c.parts.find((p) => p.id === r.part)?.label ?? "?"}.${r.pin}`;
    return (
      <div className={box}>
        <div className="flex items-center justify-between"><span className="text-ghost uppercase tracking-wider">Wire</span>{actions(false)}</div>
        <div className="text-pale">{name(w.from)} → {name(w.to)}</div>
        {w.bend !== undefined && (
          <button className="text-info hover:underline" onClick={() => edit({ ...c, wires: c.wires.map((x) => (x.id === w.id ? { ...x, bend: undefined } : x)) })}>
            Straighten (automatic route)
          </button>
        )}
      </div>
    );
  }
  const p = c.parts.find((x) => x.id === sel.parts[0]);
  if (!p) return null;
  const set = (patch: Partial<Part>, group = "") => {
    const next = { ...p, ...patch };
    const keep = new Set(pins(next).inputs);                       // dropping inputs drops their wires
    edit({ ...c, parts: c.parts.map((x) => (x.id === p.id ? next : x)),
      wires: c.wires.filter((w) => w.to.part !== p.id || keep.has(w.to.pin)) }, group);
  };
  const gate = ["and", "or", "xor", "nand", "nor", "xnor"].includes(p.kind);
  return (
    <div className={box}>
      <div className="flex items-center justify-between"><span className="text-ghost uppercase tracking-wider">{p.kind}</span>{actions()}</div>
      {p.kind !== "const0" && p.kind !== "const1" && (
        <label className="block space-y-1"><span className="text-dim">Label (its Verilog name)</span>
          <input value={p.label} onChange={(e) => set({ label: e.target.value.trim() }, `label:${p.id}`)} aria-label="Label" className={field} />
        </label>
      )}
      {gate && (
        <label className="flex items-center gap-2 text-dim">inputs
          <select value={p.n ?? 2} onChange={(e) => set({ n: Number(e.target.value) })} aria-label="Number of inputs" className="bg-pit border border-rim/60 rounded px-1 text-[12px] text-pale">
            {[2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      )}
      {p.kind === "dff" && (
        <label className="flex items-center gap-2 text-ghost">
          <input type="checkbox" checked={!!p.reset} onChange={(e) => set({ reset: e.target.checked })} /> asynchronous reset input
        </label>
      )}
    </div>
  );
}

function Issues({ issues, onPick }: { issues: ReturnType<typeof validate>; onPick: (id: string) => void }) {
  if (!issues.length) return <p className="font-mono text-[11px] text-phosphor/80">✓ No problems found.</p>;
  return (
    <ul className="space-y-1 font-mono text-[11px] max-h-60 overflow-auto">
      {issues.map((i, k) => (
        <li key={k}>
          <button onClick={() => i.at && onPick(i.at)} disabled={!i.at}
                  className={`text-left ${i.level === "error" ? "text-danger" : "text-warn"} ${i.at ? "hover:underline" : ""}`}>
            {i.level === "error" ? "✗" : "!"} {i.msg}
          </button>
        </li>
      ))}
    </ul>
  );
}
