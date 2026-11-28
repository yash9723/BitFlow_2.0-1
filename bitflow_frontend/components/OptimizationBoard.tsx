"use client";
/**
 * components/OptimizationBoard.tsx — "smallest design" leaderboard for one
 * problem: accepted designs ranked by gate count, then logic depth.
 * Used by ProblemStatement and ArenaSolverClient.
 */

import { useEffect, useState } from "react";

type Entry = { rank: number; username: string; gates: number; depth: number; ffBits: number; mhz: number | null; area: number | null;
               routedArea?: number | null; routedSlack?: number | null; routedMhz?: number | null; routedPeriod?: number | null; isMe: boolean };
type Board = { solvers: number; entries: Entry[]; me: Entry | null };
type Mode = "gates" | "area" | "layout" | "speed";

/** fastest: rank by clock frequency after place and route (timing problems) instead of size. */
export default function OptimizationBoard({ slug, refreshKey, fastest = false }: { slug: string; refreshKey?: unknown; fastest?: boolean }) {
  const [board, setBoard] = useState<Board | null>(null);
  const [mode, setMode] = useState<Mode>("gates");   // 2-input gates, Sky130 cell area, or routed area after layout
  const [entryKey, setEntryKey] = useState(0);        // bumps when the learner's own layout finishes
  const byArea = mode === "area";
  const sort = fastest ? "?sort=fmax" : mode === "area" ? "?sort=area" : mode === "layout" ? "?sort=layout" : mode === "speed" ? "?sort=speed" : "";

  useEffect(() => {
    fetch(`/api/problems/${encodeURIComponent(slug)}/optimization${sort}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setBoard)
      .catch(() => setBoard(null));
  }, [slug, refreshKey, sort, entryKey]);

  if (!board) return null;

  const tabs = !fastest && (
    <div className="flex gap-1 text-[10px]" role="tablist" aria-label="Rank by">
      {([["Gates", "gates"], ["Chip area", "area"], ["After layout", "layout"], ["Fastest after layout", "speed"]] as const).map(([label, m]) => (
        <button key={label} role="tab" aria-selected={mode === m} onClick={() => setMode(m)}
                className={`px-2 py-0.5 border ${mode === m ? "border-phosphor/60 text-phosphor" : "border-rim text-dim hover:text-pale"}`}>
          {label}
        </button>
      ))}
    </div>
  );

  if (mode === "layout" && !fastest) return (
    <div className="space-y-2 font-mono">
      {tabs}
      <LayoutEntry slug={slug} onDone={() => setEntryKey((k) => k + 1)} />
      <p className="text-[9px] text-dim">
        Opt in with your accepted solution: OpenROAD places and routes it on SkyWater 130 nm at a 10 ns clock, then runs
        sign-off (DRC, LVS, equivalence, antenna). Only layouts that pass every check rank. The score is the area of your
        design&apos;s cells after layout, including the clock tree and buffers the flow adds, but not fill or tap cells.
        Smaller wins; ties go to whoever got there first. Slack is the typical corner at 10 ns, shown but not ranked.
      </p>
      {board.entries.length > 0 ? (
        <table className="w-full text-[10px]">
          <thead><tr className="text-dim text-left"><th className="font-normal pr-2">#</th><th className="font-normal">Who</th><th className="font-normal text-right">µm²</th><th className="font-normal text-right">Slack</th></tr></thead>
          <tbody>
            {board.entries.map((e) => (
              <tr key={e.rank} className={e.isMe ? "text-phosphor" : "text-pale"}>
                <td className="pr-2">{e.rank}</td><td className="truncate max-w-[10rem]">{e.username}</td>
                <td className="text-right">{e.routedArea?.toLocaleString()}</td>
                <td className={`text-right ${e.routedSlack != null && e.routedSlack < 0 ? "text-danger" : ""}`}>{e.routedSlack != null ? `${e.routedSlack.toFixed(2)} ns` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className="text-[10px] text-dim">No layouts yet: be the first.</p>}
    </div>
  );

  if (mode === "speed" && !fastest) return (
    <div className="space-y-2 font-mono">
      {tabs}
      <SpeedEntry slug={slug} onDone={() => setEntryKey((k) => k + 1)} />
      <p className="text-[9px] text-dim">
        Starts from your clean After layout entry: OpenROAD lays the same solution out again at faster clocks, down a fixed
        ladder of periods (8 to 1 ns), until one misses timing. The score is the clock speed of the fastest layout that met
        timing at the typical corner with every sign-off check passing. Higher wins; ties go to whoever got there first. The
        flow upsizes cells to go faster, so this chip is bigger than your After layout one. Up to four layouts, a few minutes.
      </p>
      {board.entries.length > 0 ? (
        <table className="w-full text-[10px]">
          <thead><tr className="text-dim text-left"><th className="font-normal pr-2">#</th><th className="font-normal">Who</th><th className="font-normal text-right">MHz</th><th className="font-normal text-right">at</th></tr></thead>
          <tbody>
            {board.entries.map((e) => (
              <tr key={e.rank} className={e.isMe ? "text-phosphor" : "text-pale"}>
                <td className="pr-2">{e.rank}</td><td className="truncate max-w-[10rem]">{e.username}</td>
                <td className="text-right">{e.routedMhz?.toLocaleString()}</td>
                <td className="text-right text-dim">{e.routedPeriod != null ? `${e.routedPeriod} ns` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className="text-[10px] text-dim">No speed runs yet: be the first.</p>}
    </div>
  );

  if (byArea && !fastest) return (
    <div className="space-y-2 font-mono">
      {tabs}
      <p className="text-[10px] text-pale">
        {board.me?.area != null ? <>Your best: <span className="text-phosphor font-bold">{board.me.area.toLocaleString()} µm²</span><span className="text-dim"> (#{board.me.rank} of {board.solvers})</span></>
                                : <span className="text-dim">Solve it to join the smallest-chip leaderboard.</span>}
      </p>
      <p className="text-[9px] text-dim">
        Accepted designs are mapped to SkyWater 130 nm standard cells (Sky130 HD), as the Sandbox&apos;s ASIC panel does.
        Smaller area wins; ties go to whoever got there first. Before placement: a real block also needs routing space.
      </p>
      {board.entries.length > 0 && (
        <table className="w-full text-[10px]">
          <thead><tr className="text-dim text-left"><th className="font-normal pr-2">#</th><th className="font-normal">Who</th><th className="font-normal text-right">µm²</th></tr></thead>
          <tbody>
            {board.entries.map((e) => (
              <tr key={e.rank} className={e.isMe ? "text-phosphor" : "text-pale"}>
                <td className="pr-2">{e.rank}</td><td className="truncate max-w-[10rem]">{e.username}</td><td className="text-right">{e.area?.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );

  if (fastest) return (
    <div className="space-y-2 font-mono">
      <p className="text-[10px] text-pale">
        {board.me ? <>Your best: <span className="text-phosphor font-bold">{board.me.mhz} MHz</span><span className="text-dim"> (#{board.me.rank} of {board.solvers})</span></>
                  : <span className="text-dim">Solve it to join the fastest-design leaderboard.</span>}
      </p>
      <p className="text-[9px] text-dim">Accepted designs are placed and routed for an iCE40-HX8K. Higher Fmax wins; ties go to whoever got there first.</p>
      {board.entries.length > 0 && (
        <table className="w-full text-[10px]">
          <thead><tr className="text-dim text-left"><th className="font-normal pr-2">#</th><th className="font-normal">Who</th><th className="font-normal text-right">MHz</th></tr></thead>
          <tbody>
            {board.entries.map((e) => (
              <tr key={e.rank} className={e.isMe ? "text-phosphor" : "text-pale"}>
                <td className="pr-2">{e.rank}</td><td className="truncate max-w-[10rem]">{e.username}</td><td className="text-right">{e.mhz}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );

  return (
    <div className="space-y-2 font-mono">
      {tabs}
      {board.me ? (
        <p className="text-[10px] text-pale">
          Your best: <span className="text-phosphor font-bold">{board.me.gates} gates</span> · depth {board.me.depth}
          {" "}· {board.me.ffBits} flip-flop{board.me.ffBits === 1 ? "" : "s"}
          <span className="text-dim"> (#{board.me.rank} of {board.solvers})</span>
        </p>
      ) : (
        <p className="text-[10px] text-dim">Solve it to get a score and join the smallest-design leaderboard.</p>
      )}
      <p className="text-[9px] text-dim">
        Accepted designs are synthesized to 2-input gates and muxes. Fewer gates wins; ties go to the shorter
        logic path (depth), then to whoever got there first. Flip-flops are shown but not ranked.
      </p>
      {board.entries.length > 0 && (
        <table className="w-full text-[10px]">
          <thead>
            <tr className="text-dim text-left">
              <th className="font-normal pr-2">#</th>
              <th className="font-normal">Who</th>
              <th className="font-normal text-right">Gates</th>
              <th className="font-normal text-right">Depth</th>
              <th className="font-normal text-right">FFs</th>
            </tr>
          </thead>
          <tbody>
            {board.entries.map((e) => (
              <tr key={e.rank} className={e.isMe ? "text-phosphor" : "text-pale"}>
                <td className="pr-2">{e.rank}</td>
                <td className="truncate max-w-[10rem]">{e.username}</td>
                <td className="text-right">{e.gates}</td>
                <td className="text-right">{e.depth}</td>
                <td className="text-right">{e.ffBits}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

type EntryState = { solved?: boolean; state: "pending" | "done" | "failed" | null; message?: string | null; area?: number | null;
                    slack?: number | null; ranked?: boolean; stage?: string | null; position?: number | null };

/** The learner's own after-layout entry: start it, follow it, and say why it does or doesn't rank. */
function LayoutEntry({ slug, onDone }: { slug: string; onDone: () => void }) {
  const [entry, setEntry] = useState<EntryState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const url = `/api/problems/${encodeURIComponent(slug)}/layout-entry`;

  useEffect(() => {
    let stop = false, timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      const r = await fetch(url).catch(() => null);
      const d: EntryState | null = r?.ok ? await r.json().catch(() => null) : null;
      if (stop) return;
      setEntry(d);
      if (d?.state === "pending") timer = setTimeout(poll, 4000);
      else if (d?.state === "done") onDone();
    };
    poll();
    return () => { stop = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-poll only when the entry is (re)started
  }, [url, busy]);

  const start = async () => {
    setError(null); setBusy(true);
    const r = await fetch(url, { method: "POST" }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    if (!r?.ok) setError(d.error ?? "The layout couldn't start.");
    setBusy(false);
  };

  if (!entry) return null;
  if (entry.solved === false) return <p className="text-[10px] text-dim">Solve it to enter the after-layout leaderboard.</p>;
  return (
    <div className="text-[10px] space-y-1" role="status">
      {entry.state === "pending" ? <p className="text-info">Laying out your solution{entry.stage ? `: ${entry.stage}` : entry.position ? ` (queue position ${entry.position})` : "…"}</p>
       : entry.state === "done" ? (
         <p className={entry.ranked ? "text-phosphor" : "text-warn"}>
           Your layout: {entry.area?.toLocaleString()} µm²{entry.slack != null ? ` · slack ${entry.slack.toFixed(2)} ns` : ""}
           {entry.ranked ? " · ranked" : ""}{entry.message ? ` · ${entry.message}` : ""}
         </p>)
       : entry.state === "failed" ? <p className="text-danger">{entry.message ?? "The layout failed."}</p> : null}
      {entry.state !== "pending" && (
        <button onClick={start} disabled={busy}
                className="px-2 py-0.5 border border-phosphor/60 text-phosphor hover:bg-phosphor/10 disabled:opacity-50">
          {busy ? "Starting…" : entry.state === "failed" ? "Try the layout again"
            : entry.state === "done" ? "Lay out my latest solution again" : "Lay out my solution (about a minute)"}
        </button>
      )}
      {error && <p role="alert" className="text-danger">{error}</p>}
    </div>
  );
}

type SpeedState = { solved?: boolean; ready?: boolean; state: "pending" | "done" | "failed" | null; message?: string | null; mhz?: number | null;
                    periodNs?: number | null; runs?: { periodNs: number; pass: boolean | null; slackNs: number | null }[]; maxRuns?: number;
                    stage?: string | null; position?: number | null; waiting?: boolean };

/** The learner's own speed run: start it, follow each rung, show the result. Each poll also moves the run on. */
function SpeedEntry({ slug, onDone }: { slug: string; onDone: () => void }) {
  const [s, setS] = useState<SpeedState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const url = `/api/problems/${encodeURIComponent(slug)}/speed-entry`;

  useEffect(() => {
    let stop = false, timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      const r = await fetch(url).catch(() => null);
      const d: SpeedState | null = r?.ok ? await r.json().catch(() => null) : null;
      if (stop) return;
      setS(d);
      if (d?.state === "pending") timer = setTimeout(poll, 5000);
      else if (d?.state === "done") onDone();
    };
    poll();
    return () => { stop = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-poll only when the run is (re)started
  }, [url, busy]);

  const start = async () => {
    setError(null); setBusy(true);
    const r = await fetch(url, { method: "POST" }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    if (!r?.ok) setError(d.error ?? "The speed run couldn't start.");
    setBusy(false);
  };

  if (!s) return null;
  if (s.solved === false) return <p className="text-[10px] text-dim">Solve it to enter the fastest-after-layout board.</p>;
  if (!s.ready) return <p className="text-[10px] text-dim">Lay out your solution on the After layout tab first: the speed run starts from a clean layout.</p>;
  const runs = s.runs ?? [];
  const cur = runs[runs.length - 1];
  return (
    <div className="text-[10px] space-y-1" role="status">
      {s.state === "pending" && cur && (
        <p className="text-info">
          Layout {runs.length} of up to {s.maxRuns} at {cur.periodNs} ns
          {s.waiting ? ": waiting for the layout server" : s.stage ? `: ${s.stage}` : s.position ? ` (queue position ${s.position})` : "…"}
        </p>
      )}
      {runs.some((r) => r.pass !== null) && (
        <p className="text-dim">
          {runs.filter((r) => r.pass !== null).map((r) => `${r.periodNs} ns ${r.pass ? "met" : "missed"}`).join(" · ")}
        </p>
      )}
      {s.state === "done" && s.mhz != null && (
        <p className="text-phosphor">Your speed: {s.mhz.toLocaleString()} MHz (laid out at {s.periodNs} ns){s.message ? <span className="text-warn"> · {s.message}</span> : null}</p>
      )}
      {s.state === "failed" && <p className="text-danger">{s.message ?? "The speed run failed."}</p>}
      {s.state !== "pending" && (
        <button onClick={start} disabled={busy}
                className="px-2 py-0.5 border border-phosphor/60 text-phosphor hover:bg-phosphor/10 disabled:opacity-50">
          {busy ? "Starting…" : s.state ? "Run the speed test again" : "Find my fastest clock (a few minutes)"}
        </button>
      )}
      {error && <p role="alert" className="text-danger">{error}</p>}
    </div>
  );
}
