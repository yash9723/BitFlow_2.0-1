"use client";
/** components/academy/anim/hardware.tsx — chapters 4 and 5: a rotary encoder disc, and CMOS gates as switches. */

import { useEffect, useMemo, useRef, useState } from "react";
import { type CmosGate as Gate, cmosState, encoderError, encoderRead, toGray } from "@/lib/academy/anim";
import { AnimCard, BAD, BUS, Caption, FADE, INK, LINE, MOVE, OFF, ON, WARN, btn, chip } from "./Player";

// ── Encoder ───────────────────────────────────────────────────────────────────
const C = 100;
const polar = (deg: number, r: number) => { const t = (deg * Math.PI) / 180; return [C + r * Math.sin(t), C - r * Math.cos(t)]; };
function sector(i: number, inner: number, outer: number) {
  const [a, b] = [i * 45, (i + 1) * 45], [x1, y1] = polar(a, outer), [x2, y2] = polar(b, outer), [x3, y3] = polar(b, inner), [x4, y4] = polar(a, inner);
  return `M ${x1} ${y1} A ${outer} ${outer} 0 0 1 ${x2} ${y2} L ${x3} ${y3} A ${inner} ${inner} 0 0 0 ${x4} ${y4} Z`;
}
const RINGS = [[74, 94], [52, 72], [30, 50]];   // track 0 (the least significant bit) outermost

function Disc({ code, pos, skew }: { code: "binary" | "gray"; pos: number; skew: number }) {
  const read = encoderRead(pos, code, skew), err = encoderError(pos, code, skew), bad = err > 1;
  const wrong = useMemo(() => {
    let n = 0;
    for (let i = 0; i < 800; i++) if (encoderError(i / 100, code, skew) > 1) n++;
    return Math.round(n / 8);
  }, [code, skew]);
  return (
    <div className="min-w-0 text-center">
      <div className="text-[14px] font-semibold text-pale">{code === "gray" ? "Gray code" : "Plain binary"}</div>
      <svg viewBox="0 0 200 200" className="w-full max-w-[220px] h-auto mx-auto" role="img" aria-label={`${code} disc reading ${read}`}>
        <g style={{ transform: `rotate(${-pos * 45}deg)`, transformOrigin: `${C}px ${C}px` }}>
          {Array.from({ length: 8 }, (_, i) => RINGS.map(([inner, outer], track) => (
            <path key={`${i}-${track}`} d={sector(i, inner, outer)} stroke="#111218" strokeWidth={1}
                  fill={((code === "gray" ? toGray(i) : i) >> track) & 1 ? BUS : "#1c1e27"} />
          )))}
        </g>
        {RINGS.map(([inner, outer], track) => {
          const [x, y] = polar((track - 1) * skew * 45, (inner + outer) / 2);
          return <circle key={track} cx={x} cy={y} r={4} fill={WARN} stroke="#111218" />;
        })}
      </svg>
      <div className="text-[14px] tabular-nums" role="status">
        <span className="text-ghost">Sector {Math.floor(pos)}, reads </span>
        <strong style={{ color: bad ? BAD : ON, transition: FADE }}>{read}</strong>
      </div>
      <div className={`text-[12px] tabular-nums ${wrong ? "text-danger" : "text-phosphor"}`}>Badly wrong for {wrong}% of a turn</div>
    </div>
  );
}

export function EncoderDisc() {
  const [pos, setPos] = useState(2.5);
  const [skew, setSkew] = useState(0.12);
  const [playing, setPlaying] = useState(false);
  const raf = useRef(0);
  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    const tick = (now: number) => {
      const turned = ((now - last) / 1000) * 0.5;
      last = now;
      setPos((p) => (p + turned) % 8);
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [playing]);
  return (
    <AnimCard title="Why position sensors use Gray code" hint="Three sensors (amber dots) read three tracks. No real sensors line up perfectly, so turn the disc slowly across a boundary and watch the readings.">
      <div className="grid grid-cols-2 gap-3"><Disc code="binary" pos={pos} skew={skew} /><Disc code="gray" pos={pos} skew={skew} /></div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-ghost">
        <button type="button" className={btn} onClick={() => setPlaying(!playing)}>{playing ? "Pause" : "Spin"}</button>
        <label className="flex items-center gap-2">Turn <input type="range" min={0} max={7.99} step={0.01} value={pos} onChange={(e) => { setPlaying(false); setPos(+e.target.value); }} className="accent-[#00e87a] w-36" /></label>
        <label className="flex items-center gap-2">Misalignment <input type="range" min={0} max={0.4} step={0.02} value={skew} onChange={(e) => setSkew(+e.target.value)} className="accent-[#00e87a] w-28" /></label>
      </div>
      <Caption>Going from 3 to 4 in binary, all three bits flip. If the sensors don&apos;t flip at the same instant, the reading can jump anywhere for a moment. In Gray code only one bit flips per sector, so a reading is never more than one sector off.</Caption>
    </AnimCard>
  );
}

// ── CMOS gate as switches ─────────────────────────────────────────────────────
/** A transistor drawn as a switch whose blade swings closed when it conducts. */
function Fet({ x, y, on, label, pmos, colour }: { x: number; y: number; on: boolean; label: string; pmos: boolean; colour: string }) {
  const top = y - 18, bottom = y + 18;
  return (
    <g>
      <circle cx={x} cy={top} r={3} fill={colour} style={{ transition: FADE }} />
      <circle cx={x} cy={bottom} r={3} fill={colour} style={{ transition: FADE }} />
      <line x1={x} y1={bottom} x2={x} y2={top} stroke={on ? colour : LINE} strokeWidth={2.5}
            style={{ transform: `rotate(${on ? 0 : 32}deg)`, transformOrigin: `${x}px ${bottom}px`, transition: `${MOVE}, ${FADE}` }} />
      <text x={x - 14} y={y + 4} textAnchor="end" fontSize={12} fill={on ? INK : LINE} style={{ transition: FADE }}>{label}</text>
      <text x={x + 12} y={y + 4} fontSize={9} fill={LINE}>{pmos ? "on at 0" : "on at 1"}</text>
    </g>
  );
}

type Shape = "single" | "series" | "parallel";
/** One network between two rails. Parts light up only if they connect the rail through. */
function Net({ shape, y0, y1, a, b, pmos, colour }: { shape: Shape; y0: number; y1: number; a: boolean; b: boolean; pmos: boolean; colour: string }) {
  const mid = (y0 + y1) / 2, X = 170, wire = (d: string, lit: boolean) => <path d={d} fill="none" stroke={lit ? colour : OFF} strokeWidth={2} style={{ transition: FADE }} />;
  if (shape === "single") return <>
    {wire(`M ${X} ${y0} V ${mid - 18}`, a)}{wire(`M ${X} ${mid + 18} V ${y1}`, a)}
    <Fet x={X} y={mid} on={a} label="a" pmos={pmos} colour={a ? colour : OFF} />
  </>;
  if (shape === "series") { const lit = a && b, q = (y1 - y0) / 4; return <>
    {wire(`M ${X} ${y0} V ${y0 + q - 18}`, lit)}{wire(`M ${X} ${y0 + q + 18} V ${y0 + 3 * q - 18}`, lit)}{wire(`M ${X} ${y0 + 3 * q + 18} V ${y1}`, lit)}
    <Fet x={X} y={y0 + q} on={a} label="a" pmos={pmos} colour={lit ? colour : OFF} />
    <Fet x={X} y={y0 + 3 * q} on={b} label="b" pmos={pmos} colour={lit ? colour : OFF} />
  </>; }
  const L = X - 42, R = X + 42, lit = a || b;
  return <>
    {wire(`M ${X} ${y0} V ${y0 + 10}`, lit)}{wire(`M ${X} ${y1 - 10} V ${y1}`, lit)}
    {wire(`M ${X} ${y0 + 10} H ${L} V ${mid - 18}`, a)}{wire(`M ${L} ${mid + 18} V ${y1 - 10} H ${X}`, a)}
    {wire(`M ${X} ${y0 + 10} H ${R} V ${mid - 18}`, b)}{wire(`M ${R} ${mid + 18} V ${y1 - 10} H ${X}`, b)}
    <Fet x={L} y={mid} on={a} label="a" pmos={pmos} colour={a ? colour : OFF} />
    <Fet x={R} y={mid} on={b} label="b" pmos={pmos} colour={b ? colour : OFF} />
  </>;
}

const SHAPES: Record<Gate, [Shape, Shape]> = { not: ["single", "single"], nand: ["parallel", "series"], nor: ["series", "parallel"] };

export function CmosGate() {
  const [gate, setGate] = useState<Gate>("nand");
  const [a, setA] = useState(1);
  const [b, setB] = useState(0);
  const st = cmosState(gate, a, b), [upShape, downShape] = SHAPES[gate];
  const rows = gate === "not" ? [[0, 0], [1, 0]] : [[0, 0], [0, 1], [1, 0], [1, 1]];
  return (
    <AnimCard title="Inside a gate: transistors as switches" hint="Flip the inputs. The top network connects the output to the supply (1); the bottom one connects it to ground (0).">
      <div className="flex flex-wrap items-center gap-2">
        {(["not", "nand", "nor"] as Gate[]).map((g) => <button key={g} type="button" className={chip(gate === g)} aria-pressed={gate === g} onClick={() => setGate(g)}>{g.toUpperCase()}</button>)}
        <span className="w-2" />
        <button type="button" className={chip(a === 1)} aria-pressed={a === 1} onClick={() => setA(a ^ 1)}>a = {a}</button>
        {gate !== "not" && <button type="button" className={chip(b === 1)} aria-pressed={b === 1} onClick={() => setB(b ^ 1)}>b = {b}</button>}
      </div>
      <div className="grid sm:grid-cols-[minmax(0,340px)_1fr] gap-4 items-center">
        <svg viewBox="0 0 340 300" className="w-full h-auto" role="img" aria-label={`${gate.toUpperCase()} gate: output ${st.y}`}>
          <line x1={90} y1={14} x2={250} y2={14} stroke={ON} strokeWidth={3} />
          <text x={258} y={18} fontSize={12} fill={ON}>supply (1)</text>
          <line x1={90} y1={286} x2={250} y2={286} stroke={LINE} strokeWidth={3} />
          <text x={258} y={290} fontSize={12} fill={LINE}>ground (0)</text>
          <Net shape={upShape} y0={14} y1={150} a={st.pa} b={st.pb} pmos colour={ON} />
          <Net shape={downShape} y0={150} y1={286} a={st.na} b={st.nb} pmos={false} colour={BUS} />
          <line x1={170} y1={150} x2={280} y2={150} stroke={st.y ? ON : BUS} strokeWidth={2.5} style={{ transition: FADE }} />
          <circle cx={170} cy={150} r={4} fill={st.y ? ON : BUS} style={{ transition: FADE }} />
          <circle cx={298} cy={150} r={17} fill={st.y ? ON : "#1c1e27"} stroke={st.y ? ON : LINE} style={{ transition: FADE }} />
          <text x={298} y={155} textAnchor="middle" fontSize={15} fontWeight={700} fill={st.y ? "#04170d" : INK}>{st.y}</text>
        </svg>
        <div className="space-y-3 min-w-0">
          <table className="text-[14px] tabular-nums text-center">
            <thead className="text-dim"><tr><th className="px-2 font-normal">a</th>{gate !== "not" && <th className="px-2 font-normal">b</th>}<th className="px-2 font-normal">y</th></tr></thead>
            <tbody>
              {rows.map(([x, y]) => {
                const here = x === a && (gate === "not" || y === b);
                return (
                  <tr key={`${x}${y}`} className={here ? "bg-phosphor/15 text-phosphor font-semibold" : "text-ghost"} style={{ transition: "background-color 240ms cubic-bezier(0.23, 1, 0.32, 1)" }}>
                    <td className="px-2">{x}</td>{gate !== "not" && <td className="px-2">{y}</td>}<td className="px-2">{cmosState(gate, x, y).y}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <Caption>
            {st.up ? "The top network conducts, so the output connects to the supply and reads 1. The bottom network is open."
              : "The bottom network conducts, so the output connects to ground and reads 0. The top network is open."}
            {" "}One network is always on and the other off, so the supply is never shorted to ground.
          </Caption>
        </div>
      </div>
    </AnimCard>
  );
}
