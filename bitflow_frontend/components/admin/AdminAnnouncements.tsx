"use client";
/** components/admin/AdminAnnouncements.tsx — write, pin, edit and archive what students see on /announcements. */
import { useCallback, useEffect, useState } from "react";
import { ANNOUNCEMENT_KINDS, MAX_BODY, MAX_TITLE, type AnnouncementKind } from "@/lib/announcements";
import { Card, Failed, Loading, ago, getJson } from "./ui";

interface Post { id: string; title: string; body: string; kind: string; version: string | null; pinned: boolean; archived: boolean; publishedAt: string }
const EMPTY = { id: null as string | null, title: "", body: "", kind: "feature", pinned: false };
const field = "w-full bg-void border border-rim rounded px-2 py-1.5 text-[12px] text-pale";
const btn = "px-3 py-1.5 rounded border border-rim text-[11px] text-pale hover:text-bright hover:border-muted disabled:opacity-50";

export default function AdminAnnouncements() {
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    getJson<{ posts: Post[] }>("/api/admin/announcements").then((d) => { setPosts(d.posts); setError(null); }).catch((e) => setError(String(e.message ?? e)));
  }, []);
  useEffect(load, [load]);

  async function send(method: "POST" | "PATCH", body: object) {
    setSaving(true);
    setError(null);
    const r = await fetch("/api/admin/announcements", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const d = await r?.json().catch(() => ({}));
    setSaving(false);
    if (!r?.ok) { setError(d?.error ?? "Couldn't save that."); return false; }
    load();
    return true;
  }
  async function save() {
    const { id, ...fields } = form;
    if (await send(id ? "PATCH" : "POST", id ? { id, ...fields } : fields)) setForm(EMPTY);
  }

  if (error && !posts) return <Failed message={error} retry={load} />;
  if (!posts) return <Loading what="announcements" />;

  return (
    <div className="space-y-6">
      <Card title={form.id ? "Edit post" : "New post"} subtitle="Goes live on /announcements straight away, and shows on every student's bell. Not for data-breach notices: those go in System → Site notice.">
        <div className="space-y-3">
          <input value={form.title} maxLength={MAX_TITLE} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Title" aria-label="Title" className={field} />
          <textarea value={form.body} maxLength={MAX_BODY} rows={7} onChange={(e) => setForm({ ...form, body: e.target.value })} aria-label="Post"
                    placeholder={"Paragraphs split by a blank line.\n\n- Lines starting with a dash become bullets\n- `backticks` become code"} className={`${field} font-mono`} />
          <div className="flex flex-wrap items-center gap-3">
            <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} aria-label="Kind" className="bg-void border border-rim rounded px-2 py-1.5 text-[12px] text-pale">
              {Object.entries(ANNOUNCEMENT_KINDS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
            <label className="flex items-center gap-2 text-[12px] text-pale">
              <input type="checkbox" checked={form.pinned} onChange={(e) => setForm({ ...form, pinned: e.target.checked })} /> Pin to the top
            </label>
            <button onClick={save} disabled={saving} className={`${btn} border-info/50 text-info`}>{saving ? "Saving…" : form.id ? "Save changes" : "Publish"}</button>
            {form.id && <button onClick={() => setForm(EMPTY)} className={btn}>Cancel</button>}
          </div>
          {error && <p role="alert" className="text-[12px] text-danger">{error}</p>}
        </div>
      </Card>

      <Card title="Posts" subtitle={`${posts.length} in all. Release posts come from content/announcements.ts; editing one here stops deploys overwriting it.`}>
        <ul className="divide-y divide-rim/40">
          {posts.map((p) => (
            <li key={p.id} className="py-3 flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className={`text-[13px] ${p.archived ? "text-dim line-through" : "text-bright"}`}>{p.pinned ? "📌 " : ""}{p.title}</div>
                <div className="text-[10px] text-dim">{ANNOUNCEMENT_KINDS[p.kind as AnnouncementKind] ?? p.kind} · {ago(p.publishedAt)}{p.archived ? " · archived" : ""}</div>
              </div>
              <button className={btn} onClick={() => setForm({ id: p.id, title: p.title, body: p.body, kind: p.kind, pinned: p.pinned })}>Edit</button>
              <button className={btn} disabled={saving} onClick={() => send("PATCH", { id: p.id, pinned: !p.pinned })}>{p.pinned ? "Unpin" : "Pin"}</button>
              <button className={btn} disabled={saving} onClick={() => send("PATCH", { id: p.id, archived: !p.archived })}>{p.archived ? "Restore" : "Archive"}</button>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
