"use client";
/**
 * components/LabPackPicker.tsx — on a class page (teachers): add a whole semester of lab
 * assignments from a pack (lib/lab-packs.ts → POST /api/classes/[id]/packs), one
 * experiment a week from the first due date.
 */

import { useState } from "react";
import { LAB_PACKS, packDueDates } from "@/lib/lab-packs";

const input  = "bg-pit border border-rim rounded px-3 py-2 text-[13px] text-bright focus:outline-none focus:border-phosphor/60";
const button = "px-4 py-2 rounded border border-phosphor/50 bg-phosphor/10 text-phosphor text-[12px] font-semibold hover:bg-phosphor/20 disabled:opacity-40";

/** A week from now, 23:59 local, in <input type="datetime-local"> format. */
function nextWeek(): string {
  const d = new Date(Date.now() + 7 * 864e5);
  d.setHours(23, 59, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function LabPackPicker({ classId, onAdded }: { classId: string; onAdded: () => Promise<void> }) {
  const [packId, setPackId] = useState(LAB_PACKS[0].id);
  const [first, setFirst]   = useState(nextWeek);
  const [busy, setBusy]     = useState(false);
  const [note, setNote]     = useState<{ ok: boolean; text: string } | null>(null);
  const pack = LAB_PACKS.find((p) => p.id === packId)!;
  const firstDate = new Date(first);
  const dues = isNaN(firstDate.getTime()) ? [] : packDueDates(firstDate, pack.experiments.length);

  const add = async () => {
    if (!confirm(`Add ${pack.experiments.length} assignments from "${pack.title}", one a week? You can delete any of them afterwards.`)) return;
    setBusy(true); setNote(null);
    try {
      const r = await fetch(`/api/classes/${classId}/packs`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packId, firstDueAt: firstDate.toISOString() }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) { setNote({ ok: false, text: data.error ?? "Something went wrong." }); return; }
      setNote({ ok: true, text: `Added ${data.created} assignments.` });
      await onAdded();
    } finally {
      setBusy(false);
    }
  };

  return (
    <details className="border border-rim/60 rounded-xl p-4 bg-pit/40 group">
      <summary className="cursor-pointer text-[13px] font-semibold list-none flex items-center justify-between gap-2">
        <span>Add a lab pack <span className="text-[11px] font-normal text-dim ml-2">a semester of experiments in one go</span></span>
        <span className="text-dim text-[11px] group-open:hidden">Show</span>
      </summary>
      <div className="mt-4 space-y-3">
        <div className="flex flex-wrap gap-3">
          <label className="space-y-1">
            <span className="block text-[11px] text-dim">Pack</span>
            <select className={input} value={packId} onChange={(e) => setPackId(e.target.value)}>
              {LAB_PACKS.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          </label>
          <label className="space-y-1">
            <span className="block text-[11px] text-dim">First experiment due</span>
            <input type="datetime-local" className={input} value={first} onChange={(e) => setFirst(e.target.value)} />
          </label>
        </div>
        <p className="text-[11px] text-ghost">{pack.audience}. Each experiment becomes an assignment, due a week after the one before.</p>
        <ol className="space-y-1 text-[12px]">
          {pack.experiments.map((e, i) => (
            <li key={e.title} className="flex flex-wrap gap-x-3">
              <span className="text-pale">{e.title}</span>
              <span className="text-dim">{e.slugs.length} problems</span>
              {dues[i] && <span className="text-dim">due {dues[i].toLocaleDateString(undefined, { day: "numeric", month: "short" })}</span>}
            </li>
          ))}
        </ol>
        {note && <p role={note.ok ? "status" : "alert"} className={`text-[12px] ${note.ok ? "text-phosphor" : "text-danger"}`}>{note.text}</p>}
        <button type="button" className={button} disabled={busy || !dues.length} onClick={add}>
          {busy ? "Adding…" : `Add ${pack.experiments.length} assignments`}
        </button>
      </div>
    </details>
  );
}
