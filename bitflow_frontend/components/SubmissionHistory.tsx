"use client";
/**
 * components/SubmissionHistory.tsx — your past runs/submits for one problem,
 * with "Load" (restore the design into the editor) and "Diff" (vs the
 * current editor content). Used by ProblemStatement and ArenaSolverClient.
 */

import { useCallback, useEffect, useState } from "react";
import { DiffEditor, loader } from "@monaco-editor/react";

loader.config({ paths: { vs: "/monaco/vs" } });   // same self-hosted Monaco as Editor.tsx

interface Row {
  id:             string;
  submissionType: string;
  simStatus:      string;
  numTestsPassed: number;
  numTestsTotal:  number;
  accepted:       boolean;
  createdAt:      string;
}

interface Props {
  slug:        string;
  currentCode: string;
  onLoad:      (code: string) => void;
  /** Results that change when a run/submit finishes (fixed length) — refetches the list. */
  refreshOn?: readonly unknown[];
}

function verdict(r: Row): { label: string; cls: string } {
  if (r.submissionType === "SUBMIT") {
    return r.accepted
      ? { label: "Accepted", cls: "text-phosphor" }
      // Single-testbench problems record no per-test counts (0/0).
      : { label: r.numTestsTotal ? `${r.numTestsPassed}/${r.numTestsTotal} passed` : "Wrong answer", cls: "text-warn" };
  }
  return r.simStatus === "SUCCESS"
    ? { label: "Ran", cls: "text-info" }
    : { label: r.simStatus.replace("_", " ").toLowerCase(), cls: "text-danger" };
}

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

export default function SubmissionHistory({ slug, currentCode, onLoad, refreshOn = [] }: Props) {
  const [rows,  setRows]  = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [diff,  setDiff]  = useState<{ row: Row; code: string } | null>(null);
  const [busy,  setBusy]  = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/submissions?slug=${encodeURIComponent(slug)}&limit=20`);
      if (res.status === 401) { setError("Sign in to keep a history of your attempts."); return; }
      if (!res.ok) throw new Error();
      setRows((await res.json()).submissions);
      setError(null);
    } catch {
      setError("Couldn't load your history.");
    }
  }, [slug]);

  // Runs are saved fire-and-forget, so give the save a moment before refetching.
  useEffect(() => {
    const t = setTimeout(refresh, refreshOn.some(Boolean) ? 800 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh, ...refreshOn]);

  async function fetchCode(row: Row): Promise<string | null> {
    setBusy(row.id);
    try {
      const res = await fetch(`/api/submissions/${row.id}`);
      if (!res.ok) throw new Error();
      return (await res.json()).submission.designCode as string;
    } catch {
      setError("Couldn't load that attempt.");
      return null;
    } finally {
      setBusy(null);
    }
  }

  if (error) return <p className="font-mono text-[10px] text-dim">{error}</p>;
  if (!rows) return <p className="font-mono text-[10px] text-dim">Loading…</p>;
  if (rows.length === 0) return <p className="font-mono text-[10px] text-dim">No attempts yet. Run or Submit to start one.</p>;

  return (
    <>
      <ul className="space-y-1">
        {rows.map((r) => {
          const v = verdict(r);
          return (
            <li key={r.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[10px] bg-surface/40 border border-rim/40 rounded px-2 py-1">
              <span className="text-dim/70 w-11 shrink-0">{r.submissionType === "SUBMIT" ? "submit" : "run"}</span>
              <span className={`flex-1 min-w-[5.5rem] truncate ${v.cls}`}>{v.label}</span>
              <span className="text-dim/60 shrink-0">{when(r.createdAt)}</span>
              <button
                disabled={busy === r.id}
                onClick={async () => { const c = await fetchCode(r); if (c !== null) setDiff({ row: r, code: c }); }}
                className="text-info hover:underline disabled:opacity-40"
              >Diff</button>
              <button
                disabled={busy === r.id}
                onClick={async () => {
                  const c = await fetchCode(r);
                  if (c !== null && (c === currentCode || confirm("Replace the code in the editor with this attempt?"))) onLoad(c);
                }}
                className="text-phosphor hover:underline disabled:opacity-40"
              >Load</button>
            </li>
          );
        })}
      </ul>

      {diff && (
        <div
          className="fixed inset-0 z-50 bg-void/80 flex items-center justify-center p-2 sm:p-4"
          onClick={() => setDiff(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Diff against current code"
        >
          <div className="w-full max-w-5xl h-[85vh] flex flex-col bg-pit border border-rim rounded" onClick={(e) => e.stopPropagation()}>
            <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b border-rim font-mono text-[10px] text-dim">
              <span>Left: {diff.row.submissionType === "SUBMIT" ? "submit" : "run"} from {when(diff.row.createdAt)} · Right: current editor</span>
              <span className="flex gap-3">
                <button className="text-phosphor hover:underline" onClick={() => { onLoad(diff.code); setDiff(null); }}>Load this attempt</button>
                <button className="text-bright hover:underline" onClick={() => setDiff(null)}>Close</button>
              </span>
            </div>
            <div className="flex-1 min-h-0">
              <DiffEditor
                original={diff.code}
                modified={currentCode}
                language="verilog"
                theme="phosphor-dark"
                options={{ readOnly: true, minimap: { enabled: false }, fontSize: 12, scrollBeyondLastLine: false }}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
