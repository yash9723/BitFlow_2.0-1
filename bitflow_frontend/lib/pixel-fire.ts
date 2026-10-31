/**
 * lib/pixel-fire.ts — the announcements' pixel fire: a low-resolution grid of heat, the classic
 * DOOM effect. Each pixel takes the heat of the one below, a little cooler and nudged sideways, and
 * the bottom row is kept burning. Drawn by components/PixelFire.tsx. Self-check: scripts/announcements.check.ts.
 */

/** Cold to hot: transparent, then black-red through red and orange to silver-white. Stepped, so the bands stay hard-edged. */
export const FIRE_PALETTE: [number, number, number][] = [
  [0, 0, 0], [28, 4, 3], [52, 7, 5], [82, 10, 7], [116, 13, 8], [150, 17, 10], [186, 24, 14], [218, 32, 20], [255, 65, 54],
  [255, 92, 34], [255, 122, 26], [255, 156, 44], [255, 190, 84], [255, 222, 150], [233, 235, 238],
];
const HOTTEST = FIRE_PALETTE.length - 1;

/** Heat lost per row so a flame fades out at the top of `rows` rows. */
export const coolingFor = (rows: number) => (HOTTEST / Math.max(rows, 1)) * 1.1;

export const newFire = (cols: number, rows: number) => new Float32Array(cols * rows);

/** One frame. `random` returns 0 to 1, as Math.random does. */
export function stepFire(heat: Float32Array, cols: number, rows: number, cooling: number, random: () => number = Math.random) {
  const bottom = (rows - 1) * cols;
  // Uneven at the base, which is what makes separate tongues of flame.
  for (let x = 0; x < cols; x++) heat[bottom + x] = random() < 0.75 ? HOTTEST : HOTTEST * 0.6;
  for (let y = 0; y < rows - 1; y++) {
    for (let x = 0; x < cols; x++) {
      const drift = Math.floor(random() * 3) - 1;
      const to = Math.min(cols - 1, Math.max(0, x + drift));
      heat[y * cols + to] = Math.max(0, heat[(y + 1) * cols + x] - random() * 2 * cooling);
    }
  }
}

/** Heat into RGBA pixels, four bytes each; below the first band is fully transparent. */
export function paintFire(heat: Float32Array, pixels: Uint8ClampedArray) {
  for (let i = 0; i < heat.length; i++) {
    const [r, g, b] = FIRE_PALETTE[Math.floor(heat[i])];
    const p = i * 4;
    pixels[p] = r; pixels[p + 1] = g; pixels[p + 2] = b;
    pixels[p + 3] = heat[i] < 1 ? 0 : 255;
  }
}
