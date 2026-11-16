"use client";
/**
 * components/AsciiChips.tsx — ICs drifting across the page as ASCII (lib/ascii-chips), on a transparent
 * canvas. The caller positions it (`absolute inset-0` behind a section, `fixed inset-0` behind a page). Decoration only: it runs only while on screen, and people who
 * ask for reduced motion get one still frame. A click on the canvas scatters the chips near it.
 */
import { useEffect, useRef } from "react";
import { chips } from "@/lib/ascii-chips/chips";
import { AsciiEngine } from "@/lib/ascii-chips/engine";

interface Props {
  className?: string;
  /** How many chips, relative to the default for the canvas's size. */
  density?: number;
  /** Which way they drift, in degrees: 0 is right, 90 is up. */
  direction?: number;
  /** ASCII resolution: higher means smaller cells, so more of each chip's detail shows. */
  detail?: number;
  /** How big the chips are, relative to the default. */
  size?: number;
}

export default function AsciiChips({ className = "", density = 1, direction = 24, detail = chips.defaults.detail, size = chips.defaults.size }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const engine = new AsciiEngine(ref.current, chips, { density, direction, detail, size });
    return () => engine.destroy();
  }, [density, direction, detail, size]);

  return <canvas ref={ref} aria-hidden className={`w-full h-full font-mono ${className}`} />;
}
