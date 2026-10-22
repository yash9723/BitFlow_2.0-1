"use client";
/**
 * components/studio/PipelineTool.tsx — the CPU pipeline animator (/studio/pipeline):
 * write RV32I assembly, then step a classic 5-stage pipeline (lib/riscv/pipeline.ts)
 * cycle by cycle and watch forwarding, stalls and flushes, with the register file,
 * data memory, a pipeline diagram and a check against the ISA reference (lib/riscv/iss.ts).
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { ABI, assemble } from "@/lib/riscv/asm";
import { disasm, run } from "@/lib/riscv/iss";
import { type Cycle, type HazardMode, type InFlight, PIPELINE_EXAMPLES, STAGES, type Stage, simulate } from "@/lib/riscv/pipeline";

interface Draft { src: string; mode: HazardMode }

const MODES: { id: HazardMode; label: string; blurb: string }[] = [
  { id: "forward", label: "Forwarding", blurb: "Results go straight from the EX/MEM and MEM/WB latches back to EX. Only a load followed by its user stalls (one cycle)." },
  { id: "stall", label: "Stall only", blurb: "No forwarding: an instruction waits in ID until every register it reads has been written back." },
  { id: "none", label: "No hazard handling", blurb: "Nothing stops an instruction reading a register before the instruction ahead of it has written it. Fewer cycles, wrong answers." },
];
const COLOR: Record<Stage, string> = { IF: "#4db8ff", ID: "#a78bfa", EX: "#00e87a", MEM: "#ffb547", WB: "#ff6bcb" };
const ABOUT: Record<Stage, string> = { IF: "fetch", ID: "decode, read registers", EX: "ALU, branch decision", MEM: "data memory", WB: "write back" };
const hex = (v: number) => `0x${(v >>> 0).toString(16).padStart(8, "0")}`;
const signed = (v: number) => String(v | 0);
const DIAGRAM_ROWS = 12, DIAGRAM_COLS = 28;

export default function PipelineTool() {
  const [draft, setDraft] = useLocalStorage<Draft>("bitflow_studio_pipeline", { src: PIPELINE_EXAMPLES[0].src, mode: "forward" });
  const [cycle, setCycle] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(3);

  const asm = useMemo(() => assemble(draft.src), [draft.src]);
  const ok = asm.errors.length === 0 && asm.words.length > 0;
  const sim = useMemo(() => (ok ? simulate(asm.words, draft.mode) : null), [ok, asm.words, draft.mode]);
  const iss = useMemo(() => (ok ? run(asm.words) : null), [ok, asm.words]);
  const labelAt = useMemo(() => Object.fromEntries(Object.entries(asm.labels).map(([name, addr]) => [addr, name])), [asm.labels]);
  const text = (f: InFlight) => disasm(f.word, f.pc, labelAt);
  const lineOf = (f: InFlight) => asm.lines[f.pc >>> 2];

  useEffect(() => { setCycle(0); setPlaying(false); }, [sim]);
  const last = sim ? sim.cycles.length - 1 : 0;
  const cur = Math.min(cycle, last);
  useEffect(() => {
    if (!playing) return;
    if (cur >= last) { setPlaying(false); return; }
    const t = setTimeout(() => setCycle((c) => c + 1), 1000 / speed);
    return () => clearTimeout(t);
  }, [playing, cur, last, speed]);

  // Machine state at the end of the current cycle: replay the writes so far
  const state = useMemo(() => {
    const regs = new Array<number>(32).fill(0), mem = new Map<number, number>();
    let retired = 0, stalls = 0, flushed = 0;
    for (const c of sim?.cycles.slice(0, cur + 1) ?? []) {
      if (c.regWrite) regs[c.regWrite.rd] = c.regWrite.value;
      if (c.memWrite) mem.set(c.memWrite.index, c.memWrite.value);
      if (c.stages.WB) retired++;
      if (c.stall) stalls++;
      flushed += c.flushed.length;
    }
    return { regs, mem, retired, stalls, flushed };
  }, [sim, cur]);
  const c = sim?.cycles[cur];
  const done = !!sim && cur === last;

  const mismatches = done && sim && iss
    ? sim.regs.flatMap((v, r) => (v !== iss.regs[r] ? [`x${r} (${ABI[r]}) is ${signed(v)}, should be ${signed(iss.regs[r])}`] : []))
      .concat(sim.dmem.flatMap((v, i) => (v !== iss.dmem[i] ? [`mem[${i * 4}] is ${signed(v)}, should be ${signed(iss.dmem[i])}`] : [])))
    : [];

  const set = (d: Partial<Draft>) => setDraft({ ...draft, ...d });
  const btn = "px-2.5 py-1 rounded border border-rim text-ghost hover:text-bright hover:border-info/50 disabled:opacity-40 font-mono text-[11px]";

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(300px,380px)_1fr] items-start">
      {/* ── Program ───────────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {PIPELINE_EXAMPLES.map((e) => (
            <button key={e.name} className={btn} title={e.about} onClick={() => set({ src: e.src })}>{e.name}</button>
          ))}
        </div>
        <textarea
          value={draft.src}
          onChange={(e) => set({ src: e.target.value })}
          spellCheck={false}
          aria-label="RV32I assembly"
          className="w-full h-72 resize-y rounded-lg border border-rim bg-void/80 p-3 font-mono text-[12px] leading-[1.55] text-pale focus:outline-none focus:border-info/60"
        />
        {asm.errors.length > 0 ? (
          <ul className="space-y-1 font-mono text-[11px] text-danger">
            {asm.errors.slice(0, 6).map((e) => <li key={`${e.line}-${e.message}`}>line {e.line}: {e.message}</li>)}
          </ul>
        ) : (
          <p className="font-mono text-[10px] text-dim">
            {asm.words.length} instruction words. RV32I base (no byte/halfword loads); pseudo: li mv nop j beqz bnez ret halt.
            Data memory: 256 words from address 0.
          </p>
        )}

        <fieldset className="space-y-1.5">
          <legend className="font-mono text-[10px] uppercase tracking-wider text-dim mb-1">Data hazards</legend>
          {MODES.map((m) => (
            <label key={m.id} className={`flex gap-2 items-start rounded-lg border px-3 py-2 cursor-pointer ${draft.mode === m.id ? "border-info/60 bg-info/5" : "border-rim/60"}`}>
              <input type="radio" name="mode" checked={draft.mode === m.id} onChange={() => set({ mode: m.id })} className="mt-0.5 accent-[#4db8ff]" />
              <span>
                <span className="font-mono text-[12px] text-bright">{m.label}</span>
                <span className="block text-[11px] text-ghost leading-snug">{m.blurb}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <p className="text-[11px] text-dim leading-snug">
          Branches and jumps are decided in EX, so a taken one flushes the two instructions fetched after it.
          Build a RISC-V CPU yourself in the <Link href="/arena" className="text-info hover:underline">Arena&apos;s RISC-V track</Link>.
        </p>
      </section>

      {/* ── Pipeline ──────────────────────────────────────────── */}
      <section className="space-y-4 min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <button className={btn} disabled={!sim || cur === 0} onClick={() => { setPlaying(false); setCycle(0); }} aria-label="Back to cycle 1">⏮</button>
          <button className={btn} disabled={!sim || cur === 0} onClick={() => { setPlaying(false); setCycle(cur - 1); }} aria-label="Previous cycle">◀</button>
          <button className={`${btn} min-w-[64px]`} disabled={!sim || done} onClick={() => setPlaying(!playing)}>{playing ? "Pause" : "Run"}</button>
          <button className={btn} disabled={!sim || done} onClick={() => { setPlaying(false); setCycle(cur + 1); }} aria-label="Next cycle">▶</button>
          <button className={btn} disabled={!sim || done} onClick={() => { setPlaying(false); setCycle(last); }} aria-label="Last cycle">⏭</button>
          <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))} className="bg-void border border-rim rounded px-1.5 py-1 font-mono text-[11px] text-ghost" aria-label="Speed">
            {[1, 3, 8, 20].map((s) => <option key={s} value={s}>{s} cycles/s</option>)}
          </select>
          {sim && (
            <span className="font-mono text-[12px] text-pale ml-2">
              cycle <span className="text-bright">{cur + 1}</span> / {sim.cycles.length}
            </span>
          )}
        </div>
        {sim && (
          <input type="range" min={0} max={last} value={cur} onChange={(e) => { setPlaying(false); setCycle(Number(e.target.value)); }}
                 className="w-full accent-[#4db8ff]" aria-label="Cycle" />
        )}

        {!sim || !c ? (
          <p className="font-mono text-[12px] text-dim">Fix the assembly errors to run the pipeline.</p>
        ) : (
          <>
            <Datapath c={c} text={text} lineOf={lineOf} />

            <div className="grid gap-4 xl:grid-cols-[1fr_300px]">
              <Diagram cycles={sim.cycles} cur={cur} text={text} />
              <div className="space-y-4">
                <Registers regs={state.regs} written={c.regWrite?.rd} />
                <Memory mem={state.mem} written={c.memWrite?.index} />
              </div>
            </div>

            <div className="rounded-lg border border-rim/60 bg-pit/40 px-4 py-3 font-mono text-[11px] text-ghost space-y-1">
              <div>
                So far: <span className="text-bright">{cur + 1}</span> cycles, <span className="text-bright">{state.retired}</span> instructions
                finished, <span className="text-warn">{state.stalls}</span> stall cycles, <span className="text-danger">{state.flushed}</span> flushed.
              </div>
              {done && (
                <>
                  <div>
                    Whole program: CPI <span className="text-bright">{(sim.cycles.length / Math.max(1, sim.retired)).toFixed(2)}</span>
                    {" "}({sim.cycles.length} cycles for {sim.retired} instructions; the ideal is 1, plus 4 cycles to fill the pipeline).
                  </div>
                  <div>
                    A single-cycle CPU needs {sim.retired} cycles, but each one must fit all five stages: about {sim.retired * 5} stage-times
                    against {sim.cycles.length} here, so this pipeline is roughly {((sim.retired * 5) / sim.cycles.length).toFixed(1)}× faster.
                  </div>
                  {!sim.halted ? (
                    <div className="text-warn">Stopped after {sim.cycles.length} cycles without reaching halt.</div>
                  ) : mismatches.length === 0 ? (
                    <div className="text-phosphor">✓ Final registers and memory match the ISA reference.</div>
                  ) : (
                    <div className="text-danger">
                      ✗ {mismatches.length} difference{mismatches.length === 1 ? "" : "s"} from the ISA reference: {mismatches.slice(0, 4).join("; ")}
                      {mismatches.length > 4 ? "; …" : ""}
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

/* ── The five stages for one cycle, with forwarding arrows, stalls and flushes ── */
function Datapath({ c, text, lineOf }: { c: Cycle; text: (f: InFlight) => string; lineOf: (f: InFlight) => number | undefined }) {
  const W = 132, GAP = 22, X = (i: number) => 8 + i * (W + GAP), Y = 34, H = 74;
  const flushedIds = new Set(c.flushed.map((f) => f.id));
  const notes: Partial<Record<Stage, { text: string; color: string }>> = {};
  if (c.stall) { notes.ID = { text: "stall: waits", color: "#ffb547" }; notes.IF = { text: "stall: holds", color: "#ffb547" }; }
  for (const f of c.flushed) notes[f.id === c.stages.ID?.id ? "ID" : "IF"] = { text: "✕ flushed", color: "#ff5c5c" };
  if (c.stale) notes.ID = { text: `stale x${c.stale.reg} = ${signed(c.stale.used)}`, color: "#ff5c5c" };
  if (c.regWrite) notes.WB = { text: `x${c.regWrite.rd} ← ${signed(c.regWrite.value)}`, color: COLOR.WB };
  if (c.memWrite) notes.MEM = { text: `mem[${c.memWrite.index * 4}] ← ${signed(c.memWrite.value)}`, color: COLOR.MEM };

  return (
    <div className="overflow-x-auto rounded-lg border border-rim/60 bg-void/60">
      <svg viewBox={`0 0 ${X(5) - GAP + 8} 196`} className="min-w-[640px] w-full h-auto" role="img"
           aria-label={`Cycle ${c.n}: ${STAGES.map((s) => `${s} ${c.stages[s] ? text(c.stages[s]!) : "bubble"}`).join(", ")}`}>
        <defs>
          <marker id="pl-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M0,0 L8,4 L0,8 z" fill="#00e87a" />
          </marker>
        </defs>
        {STAGES.map((s, i) => {
          const f = c.stages[s], gone = !!f && flushedIds.has(f.id), note = notes[s];
          const label = f ? text(f) : "";
          return (
            <g key={s}>
              <text x={X(i)} y={16} fill={COLOR[s]} fontSize={12} fontFamily="monospace" fontWeight="bold">{s}</text>
              <text x={X(i) + 30} y={16} fill="#6b6f85" fontSize={8.5} fontFamily="monospace">{ABOUT[s]}</text>
              <rect x={X(i)} y={Y} width={W} height={H} rx={6} fill={f ? `${COLOR[s]}14` : "#0b0c10"}
                    stroke={f ? COLOR[s] : "#2a2d3a"} strokeWidth={f ? 1.4 : 1} strokeDasharray={f ? undefined : "4 3"} />
              {f ? (
                <>
                  <text x={X(i) + 8} y={Y + 26} fill={gone ? "#6b6f85" : "#e8e9f0"} fontSize={11} fontFamily="monospace"
                        textDecoration={gone ? "line-through" : undefined}>
                    {label.length > 18 ? `${label.slice(0, 17)}…` : label}
                    <title>{`${label}  (pc ${hex(f.pc)}${lineOf(f) ? `, line ${lineOf(f)}` : ""})`}</title>
                  </text>
                  <text x={X(i) + 8} y={Y + 44} fill="#6b6f85" fontSize={9} fontFamily="monospace">pc {hex(f.pc).slice(6)} · #{f.id + 1}</text>
                </>
              ) : (
                <text x={X(i) + W / 2} y={Y + H / 2 + 4} textAnchor="middle" fill="#3a3d4f" fontSize={10} fontFamily="monospace">bubble</text>
              )}
              {note && <text x={X(i) + 8} y={Y + H - 9} fill={note.color} fontSize={9.5} fontFamily="monospace">{note.text}</text>}
              {i < 4 && <rect x={X(i) + W + GAP / 2 - 2} y={Y - 4} width={4} height={H + 8} rx={1} fill="#2a2d3a" />}
            </g>
          );
        })}
        {c.forwards.map((fw, k) => {
          const x1 = X(fw.from === "MEM" ? 3 : 4) + W / 2, x2 = X(2) + W / 2 + (fw.operand === "rs1" ? -18 : 18);
          const y = Y + H + 22 + k * 22;
          return (
            <g key={k}>
              <path d={`M${x1},${Y + H} V${y} H${x2} V${Y + H + 2}`} fill="none" stroke="#00e87a" strokeWidth={1.4} markerEnd="url(#pl-arrow)" />
              <text x={(x1 + x2) / 2} y={y - 4} textAnchor="middle" fill="#00e87a" fontSize={9.5} fontFamily="monospace">
                {fw.operand} = x{fw.reg} = {signed(fw.value)} (from {fw.from === "MEM" ? "EX/MEM" : "MEM/WB"})
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* ── Instructions × cycles ── */
function Diagram({ cycles, cur, text }: { cycles: Cycle[]; cur: number; text: (f: InFlight) => string }) {
  const rows = useMemo(() => {
    const byId = new Map<number, { f: InFlight; cells: Map<number, Stage>; flushed: boolean; first: number }>();
    cycles.slice(0, cur + 1).forEach((c, i) => {
      for (const s of STAGES) {
        const f = c.stages[s];
        if (!f) continue;
        if (!byId.has(f.id)) byId.set(f.id, { f, cells: new Map(), flushed: false, first: i });
        byId.get(f.id)!.cells.set(i, s);
      }
      for (const f of c.flushed) if (byId.has(f.id)) byId.get(f.id)!.flushed = true;
    });
    return [...byId.values()].sort((a, b) => a.f.id - b.f.id).slice(-DIAGRAM_ROWS);
  }, [cycles, cur]);
  const from = Math.max(rows[0]?.first ?? 0, cur - DIAGRAM_COLS + 1);
  const cols = Array.from({ length: cur - from + 1 }, (_, k) => from + k);

  return (
    <div className="overflow-x-auto rounded-lg border border-rim/60">
      <table className="font-mono text-[10px] border-collapse">
        <thead>
          <tr className="text-dim">
            <th className="sticky left-0 bg-surface px-2 py-1 text-left font-normal">instruction</th>
            {cols.map((i) => <th key={i} className={`px-1 font-normal ${i === cur ? "text-bright" : ""}`}>{i + 1}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ f, cells, flushed }) => (
            <tr key={f.id} className="border-t border-rim/20">
              <td className={`sticky left-0 bg-surface px-2 py-0.5 whitespace-nowrap ${flushed ? "text-dim line-through" : "text-pale"}`}>{text(f)}</td>
              {cols.map((i) => {
                const s = cells.get(i);
                return (
                  <td key={i} className="px-0.5 py-0.5 text-center">
                    {s && <span className="inline-block w-7 rounded-sm py-px text-[9px] font-bold" style={{ background: `${COLOR[s]}26`, color: COLOR[s] }}>{s}</span>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Registers({ regs, written }: { regs: number[]; written?: number }) {
  return (
    <div className="rounded-lg border border-rim/60 p-2">
      <div className="font-mono text-[10px] uppercase tracking-wider text-dim mb-1 px-1">Registers</div>
      <div className="grid grid-cols-2 gap-x-3 font-mono text-[10px]">
        {regs.map((v, r) => (
          <div key={r} className={`flex justify-between gap-2 px-1 rounded ${r === written ? "bg-phosphor/15 text-phosphor" : v ? "text-pale" : "text-dim"}`}>
            <span>x{r} <span className="text-dim">{ABI[r]}</span></span>
            <span title={hex(v)}>{signed(v)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Memory({ mem, written }: { mem: Map<number, number>; written?: number }) {
  const rows = [...mem].sort((a, b) => a[0] - b[0]);
  return (
    <div className="rounded-lg border border-rim/60 p-2">
      <div className="font-mono text-[10px] uppercase tracking-wider text-dim mb-1 px-1">Data memory (written words)</div>
      {rows.length === 0 ? <div className="font-mono text-[10px] text-dim px-1">nothing stored yet</div> : (
        <div className="font-mono text-[10px] space-y-px">
          {rows.map(([i, v]) => (
            <div key={i} className={`flex justify-between px-1 rounded ${i === written ? "bg-warn/15 text-warn" : "text-pale"}`}>
              <span className="text-dim">[{i * 4}]</span><span title={hex(v)}>{signed(v)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
