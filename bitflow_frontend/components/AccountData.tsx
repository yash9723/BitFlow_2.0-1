"use client";
/**
 * components/AccountData.tsx — profile card: download everything BitFlow keeps about you
 * (GET /api/profile/export), or delete the account (DELETE /api/profile, with the password
 * and the word "delete").
 */
import { useState } from "react";
import { downloadBlob } from "@/lib/api";

const field = "w-full bg-void border border-rim rounded px-2 py-1.5 text-[12px] text-pale focus:outline-none focus:border-phosphor/50";
const button = "w-full py-1.5 rounded-lg border text-[11px] font-semibold uppercase tracking-wider transition-colors disabled:opacity-50";

export default function AccountData() {
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [password, setPassword] = useState("");
  const [typed, setTyped] = useState("");
  const [delMsg, setDelMsg] = useState<string | null>(null);

  const download = async () => {
    setMsg(null); setBusy(true);
    try {
      const res = await fetch("/api/profile/export");
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `Download failed (${res.status})`);
      const name = res.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ?? "bitflow-data.json";
      downloadBlob(name, await res.blob(), "application/json");
      setMsg("Downloaded.");
    } catch (err) {
      setMsg((err as Error).message);
    } finally { setBusy(false); }
  };

  const remove = async (e: React.FormEvent) => {
    e.preventDefault();
    setDelMsg(null); setBusy(true);
    try {
      const res = await fetch("/api/profile", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password, confirm: typed }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
      window.location.href = "/?deleted=1";
    } catch (err) {
      setDelMsg((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="border border-rim rounded-xl p-5 bg-pit space-y-4">
      <div className="text-[11px] font-bold uppercase tracking-wider text-bright">Your data</div>
      <div className="space-y-2">
        <p className="text-[11px] text-ghost leading-relaxed">
          Download everything BitFlow keeps about you as a JSON file: your progress, submissions, projects and their history,
          share links, certificates and comments.
        </p>
        <button onClick={download} disabled={busy} className={`${button} border-info/40 text-info hover:bg-info/10`}>Download my data</button>
        {msg && <p className="text-[11px] text-dim" role="status">{msg}</p>}
      </div>

      <div className="space-y-2 border-t border-rim pt-4">
        {!deleting ? (
          <button onClick={() => setDeleting(true)} className={`${button} border-danger/30 text-danger hover:bg-danger/10`}>Delete my account…</button>
        ) : (
          <form onSubmit={remove} className="space-y-2">
            <p className="text-[11px] text-danger leading-relaxed">
              This deletes your account and everything in it, for good: progress, XP, submissions, projects, share links,
              certificates, comments, and any classes you teach. Download your data first if you want a copy.
            </p>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Your password"
              autoComplete="current-password" aria-label="Your password" className={field} required />
            <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder='Type "delete" to confirm'
              aria-label='Type "delete" to confirm' className={field} required />
            <div className="flex gap-2">
              <button type="button" onClick={() => { setDeleting(false); setPassword(""); setTyped(""); setDelMsg(null); }} className={`${button} border-rim text-ghost hover:text-bright`}>Cancel</button>
              <button disabled={busy || typed !== "delete" || !password} className={`${button} border-danger/60 text-danger hover:bg-danger/10`}>Delete for good</button>
            </div>
            {delMsg && <p className="text-[11px] text-danger" role="alert">{delMsg}</p>}
          </form>
        )}
      </div>
    </div>
  );
}
