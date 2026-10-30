"use client";
/**
 * components/studio/CircuitChallengeBar.tsx — a challenge's statement above the circuit editor,
 * and its Check button: graded here at once, then on the server, which is what awards XP.
 */

import Link from "next/link";
import { useState } from "react";
import type { Circuit } from "@/lib/studio/circuit";
import { type CircuitChallenge, type Grade, gradeCircuit } from "@/lib/studio/circuit-challenges";

export default function CircuitChallengeBar({ ch, circuit, solved, onStartOver, onLoadSolution }: {
  ch: CircuitChallenge; circuit: Circuit; solved: boolean; onStartOver: () => void; onLoadSolution: (c: Circuit) => void;
}) {
  const [grade, setGrade] = useState<Grade | null>(null);
  const [done, setDone] = useState(solved);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState(false);

  const check = async () => {
    const g = gradeCircuit(ch, circuit);
    setGrade(g);
    setNote(null);
    if (!g.ok) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/studio/challenges/${ch.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ circuit }) });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) setNote("signin");
      else if (!res.ok) setNote(data.error ?? `The server couldn't check it (${res.status}).`);
      else if (!data.grade?.ok) { setGrade(data.grade); }
      else {
        setDone(true);
        setNote(data.xpAwarded ? `+${data.xpAwarded} XP` : "You had already solved this one, so no more XP.");
      }
    } catch {
      setNote("Couldn't reach the server, so no XP this time. Your circuit is still here.");
    } finally {
      setBusy(false);
    }
  };
  const loadSaved = async () => {
    const res = await fetch(`/api/progress/lessons?kind=challenge&slug=${ch.id}`);
    const data = await res.json().catch(() => ({}));
    try { if (data.draft) onLoadSolution(JSON.parse(data.draft)); } catch { /* an old draft that no longer parses: nothing to load */ }
  };
  const port = (p: { name: string; width?: number; clock?: boolean }) => `${p.name}${(p.width ?? 1) > 1 ? `[${p.width}]` : ""}`;

  return (
    <div className="rounded-xl border border-phosphor/30 bg-phosphor/5 p-4 space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[13px] text-pale max-w-3xl">{ch.statement}</p>
        <span className="font-mono text-[11px] text-dim shrink-0">{ch.level} · {ch.xp} XP{done ? " · ✓ solved" : ""}</span>
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1 font-mono text-[11px] text-ghost">
        <span>in: <span className="text-pale">{ch.inputs.map(port).join(", ")}</span></span>
        <span>out: <span className="text-pale">{ch.outputs.map(port).join(", ")}</span></span>
        <span>parts: <span className="text-pale">{ch.parts.join(", ")}</span></span>
        <span>at most <span className="text-pale">{ch.budget}</span> gate{ch.budget === 1 ? "" : "s"}, with a 3-input gate counting as two</span>
      </div>
      <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
        <button onClick={check} disabled={busy} className="px-3 py-1 rounded bg-phosphor/20 border border-phosphor/50 text-phosphor hover:text-bright disabled:opacity-50">
          {busy ? "Checking…" : "Check my circuit"}
        </button>
        <button onClick={() => setHint((h) => !h)} className="px-2 py-1 rounded border border-rim/60 text-ghost hover:text-bright">{hint ? "Hide hint" : "Hint"}</button>
        <button onClick={onStartOver} title="Back to just the inputs and outputs (Ctrl+Z undoes it)" className="px-2 py-1 rounded border border-rim/60 text-ghost hover:text-bright">Start over</button>
        {done && <button onClick={loadSaved} className="px-2 py-1 rounded border border-rim/60 text-ghost hover:text-bright">Load my solution</button>}
        <Link href="/studio/challenges" className="px-2 py-1 text-info hover:underline">All challenges</Link>
      </div>
      {hint && <p className="text-[12px] text-ghost">{ch.hint}</p>}
      {grade && (
        <div role="status" className="font-mono text-[12px] space-y-1">
          {grade.ok && <p className="text-phosphor">✓ Correct, in {grade.gates} gate{grade.gates === 1 ? "" : "s"}.{note && note !== "signin" ? ` ${note}` : ""}</p>}
          {grade.ok && note === "signin" && <p className="text-warn"><Link href="/login" className="underline">Sign in</Link> to earn the XP. Your circuit stays here.</p>}
          {grade.reason && <p className="text-danger">{grade.reason}</p>}
          {grade.overBudget && <p className="text-warn">It works, but it uses {grade.gates} gates and the budget is {ch.budget}. Look for gates you can share.</p>}
          {grade.failing && (
            <div className="text-danger">
              <p>{grade.failing.step}{Object.keys(grade.failing.inputs).length ? ` (${Object.entries(grade.failing.inputs).map(([k, v]) => `${k} = ${v}`).join(", ")})` : ""}:</p>
              <ul className="pl-4 list-disc">{grade.failing.wrong.map((w) => <li key={w.name}>{w.name} should be {w.expected}, but it is {w.got}.</li>)}</ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
