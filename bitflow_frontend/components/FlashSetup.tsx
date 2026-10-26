"use client";
/**
 * components/FlashSetup.tsx — "Set up this computer" on the /flash page, for the visitor's OS.
 * Windows needs WinUSB on FT2232 boards' programming interface before the browser can use it:
 * BitFlow USB Setup (one click), a Zadig preset, or the vendor's programmer with no driver change.
 * Other systems need nothing (Linux: a udev rule).
 */
import { BOARDS, type BoardId } from "@/lib/synth/boards";
import { FLASH, USB_SETUP_URL, ZADIG_PRESET, needsWinUsbOnWindows, type FlashMode, type Os } from "@/lib/flash";
import { downloadBlob } from "@/lib/api";

const OS_NAME: Record<Os, string> = { windows: "Windows", mac: "macOS", linux: "Linux", chromeos: "ChromeOS", android: "Android", other: "this system" };
const card = "rounded border border-rim bg-void/60 p-3 space-y-2";
const link = "inline-block px-3 py-1.5 rounded border text-[11px]";

interface Props {
  board: BoardId;
  mode: FlashMode;
  file: { name: string; bytes: Uint8Array } | null;
  os: Os | null;
  command: string;
  /** Highlight it: programming just failed for want of the driver. */
  attention?: boolean;
}

export default function FlashSetup({ board, mode, file, os, command, attention }: Props) {
  const b = BOARDS[board];
  const vendor = FLASH[board]?.vendor;
  const winSetup = os === "windows" && needsWinUsbOnWindows(board);
  const fileName = file?.name ?? `top${FLASH[board]?.files[0] ?? ".bit"}`;

  return (
    <section id="setup" aria-labelledby="setup-title"
      className={`space-y-3 text-[11px] text-dim max-w-3xl rounded-lg ${attention ? "ring-1 ring-warn/60 p-3 -m-3" : ""}`}>
      <h2 id="setup-title" className="text-[12px] text-bright font-semibold">Set up this computer</h2>

      {winSetup ? (
        <>
          <p>Windows needs a one-time driver setup before the browser can program the {b.name}. Pick one:</p>

          <div className={card}>
            <p className="text-ghost"><span className="text-phosphor">1. One-click setup</span> (recommended)</p>
            <ol className="list-decimal pl-5 space-y-1">
              <li>Plug the board in and download <span className="text-pale">BitFlow USB Setup</span>.</li>
              <li>Right-click the zip → Properties → tick <span className="text-pale">Unblock</span> → OK. Then unzip it, double-click <span className="text-pale">setup.cmd</span> and click <span className="text-pale">Yes</span>. If Windows says &quot;Windows protected your PC&quot;, click More info → Run anyway.</li>
              <li>Come back here and program the board. You only do this once per computer.</li>
            </ol>
            <a href={USB_SETUP_URL} className={`${link} border-phosphor/60 text-phosphor hover:bg-phosphor/10`}>Download BitFlow USB Setup</a>
            <p>It installs Windows&apos; own WinUSB driver on the board&apos;s programming interface only; the serial port keeps its driver. <span className="text-pale">undo.cmd</span> in the same folder puts the original driver back.</p>
            <p className="text-warn">Blocked with no &quot;Run anyway&quot; (Smart App Control, or a school or company PC)? Windows only allows signed programs there: use option 2 (Zadig is signed) or option 3 (no driver change at all).</p>
          </div>

          <div className={card}>
            <p className="text-ghost"><span className="text-phosphor">2. Zadig with the BitFlow preset</span> (when Windows blocks option 1)</p>
            <p>Download <a href="https://zadig.akeo.ie/" target="_blank" rel="noopener noreferrer" className="text-info hover:underline">Zadig</a> and the preset. In Zadig choose Device → Load Preset Device, pick the preset, keep WinUSB and click Install Driver. It selects the right interface for you, and Zadig is signed, so Windows security allows it.</p>
            <a href={ZADIG_PRESET} download className={`${link} border-rim text-ghost hover:text-bright`}>Download the Zadig preset</a>
          </div>

          {vendor && (
            <div className={card}>
              <p className="text-ghost"><span className="text-phosphor">3. No driver change: {vendor.name}</span></p>
              <p>Works with the driver Windows already has, so it also works on lab PCs where you can&apos;t install drivers. Install <a href={vendor.url} target="_blank" rel="noopener noreferrer" className="text-info hover:underline">{vendor.name}</a>, download your bitstream, and run this in the folder you saved it to:</p>
              <pre className="bg-void border border-rim rounded px-2 py-1 text-pale whitespace-pre-wrap">{vendor.command(mode, fileName)}</pre>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => navigator.clipboard?.writeText(vendor.command(mode, fileName))} className={`${link} border-rim text-ghost hover:text-bright`}>Copy command</button>
                {file && (
                  <button onClick={() => downloadBlob(file.name, new Uint8Array(file.bytes), "application/octet-stream")} className={`${link} border-rim text-ghost hover:text-bright`}>Download {file.name}</button>
                )}
              </div>
            </div>
          )}

          <p>Or use a Mac, a Chromebook, a Linux PC, or Chrome on an Android phone with a USB-OTG adapter: none of them need any setup.</p>
        </>
      ) : os === "windows" ? (
        <p>Windows: the browser needs the WinUSB driver on the {b.name}&apos;s programming interface. In Zadig (Options → List All Devices) pick the board and install WinUSB.</p>
      ) : os === "linux" ? (
        <p>Linux: let your user open the board, e.g. <span className="text-pale">/etc/udev/rules.d/99-fpga.rules</span> with <span className="text-pale">SUBSYSTEM==&quot;usb&quot;, ATTRS{"{"}idVendor{"}"}==&quot;0403&quot;, MODE=&quot;0666&quot;</span> (and 1209 for the OrangeCrab), then replug it.</p>
      ) : os ? (
        <p>{OS_NAME[os]}: nothing to install{os === "android" ? "; plug the board in with a USB-OTG adapter" : ""}. Close other tools that use the board.</p>
      ) : null}

      <details>
        <summary className="cursor-pointer text-ghost">The same thing from a terminal</summary>
        <p className="pt-2">With openFPGALoader from the OSS CAD Suite:</p>
        <pre className="bg-void border border-rim rounded px-2 py-1 text-pale">{command}</pre>
      </details>
    </section>
  );
}
