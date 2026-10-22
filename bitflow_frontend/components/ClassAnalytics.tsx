"use client";
/**
 * components/ClassAnalytics.tsx — the teacher's view of how a class is doing on
 * each assigned problem (GET /api/classes/[id]/analytics): solves, submits,
 * who is stuck, the most failed test, and designs that look copied.
 */
import Link from "next/link";
import { useEffect, useState } from "react";

interface ProblemStats {
  slug: string; title: string; href: string; assignments: string[];
  solved: number; tried: number; submits: number; stuck: string[];
  commonFailure: { test: string; count: number } | null;
  similar: { a: string; b: string; score: number }[];
}
interface Analytics { students: number; problems: ProblemStats[]; activity: { username: string; submits: number; lastSubmit: string | null }[] }

export default function ClassAnalytics({ classId }: { classId: string }) {
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetch(`/api/classes/${classId}/analytics`)
      .then(async (r) => { const d = await r.json().catch(() => ({})); if (r.ok) setData(d); else setError(d.error ?? "Couldn't load analytics."); })
      .catch(() => setError("Couldn't load analytics."));
  }, [classId]);

  if (error) return <p className="text-[12px] text-danger">{error}</p>;
  if (!data) return <p className="text-[12px] text-dim animate-pulse">Loading analytics…</p>;
  const quiet = data.activity.filter((s) => s.submits === 0);

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto border border-rim/60 rounded-xl">
        <table className="text-[11px] min-w-full">
          <thead>
            <tr className="border-b border-rim/40 text-left text-dim">
              <th scope="col" className="px-3 py-2 font-semibold text-bright">Problem</th>
              <th scope="col" className="px-2 font-normal">Solved</th>
              <th scope="col" className="px-2 font-normal">Submits</th>
              <th scope="col" className="px-2 font-normal">Stuck (5+ tries)</th>
              <th scope="col" className="px-2 font-normal">Most failed test</th>
              <th scope="col" className="px-2 font-normal">Look alike</th>
            </tr>
          </thead>
          <tbody>
            {data.problems.map((p) => (
              <tr key={p.slug} className="border-b border-rim/20 last:border-0 align-top">
                <th scope="row" className="text-left font-normal px-3 py-1.5">
                  <Link href={p.href} className="text-pale hover:text-info">{p.title}</Link>
                  <div className="text-[10px] text-dim">{p.assignments.join(", ")}</div>
                </th>
                <td className="px-2 py-1.5 whitespace-nowrap">{p.solved}/{data.students}</td>
                <td className="px-2 py-1.5">{p.submits}{p.tried ? <span className="text-dim"> ({(p.submits / p.tried).toFixed(1)} each)</span> : null}</td>
                <td className="px-2 py-1.5 text-warn">{p.stuck.join(", ") || <span className="text-dim">nobody</span>}</td>
                <td className="px-2 py-1.5">{p.commonFailure ? <>{p.commonFailure.test} <span className="text-dim">×{p.commonFailure.count}</span></> : <span className="text-dim">–</span>}</td>
                <td className="px-2 py-1.5">
                  {p.similar.length === 0 ? <span className="text-dim">–</span>
                    : p.similar.map((s) => <div key={`${s.a}-${s.b}`} className="text-danger whitespace-nowrap">{s.a} ↔ {s.b} <span className="text-dim">{Math.round(s.score * 100)}%</span></div>)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-dim leading-relaxed">
        &ldquo;Look alike&rdquo; compares accepted designs with comments, layout and names ignored and the starter code left out; it
        flags pairs that are 90% the same. Short designs and well-known solutions can match honestly, so treat it as a
        reason to look, not as proof.
        {quiet.length > 0 && <> No graded submits yet: {quiet.map((s) => s.username).join(", ")}.</>}
      </p>
    </div>
  );
}
