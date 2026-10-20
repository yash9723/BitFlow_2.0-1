"use client";
/**
 * components/admin/ModerationAdmin.tsx — reported / hidden / recent comments
 * (/api/admin/comments) and a problem's editorial (/api/admin/editorial).
 */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Failed, Loading, ago, getJson } from "./ui";

interface Row { id: string; body: string; hidden: boolean; reports: number; createdAt: string; username: string; problem: string; href: string }
type Filter = "reported" | "hidden" | "recent";

function Comments() {
  const [filter, setFilter] = useState<Filter>("reported");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    setError(null);
    getJson<{ comments: Row[] }>(`/api/admin/comments?filter=${filter}`).then((d) => setRows(d.comments), (e) => setError(e.message));
  }, [filter]);
  useEffect(load, [load]);

  const setHidden = async (id: string, hidden: boolean) => {
    const r = await fetch("/api/admin/comments", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, hidden }) });
    if (r.ok) load(); else setError((await r.json().catch(() => ({}))).error ?? "Failed.");
  };

  return (
    <div className="space-y-3 font-mono text-[10px]">
      <div className="flex gap-1" role="radiogroup" aria-label="Which comments">
        {(["reported", "hidden", "recent"] as Filter[]).map((f) => (
          <button key={f} role="radio" aria-checked={filter === f} onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded border capitalize ${filter === f ? "border-info/60 text-info bg-info/10" : "border-rim text-dim hover:text-ghost"}`}>{f}</button>
        ))}
      </div>
      {error && <Failed message={error} retry={load} />}
      {!rows && !error && <Loading what="comments" />}
      {rows?.length === 0 && <p className="text-dim">Nothing here.</p>}
      {rows?.map((c) => (
        <div key={c.id} className={`border rounded p-2 ${c.hidden ? "border-danger/30 bg-danger/5" : "border-rim/40"}`}>
          <div className="flex flex-wrap items-center gap-2 text-dim">
            <span className="text-ghost">{c.username}</span>
            <span>on <Link href={c.href} className="text-info hover:underline">{c.problem}</Link></span>
            <span>{ago(c.createdAt)}</span>
            {c.reports > 0 && <span className="text-warn">{c.reports} report{c.reports === 1 ? "" : "s"}</span>}
            {c.hidden && <span className="text-danger">hidden</span>}
            <button onClick={() => setHidden(c.id, !c.hidden)} className="ml-auto px-2 py-0.5 rounded border border-rim hover:text-bright">
              {c.hidden ? "Restore" : "Hide"}
            </button>
          </div>
          <p className="text-[11px] text-pale whitespace-pre-wrap break-words mt-1">{c.body}</p>
        </div>
      ))}
    </div>
  );
}

function Editorial() {
  const [slug, setSlug] = useState("");
  const [loaded, setLoaded] = useState<{ title: string } | null>(null);
  const [text, setText] = useState("");
  const [note, setNote] = useState<string | null>(null);

  const load = async () => {
    setNote(null);
    try {
      const d = await getJson<{ title: string; editorial: string | null }>(`/api/admin/editorial?slug=${encodeURIComponent(slug.trim())}`);
      setLoaded(d); setText(d.editorial ?? "");
    } catch (e) { setLoaded(null); setNote((e as Error).message); }
  };
  const save = async () => {
    const r = await fetch("/api/admin/editorial", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug: slug.trim(), editorial: text }) });
    setNote(r.ok ? "Saved. Solvers see it at the top of the discussion." : (await r.json().catch(() => ({}))).error ?? "Failed.");
  };

  return (
    <div className="space-y-2 font-mono text-[10px]">
      <div className="flex gap-2">
        <input value={slug} onChange={(e) => setSlug(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()} placeholder="problem slug, e.g. and-gate"
               aria-label="Problem slug" className="bg-pit border border-rim/60 rounded px-2 py-1 text-[11px] text-bright w-64" />
        <button onClick={load} className="px-3 py-1 rounded border border-rim text-ghost hover:text-bright">Load</button>
      </div>
      {loaded && (
        <>
          <p className="text-ghost">{loaded.title}</p>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={10} aria-label="Editorial (Markdown)"
                    placeholder="How to think about this problem, the key idea, common mistakes… (Markdown; shown only to people who solved it)"
                    className="w-full bg-pit border border-rim/60 rounded px-2 py-1.5 text-[11px] text-pale font-mono resize-y" />
          <button onClick={save} className="px-3 py-1 rounded border border-info/50 text-info hover:bg-info/10">Save editorial</button>
        </>
      )}
      {note && <p className="text-dim">{note}</p>}
    </div>
  );
}

export default function ModerationAdmin() {
  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <div><h3 className="font-mono text-[9px] text-dim uppercase tracking-widest mb-2">Comments</h3><Comments /></div>
      <div><h3 className="font-mono text-[9px] text-dim uppercase tracking-widest mb-2">Editorial</h3><Editorial /></div>
    </div>
  );
}
