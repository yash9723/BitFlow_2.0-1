/**
 * scripts/bitstream.check.ts — board data and pin assignment (lib/synth/boards.ts), the
 * constraint formats (lib/synth/constraints.ts) and exported projects
 * (lib/synth/export-project.ts); and, when the YoWASP tools are available, full builds
 * (lib/synth/fpga.ts) that must produce each family's bitstream.
 *   npx tsx scripts/bitstream.check.ts
 *   YOWASP_YOSYS=.../yosys/gen/bundle.js YOWASP_NEXTPNR=.../nextpnr-ice40/gen/bundle.js \
 *   YOWASP_ECP5=.../nextpnr-ecp5/gen/bundle.js YOWASP_GOWIN=.../nextpnr-himbaechel-gowin/gen/bundle.js \
 *   YOWASP_PYODIDE=.../pyodide/pyodide.mjs npx tsx scripts/bitstream.check.ts
 */
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { BOARDS, pinout, type BoardId, type PortInfo } from "@/lib/synth/boards";
import { buildBitstream, type FpgaTools } from "@/lib/synth/fpga";
import { projectFiles } from "@/lib/synth/export-project";
import type { RunYosys } from "@/lib/synth/run";

const pins = (r: ReturnType<typeof pinout>) => Object.fromEntries(r.assignments.map((a) => [a.port, a.pin]));
const port = (direction: string, width = 1): PortInfo => ({ direction, width });

// Every board: no pin listed twice (clock, serial, LEDs, buttons, switches, header pins).
for (const [id, b] of Object.entries(BOARDS)) {
  const all = [b.clock, b.uartRx, b.uartTx, ...b.leds, ...b.buttons, ...(b.switches ?? []), ...b.gpio].filter(Boolean).map((p) => p!.pin);
  const dup = all.filter((p, i) => all.indexOf(p) !== i);
  assert.deepEqual(dup, [], `${id}: pins listed twice`);
  // The TinyFPGA BX has its own USB bootloader (tinyprog), not an openFPGALoader board.
  assert.ok((b.loader || id === "tinyfpga-bx") && b.clockMhz > 0, `${id}: loader and clock`);
}
assert.ok(!BOARDS["orangecrab-25f"].gpio.some((p) => p.pin === "V17"), "OrangeCrab V17 reboots into the bootloader");

// iCEstick: clock, UART, LEDs; no buttons, so rst goes to PMOD with a note.
let r = pinout("icestick", { clk: port("input"), rst: port("input"), rx: port("input"), tx: port("output"), led: port("output", 5) });
assert.equal(r.error, null);
assert.deepEqual(pins(r), { clk: "21", rst: "78", rx: "9", tx: "8", "led[0]": "99", "led[1]": "98", "led[2]": "97", "led[3]": "96", "led[4]": "95" });
assert.ok(r.notes.some((n) => n.includes("no buttons")));
assert.equal(r.format, "pcf");
assert.ok(r.constraints.includes("set_io led[0] 99\n"));

// iCEBreaker: rst_n takes the active-low user button, btn the snap-off buttons; extra LEDs spill to PMOD.
r = pinout("icebreaker", { clk: port("input"), rst_n: port("input"), btn: port("input", 2), led: port("output", 6) });
assert.equal(r.error, null);
assert.deepEqual(pins(r), { clk: "35", rst_n: "10", "btn[0]": "20", "btn[1]": "19",
  "led[0]": "26", "led[1]": "27", "led[2]": "25", "led[3]": "23", "led[4]": "21", "led[5]": "4" });

// Too many pins is an error naming what didn't fit.
r = pinout("icestick", { data: port("input", 12) });
assert.match(r.error ?? "", /no free pin for: data\[8\], data\[9\], data\[10\], data\[11\]/);

// ULX3S (ECP5, .lpf): 25 MHz clock with a FREQUENCY line, the PWR button with its pull-up, DIP switches.
r = pinout("ulx3s-85f", { clk: port("input"), rst_n: port("input"), sw: port("input", 2), led: port("output", 2), tx: port("output") });
assert.equal(r.error, null);
assert.deepEqual(pins(r), { clk: "G2", rst_n: "D6", "sw[0]": "E8", "sw[1]": "D8", "led[0]": "B2", "led[1]": "C2", tx: "L4" });
assert.equal(r.format, "lpf");
assert.ok(r.constraints.includes('LOCATE COMP "clk" SITE "G2";\nIOBUF PORT "clk" IO_TYPE=LVCMOS33;'));
assert.ok(r.constraints.includes('IOBUF PORT "rst_n" IO_TYPE=LVCMOS33 PULLMODE=UP;'));
assert.ok(r.constraints.includes('FREQUENCY PORT "clk" 25 MHZ;'));

// Tang Nano 9K (Gowin, .cst): LEDs on the 1.8 V bank, active low.
r = pinout("tangnano9k", { clk: port("input"), led: port("output", 2), key_n: port("input") });
assert.deepEqual(pins(r), { clk: "52", "led[0]": "10", "led[1]": "11", key_n: "3" });
assert.ok(r.constraints.includes('IO_LOC "led[0]" 10;\nIO_PORT "led[0]" IO_TYPE=LVCMOS18;'));
assert.ok(r.constraints.includes('IO_PORT "key_n" IO_TYPE=LVCMOS18 PULL_MODE=UP;'));
assert.ok(r.notes.some((n) => n.includes("active low")));

// OrangeCrab: no serial port, so tx goes to the Feather header with a note.
r = pinout("orangecrab-25f", { clk: port("input"), tx: port("output") });
assert.deepEqual(pins(r), { clk: "A9", tx: "N17" });
assert.ok(r.notes.some((n) => n.includes("no USB serial port")));

// Basys 3 (Xilinx, .xdc): configuration voltage, clock period, switches and buttons.
r = pinout("basys3", { clk: port("input"), sw: port("input", 2), btn: port("input"), led: port("output") });
assert.deepEqual(pins(r), { clk: "W5", "sw[0]": "V17", "sw[1]": "V16", btn: "U18", led: "U16" });
assert.ok(r.constraints.startsWith("set_property CONFIG_VOLTAGE 3.3 [current_design]\nset_property CFGBVS VCCO [current_design]\n"));
assert.ok(r.constraints.includes("set_property -dict { PACKAGE_PIN W5 IOSTANDARD LVCMOS33 } [get_ports {clk}];"));
assert.ok(r.constraints.includes("create_clock -add -name sys_clk_pin -period 10.000 -waveform {0 5.000} [get_ports {clk}];"));

// Nexys A7: SW8/SW9 sit on a 1.8 V bank.
r = pinout("nexys-a7-100t", { sw: port("input", 10) });
assert.ok(r.constraints.includes("PACKAGE_PIN T8 IOSTANDARD LVCMOS18 } [get_ports {sw[8]}]"));

// DE10-Lite (Intel, .qsf): device lines, pins and the I/O standard; tx/rx go to the GPIO header.
r = pinout("de10-lite", { clk: port("input"), key_n: port("input"), led: port("output"), rx: port("input") });
assert.deepEqual(pins(r), { clk: "P11", key_n: "B8", led: "A8", rx: "V10" });
assert.ok(r.constraints.includes('set_global_assignment -name FAMILY "MAX 10"'));
assert.ok(r.constraints.includes('set_location_assignment PIN_P11 -to "clk"\nset_instance_assignment -name IO_STANDARD "3.3-V LVTTL" -to "clk"'));
console.log("pinout + constraints: ok");

// Exported projects.
let files = projectFiles("basys3", "blinky", "module blinky; endmodule", "XDC", "clk");
assert.deepEqual(Object.keys(files).sort(), ["README.md", "blinky.xdc", "build.tcl", "program.tcl", "src/blinky.sv"]);
assert.ok(files["build.tcl"].includes("synth_design -top blinky -part xc7a35tcpg236-1"));
assert.ok(files["build.tcl"].includes("write_bitstream -force blinky.bit"));
assert.ok(files["README.md"].includes("openFPGALoader -b basys3 blinky.bit"));
files = projectFiles("de10-lite", "blinky", "module blinky; endmodule", "QSF", "clk");
assert.ok(files["blinky.qsf"].startsWith("QSF\nset_global_assignment -name TOP_LEVEL_ENTITY blinky"));
assert.equal(files["blinky.sdc"], "create_clock -name clk -period 20.000 [get_ports {clk}]\n");
assert.ok(files["program.sh"].includes('quartus_pgm -c USB-Blaster -m JTAG -o "p;output_files/blinky.sof"'));
console.log("export projects: ok");

const blinky = `module blinky(input clk, input rst_n, output [4:0] led);
  reg [23:0] n;
  always @(posedge clk or negedge rst_n) if (!rst_n) n <= 0; else n <= n + 1;
  assign led = n[23:19];
endmodule`;
const load = (env: string) => import(pathToFileURL(process.env[env]!).href);

async function family(name: string, boards: BoardId[], tools: FpgaTools, check: (bin: Uint8Array) => void) {
  for (const board of boards) {
    const out = await buildBitstream(tools, board, blinky);
    if (!out.ok) throw new Error(`${board}: ${out.error}`);
    check(out.bin);
    assert.ok(out.fmaxMhz && out.fmaxMhz > BOARDS[board].clockMhz, `${board}: fmax ${out.fmaxMhz}`);
    assert.ok(Object.keys(out.utilization).length > 0, `${board}: utilization`);
    if (out.pnr) {
      const { grid, cells = [], critical = [] } = out.pnr;
      assert.ok(cells.length > 24, `placed cells ${cells.length}`);
      assert.ok(cells.every(([, , x, y]) => x < grid.width && y < grid.height), "cells inside the board's grid");
      assert.ok(critical.length > 0 && critical[0].hops.length > 1, "a critical path with hops");
    }
    console.log(`build ${board} (${name}): ok (${out.file}, ${out.bin.length} bytes, ${out.fmaxMhz} MHz)`);
  }
}

async function builds() {
  if (!process.env.YOWASP_YOSYS) return console.log("builds: skipped (set YOWASP_YOSYS and the family bundles)");
  const { runYosys } = await load("YOWASP_YOSYS");
  if (process.env.YOWASP_NEXTPNR) {
    const n = await load("YOWASP_NEXTPNR");
    const tools = { runYosys, runNextpnr: n.runNextpnrIce40, runPack: n.runIcepack };
    await family("iCE40", ["icestick", "icebreaker", "icezum", "tinyfpga-bx"], tools,
      (bin) => assert.equal(Buffer.from(bin.slice(0, 8)).toString("hex"), "ff0000ff7eaa997e", "iCE40 preamble"));
    const bad = await buildBitstream(tools, "icestick", "module broken(input a; endmodule");
    assert.ok(!bad.ok && /syntax error/.test(bad.error), "a syntax error is reported");
    console.log("build error: ok");
  }
  if (process.env.YOWASP_ECP5) {
    const n = await load("YOWASP_ECP5");
    await family("ECP5", ["ulx3s-85f", "orangecrab-25f"], { runYosys, runNextpnr: n.runNextpnrEcp5, runPack: n.runEcppack },
      (bin) => assert.ok(Buffer.from(bin).includes(Buffer.from("ffffbdb3", "hex")), "ECP5 preamble"));
  }
  if (process.env.YOWASP_GOWIN && process.env.YOWASP_PYODIDE) {
    const n = await load("YOWASP_GOWIN");
    const { loadPyodide: start } = await load("YOWASP_PYODIDE");
    // The same Pyodide setup as lib/synth/fpga-worker.ts.
    const loadPyodide = async (options: object) => {
      const py = await start(options);
      await py.loadPackage(["micropip", "numpy", "msgspec", "lzma"]);
      await py.runPythonAsync('import micropip; micropip.add_mock_package("fastcrc", "0.3.2", modules={"fastcrc": ""})');
      return py;
    };
    const runPack: RunYosys = (args, f, options) => n.runGowinPack(args, f, { ...options, loadPyodide });
    await family("Gowin", ["tangnano9k", "tangnano20k"], { runYosys, runNextpnr: n.runNextpnrHimbaechelGowin, runPack },
      (bin) => {
        const rows = new TextDecoder().decode(bin).trim().split("\n");
        assert.ok(rows.length > 100 && rows.every((row) => /^[01]+$/.test(row)), "Gowin .fs: rows of bits");
      });
  }
}

builds().then(() => console.log("ALL PASS"), (e) => { console.error(e); process.exit(1); });
