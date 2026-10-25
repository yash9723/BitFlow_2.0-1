"use client";
/**
 * components/BitstreamTab.tsx — the Synth panel's "Bitstream" tab: build the design for a
 * real FPGA board in the browser (lib/synth/fpga-worker.ts: iCE40, ECP5, Gowin) and download
 * the bitstream, or export a Vivado / Quartus project (lib/synth/export-project.ts) for
 * Xilinx and Intel boards. Pins come from port names (lib/synth/boards.ts), the same rules
 * as the virtual board.
 */
import { useState } from "react";
import { BOARDS, buildsInBrowser, type BoardId, type Family, type PortInfo } from "@/lib/synth/boards";
import { bitstreamToolsLoaded, buildBitstreamInBrowser, exportPinsInBrowser } from "@/lib/synth/client";
import type { BitstreamResult, ExportPins } from "@/lib/synth/fpga";
import { downloadBlob as download } from "@/lib/api";
import ConstraintsEditor from "./ConstraintsEditor";
import Floorplan from "./Floorplan";

const GROUPS: [Family, string][] = [
  ["ice40", "Lattice iCE40 · built here"], ["ecp5", "Lattice ECP5 · built here"], ["gowin", "Gowin · built here"],
  ["xilinx", "Xilinx · Vivado project"], ["intel", "Intel · Quartus project"],
];
const BOARD_IDS = Object.keys(BOARDS) as BoardId[];

// Hand-edited pins, per board and top module, kept in this browser.
const pinsKey = (board: BoardId, top: string) => `bitflow_pins:${board}:${top}`;
const loadPins = (board: BoardId, top: string) => { try { return localStorage.getItem(pinsKey(board, top)); } catch { return null; } };
const savePins = (board: BoardId, top: string, text: string) => { try { localStorage.setItem(pinsKey(board, top), text); } catch { /* storage off */ } };

export default function BitstreamTab({ designCode, language }: { designCode: string; language: "verilog" | "vhdl" }) {
  const [board, setBoard] = useState<BoardId>("icestick");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<BitstreamResult | ExportPins | null>(null);
  /** Own pins: the constraints text being edited, with the design it was made for. */
  const [custom, setCustom] = useState<{ text: string; auto: string; top: string; ports: Record<string, PortInfo> } | null>(null);

  if (language === "vhdl") {
    return <p className="font-mono text-[11px] text-dim max-w-xl">Bitstreams are built from Verilog. VHDL designs aren&apos;t supported here yet.</p>;
  }

  const b = BOARDS[board];
  const here = buildsInBrowser(b);
  const build = async () => {
    setBusy(true);
    setResult(null);
    setResult(await (here ? buildBitstreamInBrowser : exportPinsInBrowser)(board, designCode, custom?.text));
    setBusy(false);
  };
  /** Start editing pins from the automatic ones (or what was saved for this board and design). */
  const editPins = async () => {
    setBusy(true);
    const r = await exportPinsInBrowser(board, designCode);
    setBusy(false);
    if (!r.ok) return setResult(r);
    setCustom({ text: loadPins(board, r.top) ?? r.constraints, auto: r.constraints, top: r.top, ports: r.ports });
  };
  const editText = (text: string) => {
    if (!custom) return;
    setCustom({ ...custom, text });
    savePins(board, custom.top, text);
  };
  const exportZip = async (r: Extract<ExportPins, { ok: true }>) => {
    const { exportProject } = await import("@/lib/synth/export-project");
    const clock = r.assignments.find((a) => a.kind === "clock")?.port ?? null;
    download(`${r.top}-${board}.zip`, await exportProject(board, r.top, designCode, r.constraints, clock), "application/zip");
  };
  const bitstream = result?.ok && "bin" in result ? result : null;
  const exported = result?.ok && !("bin" in result) ? result : null;

  return (
    <div className="space-y-4 font-mono text-[11px] text-pale">
      <p className="text-[10px] text-dim max-w-2xl">
        Build your design for a real FPGA board. iCE40, ECP5 and Gowin boards are built right here in your browser
        (Yosys, nextpnr and the board&apos;s packer); Xilinx and Intel boards get a project for Vivado or Quartus.
        Pins are assigned from port names: <span className="text-ghost">clk</span> to the board&apos;s clock,
        {" "}<span className="text-ghost">led*</span> to LEDs, <span className="text-ghost">rst*/btn*</span> to buttons,
        {" "}<span className="text-ghost">sw*</span> to switches, <span className="text-ghost">tx/rx</span> to the USB serial port,
        everything else to header pins.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-[10px] text-dim">
          Board
          <select value={board} onChange={(e) => { setBoard(e.target.value as BoardId); setResult(null); setCustom(null); }}
            className="bg-void border border-rim rounded px-2 py-1 text-[11px] text-pale focus:border-phosphor/60 outline-none">
            {GROUPS.map(([family, label]) => (
              <optgroup key={family} label={label}>
                {BOARD_IDS.filter((id) => BOARDS[id].family === family).map((id) => <option key={id} value={id}>{BOARDS[id].name}</option>)}
              </optgroup>
            ))}
          </select>
        </label>
        <button onClick={build} disabled={busy}
          className="px-3 py-1 rounded border border-info/60 text-info hover:bg-info/10 disabled:opacity-40 text-[10px]">
          {busy ? (here ? "Building…" : "Preparing…") : here ? "Build bitstream" : `Export ${b.family === "xilinx" ? "Vivado" : "Quartus"} project`}
        </button>
        <span className="text-[10px] text-dim">{b.clockMhz} MHz clock</span>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[10px]" role="radiogroup" aria-label="Pins">
        <span className="text-dim">Pins</span>
        <button role="radio" aria-checked={!custom} onClick={() => setCustom(null)} disabled={busy}
          className={`px-2 py-0.5 rounded border ${!custom ? "border-phosphor/60 text-phosphor bg-phosphor/10" : "border-rim text-dim hover:text-ghost"}`}>
          From port names
        </button>
        <button role="radio" aria-checked={!!custom} onClick={() => !custom && editPins()} disabled={busy}
          className={`px-2 py-0.5 rounded border ${custom ? "border-phosphor/60 text-phosphor bg-phosphor/10" : "border-rim text-dim hover:text-ghost"}`}>
          My own pins…
        </button>
        {custom && custom.text !== custom.auto && (
          <button onClick={() => editText(custom.auto)} className="text-dim hover:text-ghost underline underline-offset-2">Reset to the automatic pins</button>
        )}
      </div>
      {custom && <ConstraintsEditor boardId={board} text={custom.text} ports={custom.ports} onChange={editText} />}
      {busy && (
        <p className="text-dim text-[10px]">
          {bitstreamToolsLoaded(board) ? (here ? "Synthesizing, placing and routing…" : "Reading the design's ports…")
            : here ? `First build for this board: downloading the FPGA tools (about ${b.downloadMb} MB, cached afterwards)…`
            : "Downloading Yosys to read the design's ports (about 6 MB, cached afterwards)…"}
        </p>
      )}

      {result && !result.ok && <pre className="text-[10px] whitespace-pre-wrap text-danger">{result.error}</pre>}
      {result?.assignments && result.assignments.length > 0 && (
        <table className="text-[10px]">
          <thead className="text-dim text-left"><tr><th className="pr-4 font-normal">Port</th><th className="pr-4 font-normal">FPGA pin</th><th className="font-normal">On the board</th></tr></thead>
          <tbody>
            {result.assignments.map((a) => (
              <tr key={a.port}><td className="pr-4 text-ghost">{a.port}</td><td className="pr-4 text-bright">{a.pin}</td><td className="text-dim">{a.where}</td></tr>
            ))}
          </tbody>
        </table>
      )}
      {result?.ok && result.notes.map((n) => <p key={n} className="text-[10px] text-warn max-w-2xl">{n}</p>)}

      {bitstream && (
        <div className="space-y-3">
          <p className="text-[10px] text-ghost">
            {bitstream.fmaxMhz !== null
              ? <>Max clock after routing: <span className={bitstream.fmaxMhz >= b.clockMhz ? "text-phosphor" : "text-danger"}>{bitstream.fmaxMhz} MHz</span>
                  {bitstream.fmaxMhz >= b.clockMhz ? ` (runs at the board's ${b.clockMhz} MHz)` : ` - too slow for the board's ${b.clockMhz} MHz clock; shorten the logic between registers`}</>
              : "No clock: a combinational design."}
            {Object.keys(bitstream.utilization).length > 0 && <>{" · "}{Object.entries(bitstream.utilization).map(([k, u]) => `${k} ${u.used}/${u.available}`).join(", ")}</>}
          </p>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => download(bitstream.file, bitstream.bin as BlobPart, "application/octet-stream")}
              className="px-3 py-1.5 rounded border border-phosphor/60 text-phosphor hover:bg-phosphor/10 text-[10px]">
              Download {bitstream.file} ({Math.round(bitstream.bin.length / 1024)} KB)
            </button>
            <button onClick={() => download(`${bitstream.top}.${bitstream.format}`, bitstream.constraints, "text/plain")}
              className="px-3 py-1.5 rounded border border-rim text-ghost hover:text-bright text-[10px]">Download pins (.{bitstream.format})</button>
          </div>
          <ProgramHelp boardId={board} file={bitstream.file} />
          {bitstream.pnr && (
            <div className="space-y-1 max-w-xl">
              <div className="text-[9px] text-dim uppercase tracking-wider">Where it sits on the chip</div>
              <Floorplan pnr={bitstream.pnr} />
            </div>
          )}
        </div>
      )}

      {exported && (
        <div className="space-y-2 max-w-2xl">
          <button onClick={() => exportZip(exported)}
            className="px-3 py-1.5 rounded border border-phosphor/60 text-phosphor hover:bg-phosphor/10 text-[10px]">
            Download {exported.top}-{board}.zip
          </button>
          <p className="text-[10px] text-dim">
            {b.family === "xilinx"
              ? <>The design, its pins (.xdc) and Vivado scripts: run <span className="text-ghost">vivado -mode batch -source build.tcl</span>, then <span className="text-ghost">program.tcl</span> to load the board.</>
              : <>The design, a Quartus project with its pins (.qsf), a clock constraint (.sdc) and build / program scripts for Quartus Prime Lite.</>}
          </p>
        </div>
      )}
    </div>
  );
}

/** How to load the bitstream onto the board with the open-source tools. */
function ProgramHelp({ boardId, file }: { boardId: BoardId; file: string }) {
  const b = BOARDS[boardId];
  const cmd = `openFPGALoader -b ${b.loader} ${file}`;
  return (
    <div className="text-[10px] text-dim space-y-1 max-w-2xl">
      <p>To program the board, install <span className="text-ghost">openFPGALoader</span> (part of the open-source OSS CAD Suite), plug the board in over USB and run:</p>
      <pre className="bg-void border border-rim rounded px-2 py-1 text-pale">{cmd}</pre>
      {b.family === "ice40"
        ? <p>iCE40 boards are programmed through their flash, so the design stays after power-off. <span className="text-ghost">iceprog {file}</span> works too.</p>
        : boardId === "orangecrab-25f"
          ? <p>First hold the button while plugging the OrangeCrab in, so it starts its bootloader; the design is written to its flash.</p>
          : <p>That loads it until power-off; add <span className="text-ghost">-f</span> to write the flash so it stays.</p>}
      {boardId !== "orangecrab-25f" && <p>On Windows, first give the board&apos;s USB &quot;Interface 0&quot; the WinUSB driver with Zadig.</p>}
    </div>
  );
}
