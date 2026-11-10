/** scripts/trace.check.ts — "Trace the bug" (lib/trace.ts) on planted bugs: the right output, time, root signal and line. */
import assert from "node:assert/strict";
import type { ParsedVcd, VcdSignal } from "../lib/vcd-parser";
import { cycleAt, firstDifference, rhsSignals, show, timeText, traceBug } from "../lib/trace";

const sig = (name: string, width: number, changes: [number, string][]): VcdSignal =>
  ({ id: name, name, width, type: "wire", changes: changes.map(([time, value]) => ({ time, value })) });
const vcd = (...signals: VcdSignal[]): ParsedVcd => ({ timescale: "1ns", signals, maxTime: 100 });
const clk = sig("clk", 1, [[0, "0"], [5, "1"], [10, "0"], [15, "1"], [20, "0"], [25, "1"], [30, "0"], [35, "1"], [40, "0"]]);
const lineOf = (code: string, text: string) => code.split("\n").findIndex((l) => l.includes(text)) + 1;

// ── Helpers ──
assert.equal(firstDifference(sig("y", 1, [[0, "0"], [10, "1"]]), sig("y", 1, [[0, "0"], [10, "0"]])), 10);
assert.equal(firstDifference(sig("y", 2, [[0, "01"]]), sig("y", 2, [[0, "x1"]])), null, "x in expected is a don't-care");
assert.equal(cycleAt(vcd(clk), 15), 2);
assert.equal(cycleAt(vcd(sig("a", 1, [])), 15), null, "no clock");
assert.equal(show("0101"), "5");
assert.equal(timeText(15000, "1ps"), "15 ns");
assert.equal(timeText(1500, "1ps"), "1500 ps");
assert.equal(timeText(25, "1ns"), "25 ns");
assert.equal(timeText(0, "1ps"), "0 ps");
assert.equal(timeText(7, "?"), "t=7");
assert.equal(show("01x1"), "01x1");
assert.deepEqual(rhsSignals("assign y = a & b;\n", 1), ["a", "b"]);
assert.deepEqual(rhsSignals("  count <= count + 4'd1;", 1), ["count"]);
assert.deepEqual(rhsSignals("assign y = sel ? a : 8'hFF; // b", 1), ["sel", "a"], "literals and comments ignored");

// ── 1. Wrong gate: | instead of & ──
{
  const code = "module m(input a, input b, output y);\n  assign y = a | b;\nendmodule\n";
  const a = sig("a", 1, [[0, "0"], [10, "1"], [20, "1"]]), b = sig("b", 1, [[0, "0"], [20, "1"]]);
  const steps = traceBug(vcd(a, b, sig("y", 1, [[0, "0"], [10, "1"]])), vcd(a, b, sig("y", 1, [[0, "0"], [20, "1"]])), ["y"], code);
  assert.equal(steps.length, 2);
  assert.match(steps[0].title, /^y first goes wrong at 10 ns: yours is 1, expected 0/);
  assert.equal(steps[0].line, 2);
  assert.match(steps[0].detail!, /a = 1, b = 0/);
  assert.match(steps[1].title, /No signal inside your design/);
  assert.equal(steps[1].line, 2, "points back at the driving line");
}

// ── 2. Off-by-one counter: count goes wrong before the done output ──
{
  const code = [
    "module c(input clk, input rst, output done);",
    "  reg [3:0] count;",
    "  always @(posedge clk) begin",
    "    if (rst) count <= 4'd0;",
    "    else count <= count + 4'd2;",
    "  end",
    "  assign done = (count == 4'd4);",
    "endmodule", ""].join("\n");
  const rst = sig("rst", 1, [[0, "1"], [8, "0"]]);
  const yours = vcd(clk, rst, sig("count", 4, [[5, "0000"], [15, "0010"], [25, "0100"]]), sig("done", 1, [[0, "0"], [25, "1"]]));
  const want  = vcd(clk, rst, sig("count", 4, [[5, "0000"], [15, "0001"], [25, "0010"], [35, "0011"]]), sig("done", 1, [[0, "0"]]));
  const steps = traceBug(yours, want, ["done"], code);
  assert.match(steps[0].title, /^done first goes wrong at 25 ns \(clock cycle 3\)/);
  assert.equal(steps[0].line, lineOf(code, "assign done"));
  assert.match(steps[1].title, /Earlier, count already differs .* at 15 ns \(clock cycle 2\)/);
  assert.equal(steps[1].line, lineOf(code, "count + 4'd2"), "root cause is the increment");
  assert.match(steps[1].detail!, /Just before that clock edge: count = 0\./, "a clocked line shows the values it sampled");
}

// ── 3. Wrong reset value on an output register ──
{
  const code = "module r(input clk, input rst, output reg q);\n  always @(posedge clk)\n    if (rst) q <= 1'b1;\n    else q <= ~q;\nendmodule\n";
  const rst = sig("rst", 1, [[0, "1"], [12, "0"]]);
  const steps = traceBug(vcd(clk, rst, sig("q", 1, [[5, "1"], [15, "0"]])), vcd(clk, rst, sig("q", 1, [[5, "0"], [15, "1"]])), ["q"], code);
  assert.match(steps[0].title, /^q first goes wrong at 5 ns \(clock cycle 1\): yours is 1, expected 0/);
  assert.equal(steps[0].line, 3, "in reset: the reset branch");
  const later = traceBug(vcd(clk, rst, sig("q", 1, [[5, "0"], [15, "0"]])), vcd(clk, rst, sig("q", 1, [[5, "0"], [15, "1"]])), ["q"], code);
  assert.equal(later[0].line, 4, "out of reset: the toggle");
}

// ── 4. Swapped mux inputs ──
{
  const code = "module x(input sel, input [3:0] a, input [3:0] b, output [3:0] y);\n  assign y = sel ? b : a;\nendmodule\n";
  const ins = [sig("sel", 1, [[0, "0"], [30, "1"]]), sig("a", 4, [[0, "0011"]]), sig("b", 4, [[0, "1001"]])];
  const steps = traceBug(vcd(...ins, sig("y", 4, [[0, "0011"], [30, "1001"]])), vcd(...ins, sig("y", 4, [[0, "1001"], [30, "0011"]])), ["y"], code);
  assert.match(steps[0].title, /^y first goes wrong at 0 ns: yours is 3, expected 9/);
  assert.match(steps[0].detail!, /At that moment: sel = 0, b = 9, a = 3\./, "in the order the line reads them");
}

// ── 5. Bug inside a submodule: the deeper signal is the root ──
{
  const code = [
    "module add(input [3:0] p, input [3:0] q, output [3:0] s);",
    "  assign s = p - q;",
    "endmodule",
    "module top(input [3:0] a, input [3:0] b, output [3:0] sum);",
    "  add u_add(.p(a), .q(b), .s(sum));",
    "endmodule", ""].join("\n");
  const ins = [sig("a", 4, [[0, "0011"]]), sig("b", 4, [[0, "0001"]]), sig("u_add.p", 4, [[0, "0011"]]), sig("u_add.q", 4, [[0, "0001"]])];
  const steps = traceBug(
    vcd(...ins, sig("u_add.s", 4, [[0, "0010"]]), sig("sum", 4, [[0, "0010"]])),
    vcd(...ins, sig("u_add.s", 4, [[0, "0100"]]), sig("sum", 4, [[0, "0100"]])), ["sum"], code);
  assert.match(steps[1].title, /u_add\.s differs from a correct design at the same moment/);
  assert.equal(steps[1].line, 2, "the subtraction inside the adder");
  assert.match(steps[1].detail!, /p = 3, q = 1/);
}

// ── 6. Agreeing runs, VHDL (no lines), unknown output ──
{
  const y = sig("y", 1, [[0, "1"]]);
  assert.deepEqual(traceBug(vcd(y), vcd(y), ["y"], "x"), [], "nothing to trace");
  const steps = traceBug(vcd(sig("y", 1, [[0, "1"]])), vcd(sig("y", 1, [[0, "0"]])), ["y"], null);
  assert.equal(steps[0].line, null, "VHDL: no line numbers");
  assert.equal(steps[0].detail, null);
  assert.deepEqual(traceBug(vcd(sig("z", 1, [[0, "1"]])), vcd(sig("z", 1, [[0, "0"]])), ["y"], "x"), [], "only an output can start a trace");
}

console.log("trace: all checks passed");
