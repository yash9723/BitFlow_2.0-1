"use client";
/**
 * /classes/[id] — one class.
 *   Teachers: join code, new assignment, assignments, progress grid (+ CSV), analytics, roster.
 *   Students: their assignments with per-problem status and links.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import ClassAnalytics from "@/components/ClassAnalytics";

type Status = "on_time" | "late" | "missing" | "pending";
type Problem = { slug: string; title: string; difficulty: string; href: string };
type AssignmentRow = { id: string; title: string; dueAt: string; problems: Problem[] };
type Detail = {
  classroom: { id: string; name: string; teacher: string; joinCode?: string };
  role: "TEACHER" | "STUDENT";
  isOwner: boolean;
  me: string;
  progress: {
    assignments: AssignmentRow[];
    students: { id: string; username: string }[];
    status: Record<string, Record<string, Record<string, Status>>>;
  };
  roster?: { id: string; username: string; role: string; joinedAt: string }[];
  catalog?: { slug: string; title: string; learningLevel: string; difficulty: string }[];
};

const STATUS: Record<Status, { label: string; short: string; cls: string }> = {
  on_time: { label: "Solved on time", short: "✓",    cls: "text-phosphor bg-phosphor/10 border-phosphor/30" },
  late:    { label: "Solved late",    short: "late", cls: "text-warn bg-warn/10 border-warn/30" },
  missing: { label: "Missing",        short: "✗",    cls: "text-danger bg-danger/10 border-danger/30" },
  pending: { label: "Not yet",        short: "–",    cls: "text-dim bg-surface/30 border-rim/40" },
};

const input  = "bg-pit border border-rim rounded px-3 py-2 text-[13px] text-bright placeholder:text-dim focus:outline-none focus:border-phosphor/60";
const button = "px-4 py-2 rounded border border-phosphor/50 bg-phosphor/10 text-phosphor text-[12px] font-semibold hover:bg-phosphor/20 disabled:opacity-40";
const dangerLink = "text-[11px] text-danger/80 hover:text-danger hover:underline";

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

/** Default due date: a week from now, 23:59 local, in <input type="datetime-local"> format. */
function defaultDue(): string {
  const d = new Date(Date.now() + 7 * 864e5);
  d.setHours(23, 59, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function Chip({ status, compact }: { status: Status; compact?: boolean }) {
  const s = STATUS[status];
  return (
    <span title={s.label} className={`inline-block font-mono text-[10px] px-1.5 py-0.5 rounded border ${s.cls}`}>
      {compact ? s.short : s.label}
    </span>
  );
}

function NewAssignment({ catalog, onCreate }: { catalog: NonNullable<Detail["catalog"]>; onCreate: (body: object) => Promise<string | null> }) {
  const [title, setTitle]   = useState("");
  const [due, setDue]       = useState(defaultDue);
  const [query, setQuery]   = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError]   = useState<string | null>(null);
  const [busy, setBusy]     = useState(false);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return catalog.filter((p) => !q || p.title.toLowerCase().includes(q) || p.learningLevel.toLowerCase().includes(q));
  }, [catalog, query]);
  const toggle = (slug: string) => setPicked((p) => (p.includes(slug) ? p.filter((s) => s !== slug) : [...p, slug]));

  return (
    <form className="border border-rim/60 rounded-xl p-4 bg-pit/40 space-y-3"
          onSubmit={async (e) => {
            e.preventDefault(); setBusy(true);
            const err = await onCreate({ title, dueAt: new Date(due).toISOString(), problemSlugs: picked });
            setBusy(false); setError(err);
            if (!err) { setTitle(""); setPicked([]); setQuery(""); }
          }}>
      <h2 className="text-[13px] font-semibold">New assignment</h2>
      <div className="grid sm:grid-cols-[1fr_auto] gap-3">
        <label className="space-y-1 text-[11px] text-dim">
          <span>Title</span>
          <input className={`${input} w-full`} value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Week 3: counters" />
        </label>
        <label className="space-y-1 text-[11px] text-dim">
          <span>Due</span>
          <input type="datetime-local" className={`${input} w-full`} value={due} onChange={(e) => setDue(e.target.value)} />
        </label>
      </div>
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[11px] text-dim">
          <span>Problems and lessons ({picked.length} selected)</span>
        </div>
        <input className={`${input} w-full`} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter by title or level (Beginner, Arena, Board Lab, Academy…)" aria-label="Filter problems and lessons" />
        <ul className="max-h-56 overflow-y-auto border border-rim/40 rounded divide-y divide-rim/20">
          {shown.map((p) => (
            <li key={p.slug}>
              <label className="flex items-center gap-3 px-3 py-1.5 text-[12px] cursor-pointer hover:bg-surface/40">
                <input type="checkbox" checked={picked.includes(p.slug)} onChange={() => toggle(p.slug)} className="accent-[#00e87a]" aria-label={p.title} />
                <span className="flex-1">{p.title}</span>
                <span className="text-[10px] text-dim">{p.learningLevel} · {p.difficulty}</span>
              </label>
            </li>
          ))}
          {shown.length === 0 && <li className="px-3 py-2 text-[12px] text-dim">No problems match.</li>}
        </ul>
      </div>
      {error && <p role="alert" className="text-[12px] text-danger">{error}</p>}
      <button className={button} disabled={busy || !title.trim() || picked.length === 0}>Create assignment</button>
    </form>
  );
}

export default function ClassPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData]   = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/classes/${id}`);
    const body = await res.json().catch(() => ({}));
    if (res.ok) setData(body); else setError(body.error ?? "Couldn't load this class.");
  }, [id]);
  useEffect(() => { load(); }, [load]);

  async function call(method: string, url: string, body?: object, reload = true): Promise<string | null> {
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    if (res.ok) { if (reload) await load(); return null; }
    return (await res.json().catch(() => ({}))).error ?? "Something went wrong.";
  }

  if (error && !data) return <div className="space-y-3"><p className="text-[13px] text-danger">{error}</p><Link href="/classes" className="text-[12px] text-info hover:underline">← All classes</Link></div>;
  if (!data) return <p className="text-[12px] text-dim">Loading…</p>;

  const { classroom, progress } = data;
  const teacher = data.role === "TEACHER";
  const columns = progress.assignments.flatMap((a) => a.problems.map((p) => ({ a, p })));

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/classes" className="text-[11px] text-dim hover:text-ghost">← All classes</Link>
          <h1 className="font-serif text-3xl mt-1">{classroom.name}</h1>
          <p className="text-[12px] text-ghost mt-1">Teacher: {classroom.teacher}</p>
        </div>
        {teacher && classroom.joinCode && (
          <div className="border border-phosphor/30 rounded-xl px-4 py-3 bg-pit/40">
            <div className="text-[10px] uppercase tracking-[0.18em] text-dim">Join code</div>
            <div className="flex items-center gap-3">
              <span className="font-mono text-2xl tracking-[0.2em] text-phosphor">{classroom.joinCode}</span>
              <button className="text-[11px] text-info hover:underline"
                      onClick={() => navigator.clipboard?.writeText(classroom.joinCode!).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })}>
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <div className="text-[10px] text-dim">Students enter it on the Classes page.</div>
          </div>
        )}
      </div>

      {error && <p role="alert" className="text-[12px] text-danger">{error}</p>}

      {teacher && data.catalog && (
        <NewAssignment catalog={data.catalog} onCreate={(body) => call("POST", `/api/classes/${id}/assignments`, body)} />
      )}

      <section className="space-y-3">
        <h2 className="text-[11px] uppercase tracking-[0.18em] text-dim">Assignments</h2>
        {progress.assignments.length === 0 && <p className="text-[12px] text-dim">No assignments yet.</p>}
        {progress.assignments.map((a) => {
          const past = new Date(a.dueAt) < new Date();
          return (
            <div key={a.id} className="border border-rim/60 rounded-xl p-4 bg-pit/40 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold text-[14px]">{a.title}</h3>
                <span className="flex items-center gap-3">
                  <span className={`text-[11px] ${past ? "text-dim" : "text-warn"}`}>{past ? "Was due" : "Due"} {when(a.dueAt)}</span>
                  {teacher && (
                    <button className={dangerLink}
                            onClick={async () => { if (confirm(`Delete "${a.title}"?`)) setError(await call("DELETE", `/api/classes/${id}/assignments?assignmentId=${a.id}`)); }}>
                      Delete
                    </button>
                  )}
                </span>
              </div>
              <ul className="space-y-1">
                {a.problems.map((p) => (
                  <li key={p.slug} className="flex items-center gap-3 text-[12px]">
                    {!teacher && <Chip status={progress.status[data.me]?.[a.id]?.[p.slug] ?? "pending"} />}
                    <Link href={p.href} className="hover:text-phosphor hover:underline">{p.title}</Link>
                    <span className="text-[10px] text-dim">{p.difficulty}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </section>

      {teacher && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[11px] uppercase tracking-[0.18em] text-dim">Progress</h2>
            {columns.length > 0 && progress.students.length > 0 && (
              <a href={`/api/classes/${id}?format=csv`} className="text-[12px] text-info hover:underline" download>Export CSV</a>
            )}
          </div>
          {progress.students.length === 0 ? (
            <p className="text-[12px] text-dim">No students yet. Share the join code above.</p>
          ) : columns.length === 0 ? (
            <p className="text-[12px] text-dim">Create an assignment to start tracking progress.</p>
          ) : (
            <>
              <div className="overflow-x-auto border border-rim/60 rounded-xl">
                <table className="text-[11px] min-w-full">
                  <thead>
                    <tr className="border-b border-rim/40">
                      <th scope="col" rowSpan={2} className="text-left font-semibold px-3 py-2 sticky left-0 bg-void">Student</th>
                      {progress.assignments.filter((a) => a.problems.length).map((a) => (
                        <th key={a.id} scope="colgroup" colSpan={a.problems.length} className="px-3 py-1 text-left font-semibold border-l border-rim/30">{a.title}</th>
                      ))}
                    </tr>
                    <tr className="border-b border-rim/40">
                      {columns.map(({ a, p }) => (
                        <th key={`${a.id}:${p.slug}`} scope="col" className="px-2 py-1 text-left font-normal text-dim whitespace-nowrap border-l border-rim/20">{p.title}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {progress.students.map((s) => (
                      <tr key={s.id} className="border-b border-rim/20 last:border-0">
                        <th scope="row" className="text-left font-normal px-3 py-1.5 sticky left-0 bg-void whitespace-nowrap">{s.username}</th>
                        {columns.map(({ a, p }) => (
                          <td key={`${a.id}:${p.slug}`} className="px-2 py-1.5 border-l border-rim/20">
                            <Chip compact status={progress.status[s.id]?.[a.id]?.[p.slug] ?? "pending"} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="flex flex-wrap gap-3 text-[10px] text-dim">
                {(Object.keys(STATUS) as Status[]).map((s) => <span key={s} className="flex items-center gap-1"><Chip compact status={s} /> {STATUS[s].label}</span>)}
              </p>
            </>
          )}
        </section>
      )}

      {teacher && columns.length > 0 && progress.students.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-[11px] uppercase tracking-[0.18em] text-dim">Analytics</h2>
          <ClassAnalytics classId={id} />
        </section>
      )}

      {teacher && data.roster && (
        <section className="space-y-2">
          <h2 className="text-[11px] uppercase tracking-[0.18em] text-dim">Members ({data.roster.length})</h2>
          <ul className="divide-y divide-rim/20 border border-rim/60 rounded-xl">
            {data.roster.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-2 px-4 py-2 text-[12px]">
                <span>{m.username} <span className="text-[10px] text-dim ml-2">{m.role === "TEACHER" ? "teacher" : `joined ${when(m.joinedAt)}`}</span></span>
                {m.role === "STUDENT" && (
                  <button className={dangerLink}
                          onClick={async () => { if (confirm(`Remove ${m.username} from the class?`)) setError(await call("DELETE", `/api/classes/${id}/members?userId=${m.id}`)); }}>
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="pt-4 border-t border-rim/30">
        {data.isOwner ? (
          <button className={dangerLink}
                  onClick={async () => {
                    if (!confirm(`Delete "${classroom.name}" for everyone? Assignments and membership are removed; students keep their own progress.`)) return;
                    const err = await call("DELETE", `/api/classes/${id}`, undefined, false);
                    if (err) setError(err); else router.push("/classes");
                  }}>
            Delete class
          </button>
        ) : !teacher && (
          <button className={dangerLink}
                  onClick={async () => {
                    if (!confirm("Leave this class?")) return;
                    const err = await call("DELETE", `/api/classes/${id}/members?userId=${data.me}`, undefined, false);
                    if (err) setError(err); else router.push("/classes");
                  }}>
            Leave class
          </button>
        )}
      </div>
    </div>
  );
}
