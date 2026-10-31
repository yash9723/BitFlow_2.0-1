"use client";
/**
 * components/PixelFire.tsx — pixel fire (lib/pixel-fire.ts) on a small canvas scaled up with hard edges.
 * Decoration only. It runs only while on screen, and people who ask for reduced motion get one still frame.
 */
import { useEffect, useRef } from "react";
import { coolingFor, newFire, paintFire, stepFire } from "@/lib/pixel-fire";

const FRAME_MS = 70;   // about 14 frames a second: chunky on purpose, and light on the CPU

export default function PixelFire({ cell = 6, className = "" }: { cell?: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let heat = newFire(1, 1), cols = 1, rows = 1, cooling = 1, image: ImageData | null = null;
    let raf = 0, last = 0, visible = true;

    const draw = () => {
      if (!image) return;
      paintFire(heat, image.data);
      ctx.putImageData(image, 0, 0);
    };
    const size = () => {
      cols = Math.max(1, Math.ceil(canvas.clientWidth / cell));
      rows = Math.max(2, Math.ceil(canvas.clientHeight / cell));
      if (canvas.width === cols && canvas.height === rows) return;
      canvas.width = cols; canvas.height = rows;
      heat = newFire(cols, rows);
      cooling = coolingFor(rows);
      image = ctx.createImageData(cols, rows);
      for (let i = 0; i < rows * 2; i++) stepFire(heat, cols, rows, cooling);   // start already burning
      draw();
    };
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!visible || now - last < FRAME_MS) return;
      last = now;
      stepFire(heat, cols, rows, cooling);
      draw();
    };

    size();
    const resized = new ResizeObserver(size);
    resized.observe(canvas);
    const onScreen = new IntersectionObserver(([e]) => { visible = e.isIntersecting; });
    onScreen.observe(canvas);
    if (!still) raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); resized.disconnect(); onScreen.disconnect(); };
  }, [cell]);

  return <canvas ref={ref} aria-hidden className={`apex-pixelfire ${className}`} />;
}
