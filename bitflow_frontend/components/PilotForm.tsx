"use client";
/** components/PilotForm.tsx — the college pilot request on /colleges (POST /api/contact, kind "pilot"; lib/pilot.ts). */

import { useState } from "react";
import Link from "next/link";
import { PILOT_ROLES, PILOT_SEMESTERS } from "@/lib/pilot";

const field = "w-full bg-pit border border-rim/60 rounded-lg px-3 py-2 text-[14px] text-pale focus:border-phosphor/60 outline-none";
const label = "text-[12px] text-ghost";

export default function PilotForm() {
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = Object.fromEntries(new FormData(e.currentTarget).entries());
    setState("sending"); setError(null);
    try {
      const r = await fetch("/api/contact", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, kind: "pilot", students: Number(form.students) }),
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
        <p className="text-bright font-semibold">Thanks, we have your pilot request.</p>
        <p className="text-ghost text-[14px]">
          We&apos;ll email you within two working days to set up a short call and your first class.
        </p>
      </div>
    );
  }
  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1.5"><span className={label}>Your name</span>
          <input name="name" required maxLength={100} autoComplete="name" className={field} />
        </label>
        <label className="block space-y-1.5"><span className={label}>Your role</span>
          <select name="role" required defaultValue="" className={field}>
            <option value="" disabled>Choose…</option>
            {PILOT_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>
        <label className="block space-y-1.5"><span className={label}>Email</span>
          <input name="email" type="email" required maxLength={200} autoComplete="email" className={field} placeholder="name@college.edu.in" />
        </label>
        <label className="block space-y-1.5"><span className={label}>Phone or WhatsApp (optional)</span>
          <input name="phone" type="tel" maxLength={20} autoComplete="tel" className={field} placeholder="+91 98765 43210" />
        </label>
        <label className="block space-y-1.5 sm:col-span-2"><span className={label}>College</span>
          <input name="college" required maxLength={150} autoComplete="organization" className={field} />
        </label>
        <label className="block space-y-1.5"><span className={label}>Department</span>
          <input name="department" required maxLength={100} className={field} placeholder="ECE, EEE, VLSI…" />
        </label>
        <label className="block space-y-1.5"><span className={label}>University (optional)</span>
          <input name="university" maxLength={120} className={field} placeholder="VTU, AKTU, JNTU, Anna University, autonomous…" />
        </label>
        <label className="block space-y-1.5"><span className={label}>City (optional)</span>
          <input name="city" maxLength={80} autoComplete="address-level2" className={field} />
        </label>
        <label className="block space-y-1.5"><span className={label}>About how many students?</span>
          <input name="students" type="number" required min={1} max={5000} inputMode="numeric" className={field} placeholder="60" />
        </label>
        <label className="block space-y-1.5 sm:col-span-2"><span className={label}>When would you like to start?</span>
          <select name="semester" required defaultValue="" className={field}>
            <option value="" disabled>Choose…</option>
            {PILOT_SEMESTERS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
      </div>
      <label className="block space-y-1.5"><span className={label}>Anything we should know? (optional)</span>
        <textarea name="notes" maxLength={2000} rows={4} className={field}
                  placeholder="The course or lab, the topics you teach, the tools you use today…" />
      </label>
      {/* Honeypot: hidden from people, filled in by bots */}
      <div aria-hidden="true" className="absolute -left-[9999px] w-px h-px overflow-hidden">
        <label>Website <input name="website" tabIndex={-1} autoComplete="off" /></label>
      </div>
      {error && <p role="alert" className="text-danger text-[13px]">{error}</p>}
      <div className="flex flex-wrap items-center gap-4">
        <button type="submit" disabled={state === "sending"}
                className="px-5 py-2.5 rounded-lg bg-phosphor text-void text-[12px] font-bold tracking-wider uppercase hover:bg-phosphor-glow disabled:opacity-60">
          {state === "sending" ? "Sending…" : "Request a free pilot"}
        </button>
        <span className="text-[12px] text-dim">We use your details only to set up the pilot. See our <Link href="/privacy" className="text-phosphor hover:underline">privacy notice</Link>.</span>
      </div>
    </form>
  );
}
