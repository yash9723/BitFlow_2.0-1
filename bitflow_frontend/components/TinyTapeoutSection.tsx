"use client";
/**
 * components/TinyTapeoutSection.tsx — in the ASIC panel: how the design maps onto Tiny Tapeout's pins, how many tiles
 * its Sky130 area needs, and a zip to copy into a repo made from TT's template (lib/tinytapeout.ts).
 */
import { useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { downloadBlob } from "@/lib/api";
import { TEMPLATE, mapPins, pinLabels, projectFiles, tilesFor, ttName } from "@/lib/tinytapeout";

const BUSES = [["ui", "Inputs (ui_in)"], ["uo", "Outputs (uo_out)"], ["uio", "Either way (uio)"]] as const;

export default function TinyTapeoutSection({ design, testbench, top, areaUm2, fmaxMhz, language }: {
  design: string; testbench: string; top?: string; areaUm2?: number; fmaxMhz?: number | null; language: string;
}) {
  const { user } = useAuth();
  const map = useMemo(() => mapPins(design, top), [design, top]);
  const [title, setTitle] = useState(top ?? "My design");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const tiles = areaUm2 ? tilesFor(areaUm2) : null;

  if (language === "vhdl") {
    return <TtFrame><p className="text-ghost">Tiny Tapeout export takes Verilog for now. VHDL designs are on the way.</p></TtFrame>;
  }
  if ("error" in map) return <TtFrame><p className="text-danger whitespace-pre-wrap">{map.error}</p></TtFrame>;

  const labels = pinLabels(map);
  const name = ttName(user?.username ?? "", map.top);
  const download = async () => {
    setBusy(true);
    try {
      const files = projectFiles({
        design, testbench, map, user: user?.username ?? "",
        info: { title: title.trim() || map.top, author: user?.username ?? "", description: description.trim(),
                clockHz: map.clock ? Math.min(10_000_000, Math.round((fmaxMhz ?? 10) * 1e6)) : 0, tiles: tiles ?? "8x2" },
      });
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      for (const [path, text] of Object.entries(files)) zip.file(path, text);
      downloadBlob(`${name}.zip`, await zip.generateAsync({ type: "blob" }), "application/zip");
    } finally {
      setBusy(false);
    }
  };

  return (
    <TtFrame>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="text-pale">Top module <code className="text-phosphor">{name}</code></span>
        <span className={tiles ? "text-phosphor" : "text-danger"}>
          {tiles ? `Fits in ${tiles} tile${tiles === "1x1" ? "" : "s"} (estimate from ${areaUm2?.toLocaleString()} µm²)` : "Too large for the biggest tile size (8x2)"}
        </span>
        <span className="text-dim">clk → clk{map.clock ? ` (${map.clock})` : " (unused)"} · rst_n → {map.reset ? `${map.reset.activeLow ? "" : "~"}${map.reset.name}` : "unused"}</span>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        {BUSES.map(([bus, heading]) => (
          <div key={bus}>
            <h4 className="text-[10px] uppercase tracking-widest text-dim mb-1">{heading}</h4>
            <ul className="text-ghost">
              {Array.from({ length: 8 }, (_, i) => (
                <li key={i}><span className="text-dim">{bus}[{i}]</span> {labels[`${bus}[${i}]`] ?? <span className="text-dim">—</span>}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="text-dim">Pins follow the order of your ports. To move a signal to another pin, reorder the ports in your module.</p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-0.5">Project title
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} className="h-7 px-2 w-48 bg-void border border-rim rounded text-pale" />
        </label>
        <label className="flex flex-col gap-0.5 flex-1 min-w-[12rem]">One-line description
          <input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={160} placeholder="What does it do?"
                 className="h-7 px-2 bg-void border border-rim rounded text-pale" />
        </label>
        <button onClick={download} disabled={busy || !tiles}
                className="h-7 px-3 rounded border border-phosphor/60 text-phosphor font-semibold hover:bg-phosphor/10 disabled:opacity-50">
          {busy ? "Packing…" : "Download Tiny Tapeout project"}
        </button>
      </div>
      <p className="text-dim">
        The zip goes into a repository made from <a className="text-bright hover:underline" href={`https://github.com/${TEMPLATE.repo}`} target="_blank" rel="noopener noreferrer">TT&apos;s template</a>;
        its BITFLOW_README.md has the steps. Fabrication is through <a className="text-bright hover:underline" href="https://tinytapeout.com" target="_blank" rel="noopener noreferrer">Tiny Tapeout</a>, which sets the shuttle dates and the price per tile.
      </p>
    </TtFrame>
  );
}

function TtFrame({ children }: { children: React.ReactNode }) {
  return (
    <section aria-label="Tiny Tapeout" className="rounded border border-phosphor/30 bg-phosphor/5 p-3 space-y-2 font-mono text-[11px]">
      <h3 className="text-[11px] font-bold uppercase tracking-widest text-phosphor">Put it on a real chip · Tiny Tapeout</h3>
      {children}
    </section>
  );
}
