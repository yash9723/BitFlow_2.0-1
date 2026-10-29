"use client";
/** components/admin/AdminSystem.tsx — database health and the error log. */
import { useCallback, useEffect, useState } from "react";
import ErrorLogAdmin from "@/components/ErrorLogAdmin";
import { Card, Failed, Loading, Panel, Stat, ago, getJson } from "./ui";

interface DbHealth {
  bootId: string; bootedAt: string; databaseUrl: string | null; provider: "postgres" | "sqlite" | "unknown"; latencyMs: number;
  counts: { users: number; submissions: number; progress: number; questions: number };
  latestUser: { username: string; createdAt: string } | null;
  latestSubmission: { createdAt: string; accepted: boolean } | null;
}

function Database() {
  const [h, setH] = useState<DbHealth | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => { setError(null); getJson<DbHealth>("/api/admin/db-health").then(setH, (e) => setError(e.message)); }, []);
  useEffect(load, [load]);

  return (
    <Card title="Database" subtitle={h ? `${h.provider === "postgres" ? "PostgreSQL" : h.provider === "sqlite" ? "SQLite file" : "Unknown"} · ${h.databaseUrl ?? "DATABASE_URL not set"}` : undefined}
          action={<button onClick={load} className="text-[10px] text-info hover:underline">Refresh</button>}>
      {error && <Failed message={error} retry={load} />}
      {!h && !error && <Loading what="database health" />}
      {h && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Stat label="Round trip" value={`${h.latencyMs} ms`} tone={h.latencyMs > 500 ? "warn" : "phosphor"} hint="one indexed query" />
            <Stat label="Users" value={h.counts.users} />
            <Stat label="Submissions" value={h.counts.submissions} />
            <Stat label="Progress rows" value={h.counts.progress} />
            <Stat label="Problems" value={h.counts.questions} />
          </div>
          <p className="text-[10px] text-dim">
            Latest sign-up: <span className="text-ghost">{h.latestUser ? `${h.latestUser.username}, ${ago(h.latestUser.createdAt)}` : "none"}</span>
            {" · "}Latest submission: <span className="text-ghost">{h.latestSubmission ? `${ago(h.latestSubmission.createdAt)} (${h.latestSubmission.accepted ? "accepted" : "not accepted"})` : "none"}</span>
            {" · "}Server instance {h.bootId}, started {ago(h.bootedAt)}
          </p>
          {h.provider === "sqlite" && (
            <p className="text-[10px] text-warn">SQLite keeps data only if its file is on a persistent volume (Docker volume or mounted disk).</p>
          )}
        </div>
      )}
    </Card>
  );
}

/** A notice every visitor sees until they dismiss it: how users are told about a data breach (docs/breach-runbook.md). */
function SiteNoticeAdmin() {
  const [text, setText] = useState("");
  const [current, setCurrent] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const load = useCallback(() => {
    fetch("/api/notice").then((r) => r.json()).then((d) => setCurrent(d.notice?.message ?? null)).catch(() => {});
  }, []);
  useEffect(load, [load]);
  const send = async (method: "POST" | "DELETE") => {
    setMsg(null);
    const r = await fetch("/api/notice", { method, headers: { "Content-Type": "application/json" }, body: method === "POST" ? JSON.stringify({ message: text }) : undefined });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) setMsg(d.error ?? `Failed (${r.status})`); else { setMsg(method === "POST" ? "Published." : "Taken down."); setText(""); load(); }
  };
  return (
    <Card title="Site notice" subtitle="Shown to every visitor until dismissed. For a personal-data breach, publish within 72 hours (see docs/breach-runbook.md).">
      <div className="space-y-2 text-[12px]">
        <p className="text-ghost">Now showing: {current ? <span className="text-warn">{current}</span> : <span className="text-dim">nothing</span>}</p>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={2000} aria-label="Notice text"
                  className="w-full bg-void border border-rim rounded px-2 py-1.5 text-pale" placeholder="What happened, what data, what users should do, how to contact us" />
        <div className="flex gap-2">
          <button onClick={() => send("POST")} disabled={text.trim().length < 5} className="px-3 py-1 rounded border border-warn/50 text-warn disabled:opacity-40">Publish</button>
          <button onClick={() => send("DELETE")} disabled={!current} className="px-3 py-1 rounded border border-rim text-ghost disabled:opacity-40">Take down</button>
        </div>
        {msg && <p role="status" className="text-dim">{msg}</p>}
      </div>
    </Card>
  );
}

export default function AdminSystem() {
  return (
    <div className="space-y-6">
      <Database />
      <SiteNoticeAdmin />
      <Panel><ErrorLogAdmin /></Panel>
    </div>
  );
}
