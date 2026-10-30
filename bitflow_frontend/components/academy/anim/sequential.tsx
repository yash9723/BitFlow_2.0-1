"use client";
/** components/academy/anim/sequential.tsx — chapters 13 to 16: latches, flip-flops, shift registers, counters, state machines. */

import { useEffect, useRef, useState } from "react";
import { MEALY_101, MOORE_101, type MachineState, REDUCIBLE, johnsonNext, latchFfTick, mealyOut, partitionSteps, rippleSteps, ringNext, shiftStep, srSteps } from "@/lib/academy/anim";
import { AnimCard, BAD, BUS, Caption, Controls, FADE, INK, LINE, MOVE, OFF, ON, WARN, btn, chip, useSteps } from "./Player";

const bin = (v: number, w: number) => v.toString(2).padStart(w, "0");
const wire = (v: number) => (v ? ON : OFF);

// ── Chapter 13: the SR latch ──────────────────────────────────────────────────
export function SrLatch() {
  const [s, setS] = useState(0);
  const [r, setR] = useState(0);
  const [state, setState] = useState({ q: 0, qn: 1 });
  const [note, setNote] = useState("Both inputs are 0, so the latch holds what it stored. Press S to set it.");
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const change = (ns: number, nr: number) => {
    window.clearTimeout(timer.current);
    setS(ns); setR(nr);
    const { steps, settles } = srSteps(ns, nr, state.q, state.qn);
    const end = steps[steps.length - 1] ?? state;
    const say = !settles ? "Both inputs were released together, so both gates flip at once, again and again. In real gates one wins by chance. This is why S = R = 1 is forbidden."
      : ns && nr ? "Both outputs are forced to 0, so Q and Q' are no longer opposites. Nothing broke yet, but look what happens if you release both together."
      : ns ? "S drives Q' to 0. That 0 feeds the other gate, which drives Q to 1."
      : nr ? "R drives Q to 0. That 0 feeds the other gate, which drives Q' to 1."
      : `Both inputs are 0. Each gate's output feeds the other, so the loop keeps Q = ${end.q}: that's a stored bit.`;
    setNote(say);
    let i = 0;
    const tick = () => {
      if (i >= steps.length) return;
      setState(steps[i++]);
      if (i < steps.length) timer.current = window.setTimeout(tick, 550);
    };
    tick();
  };

  const nor = (x: number, y: number, label: string) => (
    <g>
      <path d={`M ${x} ${y} Q ${x + 18} ${y + 25} ${x} ${y + 50} Q ${x + 34} ${y + 50} ${x + 62} ${y + 25} Q ${x + 34} ${y} ${x} ${y} Z`} fill="#13141a" stroke={LINE} strokeWidth={1.5} />
      <circle cx={x + 67} cy={y + 25} r={5} fill="#13141a" stroke={LINE} strokeWidth={1.5} />
      <text x={x + 26} y={y + 29} textAnchor="middle" fontSize={9} fill={INK}>{label}</text>
    </g>
  );
  const seg = (d: string, v: number) => <path d={d} fill="none" stroke={wire(v)} strokeWidth={2.5} style={{ transition: FADE }} />;
  return (
    <AnimCard title="A bit stored in a loop" hint="Two NOR gates feed each other. Press S or R and watch the change go round, one gate delay at a time.">
      <svg viewBox="0 0 340 190" className="w-full max-w-[440px] mx-auto h-auto" role="img" aria-label={`Latch: Q is ${state.q}, Q prime is ${state.qn}`}>
        {seg("M 30 40 H 110", r)}
        {seg("M 30 150 H 110", s)}
        {seg(`M 185 55 H 250`, state.q)}
        {seg(`M 185 135 H 250`, state.qn)}
        {seg(`M 215 55 V 85 L 80 110 V 125 H 110`, state.q)}
        {seg(`M 215 135 V 105 L 80 80 V 70 H 110`, state.qn)}
        {nor(112, 30, "NOR")}
        {nor(112, 110, "NOR")}
        <text x={24} y={44} textAnchor="end" fontSize={13} fontWeight={700} fill={r ? ON : INK}>R</text>
        <text x={24} y={154} textAnchor="end" fontSize={13} fontWeight={700} fill={s ? ON : INK}>S</text>
        <circle cx={268} cy={55} r={15} fill={state.q ? ON : "#1c1e27"} stroke={state.q ? ON : LINE} style={{ transition: FADE }} />
        <text x={268} y={60} textAnchor="middle" fontSize={13} fontWeight={700} fill={state.q ? "#04170d" : INK}>{state.q}</text>
        <text x={292} y={60} fontSize={13} fill={INK}>Q</text>
        <circle cx={268} cy={135} r={15} fill={state.qn ? ON : "#1c1e27"} stroke={state.qn ? ON : LINE} style={{ transition: FADE }} />
        <text x={268} y={140} textAnchor="middle" fontSize={13} fontWeight={700} fill={state.qn ? "#04170d" : INK}>{state.qn}</text>
        <text x={292} y={140} fontSize={13} fill={INK}>Q&apos;</text>
      </svg>
      <div className="flex flex-wrap gap-1.5">
        <button type="button" className={chip(s === 1)} aria-pressed={s === 1} onClick={() => change(s ^ 1, r)}>S = {s}</button>
        <button type="button" className={chip(r === 1)} aria-pressed={r === 1} onClick={() => change(s, r ^ 1)}>R = {r}</button>
        <button type="button" className={btn} onClick={() => change(0, 0)} disabled={!s && !r}>Release both</button>
      </div>
      <Caption>{note}</Caption>
    </AnimCard>
  );
}

// ── Chapter 13: level against edge ────────────────────────────────────────────
const TICKS = 40, CLK_HALF = 4;
const PRESET_D = [0, 0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 0, 0, 1, 0, 0, 0, 1, 1, 1];     // wiggles while the clock is high
function startTrace() {
  const rows = [];
  let prev = { clk: 0, latch: 0, ff: 0 };
  for (let t = 0; t < PRESET_D.length; t++) {
    const row = latchFfTick(prev, Math.floor(t / CLK_HALF) % 2, PRESET_D[t]);
    rows.push(row); prev = row;
  }
  return rows;
}

export function LatchVsFf() {
  const [rows, setRows] = useState(startTrace);
  const [d, setD] = useState(PRESET_D[PRESET_D.length - 1]);
  const [running, setRunning] = useState(false);
  const dRef = useRef(d);
  dRef.current = d;
  const advance = () => setRows((all) => {
    const t = all.length, last = all[t - 1];
    return [...(t >= TICKS ? all.slice(CLK_HALF * 2) : all), latchFfTick(last, Math.floor(t / CLK_HALF) % 2, dRef.current)];
  });
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(advance, 260);
    return () => window.clearInterval(id);
  }, [running]);
  const W = 340, labelW = 54, X = (i: number) => labelW + (i * (W - labelW - 6)) / TICKS, H = 26, gap = 10;
  const trace = (key: "clk" | "d" | "latch" | "ff", row: number) => {
    const top = 6 + row * (H + gap), level = (v: number) => (v ? top : top + H);
    return rows.map((r, i) => {
      const y = level(r[key]), prev = i ? level(rows[i - 1][key]) : y;
      return `${i ? `L ${X(i)} ${prev} ` : `M ${X(i)} ${y} `}L ${X(i)} ${y} L ${X(i + 1)} ${y}`;
    }).join(" ");
  };
  const ROWS: ["clk" | "d" | "latch" | "ff", string, string][] = [["clk", "clock", LINE], ["d", "D", BUS], ["latch", "latch Q", WARN], ["ff", "flip-flop Q", ON]];
  return (
    <AnimCard title="A latch against a flip-flop" hint="Same clock, same D. Press Run, then flip D at any moment and compare the two outputs.">
      <svg viewBox={`0 0 ${W} ${4 * (H + gap) + 6}`} className="w-full max-w-[560px] mx-auto h-auto" role="img" aria-label="Clock, D, latch output and flip-flop output over time">
        {rows.map((r, i) => (r.clk && !rows[i - 1]?.clk && i > 0 ? <line key={i} x1={X(i)} y1={4} x2={X(i)} y2={4 * (H + gap)} stroke={LINE} strokeDasharray="2 3" opacity={0.6} /> : null))}
        {ROWS.map(([k, name, colour], row) => (
          <g key={k}>
            <text x={labelW - 6} y={6 + row * (H + gap) + H / 2 + 4} textAnchor="end" fontSize={10} fill={colour}>{name}</text>
            <path d={trace(k, row)} fill="none" stroke={colour} strokeWidth={1.8} />
          </g>
        ))}
      </svg>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={btn} onClick={() => setRunning(!running)}>{running ? "Pause" : "Run"}</button>
        <button type="button" className={btn} onClick={advance} disabled={running}>One tick</button>
        <button type="button" className={chip(d === 1)} aria-pressed={d === 1} onClick={() => setD(d ^ 1)}>D = {d}</button>
      </div>
      <Caption>A latch is transparent: while the clock is high, its output copies D and every wiggle goes straight through. A flip-flop only looks at the instant the clock rises (the dotted lines), then ignores D until the next rise. That&apos;s what makes circuits with feedback predictable.</Caption>
    </AnimCard>
  );
}

// ── Chapter 14: shift register ────────────────────────────────────────────────
interface Tile { id: number; v: number; pos: number; gone?: boolean }
export function ShiftRegister() {
  const n = 4;
  const nextId = useRef(n);
  const [tiles, setTiles] = useState<Tile[]>(() => Array.from({ length: n }, (_, i) => ({ id: i, v: 0, pos: i })));
  const [dir, setDir] = useState<"right" | "left">("right");
  const [input, setInput] = useState(1);
  const [out, setOut] = useState<number[]>([]);
  const [load, setLoad] = useState(11);
  const live = tiles.filter((t) => !t.gone).sort((a, b) => a.pos - b.pos);
  const clock = () => {
    const bits = live.map((t) => t.v), { out: bit } = shiftStep(bits, input, dir), by = dir === "right" ? 1 : -1;
    setOut((o) => [bit, ...o].slice(0, 12));
    const id = nextId.current++;
    setTiles([
      ...live.map((t) => { const pos = t.pos + by; return { ...t, pos, gone: pos < 0 || pos >= n }; }),
      { id, v: input, pos: dir === "right" ? 0 : n - 1 },
    ]);
  };
  const loadAll = () => {
    const base = nextId.current;
    nextId.current += n;
    setTiles(Array.from({ length: n }, (_, i) => ({ id: base + i, v: (load >> (n - 1 - i)) & 1, pos: i })));
  };
  const CELL = 56;
  return (
    <AnimCard title="Watch bits move through a shift register" hint="Each clock edge moves every bit one place. Bits go in at one end and fall out of the other.">
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" className={chip(dir === "right")} aria-pressed={dir === "right"} onClick={() => setDir("right")}>Shift right</button>
        <button type="button" className={chip(dir === "left")} aria-pressed={dir === "left"} onClick={() => setDir("left")}>Shift left</button>
      </div>
      <div className="flex items-center justify-center gap-2 overflow-hidden py-1">
        <span className="text-[12px] text-dim w-14 text-right">{dir === "right" ? `in: ${input}` : `out`}</span>
        <div className="relative shrink-0 rounded border border-rim/60" style={{ width: CELL * n, height: CELL }} aria-label={`Register holds ${live.map((t) => t.v).join("")}`} role="img">
          {[1, 2, 3].map((i) => <span key={i} className="absolute top-0 bottom-0 w-px bg-rim/40" style={{ left: CELL * i }} />)}
          {tiles.map((t) => (
            <span key={t.id} className="absolute top-1 left-1 flex items-center justify-center rounded font-mono text-[22px] font-bold anim-fade"
                  style={{ width: CELL - 8, height: CELL - 8, transform: `translateX(${t.pos * CELL}px)`, transition: MOVE, opacity: t.gone ? 0 : 1, background: t.v ? "rgba(0,232,122,0.18)" : "#1c1e27", color: t.v ? ON : INK }}>{t.v}</span>
          ))}
        </div>
        <span className="text-[12px] text-dim w-14">{dir === "right" ? "out" : `in: ${input}`}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={btn} onClick={clock}>Clock edge</button>
        <button type="button" className={chip(input === 1)} aria-pressed={input === 1} onClick={() => setInput(input ^ 1)}>Serial in = {input}</button>
        <label className="flex items-center gap-1.5 text-[13px] text-ghost">Load
          <input type="number" min={0} max={15} value={load} onChange={(e) => setLoad(Math.max(0, Math.min(15, Math.floor(+e.target.value) || 0)))} className="w-14 px-2 py-1 rounded border border-rim/60 bg-void text-[14px] text-bright tabular-nums" />
        </label>
        <button type="button" className={btn} onClick={loadAll}>Load all at once</button>
      </div>
      <p className="font-mono text-[14px] text-pale" role="status">Fell out, newest first: {out.length ? out.join(" ") : "nothing yet"}</p>
      <Caption>Reading all four cells at once after 4 clocks turns serial data into parallel. Loading all at once and then clocking does the reverse. A serial port like a UART is exactly this.</Caption>
    </AnimCard>
  );
}

// ── Chapter 15: ripple against synchronous ────────────────────────────────────
function Tiles({ v }: { v: number }) {
  return (
    <div className="flex gap-1">
      {[3, 2, 1, 0].map((b) => { const on = (v >> b) & 1; return <span key={b} className="w-9 h-10 rounded border flex items-center justify-center font-mono text-[18px] font-bold transition-[background-color,border-color,color] duration-150" style={{ background: on ? "rgba(0,232,122,0.18)" : "#1c1e27", borderColor: on ? ON : "#2e3040", color: on ? ON : INK }}>{on}</span>; })}
    </div>
  );
}

export function RippleVsSync() {
  const w = 4;
  const [count, setCount] = useState(7);
  const [ripple, setRipple] = useState(7);
  const [sync, setSync] = useState(7);
  const [seen, setSeen] = useState<number[]>([]);
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);
  const edge = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    const steps = rippleSteps(count, w), target = (count + 1) % 16;
    setRipple(count); setSeen([]);
    setCount(target);
    timers.current = [
      window.setTimeout(() => setSync(target), 450),
      ...steps.map((v, i) => window.setTimeout(() => { setRipple(v); setSeen((s) => [...s, v]); }, 450 * (i + 1))),
    ];
  };
  const wrong = seen.slice(0, -1);
  return (
    <AnimCard title="Ripple against synchronous" hint="Both count the same clock. A ripple counter's stages each clock the next, so a change walks along it. Try going from 7 to 8.">
      <div className="grid sm:grid-cols-2 gap-4">
        <div><div className="text-[13px] font-semibold text-pale mb-1">Ripple (asynchronous)</div><Tiles v={ripple} /></div>
        <div><div className="text-[13px] font-semibold text-pale mb-1">Synchronous</div><Tiles v={sync} /></div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={btn} onClick={edge}>Clock edge</button>
        <button type="button" className={btn} onClick={() => { timers.current.forEach((t) => window.clearTimeout(t)); setCount(7); setRipple(7); setSync(7); setSeen([]); }}>Back to 7</button>
      </div>
      <p className="font-mono text-[14px] min-h-[1.5em]" role="status">
        {seen.length > 0 && <>Ripple passed through: {seen.map((v, i) => <span key={i} className={`anim-in inline-block mr-2 ${i < seen.length - 1 ? "text-warn" : "text-phosphor"}`}>{bin(v, w)}</span>)}</>}
      </p>
      <Caption>
        {wrong.length ? <>On the way, the ripple counter briefly read {wrong.map((v) => v).join(", ")}, which are wrong. Anything decoding its output could fire falsely on those. The synchronous counter changes all its bits together, with the same one delay.</>
          : seen.length ? "Only the first stage had to change this time, so there was no wrong value."
          : "Press Clock edge."}
      </Caption>
    </AnimCard>
  );
}

// ── Chapter 15: ring and Johnson ──────────────────────────────────────────────
function Loop({ title, bits, states, note }: { title: string; bits: number[]; states: number; note: string }) {
  return (
    <div className="min-w-0">
      <div className="flex justify-between text-[13px]"><span className="font-semibold text-pale">{title}</span><span className="text-ghost tabular-nums">{states} states</span></div>
      <div className="flex gap-1 mt-1">
        {bits.map((b, i) => <span key={i} className="flex-1 max-w-[56px] h-11 rounded border flex items-center justify-center font-mono text-[18px] font-bold transition-[background-color,border-color,color] duration-200" style={{ background: b ? "rgba(0,232,122,0.18)" : "#1c1e27", borderColor: b ? ON : "#2e3040", color: b ? ON : INK }}>{b}</span>)}
      </div>
      <p className="text-[13px] text-ghost mt-1">{note}</p>
    </div>
  );
}

export function RingJohnson() {
  const s = useSteps(17, 0, 650), n = 4;
  const walk = (next: (b: number[]) => number[], start: number[]) => { let b = start; for (let i = 0; i < s.step; i++) b = next(b); return b; };
  const ring = walk(ringNext, [1, 0, 0, 0]), john = walk(johnsonNext, [0, 0, 0, 0]);
  return (
    <AnimCard title="Ring and Johnson counters" hint={`${n} flip-flops in a loop. A ring feeds the last bit straight back, and a Johnson feeds it back inverted. That one inverter doubles the states.`}>
      <div className="grid sm:grid-cols-2 gap-4">
        <Loop title="Ring" bits={ring} states={n} note="One 1 circulates, so each output is already decoded." />
        <Loop title="Johnson (twisted ring)" bits={john} states={2 * n} note="1s fill up, then 0s do. Any state can be decoded with one 2-input AND." />
      </div>
      <Controls s={s} />
      <Caption>After {s.step} clock{s.step === 1 ? "" : "s"}. The ring repeats every {n} clocks, and the Johnson every {2 * n}. A plain binary counter of 4 flip-flops would have 16 states, but it needs a decoder to use them.</Caption>
    </AnimCard>
  );
}

// ── Chapter 16: a sequence detector, two ways ─────────────────────────────────
function Diagram({ states, at, from, input, mealy, title }: { states: MachineState[]; at: number; from: number | null; input: number | null; mealy: boolean; title: string }) {
  const W = 340, H = 176, gapX = (W - 60) / (states.length - 1), pos = (i: number) => [30 + i * gapX, 84];
  const edges: { a: number; b: number; bit: number }[] = states.flatMap((s, a) => s.next.map((b, bit) => ({ a, b, bit })));
  return (
    <div className="min-w-0">
      <div className="text-[13px] font-semibold text-pale">{title}</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={`${title}: now in state ${states[at].name}`}>
        {edges.map(({ a, b, bit }) => {
          const [x1, y1] = pos(a), [x2] = pos(b), active = from === a && input === bit, colour = active ? ON : LINE;
          const label = mealy ? `${bit}/${mealyOut(a, bit)}` : String(bit);
          if (a === b) return <g key={`${a}${bit}`}><path d={`M ${x1 - 8} ${y1 - 19} C ${x1 - 28} ${y1 - 52} ${x1 + 28} ${y1 - 52} ${x1 + 8} ${y1 - 19}`} fill="none" stroke={colour} strokeWidth={active ? 2.5 : 1.2} style={{ transition: FADE }} /><text x={x1} y={y1 - 46} textAnchor="middle" fontSize={10} fill={active ? ON : INK}>{label}</text></g>;
          const forward = b > a, span = Math.abs(b - a), side = forward ? -1 : 1, sy = y1 + side * 19, ey = y1 + side * 19, mx = (x1 + x2) / 2;
          const ctl = sy + side * (span === 1 ? 26 : 56), top = (sy + ctl) / 2;                 // a quadratic peaks halfway to its control point
          const head = `M ${x2} ${ey} L ${x2 - 4} ${ey + side * 7} L ${x2 + 4} ${ey + side * 7} Z`;
          return <g key={`${a}${bit}`}><path d={`M ${x1} ${sy} Q ${mx} ${ctl} ${x2} ${ey}`} fill="none" stroke={colour} strokeWidth={active ? 2.5 : 1.2} style={{ transition: FADE }} />
            <path d={head} fill={colour} style={{ transition: FADE }} />
            <text x={mx} y={top + (forward ? -3 : 11)} textAnchor="middle" fontSize={10} fill={active ? ON : INK}>{label}</text></g>;
        })}
        {states.map((s, i) => {
          const [x, y] = pos(i), here = i === at, out = !mealy && s.out === 1;
          return (
            <g key={s.name}>
              <circle cx={x} cy={y} r={20} fill={here ? "rgba(0,232,122,0.22)" : "#13141a"} stroke={here ? ON : LINE} strokeWidth={here ? 2.5 : 1.3} style={{ transition: FADE }} />
              {out && <circle cx={x} cy={y} r={16} fill="none" stroke={here ? ON : LINE} />}
              <text x={x} y={y + 4} textAnchor="middle" fontSize={10} fontWeight={700} fill={here ? ON : INK}>{s.name}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function FsmDetector() {
  const [inputs, setInputs] = useState<number[]>([]);
  const [moore, setMoore] = useState(0);
  const [mealy, setMealy] = useState(0);
  const [mooreFrom, setMooreFrom] = useState<number | null>(null);
  const [mealyFrom, setMealyFrom] = useState<number | null>(null);
  const [outs, setOuts] = useState<{ moore: number; mealy: number }[]>([]);
  const queue = useRef<number[]>([]);
  const [auto, setAuto] = useState(false);
  const last = inputs[inputs.length - 1] ?? null;
  const feed = (bit: number) => {
    const nm = MOORE_101[moore].next[bit], ne = MEALY_101[mealy].next[bit];
    setMooreFrom(moore); setMealyFrom(mealy);
    setOuts((o) => [...o, { moore: MOORE_101[nm].out, mealy: mealyOut(mealy, bit) }].slice(-16));
    setInputs((i) => [...i, bit].slice(-16));
    setMoore(nm); setMealy(ne);
  };
  useEffect(() => {
    if (!auto) return;
    if (!queue.current.length) { setAuto(false); return; }
    const id = window.setTimeout(() => feed(queue.current.shift()!), 1000);
    return () => window.clearTimeout(id);
  }, [auto, inputs]); // eslint-disable-line react-hooks/exhaustive-deps
  const reset = () => { queue.current = []; setAuto(false); setInputs([]); setOuts([]); setMoore(0); setMealy(0); setMooreFrom(null); setMealyFrom(null); };
  const lastOut = outs[outs.length - 1];
  const cell = (v: number | string, on = false) => <span className={`inline-flex w-5 justify-center ${on ? "text-phosphor font-bold" : ""}`}>{v}</span>;
  return (
    <AnimCard title="Detecting 1 0 1, two ways" hint="Feed it bits and follow the highlighted state. An output of 1 means it just saw 1 0 1, and overlaps count.">
      <div className="grid sm:grid-cols-2 gap-3">
        <Diagram states={MOORE_101} at={moore} from={mooreFrom} input={last} mealy={false} title="Moore: 4 states, output in the state" />
        <Diagram states={MEALY_101} at={mealy} from={mealyFrom} input={last} mealy title="Mealy: 3 states, output on the arrow" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={btn} onClick={() => feed(0)}>Input 0</button>
        <button type="button" className={btn} onClick={() => feed(1)}>Input 1</button>
        <button type="button" className={btn} onClick={() => { reset(); queue.current = [1, 0, 1, 0, 1, 1, 0, 1]; setAuto(true); }}>Play 1 0 1 0 1 1 0 1</button>
        <button type="button" className={btn} onClick={reset}>Reset</button>
      </div>
      <div className="overflow-x-auto font-mono text-[14px] text-pale space-y-0.5" role="status">
        <div><span className="inline-block w-16 font-sans text-[12px] text-dim">Input</span>{inputs.map((b, i) => <span key={i} className="anim-in inline-flex">{cell(b)}</span>)}</div>
        <div><span className="inline-block w-16 font-sans text-[12px] text-dim">Output</span>{outs.map((o, i) => <span key={i} className="anim-in inline-flex">{cell(o.moore, o.moore === 1)}</span>)}</div>
      </div>
      <Caption>
        {lastOut?.moore ? "Match. The Moore machine reached its double-circled state, so its output is 1 for this whole clock. The Mealy machine's output came straight from the arrow it took, so it reacts with fewer states but depends on the input right now."
          : "Both machines remember how much of 1 0 1 they've seen so far. Press Play, or feed bits yourself."}
      </Caption>
    </AnimCard>
  );
}

// ── Chapter 16: state minimization ────────────────────────────────────────────
const GROUP_COLOURS = [BUS, ON, WARN, BAD, "#a78bfa", "#2dd4bf", "#ff6bcb"];
export function StateMinimize() {
  const rounds = partitionSteps(REDUCIBLE), s = useSteps(rounds.length, 0, 1800), now = rounds[s.step];
  const groups = new Set(now).size;
  const colour = (g: number) => GROUP_COLOURS[g % GROUP_COLOURS.length];
  return (
    <AnimCard title="Merging equivalent states" hint="Start by grouping states with the same output. Then split any group whose members go to different groups. Stop when nothing splits.">
      <div className="overflow-x-auto">
        <table className="font-mono text-[14px] text-center">
          <thead className="text-dim text-[12px] font-sans"><tr><th className="px-3 font-normal">State</th><th className="px-3 font-normal">on 0</th><th className="px-3 font-normal">on 1</th><th className="px-3 font-normal">Output</th><th className="px-3 font-normal">Group</th></tr></thead>
          <tbody>
            {REDUCIBLE.map((st, i) => (
              <tr key={st.name}>
                <td className="px-3 font-bold" style={{ color: colour(now[i]), transition: FADE }}>{st.name}</td>
                {st.next.map((n, k) => <td key={k} className="px-3" style={{ color: colour(now[n]), transition: FADE }}>{REDUCIBLE[n].name}</td>)}
                <td className="px-3 text-ghost">{st.out}</td>
                <td className="px-3"><span className="inline-block w-5 h-5 rounded align-middle" style={{ background: colour(now[i]), transition: "background-color 300ms cubic-bezier(0.23, 1, 0.32, 1)" }} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Controls s={s} />
      <Caption>
        {s.step === 0 ? `Round 0: two groups, split only by output. A state's colour here also colours the "on 0" and "on 1" entries that lead to it.`
          : s.step === rounds.length - 1 ? `Round ${s.step} splits once more, and after that nothing else can split. ${REDUCIBLE.length} states need only ${groups}: keep one state from each colour. Fewer states can mean fewer flip-flops and less logic.`
          : `Round ${s.step}: within a group, compare the colours in the "on 0" and "on 1" columns. Members that lead to different colours can't be equivalent, so they split. Now there are ${groups} groups.`}
      </Caption>
    </AnimCard>
  );
}
