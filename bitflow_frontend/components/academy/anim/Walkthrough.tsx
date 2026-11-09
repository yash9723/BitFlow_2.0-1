"use client";
/**
 * components/academy/anim/Walkthrough.tsx — Verilog, stepped one event at a time. Every step keeps three views in step:
 * the source with the lines that run highlighted, a picture of what the hardware does, and the signals as a table and a
 * waveform that draws itself up to the current step. The steps and values come from lib/academy/walkthrough.ts.
 * Built on the same kit as the other animations (Player.tsx), so Play/Back/Next, the narration line, reduced motion
 * and the look are shared. Arrow keys also step.
 */

import { type ReactNode, useMemo } from "react";
import CircuitViewer from "@/components/studio/CircuitViewer";
import { type CircuitWalk, FSM_INPUT, FSM_STATES, type Walk, type WalkId, WALKS, X, formatValue } from "@/lib/academy/walkthrough";
import { AnimCard, BAD, BUS, Caption, Controls, FADE, INK, LINE, OFF, ON, WARN, useSteps } from "./Player";

const WAVE_W = 560, ROW = 26, LABEL_W = 56;

function CodePane({ code, lines }: { code: string[]; lines: number[] }) {
  return (
    <pre className="no-ligatures min-w-0 overflow-x-auto rounded-lg border border-rim/60 bg-void p-2 font-mono text-[12.5px] leading-6" aria-label="Verilog source">
      {code.map((l, i) => (
        <span key={i} className={`block rounded px-1.5 whitespace-pre transition-colors duration-200 ${lines.includes(i) ? "bg-info/20 text-bright" : "text-ghost"}`}>{l || " "}</span>
      ))}
    </pre>
  );
}

function SignalTable({ walk, step }: { walk: Walk; step: number }) {
  const cur = walk.steps[step].values, prev = step ? walk.steps[step - 1].values : null;
  return (
    <div className="flex flex-wrap gap-2 font-mono text-[13px]" aria-label="Signal values">
      {walk.signals.map((s) => {
        const changed = prev !== null && prev[s.name] !== cur[s.name];
        return (
          <span key={s.name} className={`rounded border px-2 py-1 ${s.dir === "in" ? "border-rim/60 text-pale" : "border-phosphor/40 text-pale"}`}>
            {s.name} = <strong key={cur[s.name]} className={`${changed ? "anim-in" : ""} inline-block ${cur[s.name] === X ? "text-warn" : "text-phosphor"}`}>{formatValue(s, cur[s.name])}</strong>
          </span>
        );
      })}
    </div>
  );
}

/** The signals so far, one row each, drawn up to and including the current step. */
function WavePane({ walk, step }: { walk: Walk; step: number }) {
  const n = walk.steps.length, cw = (WAVE_W - LABEL_W) / n, h = walk.signals.length * ROW + 6;
  const x0 = LABEL_W, xs = (i: number) => x0 + i * cw;
  return (
    <svg viewBox={`0 0 ${WAVE_W} ${h}`} className="w-full h-auto block" role="img" aria-label="Waveform of the signals up to the current step">
      {walk.signals.map((s, r) => {
        const top = r * ROW + 5, bot = top + ROW - 10, mid = (top + bot) / 2;
        const vals = walk.steps.slice(0, step + 1).map((st) => st.values[s.name]);
        const label = <text x={2} y={mid + 4} fontSize={11} fill={INK} fontFamily="monospace">{s.name}</text>;
        if (s.bits === 1) {
          let d = "";
          vals.forEach((v, i) => {
            if (v === X) return;
            const y = v ? top : bot, prev = i ? vals[i - 1] : null;
            d += prev === null || prev === X ? `M${xs(i)} ${y}` : prev !== v ? ` L${xs(i)} ${y}` : "";
            d += ` L${xs(i + 1)} ${y}`;
          });
          return (
            <g key={s.name}>{label}
              <line x1={x0} x2={WAVE_W} y1={bot} y2={bot} stroke={OFF} strokeWidth={0.5} opacity={0.5} />
              {vals.map((v, i) => v === X && <line key={i} x1={xs(i)} x2={xs(i + 1)} y1={mid} y2={mid} stroke={WARN} strokeWidth={2} strokeDasharray="3 3" />)}
              <path d={d} fill="none" stroke={s.dir === "in" ? BUS : ON} strokeWidth={2} strokeLinejoin="round" />
            </g>
          );
        }
        return (
          <g key={s.name}>{label}
            {vals.map((v, i) => (
              <g key={i}>
                <rect x={xs(i) + 1} y={top} width={cw - 2} height={bot - top} rx={3} fill="none" stroke={v === X ? WARN : BUS} strokeWidth={1.5} strokeDasharray={v === X ? "3 3" : undefined} />
                {cw >= 20 && <text x={xs(i) + cw / 2} y={mid + 4} fontSize={cw >= 30 ? 11 : 9} textAnchor="middle" fill={v === X ? WARN : INK} fontFamily="monospace">{s.names ? formatValue(s, v) : v === X ? "x" : v}</text>}
              </g>
            ))}
          </g>
        );
      })}
      <line x1={xs(step + 1) - 0.5} x2={xs(step + 1) - 0.5} y1={0} y2={h} stroke={WARN} strokeWidth={1} strokeDasharray="2 3" />
    </svg>
  );
}

// ── Pictures ──────────────────────────────────────────────────────────────────
const wire = (on: boolean) => ({ stroke: on ? ON : OFF, strokeWidth: 2.5, fill: "none" as const, style: { transition: FADE } });
const txt = { fontFamily: "monospace", fontSize: 12, fill: INK } as const;

function MuxPicture({ v }: { v: Record<string, number> }) {
  const aOn = v.sel === 0, y = v.y;
  return (
    <svg viewBox="0 0 280 150" className="w-full h-auto block" role="img" aria-label={`Multiplexer: sel is ${v.sel}, so y follows ${v.sel ? "b" : "a"}`}>
      <text x={4} y={34} {...txt}>a = {v.a}</text><text x={4} y={94} {...txt}>b = {v.b}</text>
      <path d="M60 30 H110 V52 H130" {...wire(aOn && v.a === 1)} opacity={aOn ? 1 : 0.35} />
      <path d="M60 90 H110 V78 H130" {...wire(!aOn && v.b === 1)} opacity={aOn ? 0.35 : 1} />
      <path d="M130 40 L190 55 V85 L130 100 Z" fill="none" stroke={LINE} strokeWidth={2} />
      <text x={150} y={74} {...txt} fontSize={11}>MUX</text>
      <path d="M160 142 V94" {...wire(v.sel === 1)} />
      <text x={110} y={146} {...txt}>sel = {v.sel}</text>
      <path d="M190 70 H250" {...wire(y === 1)} />
      <rect x={228} y={58} width={44} height={24} rx={4} fill="none" stroke={y === 1 ? ON : OFF} strokeWidth={2} />
      <text x={250} y={74} textAnchor="middle" {...txt} fill={y === 1 ? ON : INK}>y = {y}</text>
      <text x={150} y={20} {...txt} fill={ON} textAnchor="middle">{aOn ? "a is selected" : "b is selected"}</text>
    </svg>
  );
}

function RegisterPicture({ v, edge }: { v: Record<string, number>; edge: boolean }) {
  const q = v.q;
  return (
    <svg viewBox="0 0 280 150" className="w-full h-auto block" role="img" aria-label={`Flip-flop: d is ${v.d}, q is ${q === X ? "unknown" : q}`}>
      <text x={4} y={44} {...txt}>d = {v.d}</text>
      <path d="M52 40 H100" {...wire(v.d === 1)} />
      <rect x={100} y={20} width={80} height={90} rx={6} fill={edge ? "rgba(0,232,122,.12)" : "none"} stroke={edge ? ON : LINE} strokeWidth={2} style={{ transition: FADE }} />
      <text x={110} y={44} {...txt}>D</text><text x={160} y={44} {...txt}>Q</text>
      <path d="M100 92 l12 -8 v16 z" fill={edge ? ON : OFF} style={{ transition: FADE }} />
      <text x={118} y={96} {...txt} fontSize={11}>clk</text>
      <path d="M180 40 H228" {...wire(q === 1)} />
      <rect x={228} y={28} width={46} height={24} rx={4} fill="none" stroke={q === X ? WARN : q === 1 ? ON : OFF} strokeWidth={2} />
      <text x={251} y={44} textAnchor="middle" {...txt} fill={q === X ? WARN : q === 1 ? ON : INK}>q = {q === X ? "x" : q}</text>
      <path d="M60 118 H100 V108" {...wire(v.clk === 1)} />
      <text x={4} y={122} {...txt}>clk = {v.clk}</text>
      <text x={140} y={140} {...txt} textAnchor="middle" fill={edge ? ON : INK}>{edge ? "rising edge: q takes d" : "no edge: q holds"}</text>
      {v.rst === 1 && <text x={140} y={14} {...txt} textAnchor="middle" fill={BAD}>rst = 1</text>}
    </svg>
  );
}

function CounterPicture({ v }: { v: Record<string, number> }) {
  const n = v.count;
  return (
    <svg viewBox="0 0 280 150" className="w-full h-auto block" role="img" aria-label={`Counter value ${n === X ? "unknown" : n}`}>
      {[3, 2, 1, 0].map((b, k) => {
        const on = n !== X && ((n >> b) & 1) === 1;
        return (
          <g key={b}>
            <rect x={20 + k * 62} y={20} width={52} height={52} rx={8} fill={on ? "rgba(0,232,122,.18)" : "none"} stroke={n === X ? WARN : on ? ON : OFF} strokeWidth={2} strokeDasharray={n === X ? "4 3" : undefined} style={{ transition: FADE }} />
            <text x={46 + k * 62} y={54} textAnchor="middle" fontFamily="monospace" fontSize={22} fill={n === X ? WARN : on ? ON : INK}>{n === X ? "x" : on ? 1 : 0}</text>
            <text x={46 + k * 62} y={86} textAnchor="middle" {...txt} fontSize={11}>bit {b}</text>
          </g>
        );
      })}
      <text x={140} y={130} textAnchor="middle" fontFamily="monospace" fontSize={22} fill={n === X ? WARN : INK}>count = {n === X ? "x" : n}</text>
      {n === 15 && <text x={140} y={108} textAnchor="middle" {...txt} fill={WARN}>next edge wraps to 0</text>}
    </svg>
  );
}

const STATE_POS = [{ x: 50, y: 70 }, { x: 140, y: 70 }, { x: 230, y: 70 }];
function FsmPicture({ v, step }: { v: Record<string, number>; step: number }) {
  const active = v.state;
  const arrows: [number, number, string][] = [[0, 1, "x=1"], [1, 2, "x=0"]];
  return (
    <svg viewBox="0 0 280 150" className="w-full h-auto block" role="img" aria-label={`State machine in ${FSM_STATES[active] ?? "no state"}, z is ${v.z}`}>
      {arrows.map(([a, b, l]) => (
        <g key={l}><path d={`M${STATE_POS[a].x + 22} ${STATE_POS[a].y} H${STATE_POS[b].x - 24}`} stroke={LINE} strokeWidth={1.5} fill="none" markerEnd="url(#arr)" />
          <text x={(STATE_POS[a].x + STATE_POS[b].x) / 2} y={STATE_POS[a].y - 6} textAnchor="middle" {...txt} fontSize={10}>{l}</text></g>
      ))}
      <path d="M208 84 Q140 118 72 84" stroke={LINE} strokeWidth={1.5} fill="none" markerEnd="url(#arr)" /><text x={140} y={108} textAnchor="middle" {...txt} fontSize={10}>S2 to S0: x=0</text>
      <defs><marker id="arr" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 L8 4 L0 8 z" fill={LINE} /></marker></defs>
      {STATE_POS.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r={22} fill={active === i ? "rgba(0,232,122,.18)" : "none"} stroke={active === i ? ON : OFF} strokeWidth={2.5} style={{ transition: FADE }} />
          <text x={p.x} y={p.y + 5} textAnchor="middle" fontFamily="monospace" fontSize={14} fill={active === i ? ON : INK}>S{i}</text>
        </g>
      ))}
      <g>{FSM_INPUT.map((b, i) => {
        const now = step - 1 === i;
        return <g key={i}><rect x={22 + i * 28} y={128} width={24} height={18} rx={3} fill={now ? "rgba(90,169,230,.25)" : "none"} stroke={now ? BUS : OFF} /><text x={34 + i * 28} y={141} textAnchor="middle" {...txt} fill={now ? BUS : INK}>{b}</text></g>;
      })}</g>
      <circle cx={262} cy={20} r={8} fill={v.z === 1 ? ON : "none"} stroke={v.z === 1 ? ON : OFF} strokeWidth={2} style={{ transition: FADE }} /><text x={246} y={24} textAnchor="end" {...txt}>z = {v.z}</text>
    </svg>
  );
}

// ── The shared frame ──────────────────────────────────────────────────────────
function Frame({ walk, picture, ms = 1700, aside, stack = false }: { walk: Walk; picture: (step: number) => ReactNode; ms?: number; aside?: ReactNode; stack?: boolean }) {
  const s = useSteps(walk.steps.length, walk, ms);
  const st = walk.steps[s.step];
  return (
    <AnimCard title={walk.title} hint={walk.hint}>
      <div
        tabIndex={0} role="group" aria-label={`${walk.title}: use the left and right arrow keys to step`}
        className="space-y-3 outline-none focus-visible:ring-1 focus-visible:ring-phosphor/50 rounded"
        onKeyDown={(e) => { if (e.key === "ArrowRight") { e.preventDefault(); s.set(s.step + 1); } if (e.key === "ArrowLeft") { e.preventDefault(); s.set(s.step - 1); } }}
      >
        <div className={`grid gap-3 items-start ${stack ? "" : "md:grid-cols-2"}`}>
          <CodePane code={walk.code} lines={st.lines} />
          <div className="min-w-0 space-y-2">{picture(s.step)}{aside}</div>
        </div>
        <SignalTable walk={walk} step={s.step} />
        <WavePane walk={walk} step={s.step} />
        <Controls s={s} />
        <Caption>{st.caption}</Caption>
      </div>
    </AnimCard>
  );
}

const useWalk = (id: WalkId) => useMemo(() => WALKS[id](), [id]);

export function WalkMuxAlways() {
  const w = useWalk("walk-mux-always");
  return <Frame walk={w} picture={(i) => <MuxPicture v={w.steps[i].values} />} />;
}
export function WalkRegister() {
  const w = useWalk("walk-register");
  return <Frame walk={w} picture={(i) => <RegisterPicture v={w.steps[i].values} edge={w.steps[i].lines.length > 0} />} />;
}
export function WalkCounter() {
  const w = useWalk("walk-counter");
  return <Frame walk={w} ms={900} picture={(i) => <CounterPicture v={w.steps[i].values} />} />;
}
export function WalkFsm101() {
  const w = useWalk("walk-fsm-101");
  return <Frame walk={w} picture={(i) => <FsmPicture v={w.steps[i].values} step={i} />} />;
}
export function WalkAssignGates() {
  const w = useMemo(() => WALKS["walk-assign-gates"]() as CircuitWalk, []);
  return <Frame walk={w} stack picture={(i) => <CircuitViewer circuit={w.circuit} forced={w.forced[i]} />} />;
}
