"use client";
/**
 * components/studio/GeneratorsTool.tsx — /studio/generators: pick a building block (LFSR,
 * CRC, FIFO, …), set its parameters, and get Verilog with a testbench that checks every
 * cycle against a reference model (lib/studio/generators.ts). Loaded client-only.
 */

import { useMemo } from "react";
import GeneratedCode from "@/components/studio/GeneratedCode";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { GENERATORS, type Generator, type Values, defaults } from "@/lib/studio/generators";

interface Draft { id: string; values: Record<string, Values> }
const START: Draft = { id: GENERATORS[0].id, values: {} };
const field = "bg-pit border border-rim/60 rounded px-2 py-1 text-[12px] text-pale";

export default function GeneratorsTool() {
  const [stored, setDraft] = useLocalStorage<Draft>("bitflow_studio_generators", START);
  const d: Draft = { ...START, ...stored, values: { ...stored?.values } };
  const gen: Generator = GENERATORS.find((g) => g.id === d.id) ?? GENERATORS[0];
  const values: Values = { ...defaults(gen), ...d.values[gen.id] };
  const setValues = (patch: Values) => setDraft({ ...d, values: { ...d.values, [gen.id]: { ...values, ...patch } } });
  const valuesKey = JSON.stringify(values);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const result = useMemo(() => gen.build(values), [gen, valuesKey]);

  return (
    <div className="space-y-5">
      <div>
        <p className="text-[12px] text-ghost max-w-3xl">
          Common building blocks, sized to your needs. Each comes with a testbench that checks every output on every cycle against
          a reference model, so you can open it in the Sandbox, run it, and change it with confidence.
        </p>
      </div>
      <div className="grid gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
        <nav className="flex lg:flex-col flex-wrap gap-1.5 font-mono text-[12px]" aria-label="Generators">
          {GENERATORS.map((g) => (
            <button key={g.id} onClick={() => setDraft({ ...d, id: g.id })} aria-current={g.id === gen.id}
                    className={`text-left px-3 py-2 rounded-lg border ${g.id === gen.id ? "border-phosphor/40 bg-phosphor/10 text-phosphor" : "border-rim/60 text-ghost hover:text-bright"}`}>
              {g.title}
            </button>
          ))}
        </nav>
        <div className="space-y-4 min-w-0">
          <div className="space-y-1">
            <h2 className="font-display text-[16px] font-semibold">{gen.title}</h2>
            <p className="text-[12px] text-ghost max-w-3xl">{gen.blurb}</p>
          </div>
          {gen.presets && (
            <div className="flex flex-wrap items-center gap-1.5 font-mono text-[11px]">
              <span className="text-dim">Standard:</span>
              {gen.presets.map((p) => {
                const on = Object.entries(p.values).every(([k, v]) => String(values[k]).toLowerCase() === String(v).toLowerCase());
                return <button key={p.label} onClick={() => setValues(p.values)}
                               className={`px-2 py-1 rounded border ${on ? "border-phosphor/40 text-phosphor" : "border-rim/60 text-ghost hover:text-bright"}`}>{p.label}</button>;
              })}
            </div>
          )}
          {gen.params.length > 0 && (
            <div className="flex flex-wrap items-end gap-3 font-mono text-[12px]">
              {gen.params.map((p) => (
                <label key={p.key} className={`space-y-1 ${p.kind === "text" ? "flex-1 min-w-[240px]" : ""}`} title={p.hint}>
                  <span className="block text-[10px] uppercase tracking-wider text-dim">{p.label}</span>
                  {p.kind === "int"
                    ? <input type="number" min={p.min} max={p.max} value={String(values[p.key])} aria-label={p.label} className={`${field} w-28`}
                             onChange={(e) => setValues({ [p.key]: e.target.value === "" ? "" : Number(e.target.value) })} />
                    : <input value={String(values[p.key])} aria-label={p.label} spellCheck={false} onChange={(e) => setValues({ [p.key]: e.target.value })}
                             className={`${field} ${p.kind === "hex" ? "w-32" : "w-full"}`} />}
                </label>
              ))}
              <button onClick={() => setDraft({ ...d, values: { ...d.values, [gen.id]: {} } })} className="text-[11px] text-dim hover:text-bright pb-1.5">reset</button>
            </div>
          )}
          {gen.params.some((p) => p.hint) && <p className="text-[11px] text-dim">{gen.params.filter((p) => p.hint).map((p) => p.hint).join(" ")}</p>}
          {typeof result === "string" ? <p className="font-mono text-[12px] text-danger">{result}</p> : (
            <>
              <ul className="font-mono text-[11px] text-ghost list-disc pl-5 space-y-0.5">{result.notes.map((n) => <li key={n}>{n}</li>)}</ul>
              <GeneratedCode module={result.module} design={result.design} testbench={result.testbench} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
