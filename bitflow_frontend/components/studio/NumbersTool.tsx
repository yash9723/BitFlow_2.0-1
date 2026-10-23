"use client";
/**
 * components/studio/NumbersTool.tsx — /studio/numbers: integers (radix, width, two's
 * complement), fixed-point Q formats and IEEE-754 floats, each with a clickable bit grid.
 * Conversions in lib/studio/numbers.ts. Loaded client-only (the draft is in localStorage).
 */

import { useLocalStorage } from "@/hooks/useLocalStorage";
import {
  MAX_BITS, type FloatFormat, FORMATS, type Rounding, asSigned, bias, bitsToFloat, digits, encode, fields, floatToBits, floatWidth,
  fromFixed, minWidth, negationSteps, neighbours, parseInteger, qName, range, toFixed, verilogLiteral,
} from "@/lib/studio/numbers";

type Tab = "int" | "fixed" | "float";
interface Draft {
  tab: Tab;
  int: { text: string; width: number; signed: boolean };
  fixed: { text: string; width: number; frac: number; signed: boolean; rounding: Rounding };
  float: { text: string; format: FloatFormat };
}
const START: Draft = {
  tab: "int",
  int: { text: "-42", width: 8, signed: true },
  fixed: { text: "3.14159", width: 16, frac: 12, signed: true, rounding: "nearest" },
  float: { text: "0.1", format: "single" },
};

const field = "bg-pit border border-rim/60 rounded px-2 py-1 text-[12px] text-pale";
const btn = "px-2 py-1 rounded border border-rim/60 text-ghost hover:text-bright text-[11px] disabled:opacity-40";
const mask = (w: number) => (1n << BigInt(w)) - 1n;
/** A number's exact decimal value (binary fractions end), trailing zeros dropped. */
const exact = (x: number) => (Number.isFinite(x) ? x.toPrecision(100).replace(/(\.\d*?)0+(e|$)/, "$1$2").replace(/\.(e|$)/, "$1") : String(x));

export default function NumbersTool() {
  const [stored, setDraft] = useLocalStorage<Draft>("bitflow_studio_numbers", START);
  const d: Draft = { ...START, ...stored, int: { ...START.int, ...stored?.int }, fixed: { ...START.fixed, ...stored?.fixed }, float: { ...START.float, ...stored?.float } };
  const set = <K extends "int" | "fixed" | "float">(k: K, patch: Partial<Draft[K]>) => setDraft({ ...d, [k]: { ...d[k], ...patch } });

  return (
    <div className="space-y-5">
      <div>
        <p className="text-[12px] text-ghost max-w-3xl">
          See how a number is stored in hardware: integers in any width and radix (two&apos;s complement for negatives), fixed-point
          Q formats for DSP, and IEEE-754 floating point. Click any bit to flip it.
        </p>
      </div>
      <div className="flex flex-wrap gap-1 font-mono text-[12px]" role="tablist">
        {([["int", "Integer"], ["fixed", "Fixed point"], ["float", "Floating point (IEEE-754)"]] as [Tab, string][]).map(([t, label]) => (
          <button key={t} role="tab" aria-selected={d.tab === t} onClick={() => setDraft({ ...d, tab: t })}
                  className={`px-3 py-1.5 rounded-lg border ${d.tab === t ? "border-phosphor/40 bg-phosphor/10 text-phosphor" : "border-rim/60 text-ghost hover:text-bright"}`}>{label}</button>
        ))}
      </div>
      {d.tab === "int" && <IntegerPanel s={d.int} set={(p) => set("int", p)} />}
      {d.tab === "fixed" && <FixedPanel s={d.fixed} set={(p) => set("fixed", p)} />}
      {d.tab === "float" && <FloatPanel s={d.float} set={(p) => set("float", p)} />}
    </div>
  );
}

/** Bits MSB first, clickable; `tone(i)` colours bit i (i = 0 is the LSB); `mark` leaves a gap (a binary point) left of bit mark − 1. */
function BitGrid({ bits, width, onFlip, tone, mark }: {
  bits: bigint; width: number; onFlip: (i: number) => void; tone?: (i: number) => string; mark?: number;
}) {
  return (
    <div className="flex flex-wrap gap-y-2 font-mono" role="group" aria-label="Bits (click to flip)">
      {Array.from({ length: width }, (_, k) => {
        const i = width - 1 - k, on = (bits >> BigInt(i)) & 1n;
        const gap = mark !== undefined && mark > 0 && i === mark ? "mr-4" : i % 4 === 0 && i ? "mr-2" : "mr-0.5";
        return (
          <div key={i} className={`flex flex-col items-center ${gap}`}>
            <button onClick={() => onFlip(i)} aria-label={`bit ${i} is ${on}`}
                    className={`w-6 h-7 rounded border text-[12px] font-bold ${on ? "bg-phosphor/20 border-phosphor/60 text-phosphor" : "bg-pit border-rim/60 text-dim"} ${tone?.(i) ?? ""}`}>
              {on.toString()}
            </button>
            <span className="text-[8px] text-dim mt-0.5">{i}</span>
          </div>
        );
      })}
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <tr className="border-b border-rim/30 last:border-0">
      <td className="py-1.5 pr-4 text-dim whitespace-nowrap align-top">{k}</td>
      <td className="py-1.5 text-pale break-all">{v}</td>
    </tr>
  );
}

// ── Integer ───────────────────────────────────────────────────────────────────

function IntegerPanel({ s, set }: { s: Draft["int"]; set: (p: Partial<Draft["int"]>) => void }) {
  const parsed = parseInteger(s.text);
  const width = Math.max(1, Math.min(MAX_BITS, s.width));
  const mod = 1n << BigInt(width);
  // A sized literal's digits are the bit pattern itself (truncated to the width, as Verilog does)
  const res = typeof parsed === "string" ? parsed
    : parsed.width !== undefined ? ((parsed.value % mod) + mod) % mod
    : encode(parsed.value, width, s.signed);
  const bits = typeof res === "bigint" ? res : null;
  const show = (b: bigint) => set({ text: verilogLiteral(b & mask(width), width, s.signed, 16) });
  const onText = (text: string) => {
    const p = parseInteger(text);
    set(typeof p !== "string" && p.width !== undefined ? { text, width: p.width, signed: !!p.signed } : { text });
  };
  const signedValue = bits !== null ? asSigned(bits, width) : 0n;
  const [lo, hi] = range(width, s.signed);
  const steps = bits !== null && s.signed && signedValue < 0n ? negationSteps(signedValue, width) : null;
  const ops: [string, (b: bigint) => bigint, string][] = [
    ["−x", (b) => -b, "negate: invert every bit and add 1"], ["~x", (b) => ~b, "invert every bit"], ["x + 1", (b) => b + 1n, "add one (wraps)"],
    ["x − 1", (b) => b - 1n, "subtract one (wraps)"], ["x << 1", (b) => b << 1n, "shift left: × 2"], ["x >> 1", (b) => b >> 1n, "logical shift right: unsigned ÷ 2"],
    ["x >>> 1", (b) => asSigned(b, width) >> 1n, "arithmetic shift right: signed ÷ 2, keeping the sign bit"],
  ];
  return (
    <section className="space-y-4 font-mono text-[12px]">
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1"><span className="block text-[10px] uppercase tracking-wider text-dim">Value</span>
          <input value={s.text} onChange={(e) => onText(e.target.value)} aria-label="Integer value" className={`${field} w-56`} spellCheck={false} />
        </label>
        <label className="space-y-1"><span className="block text-[10px] uppercase tracking-wider text-dim">Width (bits)</span>
          <input type="number" min={1} max={MAX_BITS} value={width} onChange={(e) => set({ width: Math.max(1, Math.min(MAX_BITS, Number(e.target.value) || 1)) })}
                 aria-label="Width" className={`${field} w-20`} />
        </label>
        <label className="flex items-center gap-1.5 text-ghost pb-1.5"><input type="checkbox" checked={s.signed} onChange={(e) => set({ signed: e.target.checked })} /> signed (two&apos;s complement)</label>
        {typeof parsed !== "string" && parsed.width === undefined && (
          <button className={`${btn} mb-0.5`} onClick={() => set({ width: minWidth(parsed.value, s.signed) })}>fewest bits</button>
        )}
      </div>
      <p className="text-[11px] text-dim">Decimal, 0x…, 0b…, 0o… or a Verilog literal such as 8&apos;hA5 or -8&apos;sd5. Range: {lo.toString()} … {hi.toString()}.</p>
      {bits === null ? <p className="text-danger">{res as string}</p> : (
        <>
          <BitGrid bits={bits} width={width} onFlip={(i) => show(bits ^ (1n << BigInt(i)))}
                   tone={(i) => (s.signed && i === width - 1 ? "ring-1 ring-warn/60" : "")} />
          <div className="flex flex-wrap gap-1.5">
            {ops.map(([label, f, title]) => <button key={label} className={btn} title={title} onClick={() => show(f(bits))}>{label}</button>)}
          </div>
          <table className="w-full max-w-3xl"><tbody>
            <Row k="unsigned" v={bits.toString()} />
            <Row k="signed" v={signedValue.toString()} />
            <Row k="hex" v={`0x${digits(bits, width, 16, 4)}`} />
            <Row k="octal" v={`0o${digits(bits, width, 8)}`} />
            <Row k="binary" v={`0b${digits(bits, width, 2, 4)}`} />
            <Row k="Verilog" v={`${verilogLiteral(bits, width, s.signed, 16)}   ${verilogLiteral(bits, width, s.signed, 2)}   ${verilogLiteral(bits, width, false, 10)}`} />
          </tbody></table>
          {s.signed && <p className="text-[11px] text-dim">The top bit (outlined) has weight −2<sup>{width - 1}</sup>; every other bit i has +2<sup>i</sup>.</p>}
          {steps && (
            <div className="rounded-lg border border-rim/60 bg-surface/30 p-3 space-y-1 max-w-3xl">
              <div className="text-[10px] uppercase tracking-wider text-dim">How {signedValue.toString()} is stored</div>
              <div><span className="text-dim inline-block w-40">{(-signedValue).toString()} in binary</span>{digits(steps.magnitude, width, 2, 4)}</div>
              <div><span className="text-dim inline-block w-40">invert every bit</span>{digits(steps.inverted, width, 2, 4)}</div>
              <div><span className="text-dim inline-block w-40">add 1</span><span className="text-phosphor">{digits(steps.result, width, 2, 4)}</span></div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

// ── Fixed point ───────────────────────────────────────────────────────────────

function FixedPanel({ s, set }: { s: Draft["fixed"]; set: (p: Partial<Draft["fixed"]>) => void }) {
  const width = Math.max(2, Math.min(32, s.width)), frac = Math.max(0, Math.min(width, s.frac));
  const x = Number(s.text);
  const ok = s.text.trim() !== "" && Number.isFinite(x);
  const r = ok ? toFixed(x, width, frac, s.signed, s.rounding) : null;
  const [lo, hi] = range(width, s.signed);
  const flip = (i: number) => { if (r) set({ text: String(fromFixed(r.bits ^ (1n << BigInt(i)), width, frac, s.signed)) }); };
  return (
    <section className="space-y-4 font-mono text-[12px]">
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1"><span className="block text-[10px] uppercase tracking-wider text-dim">Real value</span>
          <input value={s.text} onChange={(e) => set({ text: e.target.value })} aria-label="Real value" className={`${field} w-44`} spellCheck={false} />
        </label>
        <label className="space-y-1"><span className="block text-[10px] uppercase tracking-wider text-dim">Total bits</span>
          <input type="number" min={2} max={32} value={width} onChange={(e) => set({ width: Number(e.target.value) || 2 })} aria-label="Total bits" className={`${field} w-20`} />
        </label>
        <label className="space-y-1"><span className="block text-[10px] uppercase tracking-wider text-dim">Fraction bits</span>
          <input type="number" min={0} max={width} value={frac} onChange={(e) => set({ frac: Number(e.target.value) || 0 })} aria-label="Fraction bits" className={`${field} w-20`} />
        </label>
        <label className="flex items-center gap-1.5 text-ghost pb-1.5"><input type="checkbox" checked={s.signed} onChange={(e) => set({ signed: e.target.checked })} /> signed</label>
        <label className="space-y-1"><span className="block text-[10px] uppercase tracking-wider text-dim">Rounding</span>
          <select value={s.rounding} onChange={(e) => set({ rounding: e.target.value as Rounding })} aria-label="Rounding" className={field}>
            <option value="nearest">nearest (ties to even)</option><option value="floor">down (floor)</option><option value="zero">toward zero (truncate)</option>
          </select>
        </label>
      </div>
      <p className="text-[11px] text-dim">
        {qName(width, frac, s.signed)}: steps of 2<sup>−{frac}</sup> = {2 ** -frac}, range {Number(lo) / 2 ** frac} … {Number(hi) / 2 ** frac}.
        The stored integer is the value × 2<sup>{frac}</sup>.
      </p>
      {!r ? <p className="text-danger">Type a real number, such as 3.14159 or -0.5.</p> : (
        <>
          <BitGrid bits={r.bits} width={width} onFlip={flip} mark={frac}
                   tone={(i) => (i < frac ? "!border-info/50" : s.signed && i === width - 1 ? "ring-1 ring-warn/60" : "")} />
          <p className="text-[11px] text-dim">Bits left of the gap are the integer part; the fraction bits (blue) are worth 2<sup>−1</sup>, 2<sup>−2</sup>, …</p>
          <table className="w-full max-w-3xl"><tbody>
            <Row k="stored value" v={<>{exact(r.value)}{r.saturated && <span className="text-warn"> (saturated: out of range)</span>}</>} />
            <Row k="error" v={r.value === x ? "none: exactly representable" : `${(r.value - x).toPrecision(6)} (${x ? ((Math.abs(r.value - x) / Math.abs(x)) * 100).toPrecision(3) : "0"} %)`} />
            <Row k="stored integer" v={`${(s.signed ? asSigned(r.bits, width) : r.bits).toString()} = value × ${2 ** frac}`} />
            <Row k="hex" v={`0x${digits(r.bits, width, 16)}`} />
            <Row k="Verilog" v={`${verilogLiteral(r.bits, width, s.signed, 16)}   // ${qName(width, frac, s.signed)} ${r.value}`} />
          </tbody></table>
        </>
      )}
    </section>
  );
}

// ── Floating point ────────────────────────────────────────────────────────────

function FloatPanel({ s, set }: { s: Draft["float"]; set: (p: Partial<Draft["float"]>) => void }) {
  const f = s.format, W = floatWidth(f), { exp: E, man: M } = FORMATS[f];
  const t = s.text.trim().toLowerCase();
  const x = t === "nan" ? NaN : /^[+-]?inf(inity)?$/.test(t) ? (t.startsWith("-") ? -Infinity : Infinity) : Number(t);
  const ok = t !== "" && (Number.isFinite(x) || /inf|^nan$/.test(t));
  const bits = ok ? floatToBits(x, f) : null;
  const flip = (i: number) => { if (bits !== null) set({ text: String(bitsToFloat(bits ^ (1n << BigInt(i)), f)) }); };
  const setHex = (hex: string) => {
    const h = hex.trim().replace(/^0x/i, "").replace(/_/g, "");
    const v = /^[0-9a-f]+$/i.test(h) ? BigInt(`0x${h}`) : null;
    if (v !== null && v <= mask(W)) set({ text: String(bitsToFloat(v, f)) });
  };
  if (bits === null) {
    return (
      <section className="space-y-3 font-mono text-[12px]">
        <FloatInputs s={s} set={set} />
        <p className="text-danger">Type a number (1.5, -2e-3), inf or nan.</p>
      </section>
    );
  }
  const fl = fields(bits, f), stored = bitsToFloat(bits, f), nb = neighbours(bits, f), b = bias(f);
  const m = Number(fl.mantissa);
  return (
    <section className="space-y-4 font-mono text-[12px]">
      <FloatInputs s={s} set={set} />
      <BitGrid bits={bits} width={W} onFlip={flip} tone={(i) => (i === W - 1 ? "!border-danger/60" : i >= M ? "!border-info/60" : "")} />
      <p className="text-[11px] text-dim flex flex-wrap items-center gap-1">
        <span><span className="text-danger">sign</span> (1 bit) · <span className="text-info">exponent</span> ({E} bits, bias {b}) · mantissa ({M} bits). Bits in hex:</span>
        <input key={bits.toString()} defaultValue={digits(bits, W, 16)} onBlur={(e) => setHex(e.target.value)}
               onKeyDown={(e) => { if (e.key === "Enter") setHex((e.target as HTMLInputElement).value); }}
               aria-label="Bit pattern in hex" className={`${field} w-48`} spellCheck={false} />
      </p>
      <table className="w-full max-w-3xl"><tbody>
        <Row k="kind" v={fl.kind} />
        <Row k="sign" v={`${fl.sign} (${fl.sign ? "negative" : "positive"})`} />
        <Row k="exponent" v={`${fl.exp} stored${fl.kind === "normal" ? ` → ${fl.exp} − ${b} = ${fl.unbiased}` : fl.kind === "subnormal" ? ` → subnormals use 1 − ${b} = ${fl.unbiased}` : " (all ones: special value)"}`} />
        <Row k="mantissa" v={`0x${digits(fl.mantissa, M, 16)} = ${m}`} />
        {(fl.kind === "normal" || fl.kind === "subnormal") && (
          <Row k="value" v={`(−1)^${fl.sign} × (${fl.kind === "normal" ? "1" : "0"} + ${m} / 2^${M}) × 2^${fl.unbiased}`} />
        )}
        <Row k="stored exactly" v={exact(stored)} />
        {Number.isFinite(x) && Number.isFinite(stored) && (
          <Row k="rounding error" v={stored === x ? "none: exactly representable" : `${(stored - x).toPrecision(4)} (${((Math.abs(stored - x) / Math.abs(x)) * 100).toPrecision(3)} %)`} />
        )}
        {Number.isFinite(stored) && <Row k="neighbours" v={`${nb.down}  ‹  ${stored}  ›  ${nb.up}   (gap ${(nb.up - stored).toPrecision(4)})`} />}
        <Row k="Verilog" v={`${W}'h${digits(bits, W, 16)}${f === "double" ? `   // $realtobits(${stored})` : f === "single" ? `   // $shortrealtobits(${stored})` : ""}`} />
      </tbody></table>
    </section>
  );
}

function FloatInputs({ s, set }: { s: Draft["float"]; set: (p: Partial<Draft["float"]>) => void }) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="space-y-1"><span className="block text-[10px] uppercase tracking-wider text-dim">Value</span>
        <input value={s.text} onChange={(e) => set({ text: e.target.value })} aria-label="Float value" className={`${field} w-56`} spellCheck={false} />
      </label>
      <label className="space-y-1"><span className="block text-[10px] uppercase tracking-wider text-dim">Format</span>
        <select value={s.format} onChange={(e) => set({ format: e.target.value as FloatFormat })} aria-label="Format" className={field}>
          {(Object.keys(FORMATS) as FloatFormat[]).map((k) => <option key={k} value={k}>{FORMATS[k].label}</option>)}
        </select>
      </label>
      <div className="flex flex-wrap gap-1.5 pb-0.5">
        {["0.1", "1", "-2.5", "1e-40", "65504", "inf", "nan"].map((v) => <button key={v} className={btn} onClick={() => set({ text: v })}>{v}</button>)}
      </div>
    </div>
  );
}
