"use client";
/**
 * components/ChipXray.tsx — in the ASIC panel: the Sky130 gates your Verilog became, linked to its lines
 * (lib/chip-xray.ts). The editor's line lights its gates, a gate opens its line, the critical path is
 * outlined in red, and its time is broken down by line of your code.
 */
import { useMemo, useState } from "react";
import SchematicView from "@/components/SchematicView";
import { pathByLine, xrayNetlist } from "@/lib/chip-xray";
import type { PathStage } from "@/lib/asic-path";
import type { SrcLoc, YosysNetlist } from "@/lib/hardware-diagrams";

export default function ChipXray({ gates, top, code, stages, cursor, onOpenSource, describe = (l) => `${l.file}:${l.line}` }: {
  gates: YosysNetlist; top: string; code: string | null; stages: PathStage[];
  cursor?: { file: string; line: number } | null;
  onOpenSource?: (loc: SrcLoc) => void;
  describe?: (loc: SrcLoc) => string;
}) {
  const [open, setOpen] = useState(false);
  const x = useMemo(() => xrayNetlist(gates, top, code), [gates, top, code]);
  const path = useMemo(() => stages.map((s) => s.pin.split("/")[0]).filter((n) => n in (gates.modules?.[top]?.cells ?? {})), [stages, gates, top]);
  const byLine = useMemo(() => (code ? pathByLine(stages, x.lines) : []), [stages, x.lines, code]);
  const total = byLine.reduce((n, r) => n + r.delay, 0);

  return (
    <section aria-label="Chip X-ray" className="space-y-2 font-mono text-[11px]">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-[10px] uppercase tracking-widest text-dim">Chip X-ray · your code as Sky130 gates</h3>
        <button onClick={() => setOpen((o) => !o)} className="h-6 px-2 rounded border border-rim text-pale hover:text-phosphor hover:border-phosphor/50">
          {open ? "Hide the gates" : "Show the gates"}
        </button>
      </div>
      {code === null && <p className="text-dim">Lines are linked for Verilog designs; this VHDL design shows its gates only.</p>}
      {byLine.length > 0 && total > 0 && (
        <div>
          <p className="text-ghost mb-1">Where the critical path spends its time, by line of your code:</p>
          <ul className="space-y-0.5">
            {byLine.map((r) => {
              const loc = r.line === null ? null : { file: "design.v", line: r.line, endLine: r.line };
              return (
                <li key={r.line ?? "none"} className="flex items-center gap-2">
                  <span className="w-24 shrink-0 h-2 rounded-sm bg-danger/20 overflow-hidden" aria-hidden>
                    <span className="block h-full bg-danger/70" style={{ width: `${(100 * r.delay) / total}%` }} />
                  </span>
                  <span className="w-20 shrink-0 text-pale">{r.delay.toFixed(3)} ns</span>
                  {loc ? (
                    <button disabled={!onOpenSource} onClick={() => onOpenSource?.(loc)} className="text-info hover:underline disabled:no-underline disabled:text-ghost truncate text-left">
                      {describe(loc)}: {code!.split("\n")[r.line! - 1]?.trim().slice(0, 70)}
                    </button>
                  ) : <span className="text-dim">gates not linked to a line</span>}
                  <span className="text-dim shrink-0">{r.cells.length} gate{r.cells.length === 1 ? "" : "s"}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {open && (
        <>
          <p className="text-dim">Red outline: the critical path. Amber: gates from the line your cursor was on. Click a gate to see the line it came from and open it.</p>
          <div className="h-[28rem]">
            <SchematicView netlist={x.netlist} cursor={cursor} onOpenSource={onOpenSource} describe={describe} emphasis={path} />
          </div>
        </>
      )}
    </section>
  );
}
