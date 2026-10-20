/**
 * scripts/waveform-diff.check.ts — self-check for the failing-test waveform diff
 * in lib/grading.ts (outputPorts, mismatchRanges). npx tsx scripts/waveform-diff.check.ts
 */
import assert from "node:assert/strict";
import { mismatchRanges, outputPorts } from "../lib/grading";
import type { VcdSignal } from "../lib/vcd-parser";

const tb = "module tb; reg clk; wire [3:0] q; counter dut(.clk(clk), .q(q)); endmodule";

// Output ports: ANSI header, non-ANSI declarations, lists, and only the instantiated module.
assert.deepEqual(outputPorts("module counter(input clk, input rst, output reg [3:0] q, output done); endmodule", tb), ["q", "done"]);
assert.deepEqual(outputPorts("module counter(clk, q, a); input clk; output [3:0] q; output a; endmodule", tb), ["q", "a"]);
assert.deepEqual(outputPorts("module counter(input clk, output wire x, y, input z); endmodule", tb), ["x", "y"]);
assert.deepEqual(
  outputPorts("module helper(output h); endmodule\nmodule counter(input clk, output [3:0] q); helper u(); endmodule", tb),
  ["q"],
);
assert.deepEqual(outputPorts("module other(output o); endmodule", tb), []);

// Mismatch ranges: merged, x in expected is a don't-care, open-ended until maxTime.
const sig = (id: string, changes: [number, string][]): VcdSignal =>
  ({ id, name: id, width: changes[0][1].length, type: "wire", changes: changes.map(([time, value]) => ({ time, value })) });

const want = sig("e", [[0, "0000"], [10, "0001"], [20, "0010"], [30, "0011"]]);
assert.deepEqual(mismatchRanges([{ got: sig("g", [[0, "0000"], [10, "0001"], [20, "0010"], [30, "0011"]]), want }], 40), []);
assert.deepEqual(
  mismatchRanges([{ got: sig("g", [[0, "0000"], [10, "0001"], [20, "0011"], [30, "0100"]]), want }], 40),
  [{ from: 20, to: 40 }],
);
assert.deepEqual(
  mismatchRanges([{ got: sig("g", [[0, "0000"], [10, "1111"], [20, "0010"], [30, "0011"]]), want }], 40),
  [{ from: 10, to: 20 }],
);
// Don't-care: expected "x" bits never count as a difference.
assert.deepEqual(mismatchRanges([{ got: sig("g", [[0, "1"]]), want: sig("e", [[0, "x"]]) }], 10), []);
// Several outputs: any one differing marks the time.
assert.deepEqual(
  mismatchRanges([
    { got: sig("a", [[0, "0"], [5, "1"]]), want: sig("A", [[0, "0"], [5, "1"]]) },
    { got: sig("b", [[0, "0"]]), want: sig("B", [[0, "0"], [7, "1"], [9, "0"]]) },
  ], 12),
  [{ from: 7, to: 9 }],
);

console.log("waveform diff: all checks passed");
