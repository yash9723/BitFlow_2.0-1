"use client";
/**
 * components/PixelFire.tsx — pixel fire (lib/pixel-fire.ts) on a small canvas scaled up with hard edges.
 * Decoration only. It runs only while on screen, and people who ask for reduced motion get one still frame.
 * `stoked`: scrolling the page makes the flames leap. Scrolling past the line sets off a burst: the fire surges over
 * the whole page and turns colour, taking the page's theme with it (--doom in app/globals.css).
 */
import { useEffect, useRef } from "react";
import { burstAt, coolingFor, newFire, nextTheme, paintEmbers, paintFire, stepFire, stoke, stokedCooling } from "@/lib/pixel-fire";

const FRAME_MS = 42;   // about 24 frames a second
const MAX_COLS = 640;  // wide screens get slightly bigger pixels, not more work
const BURSTING = "apex-pixelfire-burst";

export default function PixelFire({ cell = 8, className = "", stoked = false }: { cell?: number; className?: string; stoked?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let heat = newFire(1, 1), cols = 1, rows = 1, cooling = 1, zoom = 1, image: ImageData | null = null;
    let raf = 0, last = 0, visible = true, flare = 0, lastY = window.scrollY, clock = 0;
    let theme = 0, doom = 0, burstStart: number | null = null, burstFrom = 0;
    const page = canvas.closest<HTMLElement>(".apex");

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
    const wantedTheme = () => nextTheme(theme, window.scrollY, window.innerHeight, document.documentElement.scrollHeight - window.innerHeight);
    const setDoom = (next: number) => {
      if (next === doom) return;
      doom = next;
      page?.style.setProperty("--doom", String(doom));
    };
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!visible || now - last < FRAME_MS) return;
      last = now;
      // Heat climbs one row a step: two a frame looks like fire, and a third while stoked makes a flick of the wheel show.
      let steps = flare > 0.15 ? 3 : 2;
      if (stoked) {
        flare = stoke(flare, window.scrollY - lastY);
        lastY = window.scrollY;
        const wanted = wantedTheme();
        if (burstStart === null && wanted !== theme) {
          burstStart = now; burstFrom = theme; theme = wanted;
          canvas.classList.add(BURSTING);
        }
        let rage = 0;
        if (burstStart !== null) {
          const burst = burstAt((now - burstStart) / 1000);
          rage = burst.rage;
          steps = 8;
          setDoom(Math.round((burstFrom + (theme - burstFrom) * burst.turned) * 100) / 100);
          if (burst.done) { burstStart = null; canvas.classList.remove(BURSTING); }
        }
        cooling = stokedCooling(rows, flare, rage);
      }
      // The fire's clock runs per step, so a burst's extra steps speed up the whole fire, and it turns wild.
      for (let i = steps; i > 0; i--) stepFire(heat, cols, rows, cooling, Math.random, clock += 0.02, zoom);
      draw();
    };
    // With reduced motion there's no burst: the theme just changes, and the still frame repaints.
    const onScrollStill = () => {
      const wanted = wantedTheme();
      if (wanted === theme) return;
      theme = wanted;
      setDoom(theme);
      draw();
    };

    size();
    if (stoked) { theme = wantedTheme(); setDoom(theme); draw(); }   // arriving part way down the page: no burst
    if (stoked && still) window.addEventListener("scroll", onScrollStill, { passive: true });
    const resized = new ResizeObserver(size);
    resized.observe(canvas);
    const onScreen = new IntersectionObserver(([e]) => { visible = e.isIntersecting; });
    onScreen.observe(canvas);
    if (!still) raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); resized.disconnect(); onScreen.disconnect(); window.removeEventListener("scroll", onScrollStill); };
  }, [cell, stoked]);

  return <canvas ref={ref} aria-hidden className={`apex-pixelfire ${className}`} />;
}
