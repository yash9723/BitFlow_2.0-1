"use client";
/**
 * components/studio/TimingTool.tsx — /studio/timing: draw a timing diagram (WaveDrom
 * style), export it (SVG, PNG, WaveJSON), and turn it into a testbench for a design.
 * The model, renderer and generators live in lib/studio/wave.ts.
 * Loaded client-only (components/studio/loaders.tsx): the draft is in localStorage.
 * The Waveform panel's "→ Timing" leaves a sampled diagram under FROM_SIM_KEY,
 * which this page offers to open.
 */

import { useEffect, useMemo, useState } from "react";
import GeneratedCode from "@/components/studio/GeneratedCode";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { downloadBlob } from "@/lib/api";
import {
  type WaveDiagram, type WaveSignal, FROM_SIM_KEY, GEOM, MAX_CYCLES, MAX_WIDTH, WAVE_EXAMPLES, diagramSvg, fromWaveJson,
  generateTestbench, matchDesign, resolved, setDir, stubModule, toWaveJson, validate,
} from "@/lib/studio/wave";
import { nameProblem } from "@/lib/studio/logic-min";

function valid(d: WaveDiagram | null): d is WaveDiagram {
  return !!d && Array.isArray(d.signals) && typeof d.cycles === "number" && typeof d.period === "number";
}

/** The SVG as a PNG at 2x, for slides and reports. */
async function svgToPng(svg: string): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    await new Promise((ok, fail) => { img.onload = ok; img.onerror = fail; img.src = url; });
    const canvas = Object.assign(document.createElement("canvas"), { width: img.width * 2, height: img.height * 2 });
    const ctx = canvas.getContext("2d")!;
    ctx.scale(2, 2);
    ctx.drawImage(img, 0, 0);
    return await new Promise((ok, fail) => canvas.toBlob((b) => (b ? ok(b) : fail(new Error("PNG export failed"))), "image/png"));
  } finally {
    URL.revokeObjectURL(url);
  }
}

const nextBit = (v: string) => (v === "0" ? "1" : v === "1" ? "x" : "0");
const fileName = (d: WaveDiagram) => (d.title.trim().replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "") || "timing").toLowerCase();

const EMPTY: WaveDiagram = { title: "", cycles: 8, period: 10, signals: [
  { name: "clk", dir: "clock", width: 1, values: [] },
  { name: "a", dir: "in", width: 1, values: ["0"] },
  { name: "y", dir: "out", width: 1, values: ["x"] },
] };

export default function TimingTool() {
  const [stored, setD] = useLocalStorage<WaveDiagram>("bitflow_studio_timing", WAVE_EXAMPLES[0].diagram);
  const d = valid(stored) ? stored : WAVE_EXAMPLES[0].diagram;
  const [fromSim, setFromSim] = useState(false);

  // A diagram sampled from the Waveform panel ("→ Timing")
  useEffect(() => {
    try {
      const raw = localStorage.getItem(FROM_SIM_KEY);
      if (!raw) return;
      localStorage.removeItem(FROM_SIM_KEY);
      const sampled = JSON.parse(raw) as WaveDiagram;
      if (valid(sampled) && window.confirm("Open the diagram sampled from your simulation? It replaces the current diagram.")) {
        setD(sampled);
        setFromSim(true);
      }
    } catch { /* storage blocked or bad data: nothing to open */ }
  }, [setD]);

  const svg = useMemo(() => diagramSvg(d), [d]);
  const issues = useMemo(() => validate(d), [d]);
  const errors = issues.filter((i) => i.level === "error");

  const setSignal = (r: number, f: (s: WaveSignal) => WaveSignal) => setD({ ...d, signals: d.signals.map((s, i) => (i === r ? f(s) : s)) });
  /** Set cycles from..to (either order) of row r to v. */
  const setCells = (r: number, from: number, to: number, v: string) => setSignal(r, (s) => {
    const values = [...s.values];
    while (values.length < d.cycles) values.push(".");
    for (let c = Math.min(from, to); c <= Math.max(from, to); c++) values[c] = v;
    return { ...s, values, alt: undefined };            // an edited row is no longer a pure sample
  });
  const setCell = (r: number, c: number, v: string) => setCells(r, c, c, v);

  // Painting fills every cell between the last one and the current one, so a fast drag doesn't skip cells
  const [paint, setPaint] = useState<{ r: number; v: string; c: number } | null>(null);
  const [editing, setEditing] = useState<{ r: number; c: number; text: string } | null>(null);
  useEffect(() => {
    const stop = () => setPaint(null);
    window.addEventListener("pointerup", stop);
    return () => window.removeEventListener("pointerup", stop);
  }, []);

  const { labelW, cycleW, rowH, top } = GEOM;
  const width = labelW + d.cycles * cycleW + 12;
  const btn = "px-2 py-1 rounded border border-rim/60 text-ghost hover:text-bright font-mono text-[11px]";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold">Timing diagram</h1>
          <p className="text-[12px] text-ghost max-w-3xl">
            Click a cell to cycle 0 → 1 → X, or drag along a row to paint; click a bus cell to type a value (empty repeats the one
            before). Mark rows as inputs or outputs, then test a design against the diagram.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
          <span className="text-dim">Examples:</span>
          {WAVE_EXAMPLES.map((e) => <button key={e.label} onClick={() => { setD(e.diagram); setFromSim(false); }} className={btn}>{e.label}</button>)}
          <button onClick={() => { if (window.confirm("Start an empty diagram? The current one is replaced.")) { setD(EMPTY); setFromSim(false); } }}
                  className="px-2 py-1 rounded border border-dashed border-rim text-ghost hover:text-bright">New</button>
        </div>
      </div>

      {fromSim && (
        <p className="text-[12px] text-info max-w-3xl">
          Sampled from your simulation, one cycle per rising clock edge. Every row came in as an input: mark the outputs, and
          their values switch to what they read mid-cycle.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-4 font-mono text-[11px] text-dim">
        <label className="flex items-center gap-2">title
          <input value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} aria-label="Diagram title"
                 className="w-56 bg-pit border border-rim/60 rounded px-2 py-1 text-[12px] text-pale" />
        </label>
        <label className="flex items-center gap-2">cycles
          <input type="number" min={1} max={MAX_CYCLES} value={d.cycles} aria-label="Number of cycles"
                 onChange={(e) => setD({ ...d, cycles: Math.max(1, Math.min(MAX_CYCLES, Number(e.target.value) || 1)) })}
                 className="w-16 bg-pit border border-rim/60 rounded px-2 py-1 text-[12px] text-pale" />
        </label>
        <label className="flex items-center gap-2">clock period (ns)
          <input type="number" min={2} max={1000} step={2} value={d.period} aria-label="Clock period in ns"
                 onChange={(e) => setD({ ...d, period: Math.max(2, Math.min(1000, Number(e.target.value) || 10)) })}
                 className="w-16 bg-pit border border-rim/60 rounded px-2 py-1 text-[12px] text-pale" />
        </label>
      </div>

      <div className="border border-rim/60 rounded-xl bg-pit overflow-x-auto">
        <div className="relative select-none" style={{ width }}>
          {/* diagramSvg escapes every piece of text it writes (names, values, title) */}
          <div dangerouslySetInnerHTML={{ __html: svg }} />
          {d.signals.map((s, r) => s.dir === "clock" ? null : resolved(s, d.cycles).map((v, c) => (
            <button key={`${r}-${c}`} aria-label={`${s.name}, cycle ${c}: ${v}`} title={`${s.name}[cycle ${c}] = ${v}`}
                    className="absolute hover:bg-white/5 focus:outline-none focus-visible:ring-1 focus-visible:ring-info"
                    style={{ left: labelW + c * cycleW, top: top + r * rowH, width: cycleW, height: rowH }}
                    onPointerDown={(e) => {
                      if (s.width > 1) { setEditing({ r, c, text: s.values[c] && s.values[c] !== "." ? s.values[c] : "" }); return; }
                      e.preventDefault();
                      const next = nextBit(v);
                      setCell(r, c, next);
                      setPaint({ r, v: next, c });
                    }}
                    onPointerEnter={() => { if (paint && paint.r === r && s.width === 1) { setCells(r, paint.c, c, paint.v); setPaint({ ...paint, c }); } }} />
          )))}
          {editing && (
            <input autoFocus value={editing.text} aria-label="Bus value"
                   className="absolute bg-surface border border-info rounded px-1 font-mono text-[12px] text-bright text-center"
                   style={{ left: labelW + editing.c * cycleW + 2, top: top + editing.r * rowH + 6, width: cycleW - 4, height: rowH - 12 }}
                   onChange={(e) => setEditing({ ...editing, text: e.target.value })}
                   onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEditing(null); }}
                   onBlur={() => { setCell(editing.r, editing.c, editing.text.trim() || "."); setEditing(null); }} />
          )}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Rows d={d} setD={setD} setSignal={setSignal} />
        <div className="space-y-3">
          <Issues issues={issues} />
          <div className="flex flex-wrap gap-2">
            <button className={btn} onClick={() => downloadBlob(`${fileName(d)}.svg`, svg, "image/svg+xml")}>Download SVG</button>
            <button className={btn} onClick={() => svgToPng(svg).then((b) => downloadBlob(`${fileName(d)}.png`, b, "image/png")).catch(() => window.alert("This browser couldn't make the PNG; use the SVG."))}>Download PNG</button>
            <button className={btn} onClick={() => downloadBlob(`${fileName(d)}.json`, toWaveJson(d), "application/json")}>Download WaveJSON</button>
          </div>
          <ImportWaveJson onDiagram={(nd) => { setD(nd); setFromSim(false); }} />
        </div>
      </div>

      <Testbench d={d} blocked={errors.length > 0} />
    </div>
  );
}

function Rows({ d, setD, setSignal }: { d: WaveDiagram; setD: (d: WaveDiagram) => void; setSignal: (r: number, f: (s: WaveSignal) => WaveSignal) => void }) {
  const field = "bg-pit border border-rim/60 rounded px-1.5 py-0.5 text-[12px] text-pale";
  const move = (r: number, dir: -1 | 1) => {
    const j = r + dir;
    if (j < 0 || j >= d.signals.length) return;
    const signals = [...d.signals];
    [signals[r], signals[j]] = [signals[j], signals[r]];
    setD({ ...d, signals });
  };
  const add = (dir: WaveSignal["dir"]) => {
    const used = new Set(d.signals.map((s) => s.name));
    const pool = dir === "clock" ? ["clk", "clk2"] : dir === "in" ? ["a", "b", "c", "en", "rst", "din"] : ["y", "q", "dout", "valid"];
    const name = pool.find((p) => !used.has(p)) ?? `s${d.signals.length}`;
    setD({ ...d, signals: [...d.signals, { name, dir, width: 1, values: dir === "clock" ? [] : [dir === "out" ? "x" : "0"] }] });
  };
  return (
    <div className="space-y-2 font-mono text-[11px]">
      <div className="text-dim">Rows</div>
      {d.signals.map((s, r) => (
        <div key={r} className="flex flex-wrap items-center gap-2">
          <input value={s.name} aria-label={`Row ${r + 1} name`} onChange={(e) => setSignal(r, (x) => ({ ...x, name: e.target.value.trim() }))}
                 className={`w-24 ${field} ${nameProblem(s.name) ? "border-danger/60" : ""}`} />
          <select value={s.dir} aria-label={`${s.name} direction`} onChange={(e) => setSignal(r, (x) => setDir(x, e.target.value as WaveSignal["dir"]))} className={field}>
            <option value="clock">clock</option><option value="in">input</option><option value="out">output</option>
          </select>
          {s.dir !== "clock" && (
            <label className="flex items-center gap-1 text-dim">
              <input type="number" min={1} max={MAX_WIDTH} value={s.width} aria-label={`${s.name} width in bits`}
                     onChange={(e) => setSignal(r, (x) => ({ ...x, width: Math.max(1, Math.min(MAX_WIDTH, Number(e.target.value) || 1)) }))}
                     className={`w-12 ${field}`} /> bit
            </label>
          )}
          <button onClick={() => move(r, -1)} disabled={r === 0} aria-label={`Move ${s.name} up`} className="px-1 text-dim hover:text-bright disabled:opacity-30">↑</button>
          <button onClick={() => move(r, 1)} disabled={r === d.signals.length - 1} aria-label={`Move ${s.name} down`} className="px-1 text-dim hover:text-bright disabled:opacity-30">↓</button>
          <button onClick={() => setD({ ...d, signals: d.signals.filter((_, i) => i !== r) })} aria-label={`Remove ${s.name}`} className="px-1 text-dim hover:text-danger">×</button>
        </div>
      ))}
      <div className="flex gap-2">
        {(["in", "out", "clock"] as const).map((k) => (
          <button key={k} onClick={() => add(k)} className="px-2 py-1 rounded border border-dashed border-rim text-ghost hover:text-bright">
            + {k === "in" ? "input" : k === "out" ? "output" : "clock"}
          </button>
        ))}
      </div>
    </div>
  );
}

function Issues({ issues }: { issues: ReturnType<typeof validate> }) {
  if (!issues.length) return <p className="font-mono text-[11px] text-phosphor/80">✓ No problems found.</p>;
  return (
    <ul className="space-y-1 font-mono text-[11px] max-h-48 overflow-auto">
      {issues.map((i, k) => <li key={k} className={i.level === "error" ? "text-danger" : "text-warn"}>{i.level === "error" ? "✗" : "!"} {i.msg}</li>)}
    </ul>
  );
}

function ImportWaveJson({ onDiagram }: { onDiagram: (d: WaveDiagram) => void }) {
  const [text, setText] = useState('{ "signal": [\n  { "name": "clk", "wave": "p......." },\n  { "name": "req", "wave": "01..0..." },\n  { "name": "ack", "wave": "x.01.0.." }\n] }');
  const [error, setError] = useState<string | null>(null);
  return (
    <details className="font-mono text-[11px]">
      <summary className="cursor-pointer text-ghost">Import WaveJSON (from WaveDrom)</summary>
      <textarea value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} aria-label="WaveJSON"
                className="mt-2 w-full h-36 bg-pit border border-rim/60 rounded-lg p-2 text-[12px] text-pale" />
      <div className="mt-1 flex items-center gap-3">
        <button onClick={() => {
          try {
            const d = fromWaveJson(text);
            setError(null);
            if (window.confirm("Replace the current diagram? Imported rows come in as inputs: mark the outputs.")) onDiagram(d);
          } catch (e) { setError((e as Error).message); }
        }} className="px-3 py-1 rounded border border-info/40 bg-info/10 text-info">Import</button>
        {error && <span className="text-danger">{error}</span>}
      </div>
    </details>
  );
}

function Testbench({ d, blocked }: { d: WaveDiagram; blocked: boolean }) {
  const [mode, setMode] = useLocalStorage<"stub" | "mine">("bitflow_studio_timing_mode", "stub");
  const [moduleName, setModuleName] = useLocalStorage("bitflow_studio_timing_module", "my_design");
  const [mine, setMine] = useLocalStorage("bitflow_studio_timing_design", "");
  const match = useMemo(() => (mode === "mine" && mine.trim() ? matchDesign(d, mine) : null), [mode, mine, d]);
  const stubProblem = mode === "stub" ? nameProblem(moduleName) : null;
  const ready = !blocked && (mode === "stub" ? !stubProblem : !!match && !match.problems.length);
  const code = ready ? (mode === "stub"
    ? { module: moduleName, design: stubModule(d, moduleName), testbench: generateTestbench(d, moduleName) }
    : { module: match!.module, design: mine, testbench: generateTestbench(d, match!.module) }) : null;

  return (
    <section className="space-y-3 border-t border-rim/40 pt-5">
      <h2 className="font-display text-[15px] font-semibold">Testbench</h2>
      <p className="text-[12px] text-ghost max-w-3xl">
        The testbench plays the input rows and checks the output rows every cycle. With a clock row, inputs change just after
        each rising edge and outputs are checked mid-cycle; an X in an output isn&apos;t checked.
      </p>
      <div className="flex flex-wrap items-center gap-4 font-mono text-[11px]">
        <label className="flex items-center gap-1"><input type="radio" checked={mode === "stub"} onChange={() => setMode("stub")} /> start a module from the diagram</label>
        <label className="flex items-center gap-1"><input type="radio" checked={mode === "mine"} onChange={() => setMode("mine")} /> test my design</label>
        {mode === "stub" && (
          <label className="flex items-center gap-2 text-dim">module
            <input value={moduleName} onChange={(e) => setModuleName(e.target.value.trim())} aria-label="Module name"
                   className="w-36 bg-pit border border-rim/60 rounded px-2 py-1 text-[12px] text-pale" />
          </label>
        )}
      </div>
      {mode === "mine" && (
        <textarea value={mine} onChange={(e) => setMine(e.target.value)} spellCheck={false} aria-label="Your Verilog module"
                  placeholder={"module my_design (\n    input  wire clk,\n    ...\n);\n    ...\nendmodule"}
                  className="w-full h-48 bg-pit border border-rim/60 rounded-lg p-3 font-mono text-[12px] text-pale" />
      )}
      {blocked && <p className="text-[12px] text-dim">Fix the problems above to generate the testbench.</p>}
      {stubProblem && <p className="text-[12px] text-danger">Module name {stubProblem}.</p>}
      {match?.problems.length ? (
        <ul className="text-[12px] text-danger list-disc pl-5">{match.problems.map((p) => <li key={p}>{p}</li>)}</ul>
      ) : null}
      {code && <GeneratedCode module={code.module} design={code.design} testbench={code.testbench} />}
    </section>
  );
}
