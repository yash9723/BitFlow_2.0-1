"use client";
/**
 * components/OptimizationBoard.tsx — "smallest design" leaderboard for one
 * problem: accepted designs ranked by gate count, then logic depth.
 * Used by ProblemStatement and ArenaSolverClient.
 */

import { useEffect, useState } from "react";

type Entry = { rank: number; username: string; gates: number; depth: number; ffBits: number; mhz: number | null; area: number | null; isMe: boolean };
type Board = { solvers: number; entries: Entry[]; me: Entry | null };

/** fastest: rank by clock frequency after place and route (timing problems) instead of size. */
export default function OptimizationBoard({ slug, refreshKey, fastest = false }: { slug: string; refreshKey?: unknown; fastest?: boolean }) {
  const [board, setBoard] = useState<Board | null>(null);
  const [byArea, setByArea] = useState(false);   // gates (2-input gates) or chip area (Sky130 µm²)
  const sort = fastest ? "?sort=fmax" : byArea ? "?sort=area" : "";

  useEffect(() => {
    fetch(`/api/problems/${encodeURIComponent(slug)}/optimization${sort}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setBoard)
      .catch(() => setBoard(null));
  }, [slug, refreshKey, sort]);

  if (!board) return null;

  const tabs = !fastest && (
    <div className="flex gap-1 text-[10px]" role="tablist" aria-label="Rank by">
      {([["Gates", false], ["Chip area", true]] as const).map(([label, area]) => (
        <button key={label} role="tab" aria-selected={byArea === area} onClick={() => setByArea(area)}
                className={`px-2 py-0.5 border ${byArea === area ? "border-phosphor/60 text-phosphor" : "border-rim text-dim hover:text-pale"}`}>
          {label}
        </button>
      ))}
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
