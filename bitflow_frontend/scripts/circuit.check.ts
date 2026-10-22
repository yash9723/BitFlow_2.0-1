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
import { History, NONE, copy, inRect, merge, move, nextLabel, paste, remove, selectAll, wirePath } from "../lib/studio/circuit-edit";
import { toBits } from "../lib/studio/circuit";
import { PART_CASES } from "./circuit-cases";

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

// Editing (lib/studio/circuit-edit.ts)
const half = ex("Half adder");
const boxed = inRect(half, { x1: 60, y1: 100, x2: 160, y2: 300 });
assert.deepEqual(boxed.parts, ["p1", "p2"], "box select: the two switches");
assert.deepEqual(boxed.wires, []);
assert.equal(selectAll(half).wires.length, 6);
// Copying the XOR with both switches brings the wires between them
const clip = copy(half, { ...NONE, parts: ["p1", "p2", "p3"] });
assert.equal(clip.wires.length, 2);
let uidN = 0;
const { circuit: pasted, sel: pastedSel } = paste(half, clip, 20, 20, (p) => `${p}_${++uidN}`);
assert.equal(pasted.parts.length, 9);
assert.equal(pasted.wires.length, 8);
assert.deepEqual(pasted.parts.slice(6).map((p) => p.label), ["a2", "b2", "s_xor2"], "pasted labels don't clash");
assert.deepEqual(validate(pasted).filter((i) => i.level === "error"), []);
assert.ok(pasted.wires.slice(6).every((w) => pastedSel.parts.includes(w.from.part) && pastedSel.parts.includes(w.to.part)));
assert.deepEqual([pasted.parts[6].x, pasted.parts[6].y], [100, 140]);
// Move and delete (deleting a part takes its wires)
const moved = move(half, { ...NONE, parts: ["p1"] }, 10, -20);
assert.deepEqual([moved.parts[0].x, moved.parts[0].y], [90, 100]);
const removed = remove(half, { ...NONE, parts: ["p1"] });
assert.equal(removed.parts.length, 5);
assert.equal(removed.wires.length, 4);
assert.equal(nextLabel("a", new Set(["a", "a2"])), "a3");
assert.equal(nextLabel("sw3", new Set(["sw3"])), "sw4");
assert.deepEqual(merge({ ...NONE, parts: ["x", "y"] }, { ...NONE, parts: ["y", "z"] }, true).parts, ["x", "z"], "shift-click toggles");
// Undo history: one entry per edit, one per group (a drag)
const h = new History();
h.push(half, "", 0); h.push(moved, "", 1);
assert.equal(h.undo(removed), moved);
assert.equal(h.undo(moved), half);
assert.equal(h.undo(half), null);
assert.equal(h.redo(half), moved);
const g = new History();
g.push(half, "drag1", 0); g.push(moved, "drag1", 100);
assert.equal(g.undo(removed), half, "a drag is one undo step");
assert.equal(g.undo(half), null);
// A bent wire runs through its bend; notes become comments and don't change the logic
assert.equal(wirePath({ x: 0, y: 0 }, { x: 100, y: 50 }, 0, 30), "M 0 0 H 30 V 50 H 100");
const noted = { ...half, notes: [{ id: "n1", x: 0, y: 0, text: "sum is a XOR b\ncarry is a AND b" }] };
assert.match(generateVerilog(noted), /\/\/ Note: sum is a XOR b carry is a AND b\nmodule half_adder/);

// Buses and the newer parts, in the gate simulator (scripts/circuit-cases.ts; studio-sim runs their Verilog on Icarus)
for (const [name, circuit] of Object.entries(PART_CASES)) {
  assert.deepEqual(validate(circuit).filter((i) => i.level === "error"), [], name);
}
const sim = (name: keyof typeof PART_CASES) => new GateSim(compile(PART_CASES[name]).net);
const num = (s: GateSim, port: string) => toNumber(s.get(port));
const put = (s: GateSim, port: string, v: number) => s.set(port, toBits(v, s.ports[port].bits.length));
const add = sim("adder4");
for (let a = 0; a < 16; a++) for (let b = 0; b < 16; b++) for (const cin of [0, 1]) {
  put(add, "a", a); put(add, "b", b); put(add, "cin", cin);
  assert.equal(num(add, "sum") + 16 * num(add, "cout"), a + b + cin, `add ${a}+${b}+${cin}`);
}
const cmp = sim("cmp3");
for (let a = 0; a < 8; a++) for (let b = 0; b < 8; b++) {
  put(cmp, "a", a); put(cmp, "b", b);
  assert.deepEqual([num(cmp, "eq"), num(cmp, "lt"), num(cmp, "gt")], [+(a === b), +(a < b), +(a > b)], `cmp ${a} ${b}`);
}
const dec = sim("decoder3");
for (let s = 0; s < 8; s++) { put(dec, "sel", s); assert.equal(num(dec, "y"), 1 << s, `decoder ${s}`); }
const swp = sim("swap");
for (let x = 0; x < 16; x++) { put(swp, "x", x); assert.equal(num(swp, "y"), (x & 0b1001) | ((x & 2) << 1) | ((x & 4) >> 1), `swap ${x}`); }
const bw = sim("bitwise");
put(bw, "a", 0b1100); put(bw, "b", 0b1010);
assert.deepEqual([num(bw, "y_and"), num(bw, "y_xor"), num(bw, "y_not"), num(bw, "y_mux")], [0b1000, 0b0110, 0b0011, 0b1100]);
put(bw, "s", 1); assert.equal(num(bw, "y_mux"), 0b1010);
// Register: loads only when enabled; the counter's unconnected enable reads 1, so it counts every edge and wraps
const rc = sim("regcount");
const clk = (s: GateSim) => { put(s, "clk", 1); put(s, "clk", 0); };
put(rc, "d", 9); clk(rc);
assert.deepEqual([num(rc, "q"), num(rc, "count")], [0, 1], "no load without en");
put(rc, "load", 1); clk(rc);
assert.deepEqual([num(rc, "q"), num(rc, "count")], [9, 2]);
put(rc, "load", 0); put(rc, "d", 3); clk(rc);
assert.equal(num(rc, "q"), 9, "holds");
for (let i = 0; i < 5; i++) clk(rc);
assert.equal(num(rc, "count"), (3 + 5) % 8, "wraps");
put(rc, "rst", 1); assert.equal(num(rc, "q"), 0, "async reset"); put(rc, "rst", 0);
// T toggles when t = 1; JK: 00 hold, 01 reset, 10 set, 11 toggle
const tj = sim("tjk");
clk(tj); assert.equal(num(tj, "t_out"), 0);
put(tj, "t", 1); clk(tj); assert.equal(num(tj, "t_out"), 1); clk(tj); assert.equal(num(tj, "t_out"), 0);
const jk = (j: number, k: number) => { put(tj, "j", j); put(tj, "k", k); clk(tj); return num(tj, "jk_out"); };
assert.deepEqual([jk(1, 0), jk(0, 0), jk(1, 1), jk(1, 1), jk(0, 1), jk(0, 0)], [1, 1, 0, 1, 0, 0]);
const k5 = sim("const5");
put(k5, "x", 18); assert.equal(num(k5, "hit"), 0); put(k5, "x", 19); assert.equal(num(k5, "hit"), 1);
// Widths: a 4-bit pin into a 1-bit pin is an error; Verilog declares buses and multi-output signals
const mismatch: Circuit = { ...PART_CASES.adder4, wires: [...PART_CASES.adder4.wires.filter((w) => w.to.part !== "cout_id"),
  { id: "bad", from: { part: "add_id", pin: "sum" }, to: { part: "cout_id", pin: "in" } }] };
assert.ok(validate(mismatch).some((i) => i.level === "error" && /is 4 bits but cout\.in takes 1/.test(i.msg)));
const av = generateVerilog(PART_CASES.adder4);
assert.match(av, /input  wire \[3:0\] a/);
assert.match(av, /assign \{add_cout, add_sum\} = a \+ b \+ cin;/);
assert.match(generateVerilog(PART_CASES.regcount), /always @\(posedge clk or posedge rst\) if \(rst\) r <= 4'd0; else if \(load\) r <= d;/);
assert.match(generateVerilog(PART_CASES.regcount), /always @\(posedge clk\) cnt <= cnt \+ 1'b1;/);
// Bus inputs in the testbench walk: every combination of the bits, one bit at a time
assert.equal(defaultEvents(PART_CASES.cmp3).length, 63);
assert.match(generateTestbench(PART_CASES.cmp3, defaultEvents(PART_CASES.cmp3)), /a = 3'd1; #5;/);
console.log("circuit: all checks passed");
