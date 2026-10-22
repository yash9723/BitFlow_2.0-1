"use client";
/**
 * components/Discussion.tsx — a problem's editorial and comments, for people
 * who solved it (GET/POST /api/problems/[slug]/discussion; lib/discussion.ts).
 * Comments are shown as plain text. Used by ProblemStatement and the Arena.
 */
import { useCallback, useEffect, useState } from "react";
import { renderMarkdown } from "@/components/ArenaProblemStatement";

interface Comment { id: string; body: string; createdAt: string; username: string; mine: boolean; reported: boolean }
const MAX = 2000;

export default function Discussion({ slug, refreshKey }: { slug: string; refreshKey?: unknown }) {
  const [data, setData] = useState<{ editorial: string | null; comments: Comment[] } | null>(null);
  const [locked, setLocked] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const url = `/api/problems/${encodeURIComponent(slug)}/discussion`;

  const load = useCallback(() => {
    fetch(url).then(async (r) => {
      const body = await r.json().catch(() => ({}));
      if (r.ok && body.locked) setLocked(body.locked);
      else if (r.ok) { setData(body); setLocked(null); } else setLocked(body.error ?? "Discussion unavailable.");
    }).catch(() => setLocked("Discussion unavailable."));
  }, [url]);
  useEffect(load, [load, refreshKey]);

  if (locked) return <p className="font-mono text-[10px] text-dim">🔒 {locked}</p>;
  if (!data) return null;

  const post = async () => {
    setBusy(true); setError(null);
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: text }) });
    const body = await r.json().catch(() => ({}));
    if (r.ok) { setData({ ...data, comments: [...data.comments, body.comment] }); setText(""); } else setError(body.error ?? "Couldn't post.");
    setBusy(false);
  };
  const act = async (c: Comment, how: "report" | "delete") => {
    if (how === "delete" && !window.confirm("Delete your comment?")) return;
    if (how === "report" && !window.confirm("Report this comment to the admins?")) return;
    const r = await fetch(`${url}/${c.id}${how === "report" ? "/report" : ""}`, { method: how === "report" ? "POST" : "DELETE" });
    if (!r.ok) { setError((await r.json().catch(() => ({}))).error ?? "Couldn't do that."); return; }
    setData({ ...data, comments: how === "delete" ? data.comments.filter((x) => x.id !== c.id) : data.comments.map((x) => (x.id === c.id ? { ...x, reported: true } : x)) });
  };

  return (
    <div className="space-y-3 font-mono">
      {data.editorial && (
        <div className="rounded border border-info/30 bg-info/5 p-3 space-y-1">
          <div className="text-[9px] text-info uppercase tracking-widest">Editorial</div>
          <div className="text-[11px] text-pale">{renderMarkdown(data.editorial)}</div>
        </div>
      )}
      {data.comments.length === 0 && <p className="text-[10px] text-dim">No comments yet. Share how you approached it, or what tripped you up.</p>}
      {data.comments.map((c) => (
        <div key={c.id} className="border-b border-rim/30 pb-2">
          <div className="flex items-center gap-2 text-[9px] text-dim">
            <span className="text-ghost">{c.username}</span>
            <span>{new Date(c.createdAt).toLocaleDateString()}</span>
            <span className="ml-auto flex gap-2">
              {c.mine
                ? <button onClick={() => act(c, "delete")} className="hover:text-danger">Delete</button>
                : c.reported ? <span>Reported</span> : <button onClick={() => act(c, "report")} className="hover:text-warn">Report</button>}
            </span>
          </div>
          <p className="text-[11px] text-pale whitespace-pre-wrap break-words mt-1">{c.body}</p>
        </div>
      ))}
      <div className="space-y-1">
        <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={MAX} rows={3} aria-label="Write a comment"
                  placeholder="Your approach, a tip, a question… (others here have solved it too)"
                  className="w-full bg-pit border border-rim rounded px-2 py-1.5 text-[11px] text-pale resize-y focus:outline-none focus:border-info/60" />
        <div className="flex items-center gap-2 text-[9px] text-dim">
          <span>{text.length}/{MAX}</span>
          {error && <span className="text-danger">{error}</span>}
          <button onClick={post} disabled={busy || !text.trim()}
                  className="ml-auto px-3 py-1 rounded border border-info/50 text-info hover:bg-info/10 disabled:opacity-40 text-[10px]">
            {busy ? "Posting…" : "Post"}
          </button>
        </div>
      </div>
    </div>
  );
}
