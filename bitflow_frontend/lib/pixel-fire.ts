/**
 * lib/pixel-fire.ts — the announcements' pixel fire: a low-resolution grid of heat. Each pixel takes
 * the average heat of the three below it, a little cooler, and the bottom row is kept burning. How much
 * it cools comes from noise rising with the flame, which carves it into tongues; embers rise above it.
 * Every pixel stays hard-edged.
 * Drawn by components/PixelFire.tsx. Self-check: scripts/announcements.check.ts.
 */

type Rgb = [number, number, number];
const LEVELS = 32;

/** Cold to hot, blended into small steps: enough for a rich fire, few enough that the bands stay hard-edged pixel art. */
const ramp = (stops: [number, Rgb][]): Rgb[] => Array.from({ length: LEVELS }, (_, i) => {
  const at = i / (LEVELS - 1);
  const upper = Math.max(1, stops.findIndex(([stop]) => stop >= at));
  const [a, from] = stops[upper - 1], [b, to] = stops[upper];
  const mix = (at - a) / (b - a);
  return [0, 1, 2].map((c) => Math.round(from[c] + (to[c] - from[c]) * mix)) as Rgb;
});

export const FIRE_PALETTE = ramp([
  [0, [0, 0, 0]], [0.08, [96, 12, 8]], [0.2, [170, 20, 11]], [0.34, [232, 40, 20]], [0.5, [255, 84, 26]],
  [0.68, [255, 140, 36]], [0.85, [255, 204, 92]], [1, [244, 244, 238]],
]);
/** The same fire, burning sorcerous green once the page has been scrolled down. */
export const DOOM_PALETTE = ramp([
  [0, [0, 0, 0]], [0.08, [6, 62, 32]], [0.2, [8, 112, 52]], [0.34, [16, 168, 72]], [0.5, [38, 218, 92]],
  [0.68, [104, 244, 112]], [0.85, [186, 255, 160]], [1, [238, 255, 234]],
]);
const HOTTEST = LEVELS - 1;

/** How far the page has turned, 0 to 1: it starts a quarter screen down and is complete by two screens, or the end of a short page. */
export function doomAt(scrollY: number, viewport: number, maxScroll: number) {
  const start = viewport * 0.25, end = Math.min(viewport * 2, maxScroll);
  return end <= start ? 0 : Math.min(1, Math.max(0, (scrollY - start) / (end - start)));
}
/** Cooler than this isn't drawn, which gives the flames a clean edge instead of a haze of dark red. */
const EDGE = 2.5;

/** Heat lost per row so a flame fades out at the top of `rows` rows. */
export const coolingFor = (rows: number) => (HOTTEST / Math.max(rows, 1)) * 1.1;

/** How hard the fire burns, 0 to 1: scrolling stokes it, and it dies back a second or two after you stop. */
export const stoke = (flare: number, movedPx: number) => Math.min(1, flare * 0.92 + Math.abs(movedPx) / 200);

/** Cooling for that flare: flames fill about three quarters of the canvas at rest, and all of it when fully stoked. */
export const stokedCooling = (rows: number, flare: number) => coolingFor(rows) * (1.15 - 0.27 * flare);

export const newFire = (cols: number, rows: number) => new Float32Array(cols * rows);

/** 0 to 1, drifting slowly along x as time passes: where the flames run tall. */
const wave = (x: number, t: number) =>
  0.5 + 0.28 * Math.sin(x * 0.083 + t * 1.3) * Math.sin(x * 0.031 - t * 0.7) + 0.22 * Math.sin(x * 0.19 - t * 2.1);

/** Smooth noise, 0 to 1, in a square that tiles: broad tongues with finer licks on top. */
const TILE = 256;
const NOISE = new Float32Array(TILE * TILE);
for (const [cells, weight] of [[16, 0.65], [48, 0.35]]) {
  const corner = (x: number, y: number) => Math.abs(Math.sin((y % cells) * cells + (x % cells) * 12.9898 + cells) * 43758.5453) % 1;
  const ease = (f: number) => f * f * (3 - 2 * f);
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const gx = (x / TILE) * cells, gy = (y / TILE) * cells, cx = Math.floor(gx), cy = Math.floor(gy);
    const fx = ease(gx - cx), fy = ease(gy - cy);
    const top = corner(cx, cy) * (1 - fx) + corner(cx + 1, cy) * fx, bottom = corner(cx, cy + 1) * (1 - fx) + corner(cx + 1, cy + 1) * fx;
    NOISE[y * TILE + x] += weight * (top * (1 - fy) + bottom * fy);
  }
}
/** Rows a second the noise rises: about as fast as the heat climbs, so a tongue holds together on its way up. */
const RISE = 50;

/**
 * One frame at `time` seconds. `random` returns 0 to 1, as Math.random does. `zoom` is how many fine pixels
 * (3 screen pixels) one of these covers, so tongues of flame stay the same size on screen at any pixel size.
 */
export function stepFire(heat: Float32Array, cols: number, rows: number, cooling: number, random: () => number = Math.random, time = 0, zoom = 1) {
  const bottom = (rows - 1) * cols;
  for (let x = 0; x < cols; x++) heat[bottom + x] = HOTTEST * (0.72 + 0.28 * wave(x * zoom, time));
  // Columns where the wave is low cool faster, so the flames run tall in some places and short in others.
  const reach = new Float32Array(cols);
  for (let x = 0; x < cols; x++) reach[x] = 1.3 - 0.6 * wave(x * zoom, time * 0.8 + 3);
  const rising = Math.floor(time * RISE);
  for (let y = 0; y < rows - 1; y++) {
    const row = y * cols, below = row + cols;
    const tile = (Math.floor((y + rising) * 0.4 * zoom) & (TILE - 1)) * TILE;
    const sway = Math.floor(10 * Math.sin(y * zoom * 0.045 + time * 1.7));   // leans the flames, and hides the tile's repeat
    for (let x = 0; x < cols; x++) {
      const left = heat[below + (x > 0 ? x - 1 : 0)], right = heat[below + (x < cols - 1 ? x + 1 : x)];
      const loss = cooling * reach[x] * (0.2 + 1.6 * NOISE[tile + ((Math.floor(x * zoom) + sway) & (TILE - 1))] + 0.2 * random());
      heat[row + x] = Math.max(0, (left + heat[below + x] + right) / 3 - loss);
    }
  }
}

/** An ordered dither: which pixels turn green first. Blending the two colours instead would give mustard flames. */
const DITHER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** Heat into RGBA pixels, four bytes each; below the edge is fully transparent. `doom` is the share of pixels burning green. */
export function paintFire(heat: Float32Array, pixels: Uint8ClampedArray, doom = 0, cols = 1) {
  for (let i = 0; i < heat.length; i++) {
    const turned = (DITHER[(Math.floor(i / cols) & 3) * 4 + ((i % cols) & 3)] + 0.5) / 16 < doom;
    const [r, g, b] = (turned ? DOOM_PALETTE : FIRE_PALETTE)[Math.floor(heat[i])];
    const p = i * 4;
    pixels[p] = r; pixels[p + 1] = g; pixels[p + 2] = b;
    pixels[p + 3] = heat[i] < EDGE ? 0 : 255;
  }
}

/** Where ember `i` is at `time`, or null while it's out: a pure function of its number and the clock. */
export function emberAt(i: number, time: number, cols: number, rows: number) {
  const seed = Math.abs(Math.sin(i * 127.1) * 43758.5453) % 1;
  const period = 3 + seed * 4;
  const life = ((time + seed * 97) / period) % 1;
  if (life > 0.8) return null;
  const y = Math.floor((rows - 1) * (1 - life / 0.8));
  const x = Math.floor((seed * 7919 + i * 13) % cols + Math.sin(time * 1.4 + i) * 3);
  return x < 0 || x >= cols ? null : { x, y, life: life / 0.8 };
}

/** Embers on top of the painted fire: gold when young, dying to red, or the green equivalents as `doom` rises. */
export function paintEmbers(pixels: Uint8ClampedArray, cols: number, rows: number, time: number, doom = 0) {
  const count = Math.min(60, Math.ceil(cols / 10));
  for (let i = 0; i < count; i++) {
    const e = emberAt(i, time, cols, rows);
    if (!e) continue;
    const p = (e.y * cols + e.x) * 4;
    const g = 190 * (1 - e.life) + 50;
    pixels[p] = Math.round(255 + (g * 0.6 - 255) * doom);
    pixels[p + 1] = Math.round(g + (255 - g) * doom);
    pixels[p + 2] = Math.round(70 * (1 - e.life) + 50 * doom);
    pixels[p + 3] = 255;
  }
}
