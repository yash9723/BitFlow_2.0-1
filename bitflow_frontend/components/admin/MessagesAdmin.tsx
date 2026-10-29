"use client";
/** components/admin/MessagesAdmin.tsx — the admin console's Messages tab: contact-form messages (/api/admin/messages). */

import { useCallback, useEffect, useState } from "react";
import { Card, Loading } from "@/components/admin/ui";
import { GRIEVANCE_DAYS } from "@/lib/privacy";

interface Message { id: string; createdAt: string; name: string; email: string; subject: string; message: string; handled: boolean; kind?: string }

export default function MessagesAdmin() {
  const [data, setData] = useState<{ messages: Message[]; open: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showHandled, setShowHandled] = useState(false);
  const load = useCallback(() => {
    fetch("/api/admin/messages").then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setData).catch((e) => setError(String(e.message ?? e)));
  }, []);
  useEffect(load, [load]);
  const mark = async (id: string, handled: boolean) => {
    const r = await fetch("/api/admin/messages", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, handled }) });
    if (r.ok) load(); else setError(`Couldn't update (HTTP ${r.status})`);
  };

  if (error) return <p className="text-danger text-[12px]">{error}</p>;
  if (!data) return <Loading what="messages" />;
  const shown = data.messages.filter((m) => showHandled || !m.handled);
  return (
    <Card title={`Messages (${data.open} open)`} subtitle="From the contact form at /contact. Reply by email."
          action={<label className="flex items-center gap-1.5 text-[11px] text-ghost"><input type="checkbox" checked={showHandled} onChange={(e) => setShowHandled(e.target.checked)} /> show handled</label>}>
      {!shown.length && <p className="text-[12px] text-dim">No {showHandled ? "" : "open "}messages.</p>}
      <ul className="space-y-3">
        {shown.map((m) => (
          <li key={m.id} className={`rounded-lg border border-rim/60 p-3 space-y-1.5 ${m.handled ? "opacity-60" : ""}`}>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[12px]">
              {m.kind === "grievance" && (
                // DPDP Rules: grievances answered within 90 days of receipt.
                <span className="px-1.5 rounded border border-warn/50 text-warn text-[10px] uppercase">
                  Data request · due {new Date(new Date(m.createdAt).getTime() + GRIEVANCE_DAYS * 86_400_000).toLocaleDateString()}
                </span>
              )}
              <span className="text-bright font-semibold">{m.subject}</span>
              <span className="text-ghost">{m.name}</span>
              <a href={`mailto:${encodeURIComponent(m.email)}?subject=${encodeURIComponent(`Re: ${m.subject}`)}`} className="text-info hover:underline">{m.email}</a>
              <span className="text-dim ml-auto">{new Date(m.createdAt).toLocaleString()}</span>
            </div>
            <p className="text-[12px] text-pale whitespace-pre-wrap break-words">{m.message}</p>
            <button onClick={() => mark(m.id, !m.handled)} className="text-[11px] text-dim hover:text-bright underline">
              {m.handled ? "Mark as open" : "Mark as handled"}
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
