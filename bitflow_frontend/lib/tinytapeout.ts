/**
 * lib/tinytapeout.ts — turn a Sandbox design into a Tiny Tapeout project (https://tinytapeout.com), so it can be
 * fabricated on a real Sky130 chip. Pure; the ASIC panel calls it and scripts/tinytapeout.check.ts tests it.
 *
 *   mapPins       the design's ports onto TT's fixed pins: clk, rst_n, ui_in[7:0], uo_out[7:0], uio[7:0]
 *   wrapper       the tt_um_* top module that instantiates the design with that mapping
 *   tilesFor      how many tiles the Sky130 area from the ASIC flow needs (an estimate)
 *   projectFiles  the files to copy into a repo made from TT's template (TEMPLATE below)
 *
 * Matches the template's info.yaml version 6 (checked 2026-11-10). If TT changes it, update TEMPLATE and the check.
 */
import { parseModule } from "@/lib/studio/tbgen";

export const TEMPLATE = { repo: "TinyTapeout/ttsky-verilog-template", yamlVersion: 6 } as const;
/** One tile is about 167 × 108 µm; placement leaves room for routing, so plan on about this much of it for cells. */
export const TILE_UM2 = 167 * 108;
export const UTILIZATION = 0.6;
export const TILE_SIZES = [["1x1", 1], ["1x2", 2], ["2x2", 4], ["3x2", 6], ["4x2", 8], ["6x2", 12], ["8x2", 16]] as const;

export type Bus = "ui" | "uo" | "uio";
/** Bit `bit` of design port `port` sits on `bus[index]`; `out` for an output of the design. */
export interface PinAssign { port: string; bit: number; width: number; out: boolean; bus: Bus; index: number }
export interface TtMapping {
  top:   string;
  clock: string | null;
  reset: { name: string; activeLow: boolean } | null;
  pins:  PinAssign[];
}

/** The tile size whose usable area holds `areaUm2`, or null if it needs more than the largest. */
export function tilesFor(areaUm2: number): (typeof TILE_SIZES)[number][0] | null {
  return TILE_SIZES.find(([, n]) => areaUm2 <= n * TILE_UM2 * UTILIZATION)?.[0] ?? null;
}

/** "tt_um_<user>_<top>", lower case, letters, digits and underscores only. */
export function ttName(user: string, top: string): string {
  const clean = (s: string) => s.toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
  return `tt_um_${[clean(user), clean(top)].filter(Boolean).join("_") || "bitflow"}`;
}

/**
 * The clock goes to clk and the reset to rst_n (inverted for an active-high reset). Other inputs fill ui_in, then
 * the bidirectional pins as inputs; outputs fill uo_out, then the bidirectional pins as outputs. Bits keep port order.
 */
export function mapPins(source: string, top?: string): TtMapping | { error: string } {
  const info = parseModule(source, top);
  if (typeof info === "string") return { error: info };
  if (info.ports.some((p) => p.dir === "inout")) return { error: "inout ports aren't supported yet: split them into an input and an output." };
  const one = (name: string | null | undefined) => !!name && info.ports.find((p) => p.name === name)?.width === 1;
  const clock = one(info.clock) ? info.clock : null;
  const reset = one(info.reset?.name) ? info.reset : null;

  const pins: PinAssign[] = [];
  const used: Record<Bus, number> = { ui: 0, uo: 0, uio: 0 };
  const inputs  = info.ports.filter((p) => p.dir === "input" && p.name !== clock && p.name !== reset?.name);
  const outputs = info.ports.filter((p) => p.dir === "output");
  for (const [ports, main, out] of [[inputs, "ui", false], [outputs, "uo", true]] as const) {
    for (const p of ports) {
      for (let bit = 0; bit < p.width; bit++) {
        const bus: Bus = used[main] < 8 ? main : "uio";
        if (used[bus] >= 8) return { error: tooMany(inputs, outputs) };
        pins.push({ port: p.name, bit, width: p.width, out, bus, index: used[bus]++ });
      }
    }
  }
  return { top: info.name, clock, reset, pins };
}

function tooMany(inputs: { width: number }[], outputs: { width: number }[]) {
  const sum = (ps: { width: number }[]) => ps.reduce((n, p) => n + p.width, 0);
  return "Tiny Tapeout has 8 input pins, 8 output pins and 8 that can be either (24 in all, besides clock and reset). " +
    `This design needs ${sum(inputs)} input and ${sum(outputs)} output bits. Narrow some ports, or send wide values a few bits at a time.`;
}

const inPin = (p: PinAssign) => (p.bus === "ui" ? `ui_in[${p.index}]` : `uio_in[${p.index}]`);

/** The tt_um_* top module: TT's fixed ports, the design instantiated with `map`. */
export function wrapper(map: TtMapping, name: string): string {
  const conns: string[] = [], decls: string[] = [];
  if (map.clock) conns.push(`.${map.clock}(clk)`);
  if (map.reset) conns.push(`.${map.reset.name}(${map.reset.activeLow ? "rst_n" : "~rst_n"})`);
  const uo = Array<string>(8).fill("1'b0"), uio = Array<string>(8).fill("1'b0"), oe = Array<string>(8).fill("0");
  const usedIn = new Set<string>();
  const ports = [...new Set(map.pins.map((p) => p.port))];
  for (const port of ports) {
    const bits = map.pins.filter((p) => p.port === port).sort((a, b) => a.bit - b.bit);
    const wide = bits[0].width > 1;
    if (bits[0].out) {
      decls.push(`  wire ${wide ? `[${bits[0].width - 1}:0] ` : ""}${port}_w;`);
      conns.push(`.${port}(${port}_w)`);
      for (const b of bits) {
        const sig = wide ? `${port}_w[${b.bit}]` : `${port}_w`;
        if (b.bus === "uo") uo[b.index] = sig;
        else { uio[b.index] = sig; oe[b.index] = "1"; }
      }
    } else {
      bits.forEach((b) => usedIn.add(inPin(b)));
      const src = bits.map(inPin).reverse();   // MSB first
      conns.push(`.${port}(${src.length > 1 ? `{${src.join(", ")}}` : src[0]})`);
    }
  }
  const unused = ["ena", ...(map.clock ? [] : ["clk"]), ...(map.reset ? [] : ["rst_n"])];
  for (let i = 0; i < 8; i++) for (const n of [`ui_in[${i}]`, `uio_in[${i}]`]) if (!usedIn.has(n)) unused.push(n);
  const vec = (bits: string[]) => `{${[...bits].reverse().join(", ")}}`;
  return [
    "/*",
    ` * Tiny Tapeout wrapper made by BitFlow (bitflowvlsi.tech) for the design "${map.top}". Pins: see info.yaml.`,
    " * SPDX-License-Identifier: Apache-2.0",
    " */",
    "",
    "`default_nettype none",
    "",
    `module ${name} (`,
    "    input  wire [7:0] ui_in,    // Dedicated inputs",
    "    output wire [7:0] uo_out,   // Dedicated outputs",
    "    input  wire [7:0] uio_in,   // IOs: Input path",
    "    output wire [7:0] uio_out,  // IOs: Output path",
    "    output wire [7:0] uio_oe,   // IOs: Enable path (active high: 0=input, 1=output)",
    "    input  wire       ena,      // always 1 when the design is powered, so you can ignore it",
    "    input  wire       clk,      // clock",
    "    input  wire       rst_n     // reset_n - low to reset",
    ");",
    "",
    ...decls,
    ...(decls.length ? [""] : []),
    `  ${map.top} user_design (`,
    conns.map((c) => `      ${c}`).join(",\n"),
    "  );",
    "",
    `  assign uo_out  = ${vec(uo)};`,
    `  assign uio_out = ${vec(uio)};`,
    `  assign uio_oe  = 8'b${[...oe].reverse().join("")};`,
    "",
    "  // List all unused inputs to prevent warnings",
    `  wire _unused = &{${unused.join(", ")}, 1'b0};`,
    "",
    "endmodule",
    "",
  ].join("\n");
}

/** Pin labels for info.yaml: "count[3]" or "led". */
export function pinLabels(map: TtMapping): Record<string, string> {
  const labels: Record<string, string> = {};
  for (const p of map.pins) labels[`${p.bus}[${p.index}]`] = p.width > 1 ? `${p.port}[${p.bit}]` : p.port;
  return labels;
}

const yamlString = (s: string) => JSON.stringify(s);   // a JSON string is a valid YAML double-quoted string

export interface ProjectInfo { title: string; author: string; description: string; clockHz: number; tiles: string }

export function infoYaml(info: ProjectInfo, name: string, sources: string[], map: TtMapping): string {
  const labels = pinLabels(map);
  const pins = (bus: Bus, title: string) => [`  # ${title}`, ...Array.from({ length: 8 }, (_, i) => `  ${bus}[${i}]: ${yamlString(labels[`${bus}[${i}]`] ?? "")}`)];
  return [
    "# Tiny Tapeout project information (made by BitFlow)",
    "project:",
    `  title:        ${yamlString(info.title)}`,
    `  author:       ${yamlString(info.author)}`,
    `  discord:      ""`,
    `  description:  ${yamlString(info.description)}`,
    `  language:     "Verilog"`,
    `  clock_hz:     ${Math.max(0, Math.round(info.clockHz))}`,
    "",
    `  tiles: ${yamlString(info.tiles)}`,
    "",
    `  top_module:  ${yamlString(name)}`,
    "",
    "  source_files:",
    ...sources.map((s) => `    - ${yamlString(s)}`),
    "",
    "pinout:",
    ...pins("ui", "Inputs"), "",
    ...pins("uo", "Outputs"), "",
    ...pins("uio", "Bidirectional pins"), "",
    "# Do not change!",
    `yaml_version: ${TEMPLATE.yamlVersion}`,
    "",
  ].join("\n");
}

/** Files to copy over a fresh repo made from the TT template, by path. */
export function projectFiles(opts: { design: string; testbench: string; info: ProjectInfo; user: string; map: TtMapping }): Record<string, string> {
  const name = ttName(opts.user, opts.map.top);
  const sources = ["project.v", "design.v"];
  const rows = Object.entries(pinLabels(opts.map)).map(([k, v]) => `| ${k} | ${v} |`);
  return {
    "src/project.v": wrapper(opts.map, name),
    "src/design.v":  opts.design,
    "info.yaml":     infoYaml(opts.info, name, sources, opts.map),
    "test/tb.v":     testbench(name),
    "test/test.py":  cocotbTest(opts.map),
    "test/Makefile": makefile(sources),
    ...(opts.testbench.trim() ? { "test/bitflow_tb.v": `// Your BitFlow testbench, kept for reference. TT's checks run test/test.py instead.\n${opts.testbench}` } : {}),
    "docs/info.md": [
      "## How it works", "", opts.info.description || `${opts.map.top}, designed and simulated on BitFlow.`, "",
      "## How to test", "", "Hold rst_n low for a few clock cycles to reset the design, then drive the inputs below and watch the outputs.", "",
      "| Pin | Signal |", "|-----|--------|", ...rows, "",
      "## External hardware", "", "None.", "",
    ].join("\n"),
    "BITFLOW_README.md": readme(name),
  };
}

const testbench = (name: string) => `\`default_nettype none
\`timescale 1ns / 1ps

/* Instantiates the project and makes wires that the cocotb test (test.py) drives and checks. */
module tb ();

  initial begin
    $dumpfile("tb.fst");
    $dumpvars(0, tb);
    #1;
  end

  reg clk;
  reg rst_n;
  reg ena;
  reg [7:0] ui_in;
  reg [7:0] uio_in;
  wire [7:0] uo_out;
  wire [7:0] uio_out;
  wire [7:0] uio_oe;
\`ifdef GL_TEST
  wire VPWR = 1'b1;
  wire VGND = 1'b0;
\`endif

  ${name} user_project (
\`ifdef GL_TEST
      .VPWR(VPWR),
      .VGND(VGND),
\`endif
      .ui_in  (ui_in),
      .uo_out (uo_out),
      .uio_in (uio_in),
      .uio_out(uio_out),
      .uio_oe (uio_oe),
      .ena    (ena),
      .clk    (clk),
      .rst_n  (rst_n)
  );

endmodule
`;

const cocotbTest = (map: TtMapping) => {
  const ins = map.pins.filter((p) => !p.out).map((p) => `${p.bus === "ui" ? "ui_in" : "uio_in"}[${p.index}] = ${p.width > 1 ? `${p.port}[${p.bit}]` : p.port}`);
  return `# SPDX-License-Identifier: Apache-2.0
# Made by BitFlow from the Tiny Tapeout template. Pin map: see info.yaml.

import cocotb
from cocotb.clock import Clock
from cocotb.triggers import ClockCycles


@cocotb.test()
async def test_project(dut):
    clock = Clock(dut.clk, 10, unit="us")
    cocotb.start_soon(clock.start())

    dut.ena.value = 1
    dut.ui_in.value = 0
    dut.uio_in.value = 0
    dut.rst_n.value = 0
    await ClockCycles(dut.clk, 10)
    dut.rst_n.value = 1
    await ClockCycles(dut.clk, 1)

    # TODO: drive the inputs (${ins.join(", ") || "none"})
    # and assert what your design should output, for example:
    #   dut.ui_in.value = 0b00000011
    #   await ClockCycles(dut.clk, 1)
    #   assert dut.uo_out.value == 3
    assert dut.uo_out.value.is_resolvable, "outputs should not be X after reset"
`;
};

const makefile = (sources: string[]) => `# Makefile (from the Tiny Tapeout template; PROJECT_SOURCES set by BitFlow)
# See https://docs.cocotb.org/en/stable/quickstart.html for more info

SIM ?= icarus
FST ?= -fst
TOPLEVEL_LANG ?= verilog
SRC_DIR = $(PWD)/../src
PROJECT_SOURCES = ${sources.join(" ")}

ifneq ($(GATES),yes)

SIM_BUILD = sim_build/rtl
VERILOG_SOURCES += $(addprefix $(SRC_DIR)/,$(PROJECT_SOURCES))

else

SIM_BUILD = sim_build/gl
COMPILE_ARGS    += -DGL_TEST
COMPILE_ARGS    += -DFUNCTIONAL
COMPILE_ARGS    += -DUSE_POWER_PINS
COMPILE_ARGS    += -DSIM
COMPILE_ARGS    += -DUNIT_DELAY=\\#1
VERILOG_SOURCES += $(PDK_ROOT)/sky130A/libs.ref/sky130_fd_sc_hd/verilog/primitives.v
VERILOG_SOURCES += $(PDK_ROOT)/sky130A/libs.ref/sky130_fd_sc_hd/verilog/sky130_fd_sc_hd.v
VERILOG_SOURCES += $(PWD)/gate_level_netlist.v

endif

COMPILE_ARGS += -I$(SRC_DIR)
VERILOG_SOURCES += $(PWD)/tb.v
TOPLEVEL = tb
COCOTB_TEST_MODULES = test

include $(shell cocotb-config --makefiles)/Makefile.sim
`;

const readme = (name: string) => `# Your BitFlow design, ready for Tiny Tapeout

Top module: \`${name}\`

1. Sign in to GitHub and open https://github.com/${TEMPLATE.repo}. Click **Use this template** to make your own repository.
2. Copy every file from this zip into it, replacing the files with the same name. Commit and push.
3. In the repository's **Settings → Pages**, set the source to **GitHub Actions**. The **gds** action then builds your
   chip's layout; the **Actions** tab shows whether it passed.
4. Edit \`test/test.py\` so it checks what your design should do, and make sure the **test** action passes.
5. When a shuttle is open, submit the repository at https://app.tinytapeout.com. Deadlines and the price per tile are
   on https://tinytapeout.com.

The pin map is in \`info.yaml\` and \`docs/info.md\`. The tile size there is BitFlow's estimate from the Sky130 area;
if the gds action says the design doesn't fit, raise \`tiles\` in \`info.yaml\`.
`;
