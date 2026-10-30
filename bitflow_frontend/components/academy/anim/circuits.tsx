"use client";
/** components/academy/anim/circuits.tsx — chapters 9 to 12: inverter curve, loading, comparing, routing, carry race, multiplying. */

import { useState } from "react";
import { boothSteps, claCarryTime, compareSteps, inverterOut, inverterState, loadModel, rcWave, rippleCarryTime, shiftAddSteps } from "@/lib/academy/anim";
import { AnimCard, BAD, BUS, Caption, Controls, FADE, INK, LINE, MOVE, OFF, ON, WARN, btn, chip, useSteps } from "./Player";

const field = "w-20 px-2 py-1 rounded border border-rim/60 bg-void text-[14px] text-bright tabular-nums";
const bin = (v: number, w: number) => v.toString(2).padStart(w, "0");

// ── Chapter 9: the inverter's transfer curve ──────────────────────────────────
function Fet({ name, on }: { name: string; on: boolean }) {
  return <span className={`rounded border px-2 py-1 text-[13px] transition-colors duration-200 ${on ? "border-phosphor/60 bg-phosphor/10 text-phosphor" : "border-rim/50 text-dim"}`}>{name}: {on ? "on" : "off"}</span>;
}

export function InverterCurve() {
  const s = useSteps(51, 0, 110), vin = s.step / 10, vout = inverterOut(vin), st = inverterState(vin);
  const X = (v: number) => 40 + v * 46, Y = (v: number) => 220 - v * 40;
  const curve = Array.from({ length: 101 }, (_, i) => { const v = i / 20; return `${X(v)},${Y(inverterOut(v))}`; }).join(" ");
  const both = st.nmos && st.pmos;
  return (
    <AnimCard title="An inverter's voltage curve" hint="Sweep the input from 0 V to 5 V and watch the output. Digital logic lives on the two flat parts.">
      <svg viewBox="0 0 300 250" className="w-full max-w-[420px] mx-auto h-auto" role="img" aria-label={`Inverter: input ${vin.toFixed(1)} volts gives output ${vout.toFixed(1)} volts`}>
        <rect x={X(1.5)} y={Y(5)} width={X(3.5) - X(1.5)} height={Y(0) - Y(5)} fill={WARN} opacity={0.1} />
        <text x={X(2.5)} y={Y(5) + 12} textAnchor="middle" fontSize={9} fill={WARN}>no defined meaning</text>
        <line x1={X(0)} y1={Y(0)} x2={X(5)} y2={Y(0)} stroke={LINE} />
        <line x1={X(0)} y1={Y(0)} x2={X(0)} y2={Y(5)} stroke={LINE} />
        {[0, 1, 2, 3, 4, 5].map((v) => <g key={v}><text x={X(v)} y={Y(0) + 13} textAnchor="middle" fontSize={9} fill={INK}>{v}</text><text x={X(0) - 7} y={Y(v) + 3} textAnchor="end" fontSize={9} fill={INK}>{v}</text></g>)}
        <text x={X(2.5)} y={Y(0) + 26} textAnchor="middle" fontSize={10} fill={INK}>input (V)</text>
        <text x={12} y={Y(2.5)} textAnchor="middle" fontSize={10} fill={INK} transform={`rotate(-90 12 ${Y(2.5)})`}>output (V)</text>
        <polyline points={curve} fill="none" stroke={BUS} strokeWidth={2} />
        <line x1={X(vin)} y1={Y(0)} x2={X(vin)} y2={Y(vout)} stroke={LINE} strokeDasharray="3 3" />
        <circle cx={X(vin)} cy={Y(vout)} r={5.5} fill={both ? WARN : ON} stroke="#111218" />
      </svg>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px] text-ghost">
        <button type="button" className={btn} onClick={s.toggle}>{s.playing ? "Pause" : s.step >= s.count - 1 ? "Sweep again" : "Sweep"}</button>
        <label className="flex items-center gap-2">Input <input type="range" min={0} max={50} value={s.step} onChange={(e) => s.set(+e.target.value)} className="accent-[#00e87a] w-36" /></label>
        <span className="tabular-nums text-pale">{vin.toFixed(1)} V in, {vout.toFixed(1)} V out</span>
        <Fet name="PMOS" on={st.pmos} /><Fet name="NMOS" on={st.nmos} />
      </div>
      <Caption>
        {both ? "Both transistors are partly on, so current flows straight from supply to ground. This is why CMOS draws extra power while switching, and why a slow input edge wastes energy."
          : st.pmos ? "Only the PMOS is on, so the output sits at the supply. Change the input a little and nothing happens: that flat stretch is the noise margin at work."
          : "Only the NMOS is on, so the output sits at ground. No current path exists from supply to ground, so a CMOS gate at rest draws almost no power."}
      </Caption>
    </AnimCard>
  );
}

// ── Chapter 9: fan-out and loading ────────────────────────────────────────────
export function LoadDelay() {
  const [n, setN] = useState(2);
  const [mhz, setMhz] = useState(5);
  const [volts, setVolts] = useState(5);
  const m = loadModel(n, mhz, volts), wave = rcWave(m.halfPeriod, m.tau);
  const W = 320, X = (i: number) => 10 + (i / 200) * (W - 20), Y = (v: number, top: number, h: number) => top + h - v * h;
  const output = wave.map((v, i) => `${X(i)},${Y(v, 62, 80)}`).join(" ");
  const input = [0, 50, 50, 100, 100, 150, 150, 200].map((i, k) => `${X(i)},${Y(k === 0 || k === 1 || k === 4 || k === 5 ? 1 : 0, 15, 30)}`).join(" ");
  return (
    <AnimCard title="What loading a gate does" hint="One gate drives several others. Each input is a small capacitor the output has to charge. Add loads or raise the clock until it breaks.">
      <svg viewBox={`0 0 ${W} 160`} className="w-full max-w-[520px] mx-auto h-auto" role="img" aria-label={`Output swing reaches ${Math.round(m.high * 100)} percent of the supply`}>
        <text x={12} y={9} fontSize={9} fill={BUS}>what the gate is told</text>
        <polyline points={input} fill="none" stroke={BUS} strokeWidth={1.5} />
        <text x={12} y={60} fontSize={9} fill={m.ok ? ON : BAD}>what actually reaches the next gate</text>
        <rect x={10} y={Y(0.7, 62, 80)} width={W - 20} height={Y(0.3, 62, 80) - Y(0.7, 62, 80)} fill={WARN} opacity={0.1} />
        <polyline points={output} fill="none" stroke={m.ok ? ON : BAD} strokeWidth={2} style={{ transition: FADE }} />
      </svg>
      <div className="grid sm:grid-cols-3 gap-x-4 gap-y-2 text-[13px] text-ghost">
        <label className="block">Gates driven: <strong className="text-pale tabular-nums">{n}</strong><input type="range" min={1} max={30} value={n} onChange={(e) => setN(+e.target.value)} className="accent-[#00e87a] w-full block" /></label>
        <label className="block">Clock: <strong className="text-pale tabular-nums">{mhz} MHz</strong><input type="range" min={1} max={50} value={mhz} onChange={(e) => setMhz(+e.target.value)} className="accent-[#00e87a] w-full block" /></label>
        <div>Supply<div className="flex gap-1.5 mt-1">{[5, 3.3, 1.8].map((v) => <button key={v} type="button" className={chip(volts === v)} aria-pressed={volts === v} onClick={() => setVolts(v)}>{v} V</button>)}</div></div>
      </div>
      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[13px]">
        {[["Load", `${m.pf} pF`], ["Delay", `${m.delay.toFixed(1)} ns`], ["Swing", `${Math.round(m.high * 100)}%`], ["Power", `${m.milliwatts.toFixed(1)} mW`]].map(([k, v]) => (
          <div key={k} className="rounded border border-rim/40 px-2 py-1"><dt className="text-dim text-[12px]">{k}</dt><dd className="text-pale tabular-nums">{v}</dd></div>
        ))}
      </dl>
      <Caption>
        {m.ok ? `The output settles well inside the valid levels. Each extra load adds delay, and dynamic power is C × V² × f, so dropping from 5 V to 1.8 V cuts it by almost 8 times.`
          : `The clock is too fast for this load: the output never gets far enough from the middle, so the next gate can't read it. Slow the clock or drive fewer gates.`}
      </Caption>
    </AnimCard>
  );
}

// ── Chapter 10: comparing from the top bit ────────────────────────────────────
export function CompareBits() {
  const [a, setA] = useState(11);
  const [b, setB] = useState(9);
  const w = 4, A = a % 16, B = b % 16, steps = compareSteps(A, B, w);
  const s = useSteps(steps.length + 1, `${A},${B}`, 1100);
  const seen = steps.slice(0, s.step), last = seen[seen.length - 1];
  const decided = last && last.verdict !== "same";
  const row = (name: string, v: number) => (
    <div className="flex items-center gap-1.5">
      <span className="w-6 text-[13px] text-dim">{name}</span>
      {Array.from({ length: w }, (_, k) => {
        const bit = w - 1 - k, x = (v >> bit) & 1, step = seen.find((t) => t.bit === bit);
        const tone = !step ? "border-rim/40 text-dim" : step.verdict === "same" ? "border-rim text-pale" : "border-phosphor/70 bg-phosphor/15 text-phosphor font-bold";
        return <span key={bit} className={`w-10 h-10 rounded border flex items-center justify-center font-mono text-[18px] transition-[background-color,border-color,color] duration-200 ease-out ${tone}`}>{x}</span>;
      })}
    </div>
  );
  return (
    <AnimCard title="How a comparator decides" hint="It starts at the most significant bit, and the first difference settles it. Nothing below that bit can change the answer.">
      <div className="flex flex-wrap gap-3 text-[14px] text-ghost">
        <label className="flex items-center gap-1.5">A <input type="number" className={field} min={0} max={15} value={A} onChange={(e) => setA(Math.max(0, Math.floor(+e.target.value) || 0))} /></label>
        <label className="flex items-center gap-1.5">B <input type="number" className={field} min={0} max={15} value={B} onChange={(e) => setB(Math.max(0, Math.floor(+e.target.value) || 0))} /></label>
      </div>
      <div className="space-y-1.5">{row("A", A)}{row("B", B)}</div>
      <Controls s={s} />
      <Caption>
        {!last ? `Compare ${A} and ${B}. Start from the left.`
          : decided ? `Bit ${last.bit}: A has ${last.a} and B has ${last.b}. That's the first difference, so A ${last.verdict === "greater" ? ">" : "<"} B. The lower bits don't matter.`
          : s.step === steps.length ? "Every bit matched, so A = B."
          : `Bit ${last.bit}: both are ${last.a}. Still equal, so move to the next bit down.`}
      </Caption>
    </AnimCard>
  );
}

// ── Chapter 11: routing a bit ─────────────────────────────────────────────────
const ANGLES = [-39, -13, 13, 39], R = 118, CY = 130;
export function MuxRouter() {
  const [mode, setMode] = useState<"mux" | "demux" | "decoder">("mux");
  const [data, setData] = useState([1, 0, 1, 0]);
  const [d, setD] = useState(1);
  const [sel, setSel] = useState(2);
  const isMux = mode === "mux", W = 340;
  const px = isMux ? 215 : 125, dir = isMux ? -1 : 1;               // the pivot, and which way the arm points
  const tip = (i: number) => { const t = (ANGLES[i] * Math.PI) / 180; return [px + dir * R * Math.cos(t), CY + R * Math.sin(t)]; };
  const single = mode === "decoder" ? 1 : isMux ? data[sel] : d, colour = single ? ON : OFF;
  const lineY = (i: number) => tip(i)[1], sideX = isMux ? 28 : W - 28;
  return (
    <AnimCard title="A multiplexer is a rotary switch" hint="The select lines choose one path. Flip them and watch the switch move, then change what's on the inputs.">
      <div className="flex flex-wrap items-center gap-1.5">
        {(["mux", "demux", "decoder"] as const).map((m) => <button key={m} type="button" className={chip(mode === m)} aria-pressed={mode === m} onClick={() => setMode(m)}>{m === "mux" ? "4:1 MUX" : m === "demux" ? "1:4 DEMUX" : "2:4 decoder"}</button>)}
      </div>
      <svg viewBox={`0 0 ${W} 260`} className="w-full max-w-[460px] mx-auto h-auto" role="img" aria-label={`Path ${sel} selected, carrying ${single}`}>
        {[0, 1, 2, 3].map((i) => {
          const [x, y] = tip(i), on = i === sel, v = on ? single : isMux ? data[i] : 0;
          return (
            <g key={i}>
              <line x1={sideX} y1={lineY(i)} x2={x} y2={y} stroke={isMux ? (v ? ON : OFF) : on ? colour : OFF} strokeWidth={on ? 2.5 : 1.5} style={{ transition: FADE }} />
              <circle cx={x} cy={y} r={3.5} fill={isMux ? (v ? ON : OFF) : on ? colour : OFF} style={{ transition: FADE }} />
              {isMux
                ? <g role="button" tabIndex={0} aria-label={`Input ${i} is ${data[i]}. Press to flip.`} style={{ cursor: "pointer" }} onClick={() => setData(data.map((b, k) => (k === i ? b ^ 1 : b)))} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setData(data.map((b, k) => (k === i ? b ^ 1 : b))); } }}>
                    <rect x={sideX - 22} y={lineY(i) - 12} width={40} height={24} rx={5} fill={data[i] ? ON : "#1c1e27"} stroke={data[i] ? ON : LINE} style={{ transition: FADE }} />
                    <text x={sideX - 2} y={lineY(i) + 4} textAnchor="middle" fontSize={12} fontWeight={700} fill={data[i] ? "#04170d" : INK}>d{i}={data[i]}</text>
                  </g>
                : <g>
                    <circle cx={sideX} cy={lineY(i)} r={12} fill={on && single ? ON : "#1c1e27"} stroke={on && single ? ON : LINE} style={{ transition: FADE }} />
                    <text x={sideX} y={lineY(i) + 4} textAnchor="middle" fontSize={11} fontWeight={700} fill={on && single ? "#04170d" : INK}>y{i}</text>
                  </g>}
            </g>
          );
        })}
        <line x1={px} y1={CY} x2={px + dir * R} y2={CY} stroke={colour} strokeWidth={3.5} strokeLinecap="round"
              style={{ transform: `rotate(${(isMux ? -1 : 1) * ANGLES[sel]}deg)`, transformOrigin: `${px}px ${CY}px`, transition: `${MOVE}, ${FADE}` }} />
        <circle cx={px} cy={CY} r={6} fill={colour} style={{ transition: FADE }} />
        <line x1={px} y1={CY} x2={isMux ? W - 56 : 56} y2={CY} stroke={colour} strokeWidth={2.5} style={{ transition: FADE }} />
        {isMux
          ? <g><circle cx={W - 38} cy={CY} r={17} fill={single ? ON : "#1c1e27"} stroke={single ? ON : LINE} style={{ transition: FADE }} /><text x={W - 38} y={CY + 5} textAnchor="middle" fontSize={13} fontWeight={700} fill={single ? "#04170d" : INK}>y={single}</text></g>
          : <text x={38} y={CY + 5} textAnchor="middle" fontSize={12} fontWeight={700} fill={single ? ON : INK}>{mode === "demux" ? `d=${d}` : "on"}</text>}
      </svg>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={chip(sel >= 2)} aria-pressed={sel >= 2} onClick={() => setSel(sel ^ 2)}>s1 = {sel >> 1}</button>
        <button type="button" className={chip(sel % 2 === 1)} aria-pressed={sel % 2 === 1} onClick={() => setSel(sel ^ 1)}>s0 = {sel & 1}</button>
        {mode === "demux" && <button type="button" className={chip(d === 1)} aria-pressed={d === 1} onClick={() => setD(d ^ 1)}>d = {d}</button>}
      </div>
      <Caption>
        {isMux ? `s1 s0 = ${bin(sel, 2)} is ${sel}, so the output follows input ${sel}, which is ${data[sel]}. The other inputs are ignored. Click any input to change it.`
          : mode === "demux" ? `The one input goes to output ${sel}, and the others stay 0. A DEMUX is a MUX run backwards.`
          : `With the input tied on, the selected output goes high and only that one. That's a decoder: a DEMUX whose data input is always 1.`}
      </Caption>
    </AnimCard>
  );
}

// ── Chapter 12: ripple against lookahead ──────────────────────────────────────
function RaceRow({ title, n, t, time }: { title: string; n: number; t: number; time: (i: number) => number }) {
  const done = Array.from({ length: n }, (_, i) => time(i + 1) <= t).filter(Boolean).length;
  return (
    <div>
      <div className="flex justify-between gap-2 text-[13px]"><span className="font-semibold text-pale">{title}</span><span className="tabular-nums text-ghost">{done} of {n} carries ready</span></div>
      <div className="flex flex-wrap gap-0.5 mt-1">
        {Array.from({ length: n }, (_, i) => <span key={i} className="block w-3.5 h-5 rounded-sm transition-colors duration-150" style={{ background: time(i + 1) <= t ? ON : "#1c1e27" }} />)}
      </div>
    </div>
  );
}

export function AdderRace() {
  const [n, setN] = useState(16);
  const end = rippleCarryTime(n), s = useSteps(end + 1, n, Math.max(90, Math.min(400, 6000 / end))), t = s.step;
  const cla = claCarryTime(n, n), worst = Math.max(...Array.from({ length: n }, (_, i) => claCarryTime(i + 1, n)));
  return (
    <AnimCard title="The carry race" hint="Each block is one carry, least significant on the left. Press Play and count gate delays.">
      <div className="flex flex-wrap gap-1.5">{[4, 8, 16, 32].map((x) => <button key={x} type="button" className={chip(n === x)} aria-pressed={n === x} onClick={() => setN(x)}>{x} bits</button>)}</div>
      <RaceRow title="Ripple carry" n={n} t={t} time={rippleCarryTime} />
      <RaceRow title="Carry lookahead" n={n} t={t} time={(i) => claCarryTime(i, n)} />
      <Controls s={s} />
      <Caption>
        t = {t} gate delays. Ripple's last carry arrives at {end}. Lookahead's slowest arrives at {worst}{t >= worst && t < end ? ", so it's finished while ripple is still going" : ""}.
        {" "}{n > 4 ? `The carry out, at a group boundary, is ready at ${cla}.` : ""}
      </Caption>
    </AnimCard>
  );
}

// ── Chapter 12: multiplying ───────────────────────────────────────────────────
export function ShiftAdd() {
  const [a, setA] = useState(13);
  const [b, setB] = useState(5);
  const w = 4, A = a % 16, B = b % 16, steps = shiftAddSteps(A, B, w), s = useSteps(w + 1, `${A},${B}`, 1200);
  const done = steps.slice(0, s.step), now = done[done.length - 1];
  return (
    <AnimCard title="Shift and add" hint="Look at the multiplier one bit at a time. A 1 adds a shifted copy of the top number, and a 0 adds nothing.">
      <div className="flex flex-wrap gap-3 text-[14px] text-ghost">
        <label className="flex items-center gap-1.5">A <input type="number" className={field} min={0} max={15} value={A} onChange={(e) => setA(Math.max(0, Math.floor(+e.target.value) || 0))} /></label>
        <label className="flex items-center gap-1.5">B <input type="number" className={field} min={0} max={15} value={B} onChange={(e) => setB(Math.max(0, Math.floor(+e.target.value) || 0))} /></label>
      </div>
      <div className="flex gap-1 items-center"><span className="text-[12px] text-dim mr-1">B</span>
        {[3, 2, 1, 0].map((bit) => <span key={bit} className={`w-8 h-9 rounded border flex items-center justify-center font-mono text-[16px] transition-[background-color,border-color,color] duration-200 ease-out ${now?.bit === bit ? "border-info bg-info/20 text-bright" : bit < s.step ? "border-rim text-pale" : "border-rim/40 text-dim"}`}>{(B >> bit) & 1}</span>)}
      </div>
      <div className="font-mono text-[15px] text-right w-fit min-h-[8em] space-y-0.5">
        {done.map((d) => <div key={d.bit} className={`anim-in ${d.on ? "text-pale" : "text-dim"}`}>{d.on ? bin(d.partial, 8) : "00000000"}</div>)}
        {s.step === w && <div className="anim-in border-t border-rim/60 pt-0.5 text-phosphor font-bold">{bin(A * B, 8)}</div>}
      </div>
      <Controls s={s} />
      <Caption>
        {!now ? `${A} × ${B}, as 4-bit numbers. The product can need up to 8 bits.`
          : s.step === w ? `The sum of the rows is ${bin(A * B, 8)}, which is ${A * B}.`
          : now.on ? `Bit ${now.bit} of B is 1: add A shifted left by ${now.bit}. The running total is ${now.total}.`
          : `Bit ${now.bit} of B is 0: add nothing. The running total stays ${now.total}.`}
      </Caption>
    </AnimCard>
  );
}

export function Booth() {
  const [m, setM] = useState(5);
  const [q, setQ] = useState(-3);
  const w = 4, M = Math.max(-8, Math.min(7, m)), Q = Math.max(-8, Math.min(7, q));
  const { rows, product } = boothSteps(M, Q, w), s = useSteps(w + 1, `${M},${Q}`, 1500);
  const now = rows[s.step - 1];
  const ops = rows.filter((r) => r.op !== "none").length;
  const range = (set: (n: number) => void, v: number, label: string) => <label className="flex items-center gap-1.5">{label} <input type="number" className={field} min={-8} max={7} value={v} onChange={(e) => set(Math.floor(+e.target.value) || 0)} /></label>;
  const OP = { add: "A + M", sub: "A − M", none: "nothing" };
  return (
    <AnimCard title="Booth's algorithm" hint="It multiplies signed numbers by looking at each pair of neighbouring multiplier bits. A run of 1s costs just one subtract and one add.">
      <div className="flex flex-wrap gap-3 text-[14px] text-ghost">{range(setM, M, "M (−8 to 7)")}{range(setQ, Q, "Q (−8 to 7)")}</div>
      <div className="overflow-x-auto">
        <table className="font-mono text-[14px] text-center">
          <thead className="text-dim text-[12px] font-sans"><tr><th className="px-2 font-normal text-left">Step</th><th className="px-2 font-normal">Q₀ Q₋₁</th><th className="px-2 font-normal">Do</th><th className="px-2 font-normal">A</th><th className="px-2 font-normal">Q</th><th className="px-2 font-normal">Q₋₁</th></tr></thead>
          <tbody>
            <tr className="text-ghost"><td className="px-2 text-left font-sans text-[13px]">Start</td><td /><td /><td className="px-2">{bin(0, w)}</td><td className="px-2">{bin(Q & 15, w)}</td><td className="px-2">0</td></tr>
            {rows.slice(0, s.step).map((r, i) => (
              <tr key={i} className={`anim-in ${i === s.step - 1 ? "text-bright bg-info/10" : "text-pale"}`}>
                <td className="px-2 text-left font-sans text-[13px]">{i + 1}</td>
                <td className="px-2">{r.pair[0]} {r.pair[1]}</td><td className={`px-2 whitespace-nowrap ${r.op === "none" ? "text-dim" : "text-warn"}`}>{OP[r.op]}</td>
                <td className="px-2">{bin(r.a, w)}</td><td className="px-2">{bin(r.q, w)}</td><td className="px-2">{r.q1}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Controls s={s} />
      <Caption>
        {!now ? `M = ${M} (${bin(M & 15, w)}), Q = ${Q} (${bin(Q & 15, w)}). A starts at 0.`
          : s.step === w ? <>Done. A and Q together are {bin(rows[w - 1].a, w)} {bin(rows[w - 1].q, w)}, which is <strong className="text-phosphor">{product}</strong>, and {M} × {Q} = {M * Q}. That took {ops} add or subtract {ops === 1 ? "operation" : "operations"} in {w} steps.</>
          : `Pair ${now.pair}: ${now.op === "sub" ? "a run of 1s starts, so subtract M" : now.op === "add" ? "a run of 1s ends, so add M" : "no change, so do nothing"}. Then shift A, Q and Q₋₁ right, copying the sign bit of A.`}
      </Caption>
    </AnimCard>
  );
}
