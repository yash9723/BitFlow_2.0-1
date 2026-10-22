"use client";
/** components/studio/GeneratedCode.tsx — a Studio tool's Verilog output: Open in Sandbox, downloads, and the code. */

import { useState } from "react";
import ForkButton from "@/components/ForkButton";
import { downloadBlob } from "@/lib/api";

export default function GeneratedCode({ module, design, testbench }: { module: string; design: string; testbench: string }) {
  const btn = "px-3 py-2 rounded-lg border border-rim/60 font-mono text-[12px] text-ghost hover:text-bright";
  return (
    <>
      <div className="flex flex-wrap gap-2">
        <ForkButton designCode={design} testbenchCode={testbench} label="Open in Sandbox"
                    confirmText="Open this design and its testbench in your Sandbox? It replaces the code in your Sandbox editors." />
        <button onClick={() => downloadBlob(`${module}.v`, design, "text/plain")} className={btn}>Download {module}.v</button>
        <button onClick={() => downloadBlob(`tb_${module}.v`, testbench, "text/plain")} className={btn}>Download testbench</button>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <CodeBlock title={`${module}.v`} code={design} />
        <CodeBlock title={`tb_${module}.v`} code={testbench} collapsed />
      </div>
    </>
  );
}

function CodeBlock({ title, code, collapsed }: { title: string; code: string; collapsed?: boolean }) {
  const [open, setOpen] = useState(!collapsed);
  const [copied, setCopied] = useState(false);
  return (
    <div className="border border-rim/60 rounded-xl overflow-hidden min-w-0">
      <div className="flex items-center justify-between px-3 py-1.5 bg-surface/70 font-mono text-[11px]">
        <button onClick={() => setOpen((v) => !v)} className="text-pale">{open ? "▾" : "▸"} {title}</button>
        <button onClick={() => navigator.clipboard?.writeText(code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1200); })}
                className="text-dim hover:text-bright">{copied ? "copied" : "copy"}</button>
      </div>
      {open && <pre className="p-3 text-[11px] leading-relaxed text-ghost overflow-auto max-h-80">{code}</pre>}
    </div>
  );
}
