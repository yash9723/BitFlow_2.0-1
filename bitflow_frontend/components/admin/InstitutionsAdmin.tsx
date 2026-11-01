"use client";
/**
 * components/admin/InstitutionsAdmin.tsx — the admin console's Colleges tab: college
 * departments on a pilot or a department plan (/api/admin/institutions). Create one, set
 * its plan, seats and last day, add its heads and teachers (their classes move in), and
 * attach or detach classes. Heads see the dashboard at /institution/<slug>.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card, Failed, Loading, getJson } from "@/components/admin/ui";
import { PLANS, PLAN_LABEL, lastDayString, type Plan, type PlanStatus } from "@/lib/institution-plan";

interface Institution {
  id: string; name: string; slug: string; plan: Plan; seatLimit: number | null; validUntil: string | null; notes: string | null;
  seatsUsed: number; status: PlanStatus;
  members: { userId: string; username: string; role: "HEAD" | "TEACHER" }[];
  classrooms: { id: string; name: string; teacher: string; members: number }[];
}

const field  = "bg-pit border border-rim/60 rounded px-2 py-1 text-[11px] text-bright placeholder:text-dim focus:outline-none focus:border-phosphor/60";
const button = "px-3 py-1 rounded border border-phosphor/50 bg-phosphor/10 text-phosphor text-[11px] font-semibold hover:bg-phosphor/20 disabled:opacity-40";
const link   = "text-[10px] text-dim hover:text-bright underline";

async function send(method: string, url: string, body?: object): Promise<string | null> {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  return r.ok ? null : ((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
}

/** The plan fields, shared by the new-institution form and each institution's edit form. */
function PlanFields({ value, onChange }: { value: Record<string, string>; onChange: (v: Record<string, string>) => void }) {
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => onChange({ ...value, [k]: e.target.value });
  return (
    <>
      <label className="space-y-0.5"><span className="block text-[10px] text-dim">Plan</span>
        <select className={field} value={value.plan} onChange={set("plan")}>
          {PLANS.map((p) => <option key={p} value={p}>{PLAN_LABEL[p]}</option>)}
        </select>
      </label>
      <label className="space-y-0.5"><span className="block text-[10px] text-dim">Seats (empty: no limit)</span>
        <input className={`${field} w-24`} type="number" min={1} value={value.seatLimit} onChange={set("seatLimit")} />
      </label>
      <label className="space-y-0.5"><span className="block text-[10px] text-dim">Last day (empty: none)</span>
        <input className={field} type="date" value={value.validUntil} onChange={set("validUntil")} />
      </label>
      <label className="space-y-0.5 grow"><span className="block text-[10px] text-dim">Notes (admins only: PO, invoice, contact)</span>
        <input className={`${field} w-full`} maxLength={1000} value={value.notes} onChange={set("notes")} />
      </label>
    </>
  );
}

const planBody = (v: Record<string, string>) => ({
  plan: v.plan, seatLimit: v.seatLimit.trim() === "" ? null : Number(v.seatLimit), validUntil: v.validUntil || null, notes: v.notes,
});

function NewInstitution({ onDone }: { onDone: () => void }) {
  const empty = { name: "", slug: "", plan: "pilot", seatLimit: "", validUntil: "", notes: "" };
  const [v, setV] = useState(empty);
  const [error, setError] = useState<string | null>(null);
  return (
    <Card title="New institution" subtitle="A college department. Its address is /institution/<address>.">
      <form className="flex flex-wrap items-end gap-3" onSubmit={async (e) => {
        e.preventDefault();
        const err = await send("POST", "/api/admin/institutions", { name: v.name, slug: v.slug, ...planBody(v) });
        setError(err);
        if (!err) { setV(empty); onDone(); }
      }}>
        <label className="space-y-0.5"><span className="block text-[10px] text-dim">Name</span>
          <input className={`${field} w-64`} required maxLength={150} value={v.name} placeholder="Example Institute — ECE"
                 onChange={(e) => setV({ ...v, name: e.target.value })} />
        </label>
        <label className="space-y-0.5"><span className="block text-[10px] text-dim">Address</span>
          <input className={`${field} w-36 font-mono`} required maxLength={60} value={v.slug} placeholder="eit-ece"
                 onChange={(e) => setV({ ...v, slug: e.target.value.toLowerCase() })} />
        </label>
        <PlanFields value={v} onChange={(next) => setV({ ...v, ...next })} />
        <button className={button}>Create</button>
      </form>
      {error && <p role="alert" className="text-danger text-[11px] mt-2">{error}</p>}
    </Card>
  );
}

function InstitutionCard({ inst, reload }: { inst: Institution; reload: () => void }) {
  const [plan, setPlan] = useState({
    plan: inst.plan, seatLimit: inst.seatLimit == null ? "" : String(inst.seatLimit),
    validUntil: lastDayString(inst.validUntil), notes: inst.notes ?? "",
  });
  const [username, setUsername] = useState("");
  const [role, setRole] = useState<"HEAD" | "TEACHER">("TEACHER");
  const [joinCode, setJoinCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const act = async (method: string, url: string, body?: object) => {
    const err = await send(method, url, body);
    setError(err);
    if (!err) reload();
    return err;
  };

  const tone = inst.status.state === "lapsed" || inst.status.overSeats ? "text-warn" : inst.status.state === "ending" ? "text-info" : "text-phosphor";
  return (
    <Card title={inst.name}
          subtitle={`/institution/${inst.slug} · ${PLAN_LABEL[inst.plan]} · ${inst.seatsUsed}${inst.seatLimit != null ? ` of ${inst.seatLimit}` : ""} students`}
          action={<Link href={`/institution/${inst.slug}`} className="text-[11px] text-info hover:underline">Dashboard →</Link>}>
      <div className="space-y-4">
        <p className={`text-[11px] ${tone}`}>
          {inst.status.message ?? (inst.status.daysLeft !== null ? `Active, ${inst.status.daysLeft} days left.` : "Active, no end date.")}
        </p>

        <form className="flex flex-wrap items-end gap-3" onSubmit={async (e) => {
          e.preventDefault();
          const err = await act("PATCH", "/api/admin/institutions", { id: inst.id, ...planBody(plan) });
          setSaved(!err);
        }}>
          <PlanFields value={plan} onChange={(next) => { setPlan({ ...plan, ...next } as typeof plan); setSaved(false); }} />
          <button className={button}>Save plan</button>
          {saved && <span className="text-[10px] text-phosphor">saved</span>}
        </form>

        <div className="space-y-1.5">
          <div className="text-[10px] uppercase tracking-[0.18em] text-dim">People</div>
          {!inst.members.length && <p className="text-[11px] text-dim">No one yet. Add the head of department first.</p>}
          <ul className="space-y-1 text-[11px]">
            {inst.members.map((m) => (
              <li key={m.userId} className="flex flex-wrap items-center gap-3">
                <span className="text-bright">{m.username}</span>
                <select className={field} value={m.role} aria-label={`Role of ${m.username}`}
                        onChange={(e) => act("PATCH", "/api/admin/institutions/members", { institutionId: inst.id, userId: m.userId, role: e.target.value })}>
                  <option value="HEAD">Head (sees the dashboard)</option>
                  <option value="TEACHER">Teacher</option>
                </select>
                <button className={link} onClick={() => confirm(`Remove ${m.username} from ${inst.name}? Their classes stay with the department.`) &&
                  act("DELETE", `/api/admin/institutions/members?institutionId=${inst.id}&userId=${m.userId}`)}>remove</button>
              </li>
            ))}
          </ul>
          <form className="flex flex-wrap items-center gap-2" onSubmit={async (e) => {
            e.preventDefault();
            if (!(await act("POST", "/api/admin/institutions/members", { institutionId: inst.id, username, role }))) setUsername("");
          }}>
            <input className={`${field} w-40`} placeholder="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
            <select className={field} value={role} onChange={(e) => setRole(e.target.value as "HEAD" | "TEACHER")}>
              <option value="TEACHER">Teacher</option>
              <option value="HEAD">Head</option>
            </select>
            <button className={button}>Add</button>
            <span className="text-[10px] text-dim">Their own classes move into the department.</span>
          </form>
        </div>

        <div className="space-y-1.5">
          <div className="text-[10px] uppercase tracking-[0.18em] text-dim">Classes ({inst.classrooms.length})</div>
          <ul className="space-y-1 text-[11px]">
            {inst.classrooms.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3">
                <span className="text-bright">{c.name}</span>
                <span className="text-dim">{c.teacher} · {c.members} members</span>
                <button className={link} onClick={() => confirm(`Detach "${c.name}" from ${inst.name}?`) &&
                  act("DELETE", `/api/admin/institutions/classes?classId=${c.id}`)}>detach</button>
              </li>
            ))}
          </ul>
          <form className="flex flex-wrap items-center gap-2" onSubmit={async (e) => {
            e.preventDefault();
            if (!(await act("POST", "/api/admin/institutions/classes", { institutionId: inst.id, joinCode }))) setJoinCode("");
          }}>
            <input className={`${field} w-32 font-mono uppercase`} placeholder="join code" value={joinCode} onChange={(e) => setJoinCode(e.target.value)} required />
            <button className={button}>Attach class</button>
          </form>
        </div>

        {error && <p role="alert" className="text-danger text-[11px]">{error}</p>}
        <button className="text-[10px] text-danger/80 hover:text-danger underline"
                onClick={() => confirm(`Delete ${inst.name}? Its classes stay, as their teachers' personal classes.`) &&
                  act("DELETE", `/api/admin/institutions?id=${inst.id}`)}>
          Delete institution
        </button>
      </div>
    </Card>
  );
}

export default function InstitutionsAdmin() {
  const [data, setData] = useState<Institution[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    getJson<{ institutions: Institution[] }>("/api/admin/institutions").then((d) => setData(d.institutions)).catch((e) => setError(String(e.message ?? e)));
  }, []);
  useEffect(load, [load]);

  if (error) return <Failed message={error} retry={load} />;
  if (!data) return <Loading what="institutions" />;
  return (
    <div className="space-y-6">
      <NewInstitution onDone={load} />
      {!data.length && <p className="text-[12px] text-dim">No institutions yet. Pilot requests arrive in Messages.</p>}
      {/* key includes the saved fields so each card's form resets after a reload */}
      {data.map((i) => <InstitutionCard key={`${i.id}:${i.plan}:${i.seatLimit}:${i.validUntil}:${i.notes}`} inst={i} reload={load} />)}
    </div>
  );
}
