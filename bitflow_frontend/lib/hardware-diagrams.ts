/**
 * lib/hardware-diagrams.ts — server-side SVG drawings of Yosys results:
 * a schematic of the top module and FSM state diagrams, laid out with ELK.
 *
 * The SVG is shown in the browser through <img> (a data: URL), where scripts
 * never run, and every piece of text is XML-escaped as well — signal names
 * come from user code (Verilog escaped identifiers can contain anything).
 */

import ELK from "elkjs/lib/elk.bundled.js";
import type { ElkExtendedEdge, ElkNode } from "elkjs/lib/elk-api";

const elk = new ELK();

const C = {
  line: "#7c8aa5", text: "#d6dbe4", dim: "#8a93a6", box: "#16181f",
  ff: "#00e87a", port: "#5eb3ff", label: "#0c0d11",
};
const CHAR_W = 7;     // px per character at 11px monospace
const FONT   = `font-family="ui-monospace,SFMono-Regular,Menlo,Consolas,monospace"`;

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

function svgDoc(w: number, h: number, body: string[]): string {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" ${FONT} font-size="11">`,
    `<defs><marker id="a" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">`,
    `<path d="M0,0 L8,4 L0,8 z" fill="${C.line}"/></marker></defs>`,
    ...body,
    `</svg>`,
  ].join("\n");
}

function edgePaths(edges: ElkExtendedEdge[], width: (e: ElkExtendedEdge) => number): string[] {
  return edges.flatMap((e) => (e.sections ?? []).map((s) => {
    const pts = [s.startPoint, ...(s.bendPoints ?? []), s.endPoint].map((p) => `${p.x},${p.y}`).join(" ");
    return `<polyline points="${pts}" fill="none" stroke="${C.line}" stroke-width="${width(e)}" marker-end="url(#a)"/>`;
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Schematic
// ─────────────────────────────────────────────────────────────────────────────

type Bit = number | string;   // net number, or a constant "0" / "1" / "x" / "z"
export interface YosysModule {
  attributes?: Record<string, unknown>;
  ports?:      Record<string, { direction: string; bits: Bit[] }>;
  cells?:      Record<string, { type: string; attributes?: Record<string, unknown>; port_directions?: Record<string, string>; connections: Record<string, Bit[]> }>;
  netnames?:   Record<string, { bits: Bit[]; attributes?: Record<string, unknown> }>;
}
export interface YosysNetlist { modules?: Record<string, YosysModule> }

/** A source range from Yosys' src attribute ("design.v:12.3-14.9"; several joined by "|"). */
export interface SrcLoc { file: string; line: number; endLine: number }
export function parseSrc(src: unknown): SrcLoc[] {
  if (typeof src !== "string") return [];
  return src.split("|").flatMap((part) => {
    const m = /^(.*):(\d+)(?:\.\d+)?(?:-(\d+)(?:\.\d+)?)?$/.exec(part.trim());
    return m ? [{ file: m[1], line: Number(m[2]), endLine: Number(m[3] ?? m[2]) }] : [];
  });
}

export interface SchPort { name: string; x: number; y: number; west: boolean }
export interface SchNode {
  id: string;
  kind: "in" | "out" | "cell" | "reg" | "const" | "inst";
  label: string;
  /** For an instance: the module it is (drill into it). For a cell: its Yosys name. */
  module?: string;
  name?: string;
  x: number; y: number; w: number; h: number;
  ports: SchPort[];
  src: SrcLoc[];
}
export interface SchEdge { id: string; sections: [number, number][][]; wide: boolean; net: string }
export interface SchLayout { module: string; width: number; height: number; nodes: SchNode[]; edges: SchEdge[]; cells: number }

const isRegister = (type: string) => /dff|dlatch|\$sr\b/.test(type);

/** The modules of a netlist, top first, and which one is the top. */
export function schematicModules(netlist: YosysNetlist): { top: string | null; names: string[] } {
  const entries = Object.entries(netlist.modules ?? {});
  const top = entries.find(([, m]) => m.attributes?.top)?.[0] ?? entries[0]?.[0] ?? null;
  return { top, names: entries.map(([n]) => n).sort((a, b) => (a === top ? -1 : b === top ? 1 : a.localeCompare(b))) };
}

/**
 * One module of the netlist laid out with ELK (the top by default): its ports, cells ($add, $mux, $dff, …),
 * instances of the netlist's other modules (drawn double-edged, to drill into), constants and nets, each
 * with its source range for cross-probing. Edges carry the driver they come from, so a net can be lit whole.
 */
export async function schematicLayout(netlist: YosysNetlist, moduleName?: string): Promise<SchLayout | null> {
  const name = moduleName ?? schematicModules(netlist).top;
  const mod = name ? netlist.modules?.[name] : undefined;
  if (!name || !mod) return null;

  const children: ElkNode[] = [];
  const meta = new Map<string, Omit<SchNode, "x" | "y" | "w" | "h" | "ports">>();
  const portTxt = new Map<string, string>();
  const drivers = new Map<Bit, string>();               // net bit -> driving ELK port
  const sinks: { port: string; bits: Bit[] }[] = [];
  const fixed = { "elk.portConstraints": "FIXED_SIDE" };

  for (const [pname, p] of Object.entries(mod.ports ?? {})) {
    const id = `p${children.length}`, out = p.direction !== "input";
    const text = p.bits.length > 1 ? `${pname}[${p.bits.length}]` : pname;
    meta.set(id, { id, kind: out ? "out" : "in", label: text, name: pname, src: parseSrc(mod.netnames?.[pname]?.attributes?.src) });
    children.push({
      id, width: text.length * CHAR_W + 18, height: 22,
      ports: [{ id: `${id}.x`, width: 1, height: 1, layoutOptions: { "elk.port.side": out ? "WEST" : "EAST" } }],
      layoutOptions: { ...fixed, "elk.layered.layering.layerConstraint": out ? "LAST_SEPARATE" : "FIRST_SEPARATE" },
    });
    if (out) sinks.push({ port: `${id}.x`, bits: p.bits });
    else p.bits.forEach((b) => drivers.set(b, `${id}.x`));
  }

  let cells = 0;
  for (const [cname, cell] of Object.entries(mod.cells ?? {})) {
    cells++;
    const id = `c${children.length}`;
    const conns = Object.entries(cell.connections ?? {});
    const sub = netlist.modules?.[cell.type] ? cell.type : undefined;
    const subPorts = sub ? netlist.modules![sub].ports ?? {} : {};
    const isOut = (pn: string) => (cell.port_directions?.[pn] ?? (subPorts[pn]?.direction === "output" ? "output" : "input")) === "output";
    const ins = conns.filter(([pn]) => !isOut(pn)), outs = conns.filter(([pn]) => isOut(pn));
    const text = sub ? `${cname.replace(/^\\/, "")} : ${sub}` : cell.type.startsWith("$") ? cell.type.slice(1) : cell.type;
    const longest = Math.max(0, ...conns.map(([pn]) => pn.length));
    meta.set(id, { id, kind: sub ? "inst" : isRegister(cell.type) ? "reg" : "cell", label: text, module: sub, name: cname, src: parseSrc(cell.attributes?.src) });
    children.push({
      id,
      width:  Math.max(60, text.length * CHAR_W + 2 * longest * 6 + 28),
      height: Math.max(34, Math.max(ins.length, outs.length) * 16 + 14),
      layoutOptions: fixed,
      ports: [
        ...ins.map(([pn]) => ({ id: `${id}.${pn}`, width: 1, height: 1, layoutOptions: { "elk.port.side": "WEST" } })),
        ...outs.map(([pn]) => ({ id: `${id}.${pn}`, width: 1, height: 1, layoutOptions: { "elk.port.side": "EAST" } })),
      ],
    });
    for (const [pn] of conns) portTxt.set(`${id}.${pn}`, pn);
    for (const [pn, bits] of outs) bits.forEach((b) => drivers.set(b, `${id}.${pn}`));
    for (const [pn, bits] of ins) sinks.push({ port: `${id}.${pn}`, bits });
  }

  const edges: ElkExtendedEdge[] = [];
  const bus = new Set<string>();
  const seen = new Set<string>();
  const addEdge = (src: string, dst: string, wide: boolean) => {
    if (seen.has(`${src}>${dst}`)) return;
    seen.add(`${src}>${dst}`);
    const id = `e${edges.length}`;
    edges.push({ id, sources: [src], targets: [dst] });
    if (wide) bus.add(id);
  };

  for (const { port, bits } of sinks) {
    if (bits.length && bits.every((b) => typeof b === "string")) {       // tied to a constant
      const id = `k${children.length}`;
      const text = bits.length === 1 ? String(bits[0]) : `${bits.length}'b${[...bits].reverse().join("")}`;
      meta.set(id, { id, kind: "const", label: text, src: [] });
      children.push({
        id, width: text.length * CHAR_W + 12, height: 18, layoutOptions: fixed,
        ports: [{ id: `${id}.x`, width: 1, height: 1, layoutOptions: { "elk.port.side": "EAST" } }],
      });
      addEdge(`${id}.x`, port, bits.length > 1);
      continue;
    }
    const count = new Map<string, number>();
    for (const b of bits) {
      const d = drivers.get(b);
      if (d) count.set(d, (count.get(d) ?? 0) + 1);
    }
    count.forEach((n, src) => addEdge(src, port, n > 1));
  }

  const g: ElkNode = await elk.layout({
    id: "root", children, edges,
    layoutOptions: {
      "elk.algorithm": "layered", "elk.direction": "RIGHT", "elk.edgeRouting": "ORTHOGONAL",
      "elk.spacing.nodeNode": "22", "elk.layered.spacing.nodeNodeBetweenLayers": "44",
      "elk.layered.spacing.edgeNodeBetweenLayers": "14", "elk.padding": "[top=16,left=16,bottom=16,right=16]",
    },
  });

  const nodes: SchNode[] = (g.children ?? []).map((n) => {
    const x = n.x ?? 0, y = n.y ?? 0, w = n.width ?? 0;
    return {
      ...meta.get(n.id)!, x, y, w, h: n.height ?? 0,
      ports: (n.ports ?? []).map((p) => ({ name: portTxt.get(p.id) ?? "", x: x + (p.x ?? 0), y: y + (p.y ?? 0), west: (p.x ?? 0) < w / 2 })),
    };
  });
  const schEdges: SchEdge[] = (g.edges ?? []).map((e) => ({
    id: e.id,
    sections: (e.sections ?? []).map((sec) => [sec.startPoint, ...(sec.bendPoints ?? []), sec.endPoint].map((pt) => [pt.x, pt.y] as [number, number])),
    wide: bus.has(e.id),
    net: (e as ElkExtendedEdge).sources[0],
  }));
  return { module: name, width: Math.ceil(g.width ?? 0), height: Math.ceil(g.height ?? 0), nodes, edges: schEdges, cells };
}

/** The ids of the nodes made from source line `line` of `file` (the editor's cursor, lit on the schematic). */
export function nodesAtLine(layout: SchLayout, file: string, line: number): string[] {
  return layout.nodes.filter((n) => n.src.some((s) => s.file === file && line >= s.line && line <= s.endLine)).map((n) => n.id);
}

/** A layout as a static SVG document (shown through <img>; text is escaped). */
export function layoutSvg(L: SchLayout): string {
  const out: string[] = [];
  for (const n of L.nodes) {
    const { x, y, w, h } = n, t = esc(n.label);
    if (n.kind === "in" || n.kind === "out") {
      out.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="11" fill="${C.box}" stroke="${C.port}"/>`,
               `<text x="${x + w / 2}" y="${y + h / 2 + 4}" text-anchor="middle" fill="${C.port}">${t}</text>`);
      continue;
    }
    if (n.kind === "const") {
      out.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="none" stroke="${C.dim}" stroke-dasharray="3 2"/>`,
               `<text x="${x + w / 2}" y="${y + h / 2 + 4}" text-anchor="middle" fill="${C.dim}">${t}</text>`);
      continue;
    }
    const reg = n.kind === "reg";
    out.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="${C.box}" stroke="${reg ? C.ff : C.line}" stroke-width="${reg ? 1.6 : 1}"/>`);
    if (n.kind === "inst") out.push(`<rect x="${x + 3}" y="${y + 3}" width="${w - 6}" height="${h - 6}" rx="3" fill="none" stroke="${C.port}" stroke-width="0.8"/>`);
    out.push(`<text x="${x + w / 2}" y="${y + h / 2 + 4}" text-anchor="middle" font-weight="bold" fill="${reg ? C.ff : n.kind === "inst" ? C.port : C.text}">${t}</text>`);
    for (const p of n.ports) {
      if (reg && p.name === "CLK") {          // clock-input wedge
        out.push(`<path d="M${p.x},${p.y - 5} L${p.x + 7},${p.y} L${p.x},${p.y + 5}" fill="none" stroke="${C.ff}"/>`);
        continue;
      }
      out.push(`<text x="${p.west ? p.x + 4 : p.x - 4}" y="${p.y + 3}" text-anchor="${p.west ? "start" : "end"}" font-size="9" fill="${C.dim}">${esc(p.name)}</text>`);
    }
  }
  for (const e of L.edges) for (const sec of e.sections) {
    out.push(`<polyline points="${sec.map(([px, py]) => `${px},${py}`).join(" ")}" fill="none" stroke="${C.line}" stroke-width="${e.wide ? 2.2 : 1.1}" marker-end="url(#a)"/>`);
  }
  return svgDoc(L.width, L.height, out);
}

/** The static drawing (lab report, server route): the top module, when it's small enough to read as a picture. */
export const STATIC_SCHEMATIC_CELLS = 300;
export async function schematicSvg(netlist: YosysNetlist): Promise<string | null> {
  const L = await schematicLayout(netlist);
  return L && L.cells <= STATIC_SCHEMATIC_CELLS ? layoutSvg(L) : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// FSM state diagram
// ─────────────────────────────────────────────────────────────────────────────

export interface FsmInfo {
  module:      string;
  stateReg:    string;
  states:      { id: number; code: number | null; name: string | null; reset: boolean }[];
  transitions: { from: number; to: number; conditions: string[] }[];
}

export function stateLabel(s: FsmInfo["states"][number]): string {
  if (s.name) return s.code !== null ? `${s.name} (${s.code})` : s.name;
  return s.code !== null ? String(s.code) : `s${s.id}`;
}

const MAX_LABEL = 44;

export async function fsmSvg(fsm: FsmInfo): Promise<string> {
  const children: ElkNode[] = fsm.states.map((s) => ({
    id: `s${s.id}`, width: stateLabel(s).length * CHAR_W + 28, height: 30,
  }));
  const edges: ElkExtendedEdge[] = fsm.transitions.map((t, i) => {
    let text = t.conditions.map((c) => c || "always").join(" | ");
    if (text.length > MAX_LABEL) text = text.slice(0, MAX_LABEL - 1) + "…";
    return {
      id: `t${i}`, sources: [`s${t.from}`], targets: [`s${t.to}`],
      labels: [{ id: `l${i}`, text, width: text.length * 6 + 8, height: 14 }],
    };
  });

  const g: ElkNode = await elk.layout({
    id: "root", children, edges,
    layoutOptions: {
      "elk.algorithm": "layered", "elk.direction": "RIGHT", "elk.edgeRouting": "POLYLINE",
      "elk.spacing.nodeNode": "36", "elk.layered.spacing.nodeNodeBetweenLayers": "70",
      "elk.spacing.edgeLabel": "4", "elk.edgeLabels.placement": "CENTER",
      "elk.padding": "[top=20,left=20,bottom=20,right=20]",
    },
  });

  const byId = new Map(fsm.states.map((s) => [`s${s.id}`, s]));
  const out = edgePaths(g.edges ?? [], () => 1.2);
  for (const e of g.edges ?? []) {
    for (const l of e.labels ?? []) {
      const x = l.x ?? 0, y = l.y ?? 0, w = l.width ?? 0, h = l.height ?? 0;
      out.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2" fill="${C.label}" opacity="0.85"/>`,
               `<text x="${x + w / 2}" y="${y + h - 3}" text-anchor="middle" font-size="10" fill="${C.dim}">${esc(l.text ?? "")}</text>`);
    }
  }
  for (const n of g.children ?? []) {
    const s = byId.get(n.id)!;
    const x = n.x ?? 0, y = n.y ?? 0, w = n.width ?? 0, h = n.height ?? 0;
    out.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="${C.box}" stroke="${C.ff}" stroke-width="1.4"/>`);
    if (s.reset) out.push(`<rect x="${x - 3}" y="${y - 3}" width="${w + 6}" height="${h + 6}" rx="${h / 2 + 3}" fill="none" stroke="${C.ff}"/>`);
    out.push(`<text x="${x + w / 2}" y="${y + h / 2 + 4}" text-anchor="middle" font-weight="bold" fill="${C.text}">${esc(stateLabel(s))}</text>`);
  }
  return svgDoc(Math.ceil(g.width ?? 0), Math.ceil(g.height ?? 0), out);
}
