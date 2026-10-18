"use client";
/**
 * /classes — my classes, create a class (you become its teacher), join by code.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type ClassRow = { id: string; name: string; role: "TEACHER" | "STUDENT"; teacher: string; members: number; assignments: number };

const input = "w-full bg-pit border border-rim rounded px-3 py-2 text-[13px] text-bright placeholder:text-dim focus:outline-none focus:border-phosphor/60";
const button = "px-4 py-2 rounded border border-phosphor/50 bg-phosphor/10 text-phosphor text-[12px] font-semibold hover:bg-phosphor/20 disabled:opacity-40";

export default function ClassesPage() {
  const router = useRouter();
  const [classes, setClasses] = useState<ClassRow[] | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/classes").then((r) => r.json()).then((d) => setClasses(d.classes ?? [])).catch(() => setClasses([]));
  }, []);
  useEffect(load, [load]);

  async function post(url: string, body: object) {
    setBusy(true); setError(null);
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error ?? "Something went wrong."); return; }
      router.push(`/classes/${data.classroom.id}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-serif text-3xl">Classes</h1>
        <p className="text-[12px] text-ghost mt-1">
          Teachers set assignments from the BitFlow problem set and see everyone&apos;s progress. Students join with a code.
        </p>
      </div>

      {error && <p role="alert" className="text-[12px] text-danger">{error}</p>}

      <div className="grid sm:grid-cols-2 gap-4">
        <form className="border border-rim/60 rounded-xl p-4 bg-pit/40 space-y-3"
              onSubmit={(e) => { e.preventDefault(); post("/api/classes/join", { code }); }}>
          <h2 className="text-[13px] font-semibold">Join a class</h2>
          <label className="block text-[11px] text-dim" htmlFor="join-code">Class code from your teacher</label>
          <input id="join-code" className={`${input} font-mono uppercase tracking-widest`} value={code} maxLength={12}
                 onChange={(e) => setCode(e.target.value)} placeholder="e.g. K7QM2XP" autoComplete="off" />
          <button className={button} disabled={busy || !code.trim()}>Join</button>
        </form>

        <form className="border border-rim/60 rounded-xl p-4 bg-pit/40 space-y-3"
              onSubmit={(e) => { e.preventDefault(); post("/api/classes", { name }); }}>
          <h2 className="text-[13px] font-semibold">Create a class</h2>
          <label className="block text-[11px] text-dim" htmlFor="class-name">Class name</label>
          <input id="class-name" className={input} value={name} maxLength={80}
                 onChange={(e) => setName(e.target.value)} placeholder="e.g. Digital Design, Fall term" />
          <button className={button} disabled={busy || !name.trim()}>Create</button>
        </form>
      </div>

      <section className="space-y-2">
        <h2 className="text-[11px] uppercase tracking-[0.18em] text-dim">Your classes</h2>
        {!classes ? (
          <p className="text-[12px] text-dim">Loading…</p>
        ) : classes.length === 0 ? (
          <p className="text-[12px] text-dim">You aren&apos;t in any classes yet.</p>
        ) : (
          <ul className="space-y-2">
            {classes.map((c) => (
              <li key={c.id}>
                <Link href={`/classes/${c.id}`}
                      className="flex flex-wrap items-center justify-between gap-2 border border-rim/60 rounded-lg px-4 py-3 bg-pit/40 hover:border-phosphor/50 transition-colors">
                  <span className="font-semibold text-[14px]">{c.name}</span>
                  <span className="flex items-center gap-3 text-[11px] text-dim">
                    <span className={c.role === "TEACHER" ? "text-phosphor" : "text-info"}>{c.role === "TEACHER" ? "Teaching" : `Teacher: ${c.teacher}`}</span>
                    <span>{c.members} member{c.members === 1 ? "" : "s"}</span>
                    <span>{c.assignments} assignment{c.assignments === 1 ? "" : "s"}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
