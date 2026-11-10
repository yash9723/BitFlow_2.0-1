"use client";
/**
 * components/EmbedPlayer.tsx — the player inside /embed/[id]: read-only files in tabs, Run, output and
 * waveform. Runs Icarus in the viewer's browser (lib/sim/browser-sim.ts), so it needs no account, no
 * cookies and no server; designs that can't run there link to BitFlow instead.
 */

import { useState } from "react";
import WaveformPanel from "@/components/WaveformPanel";
import { runInBrowser } from "@/lib/sim/browser-sim";
import { parseVcd, type ParsedVcd } from "@/lib/vcd-parser";
import { combineDesign, dataFiles, relabelOutput, type ProjectFile } from "@/lib/project-files";
import type { SimulateResponse } from "@/lib/types";

export default function EmbedPlayer({ id, title, author, names, designCode, testbenchCode, files, runnable }: {
  id: string; title: string; author: string; names: { design: string; testbench: string };
  designCode: string; testbenchCode: string; files: ProjectFile[]; runnable: boolean;
}) {
  const tabs = [{ name: names.design, content: designCode }, { name: names.testbench, content: testbenchCode }, ...files];
  const [tab, setTab] = useState(0);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<SimulateResponse | null>(null);
  const [vcd, setVcd] = useState<ParsedVcd | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setRunning(true); setError(null); setVcd(null);
    try {
      const project = combineDesign(designCode, files);
      const r = await runInBrowser({ design: project.code, testbench: testbenchCode, files: dataFiles(files) });
      const relabel = (t: string) => (project.multi ? relabelOutput(t, project.locate) : t) ?? "";
      setResult({ ...r, stdout: relabel(r.stdout ?? ""), stderr: relabel(r.stderr ?? "") });
      if (r.waveform.available && r.waveform.vcd_base64) {
        try { setVcd(parseVcd(atob(r.waveform.vcd_base64))); } catch { /* output still shows */ }
      }
    } catch (err) {
      setError(`The simulator couldn't start in this browser (${(err as Error).message}). Open the design on BitFlow to run it there.`);
    } finally {
      setRunning(false);
    }
  };

  const output = result ? [result.stdout, result.stderr].filter(Boolean).join("\n") : "";
  return (
    <div className="h-screen flex flex-col bg-void text-bright font-mono text-[12px]">
      <header className="flex items-center gap-3 px-3 py-2 border-b border-rim bg-pit">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold">{title}</div>
          <div className="truncate text-[10px] text-dim">by {author}</div>
        </div>
        {runnable && (
          <button onClick={run} disabled={running}
                  className="px-3 py-1.5 rounded-md bg-phosphor text-void text-[11px] font-bold hover:brightness-110 disabled:opacity-50">
            {running ? "Running…" : "▶ Run"}
          </button>
        )}
        <a href={`/s/${id}`} target="_blank" rel="noopener noreferrer"
           className="px-3 py-1.5 rounded-md border border-rim text-[11px] text-pale hover:border-phosphor/50 hover:text-phosphor">
          Open on BitFlow ↗
        </a>
      </header>
      <nav className="flex gap-1 px-2 pt-1 border-b border-rim bg-pit overflow-x-auto" aria-label="Files">
        {tabs.map((t, i) => (
          <button key={t.name} onClick={() => setTab(i)}
                  className={`px-3 py-1 text-[11px] rounded-t-md ${i === tab ? "bg-shaft text-phosphor" : "text-dim hover:text-pale"}`}>
            {t.name}
          </button>
        ))}
      </nav>
      <pre className="flex-1 min-h-0 overflow-auto bg-shaft p-3 leading-relaxed text-pale">{tabs[tab].content || "// (empty)"}</pre>
      {(result || error || !runnable) && (
        <section className="max-h-[45%] min-h-[120px] flex flex-col border-t border-rim">
          {!runnable && <p className="p-3 text-dim">This design runs on BitFlow&apos;s servers. Open it on BitFlow to simulate it.</p>}
          {error && <p className="p-3 text-danger">{error}</p>}
          {result && !vcd && <pre className="flex-1 overflow-auto p-3 text-pale whitespace-pre-wrap">{output}</pre>}
          {result && vcd && (
            <div className="flex-1 min-h-0 flex flex-col">
              <pre className="max-h-16 overflow-auto px-3 py-1 text-[11px] text-dim whitespace-pre-wrap border-b border-rim">{output}</pre>
              <div className="flex-1 min-h-[160px]"><WaveformPanel parsedVcd={vcd} result={result} /></div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
