"use client";
/**
 * components/studio/CircuitViewer.tsx — a circuit you can run but not edit, for Academy chapters:
 * click its switches and clocks and watch the wires and outputs change. The same drawing and
 * simulator as the editor (components/studio/CircuitParts.tsx, lib/gate-sim.ts), and a button to
 * open a copy in the editor.
 */

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import PartView, { hex } from "@/components/studio/CircuitParts";
import { GateSim, toNumber } from "@/lib/gate-sim";
import { type Circuit, type PinRef, compile, inputParts, outputParts, pinWidth, portWidth, toBits, width } from "@/lib/studio/circuit";
import { type Point, bounds, junctions, pathOf, wireRoute } from "@/lib/studio/circuit-edit";
import { routeAll } from "@/lib/studio/circuit-route";
import { CIRCUIT_INCOMING_KEY } from "@/lib/studio/logic-circuit";

export default function CircuitViewer({ circuit }: { circuit: Circuit }) {
  const router = useRouter();
  const c = useMemo(() => routeAll(circuit), [circuit]);
  const { net, bitsOf } = useMemo(() => compile(c), [c]);
  const sim = useRef<GateSim | null>(null);
  if (!sim.current) sim.current = new GateSim(net);
  const inputs = useRef<Record<string, number>>({});
  const [, setTick] = useState(0);
  const redraw = () => setTick((t) => t + 1);

  const drive = (label: string, v: number) => {
    inputs.current[label] = v;
    sim.current!.set(label, toBits(v, sim.current!.ports[label]?.bits.length ?? 1));
    redraw();
  };
  const pulse = (label: string) => { drive(label, 1); drive(label, 0); };
  const powerUp = () => { sim.current = new GateSim(net); inputs.current = {}; redraw(); };
  const openInEditor = () => {
    try { localStorage.setItem(CIRCUIT_INCOMING_KEY, JSON.stringify(c)); } catch { window.alert("Your browser blocked local storage, so the circuit can't be opened."); return; }
    router.push("/studio/circuit");
  };

  const valueOf = (r: PinRef) => toNumber((bitsOf(r) ?? []).map((b) => sim.current!.net(b)));
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
            const from = byId.get(w.from.part)!, bw = pinWidth(from, w.from.pin), v = valueOf(w.from);
            return (
              <g key={w.id}>
                <title>{`${from.label}.${w.from.pin} = ${bw > 1 ? `${bw}'h${hex(v, bw)} (${v})` : v}`}</title>
                <path d={pathOf(routes.get(w.id)!)} fill="none" strokeLinejoin="round" strokeWidth={bw > 1 ? 3.5 : 2} stroke={bw > 1 ? "#5aa9e6" : v === 1 ? "#00e87a" : "#4a4d60"} />
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
                      outputBits={p.kind === "led" || p.kind === "seg7" || p.kind === "hexout" ? sim.current!.get(p.label) : null}
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
        <button className={`${btn} ml-auto`} onClick={openInEditor} title="Open a copy in the circuit editor, where you can change it">Open in the editor →</button>
      </div>
    </div>
  );
}
