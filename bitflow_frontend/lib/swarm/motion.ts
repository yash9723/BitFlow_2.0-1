/** lib/swarm/motion.ts — easing and polyline helpers for the landing-page signal swarm (pure, no DOM). */

export interface Pt {
  x: number;
  y: number;
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

export const dist = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.y - a.y);

/** Total length of a polyline. */
export function pathLength(pts: Pt[]): number {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += dist(pts[i - 1], pts[i]);
  return len;
}

/** The point a fraction `f` (0–1) of the way along a polyline. */
export function pointAt(pts: Pt[], f: number): Pt {
  if (pts.length === 1) return pts[0];
  const target = clamp(f, 0, 1) * pathLength(pts);
  let walked = 0;
  for (let i = 1; i < pts.length; i++) {
    const seg = dist(pts[i - 1], pts[i]);
    if (walked + seg >= target) {
      const k = seg === 0 ? 0 : (target - walked) / seg;
      return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * k, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * k };
    }
    walked += seg;
  }
  return pts[pts.length - 1];
}

/** The polyline cut off a fraction `f` of the way along (for drawing a wire as it is traced). */
export function partialPath(pts: Pt[], f: number): Pt[] {
  if (f >= 1) return pts.slice();
  const target = clamp(f, 0, 1) * pathLength(pts);
  const out: Pt[] = [pts[0]];
  let walked = 0;
  for (let i = 1; i < pts.length; i++) {
    const seg = dist(pts[i - 1], pts[i]);
    if (walked + seg >= target) {
      out.push(pointAt([pts[i - 1], pts[i]], seg === 0 ? 0 : (target - walked) / seg));
      return out;
    }
    out.push(pts[i]);
    walked += seg;
  }
  return out;
}

/** How long a cursor takes to fly a distance: quick for short hops, capped for long ones. */
export const travelTime = (d: number) => clamp(120 + d * 0.35, 140, 480);
