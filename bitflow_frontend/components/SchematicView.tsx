"use client";
/**
 * components/SchematicView.tsx — the synthesized design as a live schematic (lib/hardware-diagrams.ts
 * schematicLayout): drag to pan, wheel to zoom, Fit. Click a cell to see where it comes from in the
 * source (and open that line); double-click an instance to go inside its module (breadcrumbs lead back);
 * hover a wire to light the whole net. Cells built from the editor's current line are outlined in amber.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PixelSpinner } from "@/components/pixel/PixelLoader";
import { nodesAtLine, schematicLayout, schematicModules, type SchLayout, type SchNode, type SrcLoc, type YosysNetlist } from "@/lib/hardware-diagrams";

interface Props {
  netlist: YosysNetlist;
  /** The editor's line, in the netlist's file names ("design.v"): its cells are outlined. */
  cursor?: { file: string; line: number } | null;
  /** Open a source location in the editor (the page closes the panel and jumps there). */
  onOpenSource?: (loc: SrcLoc) => void;
  /** How to name a location for people (multi-file projects map the combined design.v back to their files). */
  describe?: (loc: SrcLoc) => string;
  /** Cell names to outline in red (the ASIC panel's critical path). */
  emphasis?: string[];
}

const C = { line: "#7c8aa5", lit: "#00e87a", text: "#d6dbe4", dim: "#8a93a6", box: "#16181f", ff: "#00e87a", port: "#5eb3ff", cursor: "#ffb547", hot: "#ff5c5c" };

export default function SchematicView({ netlist, cursor, onOpenSource, describe = (l) => `${l.file}:${l.line}`, emphasis }: Props) {
  const hot = useMemo(() => new Set(emphasis ?? []), [emphasis]);
  const { top } = useMemo(() => schematicModules(netlist), [netlist]);
  const [path, setPath] = useState<string[]>(top ? [top] : []);
  const module = path[path.length - 1];
  const [layout, setLayout] = useState<SchLayout | null | "loading" | "error">("loading");
  const [view, setView] = useState({ k: 1, x: 0, y: 0 });
  const [selected, setSelected] = useState<string | null>(null);
  const [hoverNet, setHoverNet] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; vx: number; vy: number; moved: boolean } | null>(null);

  useEffect(() => { setPath(top ? [top] : []); }, [top]);

  const fit = useCallback((L: SchLayout) => {
    const el = box.current;
    if (!el || !L.width) return;
    const k = Math.min(el.clientWidth / L.width, el.clientHeight / L.height, 1.5);
    setView({ k, x: (el.clientWidth - L.width * k) / 2, y: (el.clientHeight - L.height * k) / 2 });
  }, []);

  useEffect(() => {
    if (!module) return;
    let stale = false;
    setLayout("loading");
    setSelected(null);
    schematicLayout(netlist, module)
      .then((L) => { if (!stale) { setLayout(L); if (L) requestAnimationFrame(() => fit(L)); } })
      .catch(() => { if (!stale) setLayout("error"); });
    return () => { stale = true; };
  }, [netlist, module, fit]);

  // Wheel zoom around the pointer (a native listener: React's wheel events can't preventDefault).
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
      setView((v) => {
        const k = Math.min(6, Math.max(0.05, v.k * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
        return { k, x: px - ((px - v.x) * k) / v.k, y: py - ((py - v.y) * k) / v.k };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const L = typeof layout === "object" ? layout : null;
  const lit = useMemo(() => new Set(L && cursor ? nodesAtLine(L, cursor.file, cursor.line) : []), [L, cursor]);
  const sel = L?.nodes.find((n) => n.id === selected) ?? null;
  const enter = (n: SchNode) => { if (n.module) setPath((p) => [...p, n.module!]); };

  return (
    <div className="flex flex-col min-h-0 h-full gap-2">
      <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] text-dim">
        <nav aria-label="Module path" className="flex items-center gap-1">
          {path.map((m, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <span>›</span>}
              <button onClick={() => setPath(path.slice(0, i + 1))} disabled={i === path.length - 1}
                      className={i === path.length - 1 ? "text-bright" : "text-info hover:underline"}>{m}</button>
            </span>
          ))}
        </nav>
        {L && <span>· {L.cells} cell{L.cells === 1 ? "" : "s"}</span>}
        {lit.size > 0 && <span style={{ color: C.cursor }}>· {lit.size} from your cursor&apos;s line</span>}
        <span className="ml-auto flex items-center gap-1">
          <button className="border border-rim px-2 rounded hover:text-bright" onClick={() => setView((v) => ({ ...v, k: v.k / 1.25 }))} aria-label="Zoom out">−</button>
          <button className="border border-rim px-2 rounded hover:text-bright" onClick={() => L && fit(L)}>Fit</button>
          <button className="border border-rim px-2 rounded hover:text-bright" onClick={() => setView((v) => ({ ...v, k: v.k * 1.25 }))} aria-label="Zoom in">+</button>
        </span>
      </div>

      <div ref={box} className="relative flex-1 min-h-0 overflow-hidden border border-rim/50 rounded bg-void/60 cursor-grab active:cursor-grabbing select-none"
           onPointerDown={(e) => { drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false }; }}
           onPointerMove={(e) => {
             const d = drag.current;
             if (!d) return;
             if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 3) d.moved = true;
             if (d.moved) setView((v) => ({ ...v, x: d.vx + e.clientX - d.x, y: d.vy + e.clientY - d.y }));
           }}
           onPointerUp={() => { setTimeout(() => { drag.current = null; }, 0); }}
           onPointerLeave={() => { drag.current = null; }}>
        {layout === "loading" && <span className="absolute inset-0 flex items-center justify-center gap-2 font-mono text-[11px] text-dim"><PixelSpinner size={12} /> Laying out {module}…</span>}
        {layout === "error" && <p className="p-3 font-mono text-[11px] text-danger">The schematic couldn&apos;t be laid out.</p>}
        {layout === null && <p className="p-3 font-mono text-[11px] text-dim">No module to draw.</p>}
        {L && (
          <svg width="100%" height="100%" role="img" aria-label={`Schematic of ${module}`} fontFamily="ui-monospace,SFMono-Regular,Menlo,Consolas,monospace" fontSize={11}
               onClick={(e) => { if (e.target === e.currentTarget && !drag.current?.moved) setSelected(null); }}>
            <defs>
              <marker id="sv-a" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill={C.line} /></marker>
              <marker id="sv-lit" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill={C.lit} /></marker>
            </defs>
            <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
              {L.edges.map((e) => {
                const on = hoverNet === e.net;
                return e.sections.map((sec, i) => (
                  <g key={`${e.id}-${i}`} data-net={e.net} onPointerEnter={() => setHoverNet(e.net)} onPointerLeave={() => setHoverNet((h) => (h === e.net ? null : h))}>
                    <polyline points={sec.map(([px, py]) => `${px},${py}`).join(" ")} fill="none" stroke="transparent" strokeWidth={8} />
                    <polyline points={sec.map(([px, py]) => `${px},${py}`).join(" ")} fill="none" stroke={on ? C.lit : C.line}
                              strokeWidth={(e.wide ? 2.2 : 1.1) * (on ? 1.6 : 1)} markerEnd={`url(#${on ? "sv-lit" : "sv-a"})`} pointerEvents="none" />
                  </g>
                ));
              })}
              {L.nodes.map((n) => <NodeShape key={n.id} n={n} lit={lit.has(n.id)} hot={!!n.name && hot.has(n.name)} selected={selected === n.id}
                                             onSelect={() => { if (!drag.current?.moved) setSelected(n.id); }} onEnter={() => enter(n)} />)}
            </g>
          </svg>
        )}
      </div>

      <div className="min-h-[44px] font-mono text-[10px] text-ghost border border-rim/40 rounded px-2 py-1.5" aria-live="polite">
        {sel ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-bright font-bold">{sel.label}</span>
            <span className="text-dim">{sel.kind === "inst" ? "instance" : sel.kind === "reg" ? "register" : sel.kind === "in" ? "input" : sel.kind === "out" ? "output" : sel.kind === "const" ? "constant" : "cell"}{sel.name && sel.kind !== "inst" ? ` ${sel.name.replace(/^\\/, "")}` : ""}</span>
            {sel.src.length ? sel.src.map((s, i) => (
              <button key={i} disabled={!onOpenSource} onClick={() => onOpenSource?.(s)} className="text-info hover:underline disabled:no-underline disabled:text-ghost"
                      title="Open this line in the editor">{describe(s)}{s.endLine > s.line ? `–${s.endLine}` : ""} ↗</button>
            )) : <span className="text-dim">no source location</span>}
            {sel.module && <button onClick={() => enter(sel)} className="text-phosphor hover:underline">Go inside {sel.module} ›</button>}
          </div>
        ) : (
          <span className="text-dim">Click a cell to see its source line · double-click an instance to go inside · hover a wire to trace its net · drag to pan, scroll to zoom</span>
        )}
      </div>
    </div>
  );
}

function NodeShape({ n, lit, hot, selected, onSelect, onEnter }: { n: SchNode; lit: boolean; hot?: boolean; selected: boolean; onSelect: () => void; onEnter: () => void }) {
  const { x, y, w, h } = n;
  const ring = selected ? C.lit : lit ? C.cursor : hot ? C.hot : null;
  const common = {
    "data-node": n.id,
    onClick: (e: React.MouseEvent) => { e.stopPropagation(); onSelect(); },
    onDoubleClick: (e: React.MouseEvent) => { e.stopPropagation(); onEnter(); },
    style: { cursor: n.module ? "zoom-in" : "pointer" },
  };
  if (n.kind === "in" || n.kind === "out") {
    return (
      <g {...common}>
        <rect x={x} y={y} width={w} height={h} rx={11} fill={C.box} stroke={ring ?? C.port} strokeWidth={ring ? 2 : 1} />
        <text x={x + w / 2} y={y + h / 2 + 4} textAnchor="middle" fill={C.port}>{n.label}</text>
      </g>
    );
  }
  if (n.kind === "const") {
    return (
      <g {...common}>
        <rect x={x} y={y} width={w} height={h} rx={3} fill="none" stroke={ring ?? C.dim} strokeDasharray="3 2" />
        <text x={x + w / 2} y={y + h / 2 + 4} textAnchor="middle" fill={C.dim}>{n.label}</text>
      </g>
    );
  }
  const reg = n.kind === "reg";
  return (
    <g {...common}>
      <title>{n.module ? `${n.label}: double-click to go inside` : n.label}</title>
      <rect x={x} y={y} width={w} height={h} rx={4} fill={C.box} stroke={ring ?? (reg ? C.ff : C.line)} strokeWidth={ring ? 2.2 : reg ? 1.6 : 1} />
      {n.kind === "inst" && <rect x={x + 3} y={y + 3} width={w - 6} height={h - 6} rx={3} fill="none" stroke={C.port} strokeWidth={0.8} />}
      <text x={x + w / 2} y={y + h / 2 + 4} textAnchor="middle" fontWeight="bold" fill={reg ? C.ff : n.kind === "inst" ? C.port : C.text}>{n.label}</text>
      {n.ports.map((p, i) => (reg && p.name === "CLK"
        ? <path key={i} d={`M${p.x},${p.y - 5} L${p.x + 7},${p.y} L${p.x},${p.y + 5}`} fill="none" stroke={C.ff} />
        : <text key={i} x={p.west ? p.x + 4 : p.x - 4} y={p.y + 3} textAnchor={p.west ? "start" : "end"} fontSize={9} fill={C.dim}>{p.name}</text>))}
    </g>
  );
}
