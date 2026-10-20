"use client";
/** components/admin/AdminProblems.tsx — every problem with its stats and setup status, plus create / references. */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import ReferenceSolutionsAdmin from "@/components/ReferenceSolutionsAdmin";
import { problemHref } from "@/lib/problem-href";
import NewProblemForm from "./NewProblemForm";
import DebugProblemsAdmin from "./DebugProblemsAdmin";
import { Card, Failed, Loading, Stat, getJson, pct } from "./ui";

interface Row {
  id: string; slug: string; title: string; difficulty: string; category: string; learningLevel: string;
  problemType: string; moduleId: string; orderIndex: number; xpReward: number;
  submits: number; accepted: number; solvers: number; hasReference: boolean; hasMutants: boolean;
}

/** Can a learner finish it, and does a wrong answer get a waveform diff / counterexample? */
function setup(r: Row): { label: string; tone: string } {
  if (r.problemType === "testbench" || r.problemType === "formal") {
    return r.hasMutants ? { label: "bugs imported", tone: "text-phosphor" } : { label: "no bugs: unsolvable", tone: "text-danger" };
  }
  return r.hasReference ? { label: "reference", tone: "text-phosphor" } : { label: "no reference", tone: "text-warn" };
}

const LEVELS = ["all", "Verilog Beginner", "Verilog Intermediate", "Verilog Advanced", "Arena"];
type Sort = "order" | "submits" | "rate";

export default function AdminProblems() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [level, setLevel] = useState("all");
  const [onlyIssues, setOnlyIssues] = useState(false);
  const [sort, setSort] = useState<Sort>("order");
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(() => {
    setError(null);
    getJson<{ problems: Row[] }>("/api/admin/problems").then((d) => setRows(d.problems), (e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const shown = useMemo(() => {
    if (!rows) return [];
    const needle = q.trim().toLowerCase();
    const list = rows.filter((r) =>
      (level === "all" || r.learningLevel === level) &&
      (!needle || r.title.toLowerCase().includes(needle) || r.slug.includes(needle) || r.category.toLowerCase().includes(needle)) &&
      (!onlyIssues || setup(r).tone !== "text-phosphor"));
    const rate = (r: Row) => (r.submits ? r.accepted / r.submits : 2);   // unattempted last when sorting by rate
    if (sort === "submits") list.sort((a, b) => b.submits - a.submits);
    if (sort === "rate") list.sort((a, b) => rate(a) - rate(b));
    return list;
  }, [rows, q, level, onlyIssues, sort]);

  if (error) return <Failed message={error} retry={load} />;
  if (!rows) return <Loading what="problems" />;

  const issues = rows.filter((r) => setup(r).tone !== "text-phosphor").length;
  const byType = (t: string) => rows.filter((r) => r.problemType === t).length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Problems" value={rows.length} hint={`${byType("design")} design · ${byType("testbench")} testbench · ${byType("formal")} formal`} />
        <Stat label="Graded submits" value={rows.reduce((n, r) => n + r.submits, 0)} tone="info" />
        <Stat label="Overall accept rate" value={pct(rows.reduce((n, r) => n + r.accepted, 0) / Math.max(1, rows.reduce((n, r) => n + r.submits, 0)))} tone="phosphor" />
        <Stat label="Need setup" value={issues} hint="no reference / no bugs" tone={issues ? "warn" : "phosphor"} />
      </div>

      <Card title="Problem registry" subtitle={`${shown.length} of ${rows.length} shown`}
            action={<button onClick={() => setShowForm((v) => !v)} className="text-[10px] px-3 py-1 rounded border border-info/50 text-info hover:bg-info/10">
              {showForm ? "Close form" : "+ New problem"}</button>}>
        {showForm && <div className="mb-6 pb-6 border-b border-rim/40"><NewProblemForm onCreated={load} /></div>}

        <div className="flex flex-wrap items-center gap-2 mb-3 text-[10px]">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title, slug or category"
                 className="bg-pit border border-rim/60 rounded px-2 py-1 text-[11px] text-bright w-56 focus:outline-none focus:border-info/60" aria-label="Search problems" />
          <select value={level} onChange={(e) => setLevel(e.target.value)} aria-label="Level"
                  className="bg-pit border border-rim/60 rounded px-2 py-1 text-ghost">
            {LEVELS.map((l) => <option key={l} value={l}>{l === "all" ? "All levels" : l}</option>)}
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort"
                  className="bg-pit border border-rim/60 rounded px-2 py-1 text-ghost">
            <option value="order">Curriculum order</option><option value="submits">Most submitted</option><option value="rate">Lowest accept rate</option>
          </select>
          <label className="flex items-center gap-1 text-dim"><input type="checkbox" checked={onlyIssues} onChange={(e) => setOnlyIssues(e.target.checked)} /> Needs setup only</label>
        </div>

        <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
          <table className="w-full text-[10px]">
            <thead className="sticky top-0 bg-surface text-dim uppercase text-[9px]">
              <tr className="text-left">
                <th className="py-2 pr-2">Problem</th><th className="pr-2">Level</th><th className="pr-2">Type</th>
                <th className="pr-2 text-right">Submits</th><th className="pr-2 text-right">Accept</th>
                <th className="pr-2 text-right">Solvers</th><th className="pr-2">Setup</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const s = setup(r);
                const rate = r.submits ? r.accepted / r.submits : null;
                return (
                  <tr key={r.id} className="border-t border-rim/20 hover:bg-pit/40">
                    <td className="py-1.5 pr-2">
                      <Link href={problemHref(r)} className="text-pale hover:text-info">{r.title}</Link>
                      <div className="text-[9px] text-dim">{r.slug} · {r.category} · {r.xpReward} XP</div>
                    </td>
                    <td className="pr-2 text-ghost whitespace-nowrap">{r.learningLevel.replace("Verilog ", "")}</td>
                    <td className="pr-2 text-ghost">{r.problemType}</td>
                    <td className="pr-2 text-right text-ghost">{r.submits}</td>
                    <td className={`pr-2 text-right font-bold ${rate == null ? "text-dim" : rate < 0.3 ? "text-danger" : rate < 0.6 ? "text-warn" : "text-phosphor"}`}>{pct(rate)}</td>
                    <td className="pr-2 text-right text-ghost">{r.solvers}</td>
                    <td className={`pr-2 whitespace-nowrap ${s.tone}`}>{s.label}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Reference solutions" subtitle="Upload a verified answer (or a model testbench / harness, which generates the bugs to catch)">
        <ReferenceSolutionsAdmin />
      </Card>

      <Card title="Fix-the-bug problems" subtitle="Arena problems made from reference solutions with one line broken">
        <DebugProblemsAdmin onChanged={load} />
      </Card>
    </div>
  );
}
