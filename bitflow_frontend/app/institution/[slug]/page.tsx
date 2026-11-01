"use client";
/**
 * /institution/[slug] — the department dashboard for its heads (and site admins):
 * plan and seats, then one row per class: students, assignments, how much is solved,
 * what is missing and who was active this week (GET /api/institutions/[slug]).
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PLAN_LABEL, type Plan, type PlanStatus } from "@/lib/institution-plan";

interface Summary {
  institution: { name: string; slug: string; plan: Plan; seatLimit: number | null; validUntil: string | null };
  status: PlanStatus;
  seatsUsed: number;
  teachers: { username: string; role: string }[];
  classes: { id: string; name: string; teacher: string; students: number; assignments: number; solvedRate: number | null; onTimeRate: number | null; missing: number; active7d: number }[];
  totals: { classes: number; students: number; assignments: number; active7d: number; solvedRate: number | null };
}

const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);
const date = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="border border-rim/60 rounded-xl px-4 py-3 bg-pit/40">
      <div className="text-[10px] uppercase tracking-[0.18em] text-dim">{label}</div>
      <div className="text-2xl font-semibold text-bright mt-1">{value}</div>
      {hint && <div className="text-[11px] text-ghost">{hint}</div>}
    </div>
  );
}

export default function DepartmentPage() {
  const { slug } = useParams<{ slug: string }>();
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/institutions/${encodeURIComponent(slug)}`)
      .then(async (r) => { const body = await r.json().catch(() => ({})); if (r.ok) setData(body); else setError(body.error ?? "Couldn't load the department."); })
      .catch(() => setError("Couldn't load the department."));
  }, [slug]);

  if (error) return <div className="space-y-3"><p className="text-[13px] text-danger">{error}</p><Link href="/classes" className="text-[12px] text-info hover:underline">← Classes</Link></div>;
  if (!data) return <p className="text-[12px] text-dim">Loading…</p>;
  const { institution: inst, status, totals } = data;

  return (
    <div className="space-y-8">
      <div>
        <Link href="/classes" className="text-[11px] text-dim hover:text-ghost">← Classes</Link>
        <h1 className="font-serif text-3xl mt-1">{inst.name}</h1>
        <p className="text-[12px] text-ghost mt-1">
          {PLAN_LABEL[inst.plan] ?? inst.plan}
          {inst.validUntil && <> · until {date(inst.validUntil)}</>}
          {inst.seatLimit !== null && <> · {data.seatsUsed} of {inst.seatLimit} seats used</>}
        </p>
      </div>

      {status.message && (
        <p role="status" className={`rounded-xl border px-4 py-3 text-[12px] ${status.state === "lapsed" || status.overSeats ? "border-warn/40 bg-warn/10 text-warn" : "border-info/40 bg-info/10 text-info"}`}>
          {status.message} <Link href="/contact" className="underline">Contact us to renew or add seats.</Link>
        </p>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Classes" value={totals.classes} />
        <Stat label="Students" value={totals.students} hint={inst.seatLimit !== null ? `of ${inst.seatLimit} seats` : undefined} />
        <Stat label="Active this week" value={totals.active7d} hint="ran or submitted code" />
        <Stat label="Assigned work solved" value={pct(totals.solvedRate)} hint={`${totals.assignments} assignments`} />
      </div>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[11px] uppercase tracking-[0.18em] text-dim">Classes</h2>
          {data.classes.length > 0 && (
            <a href={`/api/institutions/${encodeURIComponent(inst.slug)}?format=csv`} className="text-[12px] text-info hover:underline" download>Export CSV</a>
          )}
        </div>
        {data.classes.length === 0 ? (
          <p className="text-[12px] text-dim">No classes yet. Classes your teachers create on the Classes page appear here.</p>
        ) : (
          <div className="overflow-x-auto border border-rim/60 rounded-xl">
            <table className="text-[12px] min-w-full">
              <thead>
                <tr className="border-b border-rim/40 text-left text-dim">
                  <th scope="col" className="px-3 py-2 font-semibold">Class</th>
                  <th scope="col" className="px-3 py-2 font-semibold">Teacher</th>
                  <th scope="col" className="px-3 py-2 font-semibold text-right">Students</th>
                  <th scope="col" className="px-3 py-2 font-semibold text-right">Assignments</th>
                  <th scope="col" className="px-3 py-2 font-semibold text-right">Solved</th>
                  <th scope="col" className="px-3 py-2 font-semibold text-right">On time</th>
                  <th scope="col" className="px-3 py-2 font-semibold text-right">Missing</th>
                  <th scope="col" className="px-3 py-2 font-semibold text-right">Active (7 d)</th>
                </tr>
              </thead>
              <tbody>
                {data.classes.map((c) => (
                  <tr key={c.id} className="border-b border-rim/20 last:border-0">
                    <th scope="row" className="px-3 py-2 text-left font-normal text-bright whitespace-nowrap">{c.name}</th>
                    <td className="px-3 py-2 text-ghost whitespace-nowrap">{c.teacher}</td>
                    <td className="px-3 py-2 text-right">{c.students}</td>
                    <td className="px-3 py-2 text-right">{c.assignments}</td>
                    <td className="px-3 py-2 text-right text-phosphor">{pct(c.solvedRate)}</td>
                    <td className="px-3 py-2 text-right">{pct(c.onTimeRate)}</td>
                    <td className={`px-3 py-2 text-right ${c.missing ? "text-danger" : "text-dim"}`}>{c.missing}</td>
                    <td className="px-3 py-2 text-right">{c.active7d}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[11px] text-dim">
          Solved and on time are shares of every assigned problem for every student. Missing counts problems past their due date and not solved.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-[11px] uppercase tracking-[0.18em] text-dim">People ({data.teachers.length})</h2>
        <ul className="flex flex-wrap gap-2 text-[12px]">
          {data.teachers.map((t) => (
            <li key={t.username} className="border border-rim/60 rounded-lg px-3 py-1">
              {t.username} <span className="text-[10px] text-dim">{t.role === "HEAD" ? "head" : "teacher"}</span>
            </li>
          ))}
        </ul>
        <p className="text-[11px] text-dim">To add or remove teachers, or change the plan, <Link href="/contact" className="text-info hover:underline">contact us</Link>.</p>
      </section>
    </div>
  );
}
