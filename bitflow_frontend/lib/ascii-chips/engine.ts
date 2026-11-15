/**
 * lib/ascii-chips/engine.ts — wires a Flock + AsciiRenderer to a canvas: fixed-timestep loop, resize,
 * click-to-scatter, pausing off-screen, and one still frame for prefers-reduced-motion.
 * Ported from ascii-animals (MIT, see LICENSE.ascii-animals.txt). Mounted by components/AsciiChips.tsx.
 */
import { Flock, type Animal, type Tuning } from "./flock";
import { AsciiRenderer } from "./renderer";

const STEP = 1 / 60;
const MAX_STEPS = 4;

export class AsciiEngine {
  private flock: Flock<any>;
  private renderer: AsciiRenderer;
  private raf = 0;
  private last = 0;
  private acc = 0;
  private visible = true;
  private reducedMotion: MediaQueryList;
  private resizeObserver: ResizeObserver;
  private intersectionObserver: IntersectionObserver;
  private disposed = false;

  /** tuning overrides any of the animal's defaults. */
  constructor(private canvas: HTMLCanvasElement, animal: Animal<any>, tuning: Partial<Tuning> = {}) {
    const knobs = { ...animal.defaults, ...tuning } as Tuning;
    this.flock = new Flock(animal, knobs);
    this.renderer = new AsciiRenderer(canvas, knobs, animal.trail);
    this.renderer.setFontFamily(getComputedStyle(canvas).fontFamily);
    this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.intersectionObserver = new IntersectionObserver(([entry]) => {
      this.visible = entry.isIntersecting;
      this.schedule();
    });
    this.intersectionObserver.observe(canvas);

    this.reducedMotion.addEventListener("change", this.schedule);
    document.addEventListener("visibilitychange", this.schedule);
    window.addEventListener("pointerdown", this.onPointerDown, { passive: true });

    this.resize();
    // Canvas text can't trigger a webfont load; once the mono face is in, redraw the still frame.
    document.fonts?.load(`600 16px ${getComputedStyle(canvas).fontFamily}`).then(() => {
      if (!this.disposed && this.reducedMotion.matches) this.drawStill();
    });
    this.schedule();
  }

  destroy() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    this.intersectionObserver.disconnect();
    this.reducedMotion.removeEventListener("change", this.schedule);
    document.removeEventListener("visibilitychange", this.schedule);
    window.removeEventListener("pointerdown", this.onPointerDown);
  }

  private resize() {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.resize(rect.width, rect.height, dpr);
    this.flock.resize(rect.width, rect.height);
    if (this.reducedMotion.matches) this.drawStill();
  }

  /** (Re)start the loop if it should be running; with reduced motion, show one frame instead. */
  private schedule = () => {
    cancelAnimationFrame(this.raf);
    if (this.disposed) return;
    if (this.reducedMotion.matches) return this.drawStill();
    if (!this.visible || document.hidden) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  };

  private frame = (now: number) => {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.acc += dt;
    let steps = 0;
    while (this.acc >= STEP && steps < MAX_STEPS) {
      this.flock.step(STEP);
      this.acc -= STEP;
      steps++;
    }
    if (steps === MAX_STEPS) this.acc = 0;
    this.renderer.render(this.flock, dt);
    this.raf = requestAnimationFrame(this.frame);
  };

  /** Reduced motion: let the flock spread out, then show a single frame. */
  private drawStill() {
    if (this.flock.width === 0) return;
    if (this.flock.time < 4) for (let i = 0; i < 240; i++) this.flock.step(STEP);
    this.renderer.render(this.flock, STEP);
  }

  private onPointerDown = (e: PointerEvent) => {
    // Only clicks that land on the canvas itself, not on anything above it.
    if (this.reducedMotion.matches || e.target !== this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    this.flock.startle(e.clientX - rect.left, e.clientY - rect.top);
  };
}
