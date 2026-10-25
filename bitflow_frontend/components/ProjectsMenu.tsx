"use client";
/**
 * components/ProjectsMenu.tsx — the Sandbox's saved projects (app/api/projects): save the
 * editors as a project, open, rename, delete, and see its history (components/ProjectHistory.tsx).
 * While a project is open it autosaves 3 s after you stop typing; Ctrl+S saves a named version.
 * The project carries the pins you edited for it in the Bitstream tab.
 */
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ProjectFile } from "@/lib/project-files";
import type { SandboxProject } from "@/hooks/useSimulation";
import type { DesignLanguage, TestbenchLanguage } from "@/lib/types";

const ProjectHistory = dynamic(() => import("./ProjectHistory"), { ssr: false });

export interface EditorContent {
  designCode: string; testbenchCode: string; files: ProjectFile[];
  designLanguage: DesignLanguage; testbenchLanguage: TestbenchLanguage;
}
/** A project or one of its versions, as the API returns it. */
export interface SavedContent extends Omit<EditorContent, "designLanguage" | "testbenchLanguage"> {
  designLanguage: string; testbenchLanguage: string; pins: Record<string, string>;
}
interface Listed { id: string; name: string; updatedAt: string; versions: number }
type Status = { kind: "idle" } | { kind: "saving" } | { kind: "saved"; at: Date } | { kind: "error"; message: string };

const CURRENT_KEY = "bitflow_project";
const PINS_PREFIX = "bitflow_pins:";
const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* storage off */ } },
  del: (k: string) => { try { localStorage.removeItem(k); } catch { /* storage off */ } },
};

/** Pins edited in the Bitstream tab for the modules this project defines. */
function pinsFor(c: { designCode: string; files: ProjectFile[] }): Record<string, string> {
  const modules = new Set([c.designCode, ...c.files.map((f) => f.content)].flatMap((code) => [...code.matchAll(/\bmodule\s+([A-Za-z_]\w*)/g)].map((m) => m[1])));
  const pins: Record<string, string> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)!;
      if (key.startsWith(PINS_PREFIX) && modules.has(key.split(":")[2])) pins[key.slice(PINS_PREFIX.length)] = localStorage.getItem(key) ?? "";
    }
  } catch { /* storage off */ }
  return pins;
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json" } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error ?? `Request failed (${res.status})`), { status: res.status });
  return data as T;
}

export default function ProjectsMenu({ content, onLoad, disabled }: {
  content: EditorContent; onLoad: (p: SandboxProject) => void; disabled?: boolean;
}) {
  const [current, setCurrent] = useState<{ id: string; name: string } | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<Listed[] | null>(null);
  const [history, setHistory] = useState(false);
  const savedKey = useRef<string | null>(null);   // the content last saved; null: take the next content as saved
  const menu = useRef<HTMLDivElement>(null);

  const keyOf = useCallback(() => JSON.stringify([content, pinsFor(content)]), [content]);

  useEffect(() => {   // the project open before a reload
    try { const c = JSON.parse(store.get(CURRENT_KEY) ?? "null"); if (c?.id) setCurrent(c); } catch { /* none */ }
  }, []);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (menu.current && !menu.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const remember = (p: { id: string; name: string } | null) => {
    setCurrent(p);
    if (p) store.set(CURRENT_KEY, JSON.stringify(p)); else store.del(CURRENT_KEY);
  };
  const fail = (err: unknown) => setStatus({ kind: "error", message: (err as Error).message });

  /** PATCH the project with `body` (content, or a rename); `key`, if given, is what counts as saved afterwards. */
  const patch = useCallback(async (id: string, name: string, body: object, key?: string) => {
    setStatus({ kind: "saving" });
    try {
      const r = await api<{ project: { name: string } }>(`/api/projects/${id}`, { method: "PATCH", body: JSON.stringify(body) });
      if (key !== undefined) savedKey.current = key;
      setStatus({ kind: "saved", at: new Date() });
      if (r.project.name !== name) remember({ id, name: r.project.name });
    } catch (err) {
      if ((err as { status?: number }).status === 404) { remember(null); setStatus({ kind: "error", message: "That project was deleted; the editors still have your code." }); }
      else setStatus({ kind: "error", message: `Not saved: ${(err as Error).message}` });
    }
  }, []);
  const save = useCallback((message?: string) => {
    if (current) patch(current.id, current.name, { ...content, pins: pinsFor(content), ...(message ? { message } : {}) }, keyOf());
  }, [current, content, keyOf, patch]);

  // Autosave, 3 s after the last change.
  useEffect(() => {
    if (!current) return;
    if (savedKey.current === null) { savedKey.current = keyOf(); return; }
    if (keyOf() === savedKey.current) return;
    const t = setTimeout(() => save(), 3000);
    return () => clearTimeout(t);
  }, [content, current, keyOf, save]);

  const saveNew = useCallback(async () => {
    const name = window.prompt("Name for this project:", content.designCode.match(/\bmodule\s+([A-Za-z_]\w*)/)?.[1] ?? "")?.trim();
    if (name === undefined) return;
    setStatus({ kind: "saving" });
    try {
      const r = await api<{ project: { id: string; name: string } }>("/api/projects", { method: "POST", body: JSON.stringify({ ...content, pins: pinsFor(content), name }) });
      savedKey.current = keyOf();
      remember({ id: r.project.id, name: r.project.name });
      setStatus({ kind: "saved", at: new Date() });
    } catch (err) { fail(err); }
  }, [content, keyOf]);

  // Ctrl+S: a named save (a version of its own) or, with no project open, save as new.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); if (current) save("Saved"); else saveNew(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, save, saveNew]);

  const showList = async () => {
    setOpen(false);
    try { setList((await api<{ projects: Listed[] }>("/api/projects")).projects); } catch (err) { fail(err); }
  };

  /** Put a project (or one of its versions) into the editors, with its pins. */
  const load = (p: SavedContent) => {
    onLoad({ design: p.designCode, testbench: p.testbenchCode, files: p.files,
      designLanguage: p.designLanguage as DesignLanguage, testbenchLanguage: p.testbenchLanguage as TestbenchLanguage });
    for (const [k, v] of Object.entries(p.pins ?? {})) store.set(PINS_PREFIX + k, v);
    savedKey.current = null;   // the autosave effect takes what was loaded as saved
  };

  const openProject = async (id: string) => {
    const unsaved = !current || keyOf() !== savedKey.current;
    if (unsaved && !window.confirm("Open this project? What's in the editors now (not saved) will be replaced.")) return;
    try {
      const { project } = await api<{ project: SavedContent & { id: string; name: string } }>(`/api/projects/${id}`);
      load(project);
      remember({ id: project.id, name: project.name });
      setList(null);
      setStatus({ kind: "idle" });
    } catch (err) { fail(err); }
  };

  /** Load a version and save it as the project's newest, so the history records the restore. */
  const restore = async (v: SavedContent & { createdAt: string }) => {
    if (!current) return;
    setHistory(false);
    load(v);
    const { designCode, testbenchCode, files, designLanguage, testbenchLanguage, pins } = v;
    await patch(current.id, current.name,
      { designCode, testbenchCode, files, designLanguage, testbenchLanguage, pins, message: `Restored the version from ${new Date(v.createdAt).toLocaleString()}` });
  };

  const rename = async () => {
    setOpen(false);
    if (!current) return;
    const name = window.prompt("Rename the project:", current.name)?.trim();
    if (name) await patch(current.id, current.name, { name });
  };
  const remove = async (id: string, name: string) => {
    if (!window.confirm(`Delete "${name}" and its history? The editors keep their code.`)) return;
    try {
      await api(`/api/projects/${id}`, { method: "DELETE" });
      if (current?.id === id) remember(null);
      setList((l) => l?.filter((p) => p.id !== id) ?? null);
    } catch (err) { fail(err); }
  };

  const item = "block w-full text-left px-3 py-1.5 hover:bg-white/5";
  const statusText = status.kind === "saving" ? "Saving…"
    : status.kind === "saved" ? `Saved ${status.at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
    : status.kind === "error" ? status.message : "";

  return (
    <div ref={menu} className="relative flex items-center gap-1.5 font-mono text-[10px]">
      <span className="text-[9px] text-dim tracking-wider uppercase select-none hidden sm:block">Project</span>
      <button onClick={() => setOpen((o) => !o)} disabled={disabled} aria-haspopup="menu" aria-expanded={open}
        className="h-6 max-w-[180px] truncate px-2 rounded border border-rim bg-surface text-ghost hover:text-pale hover:border-muted disabled:opacity-40">
        {current ? current.name : "Not saved"} ▾
      </button>
      {statusText && <span className={`hidden md:inline max-w-[260px] truncate ${status.kind === "error" ? "text-danger" : "text-dim"}`} role="status">{statusText}</span>}

      {open && (
        <div role="menu" className="absolute left-0 top-7 z-40 w-56 py-1 rounded border border-rim bg-surface shadow-xl text-[11px] text-pale">
          {current && <button role="menuitem" className={item} onClick={() => { setOpen(false); save("Saved"); }}>Save a version <span className="text-dim">Ctrl+S</span></button>}
          <button role="menuitem" className={item} onClick={() => { setOpen(false); saveNew(); }}>{current ? "Save as a new project…" : "Save as a project…"}</button>
          <button role="menuitem" className={item} onClick={showList}>Open a project…</button>
          {current && <button role="menuitem" className={item} onClick={() => { setOpen(false); setHistory(true); }}>History…</button>}
          {current && <button role="menuitem" className={item} onClick={rename}>Rename…</button>}
          {current && <button role="menuitem" className={item} onClick={() => { setOpen(false); remember(null); setStatus({ kind: "idle" }); }}>Close (stop saving)</button>}
        </div>
      )}

      {list && (
        <div role="dialog" aria-modal="true" aria-label="Your projects" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setList(null)}>
          <div className="w-full max-w-lg rounded border border-rim bg-surface p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base text-bright">Your projects</h2>
              <button onClick={() => setList(null)} className="text-dim hover:text-bright text-[11px]">Close</button>
            </div>
            {list.length === 0 && <p className="text-[11px] text-dim">No saved projects yet. Use “Save as a project…” to keep your work in your account.</p>}
            <ul className="max-h-[60vh] overflow-auto divide-y divide-rim/50">
              {list.map((p) => (
                <li key={p.id} className="flex items-center gap-3 py-2">
                  <button onClick={() => openProject(p.id)} className="flex-1 text-left min-w-0">
                    <div className={`truncate text-[12px] ${p.id === current?.id ? "text-phosphor" : "text-pale"}`}>{p.name}</div>
                    <div className="text-[10px] text-dim">{new Date(p.updatedAt).toLocaleString()} · {p.versions} version{p.versions === 1 ? "" : "s"}</div>
                  </button>
                  <button onClick={() => remove(p.id, p.name)} className="text-[10px] text-dim hover:text-danger" aria-label={`Delete ${p.name}`}>Delete</button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {history && current && (
        <ProjectHistory projectId={current.id} name={current.name} current={content} onClose={() => setHistory(false)} onRestore={restore} />
      )}
    </div>
  );
}
