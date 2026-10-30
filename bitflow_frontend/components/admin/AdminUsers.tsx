"use client";
/** components/admin/AdminUsers.tsx — searchable, pageable user list (GET /api/admin/users). */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Card, Failed, Loading, ago, getJson } from "./ui";

interface UserRow {
  id: string; username: string; role: string; createdAt: string; publicProfile: boolean; bannedAt: string | null;
  totalXp: number; solved: number; submissions: number; certificates: number; lastActive: string | null;
}
interface Page { users: UserRow[]; matching: number; totalUsers: number; page: number; pageSize: number }

export default function AdminUsers() {
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");          // debounced q
  const [sort, setSort] = useState<"new" | "xp">("new");
  const [page, setPage] = useState(0);
  const [data, setData] = useState<Page | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => { const t = setTimeout(() => { setQuery(q); setPage(0); }, 300); return () => clearTimeout(t); }, [q]);
  useEffect(() => {
    let live = true;
    setError(null);
    getJson<Page>(`/api/admin/users?q=${encodeURIComponent(query)}&sort=${sort}&page=${page}`)
      .then((d) => live && setData(d), (e) => live && setError(e.message));
    return () => { live = false; };
  }, [query, sort, page, reload]);

  const act = useCallback(async (u: UserRow, action: string, question: string, done: string) => {
    if (!window.confirm(question)) return;
    setMsg(null);
    const res = await fetch(`/api/admin/users/${u.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    const d = await res.json().catch(() => ({}));
    setMsg(res.ok ? { ok: true, text: done } : { ok: false, text: d.error ?? `Failed (${res.status})` });
    if (res.ok) setReload((n) => n + 1);
  }, []);

  const pages = data ? Math.max(1, Math.ceil(data.matching / data.pageSize)) : 1;

  return (
    <Card title="Users" subtitle={data ? `${data.matching} of ${data.totalUsers} users` : undefined}>
      <div className="flex flex-wrap items-center gap-2 mb-3 text-[10px]">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search username" aria-label="Search users"
               className="bg-pit border border-rim/60 rounded px-2 py-1 text-[11px] text-bright w-48 focus:outline-none focus:border-info/60" />
        <select value={sort} onChange={(e) => { setSort(e.target.value as "new" | "xp"); setPage(0); }} aria-label="Sort users"
                className="bg-pit border border-rim/60 rounded px-2 py-1 text-ghost">
          <option value="new">Newest first</option><option value="xp">Most XP</option>
        </select>
      </div>
      {msg && <p role="status" className={`mb-3 text-[10px] ${msg.ok ? "text-phosphor" : "text-danger"}`}>{msg.text}</p>}
      {error && <Failed message={error} />}
      {!data && !error && <Loading what="users" />}
      {data && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-[10px]">
              <thead className="text-dim uppercase text-[9px] text-left">
                <tr><th className="py-2 pr-2">User</th><th className="pr-2 text-right">XP</th><th className="pr-2 text-right">Solved</th>
                    <th className="pr-2 text-right">Submissions</th><th className="pr-2 text-right">Certs</th>
                    <th className="pr-2">Joined</th><th className="pr-2">Last active</th><th className="pr-2">Actions</th></tr>
              </thead>
              <tbody>
                {data.users.map((u) => (
                  <tr key={u.id} className="border-t border-rim/20">
                    <td className="py-1.5 pr-2">
                      {u.publicProfile ? <Link href={`/u/${u.username}`} className="text-pale hover:text-info">{u.username}</Link>
                                       : <span className="text-pale">{u.username}</span>}
                      {u.role === "ADMIN" && <span className="ml-2 text-[8px] text-info border border-info/30 px-1 rounded">ADMIN</span>}
                      {u.bannedAt && <span className="ml-2 text-[8px] text-danger border border-danger/40 px-1 rounded">BANNED</span>}
                    </td>
                    <td className="pr-2 text-right text-phosphor">{u.totalXp}</td>
                    <td className="pr-2 text-right text-ghost">{u.solved}</td>
                    <td className="pr-2 text-right text-ghost">{u.submissions}</td>
                    <td className="pr-2 text-right text-ghost">{u.certificates || ""}</td>
                    <td className="pr-2 text-dim whitespace-nowrap">{new Date(u.createdAt).toLocaleDateString()}</td>
                    <td className="pr-2 text-dim whitespace-nowrap">{ago(u.lastActive)}</td>
                    <td className="pr-2 whitespace-nowrap space-x-2">
                      {u.role === "ADMIN"
                        ? <button className="text-warn hover:underline" onClick={() => act(u, "demote", `Remove admin rights from ${u.username}?`, `${u.username} is no longer an admin.`)}>Demote</button>
                        : <button className="text-info hover:underline" onClick={() => act(u, "promote", `Make ${u.username} an admin? They'll get full access, including hidden tests and everyone's data.`, `${u.username} is now an admin.`)}>Promote</button>}
                      {u.bannedAt
                        ? <button className="text-phosphor hover:underline" onClick={() => act(u, "unban", `Let ${u.username} sign in again?`, `${u.username} can sign in again.`)}>Unban</button>
                        : <button className="text-warn hover:underline" onClick={() => act(u, "ban", `Ban ${u.username}? They'll be signed out and can't sign in.`, `${u.username} is banned.`)}>Ban</button>}
                      <button className="text-danger hover:underline" onClick={() => act(u, "delete", `Delete ${u.username} and everything linked to the account? This can't be undone.`, `${u.username} was deleted.`)}>Delete</button>
                    </td>
                  </tr>
                ))}
                {data.users.length === 0 && <tr><td colSpan={8} className="py-4 text-center text-dim">No users match.</td></tr>}
              </tbody>
            </table>
          </div>
          {pages > 1 && (
            <div className="flex items-center justify-end gap-3 mt-3 text-[10px] text-dim">
              <button disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="disabled:opacity-30 hover:text-info">← Prev</button>
              <span>Page {page + 1} of {pages}</span>
              <button disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)} className="disabled:opacity-30 hover:text-info">Next →</button>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
