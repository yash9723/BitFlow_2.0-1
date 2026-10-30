/**
 * lib/studio/circuit-route.ts — the editor's "Auto-route": every wire redrawn as an
 * orthogonal path around the parts, by A* on a 10 px grid. Each wire leaves its pin straight
 * out. Wires of one net may share a trunk (that's where the junction dots go); other nets'
 * wires are expensive to run along and slightly costly to cross; turns cost extra.
 * Self-check: scripts/circuit.check.ts.
 * ponytail: wires are routed one at a time, shortest first, with no rip-up and reroute, so a
 * crowded circuit can end with avoidable overlaps; a wire with no path keeps its default route.
 */
import type { Circuit, Part, Wire } from "./circuit";
import { type Point, pinDir, pinPos, size, simplify } from "./circuit-edit";
import { MinHeap } from "./min-heap";

const GRID = 10, STUB = 12, MARGIN = 60;
const TURN = 3, OTHER_NET = 25, CROSS = 2, SAME_NET = 0.1;
const MAX_VISITS = 60_000;
const DX = [1, 0, -1, 0], DY = [0, 1, 0, -1];   // right, down, left, up
const dirIndex = (d: { x: number; y: number }) => (d.x === 1 ? 0 : d.y === 1 ? 1 : d.x === -1 ? 2 : 3);

/** A straight stretch of wire, for telling who already runs where. */
const lineKey = (horizontal: boolean, along: number, across: number) =>
  `${horizontal ? "h" : "v"}${Math.round(across / 5)}:${Math.floor(along / GRID)}`;

export function routeAll(c: Circuit): Circuit {
  const byId = new Map(c.parts.map((p) => [p.id, p]));
  const netOf = (w: Wire) => `${w.from.part}.${w.from.pin}`;
  const ends = (w: Wire) => {
    const a = byId.get(w.from.part), b = byId.get(w.to.part);
    return a && b ? { a, b, pa: pinPos(a, w.from.pin), pb: pinPos(b, w.to.pin), da: pinDir(a, w.from.pin), db: pinDir(b, w.to.pin) } : null;
  };
  if (!c.parts.length) return c;
  const boxes = c.parts.map((p) => { const s = size(p); return { x1: p.x - 6, y1: p.y - STUB, x2: p.x + s.w + 6, y2: p.y + s.h + 6 }; });
  const left = Math.min(...boxes.map((b) => b.x1)) - MARGIN, top = Math.min(...boxes.map((b) => b.y1)) - MARGIN;
  const right = Math.max(...boxes.map((b) => b.x2)) + MARGIN, bottom = Math.max(...boxes.map((b) => b.y2)) + MARGIN;
  const grid = (lo: number, hi: number) => { const out: number[] = []; for (let v = Math.floor(lo / GRID) * GRID; v <= hi; v += GRID) out.push(v); return out; };
  const baseX = grid(left, right), baseY = grid(top, bottom);

  const used = new Map<string, Set<string>>();       // straight stretch -> the nets on it
  const order = c.wires.map((w) => {
    const e = ends(w);
    return { w, len: e ? Math.abs(e.pa.x - e.pb.x) + Math.abs(e.pa.y - e.pb.y) : 0 };
  }).sort((p, q) => p.len - q.len);
  const routes = new Map<string, Point[]>();
  for (const { w } of order) {
    const e = ends(w);
    if (!e) continue;
    const start = { x: e.pa.x + e.da.x * STUB, y: e.pa.y + e.da.y * STUB }, goal = { x: e.pb.x + e.db.x * STUB, y: e.pb.y + e.db.y * STUB };
    const path = search(baseX, baseY, boxes, start, goal, dirIndex(e.da), (dirIndex(e.db) + 2) % 4, netOf(w), used);
    if (!path) continue;
    const pts = simplify([[e.pa.x, e.pa.y], ...path, [e.pb.x, e.pb.y]]);
    routes.set(w.id, pts);
    for (let i = 1; i < pts.length; i++) {
      const [x1, y1] = pts[i - 1], [x2, y2] = pts[i], h = y1 === y2;
      for (let v = Math.min(h ? x1 : y1, h ? x2 : y2); v < Math.max(h ? x1 : y1, h ? x2 : y2); v += GRID) {
        const k = lineKey(h, v + 1, h ? y1 : x1);
        (used.get(k) ?? used.set(k, new Set()).get(k)!).add(netOf(w));
      }
    }
  }
  return { ...c, wires: c.wires.map((w) => (routes.has(w.id) ? { ...w, route: routes.get(w.id), bend: undefined } : w)) };
}

function search(baseX: number[], baseY: number[], boxes: { x1: number; y1: number; x2: number; y2: number }[], start: { x: number; y: number }, goal: { x: number; y: number },
  startDir: number, goalDir: number, net: string, used: Map<string, Set<string>>): Point[] | null {
  const sorted = (base: number[], ...extra: number[]) => [...new Set([...base, ...extra])].sort((a, b) => a - b);
  const xs = sorted(baseX, start.x, goal.x), ys = sorted(baseY, start.y, goal.y);
  const nx = xs.length, ny = ys.length, sx = xs.indexOf(start.x), sy = ys.indexOf(start.y), gx = xs.indexOf(goal.x), gy = ys.indexOf(goal.y);
  const blocked = new Uint8Array(nx * ny);
  for (const b of boxes) {
    for (let i = 0; i < nx; i++) {
      if (xs[i] <= b.x1 || xs[i] >= b.x2) continue;
      for (let j = 0; j < ny; j++) if (ys[j] > b.y1 && ys[j] < b.y2) blocked[i + j * nx] = 1;
    }
  }
  blocked[sx + sy * nx] = 0;
  blocked[gx + gy * nx] = 0;
  const id = (i: number, j: number, d: number) => (i + j * nx) * 4 + d;
  const best = new Float64Array(nx * ny * 4).fill(Infinity);
  const from = new Int32Array(nx * ny * 4).fill(-1);
  const heap = new MinHeap<number>();
  const h = (i: number, j: number) => (Math.abs(xs[i] - goal.x) + Math.abs(ys[j] - goal.y)) / GRID;
  const first = id(sx, sy, startDir);
  best[first] = 0;
  heap.push(h(sx, sy), 0, first);
  let visits = 0, done = -1;
  while (heap.size) {
    const cur = heap.pop()!.value;
    if (++visits > MAX_VISITS) return null;
    const d = cur & 3, cell = cur >> 2, i = cell % nx, j = (cell - i) / nx;
    if (i === gx && j === gy && d === goalDir) { done = cur; break; }
    for (const nd of [d, (d + 1) % 4, (d + 3) % 4]) {       // straight on or turn; never back
      const ni = i + DX[nd], nj = j + DY[nd];
      if (ni < 0 || nj < 0 || ni >= nx || nj >= ny || blocked[ni + nj * nx]) continue;
      const horizontal = DY[nd] === 0;
      const len = (horizontal ? Math.abs(xs[ni] - xs[i]) : Math.abs(ys[nj] - ys[j])) / GRID;
      const along = horizontal ? Math.min(xs[i], xs[ni]) : Math.min(ys[j], ys[nj]);
      const nets = used.get(lineKey(horizontal, along + 1, horizontal ? ys[j] : xs[i]));
      let step = len;
      if (nets?.has(net)) step = len * SAME_NET;
      else if (nets?.size) step = len + OTHER_NET;
      else {
        const across = used.get(lineKey(!horizontal, (horizontal ? ys[j] : xs[i]) + 1, horizontal ? xs[ni] : ys[nj]));
        if (across?.size && !across.has(net)) step = len + CROSS;
      }
      const g = best[cur] + step + (nd === d ? 0 : TURN), next = id(ni, nj, nd);
      if (g >= best[next]) continue;
      best[next] = g;
      from[next] = cur;
      heap.push(g + h(ni, nj), h(ni, nj), next);    // ties: closest to the goal first
    }
  }
  if (done < 0) return null;
  const path: Point[] = [];
  for (let s = done; s >= 0; s = from[s]) {
    const cell = s >> 2, i = cell % nx, j = (cell - i) / nx;
    path.push([xs[i], ys[j]]);
  }
  return path.reverse();
}

/** Does this polyline run through a part's body? (Its own part's pin edge doesn't count: only the interior does.) */
export function crossesPart(pts: Point[], p: Part): boolean {
  const s = size(p), x1 = p.x + 1, y1 = p.y + 1, x2 = p.x + s.w - 1, y2 = p.y + s.h - 1;
  for (let i = 1; i < pts.length; i++) {
    const lx = Math.min(pts[i - 1][0], pts[i][0]), hx = Math.max(pts[i - 1][0], pts[i][0]);
    const ly = Math.min(pts[i - 1][1], pts[i][1]), hy = Math.max(pts[i - 1][1], pts[i][1]);
    if (lx < x2 && hx > x1 && ly < y2 && hy > y1) return true;
  }
  return false;
}
