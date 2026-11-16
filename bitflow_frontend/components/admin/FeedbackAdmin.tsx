"use client";
/** components/admin/FeedbackAdmin.tsx — the admin console's Feedback tab (/api/admin/feedback): survey score, helpful votes per page, and the messages. */

import { useCallback, useEffect, useState } from "react";
import { Card, Loading } from "@/components/admin/ui";
import { CATEGORIES } from "@/lib/feedback";

interface Item {
  id: string; createdAt: string; kind: string; rating: number | null; helpful: boolean | null;
  category: string | null; message: string | null; path: string; target: string | null; userId: string | null; handled: boolean;
}
interface Data { items: Item[]; open: number; survey: { average: number | null; count: number }; helpful: { target: string; up: number; down: number }[] }

const KIND_LABEL: Record<string, string> = { survey: "Survey", general: "Feedback", helpful: "Helpful?", problem: "Problem issue" };
const categoryLabel = (kind: string, c: string | null) =>
  (kind === "general" || kind === "problem") ? CATEGORIES[kind].find((x) => x.value === c)?.label ?? c : null;

export default function FeedbackAdmin() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState("all");
  const [showHandled, setShowHandled] = useState(false);
  const load = useCallback(() => {
    fetch("/api/admin/feedback").then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setData).catch((e) => setError(String(e.message ?? e)));
  }, []);
  useEffect(load, [load]);
  const mark = async (id: string, handled: boolean) => {
    const r = await fetch("/api/admin/feedback", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, handled }) });
    if (r.ok) load(); else setError(`Couldn't update (HTTP ${r.status})`);
  };

  if (error) return <p className="text-danger text-[12px]">{error}</p>;
  if (!data) return <Loading what="feedback" />;
  // Bare thumbs votes (no comment) are counted in the table above, not listed one by one.
  const shown = data.items.filter((f) => (kind === "all" || f.kind === kind) && (showHandled || !f.handled) && !(f.kind === "helpful" && !f.message));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="New-user survey" subtitle="Last 30 days">
          <p className="text-[28px] text-bright font-bold">{data.survey.average != null ? `${data.survey.average.toFixed(1)} / 5` : "—"}</p>
          <p className="text-[12px] text-ghost">{data.survey.count} response{data.survey.count === 1 ? "" : "s"}</p>
        </Card>
        <Card title="Was this helpful?" subtitle="Votes per page, most 👎 first">
          {!data.helpful.length ? <p className="text-[12px] text-dim">No votes yet.</p> : (
            <table className="w-full text-[12px]">
              <tbody>
                {data.helpful.slice(0, 12).map((h) => (
                  <tr key={h.target} className="border-b border-rim/40">
                    <td className="py-1 text-pale">{h.target}</td>
                    <td className="py-1 text-right text-phosphor tabular-nums">👍 {h.up}</td>
                    <td className="py-1 text-right text-danger tabular-nums">👎 {h.down}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      <Card title={`Feedback (${data.open} open)`} subtitle="From the Feedback button, the survey, problem reports and 👎 comments."
            action={
              <div className="flex items-center gap-3 text-[11px] text-ghost">
                <select value={kind} onChange={(e) => setKind(e.target.value)} className="bg-pit border border-rim/60 rounded px-2 py-1">
                  <option value="all">All kinds</option>
                  {Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
                <label className="flex items-center gap-1.5"><input type="checkbox" checked={showHandled} onChange={(e) => setShowHandled(e.target.checked)} /> show handled</label>
              </div>
            }>
        {!shown.length && <p className="text-[12px] text-dim">Nothing {showHandled ? "" : "open "}here.</p>}
        <ul className="space-y-3">
          {shown.map((f) => (
            <li key={f.id} className={`rounded-lg border border-rim/60 p-3 space-y-1.5 ${f.handled ? "opacity-60" : ""}`}>
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[12px]">
                <span className="px-1.5 rounded border border-rim text-ghost text-[10px] uppercase">{KIND_LABEL[f.kind] ?? f.kind}</span>
                {f.rating != null && <span className="text-phosphor">{"★".repeat(f.rating)}{"☆".repeat(5 - f.rating)}</span>}
                {f.helpful === false && <span className="text-danger">👎</span>}
                {categoryLabel(f.kind, f.category) && <span className="text-bright font-semibold">{categoryLabel(f.kind, f.category)}</span>}
                <a href={f.path} className="text-info hover:underline" target="_blank" rel="noreferrer">{f.target ?? f.path}</a>
                <span className="text-dim">{f.userId ? "signed in" : "guest"}</span>
                <span className="text-dim ml-auto">{new Date(f.createdAt).toLocaleString()}</span>
              </div>
              {f.message && <p className="text-[12px] text-pale whitespace-pre-wrap break-words">{f.message}</p>}
              <button onClick={() => mark(f.id, !f.handled)} className="text-[11px] text-dim hover:text-bright underline">
                {f.handled ? "Mark as open" : "Mark as handled"}
              </button>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
