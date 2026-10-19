"use client";
/**
 * components/AccountSecurity.tsx — profile card: change password, and a one-time
 * recovery code for resetting a forgotten password at /reset-password.
 */

import { useEffect, useState } from "react";

const field = "w-full bg-void border border-rim rounded px-2 py-1.5 text-[12px] text-pale focus:outline-none focus:border-phosphor/50";
const button = "w-full py-1.5 rounded-lg border text-[11px] font-semibold uppercase tracking-wider transition-colors disabled:opacity-50";

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data;
}

export default function AccountSecurity() {
  const [hasCode, setHasCode] = useState<boolean | null>(null);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [codePw, setCodePw] = useState("");
  const [codeMsg, setCodeMsg] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/auth/recovery-code").then((r) => r.json()).then((d) => setHasCode(!!d.hasCode)).catch(() => {});
  }, []);

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwMsg(null);
    if (next !== confirm) { setPwMsg({ ok: false, text: "The new passwords don't match." }); return; }
    setBusy(true);
    try {
      await post("/api/auth/change-password", { currentPassword: current, newPassword: next });
      setPwMsg({ ok: true, text: "Password changed. Other devices were signed out." });
      setCurrent(""); setNext(""); setConfirm("");
    } catch (err) {
      setPwMsg({ ok: false, text: (err as Error).message });
    } finally { setBusy(false); }
  };

  const generate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCodeMsg(null); setBusy(true);
    try {
      const d = await post("/api/auth/recovery-code", { currentPassword: codePw });
      setCode(d.code); setHasCode(true); setCodePw(""); setCopied(false);
    } catch (err) {
      setCodeMsg((err as Error).message);
    } finally { setBusy(false); }
  };

  return (
    <div id="security" className="border border-rim rounded-xl p-5 bg-pit space-y-5">
      <div className="text-[11px] font-bold uppercase tracking-wider text-bright">Account security</div>

      <form onSubmit={changePassword} className="space-y-2">
        <div className="text-[11px] text-ghost">Change password</div>
        <input type="password" autoComplete="current-password" placeholder="Current password" aria-label="Current password"
               className={field} value={current} onChange={(e) => setCurrent(e.target.value)} required />
        <input type="password" autoComplete="new-password" placeholder="New password (8+ characters)" aria-label="New password"
               className={field} value={next} onChange={(e) => setNext(e.target.value)} minLength={8} required />
        <input type="password" autoComplete="new-password" placeholder="Repeat new password" aria-label="Repeat new password"
               className={field} value={confirm} onChange={(e) => setConfirm(e.target.value)} minLength={8} required />
        <button type="submit" disabled={busy} className={`${button} border-rim text-pale hover:text-bright`}>Change password</button>
        {pwMsg && <p role="status" className={`text-[10px] ${pwMsg.ok ? "text-phosphor" : "text-danger"}`}>{pwMsg.text}</p>}
      </form>

      <form onSubmit={generate} className="space-y-2">
        <div className="text-[11px] text-ghost">Recovery code</div>
        <p className={`text-[10px] ${hasCode === false ? "text-warn" : "text-dim"}`}>
          {hasCode === false
            ? "You have no recovery code. Without one, a forgotten password can't be reset."
            : "Your recovery code resets a forgotten password once. Making a new one replaces the old one."}
        </p>
        <input type="password" autoComplete="current-password" placeholder="Confirm your password" aria-label="Confirm your password"
               className={field} value={codePw} onChange={(e) => setCodePw(e.target.value)} required />
        <button type="submit" disabled={busy} className={`${button} border-phosphor/40 text-phosphor hover:bg-phosphor/10`}>
          {hasCode ? "Make a new recovery code" : "Make a recovery code"}
        </button>
        {codeMsg && <p role="status" className="text-[10px] text-danger">{codeMsg}</p>}
      </form>

      {code && (
        <div role="dialog" aria-modal="true" aria-label="Your recovery code"
             className="fixed inset-0 z-50 bg-void/80 flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-pit border border-rim rounded-xl p-5 space-y-3">
            <div className="text-[12px] font-bold text-bright">Save your recovery code</div>
            <p className="text-[11px] text-ghost">
              This is the only time it&apos;s shown. Keep it somewhere safe, such as a password manager.
              With it you can set a new password at <span className="text-pale">Forgot password?</span> on the login page.
            </p>
            <div className="font-mono text-lg text-phosphor text-center tracking-widest bg-void border border-rim rounded py-3 select-all">{code}</div>
            <div className="flex gap-2">
              <button className={`${button} border-rim text-pale hover:text-bright`}
                      onClick={() => navigator.clipboard?.writeText(code).then(() => setCopied(true), () => setCopied(false))}>
                {copied ? "Copied" : "Copy"}
              </button>
              <button className={`${button} border-phosphor/40 text-phosphor hover:bg-phosphor/10`} onClick={() => setCode(null)}>
                I&apos;ve saved it
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
