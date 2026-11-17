"use client";
/**
 * components/pixel/BitzyWatcher.tsx — Bitzy that watches the pointer and reacts when poked
 * (idea after nilbuild/page-mascot, MIT; ours is drawn in code from lib/pixel/bitzy.ts poses, no
 * sprite sheets). Tracking needs a fine pointer and motion allowed; otherwise it shows `rest`
 * animating as usual. A click or tap cycles cheer → think → sad for half a second.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { ANIMATIONS, COLORS, directionFor, frame, type Animation, type Pose } from "@/lib/pixel/bitzy";
import { PixelFrames } from "./PixelSprite";

const REACTIONS: Animation[] = ["cheer", "think", "sad"];

export default function BitzyWatcher({ size = 72, rest = "idle", label = "Bitzy, the BitFlow chip", className = "" }:
  { size?: number; rest?: Animation; label?: string; className?: string }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [pose, setPose] = useState<Pose | null>(null);       // null: not tracking, play `rest`
  const [poke, setPoke] = useState<Animation | null>(null);
  const pokes = useRef(0);

  useEffect(() => {
    const fine = matchMedia("(hover: hover) and (pointer: fine)").matches;
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!fine || still || rest === "sleep") return;
    let raf = 0, x = 0, y = 0;
    const on = (e: PointerEvent) => {
      x = e.clientX; y = e.clientY;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const r = ref.current?.getBoundingClientRect(); if (!r) return;
        const next = directionFor(x - (r.left + r.width / 2), y - (r.top + r.height / 2));
        setPose((p) => (p && p.look === next.look && p.down === next.down && p.dy === next.dy ? p : next));
      });
    };
    addEventListener("pointermove", on, { passive: true });
    return () => { removeEventListener("pointermove", on); cancelAnimationFrame(raf); };
  }, [rest]);

  useEffect(() => { if (!poke) return; const t = setTimeout(() => setPoke(null), 500); return () => clearTimeout(t); }, [poke]);

  const shown = useMemo(() => {
    if (poke) return ANIMATIONS[poke];
    if (pose) return { frames: [frame(pose)], fps: 1 };
    return ANIMATIONS[rest];
  }, [poke, pose, rest]);

  return (
    <button ref={ref} type="button" aria-label={label} title="Poke Bitzy"
            onClick={() => setPoke(REACTIONS[pokes.current++ % REACTIONS.length])}
            className={`sig-press inline-block rounded-lg focus-visible:outline focus-visible:outline-1 focus-visible:outline-phosphor ${className}`}>
      <PixelFrames frames={shown.frames} fps={shown.fps} colors={COLORS} size={size} label={label} />
    </button>
  );
}
