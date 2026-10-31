"use client";
/** components/academy/anim/systems.tsx — chapters 17 to 20: timing, memories, programmable logic, ADC and DAC, Verilog. */

import { useEffect, useMemo, useRef, useState } from "react";
import CircuitViewer from "@/components/studio/CircuitViewer";
import {
  PLA_FULL_ADDER, type Pla, aliasFreq, assignSteps, captureResult, dacOut, dramLeak, dramRefresh, lutRead, mtbfSeconds, plaEval, plaTerm, quantizeCode, resolveTime, sarSteps, snrDb, timingBudget,
} from "@/lib/academy/anim";
import { CIRCUIT_EXAMPLES, generateVerilog } from "@/lib/studio/circuit";
import { AnimCard, BAD, BUS, Caption, Controls, FADE, INK, LINE, OFF, ON, WARN, btn, chip, useSteps } from "./Player";

const bin = (v: number, w: number) => v.toString(2).padStart(w, "0");
const slider = "accent-[#00e87a] w-full block";
const field = "w-20 px-2 py-1 rounded border border-rim/60 bg-void text-[14px] text-bright tabular-nums";

// ── Chapter 17: setup and hold ────────────────────────────────────────────────
export function SetupHold() {
  const [edge, setEdge] = useState(-3);
  const setup = 1.5, hold = 1, result = captureResult(edge, setup, hold);
  const W = 340, X = (ns: number) => 170 + ns * 26;
  const colour = result === "metastable" ? BAD : ON;
  return (
    <AnimCard title="Setup and hold" hint="The clock rises at the dashed line. Drag when D changes. Keep it out of the red window around the edge.">
      <svg viewBox={`0 0 ${W} 170`} className="w-full max-w-[520px] mx-auto h-auto" role="img" aria-label={`D changes ${Math.abs(edge).toFixed(1)} nanoseconds ${edge < 0 ? "before" : "after"} the edge: ${result}`}>
        <rect x={X(-setup)} y={8} width={X(hold) - X(-setup)} height={118} fill={BAD} opacity={0.14} />
        <text x={X(-setup / 2)} y={20} textAnchor="middle" fontSize={9} fill={BAD}>setup</text>
        <text x={X(hold / 2)} y={20} textAnchor="middle" fontSize={9} fill={BAD}>hold</text>
        <line x1={X(0)} y1={6} x2={X(0)} y2={130} stroke={INK} strokeDasharray="4 3" />
        <text x={8} y={50} fontSize={11} fill={LINE}>clk</text>
        <path d={`M 30 58 H ${X(0)} V 32 H ${W - 6}`} fill="none" stroke={LINE} strokeWidth={2} />
        <text x={8} y={96} fontSize={11} fill={BUS}>D</text>
        <path d={`M 30 104 H ${X(edge)} V 78 H ${W - 6}`} fill="none" stroke={BUS} strokeWidth={2} />
        <text x={8} y={154} fontSize={11} fill={colour}>Q</text>
        {result === "new" && <path d={`M 30 162 H ${X(0.8)} V 136 H ${W - 6}`} fill="none" stroke={ON} strokeWidth={2} />}
        {result === "old" && <path d={`M 30 162 H ${W - 6}`} fill="none" stroke={ON} strokeWidth={2} />}
        {result === "metastable" && <path d={`M 30 162 H ${X(0.8)} V 149 H ${X(3)} Q ${X(3.6)} 149 ${X(4)} 136 H ${W - 6}`} fill="none" stroke={BAD} strokeWidth={2} strokeDasharray="5 3" />}
      </svg>
      <label className="block text-[13px] text-ghost">D changes <strong className="text-pale tabular-nums">{edge === 0 ? "exactly at" : `${Math.abs(edge).toFixed(1)} ns ${edge < 0 ? "before" : "after"}`}</strong> the clock edge
        <input type="range" min={-5} max={5} step={0.1} value={edge} onChange={(e) => setEdge(+e.target.value)} className={slider} />
      </label>
      <Caption>
        {result === "new" ? "D was stable in time, so the flip-flop captures the new value and Q changes just after the edge."
          : result === "old" ? "D changed after the hold window, so the flip-flop captured the old value. Q changes on the next edge."
          : "D changed inside the window. The flip-flop may hang halfway between 0 and 1 for an unpredictable time before falling either way. That's metastability."}
      </Caption>
    </AnimCard>
  );
}

// ── Chapter 17: the clock period budget ───────────────────────────────────────
export function TimingBudget() {
  const [gates, setGates] = useState(6);
  const [skew, setSkew] = useState(0);
  const [period, setPeriod] = useState(10);
  const clkToQ = 1, setup = 0.5, hold = 0.5, gateNs = 1, shortest = 0.5;
  const t = timingBudget({ clkToQ, logic: gates * gateNs, shortest, setup, hold, skew, period });
  const scale = 16, W = 340, X = (ns: number) => 10 + ns * scale;
  const seg = (from: number, ns: number, fill: string, label: string) => ns > 0 && <g><rect x={X(from)} y={46} width={ns * scale} height={26} fill={fill} opacity={0.75} style={{ transition: FADE }} /><text x={X(from) + (ns * scale) / 2} y={63} textAnchor="middle" fontSize={9} fill="#04170d" fontWeight={700}>{ns * scale > 26 ? label : ""}</text></g>;
  const ok = t.setupSlack >= 0 && t.holdSlack >= 0;
  return (
    <AnimCard title="Spending the clock period" hint="Data must leave one flip-flop, cross the logic and arrive before the next edge. Add gates, tighten the clock, or skew it.">
      <svg viewBox={`0 0 ${W} 92`} className="w-full h-auto" role="img" aria-label={`Setup slack ${t.setupSlack.toFixed(1)} nanoseconds`}>
        <rect x={X(0)} y={18} width={period * scale} height={14} fill={BUS} opacity={0.25} />
        <text x={X(0) + 4} y={29} fontSize={9} fill={INK}>clock period: {period} ns</text>
        <line x1={X(period + skew)} y1={12} x2={X(period + skew)} y2={84} stroke={t.setupSlack >= 0 ? ON : BAD} strokeWidth={2} strokeDasharray="3 3" />
        {seg(0, clkToQ, WARN, "clk→Q")}
        {seg(clkToQ, gates * gateNs, BUS, "logic")}
        {seg(clkToQ + gates * gateNs, setup, BAD, "")}
      </svg>
      <div className="grid sm:grid-cols-3 gap-x-4 gap-y-2 text-[13px] text-ghost">
        <label className="block">Gates on the path: <strong className="text-pale tabular-nums">{gates}</strong><input type="range" min={1} max={14} value={gates} onChange={(e) => setGates(+e.target.value)} className={slider} /></label>
        <label className="block">Clock period: <strong className="text-pale tabular-nums">{period} ns</strong><input type="range" min={3} max={16} value={period} onChange={(e) => setPeriod(+e.target.value)} className={slider} /></label>
        <label className="block">Skew: <strong className="text-pale tabular-nums">{skew} ns</strong><input type="range" min={-2} max={2} step={0.5} value={skew} onChange={(e) => setSkew(+e.target.value)} className={slider} /></label>
      </div>
      <dl className="grid grid-cols-3 gap-2 text-[13px]">
        {[["Setup slack", `${t.setupSlack.toFixed(1)} ns`, t.setupSlack >= 0], ["Hold slack", `${t.holdSlack.toFixed(1)} ns`, t.holdSlack >= 0], ["Fastest clock", `${Math.round(t.fmaxMhz)} MHz`, true]].map(([k, v, good]) => (
          <div key={k as string} className="rounded border border-rim/40 px-2 py-1"><dt className="text-dim text-[12px]">{k}</dt><dd className={`tabular-nums ${good ? "text-pale" : "text-danger"}`}>{v}</dd></div>
        ))}
      </dl>
      <Caption>
        {t.holdSlack < 0 ? "Hold is violated: the new data races through and arrives before the capturing flip-flop has finished with the old. Slowing the clock can't fix this, because hold doesn't involve the period at all. It needs more delay on the short path."
          : t.setupSlack < 0 ? "Setup is violated: data arrives too late. Use a slower clock, or fewer gates per stage (that's what pipelining does)."
          : ok ? "This path works. Positive skew gives setup more time, but takes the same amount away from hold." : ""}
      </Caption>
    </AnimCard>
  );
}

// ── Chapter 17: metastability ─────────────────────────────────────────────────
export function Metastable() {
  const [closeness, setCloseness] = useState(3);
  const [stages, setStages] = useState(2);
  const delta = 10 ** -closeness, tau = 0.2, settle = resolveTime(delta, tau), period = 10;
  const resolved = settle < (stages === 1 ? 1 : period);
  const X = (ns: number) => 40 + ns * 28, Y = (v: number) => 110 - v * 90;
  const curve = Array.from({ length: 81 }, (_, i) => { const t = i / 8, v = 0.5 + 0.5 * Math.min(1, delta * Math.exp(t / tau)); return `${X(t)},${Y(v)}`; }).join(" ");
  const available = stages === 1 ? 1 : period;
  const years = mtbfSeconds(stages === 1 ? 1 : 9, 100, 1) / 3.15e7, seconds = mtbfSeconds(stages === 1 ? 1 : 9, 100, 1);
  return (
    <AnimCard title="Waiting for a flip-flop to decide" hint="The closer D's change was to the clock edge, the longer the flip-flop balances. A second flip-flop gives it a whole clock period to settle.">
      <svg viewBox="0 0 340 140" className="w-full max-w-[520px] mx-auto h-auto" role="img" aria-label={`Settles in ${settle.toFixed(1)} nanoseconds, with ${available} available`}>
        <line x1={X(0)} y1={Y(1)} x2={X(10)} y2={Y(1)} stroke={LINE} strokeDasharray="2 3" />
        <line x1={X(0)} y1={Y(0)} x2={X(10)} y2={Y(0)} stroke={LINE} strokeDasharray="2 3" />
        <text x={X(0) - 5} y={Y(1) + 3} textAnchor="end" fontSize={9} fill={INK}>1</text>
        <text x={X(0) - 5} y={Y(0.5) + 3} textAnchor="end" fontSize={9} fill={WARN}>?</text>
        <text x={X(0) - 5} y={Y(0) + 3} textAnchor="end" fontSize={9} fill={INK}>0</text>
        <polyline points={curve} fill="none" stroke={resolved ? ON : BAD} strokeWidth={2} />
        <line x1={X(Math.min(available, 10))} y1={Y(1) - 6} x2={X(Math.min(available, 10))} y2={Y(0) + 6} stroke={INK} strokeDasharray="4 3" />
        <text x={X(Math.min(available, 10)) - 3} y={Y(0) + 18} textAnchor="end" fontSize={9} fill={INK}>next stage reads here</text>
        <text x={X(5)} y={134} textAnchor="middle" fontSize={9} fill={LINE}>time after the clock edge (0 to 10 ns)</text>
      </svg>
      <div className="grid sm:grid-cols-2 gap-x-4 gap-y-2 text-[13px] text-ghost">
        <label className="block">How close D&apos;s change was: <strong className="text-pale tabular-nums">10⁻{closeness} of a swing</strong><input type="range" min={1} max={30} value={closeness} onChange={(e) => setCloseness(+e.target.value)} className={slider} /></label>
        <div>Flip-flops<div className="flex gap-1.5 mt-1">{[1, 2].map((n) => <button key={n} type="button" className={chip(stages === n)} aria-pressed={stages === n} onClick={() => setStages(n)}>{n === 1 ? "1, then logic" : "2 in a row"}</button>)}</div></div>
      </div>
      <p className="text-[14px] text-pale tabular-nums" role="status">Mean time between failures: <strong className={stages === 1 ? "text-danger" : "text-phosphor"}>{seconds < 60 ? `${seconds.toFixed(2)} seconds` : <>{years.toExponential(0).split("e+")[0]} × 10<sup>{years.toExponential(0).split("e+")[1]}</sup> years</>}</strong> <span className="text-dim text-[12px]">(100 MHz clock, 1 MHz data, illustrative figures)</span></p>
      <Caption>
        {resolved ? `It settles after ${settle.toFixed(1)} ns, before the next stage reads it.` : `It needs ${settle.toFixed(1)} ns, but only ${available} ns is available, so the next stage may read a voltage that isn't a clean 0 or 1.`}
        {" "}Each extra nanosecond of settling multiplies the time between failures enormously, and that's why two flip-flops in a row are the standard synchronizer.
      </Caption>
    </AnimCard>
  );
}

// ── Chapter 18: reading and writing a memory ──────────────────────────────────
export function MemoryGrid() {
  const [mem, setMem] = useState([3, 0, 12, 7, 0, 9, 0, 5]);
  const [addr, setAddr] = useState(2);
  const [data, setData] = useState(10);
  const [out, setOut] = useState<{ v: number; n: number } | null>(null);
  const [last, setLast] = useState("Pick an address. The decoder selects exactly one row.");
  const nonce = useRef(0);
  return (
    <AnimCard title="Inside a small memory" hint="8 words of 4 bits each. 3 address bits select a row through a decoder.">
      <div className="flex flex-wrap items-start gap-4">
        <div className="font-mono text-[14px]">
          {mem.map((w, i) => (
            <button key={i} type="button" onClick={() => setAddr(i)} aria-pressed={i === addr} aria-label={`Address ${i}, holds ${w}`}
                    className={`flex items-center gap-2 px-1 py-0.5 rounded transition-colors duration-200 ${i === addr ? "bg-info/20" : ""}`}>
              <span className={i === addr ? "text-info" : "text-dim"}>{bin(i, 3)}</span>
              <span className="flex gap-0.5">
                {[3, 2, 1, 0].map((b) => { const on = (w >> b) & 1; return <span key={b} className="w-6 h-6 rounded-sm flex items-center justify-center font-bold transition-colors duration-200" style={{ background: on ? "rgba(0,232,122,0.2)" : "#1c1e27", color: on ? ON : LINE }}>{on}</span>; })}
              </span>
            </button>
          ))}
        </div>
        <div className="space-y-3 text-[13px] text-ghost">
          <div>Address: <strong className="font-mono text-info">{bin(addr, 3)}</strong> (row {addr})</div>
          <label className="flex items-center gap-2">Data in <input type="number" className={field} min={0} max={15} value={data} onChange={(e) => setData(Math.max(0, Math.min(15, Math.floor(+e.target.value) || 0)))} /></label>
          <div className="flex gap-2">
            <button type="button" className={btn} onClick={() => { setMem(mem.map((w, i) => (i === addr ? data : w))); setLast(`Write: the decoder selects row ${addr}, and with write enable on, that row takes ${bin(data, 4)}. No other row changes.`); }}>Write</button>
            <button type="button" className={btn} onClick={() => { nonce.current++; setOut({ v: mem[addr], n: nonce.current }); setLast(`Read: the decoder selects row ${addr}, and that row drives the data lines. Reading doesn't change it.`); }}>Read</button>
          </div>
          <div>Data out: {out ? <strong key={out.n} className="anim-in inline-block font-mono text-phosphor">{bin(out.v, 4)} ({out.v})</strong> : <span className="text-dim">nothing yet</span>}</div>
        </div>
      </div>
      <Caption>{last}</Caption>
    </AnimCard>
  );
}

// ── Chapter 18: DRAM refresh ──────────────────────────────────────────────────
const DRAM_START = [1, 0, 1, 1, 0, 1, 0, 1];
export function DramRefresh() {
  const [q, setQ] = useState(DRAM_START);
  const [running, setRunning] = useState(false);
  const [auto, setAuto] = useState(true);
  const age = useRef(0);
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      age.current++;
      setQ((cur) => (auto && age.current % 16 === 0 ? dramRefresh(cur) : dramLeak(cur, 0.04)));
    }, 120);
    return () => window.clearInterval(id);
  }, [running, auto]);
  const read = q.map((v) => (v >= 0.5 ? 1 : 0)), lost = read.filter((b, i) => b !== DRAM_START[i]).length;
  return (
    <AnimCard title="Why DRAM needs refreshing" hint="Each bit is charge on a tiny capacitor, and it leaks. Press Run, then try turning off automatic refresh.">
      <div className="flex items-end gap-1.5 h-28" role="img" aria-label={`Cells read ${read.join("")}, ${lost} bits lost`}>
        {q.map((v, i) => (
          <div key={i} className="flex-1 max-w-[40px] h-full flex flex-col justify-end relative rounded-sm bg-pit border border-rim/50 overflow-hidden">
            <span className="absolute left-0 right-0 border-t border-dashed border-warn/60" style={{ top: "50%" }} />
            <span className="block w-full" style={{ height: `${v * 100}%`, background: read[i] !== DRAM_START[i] ? BAD : ON, opacity: 0.7, transition: "height 120ms linear" }} />
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={btn} onClick={() => setRunning(!running)}>{running ? "Pause" : "Run"}</button>
        <button type="button" className={chip(auto)} aria-pressed={auto} onClick={() => setAuto(!auto)}>Automatic refresh {auto ? "on" : "off"}</button>
        <button type="button" className={btn} onClick={() => setQ(dramRefresh)}>Refresh now</button>
        <button type="button" className={btn} onClick={() => { age.current = 0; setQ(DRAM_START); }}>Rewrite data</button>
      </div>
      <Caption>
        {lost ? `${lost} bit${lost === 1 ? " has" : "s have"} fallen below the dashed line, so a read returns 0 where a 1 was stored. A refresh can't bring them back, because it can only restore what it reads.`
          : "A refresh reads each cell and writes it back at full charge. Real DRAM does this for every row, about every 64 ms. An SRAM cell holds its bit in a feedback loop instead, so it needs no refresh, but it takes 6 transistors rather than 1."}
      </Caption>
    </AnimCard>
  );
}

// ── Chapter 18: programming a PLA ─────────────────────────────────────────────
const PLA_COLS = ["a", "a'", "b", "b'", "c", "c'"];
const EMPTY_PLA: Pla = { and: Array.from({ length: 7 }, () => []), or: [[], []] };
export function PlaProgram() {
  const [pla, setPla] = useState<Pla>(PLA_FULL_ADDER);
  const [inputs, setInputs] = useState([1, 0, 1]);
  const out = plaEval(pla, inputs);
  const toggleAnd = (r: number, c: number) => setPla({ ...pla, and: pla.and.map((cols, i) => (i === r ? (cols.includes(c) ? cols.filter((x) => x !== c) : [...cols, c]) : cols)) });
  const toggleOr = (o: number, r: number) => setPla({ ...pla, or: pla.or.map((rows, i) => (i === o ? (rows.includes(r) ? rows.filter((x) => x !== r) : [...rows, r]) : rows)) });
  const termText = (cols: number[]) => [...cols].sort((x, y) => x - y).map((c) => PLA_COLS[c]).join("") || "—";
  const expr = (o: number) => pla.or[o].filter((r) => pla.and[r].length).map((r) => termText(pla.and[r])).join(" + ") || "0";
  const cell = (on: boolean, hot: boolean) => `w-8 h-7 border border-rim/40 flex items-center justify-center text-[14px] transition-colors duration-150 ${on ? (hot ? "text-phosphor bg-phosphor/20" : "text-pale bg-surface/60") : "text-transparent hover:bg-surface/40"}`;
  return (
    <AnimCard title="Program a PLA" hint="Click a crossing to connect it, as a fuse would. Each row is an AND of its connections. Each output column ORs the rows connected to it.">
      <div className="flex flex-wrap gap-1.5">
        {inputs.map((v, i) => <button key={i} type="button" className={chip(v === 1)} aria-pressed={v === 1} onClick={() => setInputs(inputs.map((b, k) => (k === i ? b ^ 1 : b)))}>{"abc"[i]} = {v}</button>)}
        <span className="w-2" />
        <button type="button" className={btn} onClick={() => setPla(PLA_FULL_ADDER)}>Full adder</button>
        <button type="button" className={btn} onClick={() => setPla(EMPTY_PLA)}>Clear</button>
      </div>
      <div className="overflow-x-auto">
        <div className="inline-grid font-mono" style={{ gridTemplateColumns: `3.5rem repeat(6, 2rem) 0.75rem repeat(2, 2rem)` }}>
          <span />
          {PLA_COLS.map((c) => <span key={c} className="text-center text-[12px] text-ghost">{c}</span>)}
          <span />
          {["sum", "cy"].map((c) => <span key={c} className="text-center text-[11px] text-ghost">{c}</span>)}
          {pla.and.map((cols, r) => {
            const hot = plaTerm(cols, inputs);
            return [
              <span key={`t${r}`} className={`text-[12px] pr-1 self-center transition-colors duration-150 ${hot ? "text-phosphor" : "text-dim"}`}>term {r + 1}</span>,
              ...PLA_COLS.map((name, c) => <button key={`${r}-${c}`} type="button" aria-pressed={cols.includes(c)} aria-label={`Term ${r + 1}, ${name}`} onClick={() => toggleAnd(r, c)} className={cell(cols.includes(c), hot)}>×</button>),
              <span key={`g${r}`} />,
              ...[0, 1].map((o) => <button key={`o${o}-${r}`} type="button" aria-pressed={pla.or[o].includes(r)} aria-label={`Output ${o === 0 ? "sum" : "carry"}, term ${r + 1}`} onClick={() => toggleOr(o, r)} className={cell(pla.or[o].includes(r), hot)}>×</button>),
            ];
          })}
          <span />
          {PLA_COLS.map((c) => <span key={c} />)}
          <span />
          {out.map((v, o) => <span key={o} className="flex items-center justify-center pt-1"><span className="w-6 h-6 rounded-full flex items-center justify-center text-[13px] font-bold transition-colors duration-200" style={{ background: v ? ON : "#1c1e27", color: v ? "#04170d" : INK }}>{v}</span></span>)}
        </div>
      </div>
      <p className="font-mono text-[13px] text-pale break-words" role="status">sum = {expr(0)}<br />carry = {expr(1)}</p>
      <Caption>{pla === PLA_FULL_ADDER ? "Programmed as a full adder, it has 7 product terms, and term 4 (abc) is shared by both outputs." : "Click the crossings to connect inputs to AND terms and AND terms to outputs. A term with no connections stays at 0."} Sharing terms is what a PLA can do and a PAL can&apos;t, because a PAL&apos;s OR connections are fixed.</Caption>
    </AnimCard>
  );
}

// ── Chapter 18: a look-up table ───────────────────────────────────────────────
const LUT_PRESETS: [string, number[]][] = [["AND", [0, 0, 0, 0, 0, 0, 0, 1]], ["OR", [0, 1, 1, 1, 1, 1, 1, 1]], ["XOR", [0, 1, 1, 0, 1, 0, 0, 1]], ["Majority", [0, 0, 0, 1, 0, 1, 1, 1]]];
export function LutExplorer() {
  const [bits, setBits] = useState(LUT_PRESETS[3][1]);
  const [inputs, setInputs] = useState([1, 0, 1]);
  const at = inputs.reduce((n, b) => n * 2 + b, 0), y = lutRead(bits, inputs);
  return (
    <AnimCard title="An FPGA's look-up table" hint="A 3-input LUT is 8 memory bits. The inputs are just an address, so changing the bits changes the function.">
      <div className="flex flex-wrap gap-1.5">{LUT_PRESETS.map(([name, p]) => <button key={name} type="button" className={chip(p.join() === bits.join())} onClick={() => setBits(p)}>{name}</button>)}</div>
      <div className="flex flex-wrap items-center gap-6">
        <div className="font-mono text-[14px] space-y-0.5">
          {bits.map((b, i) => (
            <button key={i} type="button" onClick={() => setBits(bits.map((x, k) => (k === i ? x ^ 1 : x)))} aria-label={`Bit ${i} is ${b}`}
                    className={`flex items-center gap-2 px-1 rounded transition-colors duration-200 ${i === at ? "bg-info/20" : ""}`}>
              <span className={i === at ? "text-info" : "text-dim"}>{bin(i, 3)}</span>
              <span className="w-6 h-6 rounded-sm flex items-center justify-center font-bold transition-colors duration-150" style={{ background: b ? "rgba(0,232,122,0.2)" : "#1c1e27", color: b ? ON : LINE }}>{b}</span>
            </button>
          ))}
        </div>
        <div className="space-y-3">
          <div className="flex gap-1.5">{inputs.map((v, i) => <button key={i} type="button" className={chip(v === 1)} aria-pressed={v === 1} onClick={() => setInputs(inputs.map((b, k) => (k === i ? b ^ 1 : b)))}>{"abc"[i]} = {v}</button>)}</div>
          <div className="flex items-center gap-2 text-[14px] text-pale" role="status">Output
            <span className="w-9 h-9 rounded-full flex items-center justify-center font-mono font-bold transition-colors duration-200" style={{ background: y ? ON : "#1c1e27", color: y ? "#04170d" : INK }}>{y}</span>
          </div>
        </div>
      </div>
      <Caption>The address {bin(at, 3)} reads bit {at}, which is {y}. Click any bit to change the function. With 8 bits there are 2⁸ = 256 functions of 3 inputs, and this LUT can be every one of them.</Caption>
    </AnimCard>
  );
}

// ── Chapter 19: sampling ──────────────────────────────────────────────────────
export function Sampling() {
  const s = useSteps(41, 0, 450), f = s.step / 2 + 0.5;
  const [fs, setFs] = useState(10);
  const alias = aliasFreq(f, fs), W = 340, H = 130, X = (t: number) => 10 + t * (W - 20), Y = (v: number) => H / 2 - v * (H / 2 - 10);
  const line = (freq: number) => Array.from({ length: 401 }, (_, i) => { const t = i / 400; return `${X(t)},${Y(Math.sin(2 * Math.PI * freq * t))}`; }).join(" ");
  const samples = Array.from({ length: Math.floor(fs) + 1 }, (_, i) => i / fs).filter((t) => t <= 1);
  const ok = f < fs / 2;
  return (
    <AnimCard title="Sampling and aliasing" hint="Green dots are the only thing the converter sees. Raise the signal's frequency past half the sampling rate and watch what those dots appear to show.">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={`A ${f} hertz signal sampled at ${fs} hertz looks like ${Math.abs(alias)} hertz`}>
        <line x1={10} y1={H / 2} x2={W - 10} y2={H / 2} stroke={OFF} />
        <polyline points={line(f)} fill="none" stroke={BUS} strokeWidth={1.2} opacity={0.75} />
        <polyline points={line(alias)} fill="none" stroke={ok ? ON : BAD} strokeWidth={2} strokeDasharray={ok ? undefined : "5 3"} />
        {samples.map((t) => <circle key={t} cx={X(t)} cy={Y(Math.sin(2 * Math.PI * f * t))} r={3.5} fill={ON} stroke="#111218" />)}
      </svg>
      <div className="grid sm:grid-cols-2 gap-x-4 gap-y-2 text-[13px] text-ghost">
        <label className="block">Signal: <strong className="text-pale tabular-nums">{f} Hz</strong><input type="range" min={0} max={40} value={s.step} onChange={(e) => s.set(+e.target.value)} className={slider} /></label>
        <label className="block">Sampling rate: <strong className="text-pale tabular-nums">{fs} Hz</strong><input type="range" min={4} max={40} value={fs} onChange={(e) => setFs(+e.target.value)} className={slider} /></label>
      </div>
      <div className="flex flex-wrap items-center gap-2"><button type="button" className={btn} onClick={s.toggle}>{s.playing ? "Pause" : "Sweep the signal"}</button></div>
      <Caption>
        {ok ? `${f} Hz is below ${fs / 2} Hz, half the sampling rate, so the samples capture it correctly.`
          : f === fs / 2 ? `${f} Hz is exactly half the sampling rate. That isn't enough: the theorem needs more than twice the frequency, because at exactly twice the samples can all land on the zero crossings and lose the signal.`
          : Math.abs(alias) < 1e-9 ? `At exactly a multiple of the sampling rate, every sample lands in the same place, so the signal looks like a flat line.`
          : `${f} Hz is above the Nyquist limit of ${fs / 2} Hz. The same dots fit a slower wave at ${Math.abs(alias)} Hz, drawn in red. After sampling, nothing can tell them apart.`}
      </Caption>
    </AnimCard>
  );
}

// ── Chapter 19: quantizing ────────────────────────────────────────────────────
export function Quantize() {
  const [bits, setBits] = useState(3);
  const W = 340, H = 140, X = (t: number) => 10 + t * (W - 20), Y = (v: number) => H - 8 - v * (H - 16);
  const wave = (t: number) => 0.5 + 0.45 * Math.sin(2 * Math.PI * 1.5 * t);
  const levels = 2 ** bits, lsb = 5 / levels;
  const steps = useMemo(() => Array.from({ length: 401 }, (_, i) => { const t = i / 400, c = quantizeCode(wave(t) * 5, bits, 5); return `${X(t)},${Y((c + 0.5) / levels)}`; }).join(" "), [bits, levels]); // eslint-disable-line react-hooks/exhaustive-deps
  const smooth = Array.from({ length: 201 }, (_, i) => { const t = i / 200; return `${X(t)},${Y(wave(t))}`; }).join(" ");
  return (
    <AnimCard title="Quantization" hint="Each sample is rounded to the nearest code. Change the number of bits and watch the staircase get finer.">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={`${bits} bit quantization with ${levels} levels`}>
        {bits <= 5 && Array.from({ length: levels + 1 }, (_, i) => <line key={i} x1={10} x2={W - 10} y1={Y(i / levels)} y2={Y(i / levels)} stroke={OFF} strokeWidth={0.5} />)}
        <polyline points={smooth} fill="none" stroke={BUS} strokeWidth={1.5} opacity={0.8} />
        <polyline points={steps} fill="none" stroke={ON} strokeWidth={1.8} />
      </svg>
      <label className="block text-[13px] text-ghost">Resolution: <strong className="text-pale tabular-nums">{bits} {bits === 1 ? "bit" : "bits"}</strong><input type="range" min={1} max={10} value={bits} onChange={(e) => setBits(+e.target.value)} className={slider} /></label>
      <dl className="grid grid-cols-3 gap-2 text-[13px]">
        {[["Levels", String(levels)], ["1 LSB (5 V range)", lsb >= 0.1 ? `${lsb.toFixed(2)} V` : `${(lsb * 1000).toFixed(1)} mV`], ["Best SNR", `${snrDb(bits).toFixed(1)} dB`]].map(([k, v]) => (
          <div key={k} className="rounded border border-rim/40 px-2 py-1"><dt className="text-dim text-[12px]">{k}</dt><dd className="text-pale tabular-nums">{v}</dd></div>
        ))}
      </dl>
      <Caption>The gap between the blue wave and the green staircase is <strong className="text-bright">quantization error</strong>, up to one LSB here, because this converter rounds down. It sounds like noise, and each extra bit halves it, which adds about 6 dB of signal-to-noise ratio.</Caption>
    </AnimCard>
  );
}

// ── Chapter 19: a SAR converter ───────────────────────────────────────────────
export function SarAdc() {
  const [vin, setVin] = useState(3.2);
  const bits = 4, vref = 5, steps = sarSteps(vin, vref, bits), s = useSteps(bits + 1, vin, 1300);
  const done = steps.slice(0, s.step), now = done[done.length - 1], code = now?.code ?? 0;
  const W = 340, X = (v: number) => 12 + (v / vref) * (W - 24);
  return (
    <AnimCard title="Successive approximation" hint="A binary search with a comparator and a DAC. Try the top bit, keep it if the input is above that voltage, and move on to the next.">
      <svg viewBox={`0 0 ${W} 74`} className="w-full h-auto" role="img" aria-label={`Input ${vin.toFixed(1)} volts, code so far ${bin(code, bits)}`}>
        <line x1={X(0)} y1={40} x2={X(vref)} y2={40} stroke={OFF} strokeWidth={8} strokeLinecap="round" />
        <line x1={X(vin)} y1={14} x2={X(vin)} y2={56} stroke={BUS} strokeWidth={2.5} />
        <text x={X(vin)} y={10} textAnchor="middle" fontSize={10} fill={BUS}>input {vin.toFixed(1)} V</text>
        {now && <g><line x1={X(now.volts)} y1={26} x2={X(now.volts)} y2={70} stroke={now.keep ? ON : BAD} strokeWidth={2.5} style={{ transition: FADE }} /><text x={X(now.volts)} y={70} dx={now.volts > 4 ? -4 : 4} textAnchor={now.volts > 4 ? "end" : "start"} fontSize={9} fill={now.keep ? ON : BAD}>trial {now.volts.toFixed(2)} V</text></g>}
      </svg>
      <div className="flex items-center gap-1">
        {[3, 2, 1, 0].map((b) => { const known = done.some((d) => d.bit === b), on = (code >> b) & 1, trying = now?.bit === b; return <span key={b} className={`w-10 h-11 rounded border flex items-center justify-center font-mono text-[18px] font-bold transition-[background-color,border-color,color] duration-200 ${trying ? "border-info" : "border-rim/50"}`} style={{ background: known && on ? "rgba(0,232,122,0.18)" : "#1c1e27", color: known ? (on ? ON : INK) : LINE }}>{known ? on : "?"}</span>; })}
      </div>
      <label className="block text-[13px] text-ghost">Input: <strong className="text-pale tabular-nums">{vin.toFixed(1)} V</strong><input type="range" min={0} max={4.9} step={0.1} value={vin} onChange={(e) => setVin(+e.target.value)} className={slider} /></label>
      <Controls s={s} />
      <Caption>
        {!now ? `Convert ${vin.toFixed(1)} V to 4 bits, on a 5 V range. It'll take one comparison per bit.`
          : `Try bit ${now.bit}: the DAC outputs ${now.volts.toFixed(2)} V. The input is ${now.keep ? "at or above it, so keep this 1" : "below it, so clear this bit"}.${s.step === bits ? ` Done in ${bits} steps: ${bin(code, bits)}, which stands for ${(code * vref / 2 ** bits).toFixed(2)} V, the closest code at or below the input.` : ""}`}
      </Caption>
    </AnimCard>
  );
}

// ── Chapter 19: a DAC ─────────────────────────────────────────────────────────
export function DacBits() {
  const bits = 4, vref = 5, s = useSteps(16, 0, 400), code = s.step;
  const W = 340, H = 110, X = (c: number) => 12 + (c / 16) * (W - 24), Y = (v: number) => H - 8 - (v / vref) * (H - 18);
  const stairs = Array.from({ length: 16 }, (_, c) => `${X(c)},${Y(dacOut(c, bits, vref))} ${X(c + 1)},${Y(dacOut(c, bits, vref))}`).join(" ");
  return (
    <AnimCard title="A digital-to-analog converter" hint="Each bit adds its own weighted share of the reference voltage. Click bits, or press Play to count up and see the staircase.">
      <div className="flex gap-1.5">
        {[3, 2, 1, 0].map((b) => { const on = (code >> b) & 1; return (
          <button key={b} type="button" aria-pressed={!!on} onClick={() => s.set(code ^ (1 << b))} className={`w-16 rounded border py-1.5 transition-[background-color,border-color,color] duration-200 ${on ? "border-phosphor/60 bg-phosphor/15 text-phosphor" : "border-rim/50 text-dim"}`}>
            <span className="block font-mono text-[18px] font-bold">{on}</span><span className="block text-[11px] tabular-nums">{dacOut(1 << b, bits, vref).toFixed(3)} V</span>
          </button>); })}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={`Code ${code} gives ${dacOut(code, bits, vref).toFixed(3)} volts`}>
        <polyline points={stairs} fill="none" stroke={OFF} strokeWidth={1.5} />
        <polyline points={Array.from({ length: code + 1 }, (_, c) => `${X(c)},${Y(dacOut(c, bits, vref))} ${X(c + 1)},${Y(dacOut(c, bits, vref))}`).join(" ")} fill="none" stroke={ON} strokeWidth={2} />
        <circle cx={X(code + 0.5)} cy={Y(dacOut(code, bits, vref))} r={4.5} fill={ON} stroke="#111218" />
      </svg>
      <Controls s={s} />
      <Caption>Code {code} ({bin(code, bits)}) gives {dacOut(code, bits, vref).toFixed(3)} V. The step is 5 V ÷ 16 = 0.3125 V, and the highest output, 4.6875 V, is one step below the reference.</Caption>
    </AnimCard>
  );
}

// ── Chapter 20: blocking and nonblocking ──────────────────────────────────────
const ASSIGN_LINES = { nonblocking: ["a <= b;", "b <= a;"], blocking: ["a = b;", "b = a;"] };
function AssignColumn({ kind, step }: { kind: "blocking" | "nonblocking"; step: number }) {
  const start = { a: 1, b: 2 }, st = step ? assignSteps(kind, start.a, start.b)[step - 1] : start;
  return (
    <div className="min-w-0 rounded-lg border border-rim/50 p-3 space-y-2">
      <div className="text-[13px] font-semibold text-pale capitalize">{kind}</div>
      <pre className="font-mono text-[14px] leading-6">{ASSIGN_LINES[kind].map((l, i) => <span key={l} className={`block rounded px-1 transition-colors duration-200 ${step === i + 1 ? "bg-info/20 text-bright" : "text-ghost"}`}>{l}</span>)}</pre>
      <div className="flex gap-3 font-mono text-[15px]">
        {(["a", "b"] as const).map((r) => <span key={r} className="text-pale">{r} = <strong key={st[r]} className="anim-in inline-block text-phosphor">{st[r]}</strong></span>)}
      </div>
    </div>
  );
}
export function BlockingNonblocking() {
  const s = useSteps(4, 0, 1500);
  return (
    <AnimCard title="Blocking against nonblocking" hint="Both start with a = 1 and b = 2 at a clock edge. Step through the two lines and compare.">
      <div className="grid grid-cols-2 gap-3"><AssignColumn kind="nonblocking" step={s.step} /><AssignColumn kind="blocking" step={s.step} /></div>
      <Controls s={s} />
      <Caption>
        {s.step === 0 ? "Each block runs its two lines from top to bottom, at the same clock edge."
          : s.step === 1 ? "Nonblocking only notes that a will become 2 and doesn't change it yet. Blocking changes a to 2 straight away."
          : s.step === 2 ? "Nonblocking notes that b will become the old a, 1. Blocking reads a, which is already 2, so b stays 2."
          : "At the end of the step the nonblocking updates land together, so they swap, like two real flip-flops. The blocking version lost a value. Flip-flops need <=."}
      </Caption>
    </AnimCard>
  );
}

// ── Chapter 20: a circuit and its Verilog ─────────────────────────────────────
const VERILOG_EXAMPLES = CIRCUIT_EXAMPLES.filter((e) => ["Half adder", "2:1 mux", "2-bit counter", "Majority vote"].includes(e.label));
export function CircuitToVerilog() {
  const [i, setI] = useState(0);
  const ex = VERILOG_EXAMPLES[i], code = useMemo(() => generateVerilog(ex.circuit), [ex]);
  return (
    <AnimCard title="A circuit and its Verilog" hint="The same design, two ways. Each part in the circuit becomes a line of code. The Verilog is generated by the circuit editor, so you can do this with your own circuits too.">
      <div className="flex flex-wrap gap-1.5">{VERILOG_EXAMPLES.map((e, k) => <button key={e.label} type="button" className={chip(k === i)} aria-pressed={k === i} onClick={() => setI(k)}>{e.label}</button>)}</div>
      <CircuitViewer key={ex.label} circuit={ex.circuit} />
      <pre className="anim-in overflow-x-auto rounded-lg border border-rim/60 bg-void p-3 font-mono text-[12px] leading-relaxed text-pale max-h-72" key={`${ex.label}-code`}>{code}</pre>
    </AnimCard>
  );
}
