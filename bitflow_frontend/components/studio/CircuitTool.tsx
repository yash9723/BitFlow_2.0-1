"use client";
/**
 * components/studio/CircuitTool.tsx — /studio/circuit: place gates, flip-flops,
 * switches and LEDs, wire them, and watch them run live (lib/gate-sim.ts via
 * lib/studio/circuit.ts compile()). Exports structural Verilog with a testbench,
 * and hands combinational circuits to the truth-table tool.
 * Loaded client-only (components/studio/loaders.tsx): the draft is in localStorage.
 *
 * Canvas: drag a part's body to move it; drag from a pin to a pin to wire them
 * (an input takes one driver: a new wire replaces the old one); click a switch,
 * button or clock knob to drive it; click a part or wire to select it, Delete removes.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import GeneratedCode from "@/components/studio/GeneratedCode";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { GateSim } from "@/lib/gate-sim";
import {
  type Circuit, type InputEvent, type Part, type PartKind, type PinRef, type Wire, CIRCUIT_EXAMPLES, INPUT_KINDS,
  compile, defaultEvents, generateTestbench, generateVerilog, inputParts, outputParts, pins, validate,
} from "@/lib/studio/circuit";
import { tableFromNetlist } from "@/lib/studio/logic-min";

const VIEW = { w: 860, h: 520 };
const SNAP = 10;
const uid = (p: string) => `${p}${Math.random().toString(36).slice(2, 8)}`;

// ── Geometry ──────────────────────────────────────────────────────────────────

function size(p: Part): { w: number; h: number } {
  const n = pins(p).inputs.length;
  switch (p.kind) {
    case "switch": case "button": case "clock": case "const0": case "const1": return { w: 60, h: 36 };
    case "led": return { w: 44, h: 36 };
    case "seg7": return { w: 60, h: 104 };
    case "mux2": return { w: 56, h: 76 };
    case "dff": return { w: 64, h: n * 20 + 24 };
    case "not": return { w: 56, h: 36 };
    default: return { w: 64, h: Math.max(44, n * 16 + 12) };
  }
}

function pinPos(p: Part, pin: string): { x: number; y: number } {
  const { w, h } = size(p);
  const { inputs } = pins(p);
  const i = inputs.indexOf(pin);
  if (i >= 0) return { x: p.x, y: p.y + ((i + 1) * h) / (inputs.length + 1) };
  return { x: p.x + w, y: p.y + h / 2 };
}

/** Orthogonal route; `lane` staggers the vertical run so wires that share a gap don't overlap. */
function wirePath(a: { x: number; y: number }, b: { x: number; y: number }, lane = 0): string {
  if (b.x >= a.x + 16) {
    const room = Math.max(0, (b.x - a.x) / 2 - 8);
    const mx = Math.round((a.x + b.x) / 2 + Math.max(-room, Math.min(room, lane)));
    return `M ${a.x} ${a.y} H ${mx} V ${b.y} H ${b.x}`;
  }
  const midY = Math.round((a.y + b.y) / 2);          // going backwards (feedback): route around
  return `M ${a.x} ${a.y} H ${a.x + 12} V ${midY} H ${b.x - 12} V ${b.y} H ${b.x}`;
}

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

function valid(c: Circuit | null): c is Circuit {
  return !!c && Array.isArray(c.parts) && Array.isArray(c.wires) && typeof c.module === "string";
}

const EMPTY: Circuit = { module: "my_circuit", parts: [], wires: [] };

// ── Tool ──────────────────────────────────────────────────────────────────────

type Sel = { kind: "part" | "wire"; id: string } | null;
type Live = { sim: GateSim; netOf: ReturnType<typeof compile>["netOf"] } | null;

export default function CircuitTool() {
  const router = useRouter();
  const [stored, setC] = useLocalStorage<Circuit>("bitflow_studio_circuit", CIRCUIT_EXAMPLES[0].circuit);
  const c = valid(stored) ? stored : CIRCUIT_EXAMPLES[0].circuit;
  const [sel, setSel] = useState<Sel>(null);

  // Positions don't change the logic, so dragging doesn't rebuild the simulation or the checks
  const logicKey = JSON.stringify({ m: c.module, p: c.parts.map((p) => ({ id: p.id, kind: p.kind, label: p.label, n: p.n, reset: p.reset })), w: c.wires });
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

  const deleteSel = useCallback(() => {
    if (!sel) return;
    if (sel.kind === "wire") setC({ ...c, wires: c.wires.filter((w) => w.id !== sel.id) });
    else setC({ ...c, parts: c.parts.filter((p) => p.id !== sel.id), wires: c.wires.filter((w) => w.from.part !== sel.id && w.to.part !== sel.id) });
    setSel(null);
  }, [sel, c, setC]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if ((e.key === "Delete" || e.key === "Backspace") && tag !== "INPUT" && tag !== "TEXTAREA" && tag !== "SELECT") deleteSel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [deleteSel]);

  const addPart = (kind: PartKind) => {
    const k = c.parts.length;
    const p: Part = { id: uid("p"), kind, label: freshLabel(c, kind), x: 200 + (k % 6) * 30, y: 60 + (k % 8) * 30, ...(kind === "dff" ? { reset: false } : {}) };
    setC({ ...c, parts: [...c.parts, p] });
    setSel({ kind: "part", id: p.id });
  };
  const load = (circuit: Circuit) => { inputsRef.current = {}; setC(circuit); setSel(null); setHz(0); };

  const [tbSource, setTbSource] = useState<"auto" | "mine">("auto");
  const events = tbSource === "mine" && recorded.length ? recorded : null;
  const code = useMemo(
    () => (ok ? { design: generateVerilog(c), testbench: generateTestbench(c, events ?? defaultEvents(c)) } : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [logicKey, ok, events],
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
            clock to drive it: the circuit runs as you build it, and wires light up when they carry a 1.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
          <span className="text-dim">Examples:</span>
          {CIRCUIT_EXAMPLES.map((e) => <button key={e.label} onClick={() => load(e.circuit)} className={btn}>{e.label}</button>)}
          <button onClick={() => { if (window.confirm("Start an empty circuit? The current one is replaced.")) load(EMPTY); }}
                  className="px-2 py-1 rounded border border-dashed border-rim text-ghost hover:text-bright">New</button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 font-mono text-[11px]">
        <label className="flex items-center gap-2 text-dim">module
          <input value={c.module} onChange={(e) => setC({ ...c, module: e.target.value.trim() })} aria-label="Module name"
                 className="w-36 bg-pit border border-rim/60 rounded px-2 py-1 text-[12px] text-pale" />
        </label>
        <span className="text-dim">|</span>
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
        </div>
        <Canvas c={c} setC={setC} sel={sel} setSel={setSel} live={simRef.current} inputs={inputsRef.current} drive={drive} pulse={pulse} />
        <div className="space-y-4 min-w-0">
          <Inspector c={c} setC={setC} sel={sel} onDelete={deleteSel} />
          <Issues issues={issues} onPick={(id) => setSel({ kind: "part", id })} />
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

type Drag = { kind: "move"; id: string; dx: number; dy: number } | { kind: "wire"; from: PinRef; isOutput: boolean; x: number; y: number } | null;

function Canvas({ c, setC, sel, setSel, live, inputs, drive, pulse }: {
  c: Circuit; setC: (c: Circuit) => void; sel: Sel; setSel: (s: Sel) => void; live: Live;
  inputs: Record<string, number>; drive: (label: string, v: number) => void; pulse: (labels: string[]) => void;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<Drag>(null);
  const toSvg = (e: React.PointerEvent) => {
    const ctm = svg.current?.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  };
  const capture = (e: React.PointerEvent) => { try { svg.current?.setPointerCapture(e.pointerId); } catch { /* not an active pointer */ } };
  const byId = new Map(c.parts.map((p) => [p.id, p]));
  const valueOf = (r: PinRef) => { const n = live?.netOf(r); return live && n !== undefined ? live.sim.net(n) : 0; };

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

  const onMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const p = toSvg(e);
    if (drag.kind === "move") {
      const x = Math.max(0, Math.min(VIEW.w - 40, Math.round((p.x - drag.dx) / SNAP) * SNAP));
      const y = Math.max(12, Math.min(VIEW.h - 40, Math.round((p.y - drag.dy) / SNAP) * SNAP));
      const part = byId.get(drag.id);
      if (part && (part.x !== x || part.y !== y)) setC({ ...c, parts: c.parts.map((q) => (q.id === drag.id ? { ...q, x, y } : q)) });
    } else setDrag({ ...drag, x: p.x, y: p.y });
  };
  const onUp = (e: React.PointerEvent) => {
    if (drag?.kind === "wire") {
      const p = toSvg(e);
      const hit = pinAt(p.x, p.y);
      if (hit && hit.isOutput !== drag.isOutput && hit.ref.part !== drag.from.part) {
        const from = drag.isOutput ? drag.from : hit.ref, to = drag.isOutput ? hit.ref : drag.from;
        const w: Wire = { id: uid("w"), from, to };
        setC({ ...c, wires: [...c.wires.filter((x) => !(x.to.part === to.part && x.to.pin === to.pin)), w] });   // one driver per input
        setSel({ kind: "wire", id: w.id });
      }
    }
    setDrag(null);
  };

  const pendingFrom = drag?.kind === "wire" ? byId.get(drag.from.part) : undefined;
  const pending = drag?.kind === "wire" && pendingFrom ? pinPos(pendingFrom, drag.from.pin) : null;

  return (
    <div className="border border-rim/60 rounded-xl bg-pit overflow-x-auto">
      <svg ref={svg} viewBox={`0 0 ${VIEW.w} ${VIEW.h}`} className="w-full min-w-[640px] h-auto block select-none touch-none" role="application"
           aria-label="Circuit editor" onPointerMove={onMove} onPointerUp={onUp} onPointerDown={() => setSel(null)}>
        <defs>
          <pattern id="cgrid" width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="0.8" fill="#1d1f29" /></pattern>
        </defs>
        <rect width={VIEW.w} height={VIEW.h} fill="url(#cgrid)" />

        {c.wires.map((w, i) => {
          const a = byId.get(w.from.part), b = byId.get(w.to.part);
          if (!a || !b) return null;
          const d = wirePath(pinPos(a, w.from.pin), pinPos(b, w.to.pin), ((i % 5) - 2) * 7);
          const on = valueOf(w.from) === 1, selected = sel?.kind === "wire" && sel.id === w.id;
          return (
            <g key={w.id} data-wire={w.id} onPointerDown={(e) => { e.stopPropagation(); setSel({ kind: "wire", id: w.id }); }} style={{ cursor: "pointer" }}>
              <path d={d} stroke="transparent" strokeWidth={10} fill="none" />
              <path d={d} stroke={selected ? "#4db8ff" : on ? "#00e87a" : "#4a4d60"} strokeWidth={selected ? 2.5 : 2} fill="none" strokeLinejoin="round" />
            </g>
          );
        })}

        {c.parts.map((p) => (
          <PartView key={p.id} p={p} selected={sel?.kind === "part" && sel.id === p.id} valueOf={valueOf}
                    inputValue={inputs[p.label] ?? 0} outputBits={live && (p.kind === "led" || p.kind === "seg7") ? live.sim.get(p.label) : null}
                    onBodyDown={(e) => {
                      e.stopPropagation(); capture(e);
                      const q = toSvg(e);
                      setSel({ kind: "part", id: p.id });
                      setDrag({ kind: "move", id: p.id, dx: q.x - p.x, dy: q.y - p.y });
                    }}
                    onPinDown={(e, pin, isOutput) => {
                      e.stopPropagation(); capture(e);
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
        {!c.parts.length && (
          <text x={VIEW.w / 2} y={VIEW.h / 2} textAnchor="middle" fontSize={14} fill="#4a4d60" fontFamily="monospace">Add parts from the palette</text>
        )}
      </svg>
    </div>
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

function Inspector({ c, setC, sel, onDelete }: { c: Circuit; setC: (c: Circuit) => void; sel: Sel; onDelete: () => void }) {
  const box = "p-3 rounded-xl border border-rim/60 bg-surface/30 space-y-2 font-mono text-[11px]";
  const field = "w-full bg-pit border border-rim/60 rounded px-2 py-1 text-[12px] text-pale";
  if (!sel) {
    return (
      <div className={box}>
        <div className="text-ghost">Nothing selected.</div>
        <ul className="text-dim list-disc pl-4 space-y-1">
          <li>Add parts from the palette; drag a part&apos;s body to move it.</li>
          <li>Drag from an output pin (right) to an input pin (left) to wire them.</li>
          <li>Click a switch, button or clock knob to drive it.</li>
        </ul>
      </div>
    );
  }
  if (sel.kind === "wire") {
    const w = c.wires.find((x) => x.id === sel.id);
    if (!w) return null;
    const name = (r: PinRef) => `${c.parts.find((p) => p.id === r.part)?.label ?? "?"}.${r.pin}`;
    return (
      <div className={box}>
        <div className="flex items-center justify-between"><span className="text-ghost uppercase tracking-wider">Wire</span>
          <button onClick={onDelete} className="text-dim hover:text-danger">delete</button></div>
        <div className="text-pale">{name(w.from)} → {name(w.to)}</div>
      </div>
    );
  }
  const p = c.parts.find((x) => x.id === sel.id);
  if (!p) return null;
  const set = (patch: Partial<Part>) => {
    const next = { ...p, ...patch };
    const keep = new Set(pins(next).inputs);                       // dropping inputs drops their wires
    setC({ ...c, parts: c.parts.map((x) => (x.id === p.id ? next : x)),
      wires: c.wires.filter((w) => w.to.part !== p.id || keep.has(w.to.pin)) });
  };
  const gate = ["and", "or", "xor", "nand", "nor", "xnor"].includes(p.kind);
  return (
    <div className={box}>
      <div className="flex items-center justify-between"><span className="text-ghost uppercase tracking-wider">{p.kind}</span>
        <button onClick={onDelete} className="text-dim hover:text-danger">delete</button></div>
      {p.kind !== "const0" && p.kind !== "const1" && (
        <label className="block space-y-1"><span className="text-dim">Label (its Verilog name)</span>
          <input value={p.label} onChange={(e) => set({ label: e.target.value.trim() })} aria-label="Label" className={field} />
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
