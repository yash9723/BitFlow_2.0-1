"use client";
/**
 * components/academy/anim/Stage3D.tsx — the frame every 3D animation shares, built on the same kit as the flat ones
 * (Player.tsx): a titled card, Play/Back/Next, and the narration line that screen readers hear. Around the canvas it adds
 * Turn left, Turn right, Reset view and a Flat view switch. The 3D scene only mounts while the card is on screen, so a
 * page with several of them never holds more than a couple of GL contexts, and it falls back to the flat version when WebGL
 * is missing, the browser takes the context away, or three fails to load. Dragging turns the view; a vertical swipe still
 * scrolls the page, and the wheel scrolls the page (zoom is off). Reduced motion: the camera and the scene jump to each step.
 */
import { type ComponentType, type ReactNode, useEffect, useRef, useState } from "react";
import { type Handle, type Pose, type Scene3D, type Stage, makeStage, webglOk } from "@/lib/3d/stage";
import { AnimCard, Caption, Controls, btn, chip, useSteps } from "./Player";

export interface Anim3DProps {
  title: string;
  hint: string;
  steps: number;
  /** One pose per step: where the camera sits for it. */
  poses: Pose[];
  caption: (step: number) => ReactNode;
  /** The canvas's accessible name for a step (the caption says the rest). */
  describe: (step: number) => string;
  build: (stage: Stage) => Scene3D;
  /** The flat animation shown without WebGL or when the reader asks for it. */
  Flat: ComponentType;
  azLimit?: number;
  ms?: number;
}

export default function Anim3D({ title, hint, steps, poses, caption, describe, build, Flat, azLimit, ms = 2400 }: Anim3DProps) {
  const s = useSteps(steps, title, ms);
  const [mode, setMode] = useState<"3d" | "flat">("3d");
  const [why, setWhy] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const wrap = useRef<HTMLDivElement>(null), host = useRef<HTMLDivElement>(null), h = useRef<Handle | null>(null);
  const step = useRef(s.step); step.current = s.step;
  const keep = useRef({ poses, build }); keep.current = { poses, build };

  useEffect(() => {
    if (!webglOk()) { setMode("flat"); setWhy("This browser can't draw 3D here, so this is the flat version."); }
  }, []);

  useEffect(() => {
    const el = wrap.current;
    if (!el || typeof IntersectionObserver === "undefined") { setVisible(true); return; }
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { rootMargin: "120px" });
    io.observe(el);
    return () => io.disconnect();
  }, [mode]);

  // Build the scene while it is on screen; tear it down when it scrolls away.
  useEffect(() => {
    const el = host.current;
    if (mode !== "3d" || !visible || !el) return;
    let handle: Handle;
    try {
      handle = makeStage(el, {
        pose: keep.current.poses[step.current], azLimit, build: keep.current.build,
        onLost: () => { setMode("flat"); setWhy("The browser paused 3D to free memory, so this is the flat version."); },
      });
    } catch { setMode("flat"); setWhy("3D couldn't start here, so this is the flat version."); return; }
    h.current = handle;
    handle.scene.apply(step.current, true);
    handle.request();
    return () => { handle.destroy(); h.current = null; };
  }, [mode, visible, azLimit]);

  useEffect(() => {
    const cur = h.current;
    if (!cur) return;
    cur.scene.apply(s.step, false);
    cur.setPose(poses[s.step]);
    // poses is a stable constant per animation
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.step]);

  if (mode === "flat") {
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-[13px] text-ghost">
          {why && <span role="status">{why}</span>}
          {webglOk() && <button type="button" className={btn} onClick={() => { setWhy(null); setMode("3d"); }}>Try 3D view</button>}
        </div>
        <Flat />
      </div>
    );
  }

  return (
    <AnimCard title={title} hint={hint}>
      <div ref={wrap} className="space-y-3">
        <div
          ref={host} role="img" aria-label={`${title}, 3D view. ${describe(s.step)}`}
          className="relative w-full aspect-[4/3] sm:aspect-video rounded-lg overflow-hidden border border-rim/50 bg-void"
          style={{ touchAction: "pan-y" }}
        >
          {!visible && <div className="absolute inset-0 grid place-items-center text-[12px] text-dim">3D view loads when you scroll here</div>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={btn} onClick={() => h.current?.rotateBy(-18)} aria-label="Turn the view left">◀ Turn</button>
          <button type="button" className={btn} onClick={() => h.current?.rotateBy(18)} aria-label="Turn the view right">Turn ▶</button>
          <button type="button" className={btn} onClick={() => h.current?.setPose(poses[s.step])}>Reset view</button>
          <button type="button" className={chip(false)} onClick={() => { setWhy(null); setMode("flat"); }}>Flat view</button>
          <span className="text-[12px] text-dim">Drag to turn it.</span>
        </div>
        <Controls s={s} />
        <Caption>{caption(s.step)}</Caption>
      </div>
    </AnimCard>
  );
}
