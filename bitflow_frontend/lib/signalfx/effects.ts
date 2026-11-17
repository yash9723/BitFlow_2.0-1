/**
 * lib/signalfx/effects.ts — BitFlow's reactive effects, drawn on one canvas over the page
 * (lib/signalfx/layer.ts). Idea after sakuga-vfx (MIT, finktheartist): controls that react with
 * drawn effects. Ours are circuits, not anime: scope pulses, solder sparks, PCB traces, bits and
 * pixel-font words. Pure models: each effect steps in seconds and draws itself, so
 * scripts/signalfx.check.ts can run them without a browser.
 */

export interface Pt { x: number; y: number }
export interface Fx { step(dt: number): void; draw(ctx: CanvasRenderingContext2D): void; readonly alive: boolean }

export const PHOSPHOR = "#00e87a", GLOW = "#00ff88", DANGER = "#ff4f4f", GOLD = "#ffb84d";
const easeOut = (t: number) => 1 - (1 - t) ** 3;

/** A small seeded random, so tests are repeatable. */
export function rng(seed = 1) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }

/** Base for effects with a fixed life. */
function timed(life: number, draw: (ctx: CanvasRenderingContext2D, k: number) => void): Fx {
  let t = 0;
  return { step(dt) { t += dt; }, draw(ctx) { if (t < life) draw(ctx, Math.min(1, t / life)); }, get alive() { return t < life; } };
}

/** An oscilloscope ring that expands and fades. */
export const pulse = (at: Pt, color = PHOSPHOR, radius = 36, life = 0.45): Fx =>
  timed(life, (ctx, k) => {
    ctx.strokeStyle = color; ctx.globalAlpha = 1 - k; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(at.x, at.y, 6 + easeOut(k) * radius, 0, Math.PI * 2); ctx.stroke();
  });

/** Solder sparks: short streaks thrown out, falling a little. */
export function sparks(at: Pt, color = GLOW, n = 12, seed = 7, life = 0.55): Fx {
  const r = rng(seed);
  const ps = Array.from({ length: n }, () => { const a = r() * Math.PI * 2, v = 120 + r() * 220; return { x: at.x, y: at.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v }; });
  let t = 0;
  return {
    step(dt) { t += dt; for (const p of ps) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 380 * dt; p.vx *= 0.96; } },
    draw(ctx) {
      if (t >= life) return;
      ctx.strokeStyle = color; ctx.globalAlpha = 1 - t / life; ctx.lineWidth = 1.5; ctx.beginPath();
      for (const p of ps) { ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03); }
      ctx.stroke();
    },
    get alive() { return t < life; },
  };
}

/** The L-shaped route a PCB trace takes from a to b: across, then up or down. */
export const route = (a: Pt, b: Pt): Pt[] => [a, { x: b.x, y: a.y }, b];

/** The point a fraction k (0..1) along a polyline. */
export function along(path: Pt[], k: number): Pt {
  const segs = path.slice(1).map((p, i) => Math.hypot(p.x - path[i].x, p.y - path[i].y));
  let d = Math.max(0, Math.min(1, k)) * segs.reduce((s, x) => s + x, 0);
  for (let i = 0; i < segs.length; i++) {
    if (d <= segs[i] || i === segs.length - 1) {
      const f = segs[i] ? Math.min(1, d / segs[i]) : 1;
      return { x: path[i].x + (path[i + 1].x - path[i].x) * f, y: path[i].y + (path[i + 1].y - path[i].y) * f };
    }
    d -= segs[i];
  }
  return path[path.length - 1];
}

/** A PCB trace from a to b with bits running along it; `onArrive` fires once when they land. */
export function trace(a: Pt, b: Pt, bits = 6, life = 0.9, onArrive?: () => void): Fx {
  const path = route(a, b), travel = life * 0.75;
  let t = 0, arrived = false;
  return {
    step(dt) { t += dt; if (!arrived && t >= travel) { arrived = true; onArrive?.(); } },
    draw(ctx) {
      if (t >= life) return;
      const k = Math.min(1, t / travel), fade = t > travel ? 1 - (t - travel) / (life - travel) : 1;
      ctx.globalAlpha = 0.5 * fade; ctx.strokeStyle = PHOSPHOR; ctx.lineWidth = 1.5; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(path[0].x, path[0].y); for (const p of path.slice(1)) ctx.lineTo(p.x, p.y); ctx.stroke(); ctx.setLineDash([]);
      ctx.globalAlpha = fade; ctx.fillStyle = GLOW; ctx.font = "12px monospace";
      for (let i = 0; i < bits; i++) { const p = along(path, k - i * 0.06); ctx.fillText(i % 2 ? "1" : "0", p.x - 3, p.y + 4); }
    },
    get alive() { return t < life; },
  };
}

/** A starburst of spokes. */
export const burst = (at: Pt, color = PHOSPHOR, spokes = 10, life = 0.4): Fx =>
  timed(life, (ctx, k) => {
    ctx.strokeStyle = color; ctx.globalAlpha = 1 - k; ctx.lineWidth = 2; ctx.beginPath();
    for (let i = 0; i < spokes; i++) {
      const a = (i / spokes) * Math.PI * 2, r0 = 10 + easeOut(k) * 18, r1 = r0 + 10 * (1 - k) + 4;
      ctx.moveTo(at.x + Math.cos(a) * r0, at.y + Math.sin(a) * r0); ctx.lineTo(at.x + Math.cos(a) * r1, at.y + Math.sin(a) * r1);
    }
    ctx.stroke();
  });

/** A four-point glint. */
export const kira = (at: Pt, life = 0.5): Fx =>
  timed(life, (ctx, k) => {
    const s = Math.sin(k * Math.PI) * 9;
    ctx.fillStyle = "#e8ffef"; ctx.globalAlpha = 1 - k * 0.3; ctx.beginPath();
    ctx.moveTo(at.x, at.y - s); ctx.lineTo(at.x + s * 0.25, at.y); ctx.lineTo(at.x, at.y + s); ctx.lineTo(at.x - s * 0.25, at.y); ctx.closePath();
    ctx.moveTo(at.x - s, at.y); ctx.lineTo(at.x, at.y + s * 0.25); ctx.lineTo(at.x + s, at.y); ctx.lineTo(at.x, at.y - s * 0.25); ctx.closePath();
    ctx.fill();
  });

/** Font size for a word: big for short words, clamped to 14..base. */
export const wordSize = (text: string, base = 34) => Math.max(14, Math.min(base, Math.round((base * 4) / Math.max(4, text.length))));

/** A "sound-effect" word in the pixel font: pops in with overshoot, drifts up, fades. */
export function word(text: string, at: Pt, color = PHOSPHOR, base = 34, life = 0.8): Fx {
  const size = wordSize(text, base);
  return timed(life, (ctx, k) => {
    const pop = k < 0.2 ? 0.6 + (k / 0.2) * 0.55 : 1.15 - Math.min(0.15, (k - 0.2) * 0.6);
    ctx.save(); ctx.translate(at.x, at.y - k * 18); ctx.scale(pop, pop);
    ctx.globalAlpha = k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1;
    ctx.font = `${size}px "Jersey 10", monospace`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.lineWidth = 4; ctx.strokeStyle = "#07080a"; ctx.strokeText(text, 0, 0);
    ctx.shadowColor = color; ctx.shadowBlur = 10; ctx.fillStyle = color; ctx.fillText(text, 0, 0);
    ctx.restore();
  });
}

/** 0s and 1s sprayed upward. */
export function bitSpray(at: Pt, n = 10, seed = 3, life = 0.7): Fx {
  const r = rng(seed);
  const ps = Array.from({ length: n }, (_, i) => ({ x: at.x, y: at.y, vx: (r() - 0.5) * 160, vy: -120 - r() * 160, c: i % 2 ? "1" : "0" }));
  let t = 0;
  return {
    step(dt) { t += dt; for (const p of ps) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 260 * dt; } },
    draw(ctx) { if (t >= life) return; ctx.globalAlpha = 1 - t / life; ctx.fillStyle = GLOW; ctx.font = "13px monospace"; for (const p of ps) ctx.fillText(p.c, p.x, p.y); },
    get alive() { return t < life; },
  };
}

/** A clock square wave sweeping across a box while something runs. */
export const clockSweep = (box: { x: number; y: number; w: number; h: number }, life = 0.7): Fx =>
  timed(life, (ctx, k) => {
    const mid = box.y + box.h / 2, amp = box.h * 0.22, half = 6, x1 = box.x + box.w * k;
    ctx.strokeStyle = GLOW; ctx.globalAlpha = 0.55 * (1 - k * 0.5); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(box.x, mid + amp);
    for (let x = box.x, i = 0; x < x1; x += half, i++) { const y = i % 2 ? mid + amp : mid - amp; ctx.lineTo(x, y); ctx.lineTo(Math.min(x1, x + half), y); }
    ctx.stroke();
  });

/** `bitflow:xp` detail: a plain number (old form) or { total, from }. */
export function parseXpDetail(d: unknown): { total: number | null; from: Pt | null } {
  if (typeof d === "number") return { total: d, from: null };
  if (d && typeof d === "object") {
    const o = d as { total?: unknown; from?: { x?: unknown; y?: unknown } };
    const from = o.from && typeof o.from.x === "number" && typeof o.from.y === "number" ? { x: o.from.x, y: o.from.y } : null;
    return { total: typeof o.total === "number" ? o.total : null, from };
  }
  return { total: null, from: null };
}
