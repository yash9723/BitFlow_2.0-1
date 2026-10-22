/**
 * lib/radix.ts — how the waveform viewer (components/WaveformPanel.tsx) prints
 * bus values: binary, unsigned or signed decimal, hex. Self-check: scripts/radix.check.ts.
 */

/** Display radix for a signal. Persisted per-signal in radixMap state. */
export type Radix = "bin" | "dec" | "sdec" | "hex";

/** Default radix by signal width: buses → hex, 1-bit → binary. */
export function defaultRadix(width: number): Radix {
  return width > 1 ? "hex" : "bin";
}

/**
 * Format a raw VCD binary value string for display given a radix.
 *
 *   bin: show raw binary string   e.g. "0101"
 *   hex: show prefixed hex        e.g. "h5"  (or "x"/"z" for unknown)
 *   dec: show unsigned decimal    e.g. "5"   (or "x"/"z" for unknown)
 *  sdec: two's-complement signed  e.g. "-3" for 4'b1101
 *
 * 1-bit signals: always display raw "0" | "1" | "x" | "z" — radix only
 * applies to buses (width > 1).
 */
export function formatWithRadix(value: string, width: number, radix: Radix): string {
  // 1-bit: raw value is already the display value regardless of radix
  if (width === 1) return value;

  // Unknown / high-impedance
  const isUnknown = /[xXzZ]/.test(value);
  if (isUnknown) return /^[xX]+$/.test(value) ? "x" : /^[zZ]+$/.test(value) ? "z" : "X";

  if (!/^[01]+$/.test(value)) return "?";
  // BigInt keeps buses wider than 53 bits exact.
  const n = BigInt(`0b${value}`);

  switch (radix) {
    case "bin": return value;
    case "dec": return n.toString();
    // VCD values may drop leading zeros, so the sign bit comes from the declared width.
    case "sdec": return (value.length === width && value[0] === "1" ? n - (BigInt(1) << BigInt(width)) : n).toString();
    case "hex": return `h${n.toString(16).toUpperCase()}`;
  }
}

/** Cycle through radix values: bin → dec → signed dec → hex → bin */
const RADIX_ORDER: Radix[] = ["bin", "dec", "sdec", "hex"];
export function nextRadix(current: Radix): Radix {
  return RADIX_ORDER[(RADIX_ORDER.indexOf(current) + 1) % RADIX_ORDER.length];
}

/** Short label shown in the radix cycle button */
export const RADIX_LABEL: Record<Radix, string> = { bin: "b", dec: "d", sdec: "±", hex: "h" };
