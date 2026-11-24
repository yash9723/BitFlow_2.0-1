"use client";
/**
 * components/OptimizationBoard.tsx — "smallest design" leaderboard for one
 * problem: accepted designs ranked by gate count, then logic depth.
 * Used by ProblemStatement and ArenaSolverClient.
 */

import { useEffect, useState } from "react";

type Entry = { rank: number; username: string; gates: number; depth: number; ffBits: number; mhz: number | null; area: number | null;
               routedArea?: number | null; routedSlack?: number | null; isMe: boolean };
type Board = { solvers: number; entries: Entry[]; me: Entry | null };
type Mode = "gates" | "area" | "layout";

/** fastest: rank by clock frequency after place and route (timing problems) instead of size. */
export default function OptimizationBoard({ slug, refreshKey, fastest = false }: { slug: string; refreshKey?: unknown; fastest?: boolean }) {
  const [board, setBoard] = useState<Board | null>(null);
  const [mode, setMode] = useState<Mode>("gates");   // 2-input gates, Sky130 cell area, or routed area after layout
  const [entryKey, setEntryKey] = useState(0);        // bumps when the learner's own layout finishes
  const byArea = mode === "area";
  const sort = fastest ? "?sort=fmax" : mode === "area" ? "?sort=area" : mode === "layout" ? "?sort=layout" : "";

  useEffect(() => {
    fetch(`/api/problems/${encodeURIComponent(slug)}/optimization${sort}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setBoard)
      .catch(() => setBoard(null));
  }, [slug, refreshKey, sort, entryKey]);

  if (!board) return null;

  const tabs = !fastest && (
    <div className="flex gap-1 text-[10px]" role="tablist" aria-label="Rank by">
      {([["Gates", "gates"], ["Chip area", "area"], ["After layout", "layout"]] as const).map(([label, m]) => (
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
        sign-off (DRC, LVS, equivalence, antenna). Only layouts that pass every check rank. Smaller routed area wins; ties go
        to whoever got there first. Slack is the typical corner at 10 ns, shown but not ranked.
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
      {entry.state !== "pending" && entry.state !== "done" && (
        <button onClick={start} disabled={busy}
                className="px-2 py-0.5 border border-phosphor/60 text-phosphor hover:bg-phosphor/10 disabled:opacity-50">
          {busy ? "Starting…" : entry.state === "failed" ? "Try the layout again" : "Lay out my solution (about a minute)"}
        </button>
      )}
      {error && <p role="alert" className="text-danger">{error}</p>}
    </div>
  );
}
