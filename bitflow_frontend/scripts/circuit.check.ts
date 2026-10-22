/**
 * scripts/circuit.check.ts — self-check for lib/studio/circuit.ts (npx tsx scripts/circuit.check.ts).
 * The generated Verilog is run on the simulator by scripts/studio-sim.check.ts.
 */
import assert from "node:assert/strict";
import { GateSim, toNumber } from "../lib/gate-sim";
import {
  type Circuit, CIRCUIT_EXAMPLES, compile, defaultEvents, expectedOutputs, generateTestbench, generateVerilog, validate,
} from "../lib/studio/circuit";
import { tableFromNetlist } from "../lib/studio/logic-min";

const ex = (label: string) => CIRCUIT_EXAMPLES.find((e) => e.label === label)!.circuit;
for (const { label, circuit } of CIRCUIT_EXAMPLES) {
  assert.deepEqual(validate(circuit).filter((i) => i.level === "error"), [], label);
}

// Half adder: every combination through the gate simulator
const ha = new GateSim(compile(ex("Half adder")).net);
for (const [a, b] of [[0, 0], [0, 1], [1, 0], [1, 1]]) {
  ha.set("a", [a]); ha.set("b", [b]);
  assert.equal(ha.get("sum")[0], a ^ b);
  assert.equal(ha.get("carry")[0], a & b);
}
// ...and its truth table, through the same path the editor's "Truth table" button uses
assert.deepEqual(tableFromNetlist(compile(ex("Half adder")).net), {
  inputs: ["a", "b"], outputs: [{ name: "sum", cells: [0, 1, 1, 0] }, { name: "carry", cells: [0, 0, 0, 1] }],
});

// The Gray walk visits all 8 input combinations of the majority circuit, and the outputs follow
const maj = ex("Majority vote");
const walk = defaultEvents(maj);
assert.equal(walk.length, 7);
const seen = new Set<string>(["000"]);
const v: Record<string, number> = { a: 0, b: 0, c: 0 };
const majOut = expectedOutputs(maj, walk).map((r) => r.y);
assert.equal(majOut[0], 0);
walk.forEach((e, i) => {
  v[e.port] = e.value;
  seen.add(`${v.a}${v.b}${v.c}`);
  assert.equal(majOut[i + 1], v.a + v.b + v.c >= 2 ? 1 : 0);
});
assert.equal(seen.size, 8);

// 2-bit counter: counts clock edges, reset clears it
const cnt = new GateSim(compile(ex("2-bit counter")).net);
const value = () => cnt.get("led0")[0] + 2 * cnt.get("led1")[0];
const tick = () => { cnt.set("clk", [1]); cnt.set("clk", [0]); };
assert.equal(value(), 0);
tick(); assert.equal(value(), 1);
tick(); assert.equal(value(), 2);
tick(); tick(); assert.equal(value(), 0, "wraps");
tick(); cnt.set("rst", [1]); assert.equal(value(), 0, "async reset"); cnt.set("rst", [0]);
const seq = defaultEvents(ex("2-bit counter"), 20);
assert.equal(seq.filter((e) => e.port === "clk").length, 10, "every other step toggles the clock");

// NAND with 3 inputs is AND then NAND; a seven-segment output is 7 bits (bit 0 = a)
const nand3: Circuit = { module: "n3", parts: [
  { id: "s1", kind: "switch", x: 0, y: 0, label: "a" }, { id: "s2", kind: "switch", x: 0, y: 0, label: "b" }, { id: "s3", kind: "switch", x: 0, y: 0, label: "c" },
  { id: "g", kind: "nand", x: 0, y: 0, label: "g", n: 3 }, { id: "k1", kind: "const1", x: 0, y: 0, label: "one" },
  { id: "d", kind: "seg7", x: 0, y: 0, label: "seg" },
], wires: [
  { id: "w1", from: { part: "s1", pin: "out" }, to: { part: "g", pin: "a" } },
  { id: "w2", from: { part: "s2", pin: "out" }, to: { part: "g", pin: "b" } },
  { id: "w3", from: { part: "s3", pin: "out" }, to: { part: "g", pin: "c" } },
  { id: "w4", from: { part: "g", pin: "y" }, to: { part: "d", pin: "a" } },
  { id: "w5", from: { part: "k1", pin: "out" }, to: { part: "d", pin: "g" } },
] };
assert.deepEqual(compile(nand3).net.cells.map((c) => c.type), ["$_AND_", "$_NAND_"]);
const n3 = new GateSim(compile(nand3).net);
assert.equal(toNumber(n3.get("seg")), 0b1000001, "a = nand(0,0,0) = 1, g = 1");
n3.set("a", [1]); n3.set("b", [1]); n3.set("c", [1]);
assert.equal(toNumber(n3.get("seg")), 0b1000000);
assert.match(generateVerilog(nand3), /assign g = ~\(a & b & c\);/);
assert.match(generateVerilog(nand3), /assign seg = \{1'b1, 1'b0, 1'b0, 1'b0, 1'b0, 1'b0, g\};/);
assert.ok(validate(nand3).some((i) => /seg\.b isn't connected/.test(i.msg)));

// Problems: a loop of gates, duplicate and reserved labels
const loop: Circuit = { module: "loopy", parts: [
  { id: "a", kind: "not", x: 0, y: 0, label: "n1" }, { id: "b", kind: "not", x: 0, y: 0, label: "n2" },
], wires: [
  { id: "w1", from: { part: "a", pin: "y" }, to: { part: "b", pin: "a" } },
  { id: "w2", from: { part: "b", pin: "y" }, to: { part: "a", pin: "a" } },
] };
assert.ok(validate(loop).some((i) => i.level === "error" && /combinational loop/.test(i.msg)));
const dup = { ...ex("Half adder"), parts: ex("Half adder").parts.map((p) => (p.label === "b" ? { ...p, label: "a" } : p)) };
assert.ok(validate(dup).some((i) => /"a" is used twice/.test(i.msg)));
const res = { ...ex("Half adder"), parts: ex("Half adder").parts.map((p) => (p.label === "b" ? { ...p, label: "errors" } : p)) };
assert.ok(validate(res).some((i) => /used by the testbench/.test(i.msg)));

// Verilog and testbench shape
const cv = generateVerilog(ex("2-bit counter"));
assert.match(cv, /reg  q0 = 1'b0;/);
assert.match(cv, /always @\(posedge clk or posedge rst\) if \(rst\) q0 <= 1'b0; else q0 <= n0;/);
assert.match(cv, /assign x1 = q1 \^ q0;/);
const tb = generateTestbench(ex("Half adder"), defaultEvents(ex("Half adder")));
assert.match(tb, /a = 1'b1; #5;   \/\/ step 1/);
assert.match(tb, /if \(sum !== 1'd1\)/);
console.log("circuit: all checks passed");
