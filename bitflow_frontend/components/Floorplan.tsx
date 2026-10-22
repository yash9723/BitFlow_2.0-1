"use client";
/**
 * components/Floorplan.tsx — where nextpnr put the design on the iCE40 (server
 * /fpga results in the Synth panel's FPGA tab, browser builds in the Bitstream
 * tab). Colour by kind, by module or as a density map; hover a tile for its
 * cells; pick a critical path to draw it across the chip with each hop's delay.
 * Data shape: lib/synth/pnr.ts PnrSummary.
 */

import { useMemo, useRef, useState } from "react";
import { downloadBlob } from "@/lib/api";
import { type PnrSummary, type TileKind, moduleOf, signalOf } from "@/lib/synth/pnr";

const TILE_COLORS: Record<TileKind, string> = { logic: "#00e87a", io: "#4db8ff", ram: "#ffb84d", clock: "#ff6b6b", other: "#b0b3cc" };
const MODULE_COLORS = ["#00e87a", "#4db8ff", "#ffb547", "#ff6bcb", "#a78bfa", "#2dd4bf", "#f87171", "#facc15", "#93c5fd", "#86efac"];
const HOP_TYPES: Record<string, string> = { start: "start", "clk-to-q": "clock to Q", routing: "routing", logic: "logic", setup: "setup" };
type Mode = "kind" | "module" | "density";

/** Blue → yellow → red for 0..1. */
const heat = (t: number) => `hsl(${Math.round(220 - 220 * Math.min(1, Math.max(0, t)))}, 85%, ${45 + 10 * t}%)`;

export default function Floorplan({ pnr }: { pnr: Pick<PnrSummary, "grid" | "tiles" | "cells" | "critical"> }) {
  const { grid, tiles } = pnr;
  const cells = useMemo(() => pnr.cells ?? [], [pnr.cells]);
  const critical = pnr.critical ?? [];
  const [mode, setMode] = useState<Mode>("kind");
  const [path, setPath] = useState<number>(0);
  const [zoom, setZoom] = useState(1);
  const svg = useRef<SVGSVGElement>(null);
  const S = 12;                                            // px per tile at 100%
  const px = (x: number) => x * S, py = (y: number) => (grid.height - 1 - y) * S;   // y = 0 at the bottom, as nextpnr counts

  // Cells per tile (for hover and module colouring)
  const byTile = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const [name, , x, y] of cells) { const k = `${x},${y}`; m.set(k, [...(m.get(k) ?? []), name]); }
    return m;
  }, [cells]);
  const modules = useMemo(() => {
    const counts = new Map<string, number>();
    for (const [name] of cells) counts.set(moduleOf(name), (counts.get(moduleOf(name)) ?? 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1]);
  }, [cells]);
  const moduleColor = new Map(modules.map(([m], i) => [m, MODULE_COLORS[i % MODULE_COLORS.length]]));
  const dominant = (x: number, y: number) => {
    const c = new Map<string, number>();
    for (const n of byTile.get(`${x},${y}`) ?? []) c.set(moduleOf(n), (c.get(moduleOf(n)) ?? 0) + 1);
    return [...c].sort((a, b) => b[1] - a[1])[0]?.[0];
  };
  const maxLogic = Math.max(1, ...tiles.filter((t) => t[2] === "logic").map((t) => t[3]));

  const fill = (x: number, y: number, kind: TileKind, n: number) => {
    if (mode === "density") return kind === "logic" ? heat(n / maxLogic) : "#3a3d4f";
    if (mode === "module") { const m = dominant(x, y); return m ? moduleColor.get(m)! : TILE_COLORS[kind]; }
    return TILE_COLORS[kind];
  };
  const opacity = (kind: TileKind, n: number) => (mode === "kind" && kind === "logic" ? 0.3 + (0.7 * Math.min(n, 8)) / 8 : 0.9);
  const tip = (x: number, y: number, kind: TileKind, n: number) => {
    const unique = [...new Set((byTile.get(`${x},${y}`) ?? []).map(signalOf))];
    return `X${x} Y${y}: ${n} ${kind === "logic" ? "logic cell" : kind}${n === 1 ? "" : "s"}` +
      (unique.length ? `\n${unique.slice(0, 8).join(", ")}${unique.length > 8 ? ", …" : ""}` : "");
  };

  const sel = path >= 0 ? critical[path] : undefined;
  // The path's route on the chip: hop locations with repeats in a row collapsed
  const route = sel ? sel.hops.filter((h, i) => i === 0 || h.x !== sel.hops[i - 1].x || h.y !== sel.hops[i - 1].y) : [];
  const center = (h: { x: number; y: number }) => [px(h.x) + S / 2, py(h.y) + S / 2];
  const share = (type: string) => sel ? Math.round((100 * sel.hops.filter((h) => h.type === type).reduce((s, h) => s + h.delay, 0)) / Math.max(sel.delay_ns, 0.001)) : 0;

  const exportSvg = () => {
    const el = svg.current;
    if (el) downloadBlob("floorplan.svg", new XMLSerializer().serializeToString(el), "image/svg+xml");
  };
  const btn = (on: boolean) => `px-1.5 py-0.5 rounded border ${on ? "border-info/60 text-info bg-info/10" : "border-rim/60 text-dim hover:text-bright"} disabled:opacity-40`;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5 font-mono text-[10px]">
        {(["kind", "module", "density"] as Mode[]).map((m) => (
          <button key={m} onClick={() => setMode(m)} className={btn(mode === m)} disabled={m === "module" && !cells.length}>
            {m === "kind" ? "by kind" : m === "module" ? "by module" : "density"}
          </button>
        ))}
        <span className="mx-1 text-rim">|</span>
        <button onClick={() => setZoom((z) => Math.max(1, z - 0.5))} className={btn(false)} aria-label="Zoom out">−</button>
        <span className="text-dim">{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom((z) => Math.min(4, z + 0.5))} className={btn(false)} aria-label="Zoom in">+</button>
        <button onClick={exportSvg} className={btn(false)}>SVG</button>
      </div>

      <div className="overflow-auto max-h-[520px] border border-rim/50 rounded bg-void/60">
        <svg ref={svg} xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${grid.width * S} ${grid.height * S}`}
             width={grid.width * S * zoom} height={grid.height * S * zoom} style={{ maxWidth: zoom === 1 ? "100%" : "none", height: "auto", display: "block" }}
             role="img" aria-label={`Floorplan: ${tiles.length} tiles used${sel ? `, critical path ${sel.delay_ns} ns` : ""}`}>
          <rect width={grid.width * S} height={grid.height * S} fill="#0b0c10" />
          {tiles.map(([x, y, kind, n]) => (
            <rect key={`${x}-${y}-${kind}`} x={px(x) + 1} y={py(y) + 1} width={S - 2} height={S - 2}
                  fill={fill(x, y, kind, n)} opacity={opacity(kind, n)}>
              <title>{tip(x, y, kind, n)}</title>
            </rect>
          ))}
          {route.length > 1 && (
            <polyline points={route.map((h) => center(h).join(",")).join(" ")} fill="none" stroke="#ff4f4f" strokeWidth={1.6}
                      strokeLinejoin="round" opacity={0.9} />
          )}
          {route.map((h, i) => {
            const [cx, cy] = center(h);
            return (
              <g key={i}>
                <circle cx={cx} cy={cy} r={3.2} fill="#ff4f4f" stroke="#0b0c10" strokeWidth={0.8} />
                <text x={cx + 4} y={cy - 3} fontSize={5.5} fill="#ffd0d0" fontFamily="monospace">{i + 1}</text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="flex flex-wrap gap-3 text-[9px] text-dim">
        {mode === "kind" && (["logic", "io", "ram", "clock"] as TileKind[]).map((k) => (
          <span key={k} className="flex items-center gap-1"><span className="inline-block w-2 h-2" style={{ background: TILE_COLORS[k] }} />{k === "io" ? "I/O" : k}</span>
        ))}
        {mode === "module" && modules.slice(0, 10).map(([m, n]) => (
          <span key={m} className="flex items-center gap-1"><span className="inline-block w-2 h-2" style={{ background: moduleColor.get(m) }} />{m} ({n})</span>
        ))}
        {mode === "density" && <span className="flex items-center gap-1">logic cells per tile:
          <span className="inline-block w-16 h-2" style={{ background: `linear-gradient(90deg, ${heat(0)}, ${heat(0.5)}, ${heat(1)})` }} /> 1 → {maxLogic}</span>}
        {sel && <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-[#ff4f4f]" />critical path</span>}
      </div>

      {critical.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-1.5 font-mono text-[10px]">
            <span className="text-dim">Slowest paths:</span>
            {critical.map((c, i) => (
              <button key={i} onClick={() => setPath(path === i ? -1 : i)} className={btn(path === i)}>
                {c.from || "?"} → {c.to || "?"}: {c.delay_ns} ns
              </button>
            ))}
          </div>
          {sel && (
            <>
              <div className="overflow-auto max-h-56 border border-rim/40 rounded">
                <table className="w-full font-mono text-[10px]">
                  <thead className="sticky top-0 bg-surface text-dim"><tr>
                    <th className="px-2 py-1 text-left font-normal">#</th><th className="px-2 text-left font-normal">step</th>
                    <th className="px-2 text-right font-normal">ns</th><th className="px-2 text-left font-normal">tile</th>
                    <th className="px-2 text-left font-normal">net / cell</th>
                  </tr></thead>
                  <tbody>
                    {sel.hops.map((h, i) => (
                      <tr key={i} className="border-t border-rim/20">
                        <td className="px-2 text-dim">{i + 1}</td>
                        <td className={`px-2 ${h.type === "routing" ? "text-info" : h.type === "logic" ? "text-phosphor" : "text-ghost"}`}>{HOP_TYPES[h.type] ?? h.type}</td>
                        <td className="px-2 text-right text-pale tabular-nums">{h.delay ? h.delay.toFixed(2) : ""}</td>
                        <td className="px-2 text-dim">X{h.x} Y{h.y}</td>
                        <td className="px-2 text-ghost truncate max-w-[220px]" title={h.net ?? h.cell}>{signalOf(h.net ?? h.cell)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[10px] text-dim">
                Routing is {share("routing")}% of this path and logic {share("logic")}%. Long routes between distant tiles point at logic
                that could be pipelined or kept closer together.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
