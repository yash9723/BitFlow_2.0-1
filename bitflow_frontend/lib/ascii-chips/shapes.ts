/** lib/ascii-chips/shapes.ts — geometry for building silhouettes. Ported from ascii-animals (MIT, see LICENSE.ascii-animals.txt). */

/** Inside the ellipse centred on (cu, cv) with half-axes a (along u) and b (along v)? */
export function inEllipse(u: number, v: number, cu: number, cv: number, a: number, b: number) {
  const x = (u - cu) / a;
  const y = (v - cv) / b;
  return x * x + y * y <= 1;
}
