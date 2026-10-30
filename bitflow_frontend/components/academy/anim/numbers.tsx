"use client";
/** components/academy/anim/numbers.tsx — chapters 2 and 3: place values, division, column addition, the number wheel. */

import { useState } from "react";
import { addColumns, asSigned, divideSteps, wheelMove } from "@/lib/academy/anim";
import { AnimCard, BAD, BUS, Caption, Controls, INK, LINE, MOVE, OFF, ON, WARN, btn, chip, useSteps } from "./Player";

const TARGETS = [45, 13, 200, 127, 255, 64];
const field = "w-20 px-2 py-1 rounded border border-rim/60 bg-void text-[14px] text-bright tabular-nums";

export function PlaceValue() {
  const [value, setValue] = useState(0);
  const [t, setT] = useState(0);
  const weights = [128, 64, 32, 16, 8, 4, 2, 1], used = weights.filter((w) => value & w), target = TARGETS[t];
  return (
    <AnimCard title="Build a number from bits" hint="Click a bit to turn it on. Its position decides what it's worth.">
      <div className="grid grid-cols-8 gap-1 sm:gap-1.5">
        {weights.map((w) => {
          const on = !!(value & w);
          return (
            <button key={w} type="button" aria-pressed={on} aria-label={`Bit worth ${w}, now ${on ? 1 : 0}`} onClick={() => setValue(value ^ w)}
                    className={`rounded-lg border py-2 transition-[transform,background-color,border-color,color] duration-200 ease-out ${on ? "border-phosphor/60 bg-phosphor/15 text-phosphor -translate-y-0.5" : "border-rim/50 text-dim hover:border-rim"}`}>
              <span className="block text-[10px] sm:text-[11px] tabular-nums opacity-80">{w}</span>
              <span className="block font-mono text-[18px] sm:text-[22px] font-bold">{on ? 1 : 0}</span>
            </button>
          );
        })}
      </div>
      <div className="text-[15px] text-pale tabular-nums break-words" role="status">
        {used.length ? used.join(" + ") : "0"} = <strong className="text-bright">{value}</strong>
        <span className="text-dim ml-3 text-[13px]">hex {value.toString(16).toUpperCase()} · octal {value.toString(8)}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[14px]">
        <span className={value === target ? "text-phosphor font-semibold" : "text-ghost"}>{value === target ? `That's ${target}!` : `Can you make ${target}?`}</span>
        <button type="button" className={btn} onClick={() => setT((t + 1) % TARGETS.length)}>Another number</button>
        <button type="button" className={btn} onClick={() => setValue(0)}>Clear</button>
      </div>
    </AnimCard>
  );
}

export function DivideByTwo() {
  const [n, setN] = useState(45);
  const steps = divideSteps(n), s = useSteps(steps.length + 1, n, 1000);
  const done = steps.slice(0, s.step), now = done[done.length - 1];
  return (
    <AnimCard title="Decimal to binary, one division at a time" hint="Pick a number and watch each remainder drop into place, from the right.">
      <label className="flex items-center gap-2 text-[14px] text-ghost">
        Number (1 to 255)
        <input type="number" className={field} min={1} max={255} value={n} onChange={(e) => setN(Math.max(1, Math.min(255, Math.floor(+e.target.value) || 1)))} />
      </label>
      <div className="grid sm:grid-cols-2 gap-4 items-start">
        <ol className="font-mono text-[14px] space-y-0.5 min-h-[9em]">
          {done.map((d) => <li key={d.n} className="anim-in text-pale">{d.n} ÷ 2 = {d.q} <span className="text-phosphor">remainder {d.r}</span></li>)}
        </ol>
        <div>
          <div className="text-[12px] text-dim mb-1">Binary</div>
          <div className="flex gap-1">
            {steps.map((_, i) => {
              const fromRight = steps.length - 1 - i, shown = fromRight < done.length;
              return <span key={i} className={`w-8 h-10 rounded border flex items-center justify-center font-mono text-[18px] font-bold ${shown ? "anim-in border-phosphor/50 text-phosphor bg-phosphor/10" : "border-rim/40 text-transparent"}`}>{shown ? steps[fromRight].r : "·"}</span>;
            })}
          </div>
        </div>
      </div>
      <Controls s={s} />
      <Caption>
        {!now ? `Keep dividing ${n} by 2, and keep each remainder.`
          : s.step === steps.length ? `The quotient reached 0, so stop. ${n} in binary is ${n.toString(2)}: the first remainder is the rightmost bit.`
          : `${now.n} is ${now.r ? "odd" : "even"}, so the remainder is ${now.r}. Carry on with ${now.q}.`}
      </Caption>
    </AnimCard>
  );
}

export function ColumnAdd() {
  const [w, setW] = useState(4);
  const [a, setA] = useState(11);
  const [b, setB] = useState(6);
  const A = a % 2 ** w, B = b % 2 ** w, cols = addColumns(A, B, w);
  const s = useSteps(w + 2, `${A},${B},${w}`, 1100);
  const col = s.step >= 1 && s.step <= w ? cols[s.step - 1] : null;
  const kept = (A + B) % 2 ** w, top = cols[w - 1];
  const cell = (i: number) => `w-7 sm:w-9 text-center ${s.step === i + 1 ? "bg-info/15 rounded" : ""}`;
  const positions = Array.from({ length: w }, (_, k) => w - 1 - k);
  const head = "pr-3 text-right font-sans font-normal text-[12px] text-dim";
  return (
    <AnimCard title="Add in binary, column by column" hint="Watch each column write a digit and pass its carry to the left.">
      <div className="flex flex-wrap items-center gap-3 text-[14px] text-ghost">
        <label className="flex items-center gap-1.5">A <input type="number" className={field} min={0} max={2 ** w - 1} value={A} onChange={(e) => setA(Math.max(0, Math.floor(+e.target.value) || 0))} /></label>
        <label className="flex items-center gap-1.5">B <input type="number" className={field} min={0} max={2 ** w - 1} value={B} onChange={(e) => setB(Math.max(0, Math.floor(+e.target.value) || 0))} /></label>
        <span className="flex gap-1.5">{[4, 8].map((x) => <button key={x} type="button" className={chip(w === x)} aria-pressed={w === x} onClick={() => setW(x)}>{x} bits</button>)}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="font-mono text-[17px] sm:text-[20px] mx-auto border-separate border-spacing-y-1">
          <tbody>
            <tr className="text-[14px] text-warn">
              <th className={head}>carry</th>
              <td className="w-7 sm:w-9 text-center">{s.step >= w && top.cout ? <span className="anim-in inline-block">1</span> : ""}</td>
              {positions.map((i) => <td key={i} className={cell(i)}>{i > 0 && s.step >= i && cols[i - 1].cout ? <span className="anim-in inline-block">1</span> : ""}</td>)}
            </tr>
            <tr className="text-pale"><th className={head}>A</th><td />{positions.map((i) => <td key={i} className={cell(i)}>{cols[i].a}</td>)}</tr>
            <tr className="text-pale"><th className={head}>B</th><td />{positions.map((i) => <td key={i} className={cell(i)}>{cols[i].b}</td>)}</tr>
            <tr className="text-phosphor font-bold">
              <th className={`${head} border-t border-rim/60`}>sum</th>
              <td className="w-7 sm:w-9 text-center border-t border-rim/60 text-warn">{s.step > w && top.cout ? <span className="anim-in inline-block">1</span> : ""}</td>
              {positions.map((i) => <td key={i} className={`${cell(i)} border-t border-rim/60`}>{s.step > i ? <span className="anim-in inline-block">{cols[i].sum}</span> : ""}</td>)}
            </tr>
          </tbody>
        </table>
      </div>
      <Controls s={s} />
      <Caption>
        {s.step === 0 ? `${A} + ${B}. Start at the rightmost column.`
          : col ? `${col.a} + ${col.b}${col.cin ? " + carry 1" : ""} = ${col.a + col.b + col.cin}, so write ${col.sum}${col.cout ? " and carry 1" : ", no carry"}.`
          : <>
              Unsigned: {A} + {B} = {A + B}{top.cout ? `, which doesn't fit in ${w} bits, so the carry out says overflow and the bits read ${kept}.` : "."}
              {" "}Signed: {asSigned(A, w)} + {asSigned(B, w)} {top.cin !== top.cout ? `overflows: the bits read ${asSigned(kept, w)}, because the carries into and out of the top bit differ.` : `= ${asSigned(kept, w)}, no overflow.`}
            </>}
      </Caption>
    </AnimCard>
  );
}

export function NumberWheel() {
  const [value, setValue] = useState(5);
  const [turn, setTurn] = useState(5);
  const [note, setNote] = useState("Press +1 until you pass 0111, and again until you pass 1111.");
  const [alert, setAlert] = useState<"none" | "overflow" | "carry">("none");
  const R = 128, C = 160, pat = (v: number) => v.toString(2).padStart(4, "0");
  const at = (i: number, r: number) => { const t = (i * Math.PI) / 8; return [C + r * Math.sin(t), C - r * Math.cos(t)]; };
  const move = (by: number) => {
    const m = wheelMove(value, by, 4), signed = asSigned(value, 4), sum = signed + by;
    setValue(m.next); setTurn(turn + by);
    setAlert(m.overflow ? "overflow" : m.carry ? "carry" : "none");
    const head = `${pat(value)} ${by > 0 ? "+" : "−"} ${Math.abs(by)} → ${pat(m.next)}.`;
    setNote(m.overflow ? `${head} Signed overflow: ${signed} ${by > 0 ? "+" : "−"} ${Math.abs(by)} should be ${sum}, but the bits read ${asSigned(m.next, 4)}.`
      : m.carry ? `${head} ${by > 0 ? "A carry out" : "A borrow"}: unsigned, the count wrapped past the top. Signed, ${signed} ${by > 0 ? "+" : "−"} ${Math.abs(by)} = ${sum} is fine.`
      : `${head} Unsigned ${value} → ${m.next}, signed ${signed} → ${sum}. Both correct.`);
  };
  const [ox, oy] = at(7.5, R + 4), [ox2, oy2] = at(7.5, R - 34), [cx, cy] = at(15.5, R + 4), [cx2, cy2] = at(15.5, R - 34);
  const widen = { transition: "stroke-width 240ms cubic-bezier(0.23, 1, 0.32, 1)" };
  return (
    <AnimCard title="The 4-bit number wheel" hint="4 bits form a circle. The bits never change meaning by themselves; only the two seams matter.">
      <div className="grid sm:grid-cols-[minmax(0,320px)_1fr] gap-4 items-center">
        <svg viewBox="0 0 320 320" className="w-full max-w-[320px] mx-auto h-auto" role="img" aria-label={`Number wheel at ${pat(value)}`}>
          <circle cx={C} cy={C} r={R - 20} fill="none" stroke={OFF} />
          <line x1={ox} y1={oy} x2={ox2} y2={oy2} stroke={BAD} strokeWidth={alert === "overflow" ? 5 : 2.5} style={widen} />
          <line x1={cx} y1={cy} x2={cx2} y2={cy2} stroke={WARN} strokeWidth={alert === "carry" ? 5 : 2.5} style={widen} />
          {Array.from({ length: 16 }, (_, i) => {
            const [x, y] = at(i, R), [sx, sy] = at(i, R - 26), here = i === value;
            return (
              <g key={i}>
                <text x={x} y={y + 4} textAnchor="middle" fontSize={here ? 12 : 10.5} fontWeight={here ? 700 : 400} fontFamily="monospace" fill={here ? ON : INK}>{pat(i)}</text>
                <text x={sx} y={sy + 3} textAnchor="middle" fontSize={9.5} fill={asSigned(i, 4) < 0 ? BUS : LINE}>{asSigned(i, 4)}</text>
              </g>
            );
          })}
          <g style={{ transform: `rotate(${turn * 22.5}deg)`, transformOrigin: `${C}px ${C}px`, transition: MOVE }}>
            <path d={`M ${C} ${C - 76} L ${C - 6} ${C - 62} L ${C + 6} ${C - 62} Z`} fill={ON} />
          </g>
          <text x={C} y={C - 8} textAnchor="middle" fontSize={24} fontWeight={700} fontFamily="monospace" fill={ON}>{pat(value)}</text>
          <text x={C} y={C + 13} textAnchor="middle" fontSize={12} fill={INK}>unsigned {value}</text>
          <text x={C} y={C + 30} textAnchor="middle" fontSize={12} fill={BUS}>signed {asSigned(value, 4)}</text>
        </svg>
        <div className="space-y-3 min-w-0">
          <div className="flex flex-wrap gap-1.5">
            {[-3, -1, 1, 3].map((by) => <button key={by} type="button" className={btn} onClick={() => move(by)}>{by > 0 ? `+${by}` : `−${-by}`}</button>)}
          </div>
          <ul className="text-[13px] text-ghost space-y-1">
            <li><span className="inline-block w-3 h-0.5 align-middle mr-1.5" style={{ background: BAD }} />Between 7 and −8: <strong className="text-pale">signed overflow</strong></li>
            <li><span className="inline-block w-3 h-0.5 align-middle mr-1.5" style={{ background: WARN }} />Between 15 and 0: <strong className="text-pale">unsigned carry</strong></li>
          </ul>
          <Caption>{note}</Caption>
        </div>
      </div>
    </AnimCard>
  );
}
