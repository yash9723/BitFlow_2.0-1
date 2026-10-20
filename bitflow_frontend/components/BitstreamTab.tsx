"use client";
/**
 * components/BitstreamTab.tsx — the Synth panel's "Bitstream" tab: build the
 * design for a real iCE40 board in the browser (lib/synth/fpga-worker.ts) and
 * download the .bin to flash with iceprog. Pins come from port names
 * (lib/synth/boards.ts), the same rules as the virtual board.
 */
import { useState } from "react";
import { BOARDS, type BoardId } from "@/lib/synth/boards";
import { bitstreamToolsLoaded, buildBitstreamInBrowser } from "@/lib/synth/client";
import type { BitstreamResult } from "@/lib/synth/fpga";

function download(name: string, data: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function BitstreamTab({ designCode, language }: { designCode: string; language: "verilog" | "vhdl" }) {
  const [board, setBoard] = useState<BoardId>("icestick");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<BitstreamResult | null>(null);

  if (language === "vhdl") {
    return <p className="font-mono text-[11px] text-dim max-w-xl">Bitstreams are built from Verilog. VHDL designs aren&apos;t supported here yet.</p>;
  }

  const build = async () => {
    setBusy(true);
    setResult(null);
    setResult(await buildBitstreamInBrowser(board, designCode));
    setBusy(false);
  };
  const b = BOARDS[board];

  return (
    <div className="space-y-4 font-mono text-[11px] text-pale">
      <p className="text-[10px] text-dim max-w-2xl">
        Build your design for a real FPGA board and download the bitstream. Everything runs in your browser
        (Yosys, nextpnr, icepack). Pins are assigned from port names: <span className="text-ghost">clk</span> to the
        12 MHz clock, <span className="text-ghost">led*</span> to LEDs, <span className="text-ghost">rst*/btn*</span> to buttons,
        <span className="text-ghost"> tx/rx</span> to the USB serial port, everything else to PMOD pins.
      </p>

      <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Board">
        {(Object.keys(BOARDS) as BoardId[]).map((id) => (
          <button key={id} role="radio" aria-checked={board === id} onClick={() => { setBoard(id); setResult(null); }}
            className={`px-3 py-1 rounded border text-[10px] ${board === id ? "border-phosphor/60 text-phosphor bg-phosphor/10" : "border-rim text-dim hover:text-ghost"}`}>
            {BOARDS[id].name}
          </button>
        ))}
        <button onClick={build} disabled={busy}
          className="ml-2 px-3 py-1 rounded border border-info/60 text-info hover:bg-info/10 disabled:opacity-40 text-[10px]">
          {busy ? "Building…" : "Build bitstream"}
        </button>
      </div>
      {busy && (
        <p className="text-dim text-[10px]">
          {bitstreamToolsLoaded(board) ? "Synthesizing, placing and routing…"
            : `First build for this board: downloading the FPGA tools (about ${b.downloadMb} MB, cached afterwards)…`}
        </p>
      )}

      {result && !result.ok && (
        <pre className="text-[10px] whitespace-pre-wrap text-danger">{result.error}</pre>
      )}
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
      {result?.ok && (
        <div className="space-y-3">
          {result.notes.map((n) => <p key={n} className="text-[10px] text-warn">{n}</p>)}
          <p className="text-[10px] text-ghost">
            {result.fmaxMhz !== null
              ? <>Max clock after routing: <span className={result.fmaxMhz >= 12 ? "text-phosphor" : "text-danger"}>{result.fmaxMhz} MHz</span>
                  {result.fmaxMhz >= 12 ? " (runs at the board's 12 MHz)" : " - too slow for the board's 12 MHz clock; shorten the logic between registers"}</>
              : "No clock: a combinational design."}
            {" · "}{Object.entries(result.utilization).map(([k, u]) => `${k} ${u.used}/${u.available}`).join(", ")}
          </p>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => download(`${result.top}.bin`, result.bin as BlobPart, "application/octet-stream")}
              className="px-3 py-1.5 rounded border border-phosphor/60 text-phosphor hover:bg-phosphor/10 text-[10px]">
              Download {result.top}.bin ({Math.round(result.bin.length / 1024)} KB)
            </button>
            <button onClick={() => download(`${result.top}.pcf`, result.pcf, "text/plain")}
              className="px-3 py-1.5 rounded border border-rim text-ghost hover:text-bright text-[10px]">Download pins (.pcf)</button>
          </div>
          <div className="text-[10px] text-dim space-y-1 max-w-2xl">
            <p>To program the board, install <span className="text-ghost">iceprog</span> (part of the open-source OSS CAD Suite), plug the board in over USB and run:</p>
            <pre className="bg-void border border-rim rounded px-2 py-1 text-pale">iceprog {result.top}.bin</pre>
            <p>On Windows, first give the board&apos;s &quot;Interface 0&quot; the WinUSB driver with Zadig. A UART at 115200 baud from the 12 MHz clock needs 104 clock cycles per bit.</p>
          </div>
        </div>
      )}
    </div>
  );
}
