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
import { TEMPLATE, mapPins, projectFiles, readiness, tilesFor, ttName, wrapper, type TtMapping } from "../lib/tinytapeout";
import { recordReplay, recordingNote } from "../lib/tt-replay";
import { parseVcd } from "../lib/vcd-parser";

// recordReplay (lib/tt-replay.ts); the generated test.py itself was run under cocotb 2.1.0 + Icarus 12 on 2026-11-28:
// a counter, a combinational adder, an active-low reset and a combinational output of a clocked design all passed,
// and the counter's vectors failed on a counter that counts by 2.
{
  const ctr = "module c (input clk, input rst, input en, output reg [1:0] q);\n  always @(posedge clk) if (rst) q <= 0; else if (en) q <= q + 1;\nendmodule";
  const m = mapPins(ctr) as TtMapping;
  // tb.clk etc. alias tb.dut's ports: both scopes match and the deeper one is taken
  const vcd = (enAt: number) => parseVcd(`$timescale 1ns $end
$scope module tb $end $var reg 1 ! clk $end $var reg 1 " rst $end $var reg 1 # en $end $var wire 2 $ q $end
$scope module dut $end $var wire 1 % clk $end $var wire 1 & rst $end $var wire 1 ' en $end $var wire 2 ( q $end $upscope $end $upscope $end
$enddefinitions $end
#0 0! 0% 1" 1& 0# 0' bx $ bx (
#5 1! 1% b0 $ b0 (
#10 0! 0% 0" 0&
#${enAt} 1# 1'
#15 1! 1%
#20 0! 0%
#25 1! 1% b1 $ b1 (
#30 0! 0%
`);
  const ok = recordReplay(vcd(12), m, ctr);
  assert.ok("vectors" in ok, JSON.stringify(ok));
  assert.deepEqual(ok.vectors.map((v) => [v.ui, v.rstN, v.uo]), [[0, 0, "--------"], [1, 1, "------00"], [1, 1, "------00"]]);
  // en rises on the edge at 15: the recording can't say which value the flip-flop saw
  const race = recordReplay(vcd(15), m, ctr);
  assert.ok("error" in race && /exactly on the clock edge at 15 ns/.test(race.error), JSON.stringify(race));
  assert.match((recordReplay(vcd(12), m, ctr.replace("posedge clk", "negedge clk")) as { error: string }).error, /falling clock edge/);
  assert.match((recordReplay(null, m, ctr) as { error: string }).error, /run your testbench first/);
  assert.match((recordReplay(vcd(12), m, ctr + "\nmodule d (input clk2, output reg y); always @(posedge clk2) y <= ~y; endmodule") as { error: string }).error, /more than one clock/);
  // a run that failed, or ran on Verilator, isn't replayed
  assert.match(recordingNote({ simulator: "browser", stdout: "FAIL: got 3", success: true })!, /reported a failure/);
  assert.match(recordingNote({ simulator: "verilator", stdout: "", success: true })!, /Verilator/);
  assert.equal(recordingNote({ simulator: "icarus", stdout: "ALL TESTS PASSED", success: true }), null);
  const files = projectFiles({ design: ctr, testbench: "", map: m, user: "u", replay: ok,
    info: { title: "c", author: "u", description: "", clockHz: 1e6, tiles: "1x1" } });
  assert.match(files["test/test.py"], /replays 3 clock cycles/);
  assert.match(files["test/test.py"], /\(0x01, 0x00, 1, "------00", "--------"\),/);
  assert.equal(readiness({ pinsUsed: 3, replay: ok }).at(-1)!.state, "ok");
  assert.match(readiness({ pinsUsed: 3, replay: race }).at(-1)!.detail, /couldn't replay your testbench/);
}

// readiness: before layout the size is an estimate and sign-off/timing are to-dos
{
  const pre = readiness({ pinsUsed: 5, areaUm2: 3000 });
  assert.deepEqual(pre.map((c) => [c.label, c.state]), [["Pins", "ok"], ["Size", "todo"], ["Sign-off", "todo"], ["Timing after routing", "todo"], ["Test", "todo"]]);
  // gcd layout on the server, 2026-11-28: everything passes, slow corner misses
  const gcd = { logic_area_um2: 3590, slack_ns: 6.1, drc_violations: 0, drc_deck_violations: 0, lvs: true, lec: true, antenna_violations: 0,
                corners: { ss: { setup: -4.49, hold: 1.52 }, tt: { setup: 6.1, hold: 0.45 }, ff: { setup: 6.82, hold: 0.3 } } };
  const post = readiness({ pinsUsed: 5, areaUm2: 3000, routed: gcd, periodNs: 10 });
  assert.equal(post[1].state, "ok"); assert.match(post[1].detail, /^1x1 from the layout's 3,590 µm²/);
  assert.equal(post[2].state, "ok");
  assert.equal(post[3].detail, "meets 10 ns (misses at the slow corner)");
  // a check that didn't run is not a pass
  const noLvs = readiness({ pinsUsed: 5, routed: { ...gcd, lvs: null }, periodNs: 10 });
  assert.equal(noLvs[2].state, "fail"); assert.match(noLvs[2].detail, /^LVS/);
  assert.equal(readiness({ pinsUsed: 5, routed: { ...gcd, slack_ns: -1.5 }, periodNs: 10 })[3].detail, "misses 10 ns by 1.50 ns");
}

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
