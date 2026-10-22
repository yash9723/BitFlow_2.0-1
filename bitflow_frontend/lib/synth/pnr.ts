/**
 * lib/synth/pnr.ts — what the floorplan (components/Floorplan.tsx) shows after
 * nextpnr: Fmax, utilisation, cells per tile, the placed cells and the slowest
 * critical paths. The browser's copy of pnr_summary() in api/routes/synthesize.py
 * (the server's /fpga result has the same shape); keep the two in step.
 * Self-check: scripts/pnr.check.ts.
 */

export type TileKind = "logic" | "io" | "ram" | "clock" | "other";
export interface PathHop { x: number; y: number; type: string; delay: number; cell: string; net?: string }
export interface CriticalPath { from: string; to: string; delay_ns: number; hops: PathHop[] }
export interface PnrSummary {
  ok: true;
  fmax: { clock: string; mhz: number }[];
  utilization: Record<string, { used: number; available: number }>;
  grid: { width: number; height: number };
  tiles: [number, number, TileKind, number][];
  /** [cell name, kind, x, y]; may be missing in results from an older server. */
  cells?: [string, TileKind, number, number][];
  critical?: CriticalPath[];
}

const BEL = /X(\d+)\/Y(\d+)\/(\w+?)\d*$/;
const KINDS: Record<string, TileKind> = { lc: "logic", io: "io", ram: "ram", gb: "clock" };
export const MAX_PNR_CELLS = 4000;
const MAX_PATHS = 3, MAX_HOPS = 200;
const round = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d;

/* eslint-disable @typescript-eslint/no-explicit-any */
export function pnrSummary(report: any, placed: any, grid: { width: number; height: number }): PnrSummary {
  const fmax = Object.entries<any>(report?.fmax ?? {})
    .filter(([, v]) => v?.achieved)
    .map(([name, v]) => ({ clock: name.split("$")[0], mhz: round(v.achieved, 1) }))
    .sort((a, b) => a.mhz - b.mhz);
  const utilization = Object.fromEntries(Object.entries<any>(report?.utilization ?? {}).filter(([, v]) => v?.used));
  const tiles = new Map<string, [number, number, TileKind, number]>();
  const cells: [string, TileKind, number, number][] = [];
  for (const mod of Object.values<any>(placed?.modules ?? {})) {
    if (!mod?.attributes?.top) continue;
    for (const [name, cell] of Object.entries<any>(mod.cells ?? {})) {
      const m = BEL.exec(cell?.attributes?.NEXTPNR_BEL ?? "");
      if (!m) continue;
      const kind = KINDS[m[3]] ?? "other";
      const x = Number(m[1]), y = Number(m[2]), key = `${x},${y},${kind}`;
      const t = tiles.get(key);
      if (t) t[3]++; else tiles.set(key, [x, y, kind, 1]);
      if (cells.length < MAX_PNR_CELLS) cells.push([name, kind, x, y]);
    }
  }
  const critical: CriticalPath[] = (report?.critical_paths ?? []).map((p: any) => {
    const steps: any[] = p?.path ?? [];
    const hops: PathHop[] = [];
    for (const s of steps.slice(0, MAX_HOPS)) {
      if (!hops.length && s?.from?.loc) hops.push({ x: s.from.loc[0], y: s.from.loc[1], type: "start", delay: 0, cell: s.from.cell ?? "" });
      if (s?.to?.loc) hops.push({ x: s.to.loc[0], y: s.to.loc[1], type: s.type ?? "", delay: round(s.delay ?? 0, 3), cell: s.to.cell ?? "", ...(s.net ? { net: s.net } : {}) });
    }
    return { from: String(p?.from ?? "").split("$")[0], to: String(p?.to ?? "").split("$")[0],
      delay_ns: round(steps.reduce((sum, s) => sum + (s?.delay ?? 0), 0), 2), hops };
  }).sort((a: CriticalPath, b: CriticalPath) => b.delay_ns - a.delay_ns);
  const sortedTiles = [...tiles.values()].sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2].localeCompare(b[2]));
  return { ok: true, fmax, utilization, grid, tiles: sortedTiles, cells, critical: critical.slice(0, MAX_PATHS) };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** "q_SB_DFFESR_Q_7_D_SB_LUT4_O_LC" -> "q"; "alu.sum_SB_LUT4_O" -> "alu.sum": the design signal a cell came from. */
export function signalOf(cell: string): string {
  const s = cell.replace(/^\\/, "");
  if (s.startsWith("$")) return "(internal)";
  return s.split(/_SB_|\$/)[0] || "(internal)";
}

/** The instance a cell sits in ("alu" for "alu.sum..."), or "top". */
export function moduleOf(cell: string): string {
  const s = signalOf(cell);
  return s.includes(".") ? s.slice(0, s.lastIndexOf(".")) : "top";
}
