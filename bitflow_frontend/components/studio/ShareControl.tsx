"use client";
/**
 * components/studio/ShareControl.tsx — "Share" in a Studio tool's header: packs the tool's
 * drafts into a link (lib/studio/share.ts), and when a page opens with #s=…, offers to load
 * the shared design, keeping the visitor's own draft so "Undo" can bring it back.
 */

import { useEffect, useState } from "react";
import { MAX_SHARE_CHARS, decodeShare, encodeShare } from "@/lib/studio/share";

const BACKUP = "bitflow_share_backup";
const OPENED = "bitflow_share_opened";

export default function ShareControl({ path, keys }: { path: string; keys: string[] }) {
  const [incoming, setIncoming] = useState<Record<string, unknown> | null>(null);
  const [opened, setOpened] = useState(false);
  const [msg, setMsg] = useState<{ text: string; link?: string } | null>(null);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(OPENED) === path) { sessionStorage.removeItem(OPENED); setOpened(true); }
    } catch { /* storage blocked: nothing to undo */ }
    const m = /^#s=([A-Za-z0-9_-]+)$/.exec(window.location.hash);
    if (!m) return;
    decodeShare(m[1], keys).then((data) => {
      if (data) setIncoming(data);
      else setMsg({ text: "This share link is damaged or for another tool, so it can't be opened." });
    });
  }, [path, keys]);

  const share = async () => {
    const drafts: Record<string, unknown> = {};
    try {
      for (const k of keys) { const raw = localStorage.getItem(k); if (raw !== null) drafts[k] = JSON.parse(raw); }
    } catch { /* ignore entries we can't read */ }
    if (!Object.keys(drafts).length) { setMsg({ text: "Nothing to share yet: change something first." }); return; }
    const code = await encodeShare(drafts);
    if (code.length > MAX_SHARE_CHARS) {
      setMsg({ text: `This design is too big for a link (${Math.round(code.length / 1000)} kB, the limit is ${MAX_SHARE_CHARS / 1000} kB). Download the code instead.` });
      return;
    }
    const link = `${window.location.origin}${path}#s=${code}`;
    try { await navigator.clipboard.writeText(link); setMsg({ text: "Link copied. Anyone who opens it gets a copy of this design; nothing is uploaded.", link }); }
    catch { setMsg({ text: "Copy this link:", link }); }
  };

  const open = () => {
    if (!incoming) return;
    try {
      localStorage.setItem(BACKUP, JSON.stringify({ path, values: Object.fromEntries(keys.map((k) => [k, localStorage.getItem(k)])) }));
      for (const [k, v] of Object.entries(incoming)) localStorage.setItem(k, JSON.stringify(v));
      for (const k of keys) if (!(k in incoming)) localStorage.removeItem(k);
      sessionStorage.setItem(OPENED, path);
    } catch {
      setMsg({ text: "Your browser blocked local storage, so the shared design can't be opened here." });
      return;
    }
    window.history.replaceState(null, "", path);
    window.location.reload();
  };

  const undo = () => {
    try {
      const b = JSON.parse(localStorage.getItem(BACKUP) ?? "null") as { path: string; values: Record<string, string | null> } | null;
      if (!b || b.path !== path) return;
      for (const [k, raw] of Object.entries(b.values)) if (raw === null) localStorage.removeItem(k); else localStorage.setItem(k, raw);
      localStorage.removeItem(BACKUP);
    } catch { return; }
    window.location.reload();
  };

  const bar = "fixed left-1/2 -translate-x-1/2 bottom-4 z-40 max-w-[min(92vw,640px)] flex flex-wrap items-center gap-2 px-4 py-2.5 rounded-xl border border-rim bg-surface shadow-2xl font-mono text-[12px]";
  const btn = "px-2.5 py-1 rounded-lg border border-rim/60 text-ghost hover:text-bright";
  return (
    <>
      <button onClick={share} title="Copy a link to this design" className="text-ghost hover:text-bright">Share</button>
      {incoming && (
        <div role="dialog" aria-label="Shared design" className={bar}>
          <span className="text-pale">This link contains a shared design.</span>
          <button onClick={open} className="px-2.5 py-1 rounded-lg border border-phosphor/40 bg-phosphor/10 text-phosphor">Open it</button>
          <button onClick={() => { setIncoming(null); window.history.replaceState(null, "", path); }} className={btn}>Keep mine</button>
          <span className="text-dim text-[11px] w-full">Opening it replaces your current draft of this tool; you can undo that.</span>
        </div>
      )}
      {opened && !incoming && (
        <div role="status" className={bar}>
          <span className="text-pale">Opened the shared design.</span>
          <button onClick={undo} className={btn}>Undo</button>
          <button onClick={() => setOpened(false)} aria-label="Dismiss" className="text-dim hover:text-bright">×</button>
        </div>
      )}
      {msg && !incoming && !opened && (
        <div role="status" className={bar}>
          <span className="text-pale">{msg.text}</span>
          {msg.link && <input readOnly value={msg.link} onFocus={(e) => e.target.select()} aria-label="Share link"
                              className="w-full bg-pit border border-rim/60 rounded px-2 py-1 text-[11px] text-ghost" />}
          <button onClick={() => setMsg(null)} aria-label="Dismiss" className="ml-auto text-dim hover:text-bright">×</button>
        </div>
      )}
    </>
  );
}
