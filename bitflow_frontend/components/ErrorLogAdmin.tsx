"use client";
/**
 * components/ErrorLogAdmin.tsx — admin page section: server and browser errors
 * from the last 7 days, grouped (GET/DELETE /api/admin/errors).
 */

import { useCallback, useEffect, useState } from "react";

type Group = { source: string; location: string; message: string; count: number; lastSeen: string; stack: string | null };

export default function ErrorLogAdmin() {
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);

  const load = useCallback(() => {
    fetch("/api/admin/errors")
      .then(async (r) => (r.ok ? setGroups((await r.json()).groups) : setError((await r.json()).error ?? "Couldn't load errors.")))
      .catch(() => setError("Couldn't load errors."));
  }, []);
  useEffect(load, [load]);

  const clear = async () => {
    if (!confirm("Clear the whole error log?")) return;
    await fetch("/api/admin/errors", { method: "DELETE" });
    setOpen(null);
    load();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-[15px] font-bold text-info">Error log</h2>
        {!!groups?.length && (
          <button onClick={clear} className="text-[11px] px-2 py-1 rounded border border-rim text-ghost hover:text-danger hover:border-danger/40">Clear</button>
        )}
      </div>
      <p className="text-[12px] text-ghost mb-4">Server and browser errors from the last 7 days, grouped. Kept for 30 days.</p>
      {error && <p className="text-[12px] text-danger">{error}</p>}
      {groups && groups.length === 0 && <p className="text-[12px] text-phosphor">No errors.</p>}
      {groups && groups.length > 0 && (
        <ul className="space-y-1.5">
          {groups.map((g, i) => (
            <li key={i} className="border border-rim/50 rounded">
              <button onClick={() => setOpen(open === i ? null : i)} className="w-full text-left px-3 py-2 flex items-start gap-3 hover:bg-pit/40">
                <span className={`shrink-0 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded ${g.source === "client" ? "bg-warn/10 text-warn" : "bg-danger/10 text-danger"}`}>{g.source}</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[12px] text-bright truncate">{g.message}</span>
                  <span className="block text-[11px] text-ghost font-mono truncate">{g.location}</span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-[12px] font-mono text-bright">×{g.count}</span>
                  <span className="block text-[10px] text-ghost">{new Date(g.lastSeen).toLocaleString()}</span>
                </span>
              </button>
              {open === i && (
                <pre className="px-3 pb-3 text-[10.5px] leading-relaxed text-pale whitespace-pre-wrap break-all max-h-64 overflow-auto">
                  {g.stack ?? "(no stack trace)"}
                </pre>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
