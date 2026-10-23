/** scripts/tbgen.check.ts — self-check for lib/studio/tbgen.ts (npx tsx scripts/tbgen.check.ts). Simulation: studio-sim.check.ts. */
import assert from "node:assert/strict";
import { type ModuleInfo, evalConst, generateTestbench, moduleNames, parseModule, stimulusKind } from "../lib/studio/tbgen";

const ok = (src: string, name?: string): ModuleInfo => {
  const m = parseModule(src, name);
  if (typeof m === "string") throw new Error(m);
  return m;
};
const shape = (m: ModuleInfo) => m.ports.map((p) => `${p.dir} ${p.signed ? "s" : ""}${p.width} ${p.name}`);

// constant expressions
const env = { W: 8, DEPTH: 16 };
assert.equal(evalConst("W-1", env), 7);
assert.equal(evalConst("$clog2(DEPTH)", env), 4);
assert.equal(evalConst("$clog2(17)", env), 5);
assert.equal(evalConst("2**W - 1", env), 255);
assert.equal(evalConst("8'hFF + 4'b1010", env), 265);
assert.equal(evalConst("(W*2)/3 % 4", env), 1);
assert.equal(evalConst("1 << W >> 2", env), 64);
assert.equal(evalConst("W + X", env), null);
assert.equal(evalConst("W / 0", env), null);
assert.equal(evalConst("W ? 1 : 0", env), null);

// ANSI, parameters, expression widths, continuation names, signed, SV types
{
  const m = ok(`
    // an adder
    module add #(parameter W = 8, parameter N = W * 2, localparam L = 3) (
      input  wire [W-1:0] a, b,   /* two operands */
      input  logic signed [N-1:0] s,
      output reg  [W:0] sum,
      output logic y
    );
      assign y = ^a;
    endmodule`);
  assert.equal(m.name, "add");
  assert.deepEqual(m.params, [{ name: "W", value: "8" }, { name: "N", value: "W * 2" }]);
  assert.deepEqual(shape(m), ["input 8 a", "input 8 b", "input s16 s", "output 9 sum", "output 1 y"]);
  assert.equal(m.clock, null);
  assert.equal(stimulusKind(m), "random", "32 input bits");
}
// non-ANSI, body parameter, integer port
{
  const m = ok(`module cnt(clk, rst_n, en, q, n);
    parameter WIDTH = 4;
    input clk, rst_n;
    input en;
    output reg [WIDTH-1:0] q;
    output integer n;
  endmodule`);
  assert.deepEqual(shape(m), ["input 1 clk", "input 1 rst_n", "input 1 en", "output 4 q", "output s32 n"]);
  assert.deepEqual(m.params, [{ name: "WIDTH", value: "4" }]);
  assert.equal(m.clock, "clk");
  assert.deepEqual(m.reset, { name: "rst_n", activeLow: true });
}
// several modules: the last is the top unless one is picked
{
  const src = "module sub(input a, output b); endmodule\nmodule top(input i_clk, input reset, input [3:0] d, output [3:0] q); endmodule";
  assert.deepEqual(moduleNames(src), ["sub", "top"]);
  assert.equal(ok(src).name, "top");
  assert.deepEqual(ok(src).reset, { name: "reset", activeLow: false });
  assert.equal(ok(src).clock, "i_clk");
  assert.deepEqual(shape(ok(src, "sub")), ["input 1 a", "output 1 b"]);
  assert.match(parseModule(src, "nope") as string, /No module called nope/);
}
// errors that name the problem
assert.match(parseModule("") as string, /No module found/);
assert.match(parseModule("module m(input my_pkg::bus_t x); endmodule") as string, /type or interface/);
assert.match(parseModule("module m(input [7:0] mem [4]); endmodule") as string, /unpacked array/);
assert.match(parseModule("module m #(parameter W = FOO) (input [W-1:0] a); endmodule") as string, /value of parameter W/);
assert.match(parseModule("module m(a, b); input a; endmodule") as string, /b is in the port list/);
assert.match(parseModule("module tb; initial $finish; endmodule") as string, /no ports/);
assert.match(parseModule("module m #(parameter type T = logic) (input T a); endmodule") as string, /Type parameters/);

// generated testbench: structure
{
  const comb = ok("module mux(input [1:0] sel, input [3:0] d, output y); assign y = d[sel]; endmodule");
  assert.equal(stimulusKind(comb), "exhaustive");
  const v = generateTestbench(comb);
  assert.match(v, /for \(tb_i = 0; tb_i < 64; tb_i = tb_i \+ 1\) begin/);
  assert.match(v, /\{sel, d\} = tb_i;/);
  assert.match(v, /mux dut \(\n {4}\.sel\(sel\),\n {4}\.d\(d\),\n {4}\.y\(y\)\n {2}\);/);
  assert.match(v, /if \(\^y === 1'bx\)/);
  assert.match(v, /ALL TESTS PASSED/);
  assert.doesNotMatch(v, /logic|assert|\$urandom/, "plain Verilog");
  const s = generateTestbench(comb, { style: "sv" });
  assert.match(s, /logic \[1:0\] sel;/);
  assert.match(s, /assert \(!\$isunknown\(y\)\)/);
  assert.match(s, /for \(int tb_i = 0; tb_i < 64; tb_i\+\+\)/);
  assert.doesNotMatch(generateTestbench(comb, { xcheck: false }), /1'bx\) begin tb_errors/);
}
{
  const seq = ok("module r #(parameter W = 40) (input clk, input rst, input [W-1:0] d, output reg [W-1:0] q); endmodule");
  const v = generateTestbench(seq, { cycles: 33, period: 20 });
  assert.match(v, /localparam W = 40;/);
  assert.match(v, /r #\(\.W\(W\)\) dut/);
  assert.match(v, /always #10 clk = ~clk;/);
  assert.match(v, /rst = 1; {3}\/\/ reset for two cycles/);
  assert.match(v, /d = \{\$random\(tb_seed\), \$random\(tb_seed\)\};/, "40 bits need two $random calls");
  assert.match(v, /tb_i < 33;/);
  assert.match(v, /always @\(posedge clk\) if \(tb_running\) model;/);
}

console.log("tbgen: all checks passed");
