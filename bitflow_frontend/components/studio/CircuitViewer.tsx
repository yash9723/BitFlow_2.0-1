"use client";
/**
 * components/studio/CircuitViewer.tsx — a circuit you can run but not edit, for Academy chapters:
 * click its switches and clocks and watch the wires and outputs change. The same drawing and
 * simulator as the editor (components/studio/CircuitParts.tsx, lib/gate-sim.ts), and a button to
 * open a copy in the editor. Each change plays back through the gates with real delays
 * (lib/studio/delay-sim.ts), quickly or in slow motion, and not at all under reduced motion.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import PartView, { hex } from "@/components/studio/CircuitParts";
import { type Bit, GateSim, toNumber } from "@/lib/gate-sim";
import { type Circuit, type PinRef, compile, inputParts, outputParts, pinWidth, portWidth, toBits, width } from "@/lib/studio/circuit";
import { type Point, bounds, junctions, pathOf, wireRoute } from "@/lib/studio/circuit-edit";
import { routeAll } from "@/lib/studio/circuit-route";
import { type Transient, DEFAULT_DELAYS, DelaySim } from "@/lib/studio/delay-sim";
import { CIRCUIT_INCOMING_KEY } from "@/lib/studio/logic-circuit";

export default function CircuitViewer({ circuit, slow = false }: { circuit: Circuit; slow?: boolean }) {
  const router = useRouter();
  const c = useMemo(() => routeAll(circuit), [circuit]);
  const { net, bitsOf } = useMemo(() => compile(c), [c]);
  const sim = useRef<GateSim | null>(null);
  if (!sim.current) sim.current = new GateSim(net);
  const inputs = useRef<Record<string, number>>({});
  const [, setTick] = useState(0);
  const redraw = () => setTick((t) => t + 1);

  const [slowMotion, setSlowMotion] = useState(slow);
  // While a change plays back, wires show its values; `sim` already holds where it ends up.
  const play = useRef<{ t: Transient; now: number; end: number } | null>(null);
  const raf = useRef(0);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  const stop = () => { cancelAnimationFrame(raf.current); play.current = null; };
  const replay = (t: Transient) => {
    const end = t.settled + 1, unit = slowMotion ? Math.min(350, 8000 / end) : Math.min(60, 500 / end);
    play.current = { t, now: 0, end };
    let start = 0;
    const tick = (ts: number) => {
      const p = play.current;
      if (!p) return;
      start ||= ts;
      p.now = (ts - start) / unit;
      if (p.now >= p.end) play.current = null;
      else raf.current = requestAnimationFrame(tick);
      redraw();
    };
    raf.current = requestAnimationFrame(tick);
  };

  const drive = (label: string, v: number) => {
    const s = sim.current!, bits = toBits(v, s.ports[label]?.bits.length ?? 1);
    inputs.current[label] = v;
    stop();
    let t: Transient | null = null;
    try {
      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) t = new DelaySim(net, DEFAULT_DELAYS, (b) => s.net(b)).run(label, bits);
    } catch { /* a part the delay simulator doesn't model: just settle */ }
    s.set(label, bits);
    if (t && t.changes.size && !t.truncated) replay(t);
    redraw();
  };
  const pulse = (label: string) => { drive(label, 1); inputs.current[label] = 0; sim.current!.set(label, [0]); };
  const powerUp = () => { stop(); sim.current = new GateSim(net); inputs.current = {}; redraw(); };
  const openInEditor = () => {
    try { localStorage.setItem(CIRCUIT_INCOMING_KEY, JSON.stringify(c)); } catch { window.alert("Your browser blocked local storage, so the circuit can't be opened."); return; }
    router.push("/studio/circuit");
  };

  const netAt = (b: Bit) => {
    const p = play.current, changes = p && typeof b === "number" ? p.t.changes.get(b) : undefined;
    if (!p || !changes) return sim.current!.net(b);
    let v = p.t.before.get(b as number)!;
    for (const c of changes) { if (c.t > p.now) break; v = c.v; }
    return v;
  };
  const valueOf = (r: PinRef) => toNumber((bitsOf(r) ?? []).map(netAt));
  /** How long ago this wire last changed, while that change is still travelling along it (one gate delay). */
  const travelling = (r: PinRef) => {
    const p = play.current;
    if (!p) return null;
    let last = -1;
    for (const b of bitsOf(r) ?? []) for (const c of (typeof b === "number" ? p.t.changes.get(b) : undefined) ?? []) if (c.t <= p.now && c.t > last) last = c.t;
    return last < 0 || p.now - last >= 1 ? null : p.now - last;
  };
  const byId = new Map(c.parts.map((p) => [p.id, p]));
  const driverOf = new Map(c.wires.map((w) => [`${w.to.part}.${w.to.pin}`, w.from]));
  const b = bounds(c) ?? { x: 0, y: 0, w: 100, h: 100 };
  const view = `${b.x - 24} ${b.y - 16} ${b.w + 48} ${b.h + 32}`;

  const routes = new Map<string, Point[]>();
  const fan = new Map<string, { ref: PinRef; paths: Point[][] }>();
  for (const w of c.wires) {
    const pts = wireRoute(w, byId.get(w.from.part)!, byId.get(w.to.part)!), k = `${w.from.part}.${w.from.pin}`;
    routes.set(w.id, pts);
    if (!fan.has(k)) fan.set(k, { ref: w.from, paths: [] });
    fan.get(k)!.paths.push(pts);
  }
  const clocks = c.parts.filter((p) => p.kind === "clock");
  // The same inputs as ordinary buttons, for keyboards, screen readers and small screens.
  const knobs = inputParts(c).filter((p) => p.kind === "switch" || p.kind === "hexin");
  const step = (p: (typeof knobs)[number]) => drive(p.label, ((inputs.current[p.label] ?? 0) + 1) % 2 ** portWidth(p));
  const outputs = outputParts(c).map((p) => `${p.label} = ${toNumber(sim.current!.get(p.label))}`).join(", ");
  const btn = "px-2 py-1 rounded border border-rim/60 text-ghost hover:text-bright";

  return (
    <div className="rounded-xl border border-rim/60 bg-pit overflow-hidden">
      <div className="overflow-x-auto">
        <svg viewBox={view} className="w-full h-auto block select-none" style={{ minWidth: Math.round((b.w + 48) * 0.7) }} role="group" aria-label={`Circuit ${c.module}`}>
          {c.wires.map((w) => {
            const from = byId.get(w.from.part)!, bw = pinWidth(from, w.from.pin), v = valueOf(w.from), ago = travelling(w.from);
            const colour = (x: number) => (bw > 1 ? "#5aa9e6" : x === 1 ? "#00e87a" : "#4a4d60");
            const d = pathOf(routes.get(w.id)!), weight = bw > 1 ? 3.5 : 2;
            return (
              <g key={w.id}>
                <title>{`${from.label}.${w.from.pin} = ${bw > 1 ? `${bw}'h${hex(v, bw)} (${v})` : v}`}</title>
                <path d={d} fill="none" strokeLinejoin="round" strokeWidth={weight} stroke={colour(ago !== null && bw === 1 ? v ^ 1 : v)} />
                {ago !== null && <path d={d} fill="none" strokeLinejoin="round" strokeWidth={weight} pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - ago} stroke={bw > 1 ? "#bfe3ff" : colour(v)} />}
              </g>
            );
          })}
          {[...fan.values()].flatMap(({ ref, paths }) => {
            const bw = pinWidth(byId.get(ref.part)!, ref.pin), on = bw === 1 && valueOf(ref) === 1;
            return junctions(paths).map(([x, y]) => <circle key={`${ref.part}.${ref.pin}.${x}.${y}`} cx={x} cy={y} r={bw > 1 ? 3.6 : 3} fill={bw > 1 ? "#5aa9e6" : on ? "#00e87a" : "#6b6f85"} />);
          })}
          {c.parts.map((p) => (
            <PartView key={p.id} p={p} fixed selected={false} hot={false} valueOf={valueOf} iec={false} wiring={null} snapPin={null} live
                      inputValue={inputs.current[p.label] ?? 0}
                      outputBits={p.kind === "led" || p.kind === "seg7" || p.kind === "hexout" ? (sim.current!.ports[p.label]?.bits ?? []).map(netAt) : null}
                      source={driverOf.get(`${p.id}.${p.kind === "alu" ? "op" : "in"}`)}
                      pinTitle={(pin) => `${p.label}.${pin}`}
                      onBodyDown={() => {}} onPinDown={() => {}}
                      onKeypad={(code) => drive(p.label, code === null ? 0 : 16 + code)}
                      onKnob={(down, back) => {
                        if (p.kind === "hexin" && down) { const m = 2 ** width(p); drive(p.label, ((inputs.current[p.label] ?? 0) + (back ? m - 1 : 1)) % m); }
                        if (p.kind === "switch" && down) drive(p.label, (inputs.current[p.label] ?? 0) ^ 1);
                        if (p.kind === "button") drive(p.label, down ? 1 : 0);
                        if (p.kind === "clock" && down) pulse(p.label);
                      }} />
          ))}
        </svg>
      </div>
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-t border-rim/40 font-mono text-[11px]">
        {knobs.map((p) => (
          <button key={p.id} className={btn} aria-label={`${p.label}, now ${inputs.current[p.label] ?? 0}. Press to ${portWidth(p) > 1 ? "count up" : "flip"}.`} onClick={() => step(p)}>
            {p.label} = {hex(inputs.current[p.label] ?? 0, portWidth(p))}
          </button>
        ))}
        <span className="sr-only" role="status">{outputs}</span>
        {clocks.length > 0 && <button className={btn} onClick={() => clocks.forEach((p) => pulse(p.label))}>Clock edge</button>}
        <button className={btn} onClick={powerUp} title="All inputs to 0, flip-flops to 0">Reset</button>
        <button className={`${btn} ${slowMotion ? "border-phosphor/60 text-phosphor" : ""}`} aria-pressed={slowMotion} onClick={() => setSlowMotion(!slowMotion)} title="Watch each change travel through the gates">Slow motion</button>
        <button className={`${btn} ml-auto`} onClick={openInEditor} title="Open a copy in the circuit editor, where you can change it">Open in the editor →</button>
      </div>
    </div>
  );
}
