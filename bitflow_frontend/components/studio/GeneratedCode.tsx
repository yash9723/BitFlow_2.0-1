"use client";
/**
 * components/studio/GeneratedCode.tsx — a Studio tool's Verilog output: Open in Sandbox, downloads,
 * and the code, with a Verilog / SystemVerilog switch for the design (lib/studio/sv.ts).
 */

import { useMemo, useState } from "react";
import ForkButton from "@/components/ForkButton";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { downloadBlob } from "@/lib/api";
import { toSystemVerilog } from "@/lib/studio/sv";

/** `convertible`: false when the design is the user's own code (the testbench generator). */
export default function GeneratedCode({ module, design: verilog, testbench, convertible = true }: {
  module: string; design: string; testbench: string; convertible?: boolean;
}) {
  const [hdl, setHdl] = useLocalStorage<"verilog" | "sv">("bitflow_studio_hdl", "verilog");
  const sv = convertible && hdl === "sv";
  const design = useMemo(() => (sv ? toSystemVerilog(verilog) : verilog), [sv, verilog]);
  const ext = sv ? "sv" : "v";
  const btn = "px-3 py-2 rounded-lg border border-rim/60 font-mono text-[12px] text-ghost hover:text-bright";
  const tab = (on: boolean) => `px-2.5 py-1.5 ${on ? "bg-phosphor/10 text-phosphor" : "text-ghost hover:text-bright"}`;
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <ForkButton designCode={design} testbenchCode={testbench} label="Open in Sandbox"
                    confirmText="Open this design and its testbench in your Sandbox? It replaces the code in your Sandbox editors." />
        <button onClick={() => downloadBlob(`${module}.${ext}`, design, "text/plain")} className={btn}>Download {module}.{ext}</button>
        <button onClick={() => downloadBlob(`tb_${module}.v`, testbench, "text/plain")} className={btn}>Download testbench</button>
        {convertible && (
          <div role="group" aria-label="Design language" className="ml-auto flex rounded-lg border border-rim/60 overflow-hidden font-mono text-[11px]">
            <button onClick={() => setHdl("verilog")} aria-pressed={!sv} className={tab(!sv)}>Verilog</button>
            <button onClick={() => setHdl("sv")} aria-pressed={sv} title="logic, always_ff / always_comb, typedef enum states" className={tab(sv)}>SystemVerilog</button>
          </div>
        )}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <CodeBlock title={`${module}.${ext}`} code={design} />
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
