/**
 * scripts/flash.check.ts — self-check for lib/flash.ts: openFPGALoader's arguments per board
 * and mode, progress lines, and that every board offered on /flash takes the bitstream its
 * family builds (lib/synth/fpga.ts) under a name openFPGALoader knows.
 *   npx tsx scripts/flash.check.ts
 */
import assert from "node:assert/strict";
import { BOARDS, type BoardId, type Family } from "@/lib/synth/boards";
import { FLASH, flashArgs, parseProgress } from "@/lib/flash";

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
console.log("flash: all checks passed");
