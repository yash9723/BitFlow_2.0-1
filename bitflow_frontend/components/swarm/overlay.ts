/**
 * components/swarm/overlay.ts — DOM builders for the signal swarm: pixel-art cursors with their
 * terminal labels and pixel trails, and the per-block wire / drag box / W×H badge / caret.
 * Everything is created once and then only has attributes updated each frame (session.ts).
 */
import { pixel } from "@/lib/fonts";
import type { Job, TargetFrame } from "@/lib/swarm/plan";
import type { Pt } from "@/lib/swarm/motion";

/** Mostly phosphor greens, with cyan and amber like a terminal's other two colours. Indexed by SIGNALS index. */
export const COLORS = ["#00e87a", "#4db8ff", "#00ff88", "#ffb84d", "#5eead4", "#a3e635", "#38bdf8", "#86efac", "#facc15", "#2dd4bf"];
export const PIXEL_FONT = `${pixel.style.fontFamily}, monospace`;
export const SCRAMBLE = "0123456789ABCDEF#$%&*<>/|";
export const BG = "#07080a";
export const PHOSPHOR = "#00e87a";

const SVG_NS = "http://www.w3.org/2000/svg";

export function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, parent: Element) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  parent.appendChild(el);
  return el;
}

export function div(className: string, parent: Element): HTMLDivElement {
  const el = document.createElement("div");
  el.className = className;
  parent.appendChild(el);
  return el;
}

// ── pixel-art icons ───────────────────────────────────────────────────────

/*
 * Drawn at an integer 2× scale so every pixel stays a crisp 2×2 block.
 * o = dark outline, X = colour, anything else = transparent. Hotspot is the top-left (arrow)
 * or the centre (crosshair, I-beam).
 */
const ICONS: Record<"arrow" | "cross" | "beam", string[]> = {
  arrow: ["o", "oo", "oXo", "oXXo", "oXXXo", "oXXXXo", "oXXXXXo", "oXXXooo", "oXoXXo", "oo.oXXo", "....oo"],
  cross: ["...oXo...", "...oXo...", "...oXo...", "oooo.oooo", "XXX...XXX", "oooo.oooo", "...oXo...", "...oXo...", "...oXo..."],
  beam: ["oXXoXXo", "ooXXXoo", "..oXo..", "..oXo..", "..oXo..", "..oXo..", "..oXo..", "ooXXXoo", "oXXoXXo"],
};
export const PX = 2;
export const snap = (v: number) => Math.round(v / PX) * PX;

export function pixelIcon(kind: keyof typeof ICONS, color: string): string {
  const rows = ICONS[kind];
  const w = Math.max(...rows.map((r) => r.length));
  let rects = "";
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch === "o" || ch === "X") rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${ch === "X" ? color : BG}"/>`;
    }),
  );
  return `<svg class="i-${kind}" width="${w * PX}" height="${rows.length * PX}" viewBox="0 0 ${w} ${rows.length}" shape-rendering="crispEdges">${rects}</svg>`;
}

/** A square wave across the width, one period every 32px — the clock strip along the bottom. */
export function clockPath(x0: number, x1: number, y: number): string {
  const hi = y - 7;
  const lo = y + 7;
  let d = `M${x0} ${lo}`;
  for (let x = x0, high = false; x < x1; x += 16, high = !high) {
    const next = Math.min(x + 16, x1);
    d += ` L${x} ${high ? hi : lo} L${next} ${high ? hi : lo}`;
    if (next < x1) d += ` L${next} ${high ? lo : hi}`;
  }
  return d;
}

// ── cursors ───────────────────────────────────────────────────────────────

const TRAIL = 4; // fading pixels left behind each cursor

export interface CursorView {
  el: HTMLDivElement;
  trail: HTMLDivElement[];
  history: Pt[];
  text: HTMLElement;
  label: string;
  resolved: boolean;
  /** When (session ms) its label starts decrypting. */
  decryptAt: number;
  glitchUntil: number;
  /** Smoothed push away from the visitor's mouse. */
  ox: number;
  oy: number;
  /** Last drawn position (page coords), for the chase at the end. */
  x: number;
  y: number;
}

export function createCursor(parent: Element, label: string, color: string, decryptAt: number): CursorView {
  const trail = Array.from({ length: TRAIL }, () => {
    const px = div("bf-swarm-trail", parent);
    px.style.background = color;
    return px;
  });
  const el = div("bf-swarm-cursor", parent);
  el.style.setProperty("--c", color);
  el.style.opacity = "0";
  // label text goes in with textContent (below), never as HTML
  el.innerHTML = `${pixelIcon("arrow", color)}${pixelIcon("cross", color)}${pixelIcon("beam", color)}<span><b>&gt;</b><em></em><i>_</i></span>`;
  return {
    el,
    trail,
    history: [],
    text: el.querySelector("em") as HTMLElement,
    label,
    resolved: false,
    decryptAt,
    glitchUntil: 0,
    ox: 0,
    oy: 0,
    x: -100,
    y: -100,
  };
}

export function removeCursor(c: CursorView) {
  c.el.remove();
  c.trail.forEach((p) => p.remove());
}

/** Draws a cursor at (x, y) in `mode`, with its trail, label decrypt and the odd glitch. */
export function drawCursor(c: CursorView, x: number, y: number, mode: string, t: number, alpha: number) {
  x = snap(x);
  y = snap(y);
  c.x = x;
  c.y = y;
  c.el.dataset.mode = mode;
  c.el.style.transform = `translate(${x}px, ${y}px)`;
  c.el.style.opacity = `${alpha}`;

  // the label decrypts out of random characters as the cursor flies in
  if (!c.resolved) {
    const p = Math.min(1, Math.max(0, (t - c.decryptAt) / 650));
    if (p >= 1) {
      c.text.textContent = c.label;
      c.resolved = true;
    } else if (!c.text.textContent || Math.floor(t / 45) !== Math.floor((t - 16) / 45)) {
      const keep = Math.floor(p * c.label.length);
      let out = c.label.slice(0, keep);
      for (let k = keep; k < c.label.length; k++) out += c.label[k] === " " ? " " : SCRAMBLE[Math.floor(Math.random() * SCRAMBLE.length)];
      c.text.textContent = out;
    }
  }

  // a short trail of pixels, sampled on a coarse grid so it reads as dropped blocks
  const h = c.history;
  const gx = Math.round(x / 6) * 6;
  const gy = Math.round(y / 6) * 6;
  if (!h.length || h[0].x !== gx || h[0].y !== gy) {
    h.unshift({ x: gx, y: gy });
    if (h.length > TRAIL + 1) h.pop();
  }
  c.trail.forEach((px, k) => {
    const q = h[k + 1];
    if (!q || mode !== "move") {
      px.style.opacity = "0";
      return;
    }
    px.style.transform = `translate(${q.x}px, ${q.y}px)`;
    px.style.opacity = `${((0.55 * (TRAIL - k)) / TRAIL) * alpha}`;
  });

  // the odd glitch: a few frames of RGB split and jitter
  if (t > c.glitchUntil + 900 && Math.random() < 0.006) c.glitchUntil = t + 110;
  if (t < c.glitchUntil) c.el.dataset.glitch = "1";
  else delete c.el.dataset.glitch;
}

// ── per-block parts: wire, vias, drag box, W×H badge, caret ──────────────

export interface JobParts {
  job: Job;
  wire: SVGPolylineElement;
  vias: SVGRectElement[];
  box: SVGRectElement;
  badge: SVGGElement;
  badgeBg: SVGRectElement;
  badgeText: SVGTextElement;
  caret: SVGLineElement;
}

export function createJobParts(stage: SVGSVGElement, wires: SVGGElement, job: Job, color: string): JobParts {
  return {
    job,
    wire: svg("polyline", { stroke: color, "stroke-width": 2, opacity: 0 }, wires),
    vias: [0, 1].map(() => svg("rect", { width: 6, height: 6, fill: color, opacity: 0 }, wires)),
    box: svg("rect", { fill: `${color}0d`, stroke: color, "stroke-width": 1, "stroke-dasharray": "4 3", opacity: 0 }, stage),
    ...(() => {
      const badge = svg("g", { opacity: 0 }, stage);
      return { badge, badgeBg: svg("rect", { height: 16, fill: color }, badge), badgeText: svg("text", { fill: BG, y: 12.5, x: 5 }, badge) };
    })(),
    caret: svg("line", { stroke: color, "stroke-width": 2, opacity: 0 }, stage),
  };
}

export function removeJobParts(p: JobParts) {
  [p.wire, ...p.vias, p.box, p.badge, p.caret].forEach((el) => el.remove());
}

/** Drag box + badge + caret for one block this frame. `hide` = the block is already finished. */
export function drawJobParts(p: JobParts, tf: TargetFrame, t: number, hide: boolean) {
  if (tf.box && !hide) {
    const b = tf.box;
    p.box.setAttribute("x", `${b.x}`);
    p.box.setAttribute("y", `${b.y}`);
    p.box.setAttribute("width", `${Math.max(0, b.w)}`);
    p.box.setAttribute("height", `${Math.max(0, b.h)}`);
    p.box.setAttribute("opacity", "1");
    const label = `${Math.round(b.w)} × ${Math.round(b.h)}`;
    if (p.badgeText.textContent !== label) p.badgeText.textContent = label;
    const bw = label.length * 5.4 + 10;
    p.badgeBg.setAttribute("width", `${bw}`);
    // below-left of the dragging corner, clear of the cursor's own label
    p.badge.setAttribute("transform", `translate(${Math.max(4, b.x + b.w - bw - 6)} ${b.y + b.h + 6})`);
    p.badge.setAttribute("opacity", "1");
  } else {
    // fade the box out over the reveal, then hide it
    const fade = !hide && tf.kind === "place" && tf.reveal > 0 && tf.reveal < 1 ? `${1 - tf.reveal}` : "0";
    p.box.setAttribute("opacity", fade);
    p.badge.setAttribute("opacity", "0");
  }
  if (tf.caret !== null && !hide) {
    const j = p.job.target;
    const ch = Math.min(j.h, 34);
    const cy = j.y + j.h / 2;
    p.caret.setAttribute("x1", `${tf.caret}`);
    p.caret.setAttribute("x2", `${tf.caret}`);
    p.caret.setAttribute("y1", `${cy - ch / 2}`);
    p.caret.setAttribute("y2", `${cy + ch / 2}`);
    p.caret.setAttribute("opacity", Math.floor(t / 260) % 2 === 0 ? "1" : "0.35");
  } else p.caret.setAttribute("opacity", "0");
}

/** Draws the (partially traced) wire, with a square via at each bend already passed. */
export function drawWire(p: JobParts, w: { pts: Pt[]; alpha: number } | null) {
  if (!w) {
    p.wire.setAttribute("opacity", "0");
    p.vias.forEach((v) => v.setAttribute("opacity", "0"));
    return;
  }
  p.wire.setAttribute("points", w.pts.map((q) => `${q.x},${q.y}`).join(" "));
  p.wire.setAttribute("opacity", `${0.75 * w.alpha}`);
  p.vias.forEach((v, k) => {
    const q = w.pts[k + 1];
    if (!q || k + 1 >= w.pts.length - 1) {
      v.setAttribute("opacity", "0");
      return;
    }
    v.setAttribute("x", `${q.x - 3}`);
    v.setAttribute("y", `${q.y - 3}`);
    v.setAttribute("opacity", `${w.alpha}`);
  });
}

// ── styles ────────────────────────────────────────────────────────────────

export const OVERLAY_CSS = `
.bf-swarm{position:fixed;inset:0;z-index:60;pointer-events:none;overflow:hidden}
.bf-swarm-world{position:absolute;left:0;top:0;width:0;height:0;will-change:transform}
.bf-swarm-world svg.bf-swarm-stage{position:absolute;left:0;top:0;overflow:visible}
.bf-swarm-world text,.bf-swarm-hud{font-family:${PIXEL_FONT}}
.bf-swarm-world text{font-size:14px}
.bf-swarm-trail{position:absolute;left:0;top:0;width:4px;height:4px;opacity:0;will-change:transform}
.bf-swarm-cursor{position:absolute;left:0;top:0;will-change:transform;image-rendering:pixelated}
.bf-swarm-cursor svg{position:absolute;left:0;top:0}
.bf-swarm-cursor .i-cross{left:-9px;top:-9px}
.bf-swarm-cursor .i-beam{left:-7px;top:-9px}
.bf-swarm-cursor .i-cross,.bf-swarm-cursor .i-beam{display:none}
.bf-swarm-cursor[data-mode=drag] .i-arrow,.bf-swarm-cursor[data-mode=type] .i-arrow{display:none}
.bf-swarm-cursor[data-mode=drag] .i-cross{display:block}
.bf-swarm-cursor[data-mode=type] .i-beam{display:block}
/* pixel box: square-notched corners from four 2px edge shadows, a hard drop shadow, scanlines */
.bf-swarm-chip,.bf-swarm-cursor span{position:absolute;left:16px;top:24px;white-space:nowrap;padding:1px 6px 0;
  font-family:${PIXEL_FONT};font-size:16px;line-height:16px;letter-spacing:.5px;color:var(--c);
  background:${BG} repeating-linear-gradient(0deg,transparent 0 2px,rgba(255,255,255,.045) 2px 4px);
  box-shadow:0 -2px 0 0 var(--c),0 2px 0 0 var(--c),-2px 0 0 0 var(--c),2px 0 0 0 var(--c),5px 5px 0 0 rgba(0,0,0,.65)}
.bf-swarm-cursor span em{font-style:normal}
.bf-swarm-chip b,.bf-swarm-cursor span b{opacity:.5;margin-right:4px;font-weight:400}
.bf-swarm-cursor span i{font-style:normal;animation:bf-swarm-blink 1s steps(1) infinite}
.bf-swarm-cursor[data-glitch] span{transform:translate(2px,-2px);text-shadow:-2px 0 0 #ff2e63,2px 0 0 #08f7fe}
.bf-swarm-cursor[data-glitch] svg{transform:translateX(-2px)}
.bf-swarm-you{position:absolute;left:0;top:0;opacity:0;will-change:transform}
.bf-swarm-you .bf-swarm-chip{--c:#e8eaf6;left:14px;top:20px}
.bf-swarm-burst{position:absolute;left:0;top:0;width:6px;height:6px;will-change:transform}
.bf-swarm-dissolve{position:absolute;image-rendering:pixelated}
.bf-swarm-crt{position:absolute;inset:0;transition:opacity .3s steps(4);
  background:repeating-linear-gradient(0deg,rgba(0,0,0,.22) 0 1px,transparent 1px 3px),
  radial-gradient(ellipse at center,transparent 55%,rgba(0,0,0,.55) 100%)}
.bf-swarm-boot{position:absolute;left:50%;top:42%;min-width:min(420px,calc(100vw - 32px));transform:translate(-50%,-50%);
  padding:14px 18px 12px;color:${PHOSPHOR};font-size:20px;line-height:22px;white-space:pre;
  background:${BG};box-shadow:0 -2px 0 0 ${PHOSPHOR},0 2px 0 0 ${PHOSPHOR},-2px 0 0 0 ${PHOSPHOR},2px 0 0 0 ${PHOSPHOR},0 0 40px -6px rgba(0,232,122,.45);
  text-shadow:0 0 6px rgba(0,232,122,.6)}
.bf-swarm-boot b{font-weight:400;color:${BG};background:${PHOSPHOR}}
.bf-swarm-status{position:absolute;left:50%;top:50%;transform:translate(-50%,calc(-50% + 132px));opacity:0;white-space:nowrap;
  padding:4px 12px 2px;font-size:22px;line-height:22px;color:${BG};background:${PHOSPHOR};
  box-shadow:0 0 30px -4px rgba(0,232,122,.7),5px 5px 0 0 rgba(0,0,0,.65)}
.bf-swarm-flash{position:absolute;inset:0;background:#e8eaf6;opacity:0}
@keyframes bf-swarm-blink{50%{opacity:0}}
@media (max-width:640px){.bf-swarm-boot{font-size:16px;line-height:18px}.bf-swarm-status{font-size:17px}}
`;
