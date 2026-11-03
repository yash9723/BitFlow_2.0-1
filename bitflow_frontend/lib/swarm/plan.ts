/**
 * lib/swarm/plan.ts — the landing-page "signal swarm" as a pure timeline (no DOM).
 *
 * Each page block above the fold is a target. Signal cursors (clk, rst_n, data[7:0], …) take
 * targets top-down: fly to the nearest block already built, route a Manhattan wire from it like
 * a place-and-route trace, then either drag out the block's bounding box ("place") or type it in
 * left to right ("type"). `buildTimeline` schedules everything once; `sample` turns any moment
 * into what to draw, so the renderer just samples it each animation frame.
 *
 * Coordinates are whatever the caller uses (the renderer uses page coordinates); `view` says
 * which rectangle of that space is on screen, for where cursors fly in from and gather.
 * One timeline is the opening build ("latch" finale); scrolling adds short "exit" batches.
 */
import { type Pt, clamp, dist, easeInOutCubic, easeOutCubic, partialPath, pathLength, pointAt, travelTime } from "./motion";

export type Kind = "place" | "type";

export interface Target {
  id: string;
  kind: Kind;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Cursor labels: BitFlow's own toolchain and terminal, from the shell prompt to the bitstream.
 * The first one leads. Plain text only (they are rendered with textContent).
 */
export const SIGNALS = [
  "root@bitflow:~#",
  "0xB17F10",
  "bitzy.exe",
  "iverilog -g2012",
  "always @(posedge clk)",
  "yosys synth_ice40",
  "$dumpvars",
  "sudo make bitstream",
  "/dev/ttyUSB0",
  "xp += 100",
];

type Mode = "move" | "wire" | "drag" | "type";

interface Segment {
  t0: number;
  t1: number;
  mode: Mode;
  path: Pt[];
}

export interface Job {
  target: Target;
  cursor: number;
  /** Wire from an already-built block to this one's start point, or null for the first block. */
  wire: Pt[] | null;
  wireStart: number;
  /** When the cursor starts dragging / typing, and when it lets go. */
  buildStart: number;
  buildEnd: number;
  /** When the block is fully visible. */
  done: number;
}

export interface Timeline {
  jobs: Job[];
  /** `signal` is the index into SIGNALS (and the renderer's colours). */
  cursors: { label: string; signal: number; segments: Segment[] }[];
  finale: Finale;
  /** All blocks built; the swarm then converges on `latchAt`. */
  builtAt: number;
  latchPoint: Pt;
  latchAt: number;
  end: number;
}

export type Finale = "latch" | "exit";

export interface View {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TimelineOptions {
  /** How many cursors (capped at SIGNALS.length). */
  cursors?: number;
  /** First SIGNALS index to use, so later batches get different labels. */
  labelOffset?: number;
  /** Every time in the timeline is shifted by this many ms. */
  start?: number;
  /** "latch": gather in the middle of the view and flash. "exit": fly back out after the last block. */
  finale?: Finale;
  /** > 1 is faster. */
  speed?: number;
  /** The on-screen rectangle in the targets' coordinates. Defaults to (0, 0, vw, vh). */
  view?: View;
}

/** Small seeded PRNG so the swarm wanders the same way every run (and in tests). */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const REVEAL_MS = 260;
/** A wire may leave a block once its box is this far through being dragged out. */
export const WIRE_AFTER = 0.6;
const CONVERGE_MS = 520;
/** Radius of the ring the cursors gather on before the latch. */
export const LATCH_RING = 30;
const LATCH_MS = 380;

/** A Manhattan wire from a to b: vertical-first when b is below a, otherwise horizontal-first. */
export function routeWire(a: Pt, b: Pt): Pt[] {
  if (a.x === b.x || a.y === b.y) return [a, b];
  if (b.y > a.y) {
    const midY = Math.round((a.y + b.y) / 2);
    return [a, { x: a.x, y: midY }, { x: b.x, y: midY }, b];
  }
  const midX = Math.round((a.x + b.x) / 2);
  return [a, { x: midX, y: a.y }, { x: midX, y: b.y }, b];
}

/** Where a block's wire leaves from: its bottom edge if the next block is below, else its right edge. */
function pinFor(src: Target, dst: Target): Pt {
  if (dst.y >= src.y + src.h) return { x: Math.round(src.x + Math.min(24, src.w / 2)), y: src.y + src.h };
  return { x: src.x + src.w, y: Math.round(src.y + Math.min(14, src.h / 2)) };
}

const startPoint = (t: Target): Pt => (t.kind === "type" ? { x: t.x, y: Math.round(t.y + t.h / 2) } : { x: t.x, y: t.y });

export function buildDuration(t: Target): number {
  if (t.kind === "type") return clamp(Math.round(t.w / 9) * 12, 200, 650);
  return clamp(220 + Math.hypot(t.w, t.h) * 0.3, 260, 520);
}

/** Order targets reading-style: top to bottom, rows of roughly the same top left to right. */
export function orderTargets(targets: Target[]): Target[] {
  return targets.slice().sort((a, b) => (Math.abs(a.y - b.y) > 12 ? a.y - b.y : a.x - b.x));
}

/** Points just outside the view, spread around it, where the cursors fly in from (and exit to). */
export function entryPoints(n: number, v: View): Pt[] {
  const out: Pt[] = [{ x: v.x - 24, y: v.y - 24 }]; // the lead comes in from the top-left, where the first block starts
  for (let i = 1; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + 0.4;
    // the direction, stretched until it reaches a rectangle 40px outside the view
    const rx = v.w / 2 + 40;
    const ry = v.h / 2 + 40;
    const k = 1 / Math.max(Math.abs(Math.cos(a)) / rx, Math.abs(Math.sin(a)) / ry);
    out.push({ x: Math.round(v.x + v.w / 2 + Math.cos(a) * k), y: Math.round(v.y + v.h / 2 + Math.sin(a) * k) });
  }
  return out;
}

/**
 * The order cells of a cols × rows grid clear in for the pixel-dissolve reveal: shuffled, with a
 * `sweep` (0–1) bias so it also drifts top to bottom. Deterministic for a given seed.
 */
export function dissolveOrder(cols: number, rows: number, seed: number, sweep = 0.45): number[] {
  const rand = mulberry32(seed);
  const keyed = Array.from({ length: cols * rows }, (_, i) => {
    const row = Math.floor(i / cols);
    return { i, k: (rows > 1 ? row / (rows - 1) : 0) * sweep + rand() * (1 - sweep) };
  });
  return keyed.sort((a, b) => a.k - b.k).map((c) => c.i);
}

/** A stable small number from a string, for per-block seeds. */
export function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function buildTimeline(input: Target[], vw: number, vh: number, options: TimelineOptions | number = {}): Timeline {
  const opts: TimelineOptions = typeof options === "number" ? { cursors: options } : options;
  const speed = opts.speed ?? 1;
  const finale: Finale = opts.finale ?? "latch";
  const view: View = opts.view ?? { x: 0, y: 0, w: vw, h: vh };
  const offset = opts.labelOffset ?? 0;
  const fly = (d: number) => travelTime(d) / speed;

  const targets = orderTargets(input);
  const n = Math.max(1, Math.min(opts.cursors ?? SIGNALS.length, SIGNALS.length));
  const entries = entryPoints(n, view);
  const pos = entries.slice();
  const free = new Array(n).fill(0);
  const cursors = Array.from({ length: n }, (_, i) => {
    const signal = (i + offset) % SIGNALS.length;
    return { label: SIGNALS[signal], signal, segments: [] as Segment[] };
  });
  const jobs: Job[] = [];

  const push = (c: number, seg: Segment) => {
    if (seg.t1 > seg.t0) cursors[c].segments.push(seg);
  };

  targets.forEach((t, i) => {
    const start = startPoint(t);
    // the nearest block already scheduled, measured from its wire pin to this block's start point
    let src: Job | null = null;
    let best = Infinity;
    for (const j of jobs) {
      const d = dist(pinFor(j.target, t), start);
      if (d < best) {
        best = d;
        src = j;
      }
    }
    const wire = src ? routeWire(pinFor(src.target, t), start) : null;
    const goal = wire ? wire[0] : start;

    // the cursor that can get there soonest; the first block uses cursor 0 so `clk` leads
    let c = 0;
    if (i > 0) {
      let soonest = Infinity;
      for (let k = 0; k < n; k++) {
        const arrive = free[k] + fly(dist(pos[k], goal));
        if (arrive < soonest) {
          soonest = arrive;
          c = k;
        }
      }
    }

    const flight = fly(dist(pos[c], goal));
    push(c, { t0: free[c], t1: free[c] + flight, mode: "move", path: [pos[c], goal] });
    let now = free[c] + flight;

    let wireStart = now;
    if (wire && src) {
      // wait at the pin until the source block is mostly drawn out
      wireStart = Math.max(now, src.buildStart + WIRE_AFTER * (src.buildEnd - src.buildStart));
      push(c, { t0: now, t1: wireStart, mode: "move", path: [goal, goal] });
      const trace = clamp(pathLength(wire) / 1.8, 140, 420) / speed;
      push(c, { t0: wireStart, t1: wireStart + trace, mode: "wire", path: wire });
      now = wireStart + trace;
    }

    const buildStart = now;
    const buildEnd = buildStart + buildDuration(t) / speed;
    const end: Pt = t.kind === "type" ? { x: t.x + t.w, y: start.y } : { x: t.x + t.w, y: t.y + t.h };
    push(c, { t0: buildStart, t1: buildEnd, mode: t.kind === "type" ? "type" : "drag", path: [start, end] });

    jobs.push({
      target: t,
      cursor: c,
      wire,
      wireStart,
      buildStart,
      buildEnd,
      done: t.kind === "type" ? buildEnd : buildEnd + REVEAL_MS,
    });
    free[c] = buildEnd + 40;
    pos[c] = end;
  });

  const builtAt = Math.max(0, ...jobs.map((j) => j.done));
  const latchPoint = { x: Math.round(view.x + view.w / 2), y: Math.round(view.y + view.h / 2) };

  if (finale === "exit") {
    // each cursor leaves the way it came as soon as its last block is done
    let end = builtAt;
    for (let k = 0; k < n; k++) {
      const out = fly(dist(pos[k], entries[k]));
      push(k, { t0: free[k], t1: free[k] + out, mode: "move", path: [pos[k], entries[k]] });
      end = Math.max(end, free[k] + out);
    }
    return shift({ jobs, cursors, finale, builtAt, latchPoint, latchAt: end, end }, opts.start ?? 0);
  }

  const rand = mulberry32(0xb17f10);
  for (let k = 0; k < n; k++) {
    // between jobs and after its last one, a cursor hovers around whatever is being built right now
    let t = free[k];
    while (jobs.length && t < builtAt - 420) {
      const busy = jobs.filter((j) => j.buildEnd > t).sort((a, b) => a.buildStart - b.buildStart)[0] ?? jobs[jobs.length - 1];
      const bt = busy.target;
      const to: Pt = {
        x: Math.round(clamp(bt.x + rand() * bt.w + (rand() - 0.5) * 80, view.x + 8, view.x + view.w - 8)),
        y: Math.round(clamp(bt.y + rand() * bt.h + (rand() - 0.5) * 80, view.y + 8, view.y + view.h - 40)),
      };
      const hop = Math.min(fly(dist(pos[k], to)), builtAt - t);
      push(k, { t0: t, t1: t + hop, mode: "move", path: [pos[k], to] });
      pos[k] = to;
      t += hop + 90 + rand() * 160;
    }
    if (t < builtAt) push(k, { t0: t, t1: builtAt, mode: "move", path: [pos[k], pos[k]] });
    const t0 = Math.max(t, builtAt);
    const a = (k / n) * Math.PI * 2;
    const spot = { x: Math.round(latchPoint.x + Math.cos(a) * LATCH_RING), y: Math.round(latchPoint.y + Math.sin(a) * LATCH_RING) };
    push(k, { t0, t1: t0 + CONVERGE_MS, mode: "move", path: [pos[k], spot] });
  }
  const latchAt = builtAt + CONVERGE_MS;
  return shift({ jobs, cursors, finale, builtAt, latchPoint, latchAt, end: latchAt + LATCH_MS }, opts.start ?? 0);
}

/** Moves a whole timeline `by` ms later. */
function shift(tl: Timeline, by: number): Timeline {
  if (!by) return tl;
  for (const c of tl.cursors) for (const s of c.segments) {
    s.t0 += by;
    s.t1 += by;
  }
  for (const j of tl.jobs) {
    j.wireStart += by;
    j.buildStart += by;
    j.buildEnd += by;
    j.done += by;
  }
  tl.builtAt += by;
  tl.latchAt += by;
  tl.end += by;
  return tl;
}

// ── Sampling ────────────────────────────────────────────────────────────

export interface CursorFrame {
  x: number;
  y: number;
  mode: Mode;
  label: string;
}

export interface TargetFrame {
  id: string;
  kind: Kind;
  /** Dashed bounding box while being dragged, else null. */
  box: { x: number; y: number; w: number; h: number } | null;
  /** 0 = hidden, 1 = fully visible. */
  reveal: number;
  /** Text caret x while typing, else null. */
  caret: number | null;
}

export interface Frame {
  cursors: CursorFrame[];
  targets: TargetFrame[];
  wires: { pts: Pt[]; alpha: number }[];
  /** 0–1: cursors gathered and the latch flash playing. */
  latch: number;
  done: boolean;
}

function cursorAt(segs: Segment[], t: number): { p: Pt; mode: Mode } {
  if (!segs.length) return { p: { x: 0, y: 0 }, mode: "move" };
  if (t <= segs[0].t0) return { p: segs[0].path[0], mode: "move" };
  for (const s of segs) {
    if (t < s.t1) {
      if (t < s.t0) return { p: s.path[0], mode: "move" };
      const f = (t - s.t0) / (s.t1 - s.t0);
      const eased = s.mode === "move" ? easeInOutCubic(f) : s.mode === "drag" ? easeOutCubic(f) : f;
      return { p: pointAt(s.path, eased), mode: s.mode };
    }
  }
  const last = segs[segs.length - 1];
  return { p: last.path[last.path.length - 1], mode: "move" };
}

export function sample(tl: Timeline, t: number): Frame {
  const cursors = tl.cursors.map((c) => {
    const { p, mode } = cursorAt(c.segments, t);
    return { x: p.x, y: p.y, mode, label: c.label };
  });

  const targets: TargetFrame[] = tl.jobs.map((j) => {
    const tg = j.target;
    let box: TargetFrame["box"] = null;
    let reveal = 0;
    let caret: number | null = null;
    if (tg.kind === "type") {
      if (t >= j.buildEnd) reveal = 1;
      else if (t >= j.buildStart) {
        // reveal in whole characters (~9px each) so it reads as typing, not a wipe
        const chars = Math.max(1, Math.round(tg.w / 9));
        reveal = Math.floor(((t - j.buildStart) / (j.buildEnd - j.buildStart)) * chars) / chars;
        caret = tg.x + tg.w * reveal;
      }
    } else if (t >= j.buildStart) {
      const f = easeOutCubic(clamp((t - j.buildStart) / (j.buildEnd - j.buildStart), 0, 1));
      if (t < j.done) box = { x: tg.x, y: tg.y, w: tg.w * f, h: tg.h * f };
      reveal = clamp((t - j.buildEnd) / REVEAL_MS, 0, 1);
    }
    return { id: tg.id, kind: tg.kind, box, reveal, caret };
  });

  const fade = clamp((t - tl.builtAt) / 400, 0, 1);
  const wires = tl.jobs
    .filter((j) => j.wire && t >= j.wireStart)
    .map((j) => {
      const trace = j.buildStart - j.wireStart;
      const f = trace <= 0 ? 1 : clamp((t - j.wireStart) / trace, 0, 1);
      return { pts: partialPath(j.wire as Pt[], f), alpha: 1 - fade };
    });

  return {
    cursors,
    targets,
    wires,
    latch: tl.finale === "latch" ? clamp((t - tl.latchAt) / (tl.end - tl.latchAt), 0, 1) : 0,
    done: t >= tl.end,
  };
}
