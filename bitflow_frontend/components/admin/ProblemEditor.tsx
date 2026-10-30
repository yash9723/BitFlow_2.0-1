"use client";
/**
 * components/admin/ProblemEditor.tsx — edit or archive one problem (PATCH /api/admin/problems/[slug]).
 * Changing the tests or the starter is re-verified on the server against the reference solution.
 */
import { useEffect, useState } from "react";
import { Failed, Loading, getJson } from "./ui";

interface Editable {
  slug: string; title: string; statement: string; difficulty: string; category: string; tags: string; xpReward: number;
  archived: boolean; problemType: string; starterCode: string; publicTestbench: string;
  hiddenTestbench: string | null; hiddenTestcases: string; hasReference: boolean;
}

const input = "w-full bg-pit border border-rim/60 rounded px-2 py-1.5 text-[11px] text-bright focus:outline-none focus:border-info/60";
const code = `${input} font-mono resize-y`;
const label = "block text-[9px] text-dim uppercase space-y-1";

const tagsText = (json: string) => { try { return (JSON.parse(json) as string[]).join(", "); } catch { return ""; } };
const pretty = (json: string) => { try { return JSON.stringify(JSON.parse(json), null, 2); } catch { return json; } };

export default function ProblemEditor({ slug, onSaved, onClose }: { slug: string; onSaved: () => void; onClose: () => void }) {
  const [p, setP] = useState<Editable | null>(null);
  const [orig, setOrig] = useState<Editable | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    setP(null); setError(null); setMsg(null);
    getJson<{ problem: Editable }>(`/api/admin/problems/${encodeURIComponent(slug)}`).then((d) => {
      if (!live) return;
      const q = { ...d.problem, tags: tagsText(d.problem.tags), hiddenTestcases: pretty(d.problem.hiddenTestcases) };
      setP(q); setOrig(q);
    }, (e) => live && setError(e.message));
    return () => { live = false; };
  }, [slug]);

  if (error) return <Failed message={error} />;
  if (!p || !orig) return <Loading what="the problem" />;
  const set = <K extends keyof Editable>(k: K, v: Editable[K]) => setP((x) => (x ? { ...x, [k]: v } : x));

  const send = async (body: Record<string, unknown>, done: string) => {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch(`/api/admin/problems/${encodeURIComponent(slug)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Failed (${res.status})`);
      setMsg({ ok: true, text: data.verified ? `${done} The reference still passes and the starter still fails.` : done });
      setOrig(p);
      onSaved();
      return true;
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
      return false;
    } finally { setBusy(false); }
  };

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    // Only what changed: an untouched test field must not trigger re-verification.
    const body: Record<string, unknown> = {};
    for (const k of ["title", "statement", "difficulty", "category", "xpReward", "starterCode", "publicTestbench", "hiddenTestbench", "hiddenTestcases"] as const) {
      if (p[k] !== orig[k]) body[k] = p[k];
    }
    if (p.tags !== orig.tags) body.tags = p.tags.split(",").map((t) => t.trim()).filter(Boolean);
    if (Object.keys(body).length === 0) { setMsg({ ok: true, text: "Nothing changed." }); return; }
    void send(body, "Saved.");
  };

  const archive = async () => {
    const next = !p.archived;
    if (next && !window.confirm(`Hide "${p.title}" from learners? Submissions and progress are kept, and you can restore it here.`)) return;
    if (await send({ archived: next }, next ? "Archived: learners no longer see it." : "Restored.")) set("archived", next);
  };

  return (
    <form onSubmit={save} className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-[12px] font-bold text-bright">Edit {slug}</h3>
        {p.archived && <span className="text-[9px] px-1.5 rounded border border-warn/50 text-warn uppercase">Archived</span>}
        {!p.hasReference && <span className="text-[10px] text-warn">No reference solution: only the text and tags can be changed.</span>}
        <button type="button" onClick={onClose} className="ml-auto text-[10px] text-dim hover:text-bright">Close</button>
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        <label className={label}><span>Title</span><input className={input} value={p.title} onChange={(e) => set("title", e.target.value)} required maxLength={200} /></label>
        <label className={label}><span>Tags (comma-separated)</span><input className={input} value={p.tags} onChange={(e) => set("tags", e.target.value)} /></label>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <label className={label}><span>Difficulty</span><input className={input} value={p.difficulty} onChange={(e) => set("difficulty", e.target.value)} required /></label>
        <label className={label}><span>Category</span><input className={input} value={p.category} onChange={(e) => set("category", e.target.value)} required /></label>
        <label className={label}><span>XP</span><input type="number" min={0} max={5000} className={input} value={p.xpReward} onChange={(e) => set("xpReward", Number(e.target.value))} required /></label>
      </div>
      <label className={label}><span>Statement (Markdown)</span><textarea rows={8} className={code} value={p.statement} onChange={(e) => set("statement", e.target.value)} required /></label>
      <fieldset disabled={!p.hasReference} className="space-y-3 disabled:opacity-50">
        <div className="grid xl:grid-cols-2 gap-3">
          <label className={label}><span>Starter code</span><textarea rows={8} className={code} value={p.starterCode} onChange={(e) => set("starterCode", e.target.value)} required /></label>
          <label className={label}><span>Public testbench</span><textarea rows={8} className={code} value={p.publicTestbench} onChange={(e) => set("publicTestbench", e.target.value)} /></label>
          <label className={label}><span>Hidden testbench</span><textarea rows={8} className={code} value={p.hiddenTestbench ?? ""} onChange={(e) => set("hiddenTestbench", e.target.value || null)} /></label>
          <label className={label}><span>Hidden test cases (JSON)</span><textarea rows={8} className={code} value={p.hiddenTestcases} onChange={(e) => set("hiddenTestcases", e.target.value)} /></label>
        </div>
      </fieldset>
      {msg && <p role="status" className={`p-2 rounded border text-[10px] ${msg.ok ? "border-phosphor/30 bg-phosphor/10 text-phosphor" : "border-danger/30 bg-danger/10 text-danger"}`}>{msg.text}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="px-4 py-1.5 rounded border border-info/60 text-info text-[11px] font-semibold hover:bg-info/10 disabled:opacity-40">{busy ? "Working…" : "Save changes"}</button>
        <button type="button" onClick={archive} disabled={busy} className={`px-4 py-1.5 rounded border text-[11px] disabled:opacity-40 ${p.archived ? "border-phosphor/50 text-phosphor" : "border-danger/50 text-danger"}`}>{p.archived ? "Restore" : "Archive"}</button>
      </div>
    </form>
  );
}
