/**
 * lib/board-io.ts — how a design's ports become parts on a virtual board, by name.
 * Shared by the Sandbox's board (components/BoardPanel.tsx) and the Board Lab (components/lab).
 */

export const CLOCK  = /^(clk|clock)$/i;
export const RESET  = /^(rst|reset|rst_n|reset_n|rstn|resetn|areset|arst|arst_n|aresetn)$/i;
export const BUTTON = /^(btn|key|button)/i;
export const SEVEN  = /^(seg|hex|sseg|seven)/i;
export const HEX    = /^(hex|digit)/i;
export const RGB    = /^rgb/i;

export type Port = { name: string; width: number };
export const activeLow = (name: string) => RESET.test(name) && /n$/i.test(name);
export const isRx      = (name: string) => /^rx$/i.test(name);
/** An input's released level: active-low resets and a serial line rest high. */
export const idle      = (name: string) => (activeLow(name) || isRx(name) ? 1 : 0);
/** 7- or 8-bit seg* / hex*: raw segments, bit 0 = a … bit 6 = g, bit 7 = dp. */
export const isSeg = (p: Port) => SEVEN.test(p.name) && (p.width === 7 || p.width === 8);
/** 4-bit hex* / digit*: a digit showing the value 0–F. */
export const isHex = (p: Port) => HEX.test(p.name) && p.width === 4;
/** 3-bit rgb*: bit 2 = red, bit 1 = green, bit 0 = blue. */
export const isRgb = (p: Port) => RGB.test(p.name) && p.width === 3;

/** Segments (bit 0 = a … bit 6 = g) lit for the hex digits 0–F. */
export const HEX_SEGS = [0x3f, 0x06, 0x5b, 0x4f, 0x66, 0x6d, 0x7d, 0x07, 0x7f, 0x6f, 0x77, 0x7c, 0x39, 0x5e, 0x79, 0x71];
/** The segments a digit port lights (bit 0 = a … bit 7 = dp). */
export const segmentsOf = (p: Port, bits: number[]) =>
  isHex(p) ? Array.from({ length: 7 }, (_, i) => (HEX_SEGS[bits.reduce((n, b, k) => n + b * 2 ** k, 0)] >> i) & 1) : bits;
