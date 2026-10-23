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
 *
 * Blocks (subcircuits): Ctrl+G turns the selection into a block (a Verilog module of its
 * own) whose pins are the wires crossing the selection. Double-click an instance to open its
 * definition; edits apply to every instance. The library lives on the top circuit (blocks).
 * Import Verilog synthesizes a module in the browser and draws it (lib/studio/circuit-import.ts).
 */

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import GeneratedCode from "@/components/studio/GeneratedCode";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { GateSim, toNumber } from "@/lib/gate-sim";
import {
  type Circuit, type InputEvent, type Library, type Note, type Part, type PartKind, type PinRef, type Wire, CIRCUIT_EXAMPLES, INPUT_KINDS,
  MAX_WIDTH, MAX_EXHAUSTIVE_INPUTS, blockPorts, compile, constValue, defaultEvents, generateTestbench, generateVerilog, hasState, inputParts,
  outputParts, pinWidth, pins, portWidth, toBits, validate, width,
} from "@/lib/studio/circuit";
import {
  type Clip, type Selection, History, NONE, SNAP, blockNameIssue, bounds, copy, forward, inRect, isEmpty, makeBlock, merge, move, nextLabel,
  noteLines, noteSize, paste, pinPos, remove, renameBlock, selectAll, size, usesBlock, wirePath, wirePoints, withBlock,
} from "@/lib/studio/circuit-edit";
import { MAX_IMPORT_CELLS, netlistToCircuit } from "@/lib/studio/circuit-import";
import { synthesizeDesign } from "@/lib/synth/client";
import type { BoardNetlist } from "@/lib/gate-sim";
import { tableFromNetlist } from "@/lib/studio/logic-min";
import { type Trace, longestPath, traceToParsed, traceToVcd } from "@/lib/studio/circuit-analysis";
import { waveformSvg } from "@/lib/waveform-svg";
import { downloadBlob } from "@/lib/api";

const TRACE_STEPS = 400;          // steps kept by the logic analyzer
const TRACE_SHOWN = 160;          // steps drawn
const GATE_PS = 100;              // assumed gate delay for the timing estimate

/** Probed signals: the user's choice, or every input and output. */
const probeRefs = (c: Circuit): PinRef[] =>
  (c.probes ?? [...inputParts(c).map((p) => ({ part: p.id, pin: "out" })), ...outputParts(c).map((p) => ({ part: p.id, pin: "in" }))])
    .filter((r) => c.parts.some((p) => p.id === r.part));
const sameRef = (a: PinRef, b: PinRef) => a.part === b.part && a.pin === b.pin;
/** A probe's name and width: a port's label, a single-output part's label, else <label>.<pin>. */
function probeInfo(c: Circuit, r: PinRef): { name: string; width: number } {
  const p = c.parts.find((x) => x.id === r.part)!;
  if (INPUT_KINDS.includes(p.kind) || ["led", "seg7", "hexout"].includes(p.kind)) return { name: p.label, width: portWidth(p) };
  return { name: pins(p).outputs.length > 1 ? `${p.label}.${r.pin}` : p.label, width: pinWidth(p, r.pin) };
}

const VIEW = { w: 860, h: 520 };
const ZOOM = { min: 0.25, max: 3 };
const uid = (p: string) => `${p}${Math.random().toString(36).slice(2, 8)}`;
const snap = (v: number) => Math.round(v / SNAP) * SNAP;
const CLIP_KEY = "bitflow_circuit_clip";

const LABEL_POOL: Partial<Record<PartKind, string[]>> = {
  switch: ["a", "b", "c", "d", "e", "f", "g", "h"], clock: ["clk", "clk2"], button: ["btn", "rst", "go"], hexin: ["a", "b", "x", "y"],
  hexout: ["value", "result"], counter: ["count"],
};
const PREFIX: Record<PartKind, string> = {
  switch: "sw", button: "btn", clock: "clk", hexin: "in", const0: "zero", const1: "one", const: "k", not: "n", and: "g", or: "g", xor: "g",
  nand: "g", nor: "g", xnor: "g", mux2: "m", dff: "q", tff: "t", jkff: "jk", reg: "r", counter: "cnt",
  adder: "add", cmp: "cmp", decoder: "dec", split: "sp", merge: "mg", led: "led", seg7: "seg", hexout: "hex", block: "blk",
};
/** Widths and options a new part starts with. */
const DEFAULTS: Partial<Record<PartKind, Partial<Part>>> = {
  hexin: { w: 4 }, hexout: { w: 4 }, const: { w: 4, value: 0 }, adder: { w: 4 }, cmp: { w: 4 }, decoder: { w: 2 },
  split: { w: 4 }, merge: { w: 4 }, reg: { w: 4, reset: false }, counter: { w: 4, reset: false },
  dff: { reset: false }, tff: { reset: false }, jkff: { reset: false },
};
const WIDTHS: Partial<Record<PartKind, number[]>> = {
  decoder: [1, 2, 3, 4], split: [2, 3, 4, 5, 6, 7, 8, 12, 16], merge: [2, 3, 4, 5, 6, 7, 8, 12, 16],
};
const widthChoices = (k: PartKind) => WIDTHS[k] ?? [1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 16];
const hasWidth = (k: PartKind) => ["hexin", "hexout", "const", "adder", "cmp", "decoder", "split", "merge", "reg", "counter",
  "not", "and", "or", "xor", "nand", "nor", "xnor", "mux2"].includes(k);
const hex = (v: number, w: number) => v.toString(16).toUpperCase().padStart(Math.ceil(w / 4), "0");
function freshLabel(c: Circuit, kind: PartKind): string {
  const used = new Set(c.parts.map((p) => p.label));
  const pooled = LABEL_POOL[kind]?.find((l) => !used.has(l));
  if (pooled) return pooled;
  for (let i = 1; ; i++) if (!used.has(`${PREFIX[kind]}${i}`)) return `${PREFIX[kind]}${i}`;
}

const PALETTE: { group: string; items: { kind: PartKind; label: string }[] }[] = [
  { group: "Inputs", items: [{ kind: "switch", label: "Switch" }, { kind: "button", label: "Button" }, { kind: "clock", label: "Clock" },
    { kind: "hexin", label: "Hex input" }, { kind: "const0", label: "0" }, { kind: "const1", label: "1" }, { kind: "const", label: "Constant" }] },
  { group: "Gates", items: [{ kind: "not", label: "NOT" }, { kind: "and", label: "AND" }, { kind: "or", label: "OR" }, { kind: "xor", label: "XOR" },
    { kind: "nand", label: "NAND" }, { kind: "nor", label: "NOR" }, { kind: "xnor", label: "XNOR" }, { kind: "mux2", label: "MUX 2:1" }] },
  { group: "Arithmetic", items: [{ kind: "adder", label: "Adder" }, { kind: "cmp", label: "Comparator" }, { kind: "decoder", label: "Decoder" }] },
  { group: "Memory", items: [{ kind: "dff", label: "D flip-flop" }, { kind: "tff", label: "T flip-flop" }, { kind: "jkff", label: "JK flip-flop" },
    { kind: "reg", label: "Register" }, { kind: "counter", label: "Counter" }] },
  { group: "Wiring", items: [{ kind: "split", label: "Splitter" }, { kind: "merge", label: "Merger" }] },
  { group: "Outputs", items: [{ kind: "led", label: "LED" }, { kind: "hexout", label: "Hex display" }, { kind: "seg7", label: "7-segment" }] },
];

const SHORTCUTS: [string, string][] = [
  ["Ctrl+Z / Ctrl+Shift+Z", "undo / redo"], ["Ctrl+C / X / V", "copy / cut / paste"], ["Ctrl+D", "duplicate"],
  ["Ctrl+A", "select all"], ["Delete", "delete the selection"], ["Arrows (Shift: ×5)", "nudge the selection"],
  ["Shift+click", "add to / remove from the selection"], ["Drag empty space", "box select"], ["Drag a wire", "bend it"],
  ["Ctrl+wheel", "zoom"], ["Space+drag, middle button", "pan"], ["Esc", "clear the selection"],
  ["Ctrl+G", "make a block from the selection"], ["Double-click a block", "open it to edit or test it"],
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

type Live = { sim: GateSim; bitsOf: ReturnType<typeof compile>["bitsOf"] } | null;
type View = { x: number; y: number; z: number };

export default function CircuitTool() {
  const router = useRouter();
  const [stored, setStored] = useLocalStorage<Circuit>("bitflow_studio_circuit", CIRCUIT_EXAMPLES[0].circuit);
  const top = valid(stored) ? stored : CIRCUIT_EXAMPLES[0].circuit;
  const lib: Library = top.blocks ?? {};
  // The block being edited (and the blocks it was opened from); [] = the top circuit
  const [openPath, setPath] = useState<string[]>([]);
  const path: string[] = [];
  for (const n of openPath) { if (!lib[n]) break; path.push(n); }       // undo can delete a block that is open
  const cur = path[path.length - 1];
  const c: Circuit = cur ? { ...lib[cur], module: cur } : top;
  const [sel, setSel] = useState<Selection>(NONE);
  const [view, setView] = useState<View>({ x: 0, y: 0, z: 1 });
  const [help, setHelp] = useState(false);

  // Undo history (of the top circuit, library included): every change goes through commit(), which
  // records the state before it; edit() changes the circuit on screen, the top one or an open block
  const cRef = useRef(c);
  cRef.current = c;
  const topRef = useRef(top);
  topRef.current = top;
  const curRef = useRef(cur);
  curRef.current = cur;
  const hist = useRef(new History());
  const [, setHistTick] = useState(0);
  const commit = useCallback((nextTop: Circuit, group = "") => {
    hist.current.push(topRef.current, group);
    setStored(nextTop);
    setHistTick((t) => t + 1);
  }, [setStored]);
  const edit = useCallback((next: Circuit, group = "") => {
    const name = curRef.current;
    commit(name ? withBlock(topRef.current, name, next) : next, group);
  }, [commit]);
  const undo = useCallback(() => {
    const prev = hist.current.undo(topRef.current);
    if (prev) { setStored(prev); setSel(NONE); setHistTick((t) => t + 1); }
  }, [setStored]);
  const redo = useCallback(() => {
    const next = hist.current.redo(topRef.current);
    if (next) { setStored(next); setSel(NONE); setHistTick((t) => t + 1); }
  }, [setStored]);

  // Positions, bends and notes don't change the logic, so editing them doesn't rebuild the simulation or the checks
  const logicOf = (x: Circuit) => ({
    p: x.parts.map((p) => ({ id: p.id, kind: p.kind, label: p.label, n: p.n, reset: p.reset, w: p.w, value: p.value, block: p.block, ports: p.ports })),
    w: x.wires.map((w) => [w.id, w.from, w.to]),
  });
  const logicKey = JSON.stringify({ m: c.module, ...logicOf(c), lib: Object.entries(lib).map(([n, d]) => [n, logicOf(d)]) });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const issues = useMemo(() => validate(c, lib), [logicKey]);
  const ok = !issues.some((i) => i.level === "error");

  // Live simulation: rebuilt when the logic changes; inputs keep their values, flip-flops restart at 0
  const simRef = useRef<Live>(null);
  const inputsRef = useRef<Record<string, number>>({});
  const [recorded, setRecorded] = useState<InputEvent[]>([]);
  const [, setTick] = useState(0);
  const redraw = () => setTick((t) => t + 1);

  // Logic analyzer: one row of probe values per step (an input change or clock edge)
  const probes = probeRefs(c);
  const probesRef = useRef(probes);
  probesRef.current = probes;
  const probeKey = JSON.stringify(probes);
  const traceRef = useRef<number[][]>([]);
  const pausedRef = useRef(false);
  const [paused, setPaused] = useState(false);
  const sample = useCallback(() => {
    const s = simRef.current;
    if (!s || pausedRef.current) return;
    const cc = cRef.current;
    traceRef.current.push(probesRef.current.map((r) => {
      const p = cc.parts.find((x) => x.id === r.part);
      if (!p) return 0;
      if (["led", "seg7", "hexout"].includes(p.kind)) return toNumber(s.sim.get(p.label));
      return toNumber((s.bitsOf(r) ?? []).map((b) => s.sim.net(b)));
    }));
    if (traceRef.current.length > TRACE_STEPS) traceRef.current.shift();
  }, []);
  const restartTrace = useCallback(() => { traceRef.current = []; sample(); }, [sample]);

  useEffect(() => {
    if (!ok) { simRef.current = null; redraw(); return; }
    const { net, bitsOf } = compile(c, lib);
    const sim = new GateSim(net);
    for (const p of inputParts(c)) {
      const v = (inputsRef.current[p.label] ?? 0) % 2 ** portWidth(p);
      inputsRef.current[p.label] = v;
      if (v) sim.set(p.label, toBits(v, portWidth(p)));
    }
    simRef.current = { sim, bitsOf };
    setRecorded([]);                                  // the recording starts from this power-up
    restartTrace();
    redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logicKey, ok]);
  // A different set of probes starts a new trace
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { restartTrace(); redraw(); }, [probeKey]);

  const drive = useCallback((label: string, v: number) => {
    const s = simRef.current;
    if (!s || inputsRef.current[label] === v) return;
    inputsRef.current[label] = v;
    s.sim.set(label, toBits(v, s.sim.ports[label]?.bits.length ?? 1));
    setRecorded((r) => [...r, { port: label, value: v }]);
    sample();
    redraw();
  }, [sample]);
  const pulse = useCallback((labels: string[]) => {
    for (const l of labels) drive(l, 1);
    for (const l of labels) drive(l, 0);
  }, [drive]);
  const powerUp = () => {
    for (const p of inputParts(c)) inputsRef.current[p.label] = 0;
    if (ok) { const { net, bitsOf } = compile(c, lib); simRef.current = { sim: new GateSim(net), bitsOf }; }
    setRecorded([]);
    restartTrace();
    redraw();
  };
  const toggleProbe = (r: PinRef) => {
    const cur = probeRefs(c);
    edit({ ...c, probes: cur.some((x) => sameRef(x, r)) ? cur.filter((x) => !sameRef(x, r)) : [...cur, r] });
  };

  // Timing: the longest combinational path, mapped back to the parts and wires it runs through
  const [showPath, setShowPath] = useState(false);
  const timing = useMemo(() => {
    if (!ok) return null;
    const { net, bitsOf } = compile(c, lib);
    const lp = longestPath(net);
    const onPath = new Set(lp.nets);
    const netPart = new Map<number, Part>();
    for (const p of c.parts) for (const o of pins(p).outputs) for (const b of bitsOf({ part: p.id, pin: o }) ?? []) if (typeof b === "number") netPart.set(b, p);
    const parts = new Set<string>(), labels: string[] = [];
    const add = (p: Part | undefined) => { if (!p) return; parts.add(p.id); if (labels[labels.length - 1] !== p.label) labels.push(p.label); };
    lp.nets.forEach((n) => add(netPart.get(n)));
    const end = lp.nets[lp.nets.length - 1];
    const ff = net.cells.find((x) => x.type.startsWith("$_DFF") && x.conn.D[0] === end);   // ends at a flip-flop's input...
    add(outputParts(c).find((p) => net.ports[p.label]?.bits.includes(end)) ?? (ff ? netPart.get(Number(ff.conn.Q[0])) : undefined));   // ...or an output
    const wires = new Set(c.wires.filter((w) => parts.has(w.from.part) && parts.has(w.to.part) && (bitsOf(w.from) ?? []).some((b) => onPath.has(Number(b)))).map((w) => w.id));
    return { delay: lp.delay, labels, parts, wires };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logicKey, ok]);

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
  const blockFromSel = () => {
    if (!sel.parts.length) { window.alert("Select the parts to put in the block first (drag a box around them)."); return; }
    let i = 1;
    while (lib[`block${i}`]) i++;
    const name = window.prompt("Name the new block (it becomes a Verilog module):", `block${i}`)?.trim();
    if (!name) return;
    const bad = blockNameIssue(top, name);
    if (bad) { window.alert(bad); return; }
    const r = makeBlock(c, sel, name, uid);
    if (typeof r === "string") { window.alert(r); return; }
    const blocks = { ...lib, [name]: r.def };
    commit(cur ? withBlock({ ...top, blocks }, cur, r.circuit) : { ...r.circuit, blocks });
    setSel({ ...NONE, parts: [r.instance] });
  };
  const openBlock = (name: string, nested = false) => {
    setPath(nested ? [...path, name] : [name]);
    setSel(NONE);
    requestAnimationFrame(fit);
  };
  const leaveTo = (depth: number) => { setPath(path.slice(0, depth)); setSel(NONE); requestAnimationFrame(fit); };
  const renameCurrent = () => {
    const name = window.prompt("New name for this block:", cur)?.trim();
    if (!cur || !name || name === cur) return;
    const bad = blockNameIssue(top, name);
    if (bad) { window.alert(bad); return; }
    commit(renameBlock(top, cur, name));
    setPath(path.map((n) => (n === cur ? name : n)));
  };
  const uses = (name: string) => [top, ...Object.values(lib)].reduce((n, x) => n + x.parts.filter((p) => p.kind === "block" && p.block === name).length, 0);
  const deleteBlock = (name: string) => {
    const { [name]: _gone, ...rest } = lib;
    commit({ ...top, blocks: rest });
  };
  const [importing, setImporting] = useState(false);
  const imported = (circuit: Circuit, asBlock: boolean) => {
    setImporting(false);
    if (!asBlock) { load(circuit); return; }
    const name = nextLabel(circuit.module, new Set([top.module, ...Object.keys(lib)]));
    const blocks = { ...lib, [name]: { ...circuit, module: name } };
    const ctr = visibleCentre();
    const inst: Part = { id: uid("p"), kind: "block", block: name, ports: blockPorts(circuit), label: nextLabel(`${name}1`, new Set(c.parts.map((x) => x.label))),
      x: snap(ctr.x - 50), y: snap(ctr.y - 40) };
    const next = { ...c, parts: [...c.parts, inst] };
    commit(cur ? withBlock({ ...top, blocks }, cur, next) : { ...next, blocks });
    setSel({ ...NONE, parts: [inst.id] });
  };
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
    else if (mod && k === "g") blockFromSel();
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
      ...DEFAULTS[kind],
    };
    edit({ ...c, parts: [...c.parts, p] });
    setSel({ ...NONE, parts: [p.id] });
  };
  const addBlock = (name: string) => {
    const ctr = visibleCentre();
    const p: Part = { id: uid("p"), kind: "block", block: name, ports: blockPorts(lib[name]), label: nextLabel(`${name}1`, new Set(c.parts.map((x) => x.label))),
      x: snap(ctr.x - 50), y: snap(ctr.y - 40) };
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
  /** Replace the whole design (examples, New, import): always at the top level. */
  const load = (circuit: Circuit) => {
    inputsRef.current = {};
    commit(circuit);
    setPath([]);
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
    () => (ok ? { design: generateVerilog(c, lib), testbench: generateTestbench(c, events ?? defaultEvents(c, 48, 1, lib), lib) } : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [logicKey, ok, events, notesKey],
  );
  const sequential = hasState(c, lib);
  const inputBits = inputParts(c).reduce((n, p) => n + portWidth(p), 0);
  const tableable = ok && !sequential && inputBits > 0 && inputBits <= 6 && outputParts(c).length > 0;
  const toTable = () => {
    const t = tableFromNetlist(compile(c, lib).net);
    if (typeof t === "string") { window.alert(t); return; }
    try { localStorage.setItem("bitflow_studio_logic", JSON.stringify(t)); } catch { window.alert("Your browser blocked local storage."); return; }
    router.push("/studio/logic");
  };

  const btn = "px-2 py-1 rounded border border-rim/60 text-ghost hover:text-bright font-mono text-[11px] disabled:opacity-40";
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
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
        {cur ? (
          <span className="flex items-center gap-2 text-dim">block <span className="text-info text-[12px]">{cur}</span>
            <button className="text-dim hover:text-bright underline" onClick={renameCurrent}>rename</button></span>
        ) : (
          <label className="flex items-center gap-2 text-dim">module
            <input value={c.module} onChange={(e) => edit({ ...c, module: e.target.value.trim() }, "module")} aria-label="Module name"
                   className="w-36 bg-pit border border-rim/60 rounded px-2 py-1 text-[12px] text-pale" />
          </label>
        )}
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
        <button className={`${btn} ${showPath ? "border-warn/60 text-warn" : ""}`} disabled={!timing} onClick={() => setShowPath((s) => !s)}
                title="Highlight the longest chain of gates between inputs/flip-flops and outputs/flip-flops">Longest path</button>
        <span className="text-rim">|</span>
        <button className={btn} onClick={blockFromSel} disabled={!sel.parts.length} title="Turn the selected parts into a reusable block (Ctrl+G)">⧉ Make block</button>
        <button className={`${btn} ${importing ? "border-info/60 text-info" : ""}`} onClick={() => setImporting((v) => !v)}
                title="Draw a circuit from a Verilog module">⇣ Import Verilog</button>
      </div>
      {importing && <ImportPanel onCancel={() => setImporting(false)} onImport={imported} />}
      {showPath && timing && (
        <p className="font-mono text-[11px] text-warn -mt-2">
          {timing.delay === 0
            ? "No gates between the inputs (or flip-flops) and the outputs."
            : <>Longest path: {timing.delay} gate delay{timing.delay === 1 ? "" : "s"} ({timing.labels.join(" → ")}). At {GATE_PS} ps per gate that is{" "}
                {((timing.delay * GATE_PS) / 1000).toFixed(1)} ns, so {sequential ? "the clock can run at up to" : "results settle in time for a clock of up to"} about{" "}
                {Math.round(1e6 / (timing.delay * GATE_PS))} MHz.</>}
        </p>
      )}

      <div className="grid gap-5 xl:grid-cols-[150px_minmax(0,1fr)_280px]">
        <div className="flex xl:flex-col flex-wrap gap-1.5 font-mono text-[11px] xl:max-h-[640px] xl:overflow-y-auto xl:pr-1">
          {PALETTE.map((g) => (
            <div key={g.group} className="contents xl:block xl:space-y-1">
              <div className="hidden xl:block text-[9px] uppercase tracking-wider text-dim pt-1">{g.group}</div>
              {g.items.map((p) => (
                <button key={p.kind} onClick={() => addPart(p.kind)} className="xl:w-full px-2 py-1 rounded border border-rim/60 text-ghost hover:text-bright hover:border-phosphor/50 text-left">
                  + {p.label}
                </button>
              ))}
            </div>
          ))}
          <div className="contents xl:block xl:space-y-1">
            <div className="hidden xl:block text-[9px] uppercase tracking-wider text-dim pt-1">Blocks</div>
            {Object.keys(lib).map((name) => {
              const loops = !!cur && usesBlock(lib, name, cur);                  // a block can't contain itself
              const n = uses(name);
              return (
                <div key={name} className="flex gap-1 xl:w-full">
                  <button onClick={() => addBlock(name)} disabled={loops} title={loops ? "A block can't contain itself" : `Place a ${name}`}
                          className="flex-1 min-w-0 truncate px-2 py-1 rounded border border-info/40 text-info/90 hover:text-bright text-left disabled:opacity-40">+ {name}</button>
                  <button onClick={() => openBlock(name)} title={`Open ${name} to edit or test it`} aria-label={`Open ${name}`}
                          className="px-1.5 rounded border border-rim/60 text-dim hover:text-bright">✎</button>
                  {!n && <button onClick={() => deleteBlock(name)} title={`Delete ${name} (unused)`} aria-label={`Delete ${name}`}
                                 className="px-1.5 rounded border border-rim/60 text-dim hover:text-danger">×</button>}
                </div>
              );
            })}
            {!Object.keys(lib).length && <div className="hidden xl:block text-[10px] text-dim leading-snug">Select some parts and press Ctrl+G to make a reusable block.</div>}
          </div>
          <button onClick={addNote} className="px-2 py-1.5 rounded border border-dashed border-warn/40 text-ghost hover:text-bright text-left">+ Note</button>
        </div>
        <div className="relative min-w-0">
          {path.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 mb-2 px-3 py-1.5 rounded-lg border border-info/30 bg-info/5 font-mono text-[11px]">
              <button onClick={() => leaveTo(0)} className="text-info hover:underline">{top.module}</button>
              {path.map((n, i) => (
                <Fragment key={`${n}${i}`}>
                  <span className="text-dim">›</span>
                  {i === path.length - 1 ? <span className="text-bright">{n}</span> : <button onClick={() => leaveTo(i + 1)} className="text-info hover:underline">{n}</button>}
                </Fragment>
              ))}
              <span className="text-dim">· editing a block: changes apply to all {uses(cur!)} instance{uses(cur!) === 1 ? "" : "s"}; its switches and LEDs are its pins</span>
              <button onClick={() => leaveTo(path.length - 1)} className="ml-auto px-2 py-0.5 rounded border border-rim/60 text-ghost hover:text-bright">↑ Back</button>
            </div>
          )}
          <Canvas c={c} edit={edit} sel={sel} setSel={setSel} live={simRef.current} inputs={inputsRef.current} drive={drive} pulse={pulse}
                  view={view} setView={setView} onKey={onKey} hot={showPath && timing ? timing : null} onOpen={(name) => openBlock(name, true)} />
          {help && (
            <div className="absolute top-2 right-2 z-10 w-72 rounded-lg border border-rim bg-pit/95 p-3 font-mono text-[10px] shadow-xl">
              <div className="flex justify-between mb-1.5"><span className="text-pale uppercase tracking-wider">Shortcuts</span>
                <button className="text-dim hover:text-bright" onClick={() => setHelp(false)}>close</button></div>
              <table><tbody>{SHORTCUTS.map(([k, v]) => <tr key={k}><td className="pr-2 text-info whitespace-nowrap align-top">{k}</td><td className="text-ghost">{v}</td></tr>)}</tbody></table>
            </div>
          )}
        </div>
        <div className="space-y-4 min-w-0">
          <Inspector c={c} edit={edit} sel={sel} onDelete={deleteSel} onDuplicate={duplicate} onHelp={() => setHelp(true)}
                     probes={probes} onProbe={toggleProbe} onOpen={(name) => openBlock(name, true)} onMakeBlock={blockFromSel} />
          <Issues issues={issues} onPick={(id) => setSel({ ...NONE, parts: [id] })} />
        </div>
      </div>

      <Analyzer c={c} probes={probes} steps={traceRef.current} paused={paused} live={!!simRef.current}
                onPause={() => { pausedRef.current = !paused; setPaused(!paused); }}
                onClear={() => { restartTrace(); redraw(); }} />

      <section className="space-y-3 border-t border-rim/40 pt-5">
        <div className="flex flex-wrap items-center gap-3 font-mono text-[11px]">
          <h2 className="font-display text-[15px] font-semibold">Verilog</h2>
          <span className="text-dim">testbench drives</span>
          <label className="flex items-center gap-1">
            <input type="radio" checked={tbSource === "auto"} onChange={() => setTbSource("auto")} />
            {sequential || inputBits > MAX_EXHAUSTIVE_INPUTS ? "a random walk (the clock toggles every other step)" : "every input combination (one bit changes per step)"}
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

function Canvas({ c, edit, sel, setSel, live, inputs, drive, pulse, view, setView, onKey, hot, onOpen }: {
  c: Circuit; edit: (c: Circuit, group?: string) => void; sel: Selection; setSel: (s: Selection) => void; live: Live;
  inputs: Record<string, number>; drive: (label: string, v: number) => void; pulse: (labels: string[]) => void;
  view: View; setView: (v: View | ((v: View) => View)) => void; onKey: (e: React.KeyboardEvent) => void;
  /** The longest path, highlighted. */
  hot: { parts: Set<string>; wires: Set<string> } | null;
  /** Open a block instance's definition. */
  onOpen: (block: string) => void;
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
  /** An output pin's current value (a bus as a number). */
  const valueOf = (r: PinRef) => { const bits = live?.bitsOf(r); return live && bits ? toNumber(bits.map((b) => live.sim.net(b))) : 0; };
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

  /** The nearest pin within `r` px of (x, y), optionally only those `ok` accepts. */
  const pinAt = (x: number, y: number, r = 9, ok?: (ref: PinRef, isOutput: boolean) => boolean): { ref: PinRef; isOutput: boolean } | null => {
    let best: { ref: PinRef; isOutput: boolean } | null = null, bestD = r;
    for (const p of c.parts) {
      const { inputs: ins, outputs: outs } = pins(p);
      for (const pin of [...ins, ...outs]) {
        const q = pinPos(p, pin), d = Math.hypot(q.x - x, q.y - y), isOutput = outs.includes(pin);
        if (d <= bestD && (!ok || ok({ part: p.id, pin }, isOutput))) { best = { ref: { part: p.id, pin }, isOutput }; bestD = d; }
      }
    }
    return best;
  };
  /** While wiring: the pins the wire can end on (other direction, another part), and the one it snaps to. */
  const wiring = drag?.kind === "wire" ? { part: drag.from.part, isOutput: drag.isOutput, width: pinWidth(byId.get(drag.from.part)!, drag.from.pin) } : null;
  const canEnd = (ref: PinRef, isOutput: boolean) => !!wiring && isOutput !== wiring.isOutput && ref.part !== wiring.part;
  const snapTo = drag?.kind === "wire" ? pinAt(drag.x, drag.y, 16, canEnd) : null;
  /** What drives each input pin, for tooltips. */
  const driverOf = new Map(c.wires.map((w) => [`${w.to.part}.${w.to.pin}`, w.from]));

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
      const hit = pinAt(p.x, p.y, 16, canEnd);
      if (hit) {
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
  const pendingEnd = snapTo ? pinPos(byId.get(snapTo.ref.part)!, snapTo.ref.pin) : drag?.kind === "wire" ? { x: drag.x, y: drag.y } : null;
  const fmt = (v: number, w: number) => (w > 1 ? `${w}'h${hex(v, w)} (${v})` : `${v}`);

  // Junction dots: where wires from one output branch off their shared first segment
  const fan = new Map<string, number[]>();
  c.wires.forEach((w, i) => {
    const a = byId.get(w.from.part), b = byId.get(w.to.part);
    if (!a || !b) return;
    const k = `${w.from.part}.${w.from.pin}`;
    fan.set(k, [...(fan.get(k) ?? []), wirePoints(pinPos(a, w.from.pin), pinPos(b, w.to.pin), ((i % 5) - 2) * 7, w.bend)[1][0]]);
  });
  const dots: { x: number; y: number; on: boolean; bus: boolean }[] = [];
  for (const [k, xs] of fan) {
    if (xs.length < 2) continue;
    const ref = { part: k.slice(0, k.lastIndexOf(".")), pin: k.slice(k.lastIndexOf(".") + 1) };
    const from = byId.get(ref.part)!, q = pinPos(from, ref.pin), bw = pinWidth(from, ref.pin), far = Math.max(...xs);
    for (const x of new Set(xs.filter((x) => x < far))) dots.push({ x, y: q.y, on: bw === 1 && valueOf(ref) === 1, bus: bw > 1 });
  }

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
          const pa = pinPos(a, w.from.pin), pb = pinPos(b, w.to.pin);
          const d = wirePath(pa, pb, ((i % 5) - 2) * 7, w.bend);
          const bw = pinWidth(a, w.from.pin), bad = bw !== pinWidth(b, w.to.pin);
          const v = valueOf(w.from), on = bw === 1 && v === 1, selected = has(sel.wires, w.id);
          const colour = selected ? "#4db8ff" : bad ? "#ff5a5a" : hot?.wires.has(w.id) ? "#ffb547" : bw > 1 ? "#5aa9e6" : on ? "#00e87a" : "#4a4d60";
          return (
            <g key={w.id} data-wire={w.id} style={{ cursor: "move" }}
               onPointerDown={(e) => {
                 e.stopPropagation(); capture(e); focus();
                 const one = { ...NONE, wires: [w.id] };
                 if (e.shiftKey) { setSel(merge(sel, one, true)); return; }
                 setSel(one);
                 setDrag({ kind: "bend", group: `bend${++gesture.current}`, id: w.id, base: c });
               }}>
              <title>{`${a.label}.${w.from.pin} → ${b.label}.${w.to.pin}${live ? ` = ${fmt(v, bw)}` : ""}${bad ? " (width mismatch)" : ""}`}</title>
              <path d={d} stroke="transparent" strokeWidth={10} fill="none" />
              <path d={d} stroke={colour} strokeWidth={(bw > 1 ? 3.5 : 2) + (selected ? 0.5 : 0)} fill="none" strokeLinejoin="round"
                    strokeDasharray={bad ? "6 4" : undefined} />
              {bw > 1 && live && (
                <text x={pa.x + 6} y={pa.y - 5} fontSize={9} fill="#9fd0ff" fontFamily="monospace" style={{ pointerEvents: "none" }}>
                  {`${bw}'h${hex(v, bw)}`}
                </text>
              )}
            </g>
          );
        })}

        {dots.map((j, i) => <circle key={i} cx={j.x} cy={j.y} r={j.bus ? 3.6 : 3} fill={j.bus ? "#5aa9e6" : j.on ? "#00e87a" : "#6b6f85"} style={{ pointerEvents: "none" }} />)}

        {c.parts.map((p) => (
          <PartView key={p.id} p={p} selected={has(sel.parts, p.id)} hot={!!hot?.parts.has(p.id)} valueOf={valueOf}
                    wiring={wiring && wiring.part !== p.id ? { isOutput: wiring.isOutput, width: wiring.width } : null}
                    snapPin={snapTo?.ref.part === p.id ? snapTo.ref.pin : null}
                    pinTitle={(pin, isOutput) => {
                      const w = pinWidth(p, pin), src = isOutput ? { part: p.id, pin } : driverOf.get(`${p.id}.${pin}`);
                      return `${p.label}.${pin} · ${w} bit${w === 1 ? "" : "s"}${!live ? "" : src ? ` = ${fmt(valueOf(src), w)}` : " · not connected"}`;
                    }}
                    onOpen={p.kind === "block" && p.block ? () => onOpen(p.block!) : undefined}
                    inputValue={inputs[p.label] ?? 0} outputBits={live && (p.kind === "led" || p.kind === "seg7" || p.kind === "hexout") ? live.sim.get(p.label) : null}
                    onBodyDown={(e) => startMove(e, "parts", p.id)}
                    onPinDown={(e, pin, isOutput) => {
                      e.stopPropagation(); capture(e); focus();
                      const q = toSvg(e);
                      setDrag({ kind: "wire", from: { part: p.id, pin }, isOutput, x: q.x, y: q.y });
                    }}
                    onKnob={(down, back) => {
                      if (!live) return;
                      if (p.kind === "hexin" && down) {
                        const m = 2 ** width(p);                     // click counts up, shift-click down
                        drive(p.label, ((inputs[p.label] ?? 0) + (back ? m - 1 : 1)) % m);
                      }
                      if (p.kind === "switch" && down) drive(p.label, (inputs[p.label] ?? 0) ^ 1);
                      if (p.kind === "button") drive(p.label, down ? 1 : 0);
                      if (p.kind === "clock" && down) pulse([p.label]);
                    }} />
        ))}

        {pending && pendingEnd && (
          <line x1={pending.x} y1={pending.y} x2={pendingEnd.x} y2={pendingEnd.y} stroke={snapTo ? "#00e87a" : "#5aa9e6"} strokeDasharray={snapTo ? undefined : "5 4"} strokeWidth={snapTo ? 2 : 1.5} />
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

/** Distinctive-shape gate outline (ANSI/IEEE 91) in a gw × h box; OR/XOR have a curved back, so input pins get stubs. */
function gateShape(kind: PartKind, x: number, y: number, gw: number, h: number): { body: string; back?: string; inset: (py: number) => number } {
  const core = kind === "nand" ? "and" : kind === "nor" ? "or" : kind === "xnor" ? "xor" : kind;
  if (core === "not") return { body: `M ${x} ${y + 3} L ${x + gw} ${y + h / 2} L ${x} ${y + h - 3} Z`, inset: () => 0 };
  if (core === "and") {
    const rx = Math.min(h / 2, gw * 0.55);
    return { body: `M ${x} ${y} H ${x + gw - rx} A ${rx} ${h / 2} 0 0 1 ${x + gw - rx} ${y + h} H ${x} Z`, inset: () => 0 };
  }
  const xo = core === "xor" ? 7 : 0, X = x + xo, W = gw - xo, bow = W * 0.3;
  const inset = (py: number) => { const t = Math.max(0, Math.min(1, (py - y) / h)); return xo + 2 * t * (1 - t) * bow; };
  return {
    body: `M ${X} ${y} Q ${X + W * 0.62} ${y} ${x + gw} ${y + h / 2} Q ${X + W * 0.62} ${y + h} ${X} ${y + h} Q ${X + bow} ${y + h / 2} ${X} ${y} Z`,
    back: core === "xor" ? `M ${x} ${y} Q ${x + bow} ${y + h / 2} ${x} ${y + h}` : undefined,
    inset,
  };
}

function PartView({ p, selected, hot, valueOf, inputValue, outputBits, onBodyDown, onPinDown, onKnob, wiring, snapPin, pinTitle, onOpen }: {
  p: Part; selected: boolean; hot: boolean; valueOf: (r: PinRef) => number; inputValue: number; outputBits: number[] | null;
  onBodyDown: (e: React.PointerEvent) => void; onPinDown: (e: React.PointerEvent, pin: string, isOutput: boolean) => void;
  onKnob: (down: boolean, back?: boolean) => void;
  /** A wire being drawn from another part: its direction and width (pins it can end on glow). */
  wiring: { isOutput: boolean; width: number } | null;
  /** The pin of this part the wire would snap to. */
  snapPin: string | null;
  pinTitle: (pin: string, isOutput: boolean) => string;
  onOpen?: () => void;
}) {
  const { w, h } = size(p);
  const { inputs, outputs } = pins(p);
  const stroke = selected ? "#4db8ff" : hot ? "#ffb547" : "#5a5e74";
  const outOn = outputs.length && pinWidth(p, outputs[0]) === 1 ? valueOf({ part: p.id, pin: outputs[0] }) === 1 : false;
  const inverted = ["nand", "nor", "xnor", "not"].includes(p.kind);
  const showPinNames = !["switch", "button", "clock", "hexin", "const0", "const1", "const", "led", "hexout", "not", "and", "or", "xor", "nand", "nor", "xnor"].includes(p.kind);
  const isGate = ["not", "and", "or", "xor", "nand", "nor", "xnor"].includes(p.kind);
  const shape = isGate ? gateShape(p.kind, p.x, p.y, w - (inverted ? 8 : 0), h) : null;
  const box = (title: string, sub?: string) => <>
    <rect x={p.x} y={p.y} width={w} height={h} rx={4} fill="#13141a" stroke={stroke} />
    <text x={p.x + w / 2} y={p.y + 13} textAnchor="middle" fontSize={9} fontWeight={700} fill="#c8cad6" fontFamily="monospace">{title}</text>
    {sub && <text x={p.x + w / 2} y={p.y + h - 6} textAnchor="middle" fontSize={8} fill="#6b6f85" fontFamily="monospace">{sub}</text>}
  </>;
  /** A pin a wire being drawn could end on: green if the widths match, amber if not; brighter where it would snap. */
  const glow = (q: { x: number; y: number }, pin: string) => {
    const match = pinWidth(p, pin) === wiring!.width, snap = snapPin === pin, colour = match ? "#00e87a" : "#ffb547";
    return <circle cx={q.x} cy={q.y} r={snap ? 8 : 6.5} fill={snap ? `${colour}33` : "none"} stroke={colour} strokeWidth={snap ? 2 : 1.2} opacity={snap ? 1 : 0.55} style={{ pointerEvents: "none" }} />;
  };
  const clkMark = inputs.includes("clk") ? (() => { const cy = pinPos(p, "clk").y; return <path d={`M ${p.x} ${cy - 5} L ${p.x + 7} ${cy} L ${p.x} ${cy + 5}`} fill="none" stroke="#8b8fa3" />; })() : null;

  let body: React.ReactNode;
  if (INPUT_KINDS.includes(p.kind) && p.kind !== "hexin") {
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
  } else if (p.kind === "hexin") {
    const W = width(p);
    body = <>
      <rect x={p.x} y={p.y} width={w} height={h} rx={6} fill="#13141a" stroke={stroke} />
      <g data-knob={p.label} style={{ cursor: "pointer" }} onPointerDown={(e) => { e.stopPropagation(); onKnob(true, e.shiftKey); }}>
        <rect x={p.x + 6} y={p.y + 7} width={w - 22} height={h - 14} rx={3} fill="#0b1a24" stroke="#2f5d7a" />
        <text x={p.x + 6 + (w - 22) / 2} y={p.y + h / 2 + 5} textAnchor="middle" fontSize={14} fontWeight={700} fill="#7cc4ff" fontFamily="monospace">{hex(inputValue, W)}</text>
      </g>
      <text x={p.x + w - 9} y={p.y + h / 2 + 3} textAnchor="middle" fontSize={8} fill="#6b6f85" fontFamily="monospace">{W}b</text>
    </>;
  } else if (p.kind === "const") {
    body = <>
      <rect x={p.x} y={p.y} width={w} height={h} rx={6} fill="#13141a" stroke={stroke} />
      <text x={p.x + w / 2 - 4} y={p.y + h / 2 + 5} textAnchor="middle" fontSize={13} fontWeight={700} fill="#9fd0ff" fontFamily="monospace">{`${width(p)}'h${hex(constValue(p), width(p))}`}</text>
    </>;
  } else if (p.kind === "hexout") {
    const W = width(p), v = outputBits ? toNumber(outputBits) : 0;
    body = <>
      <rect x={p.x} y={p.y} width={w} height={h} rx={6} fill="#0d0e11" stroke={stroke} />
      <text x={p.x + w / 2 + 3} y={p.y + h / 2 + 4} textAnchor="middle" fontSize={20} fontWeight={700} fill="#ff6b6b" fontFamily="monospace"
            style={{ filter: "drop-shadow(0 0 4px rgba(255,90,90,0.6))" }}>{hex(v, W)}</text>
      <text x={p.x + w - 4} y={p.y + h - 4} textAnchor="end" fontSize={8} fill="#6b6f85" fontFamily="monospace">{v}</text>
    </>;
  } else if (p.kind === "tff" || p.kind === "jkff") {
    body = <>{box(p.kind === "tff" ? "T" : "JK")}{clkMark}
      <text x={p.x + w - 6} y={p.y + h / 2 + 4} textAnchor="end" fontSize={10} fill="#8b8fa3" fontFamily="monospace">Q</text></>;
  } else if (p.kind === "reg" || p.kind === "counter") {
    body = <>{box(p.kind === "reg" ? "REG" : "COUNT", `${width(p)} bits`)}{clkMark}</>;
  } else if (p.kind === "adder" || p.kind === "cmp" || p.kind === "decoder") {
    body = <>{box(p.kind === "adder" ? "ADD" : p.kind === "cmp" ? "CMP" : "DEC", p.kind === "decoder" ? `${width(p)}→${2 ** width(p)}` : `${width(p)} bits`)}</>;
  } else if (p.kind === "split" || p.kind === "merge") {
    body = <>
      <rect x={p.x} y={p.y} width={w} height={h} rx={3} fill="#13141a" stroke={stroke} />
      <path d={p.kind === "split" ? `M ${p.x + 8} ${p.y + h / 2} L ${p.x + w - 8} ${p.y + 8} M ${p.x + 8} ${p.y + h / 2} L ${p.x + w - 8} ${p.y + h - 8}`
                                  : `M ${p.x + w - 8} ${p.y + h / 2} L ${p.x + 8} ${p.y + 8} M ${p.x + w - 8} ${p.y + h / 2} L ${p.x + 8} ${p.y + h - 8}`}
            stroke="#5aa9e6" strokeWidth={2} fill="none" />
    </>;
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
  } else if (p.kind === "block") {
    body = <>
      <rect x={p.x} y={p.y} width={w} height={h} rx={5} fill="#0f1724" stroke={selected || hot ? stroke : "#3d6a93"} strokeWidth={1.5} />
      <rect x={p.x + 1} y={p.y + 1} width={w - 2} height={17} rx={4} fill="rgba(90,169,230,0.14)" />
      <text x={p.x + w / 2} y={p.y + 13} textAnchor="middle" fontSize={9.5} fontWeight={700} fill="#9fd0ff" fontFamily="monospace">{p.block}</text>
      <text x={p.x + w - 5} y={p.y + h - 5} textAnchor="end" fontSize={8} fill="#4f6f8f" fontFamily="monospace">⧉</text>
    </>;
  } else if (shape) {
    const W = width(p);
    body = <>
      <path d={shape.body} fill={outOn ? "#122419" : "#13141a"} stroke={stroke} strokeWidth={1.3} strokeLinejoin="round" />
      {shape.back && <path d={shape.back} fill="none" stroke={stroke} strokeWidth={1.3} />}
      {inputs.map((pin) => { const q = pinPos(p, pin), d = shape.inset(q.y); return d > 0.5 ? <line key={pin} x1={q.x} y1={q.y} x2={q.x + d} y2={q.y} stroke="#5a5e74" /> : null; })}
      {inverted && <circle cx={p.x + w - 4} cy={p.y + h / 2} r={4} fill="#13141a" stroke={stroke} strokeWidth={1.3} />}
      {W > 1 && <text x={p.x + (w - 8) / 2 - 2} y={p.y + h / 2 + 3} textAnchor="middle" fontSize={8} fill="#6b8fb3" fontFamily="monospace">{W}b</text>}
    </>;
  }

  return (
    <g data-part={p.label}>
      <g onPointerDown={onBodyDown} onDoubleClick={onOpen} style={{ cursor: "grab", filter: selected ? "drop-shadow(0 0 4px rgba(77,184,255,0.55))" : undefined }}>
        {onOpen && <title>{`${p.block}: double-click to open`}</title>}
        {body}
      </g>
      <text x={p.x + w / 2} y={p.y - 5} textAnchor="middle" fontSize={10} fill={selected ? "#4db8ff" : "#8b8fa3"} fontFamily="monospace">{p.label}</text>
      {inputs.map((pin) => {
        const q = pinPos(p, pin);
        return (
          <g key={pin} data-pin={`${p.label}.${pin}`} onPointerDown={(e) => onPinDown(e, pin, false)} style={{ cursor: "crosshair" }}>
            <title>{pinTitle(pin, false)}</title>
            <circle cx={q.x} cy={q.y} r={8} fill="transparent" />
            {wiring?.isOutput && glow(q, pin)}
            {pinWidth(p, pin) > 1
              ? <rect x={q.x - 4} y={q.y - 4} width={8} height={8} rx={1.5} fill="#0d0e11" stroke="#5aa9e6" />
              : <circle cx={q.x} cy={q.y} r={3.5} fill="#0d0e11" stroke="#8b8fa3" />}
            {showPinNames && <text x={q.x + 6} y={q.y + 3} fontSize={p.kind === "seg7" ? 7 : 8} fill="#6b6f85" fontFamily="monospace">{pin}</text>}
          </g>
        );
      })}
      {outputs.map((pin) => {
        const q = pinPos(p, pin);
        return (
          <g key={pin} data-pin={`${p.label}.${pin}`} onPointerDown={(e) => onPinDown(e, pin, true)} style={{ cursor: "crosshair" }}>
            <title>{pinTitle(pin, true)}</title>
            <circle cx={q.x} cy={q.y} r={8} fill="transparent" />
            {wiring && !wiring.isOutput && glow(q, pin)}
            {pinWidth(p, pin) > 1
              ? <rect x={q.x - 4} y={q.y - 4} width={8} height={8} rx={1.5} fill="#0d0e11" stroke="#5aa9e6" />
              : (() => { const lit = outputs.length > 1 ? valueOf({ part: p.id, pin }) === 1 : outOn;
                         return <circle cx={q.x} cy={q.y} r={3.5} fill={lit ? "#00e87a" : "#0d0e11"} stroke={lit ? "#00e87a" : "#8b8fa3"} />; })()}
            {showPinNames && (outputs.length > 1 || p.kind === "block") && <text x={q.x - 6} y={q.y + 3} textAnchor="end" fontSize={8} fill="#6b6f85" fontFamily="monospace">{pin}</text>}
          </g>
        );
      })}
    </g>
  );
}

// ── Side panels ────────────────────────────────────────────────────────────────

function Inspector({ c, edit, sel, onDelete, onDuplicate, onHelp, probes, onProbe, onOpen, onMakeBlock }: {
  c: Circuit; edit: (c: Circuit, group?: string) => void; sel: Selection; onDelete: () => void; onDuplicate: () => void; onHelp: () => void;
  probes: PinRef[]; onProbe: (r: PinRef) => void; onOpen: (block: string) => void; onMakeBlock: () => void;
}) {
  const box = "p-3 rounded-xl border border-rim/60 bg-surface/30 space-y-2 font-mono text-[11px]";
  const field = "w-full bg-pit border border-rim/60 rounded px-2 py-1 text-[12px] text-pale";
  /** A checkbox that adds a signal to the logic analyzer. */
  const probe = (r: PinRef, label = "Probe in the logic analyzer") => (
    <label key={`${r.part}.${r.pin}`} className="flex items-center gap-2 text-ghost">
      <input type="checkbox" checked={probes.some((x) => sameRef(x, r))} onChange={() => onProbe(r)} /> {label}
    </label>
  );
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
        {sel.parts.length > 0 && <button onClick={onMakeBlock} className="text-info hover:underline" title="Ctrl+G">⧉ Make a block from these parts</button>}
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
        {probe(w.from)}
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
    const { inputs: ins, outputs: outs } = pins(next);           // dropping pins drops their wires
    edit({ ...c, parts: c.parts.map((x) => (x.id === p.id ? next : x)),
      wires: c.wires.filter((w) => (w.to.part !== p.id || ins.includes(w.to.pin)) && (w.from.part !== p.id || outs.includes(w.from.pin))) }, group);
  };
  const gate = ["and", "or", "xor", "nand", "nor", "xnor"].includes(p.kind);
  const resettable = ["dff", "tff", "jkff", "reg", "counter"].includes(p.kind);
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
      {hasWidth(p.kind) && (
        <label className="flex items-center gap-2 text-dim">{p.kind === "decoder" ? "select bits" : "width"}
          <select value={width(p)} onChange={(e) => set({ w: Number(e.target.value) })} aria-label="Width" className="bg-pit border border-rim/60 rounded px-1 text-[12px] text-pale">
            {widthChoices(p.kind).filter((n) => n <= MAX_WIDTH).map((n) => <option key={n} value={n}>{n} bit{n === 1 ? "" : "s"}</option>)}
          </select>
        </label>
      )}
      {p.kind === "const" && (
        <label className="flex items-center gap-2 text-dim">value
          <input type="number" min={0} max={2 ** width(p) - 1} value={constValue(p)} aria-label="Constant value"
                 onChange={(e) => set({ value: Math.max(0, Math.min(2 ** width(p) - 1, Number(e.target.value) || 0)) }, `value:${p.id}`)}
                 className="w-24 bg-pit border border-rim/60 rounded px-2 py-0.5 text-[12px] text-pale" />
        </label>
      )}
      {p.kind === "hexin" && <div className="text-dim">Click its display to count up, shift-click to count down.</div>}
      {p.kind === "block" && p.block && (
        <div className="space-y-1.5">
          <div className="text-dim">An instance of block <span className="text-info">{p.block}</span> (Verilog: <span className="text-pale">{p.block} u_{p.label}</span>).</div>
          <div className="text-dim">in: <span className="text-pale">{(p.ports?.inputs ?? []).map((x) => (x.width > 1 ? `${x.name}[${x.width}]` : x.name)).join(", ") || "none"}</span></div>
          <div className="text-dim">out: <span className="text-pale">{(p.ports?.outputs ?? []).map((x) => (x.width > 1 ? `${x.name}[${x.width}]` : x.name)).join(", ") || "none"}</span></div>
          <button onClick={() => onOpen(p.block!)} className="text-info hover:underline">Open {p.block} (or double-click it) →</button>
        </div>
      )}
      {resettable && (
        <label className="flex items-center gap-2 text-ghost">
          <input type="checkbox" checked={!!p.reset} onChange={(e) => set({ reset: e.target.checked })} /> asynchronous reset input
        </label>
      )}
      {(p.kind === "reg" || p.kind === "counter") && <div className="text-dim">An unconnected <span className="text-pale">en</span> reads 1: always enabled.</div>}
      {["led", "seg7", "hexout"].includes(p.kind) ? probe({ part: p.id, pin: "in" })
        : pins(p).outputs.length === 1 ? probe({ part: p.id, pin: pins(p).outputs[0] })
        : pins(p).outputs.map((o) => probe({ part: p.id, pin: o }, `Probe ${o}`))}
    </div>
  );
}

const IMPORT_EXAMPLE = `module full_adder (
    input  wire a, b, cin,
    output wire sum, cout
);
    assign sum  = a ^ b ^ cin;
    assign cout = (a & b) | (cin & (a ^ b));
endmodule
`;

/** Paste Verilog, synthesize it in the browser (lib/synth/client.ts), and draw it. */
function ImportPanel({ onCancel, onImport }: { onCancel: () => void; onImport: (c: Circuit, asBlock: boolean) => void }) {
  const [src, setSrc] = useState(IMPORT_EXAMPLE);
  const [asBlock, setAsBlock] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const go = async () => {
    setBusy(true); setError(null);
    try {
      const name = /\bmodule\s+([A-Za-z_]\w*)/.exec(src)?.[1] ?? "imported";
      const net = await synthesizeDesign("board", src, "verilog");
      if (!net?.ok) throw new Error(net?.error ?? "Synthesis failed.");
      const circuit = netlistToCircuit(net as BoardNetlist, name);
      if (typeof circuit === "string") throw new Error(circuit);
      onImport(circuit, asBlock);
    } catch (e) {
      setError((e as Error).message || "Synthesis failed.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="rounded-xl border border-info/30 bg-info/5 p-3 space-y-2 font-mono text-[11px]">
      <div className="text-ghost">
        Paste a Verilog module. It is synthesized to gates in your browser (the first run downloads the tools) and drawn as a circuit:
        up to {MAX_IMPORT_CELLS} gates; flip-flops must reset to 0. Ports named <span className="text-pale">clk</span> become clocks.
      </div>
      <textarea value={src} onChange={(e) => setSrc(e.target.value)} spellCheck={false} rows={9} aria-label="Verilog to import"
                className="w-full bg-pit border border-rim/60 rounded px-2 py-1.5 text-[12px] text-pale" />
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={go} disabled={busy} className="px-3 py-1 rounded bg-info/20 border border-info/50 text-info hover:text-bright disabled:opacity-50">
          {busy ? "Synthesizing…" : "Import"}
        </button>
        <label className="flex items-center gap-1.5 text-ghost">
          <input type="checkbox" checked={asBlock} onChange={(e) => setAsBlock(e.target.checked)} /> as a block in this circuit (else replace it; Ctrl+Z undoes)
        </label>
        <button onClick={onCancel} className="text-dim hover:text-bright">cancel</button>
        {error && <span className="text-danger">{error}</span>}
      </div>
    </div>
  );
}

/** The logic analyzer: probed signals over the last steps, drawn by lib/waveform-svg.ts; VCD to download. */
function Analyzer({ c, probes, steps, paused, live, onPause, onClear }: {
  c: Circuit; probes: PinRef[]; steps: number[][]; paused: boolean; live: boolean; onPause: () => void; onClear: () => void;
}) {
  const trace: Trace = { probes: probes.map((r) => probeInfo(c, r)), steps };
  const shown: Trace = { ...trace, steps: steps.slice(-TRACE_SHOWN) };
  const svg = live && probes.length && steps.length ? waveformSvg(traceToParsed(shown), {}, { width: 900, theme: "dark", maxSignals: 24 }).svg : "";
  const btn = "px-2 py-0.5 rounded border border-rim/60 text-ghost hover:text-bright disabled:opacity-40";
  return (
    <section className="space-y-2 font-mono text-[11px]">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-display text-[15px] font-semibold mr-1">Logic analyzer</h2>
        <span className="text-dim">{Math.max(0, steps.length - 1)} step{steps.length === 2 ? "" : "s"} · {probes.length} probe{probes.length === 1 ? "" : "s"}</span>
        <button className={btn} onClick={onPause} disabled={!live}>{paused ? "Resume" : "Pause"}</button>
        <button className={btn} onClick={onClear} disabled={!live}>Clear</button>
        <button className={btn} disabled={!live || steps.length < 2}
                onClick={() => downloadBlob(`${c.module}_trace.vcd`, traceToVcd(trace, c.module), "text/plain")}>Download VCD</button>
        <span className="text-dim">Each input change or clock edge is one step. Probe any wire or part from the side panel.</span>
      </div>
      {svg
        ? <div className="overflow-x-auto rounded-lg border border-rim/60 bg-void/60 [&>svg]:w-full [&>svg]:h-auto [&>svg]:min-w-[640px]" dangerouslySetInnerHTML={{ __html: svg }} />
        : <p className="text-dim">{live ? "Nothing probed yet." : "Fix the errors above to run the circuit."}</p>}
    </section>
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
