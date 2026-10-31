"use client";
/** components/academy/anim/index.tsx — chapters name an animation by id; each loads only when a chapter uses it. */

import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import type { AnimId } from "@/lib/academy/anim";

const loading = () => <p className="text-[13px] text-dim animate-pulse p-4">Loading the animation…</p>;
const ANIMS: Record<AnimId, ComponentType> = {
  "noise-chain": dynamic(() => import("./signals").then((m) => m.NoiseChain), { ssr: false, loading }),
  "place-value": dynamic(() => import("./numbers").then((m) => m.PlaceValue), { ssr: false, loading }),
  "divide-by-two": dynamic(() => import("./numbers").then((m) => m.DivideByTwo), { ssr: false, loading }),
  "column-add": dynamic(() => import("./numbers").then((m) => m.ColumnAdd), { ssr: false, loading }),
  "number-wheel": dynamic(() => import("./numbers").then((m) => m.NumberWheel), { ssr: false, loading }),
  "encoder-disc": dynamic(() => import("./hardware").then((m) => m.EncoderDisc), { ssr: false, loading }),
  "cmos-gate": dynamic(() => import("./hardware").then((m) => m.CmosGate), { ssr: false, loading }),
  venn: dynamic(() => import("./logic").then((m) => m.Venn), { ssr: false, loading }),
  "kmap-neighbours": dynamic(() => import("./logic").then((m) => m.KmapNeighbours), { ssr: false, loading }),
  "qm-merge": dynamic(() => import("./logic").then((m) => m.QmMerge), { ssr: false, loading }),
  "inverter-curve": dynamic(() => import("./circuits").then((m) => m.InverterCurve), { ssr: false, loading }),
  "load-delay": dynamic(() => import("./circuits").then((m) => m.LoadDelay), { ssr: false, loading }),
  "compare-bits": dynamic(() => import("./circuits").then((m) => m.CompareBits), { ssr: false, loading }),
  "mux-router": dynamic(() => import("./circuits").then((m) => m.MuxRouter), { ssr: false, loading }),
  "adder-race": dynamic(() => import("./circuits").then((m) => m.AdderRace), { ssr: false, loading }),
  "shift-add": dynamic(() => import("./circuits").then((m) => m.ShiftAdd), { ssr: false, loading }),
  booth: dynamic(() => import("./circuits").then((m) => m.Booth), { ssr: false, loading }),
  "sr-latch": dynamic(() => import("./sequential").then((m) => m.SrLatch), { ssr: false, loading }),
  "latch-vs-ff": dynamic(() => import("./sequential").then((m) => m.LatchVsFf), { ssr: false, loading }),
  "shift-register": dynamic(() => import("./sequential").then((m) => m.ShiftRegister), { ssr: false, loading }),
  "ripple-vs-sync": dynamic(() => import("./sequential").then((m) => m.RippleVsSync), { ssr: false, loading }),
  "ring-johnson": dynamic(() => import("./sequential").then((m) => m.RingJohnson), { ssr: false, loading }),
  "fsm-detector": dynamic(() => import("./sequential").then((m) => m.FsmDetector), { ssr: false, loading }),
  "state-minimize": dynamic(() => import("./sequential").then((m) => m.StateMinimize), { ssr: false, loading }),
  "setup-hold": dynamic(() => import("./systems").then((m) => m.SetupHold), { ssr: false, loading }),
  "timing-budget": dynamic(() => import("./systems").then((m) => m.TimingBudget), { ssr: false, loading }),
  metastable: dynamic(() => import("./systems").then((m) => m.Metastable), { ssr: false, loading }),
  "memory-grid": dynamic(() => import("./systems").then((m) => m.MemoryGrid), { ssr: false, loading }),
  "dram-refresh": dynamic(() => import("./systems").then((m) => m.DramRefresh), { ssr: false, loading }),
  "pla-program": dynamic(() => import("./systems").then((m) => m.PlaProgram), { ssr: false, loading }),
  "lut-explorer": dynamic(() => import("./systems").then((m) => m.LutExplorer), { ssr: false, loading }),
  sampling: dynamic(() => import("./systems").then((m) => m.Sampling), { ssr: false, loading }),
  quantize: dynamic(() => import("./systems").then((m) => m.Quantize), { ssr: false, loading }),
  "sar-adc": dynamic(() => import("./systems").then((m) => m.SarAdc), { ssr: false, loading }),
  "dac-bits": dynamic(() => import("./systems").then((m) => m.DacBits), { ssr: false, loading }),
  "blocking-nonblocking": dynamic(() => import("./systems").then((m) => m.BlockingNonblocking), { ssr: false, loading }),
  "circuit-to-verilog": dynamic(() => import("./systems").then((m) => m.CircuitToVerilog), { ssr: false, loading }),
};

export default function Animation({ id }: { id: AnimId }) {
  const Anim = ANIMS[id];
  return <Anim />;
}
