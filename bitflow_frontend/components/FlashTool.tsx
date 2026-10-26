"use client";
/**
 * components/FlashTool.tsx — the /flash page: program a real FPGA board over USB from the
 * browser (lib/flash.ts), with a bitstream from the Bitstream tab (lib/bitstream-handoff.ts)
 * or a file picked here.
 */
import { useEffect, useRef, useState } from "react";
import { BOARDS, type BoardId } from "@/lib/synth/boards";
import { DRIVER_HINT, FLASH, flash, flashArgs, requestBoard, webUsbAvailable, type FlashMode } from "@/lib/flash";
import { takeBitstream } from "@/lib/bitstream-handoff";

const BOARD_IDS = (Object.keys(FLASH) as BoardId[]);
type Status = { kind: "idle" } | { kind: "busy"; step: string } | { kind: "done" } | { kind: "failed"; error: string };

export default function FlashTool() {
  const [board, setBoard] = useState<BoardId>("icestick");
  const [file, setFile] = useState<{ name: string; bytes: Uint8Array; fromSandbox?: boolean } | null>(null);
  const [mode, setMode] = useState<FlashMode>("flash");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [progress, setProgress] = useState<{ label: string; percent: number } | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [usb, setUsb] = useState(true);
  const logRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    setUsb(webUsbAvailable());
    takeBitstream().then((h) => {
      if (!h || !FLASH[h.board]) return;
      setBoard(h.board);
      setMode(FLASH[h.board]!.modes[0]);
      setFile({ name: h.name, bytes: h.bytes, fromSandbox: true });
    });
  }, []);
  useEffect(() => { logRef.current?.scrollTo(0, logRef.current.scrollHeight); }, [log]);

  const target = FLASH[board]!;
  const b = BOARDS[board];
  const wrongType = file && !target.files.some((ext) => file.name.toLowerCase().endsWith(ext));
  const command = `openFPGALoader ${flashArgs(board, mode, file?.name ?? `top${target.files[0]}`).join(" ")}`;

  const pickBoard = (id: BoardId) => { setBoard(id); setMode(FLASH[id]!.modes[0]); setStatus({ kind: "idle" }); };
  const pickFile = async (f: File | undefined) => {
    if (!f) return;
    setFile({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) });
    setStatus({ kind: "idle" });
  };

  const program = async () => {
    if (!file) return;
    setLog([]);
    setProgress(null);
    let device: string | null;
    try {
      device = await requestBoard(board);   // first: the chooser needs this click
    } catch (err) {
      const message = (err as Error).message;
      return setStatus({ kind: "failed", error: message === DRIVER_HINT ? message : `The browser couldn't open USB devices: ${message}` });
    }
    if (!device) return setStatus({ kind: "idle" });
    setStatus({ kind: "busy", step: `Programming the ${b.name} (${device})…` });
    const r = await flash(board, mode, file, (line) => setLog((l) => [...l.slice(-300), line]), setProgress);
    setStatus(r.ok ? { kind: "done" } : { kind: "failed", error: r.error ?? "Programming failed." });
  };

  return (
    <div className="space-y-6 font-mono text-[12px] text-pale">
      {!usb && (
        <div className="rounded border border-warn/50 bg-warn/5 p-3 text-[12px] text-warn">
          Programming over USB needs Chrome, Edge or another Chromium browser on a computer (WebUSB). In this browser, run the command below instead.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-[10px] text-dim uppercase tracking-wider">Board</span>
          <select value={board} onChange={(e) => pickBoard(e.target.value as BoardId)}
            className="w-full bg-void border border-rim rounded px-2 py-1.5 text-[12px] text-pale focus:border-phosphor/60 outline-none">
            {BOARD_IDS.map((id) => <option key={id} value={id}>{BOARDS[id].name}</option>)}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-[10px] text-dim uppercase tracking-wider">Bitstream ({target.files.join(", ")})</span>
          <input type="file" accept={target.files.join(",")} onChange={(e) => pickFile(e.target.files?.[0])}
            className="block w-full text-[11px] text-dim file:mr-3 file:px-3 file:py-1.5 file:rounded file:border file:border-rim file:bg-void file:text-ghost hover:file:text-bright" />
        </label>
      </div>

      {file && (
        <p className="text-[11px] text-ghost">
          {file.fromSandbox ? "From the Bitstream tab: " : ""}<span className="text-bright">{file.name}</span> ({Math.max(1, Math.round(file.bytes.length / 1024))} KB)
          {wrongType && <span className="text-warn"> — the {b.name} takes {target.files.join(" or ")} files; check you picked the right board.</span>}
        </p>
      )}

      {target.modes.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 text-[11px]" role="radiogroup" aria-label="Where to program">
          {target.modes.map((m) => (
            <button key={m} role="radio" aria-checked={mode === m} onClick={() => setMode(m)}
              className={`px-3 py-1 rounded border ${mode === m ? "border-phosphor/60 text-phosphor bg-phosphor/10" : "border-rim text-dim hover:text-ghost"}`}>
              {m === "sram" ? "Until power-off (fast)" : "Keep it (write the flash)"}
            </button>
          ))}
        </div>
      )}
      {target.modes.length === 1 && <p className="text-[11px] text-dim">This board is programmed through its flash, so the design stays after power-off.</p>}
      {target.prepare && <p className="text-[11px] text-warn">{target.prepare}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <button onClick={program} disabled={!file || !usb || status.kind === "busy"}
          className="px-4 py-2 rounded border border-phosphor/60 text-phosphor hover:bg-phosphor/10 disabled:opacity-40 text-[12px]">
          {status.kind === "busy" ? "Programming…" : "Connect the board and program it"}
        </button>
        {!file && <span className="text-[11px] text-dim">Pick a bitstream first, or build one in the Sandbox&apos;s Bitstream tab.</span>}
      </div>

      {(status.kind === "busy" || progress) && (
        <div className="space-y-1" aria-live="polite">
          <div className="text-[11px] text-ghost">{status.kind === "busy" ? status.step : ""} {progress && `${progress.label} ${progress.percent.toFixed(0)}%`}</div>
          <div className="h-1.5 rounded bg-rim/50 overflow-hidden">
            <div className="h-full bg-phosphor transition-[width] duration-200" style={{ width: `${progress?.percent ?? 2}%` }} />
          </div>
        </div>
      )}
      {status.kind === "done" && <p className="text-[12px] text-phosphor" role="status">Done: the {b.name} is running your design.</p>}
      {status.kind === "failed" && (
        <div className="space-y-1 text-[11px]" role="alert">
          <p className="text-danger">{status.error}</p>
          <p className="text-dim">Check the board is plugged in, no other program (Vivado, Gowin, another tab) has it open, and the USB driver below is set up.</p>
        </div>
      )}
      {log.length > 0 && (
        <pre ref={logRef} className="max-h-56 overflow-auto bg-void border border-rim rounded p-2 text-[10px] text-dim whitespace-pre-wrap">{log.join("\n")}</pre>
      )}

      <details className="text-[11px] text-dim space-y-2">
        <summary className="cursor-pointer text-ghost">USB drivers and the command line</summary>
        <div className="space-y-2 pt-2 max-w-3xl">
          <p><span className="text-ghost">Windows:</span> the browser needs the WinUSB driver on the board&apos;s programming interface. Run Zadig, choose Options → List all devices, pick the board&apos;s &quot;Interface 0&quot; (USB ID ending in 00; Windows calls it &quot;USB Serial Converter A&quot;) and install WinUSB. Leave Interface 1, the serial port, alone: Zadig may label it &quot;JTAG Debugger&quot;, but it isn&apos;t the one.</p>
          <p><span className="text-ghost">Linux:</span> let your user open the board, e.g. <span className="text-pale">/etc/udev/rules.d/99-fpga.rules</span> with <span className="text-pale">SUBSYSTEM==&quot;usb&quot;, ATTRS{"{"}idVendor{"}"}==&quot;0403&quot;, MODE=&quot;0666&quot;</span> (and 1209 for the OrangeCrab), then replug it.</p>
          <p><span className="text-ghost">macOS:</span> nothing to install; close other tools that use the board.</p>
          <p>The same thing from a terminal, with openFPGALoader from the OSS CAD Suite:</p>
          <pre className="bg-void border border-rim rounded px-2 py-1 text-pale">{command}</pre>
        </div>
      </details>
    </div>
  );
}
