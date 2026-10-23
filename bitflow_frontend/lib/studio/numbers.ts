/**
 * lib/studio/numbers.ts — the number-format tool (/studio/numbers): integers in any radix
 * and width (two's complement), fixed-point Q formats, and IEEE-754 half/single/double.
 * Bit patterns are BigInts so 64-bit values stay exact. Self-check: scripts/numbers.check.ts.
 */

export const MAX_BITS = 64;
const B = (n: number) => BigInt(n);
const pow2 = (n: number) => 1n << B(n);

// ── Integers ─────────────────────────────────────────────────────────────────

export interface ParsedInt { value: bigint; width?: number; signed?: boolean }

/**
 * "42", "-42", "0x2A", "0b10_1010", "0o52", or a Verilog literal ("8'h2A", "-8'sd5", "'b101").
 * Returns the value (a literal's digits as written, negated if it has a minus) and the width
 * and signedness a literal gives, or why it can't be read.
 */
export function parseInteger(text: string): ParsedInt | string {
  const t = text.trim().replace(/_/g, "");
  if (!t) return "Type a number.";
  if (/'/.test(t) && /[xXzZ?]/.test(t.split("'")[1] ?? "")) return "x and z digits have no numeric value.";
  const lit = /^(-)?\s*(\d+)?\s*'\s*([sS])?([bBoOdDhH])\s*([0-9a-fA-F]+)$/.exec(t);
  if (lit) {
    const [, neg, w, s, base, ds] = lit;
    const radix = { b: 2, o: 8, d: 10, h: 16 }[base.toLowerCase() as "b" | "o" | "d" | "h"];
    const v = digitsValue(ds, radix);
    if (typeof v === "string") return v;
    const width = w ? Number(w) : undefined;
    if (width !== undefined && (width < 1 || width > MAX_BITS)) return `Widths from 1 to ${MAX_BITS} bits.`;
    return { value: neg ? -v : v, width, signed: !!s };
  }
  const m = /^([+-])?(0[xX]([0-9a-fA-F]+)|0[bB]([01]+)|0[oO]([0-7]+)|(\d+))$/.exec(t);
  if (!m) return `Not a number: "${text.trim()}". Try 42, -7, 0x2A, 0b1010 or 8'hFF.`;
  const v = m[3] ? digitsValue(m[3], 16) : m[4] ? digitsValue(m[4], 2) : m[5] ? digitsValue(m[5], 8) : digitsValue(m[6], 10);
  if (typeof v === "string") return v;
  return { value: m[1] === "-" ? -v : v };
}

function digitsValue(ds: string, radix: number): bigint | string {
  let v = 0n;
  for (const ch of ds.toLowerCase()) {
    const d = parseInt(ch, 16);
    if (Number.isNaN(d) || d >= radix) return `"${ch}" isn't a base-${radix} digit.`;
    v = v * B(radix) + B(d);
  }
  return v;
}

export const range = (width: number, signed: boolean): [bigint, bigint] =>
  signed ? [-pow2(width - 1), pow2(width - 1) - 1n] : [0n, pow2(width) - 1n];

/** The width-bit pattern for v (two's complement when negative), or why it doesn't fit. */
export function encode(v: bigint, width: number, signed: boolean): bigint | string {
  const [lo, hi] = range(width, signed);
  if (v < lo || v > hi) {
    const hint = !signed && v < 0n && v >= range(width, true)[0] ? " It fits as signed."
      : signed && v > hi && v <= range(width, false)[1] ? " It fits as unsigned." : "";
    return `${v} doesn't fit in ${width} ${signed ? "signed" : "unsigned"} bits (${lo} … ${hi}).${hint}`;
  }
  return ((v % pow2(width)) + pow2(width)) % pow2(width);
}
export const asSigned = (bits: bigint, width: number) => (bits >= pow2(width - 1) ? bits - pow2(width) : bits);
/** The smallest width that holds v. */
export function minWidth(v: bigint, signed: boolean): number {
  for (let w = 1; w <= MAX_BITS; w++) { const [lo, hi] = range(w, signed); if (v >= lo && v <= hi) return w; }
  return MAX_BITS;
}

/** Digits of a bit pattern, padded to the width, grouped with _ every `group` digits (0 = no grouping). */
export function digits(bits: bigint, width: number, radix: 2 | 8 | 16, group = 0): string {
  const per = radix === 2 ? 1 : radix === 8 ? 3 : 4;
  const s = bits.toString(radix).toUpperCase().padStart(Math.ceil(width / per), "0");
  if (!group) return s;
  const out: string[] = [];
  for (let i = s.length; i > 0; i -= group) out.unshift(s.slice(Math.max(0, i - group), i));
  return out.join("_");
}

/** A Verilog literal for the pattern: 8'hA5, or 8'shA5 when signed. */
export const verilogLiteral = (bits: bigint, width: number, signed: boolean, radix: 2 | 10 | 16 = 16) =>
  `${width}'${signed ? "s" : ""}${radix === 2 ? "b" : radix === 10 ? "d" : "h"}${radix === 10 ? bits.toString() : digits(bits, width, radix, radix === 2 ? 4 : 0)}`;

/** Negating in two's complement: the magnitude's bits, inverted, plus one. */
export function negationSteps(v: bigint, width: number): { magnitude: bigint; inverted: bigint; result: bigint } {
  const mask = pow2(width) - 1n, magnitude = (v < 0n ? -v : v) & mask, inverted = ~magnitude & mask;
  return { magnitude, inverted, result: (inverted + 1n) & mask };
}

// ── Fixed point ──────────────────────────────────────────────────────────────

export type Rounding = "nearest" | "floor" | "zero";

/** x in a width-bit format with `frac` fraction bits: its bits, the value they hold, and whether it saturated. */
export function toFixed(x: number, width: number, frac: number, signed: boolean, rounding: Rounding = "nearest"):
  { bits: bigint; value: number; saturated: boolean } {
  const scaled = x * 2 ** frac;
  const r = rounding === "floor" ? Math.floor(scaled) : rounding === "zero" ? Math.trunc(scaled) : roundHalfEven(scaled);
  const [lo, hi] = range(width, signed);
  let n = Number.isFinite(r) && Math.abs(r) < 2 ** 70 ? BigInt(r) : r > 0 ? hi + 1n : lo - 1n;
  const saturated = n < lo || n > hi;
  if (n < lo) n = lo;
  if (n > hi) n = hi;
  const bits = encode(n, width, signed) as bigint;
  return { bits, value: fromFixed(bits, width, frac, signed), saturated };
}
export const fromFixed = (bits: bigint, width: number, frac: number, signed: boolean) =>
  Number(signed ? asSigned(bits, width) : bits) / 2 ** frac;
/** "Q3.5": integer bits (the sign bit included) . fraction bits; UQ when unsigned. */
export const qName = (width: number, frac: number, signed: boolean) => `${signed ? "Q" : "UQ"}${width - frac}.${frac}`;

function roundHalfEven(q: number): number {
  const f = Math.floor(q), d = q - f;
  return d > 0.5 ? f + 1 : d < 0.5 ? f : f % 2 === 0 ? f : f + 1;
}

// ── IEEE-754 ─────────────────────────────────────────────────────────────────

export type FloatFormat = "half" | "single" | "double";
export const FORMATS: Record<FloatFormat, { exp: number; man: number; label: string }> = {
  half: { exp: 5, man: 10, label: "half (16-bit)" },
  single: { exp: 8, man: 23, label: "single (32-bit float)" },
  double: { exp: 11, man: 52, label: "double (64-bit)" },
};
export const floatWidth = (f: FloatFormat) => 1 + FORMATS[f].exp + FORMATS[f].man;
export const bias = (f: FloatFormat) => 2 ** (FORMATS[f].exp - 1) - 1;

/** x rounded to the format (round to nearest, ties to even), as its bit pattern. */
export function floatToBits(x: number, f: FloatFormat): bigint {
  if (f === "double") { const dv = new DataView(new ArrayBuffer(8)); dv.setFloat64(0, x); return dv.getBigUint64(0); }
  const { exp: E, man: M } = FORMATS[f];
  const sign = x < 0 || Object.is(x, -0) ? 1n << B(E + M) : 0n;
  const expAll = pow2(E) - 1n;
  if (Number.isNaN(x)) return (expAll << B(M)) | (1n << B(M - 1));
  const a = Math.abs(x);
  if (a === Infinity) return sign | (expAll << B(M));
  if (a === 0) return sign;
  const b = bias(f), emin = 1 - b;
  let e = Math.floor(Math.log2(a));
  if (2 ** e > a) e--;
  if (2 ** (e + 1) <= a) e++;
  if (e < emin) return sign | BigInt(roundHalfEven(a / 2 ** (emin - M)));   // subnormal; rounding up to 2^M lands on the smallest normal
  let m = roundHalfEven(a / 2 ** (e - M));
  if (m === 2 ** (M + 1)) { m = 2 ** M; e++; }
  if (e > b) return sign | (expAll << B(M));                                 // too big: infinity
  return sign | (B(e + b) << B(M)) | BigInt(m - 2 ** M);
}

/** The number a bit pattern holds. */
export function bitsToFloat(bits: bigint, f: FloatFormat): number {
  if (f === "double") { const dv = new DataView(new ArrayBuffer(8)); dv.setBigUint64(0, bits & (pow2(64) - 1n)); return dv.getFloat64(0); }
  const { exp, mantissa, sign } = fields(bits, f);
  const { exp: E, man: M } = FORMATS[f], b = bias(f);
  const s = sign ? -1 : 1;
  if (exp === 2 ** E - 1) return mantissa ? NaN : s * Infinity;
  return exp === 0 ? s * Number(mantissa) * 2 ** (1 - b - M) : s * (2 ** M + Number(mantissa)) * 2 ** (exp - b - M);
}

export type FloatKind = "zero" | "subnormal" | "normal" | "infinity" | "NaN";
export function fields(bits: bigint, f: FloatFormat): { sign: 0 | 1; exp: number; mantissa: bigint; kind: FloatKind; unbiased: number } {
  const { exp: E, man: M } = FORMATS[f];
  const mantissa = bits & (pow2(M) - 1n), exp = Number((bits >> B(M)) & (pow2(E) - 1n)), sign = Number((bits >> B(E + M)) & 1n) as 0 | 1;
  const kind: FloatKind = exp === 2 ** E - 1 ? (mantissa ? "NaN" : "infinity") : exp === 0 ? (mantissa ? "subnormal" : "zero") : "normal";
  return { sign, exp, mantissa, kind, unbiased: exp === 0 ? 1 - bias(f) : exp - bias(f) };
}

/** The representable values either side (their gap is one ULP), by stepping the bit pattern. */
export function neighbours(bits: bigint, f: FloatFormat): { down: number; up: number } {
  const x = bitsToFloat(bits, f);
  if (!Number.isFinite(x)) return { down: NaN, up: NaN };
  const signBit = pow2(floatWidth(f) - 1), mag = bits & (signBit - 1n);
  const step = (bigger: boolean) => {
    if (mag === 0n) return bitsToFloat(bigger ? 1n : signBit | 1n, f);
    const away = (x > 0) === bigger;                               // away from zero: magnitude + 1
    return bitsToFloat((bits & signBit) | (away ? mag + 1n : mag - 1n), f);
  };
  return { down: step(false), up: step(true) };
}
