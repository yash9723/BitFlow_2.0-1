/**
 * lib/svg-image.ts — SVG and PNG downloads of on-screen SVG drawings (the Studio's timing
 * diagram and circuit editor). Browser only.
 */

/** The SVG as a PNG at 2x, for slides and reports. */
export async function svgToPng(svg: string): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    await new Promise((ok, fail) => { img.onload = ok; img.onerror = fail; img.src = url; });
    const canvas = Object.assign(document.createElement("canvas"), { width: img.width * 2, height: img.height * 2 });
    const ctx = canvas.getContext("2d")!;
    ctx.scale(2, 2);
    ctx.drawImage(img, 0, 0);
    return await new Promise((ok, fail) => canvas.toBlob((b) => (b ? ok(b) : fail(new Error("PNG export failed"))), "image/png"));
  } finally {
    URL.revokeObjectURL(url);
  }
}

const STYLE_PROPS = ["fill", "stroke", "stroke-width", "stroke-dasharray", "stroke-linecap", "opacity", "fill-opacity", "stroke-opacity",
  "font-family", "font-size", "font-weight", "text-anchor", "dominant-baseline", "visibility", "display"];

/**
 * A self-contained copy of a live <svg>: CSS-class styles inlined (so it looks the same outside
 * the page), cropped to `box` (user units), on a solid background. `drop` removes matching elements.
 */
export function standaloneSvg(live: SVGSVGElement, box: { x: number; y: number; w: number; h: number }, background = "#0b0c10", drop = ""): string {
  const clone = live.cloneNode(true) as SVGSVGElement;
  const src = [live, ...live.querySelectorAll("*")], dst = [clone, ...clone.querySelectorAll("*")];
  src.forEach((el, i) => {
    const cs = getComputedStyle(el), d = dst[i] as SVGElement;
    d.removeAttribute("class");
    for (const p of STYLE_PROPS) { const v = cs.getPropertyValue(p); if (v) d.style.setProperty(p, v); }
    d.style.removeProperty("cursor");
  });
  if (drop) clone.querySelectorAll(drop).forEach((el) => el.remove());
  const ns = "http://www.w3.org/2000/svg";
  clone.setAttribute("xmlns", ns);
  clone.setAttribute("viewBox", `${box.x} ${box.y} ${box.w} ${box.h}`);
  clone.setAttribute("width", String(Math.round(box.w)));
  clone.setAttribute("height", String(Math.round(box.h)));
  for (const a of ["role", "aria-label", "tabindex"]) clone.removeAttribute(a);
  const bg = document.createElementNS(ns, "rect");
  for (const [k, v] of Object.entries({ x: box.x, y: box.y, width: box.w, height: box.h, fill: background })) bg.setAttribute(k, String(v));
  clone.insertBefore(bg, clone.firstChild);
  return new XMLSerializer().serializeToString(clone);
}
