"use client";
/**
 * components/ContestsAdmin.tsx — admin page section: create, edit and delete contests.
 * Times are entered in the admin's local time and sent as ISO strings.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type Contest = { id: string; title: string; startsAt: string; endsAt: string; status: string; problems: number };

const input = "w-full bg-pit border border-rim rounded px-2 py-1.5 font-mono text-[12px] text-pale focus:outline-none focus:border-phosphor/50";

export default function ContestsAdmin() {
  const [contests, setContests] = useState<Contest[]>([]);
  const [title, setTitle] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [slugs, setSlugs] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/contests").then((r) => r.json()).then((d) => setContests(d.contests ?? [])).catch(() => {});
  }, []);
  useEffect(load, [load]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      const res = await fetch("/api/admin/contests", {
        method: editingId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingId ?? undefined,
          title,
          startsAt: startsAt && new Date(startsAt).toISOString(),
          endsAt:   endsAt && new Date(endsAt).toISOString(),
          problemSlugs: slugs.split(/[\s,]+/).filter(Boolean),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
      setMsg({ ok: true, text: `${editingId ? "Saved" : "Created"} "${data.contest.title}".` });
      setTitle(""); setSlugs(""); setEditingId(null);
      load();
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const edit = async (c: Contest) => {
    setMsg(null);
    const res = await fetch(`/api/admin/contests?id=${encodeURIComponent(c.id)}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setMsg({ ok: false, text: data.error ?? "Couldn't load the contest." }); return; }
    // <input type="datetime-local"> wants local time without a zone.
    const local = (iso: string) => { const d = new Date(iso); return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16); };
    setEditingId(c.id); setTitle(data.contest.title);
    setStartsAt(local(data.contest.startsAt)); setEndsAt(local(data.contest.endsAt));
    setSlugs((JSON.parse(data.contest.problemSlugs) as string[]).join(", "));
  };

  const remove = async (c: Contest) => {
    if (!window.confirm(`Delete the contest "${c.title}"? Submissions are kept; only the contest and its standings go.`)) return;
    const res = await fetch(`/api/admin/contests?id=${encodeURIComponent(c.id)}`, { method: "DELETE" });
    setMsg(res.ok ? { ok: true, text: `Deleted "${c.title}".` } : { ok: false, text: "Delete failed." });
    load();
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-bold uppercase tracking-wider text-bright">Contests</h2>
        <p className="text-[11px] text-dim mt-1">Timed sets of existing problems with live standings at /contests.</p>
      </div>

      <form onSubmit={create} className="grid sm:grid-cols-2 gap-3">
        <label className="sm:col-span-2 text-[11px] text-ghost space-y-1">
          <span>Title</span>
          <input className={input} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} required />
        </label>
        <label className="text-[11px] text-ghost space-y-1">
          <span>Starts (your local time)</span>
          <input type="datetime-local" className={input} value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required />
        </label>
        <label className="text-[11px] text-ghost space-y-1">
          <span>Ends</span>
          <input type="datetime-local" className={input} value={endsAt} onChange={(e) => setEndsAt(e.target.value)} required />
        </label>
        <label className="sm:col-span-2 text-[11px] text-ghost space-y-1">
          <span>Problem slugs, in order (A, B, C…), separated by commas or spaces</span>
          <textarea className={`${input} h-16`} value={slugs} onChange={(e) => setSlugs(e.target.value)} placeholder="and-gate, mod-n-counter, binary-divisibility-by-3" required />
        </label>
        <div className="sm:col-span-2 flex items-center gap-3">
          <button type="submit" disabled={busy}
                  className="px-4 py-1.5 rounded border border-phosphor/40 text-phosphor font-mono text-[11px] hover:bg-phosphor/10 disabled:opacity-40">
            {busy ? "Saving…" : editingId ? "Save changes" : "Create contest"}
          </button>
          {editingId && <button type="button" onClick={() => { setEditingId(null); setTitle(""); setSlugs(""); }} className="text-[11px] text-ghost hover:text-bright">Cancel</button>}
          {msg && <span role="status" className={`text-[11px] ${msg.ok ? "text-phosphor" : "text-danger"}`}>{msg.text}</span>}
        </div>
      </form>

      {contests.length > 0 && (
        <ul className="divide-y divide-rim/50 border border-rim rounded">
          {contests.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-[12px]">
              <Link href={`/contests/${c.id}`} className="text-pale hover:text-phosphor truncate">{c.title}</Link>
              <span className="text-[10px] text-dim">{new Date(c.startsAt).toLocaleString()} · {c.problems} problems · {c.status}</span>
              <button onClick={() => edit(c)} className="ml-auto text-[11px] text-info hover:underline">Edit</button>
              <button onClick={() => remove(c)} className="text-[11px] text-danger hover:underline">Delete</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
