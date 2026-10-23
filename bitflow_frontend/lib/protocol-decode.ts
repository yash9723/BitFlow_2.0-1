/**
 * lib/protocol-decode.ts — decode UART, SPI and I2C traffic from simulated 1-bit signals
 * (lib/vcd-parser.ts), for the waveform viewer's "Decode" panel (components/WaveformPanel.tsx).
 * Each decoder returns frames { start, end, label } in the VCD's time units.
 * Self-check: scripts/protocol-decode.check.ts.
 */
import type { VcdSignal } from "./vcd-parser";

export type FrameKind = "data" | "start" | "stop" | "error";
export interface Frame { start: number; end: number; label: string; kind: FrameKind; value?: number; error?: string }

const last = (v: string) => v[v.length - 1].toLowerCase();

/** A 1-bit signal's value at time t ("0", "1", "x" or "z"): its last change at or before t. */
export function bitAt(sig: VcdSignal, t: number): string {
  const ch = sig.changes;
  let lo = 0, hi = ch.length - 1, at = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (ch[mid].time <= t) { at = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return at < 0 ? "x" : last(ch[at].value);
}

/** The shortest 0 or 1 pulse on a line (x/z before reset doesn't count): a good guess at a UART's bit time. */
export function autoBitTime(sig: VcdSignal): number | null {
  let best = Infinity;
  for (let i = 2; i < sig.changes.length; i++) {
    const [a, b, c] = [sig.changes[i - 2], sig.changes[i - 1], sig.changes[i]].map((x) => last(x.value));
    const d = sig.changes[i].time - sig.changes[i - 1].time;
    if (d > 0 && "01".includes(a) && "01".includes(b) && "01".includes(c) && a !== b && b !== c) best = Math.min(best, d);
  }
  return Number.isFinite(best) ? best : null;
}

const hex = (v: number, bits: number) => `0x${v.toString(16).toUpperCase().padStart(Math.ceil(bits / 4), "0")}`;
const printable = (v: number) => (v >= 0x20 && v < 0x7f ? ` '${String.fromCharCode(v)}'` : "");

// ── UART ─────────────────────────────────────────────────────────────────────

export interface UartOptions { bitTime: number; dataBits?: number; parity?: "none" | "even" | "odd"; stopBits?: number }

/** Asynchronous serial, idle high, LSB first: start bit (0), data, optional parity, stop bit(s) (1). Samples mid-bit. */
export function decodeUart(line: VcdSignal, o: UartOptions): Frame[] {
  const n = o.dataBits ?? 8, parity = o.parity ?? "none", stops = o.stopBits ?? 1, bt = o.bitTime;
  if (!(bt > 0)) return [];
  const hasParity = parity !== "none" ? 1 : 0;
  const frames: Frame[] = [];
  let from = -Infinity;
  const ch = line.changes;
  for (let i = 0; i < ch.length; i++) {
    const t0 = ch[i].time;
    if (t0 < from) continue;
    const before = i > 0 ? last(ch[i - 1].value) : "1";
    if (before !== "1" || last(ch[i].value) !== "0") continue;            // a falling edge: maybe a start bit
    if (bitAt(line, t0 + bt / 2) !== "0") continue;                       // a glitch, not a start bit
    let v = 0, ones = 0, unknown = false;
    for (let k = 0; k < n; k++) {
      const b = bitAt(line, t0 + (1.5 + k) * bt);
      if (b === "1") { v |= 1 << k; ones++; } else if (b !== "0") unknown = true;
    }
    let error: string | undefined;
    if (hasParity) {
      if (bitAt(line, t0 + (1.5 + n) * bt) === "1") ones++;
      if ((ones % 2 === 0) !== (parity === "even")) error = "parity error";
    }
    const stopAt = t0 + (1.5 + n + hasParity) * bt;
    if (bitAt(line, stopAt) !== "1") error = error ?? "framing error: no stop bit";
    if (unknown) error = "x or z on the line";
    frames.push({ start: t0, end: t0 + (1 + n + hasParity + stops) * bt, value: v, label: `${hex(v, n)}${printable(v)}`, kind: error ? "error" : "data", error });
    from = stopAt;                                                        // the next start bit comes after this stop bit
  }
  return frames;
}

// ── SPI ──────────────────────────────────────────────────────────────────────

export interface SpiOptions { cpol?: 0 | 1; cpha?: 0 | 1; msbFirst?: boolean; bits?: number }

/** SPI: sample MOSI/MISO on the mode's sampling edge while CS (active low, optional) is asserted. */
export function decodeSpi(s: { sclk: VcdSignal; mosi?: VcdSignal; miso?: VcdSignal; cs?: VcdSignal }, o: SpiOptions = {}): Frame[] {
  const sampleOnRise = ((o.cpol ?? 0) ^ (o.cpha ?? 0)) === 0;            // modes 0 and 3 sample on the rising edge
  const nbits = o.bits ?? 8, msbFirst = o.msbFirst ?? true;
  type Ev = { t: number; kind: "sample" | "deassert" };
  const evs: Ev[] = [];
  const sc = s.sclk.changes;
  for (let i = 1; i < sc.length; i++) {
    const a = last(sc[i - 1].value), b = last(sc[i].value);
    if (sampleOnRise ? a === "0" && b === "1" : a === "1" && b === "0") evs.push({ t: sc[i].time, kind: "sample" });
  }
  if (s.cs) {
    const cc = s.cs.changes;
    for (let i = 1; i < cc.length; i++) if (last(cc[i - 1].value) === "0" && last(cc[i].value) === "1") evs.push({ t: cc[i].time, kind: "deassert" });
  }
  evs.sort((x, y) => x.t - y.t || (x.kind === "deassert" ? 1 : -1));

  const frames: Frame[] = [];
  let bits: { t: number; mo: string; mi: string }[] = [];
  const word = (k: "mo" | "mi") => bits.reduce((v, b, i) => v | ((b[k] === "1" ? 1 : 0) << (msbFirst ? nbits - 1 - i : i)), 0);
  for (const e of evs) {
    if (e.kind === "deassert") {
      if (bits.length) frames.push({ start: bits[0].t, end: e.t, label: `${bits.length} of ${nbits} bits`, kind: "error", error: "CS rose in the middle of a word" });
      bits = [];
      continue;
    }
    if (s.cs && bitAt(s.cs, e.t) !== "0") continue;
    bits.push({ t: e.t, mo: s.mosi ? bitAt(s.mosi, e.t) : "0", mi: s.miso ? bitAt(s.miso, e.t) : "0" });
    if (bits.length === nbits) {
      const mo = word("mo"), mi = word("mi");
      const half = nbits > 1 ? (bits[nbits - 1].t - bits[0].t) / (nbits - 1) / 2 : 0;
      const parts = [s.mosi && `MOSI ${hex(mo, nbits)}`, s.miso && `MISO ${hex(mi, nbits)}`].filter(Boolean);
      frames.push({ start: bits[0].t - half, end: bits[nbits - 1].t + half, value: s.mosi ? mo : mi, label: parts.join(" · ") || hex(mo, nbits), kind: "data" });
      bits = [];
    }
  }
  return frames;
}

// ── I2C ──────────────────────────────────────────────────────────────────────

/** I2C: START/STOP (SDA edges while SCL is high), then 9-bit groups sampled on SCL rising edges: 8 bits MSB first + ACK. */
export function decodeI2c(s: { scl: VcdSignal; sda: VcdSignal }): Frame[] {
  const times = [...new Set([...s.scl.changes, ...s.sda.changes].map((c) => c.time))].sort((a, b) => a - b);
  const frames: Frame[] = [];
  let pScl = "1", pSda = "1", active = false, addr = true, lastRise = -1;
  let bits: { t: number; b: string }[] = [];
  for (const t of times) {
    const scl = bitAt(s.scl, t), sda = bitAt(s.sda, t);
    const startOrStop = pScl === "1" && scl === "1" && pSda !== sda;
    // the SCL rise that opens a START/STOP's high period is not a data bit
    if (startOrStop && bits.length && bits[bits.length - 1].t === lastRise) bits.pop();
    if (pScl === "1" && scl === "1" && pSda === "1" && sda === "0") {             // START (or repeated START)
      if (bits.length) frames.push({ start: bits[0].t, end: t, label: `${bits.length} bits`, kind: "error", error: "START in the middle of a byte" });
      frames.push({ start: t, end: t, label: active ? "Sr" : "S", kind: "start" });
      active = true; addr = true; bits = [];
    } else if (pScl === "1" && scl === "1" && pSda === "0" && sda === "1") {      // STOP
      if (bits.length) frames.push({ start: bits[0].t, end: t, label: `${bits.length} bits`, kind: "error", error: "STOP in the middle of a byte" });
      frames.push({ start: t, end: t, label: "P", kind: "stop" });
      active = false; bits = [];
    } else if (pScl === "0" && scl === "1") {                                     // a data bit
      lastRise = t;
      if (!active) { pScl = scl; pSda = sda; continue; }
      bits.push({ t, b: sda });
      if (bits.length === 9) {
        const v = bits.slice(0, 8).reduce((acc, x) => (acc << 1) | (x.b === "1" ? 1 : 0), 0);
        const ack = bits[8].b === "0" ? "ACK" : "NACK";
        const label = addr ? `Addr ${hex(v >> 1, 7)} ${v & 1 ? "R" : "W"} ${ack}` : `${hex(v, 8)} ${ack}`;
        frames.push({ start: bits[0].t, end: bits[8].t, value: v, label, kind: "data" });
        addr = false; bits = [];
      }
    }
    pScl = scl; pSda = sda;
  }
  return frames;
}

// ── Decoder setups, as the waveform viewer saves them ─────────────────────────

export type DecoderKind = "uart" | "spi" | "i2c";
export const ROLES: Record<DecoderKind, { role: string; label: string; optional?: boolean }[]> = {
  uart: [{ role: "line", label: "TX/RX line" }],
  spi: [{ role: "sclk", label: "SCLK" }, { role: "mosi", label: "MOSI", optional: true }, { role: "miso", label: "MISO", optional: true }, { role: "cs", label: "CS (active low)", optional: true }],
  i2c: [{ role: "scl", label: "SCL" }, { role: "sda", label: "SDA" }],
};
/** The signal a decoder's frames are drawn on. */
export const PRIMARY: Record<DecoderKind, string> = { uart: "line", spi: "mosi", i2c: "sda" };

export interface DecoderSpec {
  id: string;
  kind: DecoderKind;
  /** role -> row key of the signal (lib/waveform-svg.ts rowKeys) */
  signals: Record<string, string>;
  uart?: { bitTime: number; dataBits: number; parity: "none" | "even" | "odd" };
  spi?: { cpol: 0 | 1; cpha: 0 | 1; msbFirst: boolean; bits: number };
}

const ALIASES: Record<string, string> = {
  line: "tx|rx|txd|rxd|uart_tx|uart_rx|serial", sclk: "sclk|sck|spi_clk", mosi: "mosi|copi|sdo", miso: "miso|cipo|sdi",
  cs: "cs|ss|csn|cs_n|ss_n", scl: "scl", sda: "sda",
};
/** A new decoder with each role filled by a signal whose name looks like it (tx, sclk, sda...): exact names first. */
export function guessDecoder(kind: DecoderKind, keys: string[]): DecoderSpec {
  const signals: Record<string, string> = {};
  const base = (key: string) => key.toLowerCase().replace(/#\d+$/, "").split(".").pop()!;
  for (const r of ROLES[kind]) {
    for (const re of [new RegExp(`^(${ALIASES[r.role]})$`), new RegExp(`(^|_)(${ALIASES[r.role]})(_|$)`)]) {
      const k = keys.find((key) => re.test(base(key)) && !Object.values(signals).includes(key));
      if (k) { signals[r.role] = k; break; }
    }
  }
  return { id: kind, kind, signals, uart: { bitTime: 0, dataBits: 8, parity: "none" }, spi: { cpol: 0, cpha: 0, msbFirst: true, bits: 8 } };
}

/** Run a saved decoder against the current signals (looked up by row key). */
export function runDecoder(d: DecoderSpec, byKey: (key: string) => VcdSignal | undefined): Frame[] | string {
  const get = (role: string) => (d.signals[role] ? byKey(d.signals[role]) : undefined);
  for (const r of ROLES[d.kind]) if (!r.optional && !get(r.role)) return `Choose the ${r.label} signal.`;
  if (d.kind === "uart") {
    const line = get("line")!;
    return decodeUart(line, { ...d.uart, bitTime: d.uart?.bitTime || autoBitTime(line) || 0 });   // bit time 0 = auto
  }
  if (d.kind === "spi") {
    if (!get("mosi") && !get("miso")) return "Choose MOSI, MISO or both.";
    return decodeSpi({ sclk: get("sclk")!, mosi: get("mosi"), miso: get("miso"), cs: get("cs") }, d.spi);
  }
  return decodeI2c({ scl: get("scl")!, sda: get("sda")! });
}
