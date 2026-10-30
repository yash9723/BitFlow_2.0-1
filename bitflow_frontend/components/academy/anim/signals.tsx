"use client";
/** components/academy/anim/signals.tsx — chapter 1: why noise doesn't add up in a digital chain. */

import { useState } from "react";
import { LEVEL, noiseChain, reads } from "@/lib/academy/anim";
import { AnimCard, BAD, Caption, Controls, FADE, INK, LINE, ON, WARN, chip, useSteps } from "./Player";

const X0 = 34, W = 300, H = 170, TOP = 22, BOTTOM = 146;
const xOf = (i: number) => X0 + (i * (W - X0 - 14)) / 5;
const yOf = (v: number) => BOTTOM - (v / 5) * (BOTTOM - TOP);

function Chart({ title, values, step, bit }: { title: string; values: number[]; step: number; bit: 0 | 1 }) {
  const shown = values.slice(0, step + 1), last = reads(shown[shown.length - 1]);
  const colour = last === bit ? ON : last === null ? WARN : BAD;
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2 text-[13px]">
        <span className="font-semibold text-pale">{title}</span>
        <span className="tabular-nums" style={{ color: colour }}>
          {shown[shown.length - 1].toFixed(1)} V, {last === null ? "unreadable" : `reads ${last}`}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={`${title}: voltage after each stage`}>
        <rect x={X0} y={yOf(5)} width={W - X0 - 14} height={yOf(LEVEL.inHigh) - yOf(5)} fill={ON} opacity={0.07} />
        <rect x={X0} y={yOf(LEVEL.inHigh)} width={W - X0 - 14} height={yOf(LEVEL.inLow) - yOf(LEVEL.inHigh)} fill={WARN} opacity={0.1} />
        <rect x={X0} y={yOf(LEVEL.inLow)} width={W - X0 - 14} height={yOf(0) - yOf(LEVEL.inLow)} fill={LINE} opacity={0.12} />
        <text x={X0 - 5} y={yOf(3.6)} textAnchor="end" fontSize={10} fill={INK}>high</text>
        <text x={X0 - 5} y={yOf(1.3)} textAnchor="end" fontSize={10} fill={WARN}>?</text>
        <text x={X0 - 5} y={yOf(0.3)} textAnchor="end" fontSize={10} fill={INK}>low</text>
        {values.map((_, i) => <text key={i} x={xOf(i)} y={H - 8} textAnchor="middle" fontSize={10} fill={LINE}>{i === 0 ? "start" : i}</text>)}
        <polyline points={shown.map((v, i) => `${xOf(i)},${yOf(v)}`).join(" ")} fill="none" stroke={colour} strokeWidth={2} style={{ transition: FADE }} />
        {shown.map((v, i) => <circle key={i} className="anim-in" cx={xOf(i)} cy={yOf(v)} r={3.5} fill={colour} style={{ transition: FADE }} />)}
      </svg>
    </div>
  );
}

export function NoiseChain() {
  const [bit, setBit] = useState<0 | 1>(1);
  const [noise, setNoise] = useState(0.5);
  const s = useSteps(6, bit, 900);
  const { analog, digital } = noiseChain(bit, noise);
  const a = reads(analog[s.step]), d = reads(digital[s.step]);
  return (
    <AnimCard title="Send a bit through five stages" hint="Each stage adds noise. Set how much, press Play, and compare the two chains.">
      <div className="flex flex-wrap items-center gap-3 text-[13px] text-ghost">
        <span className="flex gap-1.5">
          <button type="button" className={chip(bit === 1)} aria-pressed={bit === 1} onClick={() => setBit(1)}>Send 1</button>
          <button type="button" className={chip(bit === 0)} aria-pressed={bit === 0} onClick={() => setBit(0)}>Send 0</button>
        </span>
        <label className="flex items-center gap-2">
          Noise per stage
          <input type="range" min={0} max={1.8} step={0.1} value={noise} onChange={(e) => setNoise(+e.target.value)} className="accent-[#00e87a]" />
          <span className="tabular-nums text-pale w-12">{noise.toFixed(1)} V</span>
        </label>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <Chart title="Analog chain" values={analog} step={s.step} bit={bit} />
        <Chart title="Digital chain" values={digital} step={s.step} bit={bit} />
      </div>
      <Controls s={s} />
      <Caption>
        {s.step === 0 ? "Both chains start from the same clean level."
          : a === bit && d === bit ? `After stage ${s.step} both still read ${bit}, but look at the analog voltage: its noise only ever grows, while the digital chain is back to a clean level.`
          : d === bit ? `After stage ${s.step} the analog signal can no longer be read correctly. The digital one can, because every stage cleaned it up.`
          : `With ${noise.toFixed(1)} V per stage the noise is bigger than the noise margin, so even the digital chain fails. Digital logic only protects you up to its margin.`}
      </Caption>
    </AnimCard>
  );
}
