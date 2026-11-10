/**
 * scripts/tinytapeout.check.ts — lib/tinytapeout.ts: pin mapping, the tt_um_* wrapper, info.yaml and tile sizes.
 * Every generated wrapper is compiled with iverilog together with its design (required in CI, skipped where
 * iverilog isn't installed).
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { TEMPLATE, mapPins, projectFiles, tilesFor, ttName, wrapper, type TtMapping } from "../lib/tinytapeout";

const ok = (src: string, top?: string): TtMapping => {
  const m = mapPins(src, top);
  assert.ok(!("error" in m), `expected a mapping: ${JSON.stringify(m)}`);
  return m as TtMapping;
};
const where = (m: TtMapping, port: string, bit = 0) => { const p = m.pins.find((x) => x.port === port && x.bit === bit)!; return `${p.bus}[${p.index}]`; };

const COUNTER = `module counter(input clk, input rst, input en, output reg [3:0] count);
  always @(posedge clk) if (rst) count <= 0; else if (en) count <= count + 1;
endmodule
`;
const ADDER = `module adder(input [7:0] a, input [3:0] b, output [7:0] sum, output carry);
  assign {carry, sum} = a + b;
endmodule
`;
const ACTIVE_LOW = `module blink(input clk, input rst_n, output led);
  reg q; always @(posedge clk or negedge rst_n) if (!rst_n) q <= 0; else q <= ~q;
  assign led = q;
endmodule
`;
const TOO_WIDE = "module big(input [15:0] a, input [15:0] b, output [15:0] y); assign y = a ^ b; endmodule\n";
const SUBMODULES = `module half(input a, input b, output s, output c); assign s = a ^ b; assign c = a & b; endmodule
module top(input x, input y, output s, output c); half h(.a(x), .b(y), .s(s), .c(c)); endmodule
`;

// ── Mapping ──
{
  const m = ok(COUNTER);
  assert.equal(m.clock, "clk");
  assert.deepEqual(m.reset, { name: "rst", activeLow: false });
  assert.equal(where(m, "en"), "ui[0]");
  assert.deepEqual([0, 1, 2, 3].map((b) => where(m, "count", b)), ["uo[0]", "uo[1]", "uo[2]", "uo[3]"]);
  assert.match(wrapper(m, "tt_um_x"), /\.rst\(~rst_n\)/, "active-high reset is inverted");
}
{
  const m = ok(ADDER);
  assert.equal(m.clock, null);
  assert.equal(where(m, "a", 7), "ui[7]");
  assert.equal(where(m, "b", 0), "uio[0]", "inputs overflow onto the bidirectional pins");
  assert.equal(where(m, "sum", 7), "uo[7]");
  assert.equal(where(m, "carry"), "uio[4]", "outputs overflow after the inputs on uio");
  const w = wrapper(m, "tt_um_x");
  assert.match(w, /\.b\(\{uio_in\[3\], uio_in\[2\], uio_in\[1\], uio_in\[0\]\}\)/, "MSB first");
  assert.match(w, /assign uio_oe  = 8'b00010000;/, "only the carry pin drives");
  assert.match(w, /assign uio_out = \{1'b0, 1'b0, 1'b0, carry_w, 1'b0, 1'b0, 1'b0, 1'b0\};/);
  const full = mapPins(ADDER.replace("input [3:0] b", "input [7:0] b"));
  assert.ok("error" in full && /16 input and 9 output bits/.test(full.error), "8+8 in and 9 out don't fit");
}
{
  const m = ok(ACTIVE_LOW);
  assert.deepEqual(m.reset, { name: "rst_n", activeLow: true });
  const w = wrapper(m, "tt_um_x");
  assert.match(w, /\.rst_n\(rst_n\)/);
  assert.match(w, /assign uo_out  = \{1'b0, 1'b0, 1'b0, 1'b0, 1'b0, 1'b0, 1'b0, led_w\};/, "unused outputs tied to 0");
  assert.match(w, /wire _unused = &\{ena, ui_in\[0\], uio_in\[0\],/);
}
{
  const err = mapPins(TOO_WIDE);
  assert.ok("error" in err && /32 input and 16 output bits/.test(err.error), JSON.stringify(err));
  assert.ok("error" in mapPins("module m(inout x); endmodule"), "inout refused");
  assert.ok("error" in mapPins("not verilog"), "no module");
  assert.equal(ok(SUBMODULES, "top").top, "top", "the chosen top module");
}
{ // Outputs overflowing to uio set uio_oe
  const m = ok("module w(input [3:0] a, output [11:0] y); assign y = {a, a, a}; endmodule\n");
  assert.equal(where(m, "y", 8), "uio[0]");
  assert.match(wrapper(m, "tt_um_x"), /assign uio_oe  = 8'b00001111;/);
}

// ── Names, tiles, files ──
assert.equal(ttName("Yash Roop", "Counter-4"), "tt_um_yash_roop_counter_4");
assert.equal(ttName("", "!!"), "tt_um_bitflow");
assert.equal(tilesFor(500), "1x1");
assert.equal(tilesFor(167 * 108 * 0.6 + 1), "1x2");
assert.equal(tilesFor(1e9), null);
{
  const m = ok(COUNTER);
  const files = projectFiles({ design: COUNTER, testbench: "module tb; endmodule", user: "ada", map: m,
    info: { title: "Counter", author: "Ada", description: "A 4-bit \"counter\"", clockHz: 10_000_000, tiles: "1x1" } });
  assert.deepEqual(Object.keys(files).sort(), ["BITFLOW_README.md", "docs/info.md", "info.yaml", "src/design.v", "src/project.v", "test/Makefile", "test/bitflow_tb.v", "test/tb.v", "test/test.py"]);
  const y = files["info.yaml"];
  assert.match(y, /^  top_module:  "tt_um_ada_counter"$/m);
  assert.match(y, new RegExp(`^yaml_version: ${TEMPLATE.yamlVersion}$`, "m"));
  assert.match(y, /^  description:  "A 4-bit \\"counter\\""$/m, "quotes escaped");
  assert.match(y, /^  clock_hz:     10000000$/m);
  assert.match(y, /^  uo\[3\]: "count\[3\]"$/m);
  assert.match(y, /^  ui\[7\]: ""$/m);
  assert.equal((y.match(/^  (ui|uo|uio)\[\d\]:/gm) ?? []).length, 24, "all 24 pins listed");
  assert.match(files["test/Makefile"], /^PROJECT_SOURCES = project.v design.v$/m);
  assert.match(files["test/tb.v"], /tt_um_ada_counter user_project/);
}

// ── Every wrapper compiles with its design ──
const hasIverilog = (() => { try { execFileSync("iverilog", ["-V"], { stdio: "ignore" }); return true; } catch { return false; } })();
if (!hasIverilog) {
  assert.ok(!process.env.CI, "iverilog is required in CI");
  console.log("tinytapeout: iverilog not installed, skipping the compile checks");
} else {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tt-"));
  for (const [src, top] of [[COUNTER], [ADDER], [ACTIVE_LOW], [SUBMODULES, "top"], ["module w(input [3:0] a, output [11:0] y); assign y = {a, a, a}; endmodule\n"]] as [string, string?][]) {
    const files = projectFiles({ design: src, testbench: "", user: "ci", map: ok(src, top), info: { title: "t", author: "t", description: "", clockHz: 0, tiles: "1x1" } });
    for (const f of ["src/project.v", "src/design.v", "test/tb.v"]) fs.writeFileSync(path.join(dir, path.basename(f)), files[f]);
    execFileSync("iverilog", ["-g2012", "-Wall", "-o", path.join(dir, "a.out"), "-s", "tb", ...["project.v", "design.v", "tb.v"].map((f) => path.join(dir, f))], { stdio: "pipe" });
  }
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log("tinytapeout: all checks passed");
