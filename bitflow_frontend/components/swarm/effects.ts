/**
 * components/swarm/effects.ts — the signal swarm's one-off effects: pixel-dissolve reveals,
 * headline decrypt, click bursts and the boot terminal.
 */
import { bootFrame } from "@/lib/swarm/boot";
import { dissolveOrder, hashSeed } from "@/lib/swarm/plan";
import { BG, div, snap } from "./overlay";

// ── pixel dissolve ────────────────────────────────────────────────────────

const CELL = 8;

/**
 * A canvas over a block, one canvas pixel per 8px cell (scaled up with image-rendering:
 * pixelated), filled with the page background. Cells clear in a shuffled, downward-drifting
 * order, each flashing phosphor for a frame as it goes.
 */
export class Dissolve {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private order: number[];
  private cols: number;
  private cleared = 0;
  private flashed: number[] = [];

  constructor(parent: Element, r: { x: number; y: number; w: number; h: number }, id: string) {
    this.cols = Math.max(1, Math.ceil(r.w / CELL));
    const rows = Math.max(1, Math.ceil(r.h / CELL));
    this.order = dissolveOrder(this.cols, rows, hashSeed(id));
    this.canvas = document.createElement("canvas");
    this.canvas.className = "bf-swarm-dissolve";
    this.canvas.width = this.cols;
    this.canvas.height = rows;
    Object.assign(this.canvas.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${this.cols * CELL}px`, height: `${rows * CELL}px` });
    this.ctx = this.canvas.getContext("2d");
    if (this.ctx) {
      this.ctx.fillStyle = BG;
      this.ctx.fillRect(0, 0, this.cols, rows);
    }
    parent.appendChild(this.canvas);
  }

  /** `r` is 0–1 revealed. */
  step(r: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    for (const i of this.flashed) ctx.clearRect(i % this.cols, Math.floor(i / this.cols), 1, 1);
    this.flashed = [];
    const upto = Math.floor(Math.min(1, r) * this.order.length);
    ctx.fillStyle = "rgba(0,232,122,.75)";
    for (let k = this.cleared; k < upto; k++) {
      const i = this.order[k];
      ctx.fillRect(i % this.cols, Math.floor(i / this.cols), 1, 1);
      this.flashed.push(i);
    }
    this.cleared = upto;
  }

  remove() {
    this.canvas.remove();
  }
}

// ── headline decrypt ──────────────────────────────────────────────────────

/** Uppercase/digit glyphs of similar width, so the scrambled line keeps roughly its length. */
const GLYPHS = "0123456789ABCDEFHKNRSXZ#$%";

/**
 * Swaps an element's text for random glyphs that resolve left to right. Its size is pinned
 * (and wrapping turned off) while it runs so nothing around it moves; `restore()` puts the real
 * text back exactly.
 */
export class Decrypt {
  private nodes: { node: Text; text: string }[] = [];
  private total = 0;
  private last = -1;
  private tick = -1;

  constructor(private el: HTMLElement) {
    const r = el.getBoundingClientRect();
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const node = n as Text;
      if (node.data.trim()) {
        this.nodes.push({ node, text: node.data });
        this.total += node.data.length;
      }
    }
    Object.assign(el.style, { width: `${r.width}px`, height: `${r.height}px`, whiteSpace: "nowrap" });
  }

  step(r: number, t: number) {
    const resolved = Math.floor(Math.min(1, r) * this.total);
    const tick = Math.floor(t / 45);
    if (resolved === this.last && tick === this.tick) return;
    this.last = resolved;
    this.tick = tick;
    let seen = 0;
    for (const { node, text } of this.nodes) {
      let out = "";
      for (let i = 0; i < text.length; i++, seen++) {
        const ch = text[i];
        out += seen < resolved || /\s/.test(ch) ? ch : GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
      }
      if (node.data !== out) node.data = out;
    }
  }

  restore() {
    for (const { node, text } of this.nodes) node.data = text;
    this.el.style.removeProperty("width");
    this.el.style.removeProperty("height");
    this.el.style.removeProperty("white-space");
  }
}

// ── click bursts ──────────────────────────────────────────────────────────

const BURST_MS = 450;

export interface Particle {
  el: HTMLDivElement;
  x: number;
  y: number;
  vx: number;
  vy: number;
  born: number;
}

/** About ten pixel squares flying out of (x, y). */
export function spawnBurst(parent: Element, x: number, y: number, color: string, t: number): Particle[] {
  return Array.from({ length: 10 }, (_, i) => {
    const a = (i / 10) * Math.PI * 2 + Math.random() * 0.5;
    const v = 0.18 + Math.random() * 0.22;
    const el = div("bf-swarm-burst", parent);
    el.style.background = i % 3 === 0 ? "#e8eaf6" : color;
    return { el, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, born: t };
  });
}

/** Moves the particles on; returns the ones still alive. */
export function drawParticles(list: Particle[], t: number): Particle[] {
  return list.filter((p) => {
    const dt = t - p.born;
    if (dt >= BURST_MS) {
      p.el.remove();
      return false;
    }
    const x = snap(p.x + p.vx * dt);
    const y = snap(p.y + p.vy * dt + 0.0004 * dt * dt);
    p.el.style.transform = `translate(${x - 3}px, ${y - 3}px)`;
    p.el.style.opacity = `${Math.ceil((1 - dt / BURST_MS) * 4) / 4}`; // stepped fade
    return true;
  });
}

// ── boot terminal ─────────────────────────────────────────────────────────

/** The BIOS-style box that types itself out, then collapses like a CRT switching off. */
export function createBoot(hud: Element) {
  const el = div("bf-swarm-boot", hud);
  const text = document.createTextNode("");
  const caret = document.createElement("b");
  caret.textContent = " ";
  el.append(text, caret);
  return {
    /** Returns true once the boot is over (and the box removed). */
    draw(t: number): boolean {
      const f = bootFrame(t);
      if (f.done) {
        el.remove();
        return true;
      }
      const s = f.lines.join("\n");
      if (text.data !== s) text.data = s;
      caret.style.visibility = f.caret ? "visible" : "hidden";
      const c = f.collapse;
      const sy = c < 0.6 ? 1 - (c / 0.6) * 0.98 : 0.02;
      const sx = c < 0.6 ? 1 : Math.max(0, 1 - (c - 0.6) / 0.4);
      el.style.transform = `translate(-50%, -50%) scale(${sx}, ${sy})`;
      el.style.filter = c > 0 ? `brightness(${1 + c * 2})` : "";
      return false;
    },
    remove() {
      el.remove();
    },
  };
}

