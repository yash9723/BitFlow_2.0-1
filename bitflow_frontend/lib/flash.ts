/**
 * lib/flash.ts — program a real board from the browser over WebUSB, with YoWASP's
 * openFPGALoader (vendored by scripts/vendor-openfpgaloader.mjs). Runs on the /flash page,
 * which is cross-origin isolated so the loader's threads can share memory.
 * Self-check: scripts/flash.check.ts.
 */
import { BOARDS, type BoardId } from "./synth/boards";

export const LOADER = "/vendor/openfpgaloader-1.2.0-10.272/openFPGALoader.mjs";

export type FlashMode = "sram" | "flash";
interface UsbFilter { vendorId: number; productId?: number }
export interface FlashTarget {
  usb: UsbFilter[];
  /** sram: until power-off; flash: kept. The first is the default. */
  modes: FlashMode[];
  /** Bitstream file types the board takes. */
  files: string[];
  /** What to do with the board before connecting it. */
  prepare?: string;
}

const FT2232 = { vendorId: 0x0403, productId: 0x6010 };   // FTDI FT2232H, and the Tang Nanos' BL702/BL616 that act as one
const ice40: FlashTarget = { usb: [FT2232], modes: ["flash"], files: [".bin"] };
const ulx3s: FlashTarget = { usb: [{ vendorId: 0x0403, productId: 0x6015 }], modes: ["sram", "flash"], files: [".bit"] };
const tang: FlashTarget = { usb: [FT2232], modes: ["sram", "flash"], files: [".fs"] };
const digilent: FlashTarget = { usb: [FT2232], modes: ["sram"], files: [".bit"] };

/** Boards that can be programmed from here; the DE10-Lite's USB-Blaster needs Quartus. */
export const FLASH: Partial<Record<BoardId, FlashTarget>> = {
  icestick: ice40, icebreaker: ice40,
  "ulx3s-12f": ulx3s, "ulx3s-25f": ulx3s, "ulx3s-45f": ulx3s, "ulx3s-85f": ulx3s,
  "orangecrab-25f": { usb: [{ vendorId: 0x1209, productId: 0x5af0 }], modes: ["flash"], files: [".bit"],
    prepare: "Hold the button down while you plug the OrangeCrab in: it starts its bootloader (the LED fades in and out)." },
  tangnano9k: tang, tangnano20k: tang,
  basys3: digilent, "arty-a7-35t": digilent, "nexys-a7-100t": digilent,
};

/** openFPGALoader's arguments. iCE40 boards and the OrangeCrab always write their flash. */
export function flashArgs(board: BoardId, mode: FlashMode, file: string): string[] {
  const target = FLASH[board];
  if (!target) throw new Error(`The ${BOARDS[board].name} can't be programmed from the browser.`);
  const writeFlash = mode === "flash" && target.modes.includes("sram");
  return ["-b", BOARDS[board].loader, ...(writeFlash ? ["-f"] : []), file];
}

/** A progress line, e.g. "Load SRAM: [=====     ] 45.78%"; null if the line isn't one. */
export function parseProgress(line: string): { label: string; percent: number } | null {
  const m = line.match(/([A-Za-z][\w ]*?)\s*:?\s*\[[=> -]*\]\s*(\d{1,3}(?:\.\d+)?)\s*%/);
  return m ? { label: m[1].trim(), percent: Math.min(100, Number(m[2])) } : null;
}

type Usb = { requestDevice(o: { filters: UsbFilter[] }): Promise<{ productName?: string }> };
const usb = (): Usb | undefined => (typeof navigator === "undefined" ? undefined : (navigator as unknown as { usb?: Usb }).usb);
export const webUsbAvailable = () => !!usb();

/**
 * Ask the user to pick the board (the browser's device chooser). Call it straight from a click:
 * browsers only show the chooser for a user gesture. Resolves to the device's name, or null if
 * they closed the chooser.
 */
export async function requestBoard(board: BoardId): Promise<string | null> {
  try {
    const device = await usb()!.requestDevice({ filters: FLASH[board]!.usb });
    return device.productName ?? "USB device";
  } catch (err) {
    if ((err as Error)?.name === "NotFoundError") return null;   // chooser closed
    throw err;
  }
}

/** Program the board; log lines and progress stream out as the loader runs. Never throws. */
export async function flash(board: BoardId, mode: FlashMode, file: { name: string; bytes: Uint8Array },
  onLine: (line: string) => void, onProgress: (p: { label: string; percent: number }) => void): Promise<{ ok: boolean; error?: string }> {
  let pending = "";
  const sink = (b: Uint8Array | null) => {
    if (!b) return;
    pending += new TextDecoder().decode(b);
    const parts = pending.split(/[\r\n]/);
    pending = parts.pop() ?? "";
    for (const line of [...parts, pending]) {
      const p = parseProgress(line);
      if (p) onProgress(p);
    }
    for (const line of parts) if (line.trim() && !parseProgress(line)) onLine(line);
  };
  try {
    const { runOpenFPGALoader } = await import(/* webpackIgnore: true */ LOADER);
    await runOpenFPGALoader(flashArgs(board, mode, file.name), { [file.name]: file.bytes }, { stdout: sink, stderr: sink });
    if (pending.trim() && !parseProgress(pending)) onLine(pending);
    return { ok: true };
  } catch (err) {
    if (pending.trim()) onLine(pending);
    const code = (err as { code?: number })?.code;
    return { ok: false, error: typeof code === "number" ? `openFPGALoader stopped (exit code ${code}).` : String(err) };
  }
}
