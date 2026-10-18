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
interface YosysModule {
  attributes?: Record<string, unknown>;
  ports?:      Record<string, { direction: string; bits: Bit[] }>;
  cells?:      Record<string, { type: string; port_directions?: Record<string, string>; connections: Record<string, Bit[]> }>;
}
export interface YosysNetlist { modules?: Record<string, YosysModule> }

const isRegister = (type: string) => /dff|dlatch|\$sr\b/.test(type);

/** Schematic of the top module: ports, cells ($add, $mux, $dff, …) and nets. */
export async function schematicSvg(netlist: YosysNetlist): Promise<string | null> {
  const modules = Object.values(netlist.modules ?? {});
  const mod = modules.find((m) => m.attributes?.top) ?? modules[0];
  if (!mod) return null;

  const children: ElkNode[] = [];
  const kind    = new Map<string, "in" | "out" | "cell" | "reg" | "const">();
  const label   = new Map<string, string>();
  const portTxt = new Map<string, string>();
  const drivers = new Map<Bit, string>();               // net bit -> driving ELK port
  const sinks: { port: string; bits: Bit[] }[] = [];
  const fixed = { "elk.portConstraints": "FIXED_SIDE" };

  for (const [name, p] of Object.entries(mod.ports ?? {})) {
    const id = `p${children.length}`, out = p.direction !== "input";
    const text = p.bits.length > 1 ? `${name}[${p.bits.length}]` : name;
    kind.set(id, out ? "out" : "in"); label.set(id, text);
    children.push({
      id, width: text.length * CHAR_W + 18, height: 22,
      ports: [{ id: `${id}.x`, width: 1, height: 1, layoutOptions: { "elk.port.side": out ? "WEST" : "EAST" } }],
      layoutOptions: { ...fixed, "elk.layered.layering.layerConstraint": out ? "LAST_SEPARATE" : "FIRST_SEPARATE" },
    });
    if (out) sinks.push({ port: `${id}.x`, bits: p.bits });
    else p.bits.forEach((b) => drivers.set(b, `${id}.x`));
  }

  for (const cell of Object.values(mod.cells ?? {})) {
    const id = `c${children.length}`;
    const conns = Object.entries(cell.connections ?? {});
    const isOut = (pn: string) => cell.port_directions?.[pn] === "output";
    const ins = conns.filter(([pn]) => !isOut(pn)), outs = conns.filter(([pn]) => isOut(pn));
    const text = cell.type.startsWith("$") ? cell.type.slice(1) : cell.type;   // "$add" -> "add"
    const longest = Math.max(0, ...conns.map(([pn]) => pn.length));
    kind.set(id, isRegister(cell.type) ? "reg" : "cell"); label.set(id, text);
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
  const bus  = new Set<string>();
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
      kind.set(id, "const"); label.set(id, text);
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

  const out: string[] = [];
  for (const n of g.children ?? []) {
    const x = n.x ?? 0, y = n.y ?? 0, w = n.width ?? 0, h = n.height ?? 0;
    const k = kind.get(n.id), t = esc(label.get(n.id) ?? "");
    if (k === "in" || k === "out") {
      out.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="11" fill="${C.box}" stroke="${C.port}"/>`,
               `<text x="${x + w / 2}" y="${y + h / 2 + 4}" text-anchor="middle" fill="${C.port}">${t}</text>`);
      continue;
    }
    if (k === "const") {
      out.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="none" stroke="${C.dim}" stroke-dasharray="3 2"/>`,
               `<text x="${x + w / 2}" y="${y + h / 2 + 4}" text-anchor="middle" fill="${C.dim}">${t}</text>`);
      continue;
    }
    const stroke = k === "reg" ? C.ff : C.line;
    out.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="${C.box}" stroke="${stroke}" stroke-width="${k === "reg" ? 1.6 : 1}"/>`,
             `<text x="${x + w / 2}" y="${y + h / 2 + 4}" text-anchor="middle" font-weight="bold" fill="${k === "reg" ? C.ff : C.text}">${t}</text>`);
    for (const p of n.ports ?? []) {
      const px = x + (p.x ?? 0), py = y + (p.y ?? 0), west = (p.x ?? 0) < w / 2;
      const name = portTxt.get(p.id) ?? "";
      if (k === "reg" && name === "CLK") {          // clock-input wedge
        out.push(`<path d="M${px},${py - 5} L${px + 7},${py} L${px},${py + 5}" fill="none" stroke="${C.ff}"/>`);
        continue;
      }
      out.push(`<text x="${west ? px + 4 : px - 4}" y="${py + 3}" text-anchor="${west ? "start" : "end"}" font-size="9" fill="${C.dim}">${esc(name)}</text>`);
    }
  }
  out.push(...edgePaths(g.edges ?? [], (e) => (bus.has(e.id) ? 2.2 : 1.1)));
  return svgDoc(Math.ceil(g.width ?? 0), Math.ceil(g.height ?? 0), out);
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
