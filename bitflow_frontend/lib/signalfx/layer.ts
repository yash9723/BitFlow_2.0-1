/**
 * lib/signalfx/layer.ts — the one canvas the signal effects draw on. Fixed over the page, under
 * modals and under the solve celebration (PixelBurst), aria-hidden, ignores the pointer. One
 * requestAnimationFrame loop that stops when nothing is playing. Loaded on first use only.
 */
import { setWordFont, type Fx, type Pt } from "./effects";

const Z = 55;   // above page content and the sticky header, below modals (z-60+) and PixelBurst
let canvas: HTMLCanvasElement | null = null, ctx: CanvasRenderingContext2D | null = null;
const live: Fx[] = [];
let raf = 0, last = 0;

function ensure() {
  if (canvas) return;
  canvas = Object.assign(document.createElement("canvas"), { className: "signal-fx" });
  canvas.setAttribute("aria-hidden", "true");
  Object.assign(canvas.style, { position: "fixed", inset: "0", width: "100vw", height: "100vh", pointerEvents: "none", zIndex: String(Z) });
  document.body.appendChild(canvas);
  ctx = canvas.getContext("2d");
  // The site's pixel font under its generated next/font name (see effects.ts setWordFont).
  const probe = Object.assign(document.createElement("span"), { className: "font-pixel", hidden: true });
  document.body.appendChild(probe); setWordFont(getComputedStyle(probe).fontFamily); probe.remove();
  const size = () => { const d = Math.min(2, devicePixelRatio || 1); canvas!.width = innerWidth * d; canvas!.height = innerHeight * d; ctx!.setTransform(d, 0, 0, d, 0, 0); };
  size(); addEventListener("resize", size);
}

function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  ctx!.clearRect(0, 0, innerWidth, innerHeight);
  for (let i = live.length - 1; i >= 0; i--) {
    const f = live[i]; f.step(dt);
    ctx!.save(); f.draw(ctx!); ctx!.restore();
    if (!f.alive) live.splice(i, 1);
  }
  raf = live.length ? requestAnimationFrame(frame) : 0;
  if (!raf) ctx!.clearRect(0, 0, innerWidth, innerHeight);
}

/** Play effects. No-op with reduced motion. */
export function play(...fx: Fx[]) {
  if (typeof window === "undefined" || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  ensure();
  live.push(...fx);
  if (live.length > 60) live.splice(0, live.length - 60);
  if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
}

/** A point on an element in viewport coordinates; fx, fy are 0..1 across it. */
export function at(el: Element, fx = 0.5, fy = 0.5): Pt {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width * fx, y: r.top + r.height * fy };
}

/** Add a CSS class for a moment (glitch, press). Restarts if already running. */
export function flash(el: Element | null, cls: string, ms = 220) {
  if (!el || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  el.classList.remove(cls); void (el as HTMLElement).offsetWidth; el.classList.add(cls);
  setTimeout(() => el.classList.remove(cls), ms);
}
