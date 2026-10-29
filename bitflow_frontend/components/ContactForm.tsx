"use client";
/** components/ContactForm.tsx — the form on /contact (POST /api/contact). */

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

const field = "w-full bg-pit border border-rim/60 rounded-lg px-3 py-2 text-[14px] text-pale focus:border-phosphor/60 outline-none";

export default function ContactForm() {
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  // /contact?kind=grievance (linked from the profile's "Your data") opens on data requests.
  const kind = useSearchParams()?.get("kind") === "grievance" ? "grievance" : "general";

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setState("sending"); setError(null);
    try {
      const r = await fetch("/api/contact", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(form.entries())),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error ?? `Something went wrong (HTTP ${r.status}).`);
      setState("sent");
    } catch (err) {
      setError((err as Error).message);
      setState("idle");
    }
  };

  if (state === "sent") {
    return (
      <div role="status" className="rounded-xl border border-phosphor/40 bg-phosphor/10 p-6 space-y-2">
        <p className="text-bright font-semibold">Thanks, your message has been sent.</p>
        <p className="text-ghost text-[14px]">We read every message and reply by email, usually within a few days.</p>
      </div>
    );
  }
  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1.5"><span className="text-[12px] text-ghost">Name</span>
          <input name="name" required maxLength={100} autoComplete="name" className={field} />
        </label>
        <label className="block space-y-1.5"><span className="text-[12px] text-ghost">Email (for our reply)</span>
          <input name="email" type="email" required maxLength={200} autoComplete="email" className={field} />
        </label>
      </div>
      <label className="block space-y-1.5"><span className="text-[12px] text-ghost">About</span>
        <select name="kind" defaultValue={kind} className={field}>
          <option value="general">A question, a bug, a classroom, a partnership</option>
          <option value="grievance">My personal data: a request, a correction or a complaint (answered within 90 days)</option>
        </select>
      </label>
      <label className="block space-y-1.5"><span className="text-[12px] text-ghost">Subject</span>
        <input name="subject" maxLength={150} className={field} placeholder="A question, a bug, a classroom, a partnership…" />
      </label>
      <label className="block space-y-1.5"><span className="text-[12px] text-ghost">Message</span>
        <textarea name="message" required minLength={10} maxLength={5000} rows={7} className={field} />
      </label>
      {/* Honeypot: hidden from people, filled in by bots */}
      <div aria-hidden="true" className="absolute -left-[9999px] w-px h-px overflow-hidden">
        <label>Website <input name="website" tabIndex={-1} autoComplete="off" /></label>
      </div>
      {error && <p role="alert" className="text-danger text-[13px]">{error}</p>}
      <div className="flex flex-wrap items-center gap-4">
        <button type="submit" disabled={state === "sending"}
                className="px-5 py-2.5 rounded-lg bg-phosphor text-void text-[12px] font-bold tracking-wider uppercase hover:bg-phosphor-glow disabled:opacity-60">
          {state === "sending" ? "Sending…" : "Send message"}
        </button>
        <span className="text-[12px] text-dim">We use your details only to reply. See our <Link href="/privacy" className="text-phosphor hover:underline">privacy policy</Link>.</span>
      </div>
    </form>
  );
}
