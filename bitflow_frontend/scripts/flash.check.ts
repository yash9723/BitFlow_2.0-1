/**
 * scripts/flash.check.ts — self-check for lib/flash.ts: openFPGALoader's arguments per board
 * and mode, progress lines, and that every board offered on /flash takes the bitstream its
 * family builds (lib/synth/fpga.ts) under a name openFPGALoader knows.
 *   npx tsx scripts/flash.check.ts
 */
import assert from "node:assert/strict";
import { BOARDS, type BoardId, type Family } from "@/lib/synth/boards";
import { FLASH, USB_SETUP_URL, ZADIG_PRESET, detectOs, flashArgs, needsWinUsbOnWindows, parseProgress } from "@/lib/flash";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

assert.deepEqual(flashArgs("icestick", "flash", "top.bin"), ["-b", "ice40_generic", "top.bin"], "iCE40 always writes its flash");
assert.deepEqual(flashArgs("ulx3s-85f", "sram", "top.bit"), ["-b", "ulx3s", "top.bit"]);
assert.deepEqual(flashArgs("ulx3s-85f", "flash", "top.bit"), ["-b", "ulx3s", "-f", "top.bit"]);
assert.deepEqual(flashArgs("orangecrab-25f", "flash", "top.bit"), ["-b", "orangeCrab", "top.bit"], "DFU writes the flash");
assert.deepEqual(flashArgs("tangnano9k", "flash", "top.fs"), ["-b", "tangnano9k", "-f", "top.fs"]);
assert.deepEqual(flashArgs("basys3", "sram", "top.bit"), ["-b", "basys3", "top.bit"]);
assert.throws(() => flashArgs("de10-lite", "sram", "top.sof"), /can't be programmed from the browser/);

assert.deepEqual(parseProgress("Load SRAM: [=====                    ] 21.50%"), { label: "Load SRAM", percent: 21.5 });
assert.deepEqual(parseProgress("Writing: [==================================================] 100.00%"), { label: "Writing", percent: 100 });
assert.deepEqual(parseProgress("Erasing: [>     ] 3%"), { label: "Erasing", percent: 3 });
assert.equal(parseProgress("Jtag frequency : requested 6.00MHz   -> real 6.00MHz"), null);
assert.equal(parseProgress("done"), null);

// openFPGALoader 1.2.0 --list-boards (YoWASP build), for the names used here.
const KNOWN = new Set(["ice40_generic", "ulx3s", "orangeCrab", "tangnano9k", "tangnano20k", "basys3", "arty_a7_35t", "nexys_a7_100", "de10lite"]);
const BUILT: Record<Family, string> = { ice40: ".bin", ecp5: ".bit", gowin: ".fs", xilinx: ".bit", intel: ".sof" };
for (const [id, target] of Object.entries(FLASH) as [BoardId, NonNullable<(typeof FLASH)[BoardId]>][]) {
  const b = BOARDS[id];
  assert.ok(KNOWN.has(b.loader), `${id}: openFPGALoader knows -b ${b.loader}`);
  assert.ok(target.files.includes(BUILT[b.family]), `${id}: takes the ${BUILT[b.family]} its family builds`);
  assert.ok(target.usb.length > 0 && target.modes.length > 0, `${id}: USB filter and a mode`);
}
assert.ok(!FLASH["de10-lite"], "the DE10-Lite's USB-Blaster needs Quartus");
// Setup for the visitor's computer: which OS, which boards need WinUSB on Windows, the vendor fallback.
assert.equal(detectOs("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/141.0 Safari/537.36"), "windows");
assert.equal(detectOs("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/141.0"), "mac");
assert.equal(detectOs("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/141.0"), "linux");
assert.equal(detectOs("Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 Chrome/141.0"), "chromeos");
assert.equal(detectOs("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/141.0 Mobile"), "android");
for (const id of ["tangnano9k", "tangnano20k", "icestick", "icebreaker", "basys3"] as BoardId[]) assert.ok(needsWinUsbOnWindows(id), `${id} is an FT2232`);
for (const id of ["ulx3s-85f", "orangecrab-25f"] as BoardId[]) assert.ok(!needsWinUsbOnWindows(id), `${id} isn't an FT2232`);
assert.equal(FLASH.tangnano9k!.vendor!.command("sram", "a.fs"), "programmer_cli --device GW1NR-9C --run 2 --fsFile a.fs --cable-index 1");
assert.equal(FLASH.tangnano9k!.vendor!.command("flash", "a.fs"), "programmer_cli --device GW1NR-9C --run 5 --fsFile a.fs --cable-index 1");
assert.equal(FLASH.tangnano20k!.vendor!.command("flash", "a.fs"), "programmer_cli --device GW2AR-18C --run 36 --spiaddr 0x000000 --fsFile a.fs --cable-index 1");
assert.match(USB_SETUP_URL, /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/releases\/download\/usb-setup-v1\/BitFlow-USB-Setup\.zip$/);
const preset = join(__dirname, "..", "public", ZADIG_PRESET);
assert.ok(existsSync(preset), "the Zadig preset is served");
assert.match(readFileSync(preset, "utf8"), /VID = 0x0403\s+PID = 0x6010\s+MI = 0x00/, "the preset targets 0403:6010 interface 0");
console.log("flash: all checks passed");
