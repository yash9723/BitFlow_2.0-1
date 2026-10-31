"use client";
/**
 * components/PixelFire.tsx — pixel fire (lib/pixel-fire.ts) on a small canvas scaled up with hard edges.
 * Decoration only. It runs only while on screen, and people who ask for reduced motion get one still frame.
 * `stoked`: scrolling the page makes the flames leap, and turns the page and the fire green (--doom in app/globals.css).
 */
import { useEffect, useRef } from "react";
import { coolingFor, doomAt, newFire, paintEmbers, paintFire, stepFire, stoke, stokedCooling } from "@/lib/pixel-fire";

const FRAME_MS = 42;   // about 24 frames a second
const MAX_COLS = 640;  // wide screens get slightly bigger pixels, not more work

export default function PixelFire({ cell = 6, className = "", stoked = false }: { cell?: number; className?: string; stoked?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let heat = newFire(1, 1), cols = 1, rows = 1, cooling = 1, zoom = 1, image: ImageData | null = null;
    let raf = 0, last = 0, visible = true, flare = 0, lastY = window.scrollY, doom = 0;

    const draw = () => {
      if (!image) return;
      paintFire(heat, image.data, doom, cols);
      paintEmbers(image.data, cols, rows, performance.now() / 1000, doom);
      ctx.putImageData(image, 0, 0);
    };
    const size = () => {
      const px = Math.max(cell, canvas.clientWidth / MAX_COLS);
      zoom = px / 3;
      cols = Math.max(1, Math.ceil(canvas.clientWidth / px));
      rows = Math.max(2, Math.ceil(canvas.clientHeight / px));
      if (canvas.width === cols && canvas.height === rows) return;
      canvas.width = cols; canvas.height = rows;
      heat = newFire(cols, rows);
      cooling = stoked ? stokedCooling(rows, 0) : coolingFor(rows);
      image = ctx.createImageData(cols, rows);
      for (let i = 0; i < rows + 10; i++) stepFire(heat, cols, rows, cooling, Math.random, i * 0.04, zoom);   // start already burning
      draw();
    };
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!visible || now - last < FRAME_MS) return;
      last = now;
      if (stoked) {
        flare = stoke(flare, window.scrollY - lastY);
        lastY = window.scrollY;
        cooling = stokedCooling(rows, flare);
      }
      const time = now / 1000;
      // Heat climbs one row a step: two a frame looks like fire, and a third while stoked makes a flick of the wheel show.
      for (let i = flare > 0.15 ? 3 : 2; i > 0; i--) stepFire(heat, cols, rows, cooling, Math.random, time, zoom);
      draw();
    };

    // A colour change, not movement, so it also applies with reduced motion: the still frame just repaints.
    const page = canvas.closest<HTMLElement>(".apex");
    const onScroll = () => {
      const next = Math.round(doomAt(window.scrollY, window.innerHeight, document.documentElement.scrollHeight - window.innerHeight) * 100) / 100;
      if (next === doom) return;
      doom = next;
      page?.style.setProperty("--doom", String(doom));
      if (still) draw();
    };

    size();
    if (stoked) { onScroll(); window.addEventListener("scroll", onScroll, { passive: true }); }
    const resized = new ResizeObserver(size);
    resized.observe(canvas);
    const onScreen = new IntersectionObserver(([e]) => { visible = e.isIntersecting; });
    onScreen.observe(canvas);
    if (!still) raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); resized.disconnect(); onScreen.disconnect(); window.removeEventListener("scroll", onScroll); };
  }, [cell, stoked]);

  return <canvas ref={ref} aria-hidden className={`apex-pixelfire ${className}`} />;
}
