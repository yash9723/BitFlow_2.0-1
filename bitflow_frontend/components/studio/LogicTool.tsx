"use client";
/**
 * components/studio/LogicTool.tsx — /studio/logic: edit a truth table (or build one
 * from a combinational design), see the K-map groups and minimal SOP/POS, and get
 * Verilog with an exhaustive testbench. Logic lives in lib/studio/logic-min.ts.
 * Loaded client-only (components/studio/loaders.tsx): the draft is in localStorage.
 */

import { useMemo, useState } from "react";
import ForkButton from "@/components/ForkButton";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { downloadBlob } from "@/lib/api";
import type { BoardNetlist } from "@/lib/gate-sim";
import { synthesizeDesign } from "@/lib/synth/client";
import {
  type Cell, type Implicant, type TruthTable, MAX_INPUTS, generateVerilog, groupRects, kmapLayout,
  literals, minimizePos, minimizeSop, nameProblem, posText, sopText, tableFromNetlist,
} from "@/lib/studio/logic-min";

const MAX_OUTPUTS = 4;
const COLORS = ["#00e87a", "#4db8ff", "#ffb547", "#ff6bcb", "#a78bfa", "#f87171", "#2dd4bf", "#facc15"];

const rows = (n: number, f: (m: number) => Cell): Cell[] => Array.from({ length: 1 << n }, (_, m) => f(m));
const bit = (m: number, n: number, i: number) => (m >> (n - 1 - i)) & 1;
const PRESETS: { label: string; table: TruthTable }[] = [
  { label: "Majority", table: { inputs: ["a", "b", "c"], outputs: [{ name: "y", cells: rows(3, (m) => ([3, 5, 6, 7].includes(m) ? 1 : 0)) }] } },
  { label: "Full adder", table: { inputs: ["a", "b", "cin"], outputs: [
    { name: "sum", cells: rows(3, (m) => (bit(m, 3, 0) ^ bit(m, 3, 1) ^ bit(m, 3, 2)) as Cell) },
    { name: "cout", cells: rows(3, (m) => ([3, 5, 6, 7].includes(m) ? 1 : 0)) },
  ] } },
  { label: "2:1 mux", table: { inputs: ["s", "a", "b"], outputs: [{ name: "y", cells: rows(3, (m) => (bit(m, 3, 0) ? bit(m, 3, 2) : bit(m, 3, 1)) as Cell) }] } },
  { label: "BCD → segment a", table: { inputs: ["d3", "d2", "d1", "d0"], outputs: [
    { name: "seg_a", cells: rows(4, (m) => (m > 9 ? "x" : [1, 4].includes(m) ? 0 : 1)) },
  ] } },
];

const nextCell = (c: Cell): Cell => (c === 0 ? 1 : c === 1 ? "x" : 0);
const showCell = (c: Cell) => (c === "x" ? "X" : String(c));

function freshName(t: TruthTable, pool: string[]): string {
  const used = new Set([...t.inputs, ...t.outputs.map((o) => o.name)]);
  return pool.find((p) => !used.has(p)) ?? `v${used.size}`;
}
/** A new last (least significant) input: the function doesn't depend on it, so each row is duplicated. */
const addInput = (t: TruthTable): TruthTable => ({
  inputs: [...t.inputs, freshName(t, "abcdefgh".split(""))],
  outputs: t.outputs.map((o) => ({ ...o, cells: o.cells.flatMap((c) => [c, c]) })),
});
/** Drop input i, keeping the rows where it was 0. */
const removeInput = (t: TruthTable, i: number): TruthTable => ({
  inputs: t.inputs.filter((_, j) => j !== i),
  outputs: t.outputs.map((o) => ({ ...o, cells: o.cells.filter((_, m) => !bit(m, t.inputs.length, i)) })),
});

/** A stored draft from an older version (or edited by hand) could be malformed. */
function valid(t: TruthTable | null): t is TruthTable {
  return !!t && Array.isArray(t.inputs) && t.inputs.length >= 1 && t.inputs.length <= MAX_INPUTS && Array.isArray(t.outputs) &&
    t.outputs.length >= 1 && t.outputs.length <= MAX_OUTPUTS && t.outputs.every((o) => Array.isArray(o.cells) && o.cells.length === 1 << t.inputs.length);
}

export default function LogicTool() {
  const [stored, setT] = useLocalStorage<TruthTable>("bitflow_studio_logic", PRESETS[0].table);
  const t = valid(stored) ? stored : PRESETS[0].table;
  const [form, setForm] = useLocalStorage<"sop" | "pos">("bitflow_studio_logic_form", "sop");
  const [selRaw, setSel] = useState(0);
  const sel = Math.min(selRaw, t.outputs.length - 1);
  const n = t.inputs.length;

  const minimal = useMemo(
    () => t.outputs.map((o) => ({ sop: minimizeSop(n, o.cells), pos: minimizePos(n, o.cells) })),
    [t, n],
  );

  const names = [...t.inputs, ...t.outputs.map((o) => o.name)];
  const problems = names.flatMap((nm, i) => {
    const p = nameProblem(nm);
    if (p) return [`"${nm}" ${p}.`];
    return names.indexOf(nm) !== i ? [`"${nm}" is used twice.`] : [];
  });
  const [moduleName, setModuleName] = useLocalStorage("bitflow_studio_logic_module", "logic_fn");
  const moduleProblem = nameProblem(moduleName) ?? (names.includes(moduleName) ? "is also a port name" : null);
  const code = useMemo(
    () => (problems.length || moduleProblem ? null : generateVerilog(t, form, moduleName)),
    [t, form, moduleName, problems.length, moduleProblem],
  );

  const setOutput = (o: number, cells: (old: Cell[]) => Cell[]) =>
    setT({ ...t, outputs: t.outputs.map((out, i) => (i === o ? { ...out, cells: cells(out.cells) } : out)) });
  const setCell = (o: number, m: number, c: Cell) => setOutput(o, (cs) => cs.map((v, j) => (j === m ? c : v)));
  const fill = (o: number, c: Cell) => setOutput(o, (cs) => cs.map(() => c));
  const rename = (kind: "in" | "out", i: number, name: string) =>
    setT(kind === "in"
      ? { ...t, inputs: t.inputs.map((x, j) => (j === i ? name.trim() : x)) }
      : { ...t, outputs: t.outputs.map((o, j) => (j === i ? { ...o, name: name.trim() } : o)) });

  const out = t.outputs[sel];
  const terms = form === "sop" ? minimal[sel].sop : minimal[sel].pos;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold">Truth table &amp; K-map</h1>
          <p className="text-[12px] text-ghost max-w-2xl">
            Click a cell to cycle 0 → 1 → X (don&apos;t care). The minimal expressions and the K-map groups update as you go.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
          <span className="text-dim">Examples:</span>
          {PRESETS.map((p) => (
            <button key={p.label} onClick={() => { setT(p.table); setSel(0); }}
                    className="px-2 py-1 rounded border border-rim/60 text-ghost hover:text-bright hover:border-phosphor/50">
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <SignalsEditor t={t} setT={setT} rename={rename} />
      {problems.length > 0 && (
        <ul className="text-[12px] text-danger list-disc pl-5">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <TableView t={t} sel={sel} setSel={setSel} setCell={setCell} fill={fill} />

        <div className="space-y-5 min-w-0">
          <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
            {t.outputs.length > 1 && t.outputs.map((o, i) => (
              <button key={i} onClick={() => setSel(i)}
                      className={`px-2 py-1 rounded border ${i === sel ? "border-phosphor/60 text-phosphor bg-phosphor/10" : "border-rim/60 text-ghost"}`}>
                {o.name || "?"}
              </button>
            ))}
            <span className="ml-auto text-dim">Group</span>
            {(["sop", "pos"] as const).map((f) => (
              <button key={f} onClick={() => setForm(f)}
                      className={`px-2 py-1 rounded border ${form === f ? "border-info/60 text-info bg-info/10" : "border-rim/60 text-ghost"}`}>
                {f === "sop" ? "1s (SOP)" : "0s (POS)"}
              </button>
            ))}
          </div>

          {n >= 2 && n <= 4 ? (
            <Kmap t={t} o={sel} terms={terms} form={form} onCell={(m) => setCell(sel, m, nextCell(out.cells[m]))} />
          ) : (
            <p className="text-[12px] text-dim">
              {n === 1 ? "A K-map needs at least two inputs." : "K-maps are drawn for 2–4 inputs; with more, the groups are listed below."}
            </p>
          )}

          <Expressions names={t.inputs} out={out.name} sop={minimal[sel].sop} pos={minimal[sel].pos} form={form} n={n} />
        </div>
      </div>

      <section className="space-y-3 border-t border-rim/40 pt-5">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-display text-[15px] font-semibold">Verilog</h2>
          <label className="flex items-center gap-2 font-mono text-[11px] text-dim">
            module
            <input value={moduleName} onChange={(e) => setModuleName(e.target.value.trim())} aria-label="Module name"
                   className="w-36 bg-pit border border-rim/60 rounded px-2 py-1 text-pale" />
          </label>
          <span className="font-mono text-[11px] text-dim">from the {form === "sop" ? "sum of products" : "product of sums"}</span>
          {moduleProblem && <span className="text-[12px] text-danger">module name {moduleProblem}</span>}
        </div>
        {code ? (
          <>
            <div className="flex flex-wrap gap-2">
              <ForkButton designCode={code.design} testbenchCode={code.testbench} label="Open in Sandbox"
                          confirmText="Open this design and its testbench in your Sandbox? It replaces the code in your Sandbox editors." />
              <button onClick={() => downloadBlob(`${moduleName}.v`, code.design, "text/plain")} className="px-3 py-2 rounded-lg border border-rim/60 font-mono text-[12px] text-ghost hover:text-bright">
                Download {moduleName}.v
              </button>
              <button onClick={() => downloadBlob(`tb_${moduleName}.v`, code.testbench, "text/plain")} className="px-3 py-2 rounded-lg border border-rim/60 font-mono text-[12px] text-ghost hover:text-bright">
                Download testbench
              </button>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <CodeBlock title={`${moduleName}.v`} code={code.design} />
              <CodeBlock title={`tb_${moduleName}.v`} code={code.testbench} collapsed />
            </div>
          </>
        ) : (
          <p className="text-[12px] text-dim">Fix the names above to generate Verilog.</p>
        )}
      </section>

      <FromDesign onTable={(table) => { setT(table); setSel(0); }} />
    </div>
  );
}

// ── Pieces ─────────────────────────────────────────────────────────────────────

function SignalsEditor({ t, setT, rename }: {
  t: TruthTable; setT: (t: TruthTable) => void; rename: (kind: "in" | "out", i: number, name: string) => void;
}) {
  const chip = "flex items-center gap-1 bg-surface/60 border border-rim/60 rounded px-1.5 py-1";
  const nameInput = (value: string, onChange: (v: string) => void, label: string) => (
    <input value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}
           className="w-16 bg-transparent font-mono text-[12px] text-pale focus:outline-none" />
  );
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-[11px]">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-dim">Inputs</span>
        {t.inputs.map((nm, i) => (
          <span key={i} className={chip}>
            {nameInput(nm, (v) => rename("in", i, v), `Input ${i + 1} name`)}
            {t.inputs.length > 1 && (
              <button onClick={() => setT(removeInput(t, i))} aria-label={`Remove input ${nm}`} title="Remove (keeps the rows where it is 0)"
                      className="text-dim hover:text-danger">×</button>
            )}
          </span>
        ))}
        {t.inputs.length < MAX_INPUTS && (
          <button onClick={() => setT(addInput(t))} className="px-2 py-1 rounded border border-dashed border-rim text-ghost hover:text-bright">+ input</button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-dim">Outputs</span>
        {t.outputs.map((o, i) => (
          <span key={i} className={chip}>
            {nameInput(o.name, (v) => rename("out", i, v), `Output ${i + 1} name`)}
            {t.outputs.length > 1 && (
              <button onClick={() => setT({ ...t, outputs: t.outputs.filter((_, j) => j !== i) })} aria-label={`Remove output ${o.name}`}
                      className="text-dim hover:text-danger">×</button>
            )}
          </span>
        ))}
        {t.outputs.length < MAX_OUTPUTS && (
          <button onClick={() => setT({ ...t, outputs: [...t.outputs, { name: freshName(t, ["y", "z", "w", "f", "g", "h"]), cells: t.outputs[0].cells.map(() => 0 as Cell) }] })}
                  className="px-2 py-1 rounded border border-dashed border-rim text-ghost hover:text-bright">+ output</button>
        )}
      </div>
    </div>
  );
}

function TableView({ t, sel, setSel, setCell, fill }: {
  t: TruthTable; sel: number; setSel: (i: number) => void;
  setCell: (o: number, m: number, c: Cell) => void; fill: (o: number, c: Cell) => void;
}) {
  const n = t.inputs.length;
  return (
    <div className="min-w-0">
      <div className="max-h-[560px] overflow-auto border border-rim/60 rounded-xl">
        <table className="w-full font-mono text-[12px] text-center">
          <thead className="sticky top-0 bg-surface">
            <tr className="text-dim">
              <th className="px-2 py-1.5 font-normal text-[10px]">#</th>
              {t.inputs.map((nm, i) => <th key={i} className="px-2 font-semibold text-pale">{nm}</th>)}
              {t.outputs.map((o, i) => (
                <th key={i} className={`px-2 font-semibold border-l border-rim/40 ${i === sel ? "text-phosphor" : "text-pale"}`}>
                  <button onClick={() => setSel(i)}>{o.name}</button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {t.outputs[0].cells.map((_, m) => (
              <tr key={m} className="border-t border-rim/20 hover:bg-surface/40">
                <td className="text-[10px] text-dim">{m}</td>
                {t.inputs.map((_, i) => <td key={i} className="text-ghost">{bit(m, n, i)}</td>)}
                {t.outputs.map((o, i) => {
                  const c = o.cells[m];
                  return (
                    <td key={i} className="border-l border-rim/40 p-0">
                      <button onClick={() => setCell(i, m, nextCell(c))} aria-label={`${o.name} at row ${m}: ${showCell(c)}`}
                              className={`w-full py-1 ${c === 1 ? "text-phosphor font-bold" : c === "x" ? "text-warn" : "text-dim"} hover:bg-phosphor/10`}>
                        {showCell(c)}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 font-mono text-[10px] text-dim">
        Set {t.outputs[sel].name} to all
        {([0, 1, "x"] as Cell[]).map((c) => (
          <button key={String(c)} onClick={() => fill(sel, c)} className="px-1.5 rounded border border-rim/60 text-ghost hover:text-bright">{showCell(c)}</button>
        ))}
      </div>
    </div>
  );
}

function Kmap({ t, o, terms, form, onCell }: {
  t: TruthTable; o: number; terms: Implicant[]; form: "sop" | "pos"; onCell: (m: number) => void;
}) {
  const k = kmapLayout(t.inputs);
  const C = 52, L = 64, T = 40;                   // cell size, left and top label space
  const W = L + k.cols.length * C + 8, H = T + k.rows.length * C + 8;
  const bits = (v: number, w: number) => (w ? v.toString(2).padStart(w, "0") : "");
  const cells = t.outputs[o].cells;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[420px] h-auto select-none" role="img"
         aria-label={`K-map of ${t.outputs[o].name}`}>
      <text x={L - 8} y={T - 22} textAnchor="end" fontSize={11} fill="#8b8fa3" fontFamily="monospace">{k.rowVars.join("")}</text>
      <text x={L + 4} y={T - 22} fontSize={11} fill="#8b8fa3" fontFamily="monospace">{k.colVars.join("")}</text>
      <line x1={L - 30} y1={T - 30} x2={L} y2={T} stroke="#2e3040" />
      {k.cols.map((cv, c) => (
        <text key={c} x={L + c * C + C / 2} y={T - 8} textAnchor="middle" fontSize={11} fill="#c8cad6" fontFamily="monospace">{bits(cv, k.colVars.length)}</text>
      ))}
      {k.rows.map((rv, r) => (
        <text key={r} x={L - 8} y={T + r * C + C / 2 + 4} textAnchor="end" fontSize={11} fill="#c8cad6" fontFamily="monospace">{bits(rv, k.rowVars.length) || "–"}</text>
      ))}
      {k.rows.map((_, r) => k.cols.map((_, c) => {
        const m = k.minterm(r, c), v = cells[m];
        return (
          <g key={`${r}-${c}`} onClick={() => onCell(m)} style={{ cursor: "pointer" }}>
            <rect x={L + c * C} y={T + r * C} width={C} height={C} fill="#111218" stroke="#2e3040" />
            <text x={L + c * C + 4} y={T + r * C + 11} fontSize={8} fill="#4a4d60" fontFamily="monospace">{m}</text>
            <text x={L + c * C + C / 2} y={T + r * C + C / 2 + 6} textAnchor="middle" fontSize={17} fontFamily="monospace"
                  fill={v === 1 ? "#00e87a" : v === "x" ? "#ffb547" : "#4a4d60"} fontWeight={v === 1 ? 700 : 400}>{showCell(v)}</text>
          </g>
        );
      }))}
      {terms.map((term, gi) => groupRects(term, k).map((g, pi) => {
        const inset = 4 + (gi % 4) * 3;
        return (
          <rect key={`${gi}-${pi}`} x={L + g.c * C + inset} y={T + g.r * C + inset} width={g.w * C - 2 * inset} height={g.h * C - 2 * inset}
                rx={10} fill={COLORS[gi % COLORS.length]} fillOpacity={0.07} stroke={COLORS[gi % COLORS.length]} strokeWidth={2}
                pointerEvents="none">
            <title>{form === "sop" ? sopText([term], t.inputs, "math") : posText([term], t.inputs, "math")}</title>
          </rect>
        );
      }))}
    </svg>
  );
}

function Expressions({ names, out, sop, pos, form, n }: {
  names: string[]; out: string; sop: Implicant[]; pos: Implicant[]; form: "sop" | "pos"; n: number;
}) {
  const count = (ts: Implicant[]) => `${ts.length} term${ts.length === 1 ? "" : "s"}, ${ts.reduce((s, x) => s + literals(x, n), 0)} literals`;
  const row = (label: string, ts: Implicant[], f: "sop" | "pos") => {
    const text = f === "sop" ? sopText : posText;
    return (
      <div className={`p-3 rounded-lg border ${form === f ? "border-info/40 bg-info/5" : "border-rim/50"}`}>
        <div className="flex items-baseline justify-between gap-2 font-mono text-[10px] text-dim">
          <span className="uppercase tracking-wider">{label}</span><span>{count(ts)}</span>
        </div>
        <div className="mt-1 font-mono text-[15px] text-bright break-words">{out} = {text(ts, names, "math")}</div>
        <div className="mt-1 font-mono text-[11px] text-ghost break-words">assign {out} = {text(ts, names)};</div>
        {form === f && ts.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {ts.map((x, i) => (
              <span key={i} className="inline-flex items-center gap-1 font-mono text-[11px] text-pale">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ background: COLORS[i % COLORS.length] }} />
                {text([x], names, "math")}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  };
  return <div className="space-y-2">{row("Sum of products", sop, "sop")}{row("Product of sums", pos, "pos")}</div>;
}

function CodeBlock({ title, code, collapsed }: { title: string; code: string; collapsed?: boolean }) {
  const [open, setOpen] = useState(!collapsed);
  const [copied, setCopied] = useState(false);
  return (
    <div className="border border-rim/60 rounded-xl overflow-hidden min-w-0">
      <div className="flex items-center justify-between px-3 py-1.5 bg-surface/70 font-mono text-[11px]">
        <button onClick={() => setOpen((v) => !v)} className="text-pale">{open ? "▾" : "▸"} {title}</button>
        <button onClick={() => navigator.clipboard?.writeText(code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1200); })}
                className="text-dim hover:text-bright">{copied ? "copied" : "copy"}</button>
      </div>
      {open && <pre className="p-3 text-[11px] leading-relaxed text-ghost overflow-auto max-h-80">{code}</pre>}
    </div>
  );
}

function FromDesign({ onTable }: { onTable: (t: TruthTable) => void }) {
  const [src, setSrc] = useState("module f (\n    input  wire [1:0] a,\n    input  wire       b,\n    output wire       y\n);\n    assign y = (a == 2'd2) | b;\nendmodule\n");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const build = async () => {
    setBusy(true); setError(null);
    try {
      const net = await synthesizeDesign("board", src, "verilog");
      if (!net?.ok) throw new Error(net?.error ?? "Synthesis failed.");
      const table = tableFromNetlist(net as BoardNetlist);
      if (typeof table === "string") throw new Error(table);
      if (window.confirm("Replace the current truth table with this design's?")) onTable(table);
    } catch (e) {
      setError((e as Error).message || "Synthesis failed.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <details className="border-t border-rim/40 pt-5">
      <summary className="cursor-pointer font-display text-[15px] font-semibold">Build the table from a design</summary>
      <p className="mt-2 text-[12px] text-ghost max-w-2xl">
        Paste a combinational Verilog module (up to {MAX_INPUTS} input bits and {MAX_OUTPUTS} output bits). It is synthesized in
        your browser and every input row is simulated. The first run downloads the synthesis tools, which takes a little while.
      </p>
      <textarea value={src} onChange={(e) => setSrc(e.target.value)} spellCheck={false} aria-label="Verilog module"
                className="mt-3 w-full h-44 bg-pit border border-rim/60 rounded-lg p-3 font-mono text-[12px] text-pale" />
      <div className="mt-2 flex items-center gap-3">
        <button onClick={build} disabled={busy}
                className="px-4 py-2 rounded-lg border border-info/40 bg-info/10 text-info font-mono text-[12px] disabled:opacity-50">
          {busy ? "Synthesizing…" : "Build table"}
        </button>
        {error && <span className="text-[12px] text-danger">{error}</span>}
      </div>
    </details>
  );
}
