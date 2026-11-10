"use client";
/**
 * components/LiveLabPanel.tsx — the class page's live lab (lib/live-lab.ts, /api/classes/[id]/live).
 * Teachers start and end it and see every joined student's Sandbox: code, last run, how long since they typed;
 * open one to read all of it and leave a note. Students see that a lab is running and where to join it.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { LIVE_REFRESH_MS, MAX_NOTE, type RunSummary } from "@/lib/live-lab";

interface Student { userId: string; name: string; files: { name: string; content: string }[]; run: RunSummary | null; note: string | null; updatedAt: string }
interface TeacherView { lab: { startedAt: string } | null; students: Student[] }

const ago = (iso: string) => {
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.floor(s / 60)}m ago` : `${Math.floor(s / 3600)}h ago`;
};
const RUN_TONE: Record<string, string> = { success: "text-phosphor", compile_error: "text-danger", runtime_error: "text-danger", timeout: "text-warn" };

function runText(r: RunSummary | null) {
  if (!r) return { text: "not run yet", tone: "text-dim" };
  const counts = r.passed || r.failed ? ` · ${r.passed} pass, ${r.failed} fail` : "";
  return { text: `${r.status.replace(/_/g, " ")}${counts}`, tone: r.failed ? "text-warn" : RUN_TONE[r.status] ?? "text-ghost" };
}

export default function LiveLabPanel({ classId, teacher }: { classId: string; teacher: boolean }) {
  const [view, setView] = useState<TeacherView | { lab: { startedAt: string } | null } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const url = `/api/classes/${classId}/live`;

  const load = useCallback(async () => {
    const res = await fetch(url);
    if (res.ok) setView(await res.json());
  }, [url]);
  useEffect(() => {
    load();
    if (!teacher) return;
    const t = setInterval(() => { if (document.visibilityState === "visible") load(); }, LIVE_REFRESH_MS);
    return () => clearInterval(t);
  }, [load, teacher]);

  const act = async (method: string, body?: object) => {
    setError(null);
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? "Something went wrong.");
    await load();
  };

  if (!view) return null;
  if (!teacher) {
    return view.lab ? (
      <section className="rounded-xl border border-phosphor/40 bg-phosphor/5 px-4 py-3 text-[12px]">
        <span className="text-phosphor font-semibold">Live lab running.</span>{" "}
        <span className="text-pale">Open the <Link href="/sandbox" className="text-info hover:underline">Sandbox</Link> and press <b>Join</b> to share your work with your teacher.</span>
      </section>
    ) : null;
  }

  const tv = view as TeacherView;
  const selected = tv.students?.find((s) => s.userId === open) ?? null;
  return (
    <section className="space-y-3" aria-label="Live lab">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-[11px] uppercase tracking-[0.18em] text-dim">Live lab</h2>
        {tv.lab ? (
          <>
            <span className="text-[11px] text-phosphor">● running since {new Date(tv.lab.startedAt).toLocaleTimeString()}</span>
            <span className="text-[11px] text-dim">{tv.students.length} student{tv.students.length === 1 ? "" : "s"} joined · refreshes every {LIVE_REFRESH_MS / 1000}s</span>
            <button onClick={() => { if (confirm("End the lab? The code students shared with it is deleted (their own projects are untouched).")) act("DELETE"); }}
                    className="ml-auto text-[11px] px-3 py-1 rounded border border-danger/50 text-danger hover:bg-danger/10">End lab</button>
          </>
        ) : (
          <>
            <span className="text-[11px] text-ghost">See every student&apos;s Sandbox code and last run while you teach. Students choose to join.</span>
            <button onClick={() => act("POST", { action: "start" })} className="ml-auto text-[11px] px-3 py-1 rounded border border-phosphor/60 text-phosphor hover:bg-phosphor/10">Start a live lab</button>
          </>
        )}
      </div>
      {error && <p role="alert" className="text-[12px] text-danger">{error}</p>}
      {tv.lab && tv.students.length === 0 && (
        <p className="text-[12px] text-dim">Waiting for students: they&apos;ll see a <b>Join</b> button at the top of their Sandbox.</p>
      )}
      {tv.lab && tv.students.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tv.students.map((s) => {
            const r = runText(s.run);
            const design = s.files[0]?.content ?? "";
            return (
              <button key={s.userId} onClick={() => setOpen(s.userId)}
                      className={`text-left rounded-xl border bg-pit/40 p-3 space-y-1.5 hover:border-phosphor/50 ${open === s.userId ? "border-phosphor/60" : "border-rim"}`}>
                <div className="flex items-baseline justify-between gap-2 text-[12px]">
                  <span className="text-bright font-semibold truncate">{s.name}</span>
                  <span className="text-[10px] text-dim shrink-0">typed {ago(s.updatedAt)}</span>
                </div>
                <div className={`text-[11px] ${r.tone}`}>{r.text}</div>
                {s.run?.firstError && <div className="text-[10px] text-danger truncate font-mono">{s.run.firstError}</div>}
                <pre className="text-[10px] leading-snug text-ghost font-mono bg-void/60 rounded p-2 h-24 overflow-hidden">{design.split("\n").slice(0, 8).join("\n") || "(empty)"}</pre>
                {s.note && <div className="text-[10px] text-info truncate">Your note: {s.note}</div>}
              </button>
            );
          })}
        </div>
      )}
      {selected && <StudentDetail key={selected.userId} s={selected} onClose={() => setOpen(null)} onNote={(note) => act("POST", { action: "note", userId: selected.userId, note })} />}
    </section>
  );
}

function StudentDetail({ s, onClose, onNote }: { s: Student; onClose: () => void; onNote: (note: string) => Promise<void> }) {
  const [file, setFile] = useState(0);
  const [note, setNote] = useState(s.note ?? "");
  const [sent, setSent] = useState(false);
  const f = s.files[file] ?? s.files[0];
  return (
    <div className="rounded-xl border border-phosphor/40 bg-pit p-3 space-y-2" role="region" aria-label={`${s.name}'s Sandbox`}>
      <div className="flex flex-wrap items-center gap-2 text-[12px]">
        <span className="text-bright font-semibold">{s.name}</span>
        <span className="text-[10px] text-dim">read-only · updates every few seconds</span>
        <button onClick={onClose} className="ml-auto text-[11px] text-ghost hover:text-bright">Close</button>
      </div>
      <div className="flex gap-1 flex-wrap">
        {s.files.map((x, i) => (
          <button key={x.name} onClick={() => setFile(i)} className={`text-[11px] px-2 py-0.5 rounded ${i === file ? "bg-phosphor/15 text-phosphor" : "text-ghost hover:text-pale"}`}>{x.name}</button>
        ))}
      </div>
      <pre className="text-[11px] leading-relaxed text-pale font-mono bg-void/60 rounded p-3 max-h-96 overflow-auto whitespace-pre">{f?.content || "(empty)"}</pre>
      {s.run && (
        <p className="text-[11px] text-ghost">Last run {ago(s.run.at)}: {runText(s.run).text}{s.run.firstError ? ` · ${s.run.firstError}` : ""}</p>
      )}
      <form className="flex gap-2" onSubmit={async (e) => { e.preventDefault(); await onNote(note); setSent(true); setTimeout(() => setSent(false), 1500); }}>
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={MAX_NOTE} placeholder="A note for this student (shows in their Sandbox)"
               className="flex-1 h-8 px-2 bg-void border border-rim rounded text-[12px] text-pale" />
        <button className="h-8 px-3 rounded border border-phosphor/60 text-phosphor text-[11px] hover:bg-phosphor/10">{sent ? "Sent" : "Send note"}</button>
      </form>
    </div>
  );
}
