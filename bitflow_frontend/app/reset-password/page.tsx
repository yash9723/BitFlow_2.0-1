"use client";
/**
 * /reset-password — set a new password with a recovery code (made on the profile page).
 */

import { useState } from "react";
import Link from "next/link";

const field = "w-full bg-void border border-rim rounded-lg px-3 py-2 text-[13px] text-pale focus:outline-none focus:border-phosphor/50";

export default function ResetPasswordPage() {
  const [username, setUsername] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirm) { setError("The new passwords don't match."); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, code, newPassword: password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-void text-bright flex items-center justify-center px-4">
      <div className="w-full max-w-sm border border-rim rounded-xl bg-pit p-6 space-y-4">
        <Link href="/" className="font-display font-bold text-lg hover:text-phosphor transition-colors">BitFlow</Link>
        <h1 className="font-serif text-2xl">Reset your password</h1>

        {done ? (
          <div className="space-y-3">
            <p role="status" className="text-[13px] text-phosphor">Your password has been changed and your recovery code has been used up.</p>
            <p className="text-[12px] text-ghost">Sign in with the new password, then make a new recovery code on your profile.</p>
            <Link href="/login" className="block text-center py-2 rounded-lg bg-phosphor text-void font-semibold text-[12px]">Sign in</Link>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <p className="text-[12px] text-ghost">
              You need the recovery code you made on your profile page. Each code works once.
            </p>
            <input className={field} placeholder="Username" aria-label="Username" autoComplete="username"
                   value={username} onChange={(e) => setUsername(e.target.value)} required />
            <input className={`${field} font-mono uppercase tracking-wider`} placeholder="Recovery code (XXXX-XXXX-XXXX-XXXX)" aria-label="Recovery code"
                   autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} required />
            <input className={field} type="password" placeholder="New password (8+ characters)" aria-label="New password"
                   autoComplete="new-password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required />
            <input className={field} type="password" placeholder="Repeat new password" aria-label="Repeat new password"
                   autoComplete="new-password" minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
            {error && <p role="alert" className="text-[12px] text-danger">{error}</p>}
            <button type="submit" disabled={busy}
                    className="w-full py-2 rounded-lg bg-phosphor text-void font-semibold text-[12px] disabled:opacity-50">
              {busy ? "Resetting…" : "Set new password"}
            </button>
            <p className="text-[11px] text-dim">
              No recovery code? Then it can&apos;t be reset here; ask the site&apos;s administrator. <Link href="/login" className="text-info hover:underline">Back to sign in</Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
