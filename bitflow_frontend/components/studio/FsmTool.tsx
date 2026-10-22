"use client";
/**
 * components/studio/FsmTool.tsx — /studio/fsm: draw a state machine, step it clock by
 * clock, and get Verilog plus a self-checking testbench. The model, checks and code
 * generation live in lib/studio/fsm.ts (conditions in lib/studio/expr.ts).
 * Loaded client-only (components/studio/loaders.tsx): the draft is in localStorage.
 *
 * Canvas: double-click empty space for a state; drag a state to move it; drag from
 * the green handle of the selected state (or shift-drag a state) to another state,
 * or back onto itself, for a transition; click to select, Delete to remove.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import GeneratedCode from "@/components/studio/GeneratedCode";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { synthesizeDesign } from "@/lib/synth/client";
import type { Values } from "@/lib/studio/expr";
import {
  type FsmModel, type FsmState, type FsmTransition, type Port, FSM_EXAMPLES, MAX_PORT_WIDTH,
  fromExtracted, generateTestbench, generateVerilog, guidedWalk, step, validate,
} from "@/lib/studio/fsm";

const R = 34;                         // state circle radius
const VIEW = { w: 780, h: 470 };
const uid = (p: string) => `${p}${Math.random().toString(36).slice(2, 8)}`;

type Sel = { kind: "state" | "transition"; id: string } | null;
type Drag =
  | { kind: "move"; id: string; dx: number; dy: number }
  | { kind: "connect"; from: string; x: number; y: number }
  | null;
interface SimStep { state: string; inputs: Values; outputs: Record<string, bigint>; taken: string | null }

function valid(m: FsmModel | null): m is FsmModel {
  return !!m && Array.isArray(m.states) && Array.isArray(m.transitions) && Array.isArray(m.inputs) && Array.isArray(m.outputs) && typeof m.module === "string";
}

const EMPTY: FsmModel = {
  module: "my_fsm", kind: "moore", encoding: "binary", reset: "s0",
  inputs: [{ name: "x", width: 1 }], outputs: [{ name: "y", width: 1 }],
  states: [{ id: "s0", name: "S0", x: 200, y: 230, outputs: {} }], transitions: [],
};

export default function FsmTool() {
  const [stored, setModel] = useLocalStorage<FsmModel>("bitflow_studio_fsm", FSM_EXAMPLES[0].model);
  const m = valid(stored) ? stored : FSM_EXAMPLES[0].model;
  const [sel, setSel] = useState<Sel>(null);

  // Simulation (clock by clock from reset)
  const [simState, setSimState] = useState(m.reset);
  const [simInputs, setSimInputs] = useState<Values>({});
  const [history, setHistory] = useState<SimStep[]>([]);
  const [tbSource, setTbSource] = useState<"auto" | "steps">("auto");
  const resetSim = useCallback(() => { setSimState(m.reset); setHistory([]); }, [m.reset]);
  useEffect(() => { if (!m.states.some((s) => s.id === simState)) resetSim(); }, [m.states, simState, resetSim]);

  // Positions don't affect checks or code, so dragging a state doesn't re-run them
  const logicKey = JSON.stringify({ ...m, states: m.states.map((s) => ({ id: s.id, name: s.name, outputs: s.outputs })) });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const issues = useMemo(() => validate(m), [logicKey]);
  const simulable = !issues.some((i) => i.level === "error");
  const preview = useMemo(
    () => (simulable ? step(m, simState, simInputs) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [logicKey, simState, simInputs, simulable],
  );
  const steps = useMemo(() => (tbSource === "steps" && history.length ? history.map((h) => h.inputs) : null), [tbSource, history]);
  const code = useMemo(
    () => (simulable ? { design: generateVerilog(m), testbench: generateTestbench(m, steps ?? guidedWalk(m, 32)) } : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [logicKey, simulable, steps],
  );

  const update = (f: (m: FsmModel) => FsmModel) => setModel(f(m));
  const load = (model: FsmModel) => { setModel(model); setSel(null); setSimState(model.reset); setHistory([]); setTbSource("auto"); };
  const clock = () => {
    if (!preview) return;
    setHistory((h) => [...h, { state: simState, inputs: simInputs, outputs: preview.outputs, taken: preview.taken }]);
    setSimState(preview.next);
  };

  const deleteSel = useCallback(() => {
    if (!sel) return;
    if (sel.kind === "transition") setModel({ ...m, transitions: m.transitions.filter((t) => t.id !== sel.id) });
    else {
      const states = m.states.filter((s) => s.id !== sel.id);
      setModel({ ...m, states, transitions: m.transitions.filter((t) => t.from !== sel.id && t.to !== sel.id),
        reset: m.reset === sel.id ? states[0]?.id ?? "" : m.reset });
    }
    setSel(null);
  }, [sel, m, setModel]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if ((e.key === "Delete" || e.key === "Backspace") && tag !== "INPUT" && tag !== "TEXTAREA" && tag !== "SELECT") deleteSel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [deleteSel]);

  const lastTaken = history.length ? history[history.length - 1].taken : null;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold">FSM designer</h1>
          <p className="text-[12px] text-ghost max-w-3xl">
            Double-click to add a state. Drag a state to move it; drag from its green handle (or shift-drag it) to another
            state for a transition. Transitions from a state are tried top to bottom; with none true the machine stays.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
          <span className="text-dim">Examples:</span>
          {FSM_EXAMPLES.map((e) => (
            <button key={e.label} onClick={() => load(e.model)}
                    className="px-2 py-1 rounded border border-rim/60 text-ghost hover:text-bright hover:border-phosphor/50">{e.label}</button>
          ))}
          <button onClick={() => { if (window.confirm("Start an empty machine? The current one is replaced.")) load(EMPTY); }}
                  className="px-2 py-1 rounded border border-dashed border-rim text-ghost hover:text-bright">New</button>
        </div>
      </div>

      <Header m={m} update={update} />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_330px]">
        <Canvas m={m} sel={sel} setSel={setSel} update={update} simState={simState} lastTaken={lastTaken} />
        <div className="space-y-4 min-w-0">
          <Inspector m={m} sel={sel} update={update} onDelete={deleteSel} />
          <Issues issues={issues} onPick={(at) => setSel(m.states.some((s) => s.id === at) ? { kind: "state", id: at } : { kind: "transition", id: at })} />
        </div>
      </div>

      <Simulator m={m} enabled={simulable} state={simState} inputs={simInputs} setInputs={setSimInputs}
                 preview={preview} history={history} onClock={clock} onReset={resetSim} />

      <section className="space-y-3 border-t border-rim/40 pt-5">
        <div className="flex flex-wrap items-center gap-3 font-mono text-[11px]">
          <h2 className="font-display text-[15px] font-semibold">Verilog</h2>
          <span className="text-dim">testbench drives</span>
          <label className="flex items-center gap-1"><input type="radio" checked={tbSource === "auto"} onChange={() => setTbSource("auto")} /> a 32-cycle walk that takes every transition it can</label>
          <label className={`flex items-center gap-1 ${history.length ? "" : "opacity-50"}`}>
            <input type="radio" disabled={!history.length} checked={tbSource === "steps"} onChange={() => setTbSource("steps")} /> my {history.length} simulated cycle{history.length === 1 ? "" : "s"}
          </label>
        </div>
        {code ? <GeneratedCode module={m.module} design={code.design} testbench={code.testbench} />
              : <p className="text-[12px] text-dim">Fix the errors above to generate Verilog.</p>}
      </section>

      <ImportFromCode onModel={load} />
    </div>
  );
}

// ── Module header: name, kind, encoding, ports ─────────────────────────────────

function fresh(m: FsmModel, pool: string[]): string {
  const used = new Set([...m.inputs, ...m.outputs].map((p) => p.name));
  return pool.find((p) => !used.has(p)) ?? `p${used.size}`;
}

function Header({ m, update }: { m: FsmModel; update: (f: (m: FsmModel) => FsmModel) => void }) {
  const field = "bg-pit border border-rim/60 rounded px-2 py-1 text-pale text-[12px]";
  const setPorts = (kind: "inputs" | "outputs", ports: Port[]) => update((x) => ({ ...x, [kind]: ports }));
  /** Output values are keyed by output name, so a rename carries them along. */
  const renameOutput = (i: number, name: string) => update((x) => {
    const old = x.outputs[i].name;
    const remap = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k === old ? name : k, v]));
    return { ...x, outputs: x.outputs.map((p, j) => (j === i ? { ...p, name } : p)),
      states: x.states.map((s) => ({ ...s, outputs: remap(s.outputs) })),
      transitions: x.transitions.map((t) => ({ ...t, outputs: remap(t.outputs) })) };
  });
  const ports = (kind: "inputs" | "outputs") => (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-dim">{kind === "inputs" ? "Inputs" : "Outputs"}</span>
      {m[kind].map((p, i) => (
        <span key={i} className="flex items-center gap-1 bg-surface/60 border border-rim/60 rounded px-1.5 py-1">
          <input value={p.name} aria-label={`${kind} ${i + 1} name`} className="w-16 bg-transparent text-[12px] text-pale focus:outline-none"
                 onChange={(e) => kind === "outputs" ? renameOutput(i, e.target.value.trim())
                   : setPorts(kind, m[kind].map((q, j) => (j === i ? { ...q, name: e.target.value.trim() } : q)))} />
          <input type="number" min={1} max={MAX_PORT_WIDTH} value={p.width} aria-label={`${p.name} width in bits`} title="width in bits"
                 className="w-9 bg-transparent text-[12px] text-pale focus:outline-none"
                 onChange={(e) => setPorts(kind, m[kind].map((q, j) => (j === i ? { ...q, width: Math.max(1, Math.min(MAX_PORT_WIDTH, Number(e.target.value) || 1)) } : q)))} />
          <span className="text-dim">bit</span>
          <button onClick={() => setPorts(kind, m[kind].filter((_, j) => j !== i))} aria-label={`Remove ${p.name}`} className="text-dim hover:text-danger">×</button>
        </span>
      ))}
      <button onClick={() => setPorts(kind, [...m[kind], { name: fresh(m, kind === "inputs" ? ["a", "b", "c", "go", "en", "start"] : ["z", "done", "busy", "q"]), width: 1 }])}
              aria-label={`Add ${kind === "inputs" ? "an input" : "an output"}`}
              className="px-2 py-1 rounded border border-dashed border-rim text-ghost hover:text-bright">+</button>
    </div>
  );
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-[11px]">
      <label className="flex items-center gap-2 text-dim">module
        <input value={m.module} onChange={(e) => update((x) => ({ ...x, module: e.target.value.trim() }))} aria-label="Module name" className={`w-32 ${field}`} />
      </label>
      <div className="flex items-center gap-1">
        {(["moore", "mealy"] as const).map((k) => (
          <button key={k} onClick={() => update((x) => ({ ...x, kind: k }))} title={k === "moore" ? "Outputs belong to states" : "Outputs belong to transitions"}
                  className={`px-2 py-1 rounded border ${m.kind === k ? "border-info/60 text-info bg-info/10" : "border-rim/60 text-ghost"}`}>
            {k === "moore" ? "Moore" : "Mealy"}
          </button>
        ))}
      </div>
      <label className="flex items-center gap-2 text-dim">encoding
        <select value={m.encoding} onChange={(e) => update((x) => ({ ...x, encoding: e.target.value as FsmModel["encoding"] }))} className={field}>
          <option value="binary">binary</option><option value="onehot">one-hot</option>
        </select>
      </label>
      {ports("inputs")}
      {ports("outputs")}
    </div>
  );
}

// ── Canvas ─────────────────────────────────────────────────────────────────────

/** Path and label position for a transition; curved when there is a reverse or parallel edge. */
function edgeGeom(m: FsmModel, t: FsmTransition): { d: string; lx: number; ly: number } | null {
  const a = m.states.find((s) => s.id === t.from), b = m.states.find((s) => s.id === t.to);
  if (!a || !b) return null;
  if (a.id === b.id) {
    const k = m.transitions.filter((x) => x.from === a.id && x.to === a.id).indexOf(t);
    const h = 52 + 22 * k;
    const p = (deg: number, r: number) => [a.x + r * Math.cos((deg * Math.PI) / 180), a.y + r * Math.sin((deg * Math.PI) / 180)];
    const [sx, sy] = p(-115, R), [ex, ey] = p(-65, R + 3), [c1x, c1y] = p(-125, R + h), [c2x, c2y] = p(-55, R + h);
    return { d: `M ${sx} ${sy} C ${c1x} ${c1y} ${c2x} ${c2y} ${ex} ${ey}`, lx: a.x, ly: a.y - R - h * 0.78 };
  }
  const k = m.transitions.filter((x) => x.from === t.from && x.to === t.to).indexOf(t);
  const reverse = m.transitions.some((x) => x.from === t.to && x.to === t.from);
  const off = reverse || k > 0 ? 30 + 26 * k : 0;
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  const cx = (a.x + b.x) / 2 + nx * off * 2, cy = (a.y + b.y) / 2 + ny * off * 2;
  const toward = (fx: number, fy: number, tx: number, ty: number, r: number) => {
    const l = Math.hypot(tx - fx, ty - fy) || 1;
    return [fx + ((tx - fx) / l) * r, fy + ((ty - fy) / l) * r];
  };
  const [sx, sy] = toward(a.x, a.y, cx, cy, R), [ex, ey] = toward(b.x, b.y, cx, cy, R + 3);
  return { d: `M ${sx} ${sy} Q ${cx} ${cy} ${ex} ${ey}`, lx: 0.25 * sx + 0.5 * cx + 0.25 * ex + nx * 10, ly: 0.25 * sy + 0.5 * cy + 0.25 * ey + ny * 10 };
}

const short = (s: string, n = 26) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const outText = (m: FsmModel, outs: Record<string, string>) =>
  m.outputs.filter((o) => outs[o.name]?.trim()).map((o) => `${o.name}=${outs[o.name].trim()}`).join(" ");

function Canvas({ m, sel, setSel, update, simState, lastTaken }: {
  m: FsmModel; sel: Sel; setSel: (s: Sel) => void; update: (f: (m: FsmModel) => FsmModel) => void;
  simState: string; lastTaken: string | null;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<Drag>(null);
  const toSvg = (e: React.PointerEvent | React.MouseEvent) => {
    const ctm = svg.current?.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  };
  const stateAt = (x: number, y: number) => m.states.find((s) => Math.hypot(s.x - x, s.y - y) <= R + 4);
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

  const startDrag = (e: React.PointerEvent, d: Drag) => {
    e.stopPropagation();
    try { svg.current?.setPointerCapture(e.pointerId); } catch { /* not an active pointer */ }
    setDrag(d);
  };
  const onStateDown = (e: React.PointerEvent, s: FsmState) => {
    const p = toSvg(e);
    setSel({ kind: "state", id: s.id });
    startDrag(e, e.shiftKey ? { kind: "connect", from: s.id, x: p.x, y: p.y } : { kind: "move", id: s.id, dx: p.x - s.x, dy: p.y - s.y });
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const p = toSvg(e);
    if (drag.kind === "move") {
      const x = clamp(Math.round(p.x - drag.dx), R + 4, VIEW.w - R - 4), y = clamp(Math.round(p.y - drag.dy), R + 4, VIEW.h - R - 4);
      update((mm) => ({ ...mm, states: mm.states.map((s) => (s.id === drag.id ? { ...s, x, y } : s)) }));
    } else setDrag({ ...drag, x: p.x, y: p.y });
  };
  const onUp = (e: React.PointerEvent) => {
    if (drag?.kind === "connect") {
      const p = toSvg(e);
      const target = stateAt(p.x, p.y);
      if (target) {
        const t: FsmTransition = { id: uid("t"), from: drag.from, to: target.id, cond: "", outputs: {} };
        update((mm) => ({ ...mm, transitions: [...mm.transitions, t] }));
        setSel({ kind: "transition", id: t.id });
      }
    }
    setDrag(null);
  };
  const onDouble = (e: React.MouseEvent) => {
    const p = toSvg(e);
    if (stateAt(p.x, p.y)) return;
    const used = new Set(m.states.map((s) => s.name));
    let n = m.states.length, name = `S${n}`;
    while (used.has(name)) name = `S${++n}`;
    const s: FsmState = { id: uid("s"), name, x: Math.round(clamp(p.x, R + 4, VIEW.w - R - 4)), y: Math.round(clamp(p.y, R + 4, VIEW.h - R - 4)), outputs: {} };
    update((mm) => ({ ...mm, states: [...mm.states, s], reset: mm.states.length ? mm.reset : s.id }));
    setSel({ kind: "state", id: s.id });
  };

  const from = drag?.kind === "connect" ? m.states.find((s) => s.id === drag.from) : null;
  return (
    <div className="border border-rim/60 rounded-xl bg-pit overflow-x-auto">
      <svg ref={svg} viewBox={`0 0 ${VIEW.w} ${VIEW.h}`} className="w-full min-w-[620px] h-auto block select-none touch-none" role="application"
           aria-label="State diagram editor" onPointerMove={onMove} onPointerUp={onUp} onDoubleClick={onDouble}
           onPointerDown={() => setSel(null)}>
        <defs>
          {[["arrow", "#8b8fa3"], ["arrow-sel", "#4db8ff"], ["arrow-hot", "#00e87a"]].map(([id, c]) => (
            <marker key={id} id={id} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill={c} />
            </marker>
          ))}
          <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="0.8" fill="#1d1f29" /></pattern>
        </defs>
        <rect width={VIEW.w} height={VIEW.h} fill="url(#grid)" />

        {m.transitions.map((t) => {
          const g = edgeGeom(m, t);
          if (!g) return null;
          const selected = sel?.kind === "transition" && sel.id === t.id, hot = t.id === lastTaken;
          const color = selected ? "#4db8ff" : hot ? "#00e87a" : "#8b8fa3";
          const label = `${t.cond.trim() || "always"}${outText(m, t.outputs) ? ` / ${outText(m, t.outputs)}` : ""}`;
          return (
            <g key={t.id} data-transition={t.id} onPointerDown={(e) => { e.stopPropagation(); setSel({ kind: "transition", id: t.id }); }} style={{ cursor: "pointer" }}>
              <path d={g.d} stroke="transparent" strokeWidth={14} fill="none" />
              <path d={g.d} stroke={color} strokeWidth={selected || hot ? 2.2 : 1.5} fill="none"
                    markerEnd={`url(#${selected ? "arrow-sel" : hot ? "arrow-hot" : "arrow"})`} />
              <text x={g.lx} y={g.ly} textAnchor="middle" fontSize={11} fontFamily="monospace" fill={color}
                    stroke="#0b0c10" strokeWidth={3} paintOrder="stroke">
                <title>{label}</title>{short(label)}
              </text>
            </g>
          );
        })}

        {from && drag?.kind === "connect" && (
          <line x1={from.x} y1={from.y} x2={drag.x} y2={drag.y} stroke="#00e87a" strokeDasharray="5 4" markerEnd="url(#arrow-hot)" />
        )}

        {m.states.map((s) => {
          const selected = sel?.kind === "state" && sel.id === s.id, current = s.id === simState;
          const outs = outText(m, s.outputs);
          return (
            <g key={s.id} data-state={s.name} onPointerDown={(e) => onStateDown(e, s)} style={{ cursor: "grab" }}>
              {s.id === m.reset && (
                <line x1={s.x - R - 30} y1={s.y} x2={s.x - R - 3} y2={s.y} stroke="#8b8fa3" strokeWidth={1.5} markerEnd="url(#arrow)" />
              )}
              <circle cx={s.x} cy={s.y} r={R} fill={current ? "rgba(0,232,122,0.14)" : "#13141a"}
                      stroke={selected ? "#4db8ff" : current ? "#00e87a" : "#3a3d4f"} strokeWidth={selected || current ? 2.5 : 1.5} />
              {s.id === m.reset && <circle cx={s.x} cy={s.y} r={R - 4} fill="none" stroke="#3a3d4f" />}
              <text x={s.x} y={outs ? s.y - 2 : s.y + 4} textAnchor="middle" fontSize={12} fontWeight={700} fontFamily="monospace" fill="#e7e9f0">
                {short(s.name, 9)}
              </text>
              {outs && (
                <text x={s.x} y={s.y + 13} textAnchor="middle" fontSize={9} fontFamily="monospace" fill="#ffb547">
                  <title>{outs}</title>{short(outs, 11)}
                </text>
              )}
              {selected && (
                <circle data-handle={s.name} cx={s.x + R} cy={s.y} r={7} fill="#00e87a" stroke="#0b0c10" strokeWidth={2} style={{ cursor: "crosshair" }}
                        onPointerDown={(e) => { const p = toSvg(e); startDrag(e, { kind: "connect", from: s.id, x: p.x, y: p.y }); }}>
                  <title>Drag to another state (or back to this one) to add a transition</title>
                </circle>
              )}
            </g>
          );
        })}
        {!m.states.length && (
          <text x={VIEW.w / 2} y={VIEW.h / 2} textAnchor="middle" fontSize={14} fill="#4a4d60" fontFamily="monospace">Double-click to add a state</text>
        )}
      </svg>
    </div>
  );
}

// ── Inspector: edit the selected state or transition ───────────────────────────

function Inspector({ m, sel, update, onDelete }: {
  m: FsmModel; sel: Sel; update: (f: (m: FsmModel) => FsmModel) => void; onDelete: () => void;
}) {
  const box = "p-3 rounded-xl border border-rim/60 bg-surface/30 space-y-2 font-mono text-[11px]";
  const field = "w-full bg-pit border border-rim/60 rounded px-2 py-1 text-pale text-[12px]";
  if (!sel) {
    return (
      <div className={box}>
        <div className="text-ghost">Nothing selected.</div>
        <ul className="text-dim list-disc pl-4 space-y-1">
          <li>Double-click the canvas to add a state.</li>
          <li>Select a state, then drag its green handle to another state to add a transition.</li>
          <li>Click a state or arrow to edit it here; Delete removes it.</li>
        </ul>
      </div>
    );
  }
  const outputsEditor = (outs: Record<string, string>, set: (o: Record<string, string>) => void, hint: string) => (
    <div className="space-y-1">
      <div className="text-dim">{hint}</div>
      {m.outputs.length === 0 && <div className="text-dim">No outputs: add some in the header.</div>}
      {m.outputs.map((o) => (
        <label key={o.name} className="flex items-center gap-2">
          <span className="w-20 truncate text-pale">{o.name}</span>
          <input value={outs[o.name] ?? ""} placeholder="0" aria-label={`${o.name} value`} onChange={(e) => set({ ...outs, [o.name]: e.target.value })} className={field} />
        </label>
      ))}
    </div>
  );

  if (sel.kind === "state") {
    const s = m.states.find((x) => x.id === sel.id);
    if (!s) return null;
    const setState = (patch: Partial<FsmState>) => update((x) => ({ ...x, states: x.states.map((y) => (y.id === s.id ? { ...y, ...patch } : y)) }));
    const outgoing = m.transitions.filter((t) => t.from === s.id);
    const move = (id: string, dir: -1 | 1) => update((x) => {
      const list = [...x.transitions];
      const mine = list.map((t, i) => [t, i] as const).filter(([t]) => t.from === s.id);
      const k = mine.findIndex(([t]) => t.id === id), j = k + dir;
      if (j < 0 || j >= mine.length) return x;
      [list[mine[k][1]], list[mine[j][1]]] = [list[mine[j][1]], list[mine[k][1]]];
      return { ...x, transitions: list };
    });
    const name = (id: string) => m.states.find((x) => x.id === id)?.name ?? "?";
    return (
      <div className={box}>
        <div className="flex items-center justify-between"><span className="text-ghost uppercase tracking-wider">State</span>
          <button onClick={onDelete} className="text-dim hover:text-danger">delete</button></div>
        <input value={s.name} onChange={(e) => setState({ name: e.target.value.trim() })} aria-label="State name" className={field} />
        <label className="flex items-center gap-2 text-ghost">
          <input type="radio" checked={m.reset === s.id} onChange={() => update((x) => ({ ...x, reset: s.id }))} /> reset state
        </label>
        {(m.kind === "moore" || Object.values(s.outputs).some((v) => v.trim())) &&
          outputsEditor(s.outputs, (outputs) => setState({ outputs }), "Outputs in this state (Moore); empty means 0:")}
        <div className="text-dim pt-1">Transitions out, tried in this order:</div>
        {outgoing.length === 0 && <div className="text-dim">None: the machine stays here.</div>}
        {outgoing.map((t, i) => (
          <div key={t.id} className="flex items-center gap-1">
            <span className="flex-1 truncate text-pale" title={t.cond}>→ {name(t.to)} <span className="text-dim">if {t.cond.trim() || "always"}</span></span>
            <button disabled={i === 0} onClick={() => move(t.id, -1)} aria-label="Move up" className="px-1 text-dim hover:text-bright disabled:opacity-30">↑</button>
            <button disabled={i === outgoing.length - 1} onClick={() => move(t.id, 1)} aria-label="Move down" className="px-1 text-dim hover:text-bright disabled:opacity-30">↓</button>
          </div>
        ))}
      </div>
    );
  }

  const t = m.transitions.find((x) => x.id === sel.id);
  if (!t) return null;
  const setT = (patch: Partial<FsmTransition>) => update((x) => ({ ...x, transitions: x.transitions.map((y) => (y.id === t.id ? { ...y, ...patch } : y)) }));
  const pick = (value: string, onChange: (v: string) => void, label: string) => (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} className={field}>
      {m.states.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
    </select>
  );
  return (
    <div className={box}>
      <div className="flex items-center justify-between"><span className="text-ghost uppercase tracking-wider">Transition</span>
        <button onClick={onDelete} className="text-dim hover:text-danger">delete</button></div>
      <div className="flex items-center gap-2">{pick(t.from, (from) => setT({ from }), "From state")}<span className="text-dim">→</span>{pick(t.to, (to) => setT({ to }), "To state")}</div>
      <label className="block space-y-1">
        <span className="text-dim">Condition (Verilog, e.g. <span className="text-pale">din &amp;&amp; !en</span>, <span className="text-pale">count == 4&apos;d9</span>); empty = always</span>
        <input value={t.cond} onChange={(e) => setT({ cond: e.target.value })} placeholder="always" aria-label="Condition" className={field} />
      </label>
      {(m.kind === "mealy" || Object.values(t.outputs).some((v) => v.trim())) &&
        outputsEditor(t.outputs, (outputs) => setT({ outputs }), "Outputs while this transition is taken (Mealy):")}
    </div>
  );
}

function Issues({ issues, onPick }: { issues: ReturnType<typeof validate>; onPick: (at: string) => void }) {
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

// ── Simulator ──────────────────────────────────────────────────────────────────

function Simulator({ m, enabled, state, inputs, setInputs, preview, history, onClock, onReset }: {
  m: FsmModel; enabled: boolean; state: string; inputs: Values; setInputs: (v: Values) => void;
  preview: ReturnType<typeof step> | null; history: SimStep[]; onClock: () => void; onReset: () => void;
}) {
  const name = (id: string) => m.states.find((s) => s.id === id)?.name ?? "?";
  const btn = "px-3 py-1.5 rounded-lg border font-mono text-[12px] disabled:opacity-40";
  return (
    <section className="p-4 rounded-xl border border-rim/60 bg-surface/20 space-y-3">
      <div className="flex flex-wrap items-center gap-3 font-mono text-[12px]">
        <h2 className="font-display text-[15px] font-semibold">Simulate</h2>
        <span className="text-dim">state</span><span className="text-phosphor font-bold">{name(state)}</span>
        {m.inputs.map((p) => (
          <label key={p.name} className="flex items-center gap-1.5">
            <span className="text-pale">{p.name}</span>
            {p.width === 1 ? (
              <button onClick={() => setInputs({ ...inputs, [p.name]: Number(inputs[p.name] ?? 0) ? 0 : 1 })} aria-label={`Toggle ${p.name}`}
                      className={`w-8 py-0.5 rounded border ${Number(inputs[p.name] ?? 0) ? "border-phosphor/60 text-phosphor bg-phosphor/10" : "border-rim/60 text-dim"}`}>
                {Number(inputs[p.name] ?? 0)}
              </button>
            ) : (
              <input type="number" min={0} max={2 ** p.width - 1} value={Number(inputs[p.name] ?? 0)} aria-label={`${p.name} value`}
                     onChange={(e) => setInputs({ ...inputs, [p.name]: Math.max(0, Math.min(2 ** p.width - 1, Number(e.target.value) || 0)) })}
                     className="w-16 bg-pit border border-rim/60 rounded px-1 py-0.5 text-[12px] text-pale" />
            )}
          </label>
        ))}
        <button onClick={onClock} disabled={!enabled} className={`${btn} border-phosphor/50 text-phosphor bg-phosphor/10`}>Clock ⏵</button>
        <button onClick={onReset} className={`${btn} border-rim/60 text-ghost`}>Reset</button>
        {preview && m.outputs.length > 0 && (
          <span className="text-dim">outputs now: {m.outputs.map((o) => <span key={o.name} className="ml-2 text-warn">{o.name}={String(preview.outputs[o.name])}</span>)}</span>
        )}
        {preview && <span className="text-dim">next: <span className="text-pale">{name(preview.next)}</span></span>}
      </div>
      {!enabled && <p className="font-mono text-[11px] text-dim">Fix the errors to simulate.</p>}
      {history.length > 0 && (
        <div className="overflow-x-auto">
          <table className="font-mono text-[11px] text-center">
            <thead><tr className="text-dim">
              <th className="px-2 text-left font-normal">cycle</th>
              {history.map((_, i) => <th key={i} className="px-2 font-normal">{i + 1}</th>)}
            </tr></thead>
            <tbody>
              <tr><td className="px-2 text-left text-dim">state</td>{history.map((h, i) => <td key={i} className="px-2 text-pale">{name(h.state)}</td>)}</tr>
              {m.inputs.map((p) => (
                <tr key={p.name}><td className="px-2 text-left text-dim">{p.name}</td>{history.map((h, i) => <td key={i} className="px-2 text-ghost">{Number(h.inputs[p.name] ?? 0)}</td>)}</tr>
              ))}
              {m.outputs.map((o) => (
                <tr key={o.name}><td className="px-2 text-left text-dim">{o.name}</td>{history.map((h, i) => <td key={i} className="px-2 text-warn">{String(h.outputs[o.name] ?? "")}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ── Import ─────────────────────────────────────────────────────────────────────

const IMPORT_SAMPLE = `module seq (
    input  wire clk, rst, din,
    output reg  found
);
    localparam IDLE = 2'd0, ONE = 2'd1, DONE = 2'd2;
    reg [1:0] state;
    always @(posedge clk)
        if (rst) state <= IDLE;
        else case (state)
            IDLE: if (din) state <= ONE;
            ONE:  state <= din ? DONE : IDLE;
            DONE: if (!din) state <= IDLE;
            default: state <= IDLE;
        endcase
    always @(*) found = (state == DONE);
endmodule
`;

function ImportFromCode({ onModel }: { onModel: (m: FsmModel) => void }) {
  const [src, setSrc] = useState(IMPORT_SAMPLE);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const go = async () => {
    setBusy(true); setNote(null);
    try {
      const r = await synthesizeDesign("synth", src, "verilog");
      if (!r?.ok) throw new Error(r?.error ?? "Synthesis failed.");
      const fsm = r.fsms?.[0];
      if (!fsm) throw new Error("No state machine was found. Yosys looks for a state register updated from a case statement on itself, with a reset.");
      const { model, skipped } = fromExtracted(fsm);
      if (!window.confirm("Replace the current machine with the one found in this code?")) return;
      onModel(model);
      setNote({ ok: true, text: `Imported ${model.states.length} states and ${model.transitions.length} transitions. Yosys doesn't report outputs, so add them in the header and the states.${skipped ? ` ${skipped} condition(s) used internal signals and were left out.` : ""}${r.fsms.length > 1 ? ` (${r.fsms.length} machines found; this is the first.)` : ""}` });
    } catch (e) {
      setNote({ ok: false, text: (e as Error).message || "Synthesis failed." });
    } finally {
      setBusy(false);
    }
  };
  return (
    <details className="border-t border-rim/40 pt-5">
      <summary className="cursor-pointer font-display text-[15px] font-semibold">Import a state machine from Verilog</summary>
      <p className="mt-2 text-[12px] text-ghost max-w-2xl">
        Paste a module with a state machine. It is synthesized in your browser and the machine Yosys finds is drawn here,
        with its states and transition conditions. The first run downloads the synthesis tools, which takes a little while.
      </p>
      <textarea value={src} onChange={(e) => setSrc(e.target.value)} spellCheck={false} aria-label="Verilog module"
                className="mt-3 w-full h-56 bg-pit border border-rim/60 rounded-lg p-3 font-mono text-[12px] text-pale" />
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button onClick={go} disabled={busy} className="px-4 py-2 rounded-lg border border-info/40 bg-info/10 text-info font-mono text-[12px] disabled:opacity-50">
          {busy ? "Synthesizing…" : "Import"}
        </button>
        {note && <span className={`text-[12px] ${note.ok ? "text-phosphor" : "text-danger"}`}>{note.text}</span>}
      </div>
    </details>
  );
}
