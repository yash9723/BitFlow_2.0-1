"use client";
/**
 * components/ReferenceSolutionsAdmin.tsx — admin page section for the
 * reference solution of each problem. Saving runs the solution against the
 * problem's hidden tests on the server and stores it only if it passes.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

type Row = { slug: string; title: string; learningLevel: string; hasReference: boolean };

export default function ReferenceSolutionsAdmin() {
  const [rows, setRows]       = useState<Row[] | null>(null);
  const [filter, setFilter]   = useState("");
  const [slug, setSlug]       = useState<string | null>(null);
  const [code, setCode]       = useState("");
  const [busy, setBusy]       = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/reference-solution");
    if (res.ok) setRows((await res.json()).problems);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function open(s: string) {
    setSlug(s); setMessage(null); setCode("");
    const res = await fetch(`/api/admin/reference-solution?slug=${encodeURIComponent(s)}`);
    if (res.ok) {
      const { problem } = await res.json();
      setCode(problem.referenceSolution ?? problem.starterCode ?? "");
    }
  }

  async function save() {
    if (!slug) return;
    setBusy(true); setMessage(null);
    try {
      const res  = await fetch("/api/admin/reference-solution", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, code }),
      });
      const data = await res.json().catch(() => ({}));
      setMessage(res.ok ? { ok: true, text: "Passed every hidden test. Saved." } : { ok: false, text: data.error ?? `Failed (${res.status})` });
      if (res.ok) load();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!slug || !confirm("Remove this reference solution? Counterexample feedback stops for this problem.")) return;
    const res = await fetch(`/api/admin/reference-solution?slug=${encodeURIComponent(slug)}`, { method: "DELETE" });
    setMessage(res.ok ? { ok: true, text: "Removed." } : { ok: false, text: "Couldn't remove it." });
    if (res.ok) load();
  }

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return (rows ?? []).filter((r) => !q || r.title.toLowerCase().includes(q) || r.slug.includes(q));
  }, [rows, filter]);
  const missing = rows?.filter((r) => !r.hasReference).length ?? 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[13px] font-bold text-info uppercase">Reference solutions</h2>
        {rows && (
          <span className={`text-[10px] ${missing ? "text-warn" : "text-phosphor"}`}>
            {rows.length - missing}/{rows.length} problems have one
          </span>
        )}
      </div>
      <p className="text-[10px] text-dim">
        Used for counterexample feedback on wrong answers. Never sent to learners. Saving grades the code
        against the hidden tests first and only stores it if every test passes.
      </p>

      <div className="grid md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-4">
        <div className="space-y-2 min-w-0">
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter problems"
                 aria-label="Filter problems"
                 className="w-full bg-pit border border-rim rounded px-2 py-1.5 text-[11px] text-bright" />
          <ul className="max-h-80 overflow-y-auto border border-rim/40 rounded divide-y divide-rim/20">
            {shown.map((r) => (
              <li key={r.slug}>
                <button onClick={() => open(r.slug)}
                        className={`w-full flex items-center gap-2 px-2 py-1.5 text-left text-[11px] hover:bg-pit/40 ${slug === r.slug ? "bg-pit/60" : ""}`}>
                  <span className={r.hasReference ? "text-phosphor" : "text-warn"} aria-label={r.hasReference ? "has reference" : "missing"}>
                    {r.hasReference ? "✓" : "–"}
                  </span>
                  <span className="flex-1 truncate text-pale">{r.title}</span>
                  <span className="text-[9px] text-dim shrink-0">{r.learningLevel}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-2 min-w-0">
          {slug ? (
            <>
              <div className="text-[11px] text-pale font-bold">{slug}</div>
              <textarea value={code} onChange={(e) => setCode(e.target.value)} spellCheck={false}
                        aria-label="Reference solution source"
                        className="w-full h-72 bg-pit border border-rim rounded p-2 font-mono text-[11px] text-bright" />
              <div className="flex items-center gap-3">
                <button onClick={save} disabled={busy || !code.trim()}
                        className="px-3 py-1.5 rounded border border-phosphor/50 bg-phosphor/10 text-phosphor text-[11px] font-semibold disabled:opacity-40">
                  {busy ? "Verifying…" : "Verify & save"}
                </button>
                {rows?.find((r) => r.slug === slug)?.hasReference && (
                  <button onClick={remove} className="text-[11px] text-danger/80 hover:text-danger hover:underline">Remove</button>
                )}
              </div>
              {message && (
                <p role="status" className={`text-[11px] ${message.ok ? "text-phosphor" : "text-danger"} whitespace-pre-wrap break-words`}>
                  {message.text}
                </p>
              )}
            </>
          ) : (
            <p className="text-[11px] text-dim">Pick a problem to view or edit its reference solution.</p>
          )}
        </div>
      </div>
    </div>
  );
}
