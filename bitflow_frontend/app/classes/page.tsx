"use client";
/**
 * /classes — my classes, create a class (you become its teacher), join by code.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Department = { name: string; slug: string; role: "HEAD" | "TEACHER" };
type ClassRow = { id: string; name: string; role: "TEACHER" | "STUDENT"; teacher: string; members: number; assignments: number };

const GUIDE: [string, string][] = [
  ["Create the class", "Give it the course name, e.g. \"Digital Design Lab, ECE 4A\". You become its teacher."],
  ["Share the join code", "Students sign up, open Classes and enter the code, with their roll number for your marks list."],
  ["Add the experiments", "Add a lab pack for the whole semester, one experiment a week, or pick problems for one assignment."],
  ["Follow and export", "See who solved what, who is stuck and which designs look copied. Export the marks as a CSV."],
];

const input = "w-full bg-pit border border-rim rounded px-3 py-2 text-[13px] text-bright placeholder:text-dim focus:outline-none focus:border-phosphor/60";
const button = "px-4 py-2 rounded border border-phosphor/50 bg-phosphor/10 text-phosphor text-[12px] font-semibold hover:bg-phosphor/20 disabled:opacity-40";

export default function ClassesPage() {
  const router = useRouter();
  const [classes, setClasses] = useState<ClassRow[] | null>(null);
  const [department, setDepartment] = useState<Department | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [roll, setRoll] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/classes").then((r) => r.json())
      .then((d) => { setClasses(d.classes ?? []); setDepartment(d.department ?? null); })
      .catch(() => setClasses([]));
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

      {department && (
        <div className="flex flex-wrap items-center justify-between gap-3 border border-phosphor/30 rounded-xl px-4 py-3 bg-pit/40 text-[12px]">
          <span>
            <span className="text-dim">Your department:</span> <span className="text-bright font-semibold">{department.name}</span>
            <span className="text-dim"> · classes you create belong to it</span>
          </span>
          {department.role === "HEAD" && (
            <Link href={`/institution/${department.slug}`} className="text-info hover:underline">Department dashboard →</Link>
          )}
        </div>
      )}

      {error && <p role="alert" className="text-[12px] text-danger">{error}</p>}

      <div className="grid sm:grid-cols-2 gap-4">
        <form className="border border-rim/60 rounded-xl p-4 bg-pit/40 space-y-3"
              onSubmit={(e) => { e.preventDefault(); post("/api/classes/join", { code, rollNumber: roll }); }}>
          <h2 className="text-[13px] font-semibold">Join a class</h2>
          <label className="block text-[11px] text-dim" htmlFor="join-code">Class code from your teacher</label>
          <input id="join-code" className={`${input} font-mono uppercase tracking-widest`} value={code} maxLength={12}
                 onChange={(e) => setCode(e.target.value)} placeholder="e.g. K7QM2XP" autoComplete="off" />
          <label className="block text-[11px] text-dim" htmlFor="join-roll">Your roll number (optional, for your teacher&apos;s marks list)</label>
          <input id="join-roll" className={`${input} font-mono uppercase`} value={roll} maxLength={30}
                 onChange={(e) => setRoll(e.target.value)} placeholder="e.g. 21BEC0042" autoComplete="off" />
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

      {classes && (
        <details open={classes.length === 0} className="border border-rim/60 rounded-xl p-4 bg-pit/40">
          <summary className="cursor-pointer text-[13px] font-semibold">Teaching a lab? Start a class in four steps</summary>
          <ol className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-[12px]">
            {GUIDE.map(([title, body], i) => (
              <li key={title} className="space-y-1">
                <div className="text-phosphor font-mono text-[11px]">0{i + 1}</div>
                <div className="font-semibold text-bright">{title}</div>
                <p className="text-ghost leading-relaxed">{body}</p>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-[11px] text-dim">
            Running it for a whole department? See <Link href="/colleges" className="text-info hover:underline">BitFlow for colleges</Link> and
            the free one-semester pilot.
          </p>
        </details>
      )}

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
