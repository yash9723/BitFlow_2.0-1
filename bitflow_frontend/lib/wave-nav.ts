/**
 * lib/wave-nav.ts — waveform debugging for components/WaveformPanel.tsx, without React:
 * buses split into bits, the next/previous change of a signal, value search ("count == 5",
 * "state != 2", "q == x"), the ranges where two runs differ, and the scopes in a dump.
 * Values are VCD strings: '0' | '1' | 'x' | 'z' for a bit, binary ('0011', 'x01z') for a bus,
 * leading zeros possibly dropped. Self-check: scripts/wave-nav.check.ts.
 */
import type { ParsedVcd, VcdChange, VcdSignal } from "./vcd-parser";

// ── Buses into bits ─────────────────────────────────────────────────────────

/** A bus as one signal per bit, most significant first ("data[7]" … "data[0]"). */
export function splitBus(sig: VcdSignal): VcdSignal[] {
  if (sig.width <= 1) return [sig];
  return Array.from({ length: sig.width }, (_, k) => {
    const bit = sig.width - 1 - k;
    const changes: VcdChange[] = [];
    for (const c of sig.changes) {
      const v = c.value.padStart(sig.width, /^[xz]/i.test(c.value) ? c.value[0] : "0");
      const b = v[v.length - 1 - bit] ?? "0";
      if (changes[changes.length - 1]?.value !== b) changes.push({ time: c.time, value: b });
    }
    return { ...sig, id: `${sig.id}[${bit}]`, name: `${sig.name}[${bit}]`, width: 1, changes };
  });
}

// ── Edges ───────────────────────────────────────────────────────────────────

/** The first change of `sig` strictly after t (dir 1) or strictly before t (dir -1); time 0's initial value isn't an edge. */
export function nextChange(sig: VcdSignal, t: number, dir: 1 | -1): number | null {
  const times = sig.changes.slice(1).map((c) => c.time);
  if (dir === 1) return times.find((x) => x > t) ?? null;
  for (let i = times.length - 1; i >= 0; i--) if (times[i] < t) return times[i];
  return null;
}

/** The nearest change of any of the signals after (or before) t. */
export function nextAnyChange(sigs: VcdSignal[], t: number, dir: 1 | -1): number | null {
  let best: number | null = null;
  for (const s of sigs) {
    const x = nextChange(s, t, dir);
    if (x !== null && (best === null || (dir === 1 ? x < best : x > best))) best = x;
  }
  return best;
}

// ── Value search ────────────────────────────────────────────────────────────

export type Op = "==" | "!=" | "<" | ">" | "<=" | ">=";
export interface ValueQuery { name: string; op: Op; value: bigint | "x" | "z" }

/** A query's value: 5, 0x1f, 'h1f, 8'hff, 0b101, 'b101, 4'd9, x, z. */
function parseValue(text: string): bigint | "x" | "z" | null {
  const t = text.trim().toLowerCase().replace(/_/g, "");
  if (t === "x" || t === "z") return t;
  let m = /^(?:\d+)?'([bdh])([0-9a-f]+)$/.exec(t);
  if (m) return BigInt((m[1] === "b" ? "0b" : m[1] === "h" ? "0x" : "") + m[2]);
  m = /^(0x[0-9a-f]+|0b[01]+|\d+)$/.exec(t);
  return m ? BigInt(m[1]) : null;
}

/** "count == 5" → a query; a message when it can't be read. A bare name means "== 1" (a bit that is high). */
export function parseQuery(text: string): ValueQuery | string {
  const t = text.trim();
  const bare = /^([A-Za-z_][\w.$\[\]]*)$/.exec(t);
  if (bare) return { name: bare[1], op: "==", value: 1n };
  const m = /^([A-Za-z_][\w.$\[\]]*)\s*(==|!=|<=|>=|<|>|=)\s*(.+)$/.exec(t);
  if (!m) return "Write a signal, a comparison and a value: count == 5, state != 0x2, q == x";
  const value = parseValue(m[3]);
  if (value === null) return `"${m[3].trim()}" isn't a value: use 5, 0x1f, 8'hff, 0b101, x or z`;
  const op = (m[2] === "=" ? "==" : m[2]) as Op;
  if (typeof value === "string" && op !== "==" && op !== "!=") return "x and z only work with == and !=";
  return { name: m[1], op, value };
}

/** The signal a query names: the exact name, else the one whose name ends with ".name" (inside a scope). */
export function signalFor(sigs: VcdSignal[], name: string): VcdSignal | undefined {
  return sigs.find((s) => s.name === name) ?? sigs.find((s) => s.name.endsWith("." + name));
}

export function holds(value: string, q: ValueQuery): boolean {
  const v = value.toLowerCase();
  const hasX = /x/.test(v), hasZ = /z/.test(v);
  if (q.value === "x") return q.op === "==" ? hasX : !hasX;
  if (q.value === "z") return q.op === "==" ? hasZ : !hasZ;
  if (hasX || hasZ) return q.op === "!=";                 // an unknown value never equals a number
  const n = BigInt("0b" + (v || "0"));
  switch (q.op) {
    case "==": return n === q.value;
    case "!=": return n !== q.value;
    case "<":  return n < q.value;
    case ">":  return n > q.value;
    case "<=": return n <= q.value;
    case ">=": return n >= q.value;
  }
}

/** The time ranges where the query holds, [from, to), the last one ending at maxTime. */
export function matchRanges(sig: VcdSignal, q: ValueQuery, maxTime: number): { from: number; to: number }[] {
  const out: { from: number; to: number }[] = [];
  sig.changes.forEach((c, i) => {
    if (!holds(c.value, q)) return;
    const to = sig.changes[i + 1]?.time ?? maxTime;
    const last = out[out.length - 1];
    if (last && last.to === c.time) last.to = to;
    else out.push({ from: c.time, to: Math.max(to, c.time) });
  });
  return out;
}

/** The start of the next match after t (dir 1) or the previous one before t (dir -1). */
export function nextMatch(ranges: { from: number }[], t: number, dir: 1 | -1): number | null {
  if (dir === 1) return ranges.find((r) => r.from > t)?.from ?? null;
  for (let i = ranges.length - 1; i >= 0; i--) if (ranges[i].from < t) return ranges[i].from;
  return null;
}

// ── Two runs compared ───────────────────────────────────────────────────────

const valueAt = (changes: VcdChange[], t: number): string | null => {
  let v: string | null = null;
  for (const c of changes) { if (c.time > t) break; v = c.value; }
  return v;
};
const keyOf = (s: VcdSignal) => `${s.scope ?? ""}.${s.name}`;
const norm = (v: string | null) => (v === null ? null : v.toLowerCase().replace(/^0+(?=.)/, ""));

/**
 * Where two runs differ: for every signal both dumps have (same scope and name), the time ranges in
 * which its values differ, merged; and the names of the signals that differ anywhere. Only the time
 * both runs simulated counts: a run that went on longer isn't "different" after the other one stopped.
 */
export function diffRuns(a: ParsedVcd, b: ParsedVcd): { ranges: { from: number; to: number }[]; signals: string[] } {
  const end = Math.min(a.maxTime, b.maxTime);
  const other = new Map(b.signals.map((s) => [keyOf(s), s]));
  const spans: { from: number; to: number }[] = [];
  const signals: string[] = [];
  for (const s of a.signals) {
    const t = other.get(keyOf(s));
    if (!t) continue;
    const times = [...new Set([...s.changes, ...t.changes].map((c) => c.time))].filter((x) => x < end).sort((x, y) => x - y);
    let differs = false;
    times.forEach((time, i) => {
      if (norm(valueAt(s.changes, time)) !== norm(valueAt(t.changes, time))) {
        spans.push({ from: time, to: times[i + 1] ?? end });
        differs = true;
      }
    });
    if (differs) signals.push(s.name);
  }
  spans.sort((x, y) => x.from - y.from);
  const ranges: { from: number; to: number }[] = [];
  for (const r of spans) {
    const last = ranges[ranges.length - 1];
    if (last && r.from <= last.to) last.to = Math.max(last.to, r.to);
    else ranges.push({ ...r });
  }
  return { ranges, signals };
}

// ── Scopes ──────────────────────────────────────────────────────────────────

/** Every scope in the dump, parents before children ("tb", "tb.dut", "tb.dut.u_alu"). */
export function scopesOf(sigs: VcdSignal[]): string[] {
  const all = new Set<string>();
  for (const s of sigs) {
    const parts = (s.scope ?? "").split(".").filter(Boolean);
    for (let i = 1; i <= parts.length; i++) all.add(parts.slice(0, i).join("."));
  }
  return [...all].sort();
}

/** The signals declared directly in `scope` (or everything for null). */
export const inScope = (sigs: VcdSignal[], scope: string | null) => (scope === null ? sigs : sigs.filter((s) => (s.scope ?? "") === scope));
