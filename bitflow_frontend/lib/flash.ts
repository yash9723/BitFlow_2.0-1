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
  /** The vendor's own programmer, which works with the stock driver (no WinUSB setup on Windows). */
  vendor?: { name: string; url: string; command: (mode: FlashMode, file: string) => string };
}

const FT2232 = { vendorId: 0x0403, productId: 0x6010 };   // FTDI FT2232H, and the Tang Nanos' BL702/BL616 that act as one
const ice40: FlashTarget = { usb: [FT2232], modes: ["flash"], files: [".bin"] };
const ulx3s: FlashTarget = { usb: [{ vendorId: 0x0403, productId: 0x6015 }], modes: ["sram", "flash"], files: [".bit"] };
const digilent: FlashTarget = { usb: [FT2232], modes: ["sram"], files: [".bit"] };
/** Gowin Programmer's command line (SUG502E): --run 2 = SRAM program; 5 = embedded flash; 36 = external flash. */
const tang = (device: string, flashRun: string): FlashTarget => ({
  usb: [FT2232], modes: ["sram", "flash"], files: [".fs"],
  vendor: {
    name: "Gowin Programmer", url: "https://www.gowinsemi.com/en/support/download_eda/",
    command: (mode, file) => `programmer_cli --device ${device} --run ${mode === "sram" ? "2" : flashRun} --fsFile ${file} --cable-index 1`,
  },
});

/** BitFlow USB Setup for Windows (tools/windows-usb-setup, built by .github/workflows/usb-setup.yml). */
export const USB_SETUP_URL = "https://github.com/yash9723/BitFlow_2.0-1/releases/download/usb-setup-v1/BitFlow-USB-Setup.zip";
/** Zadig preset (Device → Load Preset Device) for the same interface. */
export const ZADIG_PRESET = "/drivers/bitflow-ft2232-interface0.cfg";

export type Os = "windows" | "mac" | "linux" | "chromeos" | "android" | "other";
export function detectOs(userAgent: string): Os {
  if (/Android/i.test(userAgent)) return "android";
  if (/CrOS/.test(userAgent)) return "chromeos";
  if (/Windows/i.test(userAgent)) return "windows";
  if (/Mac OS X|Macintosh/.test(userAgent)) return "mac";
  if (/Linux/i.test(userAgent)) return "linux";
  return "other";
}
/** Windows only lets the browser use these boards after a one-time WinUSB driver setup. */
export const needsWinUsbOnWindows = (board: BoardId) => FLASH[board]?.usb[0] === FT2232;

/** Boards that can be programmed from here; the DE10-Lite's USB-Blaster needs Quartus. */
export const FLASH: Partial<Record<BoardId, FlashTarget>> = {
  icestick: ice40, icebreaker: ice40,
  "ulx3s-12f": ulx3s, "ulx3s-25f": ulx3s, "ulx3s-45f": ulx3s, "ulx3s-85f": ulx3s,
  "orangecrab-25f": { usb: [{ vendorId: 0x1209, productId: 0x5af0 }], modes: ["flash"], files: [".bit"],
    prepare: "Hold the button down while you plug the OrangeCrab in: it starts its bootloader (the LED fades in and out)." },
  tangnano9k: tang("GW1NR-9C", "5"), tangnano20k: tang("GW2AR-18C", "36 --spiaddr 0x000000"),
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

interface Device {
  productName?: string; opened?: boolean;
  open(): Promise<void>; close(): Promise<void>; claimInterface(n: number): Promise<void>; releaseInterface(n: number): Promise<void>;
}
type Usb = { requestDevice(o: { filters: UsbFilter[] }): Promise<Device> };

/** The interface openFPGALoader programs through: the FTDI chip's first ("A"). */
const JTAG_INTERFACE = 0;
export const DRIVER_HINT =
  `The browser can't open the board's programming interface yet: on Windows it needs a one-time driver setup. ` +
  `Follow "Set up this computer" below (one download, one click), or program it with the vendor's tool instead.`;

/** Check the browser can claim the programming interface, so a driver problem gets a clear message. */
async function canClaim(device: Device): Promise<boolean> {
  try {
    if (!device.opened) await device.open();
    await device.claimInterface(JTAG_INTERFACE);
    await device.releaseInterface(JTAG_INTERFACE);
    return true;
  } catch {
    return false;
  } finally {
    await device.close().catch(() => undefined);
  }
}
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
    if (FLASH[board]!.usb[0] === FT2232 && !(await canClaim(device))) throw new Error(DRIVER_HINT);
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
