"use client";
/**
 * components/ProjectHistory.tsx — a project's saved versions (GET /api/projects/[id]/versions):
 * pick one to compare it with what's in the editors, file by file (Monaco's diff view),
 * and restore it. Loaded on demand by components/ProjectsMenu.tsx.
 */
import { useEffect, useMemo, useState } from "react";
import { DiffEditor, loader } from "@monaco-editor/react";
import type { EditorContent, SavedContent } from "./ProjectsMenu";

loader.config({ paths: { vs: "/monaco/vs" } });   // our own copy, as components/Editor.tsx

interface Listed { id: string; createdAt: string; message: string | null; lines: number }
type Version = SavedContent & { id: string; createdAt: string; message: string | null };

const MONACO_LANG: Record<string, string> = { verilog: "verilog", vhdl: "vhdl", python: "python" };

/** The files of a project or version: design, testbench, then the extra design files. */
function filesOf(c: { designCode: string; testbenchCode: string; files: { name: string; content: string }[]; designLanguage: string; testbenchLanguage: string }) {
  return [
    { name: c.designLanguage === "vhdl" ? "design.vhd" : "design.v", content: c.designCode, lang: MONACO_LANG[c.designLanguage] ?? "verilog" },
    { name: c.testbenchLanguage === "python" ? "test_tb.py" : c.testbenchLanguage === "vhdl" ? "tb.vhd" : "tb.v", content: c.testbenchCode, lang: MONACO_LANG[c.testbenchLanguage] ?? "verilog" },
    ...c.files.map((f) => ({ name: f.name, content: f.content, lang: /\.s?vh?$/i.test(f.name) ? "verilog" : "plaintext" })),
  ];
}

export default function ProjectHistory({ projectId, name, current, onClose, onRestore }: {
  projectId: string; name: string; current: EditorContent; onClose: () => void; onRestore: (v: Version) => void;
}) {
  const [versions, setVersions] = useState<Listed[] | null>(null);
  const [picked, setPicked] = useState<Version | null>(null);
  const [file, setFile] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const pick = async (id: string) => {
    try {
      const d = await (await fetch(`/api/projects/${projectId}/versions?v=${id}`)).json();
      if (!d.version) throw new Error(d.error ?? "Couldn't load that version.");
      setPicked(d.version);
    } catch (e) { setError((e as Error).message); }
  };

  useEffect(() => {
    fetch(`/api/projects/${projectId}/versions`).then((r) => r.json()).then((d) => {
      if (!d.versions) throw new Error(d.error ?? "Couldn't load the history.");
      setVersions(d.versions);
      if (d.versions[0]) pick(d.versions[0].id);
    }).catch((e) => setError(e.message));
  }, [projectId]);   // eslint-disable-line react-hooks/exhaustive-deps -- pick only reads projectId

  const now = useMemo(() => filesOf(current), [current]);
  const then = useMemo(() => (picked ? filesOf(picked) : []), [picked]);
  const names = [...new Set([...then.map((f) => f.name), ...now.map((f) => f.name)])];
  const shown = names[Math.min(file, names.length - 1)];
  const left = then.find((f) => f.name === shown), right = now.find((f) => f.name === shown);
  const changed = (n: string) => then.find((f) => f.name === n)?.content !== now.find((f) => f.name === n)?.content;

  return (
    <div role="dialog" aria-modal="true" aria-label={`History of ${name}`} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3" onClick={onClose}>
      <div className="flex h-[85vh] w-full max-w-6xl flex-col rounded border border-rim bg-surface font-mono text-[11px] text-pale" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-rim px-4 py-2">
          <h2 className="font-display text-base text-bright truncate">History of {name}</h2>
          <button onClick={onClose} className="text-dim hover:text-bright">Close</button>
        </div>
        {error && <p className="px-4 py-2 text-danger">{error}</p>}
        <div className="flex min-h-0 flex-1">
          <ul className="w-56 shrink-0 overflow-auto border-r border-rim" aria-label="Versions">
            {versions?.map((v, i) => (
              <li key={v.id}>
                <button onClick={() => pick(v.id)} aria-current={picked?.id === v.id}
                  className={`block w-full px-3 py-2 text-left border-b border-rim/40 ${picked?.id === v.id ? "bg-phosphor/10 text-phosphor" : "hover:bg-white/5"}`}>
                  <div>{new Date(v.createdAt).toLocaleString()}</div>
                  <div className="text-[10px] text-dim truncate">{i === 0 ? "newest · " : ""}{v.message ?? "autosaved"} · {v.lines} lines</div>
                </button>
              </li>
            ))}
            {versions?.length === 0 && <li className="px-3 py-2 text-dim">No versions yet.</li>}
          </ul>
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex flex-wrap items-center gap-1 border-b border-rim px-3 py-1.5">
              {names.map((n, i) => (
                <button key={n} onClick={() => setFile(i)}
                  className={`px-2 py-0.5 rounded border text-[10px] ${n === shown ? "border-phosphor/60 text-phosphor" : "border-rim text-dim hover:text-ghost"}`}>
                  {n}{picked && changed(n) ? " •" : ""}
                </button>
              ))}
              <span className="ml-auto text-[10px] text-dim">left: this version · right: the editors now</span>
            </div>
            <div className="min-h-0 flex-1">
              {picked ? (
                <DiffEditor original={left?.content ?? ""} modified={right?.content ?? ""} language={(left ?? right)?.lang ?? "verilog"} theme="vs-dark"
                  options={{ readOnly: true, renderSideBySide: true, minimap: { enabled: false }, fontSize: 12, scrollBeyondLastLine: false }} />
              ) : <p className="p-4 text-dim">{versions ? "Pick a version." : "Loading…"}</p>}
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-rim px-3 py-2">
              {picked && !names.some(changed) && <span className="text-[10px] text-dim">This version is what the editors have now.</span>}
              <button disabled={!picked || !names.some(changed)} onClick={() => picked && onRestore(picked)}
                className="px-3 py-1 rounded border border-info/60 text-info hover:bg-info/10 disabled:opacity-40">Restore this version</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
