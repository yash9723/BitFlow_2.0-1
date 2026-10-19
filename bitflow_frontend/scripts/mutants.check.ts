/**
 * scripts/mutants.check.ts — self-check for lib/mutants.ts (npx tsx scripts/mutants.check.ts).
 */
import assert from "node:assert/strict";
import { generateMutants, parseMutants, pickMutants } from "../lib/mutants";

const dut = [
  "module t(input clk, input rst, input [3:0] a, input [3:0] b, output reg [3:0] q, output y);",
  "  // a + b == 3 in a comment, and \"a & b\" never changes",
  "  wire [3:0] s = a + b;",
  "  assign y = (a == b) ? 1'b1 : 1'b0;",
  "  always @(posedge clk) begin",
  "    if (rst) q <= 4'd0;",
  "    else q <= s & ~b;",
  "  end",
  "endmodule",
].join("\n");

const ms = generateMutants(dut);
const byLine = (n: number) => ms.filter((m) => m.line === n).map((m) => m.description.replace(` on line ${n}`, ""));

assert.deepEqual(byLine(1), [], "port list untouched");
assert.deepEqual(byLine(2), [], "comments untouched");
assert.deepEqual(byLine(3), ["'+' became '-'"], "declaration with an initialiser is mutated");
assert.deepEqual(byLine(4), [
  "'==' became '!='", "the constant 1'b1 became 1'b0", "the constant 1'b0 became 1'b1", "the two branches of a ?: were swapped",
]);
assert.deepEqual(byLine(5), ["'posedge' became 'negedge'"]);
assert.deepEqual(byLine(6), ["the constant 4'd0 became 4'd1", "an if-condition was inverted"], "'<=' assignment is not a comparison");
assert.deepEqual(byLine(7), ["'&' became '|'", "a '~' was removed"]);

for (const m of ms) {
  const a = dut.split("\n"), b = m.code.split("\n");
  assert.equal(a.length, b.length);
  assert.deepEqual(a.map((l, i) => (l === b[i] ? 0 : i + 1)).filter(Boolean), [m.line], `${m.id} changes only line ${m.line}`);
}
assert.equal(new Set(ms.map((m) => m.id)).size, ms.length, "ids unique");
assert.ok(ms.find((m) => m.kind === "condition")!.code.includes("if (!(rst)) q <= 4'd0;"));
assert.ok(ms.find((m) => m.kind === "ternary")!.code.includes("? 1'b0 : 1'b1;"));
assert.deepEqual(generateMutants(dut), ms, "deterministic");

const picked = pickMutants(ms, 4);
assert.equal(picked.length, 4);
assert.equal(new Set(picked.map((m) => m.kind)).size, 4, "round-robin across kinds");
assert.deepEqual(parseMutants(JSON.stringify(picked)), picked);
assert.deepEqual(parseMutants("nope"), []);

console.log(`mutants: all checks passed (${ms.length} mutants)`);
