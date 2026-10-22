"use client";
/**
 * components/SynthesisPanel.tsx — "what hardware does my code become?"
 *
 * Modal opened from the Sandbox and problem toolbars. Synthesizes the current
 * design with Yosys (POST /api/synthesize) and shows a summary (cells,
 * flip-flops, latches, warnings), a schematic and any extracted FSMs.
 * Diagrams arrive as server-drawn SVG and are shown as <img> data URLs.
 */

import { useCallback, useEffect, useState } from "react";
import { rememberSynthesis, synthesizeDesign, synthToolsLoaded } from "@/lib/synth/client";
import BitstreamTab from "./BitstreamTab";
import Floorplan from "./Floorplan";
import type { CriticalPath, PnrSummary } from "@/lib/synth/pnr";

export interface Fsm {
  module:      string;
  stateReg:    string;
  reset?:      string | null;
  states:      { id: number; code: number | null; name: string | null; reset: boolean }[];
  transitions: { from: number; to: number; conditions: string[] }[];
  svg:         string | null;
}

export interface SynthResult {
  ok:              boolean;
  error?:          string;
  top?:            string | null;
  numCells?:       number;
  ffBits?:         number;
  gates?:          number | null;
  depth?:          number | null;
  cells?:          Record<string, number>;
  latches?:        string[];
  warnings?:       string[];
  fsms?:           Fsm[];
  schematicSvg?:   string | null;
  schematicLimit?: string | null;
}

interface Props {
  isOpen:     boolean;
  onClose:    () => void;
  designCode: string;
  /** VHDL is synthesized from its GHDL Verilog netlist (server-side). */
  language?:  "verilog" | "vhdl";
}

type Tab = "summary" | "schematic" | "fsm" | "fpga" | "bitstream";

type Family = "ice40" | "xc7";
interface PnrResult {
  ok: boolean; error?: string;
  fmax?:        { clock: string; mhz: number }[];
  utilization?: Record<string, { available: number; used: number }>;
  grid?:        { width: number; height: number };
  tiles?:       PnrSummary["tiles"];
  cells?:       PnrSummary["cells"];
  critical?:    CriticalPath[];
}
export interface FpgaResult {
  ok: boolean; error?: string; device?: string;
  resources?: { luts: number; lutram: number; ffs: number; carry: number; bram: number; dsp: number; io: number };
  capacity?:  { luts: number; ffs: number; bram: number; dsp: number };
  pnr?:       PnrResult | null;
}

const UTIL_NAMES: Record<string, string> = { ICESTORM_LC: "Logic cells", SB_IO: "I/O pins", ICESTORM_RAM: "Block RAM", SB_GB: "Global buffers", ICESTORM_PLL: "PLLs" };

const FAMILIES: [Family, string][] = [["ice40", "Lattice iCE40"], ["xc7", "Xilinx 7-series"]];

const svgUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
const svgWidth = (svg: string) => Number(svg.match(/width="(\d+)"/)?.[1] ?? 600);
const stateName = (s: Fsm["states"][number]) =>
  s.name ? (s.code !== null ? `${s.name} (${s.code})` : s.name) : s.code !== null ? String(s.code) : `s${s.id}`;

function Diagram({ svg, alt }: { svg: string; alt: string }) {
  const [zoom, setZoom] = useState(1);
  const base = svgWidth(svg);
  return (
    <div className="flex flex-col min-h-0 h-full">
      <div className="flex items-center gap-2 pb-2 font-mono text-[10px] text-dim">
        <button className="border border-rim px-2 rounded hover:text-bright" onClick={() => setZoom((z) => Math.max(0.25, z / 1.25))} aria-label="Zoom out">−</button>
        <button className="border border-rim px-2 rounded hover:text-bright" onClick={() => setZoom(1)}>{Math.round(zoom * 100)}%</button>
        <button className="border border-rim px-2 rounded hover:text-bright" onClick={() => setZoom((z) => Math.min(4, z * 1.25))} aria-label="Zoom in">+</button>
      </div>
      <div className="flex-1 min-h-0 overflow-auto border border-rim/50 rounded bg-void/60 p-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={svgUrl(svg)} alt={alt} style={{ width: base * zoom, maxWidth: "none" }} />
      </div>
    </div>
  );
}

export default function SynthesisPanel({ isOpen, onClose, designCode, language = "verilog" }: Props) {
  const [result,  setResult]  = useState<SynthResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab,     setTab]     = useState<Tab>("summary");
  const [family,  setFamily]  = useState<Family>("ice40");
  const [fpga,    setFpga]    = useState<Partial<Record<Family, FpgaResult | "loading">>>({});

  const run = useCallback(async () => {
    setLoading(true);
    setFpga({});
    const r: SynthResult = await synthesizeDesign("synth", designCode, language);
    setResult(r);
    if (r.ok) rememberSynthesis(designCode, { synth: r });
    setLoading(false);
  }, [designCode, language]);

  // Synthesize whatever is in the editor each time the panel opens.
  useEffect(() => {
    if (isOpen) run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // FPGA estimates are a separate, slower synthesis: fetched when the tab is opened, per family.
  useEffect(() => {
    if (!isOpen || tab !== "fpga" || fpga[family]) return;
    setFpga((f) => ({ ...f, [family]: "loading" }));
    fetch("/api/synthesize", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ designCode, language, fpga: family }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        return res.ok ? data : { ok: false, error: data.error ?? `Request failed (${res.status})` };
      })
      .catch(() => ({ ok: false, error: "Network error." }))
      .then((r: FpgaResult) => {
        setFpga((f) => ({ ...f, [family]: r }));
        if (r.ok) rememberSynthesis(designCode, { fpga: { [family]: r } });
      });
  }, [isOpen, tab, family, fpga, designCode, language]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const fsms = result?.fsms ?? [];
  const tabs: [Tab, string][] = [["summary", "Summary"], ["schematic", "Schematic"], ["fsm", `FSM${fsms.length ? ` (${fsms.length})` : ""}`], ["fpga", "FPGA"], ["bitstream", "Bitstream"]];

  return (
    <div className="fixed inset-0 z-50 bg-void/80 flex items-center justify-center p-2 sm:p-4" onClick={onClose}
         role="dialog" aria-modal="true" aria-label="Synthesis results">
      <div className="w-full max-w-5xl h-[88vh] flex flex-col bg-pit border border-rim rounded" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b border-rim">
          <div className="flex items-center gap-3">
            <span className="font-mono text-[11px] text-bright uppercase tracking-widest">Synthesis</span>
            <span className="font-mono text-[9px] text-dim">Yosys, generic cells{result?.top ? ` · top: ${result.top}` : ""}</span>
          </div>
          <div className="flex items-center gap-3 font-mono text-[10px]">
            <button className="text-info hover:underline disabled:opacity-40" disabled={loading} onClick={run}>
              {loading ? "Synthesizing…" : "Re-run"}
            </button>
            <button className="text-bright hover:underline" onClick={onClose}>Close</button>
          </div>
        </div>

        <div className="flex gap-1 px-3 pt-2 border-b border-rim/50" role="tablist">
          {tabs.map(([id, text]) => (
            <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
              className={`font-mono text-[10px] px-3 py-1.5 rounded-t border-b-2 ${tab === id ? "border-phosphor text-phosphor" : "border-transparent text-dim hover:text-ghost"}`}>
              {text}
            </button>
          ))}
        </div>

        <div className="flex-1 min-h-0 overflow-auto p-3">
          {!result && loading && <p className="font-mono text-[11px] text-dim">{synthToolsLoaded() || language === "vhdl" ? "Synthesizing…" : "Loading the synthesis tools (about 6 MB, first time only)…"}</p>}

          {result && !result.ok && (
            <div className="space-y-2">
              <p className="font-mono text-[11px] text-danger">Synthesis failed. Fix the errors below (Run shows the same compile errors).</p>
              <pre className="font-mono text-[10px] text-pale whitespace-pre-wrap bg-void/60 border border-rim/50 rounded p-2">{result.error}</pre>
            </div>
          )}

          {result?.ok && tab === "summary" && (
            <div className="space-y-4 font-mono text-[11px] text-pale">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {([["Gates (2-input)", result.gates ?? "–"], ["Logic depth", result.depth ?? "–"], ["Flip-flop bits", result.ffBits ?? 0],
                   ["RTL cells", result.numCells ?? 0], ["Latches", result.latches?.length ?? 0], ["FSMs", fsms.length]] as [string, number | string][]).map(([k, v]) => (
                  <div key={k} className="border border-rim/50 rounded p-2">
                    <div className="text-[9px] text-dim uppercase tracking-wider">{k}</div>
                    <div className={`text-[18px] font-bold ${k === "Latches" && v ? "text-warn" : "text-bright"}`}>{v}</div>
                  </div>
                ))}
              </div>

              {!!result.latches?.length && (
                <div className="border border-warn/40 bg-warn/5 rounded p-2 space-y-1">
                  <div className="text-warn font-bold">Latch inferred: {result.latches.join(", ")}</div>
                  <p className="text-[10px] text-ghost">
                    A combinational block (<code>always @(*)</code>) doesn&apos;t assign {result.latches.length > 1 ? "these signals" : "this signal"} on every path, so the
                    hardware has to remember the old value. Assign a default at the top of the block, or cover every <code>if</code>/<code>case</code> branch.
                  </p>
                </div>
              )}

              {!!result.warnings?.length && (
                <div className="space-y-1">
                  <div className="text-[9px] text-dim uppercase tracking-wider">Yosys warnings</div>
                  <ul className="space-y-1">
                    {result.warnings.map((w) => <li key={w} className="text-[10px] text-warn/90 break-words">{w}</li>)}
                  </ul>
                </div>
              )}

              <div className="space-y-1">
                <div className="text-[9px] text-dim uppercase tracking-wider">Cells by type</div>
                <table className="text-[10px]">
                  <tbody>
                    {Object.entries(result.cells ?? {}).sort((a, b) => b[1] - a[1]).map(([type, n]) => (
                      <tr key={type}><td className="pr-6 text-ghost">{type.replace(/^\$/, "")}</td><td className="text-bright text-right">{n}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {result?.ok && tab === "fpga" && (() => {
            const f = fpga[family];
            const r = f && f !== "loading" ? f : null;
            return (
              <div className="space-y-4 font-mono text-[11px] text-pale">
                <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="FPGA family">
                  {FAMILIES.map(([id, label]) => (
                    <button key={id} role="radio" aria-checked={family === id} onClick={() => setFamily(id)}
                      className={`px-3 py-1 rounded border text-[10px] ${family === id ? "border-phosphor/60 text-phosphor bg-phosphor/10" : "border-rim text-dim hover:text-ghost"}`}>
                      {label}
                    </button>
                  ))}
                </div>
                {f === "loading" && <p className="text-dim">Synthesizing for {FAMILIES.find(([id]) => id === family)![1]}… (a few seconds)</p>}
                {r && !r.ok && <pre className="text-[10px] whitespace-pre-wrap text-danger">{r.error}</pre>}
                {r?.ok && r.resources && r.capacity && (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {([
                        ["LUTs", r.resources.luts, r.capacity.luts],
                        ["Flip-flops", r.resources.ffs, r.capacity.ffs],
                        ["Block RAM", r.resources.bram, r.capacity.bram],
                        ["DSP blocks", r.resources.dsp, r.capacity.dsp],
                        ["Carry cells", r.resources.carry, null],
                        ...(family === "xc7" ? [["LUT-RAM cells", r.resources.lutram, null], ["I/O pins", r.resources.io, null]] : []),
                      ] as [string, number, number | null][]).map(([k, v, cap]) => (
                        <div key={k} className="border border-rim/50 rounded p-2">
                          <div className="text-[9px] text-dim uppercase tracking-wider">{k}</div>
                          <div className={`text-[18px] font-bold ${cap !== null && v > cap ? "text-danger" : "text-bright"}`}>{v}</div>
                          {cap !== null && (
                            <div className="text-[9px] text-dim">{cap > 0 ? `${((v / cap) * 100).toFixed(v / cap < 0.01 && v > 0 ? 2 : 0)}% of ${cap}` : v > 0 ? "none on this part" : "–"}</div>
                          )}
                        </div>
                      ))}
                    </div>
                    <p className="text-[10px] text-dim max-w-xl">
                      Percentages are of an <span className="text-ghost">{r.device}</span>. These are Yosys estimates before
                      place &amp; route; a vendor tool may pack logic differently.
                      {family === "ice40" && " iCE40 HX parts have no DSP blocks, so multipliers are built from LUTs."}
                    </p>
                    {r.pnr && (
                      <div className="space-y-3 border-t border-rim/50 pt-3">
                        <div className="text-[9px] text-dim uppercase tracking-wider">Place &amp; route (nextpnr)</div>
                        {!r.pnr.ok && <pre className="text-[10px] whitespace-pre-wrap text-danger">{r.pnr.error}</pre>}
                        {r.pnr.ok && (
                          <div className="flex flex-wrap gap-6">
                            <div className="space-y-3 min-w-[220px]">
                              <div>
                                <div className="text-[9px] text-dim uppercase tracking-wider">Max clock frequency</div>
                                {r.pnr.fmax?.length ? r.pnr.fmax.map((f) => (
                                  <div key={f.clock} className="text-[18px] font-bold text-bright">
                                    {f.mhz} MHz <span className="text-[10px] font-normal text-dim">on {f.clock}</span>
                                  </div>
                                )) : <div className="text-[11px] text-ghost">No clock: a purely combinational design.</div>}
                              </div>
                              <table className="text-[10px]">
                                <tbody>
                                  {Object.entries(r.pnr.utilization ?? {}).map(([k, u]) => (
                                    <tr key={k}><td className="pr-4 text-ghost">{UTIL_NAMES[k] ?? k}</td>
                                      <td className="text-bright text-right">{u.used} / {u.available}</td></tr>
                                  ))}
                                </tbody>
                              </table>
                              <p className="text-[10px] text-dim max-w-[260px]">
                                The slowest register-to-register path after routing sets the max frequency. Shorter logic
                                between flip-flops (fewer levels, pipelining) raises it.
                              </p>
                            </div>
                            {r.pnr.grid && r.pnr.tiles && (
                              <div className="flex-1 min-w-[280px] max-w-[560px]">
                                <Floorplan pnr={{ grid: r.pnr.grid, tiles: r.pnr.tiles, cells: r.pnr.cells, critical: r.pnr.critical }} />
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })()}

          {tab === "bitstream" && <BitstreamTab designCode={designCode} language={language ?? "verilog"} />}

          {result?.ok && tab === "schematic" && (
            result.schematicSvg
              ? <Diagram svg={result.schematicSvg} alt={`Schematic of ${result.top ?? "the design"}`} />
              : <p className="font-mono text-[11px] text-dim">{result.schematicLimit ?? "No schematic available."}</p>
          )}

          {result?.ok && tab === "fsm" && (
            fsms.length === 0 ? (
              <p className="font-mono text-[11px] text-dim max-w-xl">
                No state machine found. Yosys recognises a state register when its next value is chosen
                from constants in a <code>case</code>/<code>if</code> and the register doesn&apos;t drive an output port directly.
              </p>
            ) : (
              <div className="space-y-6">
                {fsms.map((f) => {
                  const names = new Map(f.states.map((s) => [s.id, stateName(s)]));
                  return (
                    <div key={`${f.module}.${f.stateReg}`} className="space-y-2">
                      <div className="font-mono text-[11px] text-bright">
                        <code>{f.stateReg}</code> in <code>{f.module}</code>: {f.states.length} states
                      </div>
                      {f.reset && (
                        <p className="font-mono text-[10px] text-dim">
                          Double border = reset state. <code>{f.reset}</code> returns to{" "}
                          {stateName(f.states.find((s) => s.reset) ?? f.states[0])} from every state (not drawn, to keep the diagram readable).
                        </p>
                      )}
                      {f.svg && <div className="h-[48vh]"><Diagram svg={f.svg} alt={`State diagram of ${f.stateReg}`} /></div>}
                      <details>
                        <summary className="font-mono text-[10px] text-dim cursor-pointer">Transition table</summary>
                        <table className="font-mono text-[10px] text-pale mt-1">
                          <tbody>
                            {f.transitions.map((t, i) => (
                              <tr key={i}>
                                <td className="pr-3">{names.get(t.from)}</td>
                                <td className="pr-3 text-dim">→</td>
                                <td className="pr-4">{names.get(t.to)}</td>
                                <td className="text-ghost">{t.conditions.map((c) => c || "always").join(" | ")}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </details>
                    </div>
                  );
                })}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
