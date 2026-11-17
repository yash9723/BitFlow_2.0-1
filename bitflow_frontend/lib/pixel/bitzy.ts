/**
 * lib/pixel/bitzy.ts — Bitzy as pixel art: the same octagonal chip, pins, antenna and X-and-block
 * face as the vector mascot (components/login/Bitzy.tsx), on a 24 × 24 grid.
 *
 * Frames are composed from parts (body, pins, antenna, eyes, extras) with a vertical offset, so every
 * animation stays on model. Each pixel is one character; COLORS maps them to CSS. components/pixel/PixelSprite.tsx
 * draws a strip of frames as SVG rects and steps through them in CSS. Frame 0 of every animation is a
 * good still: it's what reduced motion shows. Self-check: scripts/pixel.check.ts.
 */

export const SIZE = 24;

/** Pixel characters → fill. Overridable per use through the CSS variables. */
export const COLORS: Record<string, string> = {
  o: "var(--px-outline, #00e87a)",          // body outline
  b: "var(--px-body, #0d0e11)",             // body fill
  d: "var(--px-dim, rgba(0,232,122,.22))",  // face panel, unlit antenna
  p: "var(--px-pin, rgba(0,232,122,.55))",  // pins
  e: "var(--px-eye, #00e87a)",              // eyes
  a: "var(--px-light, #00e87a)",            // antenna light
  g: "var(--px-gold, #ffb84d)",             // sparkles, cheer light
  r: "var(--px-red, #ff4f4f)",              // error
  z: "var(--px-zz, rgba(0,232,122,.6))",    // sleep Zs
  h: "var(--px-shadow, rgba(0,232,122,.18))", // ground shadow
};

const BODY = [
  "....oooooooo....",
  "...obbbbbbbbo...",
  "..obbbbbbbbbbo..",
  ".obbddddddddbbo.",
  "obbbbbbbbbbbbbbo",
  "obbbbbbbbbbbbbbo",
  "obbbbbbbbbbbbbbo",
  "obbbbbbbbbbbbbbo",
  "obbbbbbbbbbbbbbo",
  "obbbbbbbbbbbbbbo",
  ".obbddddddddbbo.",
  "..obbbbbbbbbbo..",
  "...obbbbbbbbo...",
  "....oooooooo....",
];
const BODY_X = 4, BODY_Y = 8;

// 3 × 3 eyes, placed at the left and right eye positions inside the face panel.
const EYES = {
  x:     ["e.e", ".e.", "e.e"],
  block: ["eee", "eee", "eee"],
  shut:  ["...", "...", "eee"],
  happy: [".e.", "e.e", "..."],
  sadX:  ["r.r", ".r.", "r.r"],
} as const;
type Eye = keyof typeof EYES;

export interface Pose {
  dy?: number;                        // body offset: negative is up
  left?: Eye; right?: Eye;            // default: the X-and-block face
  look?: -1 | 0 | 1;                  // eyes shifted left / right
  down?: boolean;                     // eyes one pixel lower (looking at the work)
  light?: "a" | "d" | "g" | "r";      // antenna light colour, d = off
  pins?: 0 | 1;                       // pins one row lower: a scuttle
  outline?: "o" | "r";
  extras?: [x: number, y: number, c: string][];
  shadow?: number;                    // shadow half-width, default 6
}

type Grid = string[][];

const blank = (): Grid => Array.from({ length: SIZE }, () => Array(SIZE).fill("."));
function stamp(g: Grid, rows: readonly string[], x: number, y: number, map?: (c: string) => string) {
  rows.forEach((row, j) => [...row].forEach((c, i) => {
    const X = x + i, Y = y + j;
    if (c !== "." && X >= 0 && X < SIZE && Y >= 0 && Y < SIZE) g[Y][X] = map ? map(c) : c;
  }));
}

/** One frame as SIZE strings of SIZE pixel characters. */
export function frame(p: Pose = {}): string[] {
  const g = blank(), dy = p.dy ?? 0;
  const half = p.shadow ?? 6;
  stamp(g, ["h".repeat(half * 2)], 12 - half, 22);
  const top = BODY_Y + dy;
  const outline = p.outline ?? "o";
  stamp(g, BODY, BODY_X, top, (c) => (c === "o" ? outline : c));
  for (const row of [3, 9]) {                                   // two pins a side
    const y = top + row + (p.pins ?? 0);
    stamp(g, ["pp"], 2, y);
    stamp(g, ["pp"], 20, y);
  }
  stamp(g, ["o", "o", "o"], 15, top - 3, () => outline);       // antenna stem, then the light
  stamp(g, ["aa", "aa"], 15, top - 5, () => p.light ?? "a");
  const ex = p.look ?? 0, ey = top + 5 + (p.down ? 1 : 0);
  stamp(g, EYES[p.left ?? "x"], 8 + ex, ey);
  stamp(g, EYES[p.right ?? "block"], 13 + ex, ey);
  for (const [x, y, c] of p.extras ?? []) if (y >= 0 && y < SIZE && x >= 0 && x < SIZE) g[y][x] = c;
  return g.map((r) => r.join(""));
}

const spark = (x: number, y: number): [number, number, string][] =>
  [[x, y - 1, "g"], [x - 1, y, "g"], [x, y, "g"], [x + 1, y, "g"], [x, y + 1, "g"]];
const zed = (x: number, y: number): [number, number, string][] =>
  [[x, y, "z"], [x + 1, y, "z"], [x + 1, y + 1, "z"], [x, y + 2, "z"], [x + 1, y + 2, "z"]];

export type Animation = "idle" | "work" | "think" | "cheer" | "sad" | "sleep";

/** Frames and timing of each animation. Frame 0 is the still shown with reduced motion. */
export const ANIMATIONS: Record<Animation, { frames: string[][]; fps: number }> = {
  idle: {
    fps: 4,
    frames: ([{}, {}, {}, {}, {}, {}, { left: "shut", right: "shut" }, {}] as Pose[]).map((p) => frame(p)),
  },
  work: {   // eyes on the work, antenna blinking, pins scuttling: "busy"
    fps: 6,
    frames: ([
      { down: true, look: -1 },
      { down: true, look: -1, light: "d", pins: 1 },
      { down: true, look: 1 },
      { down: true, look: 1, light: "d", pins: 1 },
    ] as Pose[]).map((p) => frame(p)),
  },
  think: {
    fps: 3,
    frames: ([{ look: 1 }, { look: 1 }, { look: 1, left: "shut", right: "shut" }, { look: 0 }, { look: -1 }, { look: -1 }] as Pose[])
      .map((p) => frame(p)),
  },
  cheer: {
    fps: 8,
    frames: ([
      { left: "happy", right: "happy", light: "g" },
      { left: "happy", right: "happy", light: "g", dy: -2, shadow: 5 },
      { left: "happy", right: "happy", light: "g", dy: -3, shadow: 4, extras: [...spark(2, 4), ...spark(21, 6)] },
      { left: "happy", right: "happy", light: "g", dy: -2, shadow: 5, extras: [...spark(3, 2), ...spark(20, 3)] },
    ] as Pose[]).map((p) => frame(p)),
  },
  sad: {
    fps: 3,
    frames: ([
      { left: "sadX", right: "sadX", light: "r", outline: "r", dy: 1 },
      { left: "sadX", right: "sadX", light: "d", outline: "r", dy: 1 },
    ] as Pose[]).map((p) => frame(p)),
  },
  sleep: {
    fps: 2,
    frames: ([
      { left: "shut", right: "shut", light: "d", dy: 1, extras: zed(19, 2) },
      { left: "shut", right: "shut", light: "d", dy: 1, extras: [...zed(19, 2), ...zed(21, 0)] },
    ] as Pose[]).map((p) => frame(p)),
  },
};

/** A frame as horizontal runs of one colour: [x, y, width, char]. Fewer rects to draw. */
export function runs(rows: string[]): [number, number, number, string][] {
  const out: [number, number, number, string][] = [];
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const c = row[x];
      let w = 1;
      while (row[x + w] === c) w++;
      if (c !== ".") out.push([x, y, w, c]);
      x += w;
    }
  });
  return out;
}

/**
 * Where Bitzy looks for a pointer at (dx, dy) from its centre: one of 9 directions (idea after
 * nilbuild/page-mascot, MIT). Within `dead` px it looks straight ahead. Up raises the body a pixel,
 * down drops the eyes; left and right shift them.
 */
export function directionFor(dx: number, dy: number, dead = 40): Pose {
  if (Math.hypot(dx, dy) < dead) return {};
  const a = Math.atan2(dy, dx), sx = Math.cos(a), sy = Math.sin(a);
  const look = (sx > 0.38 ? 1 : sx < -0.38 ? -1 : 0) as -1 | 0 | 1;
  return { look, ...(sy > 0.38 ? { down: true } : sy < -0.38 ? { dy: -1 } : {}) };
}
