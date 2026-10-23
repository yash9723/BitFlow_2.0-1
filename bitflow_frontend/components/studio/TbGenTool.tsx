"use client";
/**
 * components/studio/TbGenTool.tsx — /studio/testbench: paste a Verilog or SystemVerilog
 * module and get a self-checking testbench for it (lib/studio/tbgen.ts). Loaded client-only.
 */

import { useMemo } from "react";
import GeneratedCode from "@/components/studio/GeneratedCode";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { DESIGN_STORAGE_KEY } from "@/hooks/useSimulation";
import { EXHAUSTIVE_BITS, TB_DEFAULTS, type TbOptions, generateTestbench, moduleNames, parseModule, stimulusKind } from "@/lib/studio/tbgen";

const EXAMPLE = `module accumulator #(parameter W = 8) (
  input  logic         clk,
  input  logic         rst_n,
  input  logic         en,
  input  logic [W-1:0] din,
  output logic [W-1:0] acc
);
  always_ff @(posedge clk or negedge rst_n)
    if (!rst_n)  acc <= '0;
    else if (en) acc <= acc + din;
endmodule
`;

interface Draft { source: string; module: string; opts: TbOptions }
const START: Draft = { source: EXAMPLE, module: "", opts: TB_DEFAULTS };
const field = "bg-pit border border-rim/60 rounded px-2 py-1 text-[12px] text-pale";

export default function TbGenTool() {
  const [stored, setDraft] = useLocalStorage<Draft>("bitflow_studio_testbench", START);
  const d: Draft = { ...START, ...stored, opts: { ...TB_DEFAULTS, ...stored?.opts } };
  const set = (patch: Partial<Draft>) => setDraft({ ...d, ...patch });
  const setOpts = (patch: Partial<TbOptions>) => set({ opts: { ...d.opts, ...patch } });

  const names = useMemo(() => moduleNames(d.source), [d.source]);
  const pick = names.includes(d.module) ? d.module : undefined;
  const info = useMemo(() => parseModule(d.source, pick), [d.source, pick]);
  const optsKey = JSON.stringify(d.opts);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const testbench = useMemo(() => (typeof info === "string" ? null : generateTestbench(info, d.opts)), [info, optsKey]);

  const fromSandbox = () => {
    try {
      const v = JSON.parse(localStorage.getItem(DESIGN_STORAGE_KEY) ?? "null");
      if (typeof v === "string" && v.trim()) set({ source: v, module: "" });
      else window.alert("Your Sandbox design editor is empty.");
    } catch { window.alert("Couldn't read your Sandbox design from this browser's storage."); }
  };

  return (
    <div className="space-y-5">
      <p className="text-[12px] text-ghost max-w-3xl">
        Paste a Verilog or SystemVerilog module. You get a testbench that drives every input (all combinations for a small
        combinational block, random values otherwise), handles clock and reset, flags outputs that go X or Z, and has a
        reference-model slot: fill it in and every output is checked on every step.
      </p>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-2 min-w-0">
          <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
            <label htmlFor="tbgen-src" className="text-dim">Your module</label>
            <button onClick={fromSandbox} className="px-2 py-1 rounded border border-rim/60 text-ghost hover:text-bright">Use my Sandbox design</button>
            <button onClick={() => set({ source: EXAMPLE, module: "" })} className="px-2 py-1 rounded border border-rim/60 text-ghost hover:text-bright">Example</button>
            {names.length > 1 && (
              <label className="flex items-center gap-1 ml-auto"><span className="text-dim">module</span>
                <select value={pick ?? names[names.length - 1]} onChange={(e) => set({ module: e.target.value })} className={field}>
                  {names.map((n) => <option key={n}>{n}</option>)}
                </select></label>
            )}
          </div>
          <textarea id="tbgen-src" value={d.source} onChange={(e) => set({ source: e.target.value })} spellCheck={false}
                    className="w-full h-72 bg-pit border border-rim/60 rounded-lg p-3 font-mono text-[12px] text-pale leading-relaxed" />
        </div>
        <div className="space-y-3 font-mono text-[12px]">
          <div className="flex flex-wrap gap-3 items-end">
            <label className="flex flex-col gap-1"><span className="text-dim text-[11px]">Style</span>
              <select value={d.opts.style} onChange={(e) => setOpts({ style: e.target.value as TbOptions["style"] })} className={field}>
                <option value="verilog">Verilog-2001</option>
                <option value="sv">SystemVerilog</option>
              </select></label>
            <label className="flex flex-col gap-1"><span className="text-dim text-[11px]">Random cycles</span>
              <input type="number" min={1} max={100000} value={d.opts.cycles} className={`${field} w-24`}
                     onChange={(e) => setOpts({ cycles: Math.min(100000, Math.max(1, Math.round(Number(e.target.value)) || 1)) })} /></label>
            <label className="flex flex-col gap-1"><span className="text-dim text-[11px]">Clock period (ns)</span>
              <input type="number" min={2} max={1000} value={d.opts.period} className={`${field} w-20`}
                     onChange={(e) => setOpts({ period: Math.min(1000, Math.max(2, Math.round(Number(e.target.value)) || 10)) })} /></label>
          </div>
          <label className="flex items-center gap-2 text-ghost">
            <input type="checkbox" checked={d.opts.xcheck} onChange={(e) => setOpts({ xcheck: e.target.checked })} />
            Fail when an output is X or Z
          </label>
          {typeof info === "string" ? (
            <p role="alert" className="text-amber-400 text-[12px]">{info}</p>
          ) : (
            <div className="border border-rim/60 rounded-lg p-3 space-y-2">
              <div className="text-pale">{info.name}
                <span className="text-dim"> · {info.clock ? `clocked by ${info.clock}` : "combinational"}
                  {info.reset ? `, reset ${info.reset.name} (active ${info.reset.activeLow ? "low" : "high"})` : ""}</span>
              </div>
              <table className="w-full text-[11px]">
                <tbody>
                  {info.ports.map((p) => (
                    <tr key={p.name} className="border-t border-rim/30">
                      <td className="py-0.5 text-dim">{p.dir}</td>
                      <td className="py-0.5 text-pale">{p.name}</td>
                      <td className="py-0.5 text-right text-ghost">{p.width} bit{p.width === 1 ? "" : "s"}{p.signed ? ", signed" : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-[11px] text-dim">
                {stimulusKind(info) === "exhaustive"
                  ? "Every input combination is tried."
                  : info.clock ? `${d.opts.cycles} clock cycles of random inputs after reset.`
                    : `More than ${EXHAUSTIVE_BITS} input bits, so ${d.opts.cycles} random input vectors.`}
              </p>
            </div>
          )}
        </div>
      </div>
      {testbench && typeof info !== "string" && (
        <GeneratedCode module={info.name} design={d.source} testbench={testbench} convertible={false} />
      )}
    </div>
  );
}
