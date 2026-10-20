"use client";
/** components/admin/DebugProblemsAdmin.tsx — generate "find the bug" problems (/api/admin/debug-problems). */
import { useCallback, useEffect, useState } from "react";
import { Failed, Loading, getJson } from "./ui";

interface Row { slug: string; title: string; learningLevel: string; hasDebug: boolean }

export default function DebugProblemsAdmin({ onChanged }: { onChanged?: () => void }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  const load = useCallback(() => {
    setError(null);
    getJson<{ problems: Row[] }>("/api/admin/debug-problems").then((d) => setRows(d.problems), (e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const generate = async (targets: Row[]) => {
    setRunning(true);
    setLog([]);
    for (const [i, r] of targets.entries()) {
      setLog((l) => [`${i + 1}/${targets.length} ${r.title}…`, ...l].slice(0, 50));
      const res = await fetch("/api/admin/debug-problems", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug: r.slug }),
      }).then((x) => x.json()).catch(() => ({ ok: false, error: "Network error." }));
      setLog((l) => [res.ok ? `✓ ${r.title}: bug on line ${res.line}` : `✗ ${r.title}: ${res.error}`, ...l.slice(1)]);
    }
    setRunning(false);
    load();
    onChanged?.();
  };

  if (error) return <Failed message={error} retry={load} />;
  if (!rows) return <Loading what="problems" />;
  const missing = rows.filter((r) => !r.hasDebug);

  return (
    <div className="space-y-3 font-mono text-[10px]">
      <p className="text-dim max-w-2xl">
        Each one starts from a problem&apos;s reference solution with one line changed so that it fails that problem&apos;s
        hidden tests, and opens only after the learner solves the original. They appear in the Arena under &quot;Fix the bug&quot;.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-ghost">{rows.length - missing.length} of {rows.length} eligible problems have one.</span>
        <button disabled={running || missing.length === 0} onClick={() => generate(missing)}
          className="px-3 py-1 rounded border border-info/50 text-info hover:bg-info/10 disabled:opacity-40">
          {running ? "Generating…" : `Generate missing (${missing.length})`}
        </button>
        <button disabled={running || rows.length === 0} onClick={() => generate(rows)}
          className="px-3 py-1 rounded border border-rim text-dim hover:text-ghost disabled:opacity-40"
          title="Pick a new bug for every problem (for example after changing a reference solution)">Regenerate all</button>
      </div>
      {log.length > 0 && (
        <pre className="max-h-48 overflow-auto bg-pit/40 border border-rim/40 rounded p-2 text-ghost whitespace-pre-wrap">{log.join("\n")}</pre>
      )}
    </div>
  );
}
