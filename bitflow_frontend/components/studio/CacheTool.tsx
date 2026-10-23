"use client";
/**
 * components/studio/CacheTool.tsx — /studio/cache: configure a cache, run an address trace
 * through it step by step, and see each access split into tag / index / offset, hit or miss
 * (compulsory, capacity, conflict), what was evicted, the cache contents and the totals.
 * Simulation in lib/studio/cache.ts. Loaded client-only (the draft is in localStorage).
 */

import { useMemo, useState } from "react";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import {
  type Access, type CacheConfig, type Line, type Outcome, type Policy, type Stats, type Step, TRACES, amat, geometry, parseTrace, simulate,
} from "@/lib/studio/cache";

interface Draft { cfg: CacheConfig; trace: string; hitTime: number; penalty: number }
const START: Draft = {
  cfg: { sizeBytes: 1024, blockBytes: 16, ways: 1, policy: "LRU", writeBack: true, writeAllocate: true, addrBits: 16 },
  trace: TRACES[3].make(), hitTime: 1, penalty: 50,
};
const SIZES = [64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384, 32768, 65536];
const BLOCKS = [4, 8, 16, 32, 64, 128];
const MAX_TRACE = 20000;
const SHOWN_SETS = 32;
type Geometry = Exclude<ReturnType<typeof geometry>, string>;

const bytes = (n: number) => (n >= 1024 ? `${n / 1024} KB` : `${n} B`);
const hx = (n: number, digits = 0) => `0x${n.toString(16).toUpperCase().padStart(digits, "0")}`;
const field = "bg-pit border border-rim/60 rounded px-2 py-1 text-[12px] text-pale";
const btn = "px-2 py-1 rounded border border-rim/60 text-ghost hover:text-bright text-[11px] disabled:opacity-40";
const TONE: Record<Outcome, string> = { hit: "text-phosphor", compulsory: "text-info", capacity: "text-warn", conflict: "text-danger" };
const FILL: Record<Outcome, string> = { hit: "bg-phosphor/15", compulsory: "bg-info/15", capacity: "bg-warn/15", conflict: "bg-danger/15" };

export default function CacheTool() {
  const [stored, setDraft] = useLocalStorage<Draft>("bitflow_studio_cache", START);
  const d: Draft = { ...START, ...stored, cfg: { ...START.cfg, ...stored?.cfg } };
  const set = (patch: Partial<Draft>) => setDraft({ ...d, ...patch });
  const setCfg = (patch: Partial<CacheConfig>) => {
    const cfg = { ...d.cfg, ...patch };
    cfg.blockBytes = Math.min(cfg.blockBytes, cfg.sizeBytes);
    cfg.ways = Math.min(cfg.ways, cfg.sizeBytes / cfg.blockBytes);  // keep the associativity possible
    set({ cfg });
  };

  const cfgKey = JSON.stringify(d.cfg);
  const cfg = useMemo(() => JSON.parse(cfgKey) as CacheConfig, [cfgKey]);
  const g = geometry(cfg);
  const parsed = useMemo(() => parseTrace(d.trace, cfg.addrBits), [d.trace, cfg.addrBits]);
  const trace = useMemo(() => (typeof parsed === "string" ? [] : parsed.slice(0, MAX_TRACE)), [parsed]);
  const N = trace.length;
  const [stepRaw, setStep] = useState<number | null>(null);          // null: the end of the trace
  const k = Math.min(N, stepRaw ?? N);
  const result = useMemo(() => { const r = simulate(cfg, trace.slice(0, k)); return typeof r === "string" ? null : r; }, [cfg, trace, k]);
  const cur = result && k > 0 ? result.steps[k - 1] : null;
  const blocksTotal = cfg.sizeBytes / cfg.blockBytes;

  return (
    <div className="space-y-5">
      <div>
        <p className="text-[12px] text-ghost max-w-3xl">
          Pick a cache, give it a list of memory accesses, and step through them: each address splits into tag, set index and offset,
          then hits or misses. Misses are sorted into the &quot;3 Cs&quot;: compulsory (first touch), capacity (too small) and conflict (too few ways).
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3 font-mono text-[12px]">
        <Sel label="Cache size" value={cfg.sizeBytes} onChange={(v) => setCfg({ sizeBytes: v })} options={SIZES.map((s) => [s, bytes(s)])} />
        <Sel label="Block size" value={cfg.blockBytes} onChange={(v) => setCfg({ blockBytes: v })} options={BLOCKS.filter((b) => b <= cfg.sizeBytes).map((b) => [b, bytes(b)])} />
        <Sel label="Associativity" value={cfg.ways} onChange={(v) => setCfg({ ways: v })}
             options={[...[1, 2, 4, 8, 16, 32].filter((w) => w < blocksTotal).map((w): [number, string] => [w, w === 1 ? "direct mapped" : `${w}-way`]),
               [blocksTotal, `fully associative (${blocksTotal})`]]} />
        <label className="space-y-1"><span className="block text-[10px] uppercase tracking-wider text-dim">Replacement</span>
          <select value={cfg.policy} onChange={(e) => setCfg({ policy: e.target.value as Policy })} className={field} aria-label="Replacement">
            <option value="LRU">LRU</option><option value="FIFO">FIFO</option><option value="random">random</option>
          </select>
        </label>
        <label className="space-y-1"><span className="block text-[10px] uppercase tracking-wider text-dim">Writes</span>
          <select value={`${cfg.writeBack}/${cfg.writeAllocate}`} aria-label="Write policy" className={field}
                  onChange={(e) => { const [wb, wa] = e.target.value.split("/"); setCfg({ writeBack: wb === "true", writeAllocate: wa === "true" }); }}>
            <option value="true/true">write-back, write-allocate</option><option value="false/false">write-through, no write-allocate</option>
            <option value="false/true">write-through, write-allocate</option><option value="true/false">write-back, no write-allocate</option>
          </select>
        </label>
        <Sel label="Address bits" value={cfg.addrBits} onChange={(v) => setCfg({ addrBits: v })} options={[[16, "16"], [32, "32"]]} />
        <label className="space-y-1"><span className="block text-[10px] uppercase tracking-wider text-dim">Hit / miss cycles</span>
          <span className="flex gap-1">
            <input type="number" min={0} value={d.hitTime} onChange={(e) => set({ hitTime: Math.max(0, Number(e.target.value) || 0) })} className={`${field} w-14`} aria-label="Hit time" />
            <input type="number" min={0} value={d.penalty} onChange={(e) => set({ penalty: Math.max(0, Number(e.target.value) || 0) })} className={`${field} w-16`} aria-label="Miss penalty" />
          </span>
        </label>
      </div>

      {typeof g === "string" ? <p className="font-mono text-[12px] text-danger">{g}</p> : <AddressBar g={g} addrBits={cfg.addrBits} addr={cur?.addr} />}

      <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
        <div className="space-y-2 font-mono text-[12px]">
          <div className="flex flex-wrap gap-1.5">
            {TRACES.map((t) => <button key={t.label} className={btn} title={t.blurb} onClick={() => { set({ trace: t.make() }); setStep(null); }}>{t.label}</button>)}
          </div>
          <textarea value={d.trace} onChange={(e) => { set({ trace: e.target.value }); setStep(null); }} rows={16} spellCheck={false} aria-label="Address trace"
                    className={`${field} w-full leading-snug`} />
          <p className="text-[11px] text-dim">One access per line: R 0x1A2C or W 4096 (a bare address is a read); # starts a comment.
            {typeof parsed !== "string" && parsed.length > MAX_TRACE && ` Only the first ${MAX_TRACE} accesses are used.`}</p>
          {typeof parsed === "string" && <p className="text-danger">{parsed}</p>}
        </div>

        {result && typeof g !== "string" && (
          <div className="space-y-4 min-w-0 font-mono text-[12px]">
            <div className="flex flex-wrap items-center gap-2">
              <button className={btn} onClick={() => setStep(0)} disabled={k === 0} aria-label="Start">⏮</button>
              <button className={btn} onClick={() => setStep(Math.max(0, k - 1))} disabled={k === 0} aria-label="Back one access">◀</button>
              <button className={btn} onClick={() => setStep(Math.min(N, k + 1))} disabled={k >= N} aria-label="Forward one access">▶</button>
              <button className={btn} onClick={() => setStep(null)} disabled={k >= N} aria-label="End">⏭</button>
              <input type="range" min={0} max={N} value={k} onChange={(e) => setStep(Number(e.target.value))} className="flex-1 min-w-[120px]" aria-label="Access" />
              <span className="text-dim">{k} / {N}</span>
            </div>
            {cur ? (
              <div className={`rounded-lg border border-rim/60 px-3 py-2 ${FILL[cur.outcome]}`}>
                <span className="text-dim">#{k}</span> {cur.op === "W" ? "write" : "read"} {hx(cur.addr)} → tag {hx(cur.tag)}, set {cur.index}, offset {cur.offset}:{" "}
                <b className={TONE[cur.outcome]}>{cur.outcome === "hit" ? "HIT" : `MISS (${cur.outcome})`}</b>
                {cur.outcome !== "hit" && (cur.way === null ? ", written straight to memory (no write-allocate)" : `, loaded into way ${cur.way}`)}
                {cur.evicted && `, evicting tag ${hx(cur.evicted.tag)}${cur.evicted.dirty ? " (dirty: written back first)" : ""}`}
                {cur.memWrite && cur.way !== null && ", and written through to memory"}.
              </div>
            ) : <div className="rounded-lg border border-rim/60 px-3 py-2 text-dim">Empty cache. Press ▶ to run the first access.</div>}

            <Contents sets={result.sets} ways={cfg.ways} cur={cur} tagDigits={Math.ceil(g.tagBits / 4)} />
            <Totals s={result.stats} hitTime={d.hitTime} penalty={d.penalty} blockBytes={cfg.blockBytes} />
            <Log steps={result.steps} />
          </div>
        )}
      </div>

      {typeof g !== "string" && N > 0 && <Sweeps cfg={cfg} trace={trace} hitTime={d.hitTime} penalty={d.penalty} />}
    </div>
  );
}

function Sel({ label, value, onChange, options }: { label: string; value: number; onChange: (v: number) => void; options: [number, string][] }) {
  return (
    <label className="space-y-1"><span className="block text-[10px] uppercase tracking-wider text-dim">{label}</span>
      <select value={value} onChange={(e) => onChange(Number(e.target.value))} className={field} aria-label={label}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}

/** The address fields, with the current address's bits under them. */
function AddressBar({ g, addrBits, addr }: { g: Geometry; addrBits: number; addr?: number }) {
  const bin = addr !== undefined ? addr.toString(2).padStart(addrBits, "0") : null;
  const parts: [string, number, string][] = [["tag", g.tagBits, "border-warn/50 text-warn"], ["index", g.indexBits, "border-info/50 text-info"], ["offset", g.offsetBits, "border-phosphor/50 text-phosphor"]];
  let from = 0;
  return (
    <div className="font-mono text-[11px] space-y-1">
      <div className="flex gap-1 max-w-3xl">
        {parts.filter(([, w]) => w > 0).map(([name, w, tone]) => {
          const bits = bin?.slice(from, from + w);
          from += w;
          return (
            <div key={name} style={{ flexGrow: w }} className={`border rounded px-2 py-1 text-center ${tone} min-w-[72px]`}>
              <div>{name} · {w} bit{w === 1 ? "" : "s"}</div>
              {bits && <div className="text-pale tracking-wider break-all">{bits}</div>}
            </div>
          );
        })}
      </div>
      <div className="text-dim">{g.sets} set{g.sets === 1 ? "" : "s"} × {g.blocks / g.sets} way{g.blocks / g.sets === 1 ? "" : "s"} = {g.blocks} blocks</div>
    </div>
  );
}

function Contents({ sets, ways, cur, tagDigits }: { sets: Line[][]; ways: number; cur: Step | null; tagDigits: number }) {
  const rows = sets.map((s, i) => [i, s] as const).filter(([i, s]) => sets.length <= SHOWN_SETS || i === cur?.index || s.some((l) => l.valid)).slice(0, 64);
  const shownWays = Math.min(ways, 16);
  return (
    <div className="overflow-x-auto rounded-lg border border-rim/60">
      <table className="w-full text-[11px]">
        <thead className="bg-surface/60 text-dim">
          <tr><th className="px-2 py-1 text-left">set</th>{Array.from({ length: shownWays }, (_, w) => <th key={w} className="px-2 py-1 text-left">way {w}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map(([i, s]) => {
            const recency = s.filter((l) => l.valid).map((l) => l.used).sort((a, b) => b - a);   // 0 = most recently used
            return (
              <tr key={i} className={i === cur?.index ? "bg-info/10" : ""}>
                <td className="px-2 py-1 text-dim">{i}</td>
                {s.slice(0, shownWays).map((l, w) => (
                  <td key={w} className={`px-2 py-1 whitespace-nowrap ${cur && i === cur.index && w === cur.way ? FILL[cur.outcome] : ""}`}>
                    {l.valid
                      ? <><span className="text-pale">{hx(l.tag, tagDigits)}</span>{l.dirty && <span className="text-warn"> D</span>}{ways > 1 && <span className="text-dim"> ·{recency.indexOf(l.used)}</span>}</>
                      : <span className="text-dim">—</span>}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="px-2 py-1 text-[10px] text-dim border-t border-rim/40">
        Tags in hex; D = dirty.{ways > 1 && " ·n = recency (0 = most recently used)."}{sets.length > SHOWN_SETS && ` ${sets.length} sets: showing the ones in use.`}
        {ways > 16 && ` Showing the first 16 of ${ways} ways.`}
      </div>
    </div>
  );
}

function Totals({ s, hitTime, penalty, blockBytes }: { s: Stats; hitTime: number; penalty: number; blockBytes: number }) {
  const misses = s.accesses - s.hits;
  const bar = (n: number, cls: string) => <div className={`h-2 ${cls}`} style={{ width: `${s.accesses ? (n / s.accesses) * 100 : 0}%` }} />;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-lg border border-rim/60 p-3 space-y-1.5">
        <div className="text-[10px] uppercase tracking-wider text-dim">Hits and misses</div>
        <div className="text-[18px] text-bright">{s.accesses ? ((s.hits / s.accesses) * 100).toFixed(1) : "0.0"}% <span className="text-[11px] text-dim">hit rate ({s.hits} / {s.accesses})</span></div>
        <div className="flex h-2 rounded overflow-hidden bg-pit">{bar(s.hits, "bg-phosphor/70")}{bar(s.compulsory, "bg-info/70")}{bar(s.capacity, "bg-warn/70")}{bar(s.conflict, "bg-danger/70")}</div>
        <div className="text-[11px]">
          <span className={TONE.compulsory}>{s.compulsory} compulsory</span> · <span className={TONE.capacity}>{s.capacity} capacity</span> · <span className={TONE.conflict}>{s.conflict} conflict</span> = {misses} misses
        </div>
      </div>
      <div className="rounded-lg border border-rim/60 p-3 space-y-1 text-[11px]">
        <div className="text-[10px] uppercase tracking-wider text-dim">Time and traffic</div>
        <div><span className="text-bright text-[14px]">{amat(s, hitTime, penalty).toFixed(2)}</span> <span className="text-dim">cycles average access time = {hitTime} + {s.accesses ? (misses / s.accesses).toFixed(3) : 0} × {penalty}</span></div>
        <div className="text-ghost">{s.blocksRead} block{s.blocksRead === 1 ? "" : "s"} read from memory ({bytes(s.blocksRead * blockBytes)})</div>
        <div className="text-ghost">{s.writebacks} dirty write-back{s.writebacks === 1 ? "" : "s"}, {s.memWrites} write{s.memWrites === 1 ? "" : "s"} straight to memory</div>
      </div>
    </div>
  );
}

function Log({ steps }: { steps: Step[] }) {
  const shown = steps.slice(-200);
  if (!shown.length) return null;
  return (
    <details className="rounded-lg border border-rim/60">
      <summary className="cursor-pointer px-3 py-1.5 text-ghost">Access log ({steps.length}{steps.length > 200 ? ", last 200 shown" : ""})</summary>
      <div className="max-h-64 overflow-y-auto">
        <table className="w-full text-[11px]">
          <thead className="text-dim sticky top-0 bg-pit"><tr>{["#", "op", "address", "tag", "set", "offset", "result", "evicted"].map((h) => <th key={h} className="px-2 py-1 text-left">{h}</th>)}</tr></thead>
          <tbody>
            {shown.map((s, i) => (
              <tr key={i} className="border-t border-rim/20">
                <td className="px-2 text-dim">{steps.length - shown.length + i + 1}</td><td className="px-2">{s.op}</td><td className="px-2">{hx(s.addr)}</td>
                <td className="px-2">{hx(s.tag)}</td><td className="px-2">{s.index}</td><td className="px-2">{s.offset}</td>
                <td className={`px-2 ${TONE[s.outcome]}`}>{s.outcome}</td>
                <td className="px-2 text-dim">{s.evicted ? `${hx(s.evicted.tag)}${s.evicted.dirty ? " (written back)" : ""}` : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/** What if: the same trace and capacity with other associativities and block sizes. */
function Sweeps({ cfg, trace, hitTime, penalty }: { cfg: CacheConfig; trace: Access[]; hitTime: number; penalty: number }) {
  const rows = useMemo(() => {
    const blocks = cfg.sizeBytes / cfg.blockBytes;
    const run = (c: CacheConfig) => { const r = simulate(c, trace); return typeof r === "string" ? null : r.stats; };
    const ways = [...new Set([1, 2, 4, 8, blocks].filter((w) => w <= blocks))]
      .map((w) => [w === blocks ? `fully associative` : w === 1 ? "direct mapped" : `${w}-way`, w === cfg.ways, run({ ...cfg, ways: w })] as const);
    const sizes = BLOCKS.filter((b) => b <= cfg.sizeBytes)
      .map((b) => [`${bytes(b)} blocks`, b === cfg.blockBytes, run({ ...cfg, blockBytes: b, ways: Math.min(cfg.ways, cfg.sizeBytes / b) })] as const);
    return { ways, sizes };
  }, [cfg, trace]);
  const cell = (s: Stats | null) => (s && s.accesses ? `${((s.hits / s.accesses) * 100).toFixed(1)}% hits · AMAT ${amat(s, hitTime, penalty).toFixed(1)}` : "—");
  return (
    <section className="space-y-2 font-mono text-[12px] border-t border-rim/40 pt-4">
      <h2 className="font-display text-[15px] font-semibold">What if? The same trace in a {bytes(cfg.sizeBytes)} cache</h2>
      <div className="grid gap-6 md:grid-cols-2">
        {([["Associativity", rows.ways], ["Block size", rows.sizes]] as const).map(([title, list]) => (
          <table key={title} className="text-[11px]">
            <thead><tr><th className="text-left text-dim pr-6 pb-1">{title}</th><th className="text-left text-dim pb-1">result</th></tr></thead>
            <tbody>{list.map(([label, mine, s]) => (
              <tr key={label} className={mine ? "text-phosphor" : ""}><td className="pr-6 text-ghost">{label}{mine && " ◂"}</td><td className={mine ? "" : "text-pale"}>{cell(s)}</td></tr>
            ))}</tbody>
          </table>
        ))}
      </div>
    </section>
  );
}
