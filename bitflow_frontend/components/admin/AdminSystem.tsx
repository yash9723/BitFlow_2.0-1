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

export default function AdminSystem() {
  return (
    <div className="space-y-6">
      <Database />
      <Panel><ErrorLogAdmin /></Panel>
    </div>
  );
}
