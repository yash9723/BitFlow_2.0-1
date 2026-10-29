"use client";
/**
 * app/guardian/[token]/page.tsx — where a parent or guardian gives (or later withdraws)
 * consent for an under-18 student's account (DPDP s.9; app/api/privacy/guardian). No
 * account needed: the student shares the link from their dashboard.
 */
import { useEffect, useState } from "react";
import Link from "next/link";

interface Info { username: string; status: string; allowAi: boolean; createdAt: string }
const card = "w-full max-w-lg rounded-xl border border-rim bg-pit p-6 space-y-4";
const input = "w-full bg-void border border-rim rounded-lg px-3 py-2 text-[13px] text-pale focus:outline-none focus:border-phosphor/60";
const btn = "px-4 py-2 rounded-lg text-[12px] font-bold disabled:opacity-50";

export default function GuardianPage({ params }: { params: { token: string } }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [relationship, setRelationship] = useState("");
  const [adult, setAdult] = useState(false);
  const [allowAi, setAllowAi] = useState(false);
  const [confirm, setConfirm] = useState("");

  useEffect(() => {
    fetch(`/api/privacy/guardian?token=${encodeURIComponent(params.token)}`)
      .then(async (r) => { const d = await r.json(); if (r.ok) { setInfo(d); setAllowAi(d.allowAi); } else setError(d.error); })
      .catch(() => setError("Couldn't load this page. Check your connection and try again."));
  }, [params.token]);

  const send = async (body: Record<string, unknown>) => {
    setBusy(true); setError(null);
    try {
      const r = await fetch("/api/privacy/guardian", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: params.token, ...body }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setError(d.error ?? "That didn't work. Please try again."); return null; }
      return d;
    } finally { setBusy(false); }
  };

  return (
    <main className="min-h-full flex items-center justify-center p-4 font-mono">
      <div className={card}>
        <h1 className="text-[17px] font-bold text-bright">Parent or guardian consent</h1>
        {error && <p role="alert" className="text-[12px] text-danger">{error}</p>}
        {done && <p role="status" className="text-[12px] text-phosphor">{done}</p>}
        {!info && !error && <p className="text-[12px] text-ghost">Loading…</p>}

        {info && info.status !== "granted" && !done && (
          <form className="space-y-4" onSubmit={async (e) => {
            e.preventDefault();
            const d = await send({ action: "grant", guardianName: name, relationship, adultDeclared: adult, allowAi });
            if (d) { setInfo({ ...info, status: "granted", allowAi }); setDone("Thank you. Consent is recorded and the account is now fully active."); }
          }}>
            <div className="text-[12px] text-ghost leading-relaxed space-y-2">
              <p>The student <b className="text-bright">{info.username}</b> made an account on BitFlow, a site for learning digital electronics and chip design. Because they are under 18, India&apos;s Digital Personal Data Protection Act asks for your consent.</p>
              <p>With your consent BitFlow keeps their username, password (encrypted), month and year of birth, the code they write and their progress, to run the account, grade their work and, if they join one, show their progress to their class teacher.</p>
              <p>For students under 18 BitFlow never runs analytics or tracking, never shows their username publicly, and doesn&apos;t allow public comments. Read the full <Link href="/privacy" target="_blank" className="text-phosphor hover:underline">privacy notice</Link>.</p>
            </div>
            <label className="block space-y-1 text-[12px] text-ghost">Your full name
              <input className={input} value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={100} autoComplete="name" />
            </label>
            <label className="block space-y-1 text-[12px] text-ghost">You are the student&apos;s
              <select className={input} value={relationship} onChange={(e) => setRelationship(e.target.value)} required>
                <option value="">Choose…</option>
                <option value="parent">Parent</option>
                <option value="guardian">Legal guardian</option>
              </select>
            </label>
            <label className="flex items-start gap-2 text-[12px] text-ghost">
              <input type="checkbox" className="accent-phosphor mt-0.5" checked={adult} onChange={(e) => setAdult(e.target.checked)} required />
              I am 18 or older and I am this student&apos;s parent or legal guardian. I agree to BitFlow processing their data as described above.
            </label>
            <label className="flex items-start gap-2 text-[12px] text-ghost">
              <input type="checkbox" className="accent-phosphor mt-0.5" checked={allowAi} onChange={(e) => setAllowAi(e.target.checked)} />
              Also allow the AI tutor. When they ask it for help, their code and test results are sent to an AI provider to get an answer (optional).
            </label>
            <button type="submit" disabled={busy} className={`${btn} w-full bg-phosphor text-void`}>Give consent</button>
            <p className="text-[11px] text-dim">You can come back to this same link any time to change the AI choice or withdraw consent. Keep it somewhere safe.</p>
          </form>
        )}

        {info && info.status === "granted" && (
          <div className="space-y-4 text-[12px] text-ghost">
            {!done && <p>You have given consent for <b className="text-bright">{info.username}</b>.</p>}
            <label className="flex items-start gap-2">
              <input type="checkbox" className="accent-phosphor mt-0.5" checked={allowAi} disabled={busy}
                     onChange={async (e) => { const v = e.target.checked; const d = await send({ action: "update", allowAi: v }); if (d) { setAllowAi(v); setDone(`AI tutor ${v ? "allowed" : "turned off"}.`); } }} />
              Allow the AI tutor
            </label>
            <div className="border-t border-rim pt-4 space-y-2">
              <h2 className="text-[13px] font-bold text-danger">Withdraw consent</h2>
              <p>This deletes the student&apos;s account and everything in it straight away. It can&apos;t be undone. Type <b>delete</b> to confirm.</p>
              <div className="flex gap-2">
                <input className={input} value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-label='Type "delete" to confirm' />
                <button disabled={busy || confirm !== "delete"} className={`${btn} border border-danger/60 text-danger`}
                        onClick={async () => { const d = await send({ action: "withdraw", confirm }); if (d) { setInfo(null); setDone("Consent withdrawn. The account and its data have been deleted."); } }}>
                  Withdraw
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
