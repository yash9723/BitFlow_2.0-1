"use client";
/**
 * components/studio/CircuitProjects.tsx — the circuit editor's saves on the account: projects of
 * kind "circuit" (app/api/projects), with their version history, and a share link for circuits too
 * big for the #s= fragment (app/api/share). The circuit's JSON is the project's designCode.
 */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { Circuit } from "@/lib/studio/circuit";
import { parseCircuit } from "@/lib/studio/circuit-json";

interface Listed { id: string; name: string; updatedAt: string; versions: number }
interface Version { id: string; createdAt: string; message: string | null }
export interface OpenProject { id: string; name: string }

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json" } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error ?? `Request failed (${res.status})`), { status: res.status });
  return data as T;
}

export default function CircuitProjects({ circuit, current, setCurrent, onOpen }: {
  circuit: Circuit; current: OpenProject | null; setCurrent: (p: OpenProject | null) => void; onOpen: (c: Circuit) => void;
}) {
  const [list, setList] = useState<Listed[] | null>(null);
  const [signedOut, setSignedOut] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [name, setName] = useState(circuit.module);
  const [history, setHistory] = useState<Version[] | null>(null);
  const [link, setLink] = useState<string | null>(null);

  const fail = useCallback((e: unknown) => {
    if ((e as { status?: number }).status === 401) setSignedOut(true);
    else setMsg((e as Error).message);
  }, []);
  const refresh = useCallback(() => {
    api<{ projects: Listed[] }>("/api/projects?kind=circuit").then((d) => setList(d.projects), fail);
  }, [fail]);
  useEffect(refresh, [refresh]);
  useEffect(() => setHistory(null), [current?.id]);

  const body = () => ({ designCode: JSON.stringify(circuit), testbenchCode: "" });
  const saveNew = async () => {
    setMsg(null);
    try {
      const d = await api<{ project: OpenProject }>("/api/projects", { method: "POST", body: JSON.stringify({ kind: "circuit", name: name.trim() || circuit.module, ...body() }) });
      setCurrent({ id: d.project.id, name: d.project.name });
      setMsg(`Saved as ${d.project.name}.`);
      refresh();
    } catch (e) { fail(e); }
  };
  const save = async () => {
    if (!current) return;
    setMsg(null);
    try {
      const d = await api<{ version: string }>(`/api/projects/${current.id}`, { method: "PATCH", body: JSON.stringify({ ...body(), message: "Saved" }) });
      setMsg(d.version === "none" ? "No changes since the last save." : `Saved ${current.name}.`);
      refresh();
    } catch (e) { fail(e); }
  };
  const open = async (p: Listed) => {
    setMsg(null);
    try {
      const d = await api<{ project: { designCode: string } }>(`/api/projects/${p.id}`);
      const c = parseCircuit(d.project.designCode);
      if (typeof c === "string") { setMsg(c); return; }
      onOpen(c);
      setCurrent({ id: p.id, name: p.name });
    } catch (e) { fail(e); }
  };
  const del = async (p: Listed) => {
    if (!window.confirm(`Delete ${p.name} and its history? This can't be undone.`)) return;
    try {
      await api(`/api/projects/${p.id}`, { method: "DELETE" });
      if (current?.id === p.id) setCurrent(null);
      refresh();
    } catch (e) { fail(e); }
  };
  const showHistory = async () => {
    if (!current) return;
    if (history) { setHistory(null); return; }
    try { setHistory((await api<{ versions: Version[] }>(`/api/projects/${current.id}/versions`)).versions); } catch (e) { fail(e); }
  };
  const restore = async (v: Version) => {
    if (!current) return;
    try {
      const d = await api<{ version: { designCode: string } }>(`/api/projects/${current.id}/versions?v=${v.id}`);
      const c = parseCircuit(d.version.designCode);
      if (typeof c === "string") { setMsg(c); return; }
      onOpen(c);
      setCurrent(current);
      setMsg("That version is in the editor. Ctrl+Z goes back; Save keeps it.");
    } catch (e) { fail(e); }
  };
  const share = async () => {
    setMsg(null);
    try {
      const d = await api<{ url: string }>("/api/share", { method: "POST", body: JSON.stringify({ kind: "circuit", title: current?.name ?? circuit.module, ...body() }) });
      const url = `${window.location.origin}${d.url}`;
      setLink(url);
      try { await navigator.clipboard.writeText(url); setMsg("Link copied. Anyone with it can view the circuit and open a copy."); }
      catch { setMsg("Anyone with this link can view the circuit and open a copy:"); }
    } catch (e) { fail(e); }
  };

  const btn = "px-2 py-1 rounded border border-rim/60 text-ghost hover:text-bright";
  if (signedOut) {
    return (
      <div className="rounded-xl border border-info/30 bg-info/5 p-3 font-mono text-[11px] text-ghost">
        <Link href="/login" className="text-info underline">Sign in</Link> to save circuits to your account and keep their history. Your draft stays in this browser either way.
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-info/30 bg-info/5 p-3 space-y-2 font-mono text-[11px]">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-pale">{current ? `Open: ${current.name}` : "Not saved yet"}</span>
        {current && <button className={btn} onClick={save}>Save</button>}
        {current && <button className={btn} onClick={showHistory}>{history ? "Hide history" : "History"}</button>}
        <span className="text-rim">|</span>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} aria-label="Project name" className="w-40 bg-pit border border-rim/60 rounded px-2 py-1 text-[12px] text-pale" />
        <button className={btn} onClick={saveNew}>Save as new</button>
        <button className={btn} onClick={share} title="A link that works however big the circuit is">Share link</button>
      </div>
      {msg && <p role="status" className="text-ghost">{msg}</p>}
      {link && <input readOnly value={link} aria-label="Share link" onFocus={(e) => e.target.select()} className="w-full bg-pit border border-rim/60 rounded px-2 py-1 text-[12px] text-pale" />}
      {history && (
        <ul className="space-y-0.5 max-h-40 overflow-auto">
          {history.map((v) => (
            <li key={v.id} className="flex items-center gap-2 text-dim">
              <span>{new Date(v.createdAt).toLocaleString()}</span><span className="text-ghost">{v.message ?? "autosave"}</span>
              <button className="text-info hover:underline" onClick={() => restore(v)}>open</button>
            </li>
          ))}
        </ul>
      )}
      {list && list.length > 0 && (
        <ul className="space-y-0.5 max-h-48 overflow-auto">
          {list.map((p) => (
            <li key={p.id} className="flex items-center gap-2">
              <button className="text-info hover:underline truncate" onClick={() => open(p)}>{p.name}</button>
              <span className="text-dim shrink-0">{new Date(p.updatedAt).toLocaleDateString()} · {p.versions} version{p.versions === 1 ? "" : "s"}</span>
              <button className="ml-auto text-dim hover:text-danger shrink-0" aria-label={`Delete ${p.name}`} onClick={() => del(p)}>delete</button>
            </li>
          ))}
        </ul>
      )}
      {list && !list.length && <p className="text-dim">No saved circuits yet.</p>}
    </div>
  );
}
