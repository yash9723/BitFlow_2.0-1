/**
 * scripts/bitstream.check.ts — pin assignment rules (lib/synth/boards.ts), and,
 * when the YoWASP tools are available, full builds for both boards
 * (lib/synth/fpga.ts) that must produce a bitstream with the iCE40 preamble.
 *   npx tsx scripts/bitstream.check.ts
 *   YOWASP_YOSYS=.../yosys/gen/bundle.js YOWASP_NEXTPNR=.../nextpnr-ice40/gen/bundle.js npx tsx scripts/bitstream.check.ts
 */
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { pinout } from "@/lib/synth/boards";
import { buildBitstream } from "@/lib/synth/fpga";

const pins = (r: ReturnType<typeof pinout>) => Object.fromEntries(r.assignments.map((a) => [a.port, a.pin]));

// iCEstick: clock, UART, LEDs; no buttons, so rst goes to PMOD with a note.
let r = pinout("icestick", {
  clk: { direction: "input", width: 1 }, rst: { direction: "input", width: 1 },
  rx: { direction: "input", width: 1 }, tx: { direction: "output", width: 1 }, led: { direction: "output", width: 5 },
});
assert.equal(r.error, null);
assert.deepEqual(pins(r), { clk: 21, rst: 78, rx: 9, tx: 8, "led[0]": 99, "led[1]": 98, "led[2]": 97, "led[3]": 96, "led[4]": 95 });
assert.ok(r.notes.some((n) => n.includes("no buttons")));
assert.ok(r.pcf.includes("set_io led[0] 99\n"));

// iCEBreaker: rst_n takes the active-low user button, btn the snap-off buttons; extra LEDs spill to PMOD.
r = pinout("icebreaker", {
  clk: { direction: "input", width: 1 }, rst_n: { direction: "input", width: 1 },
  btn: { direction: "input", width: 2 }, led: { direction: "output", width: 6 },
});
assert.equal(r.error, null);
assert.deepEqual(pins(r), { clk: 35, rst_n: 10, "btn[0]": 20, "btn[1]": 19,
  "led[0]": 26, "led[1]": 27, "led[2]": 25, "led[3]": 23, "led[4]": 21, "led[5]": 4 });

// Too many pins is an error naming what didn't fit.
r = pinout("icestick", { data: { direction: "input", width: 12 } });
assert.match(r.error ?? "", /no free pin for: data\[8\], data\[9\], data\[10\], data\[11\]/);
console.log("pinout: ok");

async function builds() {
  if (!process.env.YOWASP_YOSYS || !process.env.YOWASP_NEXTPNR) return console.log("builds: skipped (set YOWASP_YOSYS and YOWASP_NEXTPNR)");
  const { runYosys } = await import(pathToFileURL(process.env.YOWASP_YOSYS).href);
  const { runNextpnrIce40, runIcepack } = await import(pathToFileURL(process.env.YOWASP_NEXTPNR).href);
  const tools = { runYosys, runNextpnrIce40, runIcepack };
  const blinky = `module blinky(input clk, input rst_n, output [4:0] led);
  reg [23:0] n;
  always @(posedge clk or negedge rst_n) if (!rst_n) n <= 0; else n <= n + 1;
  assign led = n[23:19];
endmodule`;
  for (const board of ["icestick", "icebreaker"] as const) {
    const out = await buildBitstream(tools, board, blinky);
    if (!out.ok) throw new Error(`${board}: ${out.error}`);
    assert.equal(Buffer.from(out.bin.slice(0, 8)).toString("hex"), "ff0000ff7eaa997e", "iCE40 preamble");
    assert.ok(out.fmaxMhz && out.fmaxMhz > 12, `fmax ${out.fmaxMhz}`);
    console.log(`build ${board}: ok (${out.bin.length} bytes, ${out.fmaxMhz} MHz)`);
  }
  const bad = await buildBitstream(tools, "icestick", "module broken(input a; endmodule");
  assert.ok(!bad.ok && /syntax error/.test(bad.error), "a syntax error is reported");
  console.log("build error: ok");
}

builds().then(() => console.log("ALL PASS"), (e) => { console.error(e); process.exit(1); });
