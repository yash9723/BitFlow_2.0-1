"use client";
/**
 * components/studio/CircuitParts.tsx — how each circuit part is drawn: gate symbols, switches,
 * displays and pins. Shared by the editor (components/studio/CircuitTool.tsx) and the Academy's
 * read-only viewer (components/studio/CircuitViewer.tsx).
 */

import { createContext, useContext } from "react";
import { toNumber } from "@/lib/gate-sim";
import { KEY_FACES } from "@/lib/lab/peripherals";
import { type Part, type PartKind, type PinRef, ALU_OPS, INPUT_KINDS, constValue, pinWidth, pins, selBits, width } from "@/lib/studio/circuit";
import { baseSize, frameTransform, localPin, pinDir, pinPos, size, uprightTransform } from "@/lib/studio/circuit-edit";

export const hex = (v: number, w: number) => v.toString(16).toUpperCase().padStart(Math.ceil(w / 4), "0");

/** Distinctive-shape gate outline (ANSI/IEEE 91) in a gw × h box; OR/XOR have a curved back, so input pins get stubs. */
function gateShape(kind: PartKind, x: number, y: number, gw: number, h: number): { body: string; back?: string; inset: (py: number) => number } {
  const core = kind === "nand" ? "and" : kind === "nor" ? "or" : kind === "xnor" ? "xor" : kind;
  if (core === "not") return { body: `M ${x} ${y + 3} L ${x + gw} ${y + h / 2} L ${x} ${y + h - 3} Z`, inset: () => 0 };
  if (core === "and") {
    const rx = Math.min(h / 2, gw * 0.55);
    return { body: `M ${x} ${y} H ${x + gw - rx} A ${rx} ${h / 2} 0 0 1 ${x + gw - rx} ${y + h} H ${x} Z`, inset: () => 0 };
  }
  const xo = core === "xor" ? 7 : 0, X = x + xo, W = gw - xo, bow = W * 0.3;
  const inset = (py: number) => { const t = Math.max(0, Math.min(1, (py - y) / h)); return xo + 2 * t * (1 - t) * bow; };
  return {
    body: `M ${X} ${y} Q ${X + W * 0.62} ${y} ${x + gw} ${y + h / 2} Q ${X + W * 0.62} ${y + h} ${X} ${y + h} Q ${X + bow} ${y + h / 2} ${X} ${y} Z`,
    back: core === "xor" ? `M ${x} ${y} Q ${x + bow} ${y + h / 2} ${x} ${y + h}` : undefined,
    inset,
  };
}

/** How the part being drawn is turned: its text stays upright. */
const Frame = createContext<Pick<Part, "rot" | "flip">>({});
function T(props: React.SVGProps<SVGTextElement> & { x: number; y: number }) {
  const frame = useContext(Frame);
  return <text {...props} transform={uprightTransform(frame, props.x, props.y)} />;
}
const IEC_MARK: Partial<Record<PartKind, string>> = { and: "&", nand: "&", or: "≥1", nor: "≥1", xor: "=1", xnor: "=1", not: "1" };

/** A keypad key's code: its face, in hex (A-D are 10-13), with * = 14 and # = 15. */
const keyCode = (face: string) => (face === "*" ? 14 : face === "#" ? 15 : parseInt(face, 16));

/** A pin's name, just inside the part from the pin. */
function pinName(q: { x: number; y: number }, d: { x: number; y: number }, name: string, fontSize: number) {
  const x = d.y ? q.x : q.x - d.x * 6, y = d.y === -1 ? q.y + 10 : d.y === 1 ? q.y - 5 : q.y + 3;
  return <text x={x} y={y} textAnchor={d.y ? "middle" : d.x === 1 ? "end" : "start"} fontSize={fontSize} fill="#6b6f85" fontFamily="monospace">{name}</text>;
}

export default function PartView({ p, selected, hot, valueOf, inputValue, outputBits, onBodyDown, onPinDown, onKnob, wiring, snapPin, pinTitle, onOpen, source, live, onKeypad, iec, fixed }: {
  p: Part; selected: boolean; hot: boolean; valueOf: (r: PinRef) => number; inputValue: number; outputBits: number[] | null;
  onBodyDown: (e: React.PointerEvent) => void; onPinDown: (e: React.PointerEvent, pin: string, isOutput: boolean) => void;
  onKnob: (down: boolean, back?: boolean) => void;
  /** A wire being drawn from another part: its direction and width (pins it can end on glow). */
  wiring: { isOutput: boolean; width: number } | null;
  /** The pin of this part the wire would snap to. */
  snapPin: string | null;
  pinTitle: (pin: string, isOutput: boolean) => string;
  onOpen?: () => void;
  /** What drives a probe's input, or an ALU's op. */
  source?: PinRef; live: boolean;
  onKeypad: (code: number | null) => void;
  iec: boolean;
  /** Can't be dragged or wired: an Academy chapter's circuit. */
  fixed?: boolean;
}) {
  const { w, h } = baseSize(p);
  const outer = size(p);
  const { inputs, outputs } = pins(p);
  const stroke = selected ? "#4db8ff" : hot ? "#ffb547" : "#5a5e74";
  const outOn = outputs.length && pinWidth(p, outputs[0]) === 1 ? valueOf({ part: p.id, pin: outputs[0] }) === 1 : false;
  const inverted = ["nand", "nor", "xnor", "not"].includes(p.kind);
  const showPinNames = !["switch", "button", "clock", "hexin", "const0", "const1", "const", "led", "hexout", "not", "and", "or", "xor", "nand", "nor", "xnor", "probe", "bus", "tunin", "tunout"].includes(p.kind);
  const isGate = ["not", "and", "or", "xor", "nand", "nor", "xnor"].includes(p.kind);
  const shape = isGate ? gateShape(p.kind, p.x, p.y, w - (inverted ? 8 : 0), h) : null;
  const box = (title: string, sub?: string) => <>
    <rect x={p.x} y={p.y} width={w} height={h} rx={4} fill="#13141a" stroke={stroke} />
    <T x={p.x + w / 2} y={p.y + 13} textAnchor="middle" fontSize={9} fontWeight={700} fill="#c8cad6" fontFamily="monospace">{title}</T>
    {sub && <T x={p.x + w / 2} y={p.y + h - 6} textAnchor="middle" fontSize={8} fill="#6b6f85" fontFamily="monospace">{sub}</T>}
  </>;
  /** A pin a wire being drawn could end on: green if the widths match, amber if not; brighter where it would snap. */
  const glow = (q: { x: number; y: number }, pin: string) => {
    const match = pinWidth(p, pin) === wiring!.width, snap = snapPin === pin, colour = match ? "#00e87a" : "#ffb547";
    return <circle cx={q.x} cy={q.y} r={snap ? 8 : 6.5} fill={snap ? `${colour}33` : "none"} stroke={colour} strokeWidth={snap ? 2 : 1.2} opacity={snap ? 1 : 0.55} style={{ pointerEvents: "none" }} />;
  };
  const clkMark = inputs.includes("clk") ? (() => { const cy = localPin(p, "clk").y; return <path d={`M ${p.x} ${cy - 5} L ${p.x + 7} ${cy} L ${p.x} ${cy + 5}`} fill="none" stroke="#8b8fa3" />; })() : null;

  let body: React.ReactNode;
  if (p.kind === "keypad") {
    const down = inputValue & 16 ? inputValue & 15 : null;
    body = <>
      <rect x={p.x} y={p.y} width={w} height={h} rx={6} fill="#13141a" stroke={stroke} />
      {KEY_FACES.map((face, i) => {
        const kx = p.x + 6 + (i & 3) * 28, ky = p.y + 6 + (i >> 2) * 28, code = keyCode(face), on = down === code;
        return (
          <g key={face} data-key={face} style={{ cursor: "pointer" }}
             onPointerDown={(e) => { e.stopPropagation(); onKeypad(code); }} onPointerUp={(e) => { e.stopPropagation(); onKeypad(null); }}
             onPointerLeave={() => { if (on) onKeypad(null); }}>
            <rect x={kx} y={ky} width={26} height={26} rx={4} fill={on ? "#00e87a" : "#1f2130"} stroke={on ? "#00e87a" : "#3a3d4f"} />
            <T x={kx + 13} y={ky + 17} textAnchor="middle" fontSize={12} fontWeight={700} fill={on ? "#0b0c10" : "#c8cad6"} fontFamily="monospace" style={{ pointerEvents: "none" }}>{face}</T>
          </g>
        );
      })}
    </>;
  } else if (INPUT_KINDS.includes(p.kind) && p.kind !== "hexin") {
    const on = p.kind === "clock" ? outOn : inputValue === 1;
    body = (
      <>
        <rect x={p.x} y={p.y} width={w} height={h} rx={6} fill="#13141a" stroke={stroke} />
        <g data-knob={p.label} style={{ cursor: "pointer" }}
           onPointerDown={(e) => { e.stopPropagation(); onKnob(true); }} onPointerUp={(e) => { e.stopPropagation(); onKnob(false); }}
           onPointerLeave={() => { if (p.kind === "button") onKnob(false); }}>
          {p.kind === "switch" && <>
            <rect x={p.x + 8} y={p.y + 10} width={26} height={16} rx={8} fill={on ? "rgba(0,232,122,0.3)" : "#1f2130"} stroke={on ? "#00e87a" : "#3a3d4f"} />
            <circle cx={on ? p.x + 26 : p.x + 16} cy={p.y + 18} r={6} fill={on ? "#00e87a" : "#8b8fa3"} />
          </>}
          {p.kind === "button" && <circle cx={p.x + 20} cy={p.y + 18} r={10} fill={on ? "#00e87a" : "#2a2d3a"} stroke="#8b8fa3" />}
          {p.kind === "clock" && <>
            <rect x={p.x + 6} y={p.y + 8} width={30} height={20} rx={3} fill="#1f2130" stroke={on ? "#00e87a" : "#3a3d4f"} />
            <path d={`M ${p.x + 9} ${p.y + 23} H ${p.x + 15} V ${p.y + 13} H ${p.x + 21} V ${p.y + 23} H ${p.x + 27} V ${p.y + 13} H ${p.x + 33}`} stroke="#8b8fa3" fill="none" />
          </>}
        </g>
      </>
    );
  } else if (p.kind === "hexin") {
    const W = width(p);
    body = <>
      <rect x={p.x} y={p.y} width={w} height={h} rx={6} fill="#13141a" stroke={stroke} />
      <g data-knob={p.label} style={{ cursor: "pointer" }} onPointerDown={(e) => { e.stopPropagation(); onKnob(true, e.shiftKey); }}>
        <rect x={p.x + 6} y={p.y + 7} width={w - 22} height={h - 14} rx={3} fill="#0b1a24" stroke="#2f5d7a" />
        <T x={p.x + 6 + (w - 22) / 2} y={p.y + h / 2 + 5} textAnchor="middle" fontSize={14} fontWeight={700} fill="#7cc4ff" fontFamily="monospace">{hex(inputValue, W)}</T>
      </g>
      <T x={p.x + w - 9} y={p.y + h / 2 + 3} textAnchor="middle" fontSize={8} fill="#6b6f85" fontFamily="monospace">{W}b</T>
    </>;
  } else if (p.kind === "const") {
    body = <>
      <rect x={p.x} y={p.y} width={w} height={h} rx={6} fill="#13141a" stroke={stroke} />
      <T x={p.x + w / 2 - 4} y={p.y + h / 2 + 5} textAnchor="middle" fontSize={13} fontWeight={700} fill="#9fd0ff" fontFamily="monospace">{`${width(p)}'h${hex(constValue(p), width(p))}`}</T>
    </>;
  } else if (p.kind === "hexout") {
    const W = width(p), v = outputBits ? toNumber(outputBits) : 0;
    body = <>
      <rect x={p.x} y={p.y} width={w} height={h} rx={6} fill="#0d0e11" stroke={stroke} />
      <T x={p.x + w / 2 + 3} y={p.y + h / 2 + 4} textAnchor="middle" fontSize={20} fontWeight={700} fill="#ff6b6b" fontFamily="monospace"
            style={{ filter: "drop-shadow(0 0 4px rgba(255,90,90,0.6))" }}>{hex(v, W)}</T>
      <T x={p.x + w - 4} y={p.y + h - 4} textAnchor="end" fontSize={8} fill="#6b6f85" fontFamily="monospace">{v}</T>
    </>;
  } else if (p.kind === "tff" || p.kind === "jkff") {
    body = <>{box(p.kind === "tff" ? "T" : "JK")}{clkMark}
      <T x={p.x + w - 6} y={p.y + h / 2 + 4} textAnchor="end" fontSize={10} fill="#8b8fa3" fontFamily="monospace">Q</T></>;
  } else if (p.kind === "reg" || p.kind === "counter") {
    body = <>{box(p.kind === "reg" ? "REG" : "COUNT", `${width(p)} bits`)}{clkMark}</>;
  } else if (p.kind === "shift") {
    body = <>{box("SHIFT", `${width(p)} bits`)}{clkMark}</>;
  } else if (p.kind === "rom" || p.kind === "ram") {
    body = <>{box(p.kind.toUpperCase(), `${2 ** selBits(p)} × ${width(p)}`)}{clkMark}</>;
  } else if (p.kind === "encoder" || p.kind === "priority") {
    body = <>{box(p.kind === "encoder" ? "ENC" : "PRI ENC", `${2 ** width(p)}→${width(p)}`)}</>;
  } else if (p.kind === "bcd7") {
    body = <>{box("BCD→7", "0-9")}</>;
  } else if (p.kind === "alu") {
    body = <>{box("ALU", live ? ALU_OPS[source ? valueOf(source) : 0] : `${width(p)} bits`)}</>;
  } else if (p.kind === "mux" || p.kind === "demux") {
    const inset = 14;
    body = <>
      <path d={p.kind === "mux" ? `M ${p.x} ${p.y} L ${p.x + w} ${p.y + inset} V ${p.y + h - inset} L ${p.x} ${p.y + h} Z`
                                : `M ${p.x} ${p.y + inset} L ${p.x + w} ${p.y} V ${p.y + h} L ${p.x} ${p.y + h - inset} Z`} fill="#13141a" stroke={stroke} />
      <T x={p.x + w / 2 + (p.kind === "mux" ? 6 : -6)} y={p.y + h / 2 + 3} textAnchor="middle" fontSize={9} fill="#8b8fa3" fontFamily="monospace">{p.kind === "mux" ? `${2 ** selBits(p)}:1` : `1:${2 ** selBits(p)}`}</T>
    </>;
  } else if (p.kind === "probe") {
    const W = width(p), v = source ? valueOf(source) : 0;
    body = <>
      <rect x={p.x} y={p.y} width={w} height={h} rx={h / 2} fill="#0b1a24" stroke={selected || hot ? stroke : "#2f5d7a"} />
      <T x={p.x + w / 2 + 3} y={p.y + h / 2 + 4} textAnchor="middle" fontSize={12} fontWeight={700} fill={W === 1 && v === 1 ? "#00e87a" : "#7cc4ff"} fontFamily="monospace">{live && source ? (W === 1 ? String(v) : hex(v, W)) : "–"}</T>
    </>;
  } else if (p.kind === "tri") {
    body = <path d={`M ${p.x} ${p.y + 3} L ${p.x + w} ${p.y + h / 2} L ${p.x} ${p.y + h - 3} Z`} fill="#13141a" stroke={stroke} strokeWidth={1.3} strokeLinejoin="round" />;
  } else if (p.kind === "bus") {
    body = <>
      <rect x={p.x} y={p.y} width={w} height={h} rx={3} fill="#13141a" stroke={stroke} />
      <rect x={p.x + w / 2 - 3} y={p.y + 4} width={6} height={h - 8} rx={2} fill="#5aa9e6" />
    </>;
  } else if (p.kind === "adder" || p.kind === "cmp" || p.kind === "decoder") {
    body = <>{box(p.kind === "adder" ? "ADD" : p.kind === "cmp" ? "CMP" : "DEC", p.kind === "decoder" ? `${width(p)}→${2 ** width(p)}` : `${width(p)} bits`)}</>;
  } else if (p.kind === "split" || p.kind === "merge") {
    body = <>
      <rect x={p.x} y={p.y} width={w} height={h} rx={3} fill="#13141a" stroke={stroke} />
      <path d={p.kind === "split" ? `M ${p.x + 8} ${p.y + h / 2} L ${p.x + w - 8} ${p.y + 8} M ${p.x + 8} ${p.y + h / 2} L ${p.x + w - 8} ${p.y + h - 8}`
                                  : `M ${p.x + w - 8} ${p.y + h / 2} L ${p.x + 8} ${p.y + 8} M ${p.x + w - 8} ${p.y + h / 2} L ${p.x + 8} ${p.y + h - 8}`}
            stroke="#5aa9e6" strokeWidth={2} fill="none" />
    </>;
  } else if (p.kind === "const0" || p.kind === "const1") {
    body = <>
      <rect x={p.x} y={p.y} width={w} height={h} rx={6} fill="#13141a" stroke={stroke} />
      <T x={p.x + 24} y={p.y + h / 2 + 5} textAnchor="middle" fontSize={15} fontWeight={700} fontFamily="monospace" fill={p.kind === "const1" ? "#00e87a" : "#8b8fa3"}>{p.kind === "const1" ? "1" : "0"}</T>
    </>;
  } else if (p.kind === "led") {
    const on = outputBits?.[0] === 1;
    body = <>
      <rect x={p.x} y={p.y} width={w} height={h} rx={6} fill="#13141a" stroke={stroke} />
      <circle cx={p.x + 24} cy={p.y + 18} r={11} fill={on ? "#ff5a5a" : "#3a1c1c"} stroke={on ? "#ffb0b0" : "#5a2a2a"}
              style={on ? { filter: "drop-shadow(0 0 6px #ff5a5a)" } : undefined} />
    </>;
  } else if (p.kind === "seg7") {
    const bit = (i: number) => outputBits?.[i] === 1;
    const sx = p.x + 18, sy = p.y + 16, L = 22, T = 5;
    const segs: [number, number, number, number][] = [                 // a..g as rects (x, y, w, h)
      [sx + T, sy, L, T], [sx + L + T, sy + T, T, L], [sx + L + T, sy + L + 2 * T, T, L], [sx + T, sy + 2 * L + 2 * T, L, T],
      [sx, sy + L + 2 * T, T, L], [sx, sy + T, T, L], [sx + T, sy + L + T, L, T],
    ];
    body = <>
      <rect x={p.x} y={p.y} width={w} height={h} rx={6} fill="#0d0e11" stroke={stroke} />
      {segs.map(([x, y, sw, sh], i) => <rect key={i} x={x} y={y} width={sw} height={sh} rx={2} fill={bit(i) ? "#ff5a5a" : "#2a1616"} />)}
    </>;
  } else if (p.kind === "mux2") {
    body = <>
      <path d={`M ${p.x} ${p.y} L ${p.x + w} ${p.y + 14} V ${p.y + h - 14} L ${p.x} ${p.y + h} Z`} fill="#13141a" stroke={stroke} />
      <T x={p.x + w / 2 + 4} y={p.y + h / 2 + 4} textAnchor="middle" fontSize={10} fill="#8b8fa3" fontFamily="monospace">MUX</T>
    </>;
  } else if (p.kind === "dff") {
    const cy = localPin(p, "clk").y;
    body = <>
      <rect x={p.x} y={p.y} width={w} height={h} rx={4} fill="#13141a" stroke={stroke} />
      <path d={`M ${p.x} ${cy - 5} L ${p.x + 7} ${cy} L ${p.x} ${cy + 5}`} fill="none" stroke="#8b8fa3" />
      <T x={p.x + w - 6} y={p.y + h / 2 + 4} textAnchor="end" fontSize={10} fill="#8b8fa3" fontFamily="monospace">Q</T>
    </>;
  } else if (p.kind === "block") {
    body = <>
      <rect x={p.x} y={p.y} width={w} height={h} rx={5} fill="#0f1724" stroke={selected || hot ? stroke : "#3d6a93"} strokeWidth={1.5} />
      <rect x={p.x + 1} y={p.y + 1} width={w - 2} height={17} rx={4} fill="rgba(90,169,230,0.14)" />
      <T x={p.x + w / 2} y={p.y + 13} textAnchor="middle" fontSize={9.5} fontWeight={700} fill="#9fd0ff" fontFamily="monospace">{p.block}</T>
      <T x={p.x + w - 5} y={p.y + h - 5} textAnchor="end" fontSize={8} fill="#4f6f8f" fontFamily="monospace">⧉</T>
    </>;
  } else if (p.kind === "tunin" || p.kind === "tunout") {
    const inward = p.kind === "tunin";
    body = <>
      <path d={inward ? `M ${p.x} ${p.y} H ${p.x + w - 12} L ${p.x + w} ${p.y + h / 2} L ${p.x + w - 12} ${p.y + h} H ${p.x} Z`
                      : `M ${p.x + w} ${p.y} H ${p.x + 12} L ${p.x} ${p.y + h / 2} L ${p.x + 12} ${p.y + h} H ${p.x + w} Z`}
            fill="#0f1724" stroke={selected || hot ? stroke : "#3d6a93"} />
      <T x={p.x + w / 2} y={p.y + h / 2 + 4} textAnchor="middle" fontSize={10} fontWeight={700} fill="#9fd0ff" fontFamily="monospace">{p.net}</T>
    </>;
  } else if (isGate && iec) {
    const W = width(p), gw = w - (inverted ? 8 : 0);
    body = <>
      <rect x={p.x} y={p.y} width={gw} height={h} rx={2} fill={outOn ? "#122419" : "#13141a"} stroke={stroke} strokeWidth={1.3} />
      <T x={p.x + gw / 2} y={p.y + h / 2 + 4} textAnchor="middle" fontSize={12} fontWeight={700} fill="#c8cad6" fontFamily="monospace">{IEC_MARK[p.kind]}</T>
      {inverted && <circle cx={p.x + w - 4} cy={p.y + h / 2} r={4} fill="#13141a" stroke={stroke} strokeWidth={1.3} />}
      {W > 1 && <T x={p.x + gw / 2} y={p.y + h - 4} textAnchor="middle" fontSize={8} fill="#6b8fb3" fontFamily="monospace">{W}b</T>}
    </>;
  } else if (shape) {
    const W = width(p);
    body = <>
      <path d={shape.body} fill={outOn ? "#122419" : "#13141a"} stroke={stroke} strokeWidth={1.3} strokeLinejoin="round" />
      {shape.back && <path d={shape.back} fill="none" stroke={stroke} strokeWidth={1.3} />}
      {inputs.map((pin) => { const q = localPin(p, pin), d = shape.inset(q.y); return d > 0.5 ? <line key={pin} x1={q.x} y1={q.y} x2={q.x + d} y2={q.y} stroke="#5a5e74" /> : null; })}
      {inverted && <circle cx={p.x + w - 4} cy={p.y + h / 2} r={4} fill="#13141a" stroke={stroke} strokeWidth={1.3} />}
      {W > 1 && <T x={p.x + (w - 8) / 2 - 2} y={p.y + h / 2 + 3} textAnchor="middle" fontSize={8} fill="#6b8fb3" fontFamily="monospace">{W}b</T>}
    </>;
  }

  return (
    <g data-part={p.label}>
      <g onPointerDown={onBodyDown} onDoubleClick={onOpen} transform={frameTransform(p)} style={{ cursor: fixed ? "default" : "grab", filter: selected ? "drop-shadow(0 0 4px rgba(77,184,255,0.55))" : undefined }}>
        {onOpen && <title>{`${p.block}: double-click to open`}</title>}
        <Frame.Provider value={{ rot: p.rot, flip: p.flip }}>{body}</Frame.Provider>
      </g>
      {p.kind !== "tunin" && p.kind !== "tunout" && <text x={p.x + outer.w / 2} y={p.y - 5} textAnchor="middle" fontSize={10} fill={selected ? "#4db8ff" : "#8b8fa3"} fontFamily="monospace">{p.label}</text>}
      {inputs.map((pin) => {
        const q = pinPos(p, pin);
        return (
          <g key={pin} data-pin={`${p.label}.${pin}`} onPointerDown={(e) => onPinDown(e, pin, false)} style={{ cursor: fixed ? "default" : "crosshair" }}>
            <title>{pinTitle(pin, false)}</title>
            <circle cx={q.x} cy={q.y} r={8} fill="transparent" />
            {wiring?.isOutput && glow(q, pin)}
            {pinWidth(p, pin) > 1
              ? <rect x={q.x - 4} y={q.y - 4} width={8} height={8} rx={1.5} fill="#0d0e11" stroke="#5aa9e6" />
              : <circle cx={q.x} cy={q.y} r={3.5} fill="#0d0e11" stroke="#8b8fa3" />}
            {showPinNames && pinName(q, pinDir(p, pin), pin, p.kind === "seg7" ? 7 : 8)}
          </g>
        );
      })}
      {outputs.map((pin) => {
        const q = pinPos(p, pin);
        return (
          <g key={pin} data-pin={`${p.label}.${pin}`} onPointerDown={(e) => onPinDown(e, pin, true)} style={{ cursor: fixed ? "default" : "crosshair" }}>
            <title>{pinTitle(pin, true)}</title>
            <circle cx={q.x} cy={q.y} r={8} fill="transparent" />
            {wiring && !wiring.isOutput && glow(q, pin)}
            {pinWidth(p, pin) > 1
              ? <rect x={q.x - 4} y={q.y - 4} width={8} height={8} rx={1.5} fill="#0d0e11" stroke="#5aa9e6" />
              : (() => { const lit = outputs.length > 1 ? valueOf({ part: p.id, pin }) === 1 : outOn;
                         return <circle cx={q.x} cy={q.y} r={3.5} fill={lit ? "#00e87a" : "#0d0e11"} stroke={lit ? "#00e87a" : "#8b8fa3"} />; })()}
            {showPinNames && (outputs.length > 1 || p.kind === "block") && pinName(q, pinDir(p, pin), pin, 8)}
          </g>
        );
      })}
    </g>
  );
}
