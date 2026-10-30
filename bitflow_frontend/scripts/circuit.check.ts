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
import {
  type Selection, History, NONE, blockNameIssue, copy, frameTransform, inRect, junctions, makeBlock, merge, move, nextLabel, paste, pinDir, pinPos, remove, renameBlock, selectAll, simplify, size, turnParts, ungroupBlock, uprightTransform, usesBlock, wireRoute, withBlock, wirePath,
} from "../lib/studio/circuit-edit";
import { netlistToCircuit } from "../lib/studio/circuit-import";
import { type Part, ALU_OPS, BCD7, busConflicts, inputParts, outputParts, portWidth, romWord, toBits } from "../lib/studio/circuit";
import { crossesPart, routeAll } from "../lib/studio/circuit-route";
import { DEFAULT_DELAYS, DelaySim, findHazards, transientToParsed } from "../lib/studio/delay-sim";
import { circuitFromTable } from "../lib/studio/logic-circuit";
import { PART_CASES } from "./circuit-cases";
import { longestPath, traceToParsed, traceToVcd } from "../lib/studio/circuit-analysis";
import { parseVcd } from "../lib/vcd-parser";

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
// The selecting parts: every select value, with one data input high at a time
const m4 = sim("mux4");
for (let s = 0; s < 4; s++) for (let d = 0; d < 4; d++) {
  put(m4, "s", s);
  for (let i = 0; i < 4; i++) put(m4, `d${i}`, +(i === d));
  assert.equal(num(m4, "y"), +(s === d), `mux4 s=${s} d=${d}`);
}
const m8 = sim("mux8");
put(m8, "a", 2); put(m8, "b", 3);
assert.deepEqual([0, 1, 7].map((s) => { put(m8, "s", s); return num(m8, "y"); }), [2, 0, 3], "open inputs read 0");
const dm = sim("demux4");
for (let s = 0; s < 4; s++) for (const d of [0, 1]) {
  put(dm, "s", s); put(dm, "d", d);
  for (let i = 0; i < 4; i++) assert.equal(num(dm, `y${i}`), +(i === s) & d, `demux s=${s} d=${d} y${i}`);
}
const en = sim("encoder4");
for (let i = 0; i < 4; i++) { put(en, "x", 1 << i); assert.deepEqual([num(en, "y"), num(en, "ok")], [i, 1], `encoder ${i}`); }
put(en, "x", 0); assert.deepEqual([num(en, "y"), num(en, "ok")], [0, 0]);
put(en, "x", 0b0110); assert.equal(num(en, "y"), 1 | 2, "several set: their numbers OR");
const pr = sim("priority8");
for (let x = 0; x < 256; x++) {
  put(pr, "x", x);
  assert.deepEqual([num(pr, "y"), num(pr, "ok")], [x ? Math.floor(Math.log2(x)) : 0, +(x > 0)], `priority ${x}`);
}
const bc = sim("bcd");
for (let d = 0; d < 16; d++) { put(bc, "d", d); assert.equal(num(bc, "seg"), BCD7[d], `bcd ${d}`); }
assert.equal(BCD7[8], 0x7f, "8 lights every segment");
assert.equal(BCD7[1], 0b0000110, "1 lights b and c");
// ALU: every operation on every pair of 3-bit values
const au = sim("alu3");
const signed = (v: number) => (v >= 4 ? v - 8 : v);
for (let a = 0; a < 8; a++) for (let b = 0; b < 8; b++) for (let op = 0; op < 8; op++) {
  put(au, "a", a); put(au, "b", b); put(au, "op", op);
  const want = [a + b, a - b, a & b, a | b, a ^ b, +(signed(a) < signed(b)), ~a, a][op] & 7;
  const carry = op === 0 ? +(a + b > 7) : op === 1 ? +(a >= b) : 0;
  assert.deepEqual([num(au, "y"), num(au, "z"), num(au, "c")], [want, +(want === 0), carry], `${ALU_OPS[op]} ${a} ${b}`);
}
// Shift register: right, left, parallel load, and the bit leaving on so
const sr = sim("shift4");
const stepS = () => clk(sr);
put(sr, "si", 1); stepS(); assert.deepEqual([num(sr, "q"), num(sr, "so")], [0b1000, 0], "enters at the top going right");
stepS(); stepS(); stepS(); assert.deepEqual([num(sr, "q"), num(sr, "so")], [0b1111, 1], "four shifts fill it; so is bit 0");
put(sr, "si", 0); put(sr, "dir", 1); stepS(); assert.deepEqual([num(sr, "q"), num(sr, "so")], [0b1110, 1], "left: enters at bit 0; so is the top bit");
put(sr, "d", 0b0101); put(sr, "load", 1); stepS(); assert.equal(num(sr, "q"), 0b0101, "parallel load");
put(sr, "load", 0); put(sr, "rst", 1); assert.equal(num(sr, "q"), 0, "async reset"); put(sr, "rst", 0);
// ROM reads its words; a word past the data reads 0, and too wide a word is cut to fit
const rm = sim("rom4");
assert.deepEqual([0, 1, 2, 3].map((a) => { put(rm, "addr", a); return num(rm, "q"); }), [3, 9, 0, 15]);
const romPart = PART_CASES.rom4.parts.find((p) => p.kind === "rom")!;
assert.equal(romWord(romPart, 200), 0);
assert.equal(romWord({ ...romPart, data: [0x1f3] }, 0), 3);
// RAM: writes only on a clock edge with we = 1; words keep their own values; reads at once
const rw = sim("ram4");
const write = (a: number, d: number) => { put(rw, "addr", a); put(rw, "d", d); put(rw, "we", 1); clk(rw); put(rw, "we", 0); };
write(0, 2); write(3, 1);
assert.deepEqual([0, 1, 2, 3].map((a) => { put(rw, "addr", a); return num(rw, "q"); }), [2, 0, 0, 1]);
put(rw, "addr", 0); put(rw, "d", 3); clk(rw); assert.equal(num(rw, "q"), 2, "no write without we");
// Keypad: one 5-bit port, split into code and pressed
const kp = sim("keys");
put(kp, "pad", 16 + 11); assert.deepEqual([num(kp, "code"), num(kp, "idle")], [11, 0]);
put(kp, "pad", 0); assert.deepEqual([num(kp, "code"), num(kp, "idle")], [0, 1]);
// Tri-state bus: whichever driver is enabled; two at once is flagged, none reads 0
const tb2 = compile(PART_CASES.tribus), tsim = new GateSim(tb2.net);
put(tsim, "a", 1); put(tsim, "b", 2);
const readPin = (r: { part: string; pin: string }) => toNumber((tb2.bitsOf(r) ?? []).map((b) => tsim.net(b)));
assert.equal(num(tsim, "y"), 0, "no driver enabled");
assert.deepEqual(busConflicts(PART_CASES.tribus, readPin), []);
put(tsim, "ea", 1); assert.equal(num(tsim, "y"), 1);
put(tsim, "ea", 0); put(tsim, "eb", 1); assert.equal(num(tsim, "y"), 2);
assert.deepEqual(busConflicts(PART_CASES.tribus, readPin), []);
put(tsim, "ea", 1); assert.deepEqual(busConflicts(PART_CASES.tribus, readPin), ["line"]);
const sharedEn = { ...PART_CASES.tribus, wires: PART_CASES.tribus.wires.map((w) => (w.to.part === "tb_id" && w.to.pin === "en" ? { ...w, from: { part: "ea_id", pin: "out" } } : w)) };
assert.ok(validate(sharedEn).some((i) => /share an enable/.test(i.msg)));
const notTri = { ...PART_CASES.tribus, wires: PART_CASES.tribus.wires.map((w) => (w.from.part === "tb_id" ? { ...w, from: { part: "b_id", pin: "out" } } : w)) };
assert.ok(validate(notTri).some((i) => /other than a tri-state/.test(i.msg)));
// A helper name the part declares is taken: a part labelled like it is an error, not bad Verilog
const clash: Circuit = { ...PART_CASES.alu3, parts: [...PART_CASES.alu3.parts, { id: "k", kind: "const", x: 0, y: 0, label: "u_sum", w: 3 }] };
assert.ok(validate(clash).some((i) => /"u_sum" is used twice/.test(i.msg)));
// The largest RAM still simulates and validates without trouble
const big: Circuit = { module: "big", parts: [{ id: "c", kind: "clock", x: 0, y: 0, label: "clk" }, { id: "w", kind: "switch", x: 0, y: 0, label: "we" }, { id: "a", kind: "hexin", x: 0, y: 0, label: "addr", w: 8 },
  { id: "d", kind: "hexin", x: 0, y: 0, label: "d", w: 16 }, { id: "r", kind: "ram", x: 0, y: 0, label: "mem", n: 8, w: 16 }, { id: "q", kind: "hexout", x: 0, y: 0, label: "q", w: 16 }],
wires: ([["c", "out", "r", "clk"], ["w", "out", "r", "we"], ["a", "out", "r", "addr"], ["d", "out", "r", "d"], ["r", "q", "q", "in"]] as const).map(([f, fp, t, tp], i) => ({ id: `b${i}`, from: { part: f, pin: fp }, to: { part: t, pin: tp } })) };
const t0 = Date.now();
assert.deepEqual(validate(big).filter((i) => i.level === "error"), []);
const bs = new GateSim(compile(big).net);
put(bs, "addr", 200); put(bs, "d", 0xbeef); put(bs, "we", 1); clk(bs); put(bs, "we", 0);
put(bs, "addr", 199); assert.equal(num(bs, "q"), 0);
put(bs, "addr", 200); assert.equal(num(bs, "q"), 0xbeef);
assert.ok(Date.now() - t0 < 3000, `256 x 16 RAM took ${Date.now() - t0} ms`);

// Tunnels join by name, with no wire; two tunnel-ins or two widths on one net are errors
const tn = sim("tunnels");
for (let x = 0; x < 8; x++) { put(tn, "x", x); assert.deepEqual([num(tn, "a"), num(tn, "b"), num(tn, "z")], [x, ~x & 7, 0], `tunnel ${x}`); }
const tc = PART_CASES.tunnels;
assert.ok(validate({ ...tc, parts: [...tc.parts, { id: "s2", kind: "tunin", x: 0, y: 0, label: "send2", w: 3, net: "bus3" }] }).some((i) => i.level === "error" && /Two tunnel-ins/.test(i.msg)));
assert.ok(validate({ ...tc, parts: tc.parts.map((p) => (p.label === "r2" ? { ...p, w: 2 } : p)) }).some((i) => i.level === "error" && /is 3 bits at send but 2 at r2/.test(i.msg)));
assert.ok(validate(tc).some((i) => i.level === "warning" && /Nothing drives the net "nothing"/.test(i.msg)));
assert.match(generateVerilog(tc), /assign r1 = x;\s+\/\/ net bus3/);

// Rotation and flipping: pins go round the box, the box stays centred, the logic and Verilog don't change
const g2: Part = { id: "g", kind: "and", x: 100, y: 100, label: "g" };
const at = (p: Part, pin: string) => { const q = pinPos(p, pin); return [q.x, q.y]; };
assert.deepEqual([size(g2), at(g2, "y"), pinDir(g2, "y"), pinDir(g2, "a")], [{ w: 64, h: 44 }, [164, 122], { x: 1, y: 0 }, { x: -1, y: 0 }]);
const r90 = { ...g2, rot: 90 };
assert.deepEqual(size(r90), { w: 44, h: 64 });
assert.deepEqual(at(r90, "y"), [122, 164], "the output now faces down");
assert.deepEqual([pinDir(r90, "y"), pinDir(r90, "a")], [{ x: 0, y: 1 }, { x: 0, y: -1 }]);
assert.deepEqual(at({ ...g2, rot: 180 }, "y"), [100, 122]);
assert.deepEqual(pinDir({ ...g2, rot: 270 }, "y"), { x: 0, y: -1 });
assert.deepEqual(at({ ...g2, flip: true }, "y"), [100, 122], "flip mirrors left and right");
assert.ok(at({ ...g2, flip: true }, "a")[0] === 164 && Math.abs(at({ ...g2, flip: true }, "a")[1] - at(g2, "a")[1]) < 1e-9, "the inputs keep their heights");
for (const rot of [0, 90, 180, 270]) for (const flip of [false, true]) {
  const p = { ...g2, rot, flip }, s = size(p);
  for (const pin of ["a", "b", "y"]) {
    const q = pinPos(p, pin), d = pinDir(p, pin);
    assert.ok(q.x >= p.x && q.x <= p.x + s.w && q.y >= p.y && q.y <= p.y + s.h, `${rot} ${flip} ${pin} on the box`);
    assert.ok((d.x === -1 && q.x === p.x) || (d.x === 1 && q.x === p.x + s.w) || (d.y === -1 && q.y === p.y) || (d.y === 1 && q.y === p.y + s.h), `${rot} ${flip} ${pin} faces outward`);
  }
}
const ha0 = ex("Half adder"), all0 = selectAll(ha0);
let turned = ha0;
turned = turnParts(turned, all0, "rotate");
assert.deepEqual(turned.parts.map((p) => p.rot), ha0.parts.map(() => 90));
assert.equal(generateVerilog(turned), generateVerilog(ha0), "turning changes nothing but the drawing");
assert.deepEqual(compile(turned).net, compile(ha0).net);
const fourTimes = [1, 2, 3].reduce((x) => turnParts(x, all0, "rotate"), turned);
assert.deepEqual(fourTimes.parts.map((p) => [p.x, p.y, p.rot]), ha0.parts.map((p) => [p.x, p.y, 0]), "four turns: back where it started");
assert.deepEqual(turnParts(turnParts(ha0, all0, "flip"), all0, "flip").parts.map((p) => !!p.flip), ha0.parts.map(() => false));
assert.equal(uprightTransform({}, 1, 2), undefined);
assert.ok(frameTransform(g2) === undefined && frameTransform(r90)!.includes("rotate(90"));

// Junction dots: at the point where wires of a net part ways, not at their shared start
assert.deepEqual(junctions([[[0, 0], [50, 0], [50, 40]], [[0, 0], [100, 0]]]), [[50, 0]]);
assert.deepEqual(junctions([[[0, 0], [50, 0], [50, 40]], [[0, 0], [50, 0], [50, 20], [90, 20]]]), [[50, 20]]);
assert.deepEqual(junctions([[[0, 0], [50, 0]], [[0, 0], [0, 50]]]), [], "parting at the pin itself needs no dot");
assert.deepEqual(simplify([[0, 0], [0, 0], [5, 0], [9, 0], [9, 4]]), [[0, 0], [9, 0], [9, 4]]);

// Auto-route: orthogonal, starts and ends on the pins, never through a part, and doesn't touch the logic
const routeCheck = (c: Circuit, label: string) => {
  const r = routeAll(c);
  assert.equal(generateVerilog(r), generateVerilog(c), `${label}: routing is only drawing`);
  let routed = 0;
  for (const w of r.wires) {
    if (!w.route) continue;
    routed++;
    const a = r.parts.find((p) => p.id === w.from.part)!, b = r.parts.find((p) => p.id === w.to.part)!;
    assert.deepEqual(wireRoute(w, a, b), w.route, `${label}: the route fits its pins`);
    w.route.slice(1).forEach(([x, y], i) => assert.ok(x === w.route![i][0] || y === w.route![i][1], `${label}: orthogonal`));
    for (const p of r.parts) assert.ok(!crossesPart(w.route, p), `${label}: ${a.label}.${w.from.pin} -> ${b.label}.${w.to.pin} runs through ${p.label}`);
  }
  return { routed, total: r.wires.length };
};
for (const { label, circuit } of CIRCUIT_EXAMPLES) {
  const { routed, total } = routeCheck(circuit, label);
  assert.equal(routed, total, `${label}: every wire found a path`);
  routeCheck(turnParts(circuit, { ...NONE, parts: circuit.parts.filter((_, i) => i % 2).map((p) => p.id) }, "rotate"), `${label} turned`);
}
const dense = circuitFromTable({ inputs: ["a", "b", "c", "d"], outputs: [{ name: "x", cells: Array.from({ length: 16 }, (_, m) => ((m * 7 + 3) % 5 < 2 ? 1 : 0)) }, { name: "y", cells: Array.from({ length: 16 }, (_, m) => ((m * 11) % 3 ? 1 : 0)) }] }, "nand");
const t1 = Date.now();
const denseResult = routeCheck(dense, "generated circuit");
assert.ok(denseResult.routed === denseResult.total, `generated circuit: ${denseResult.routed} of ${denseResult.total}`);
assert.ok(Date.now() - t1 < 8000, `routing ${denseResult.total} wires took ${Date.now() - t1} ms`);
// Moving both ends carries a route along; moving one end drops it back to the default
const rt = routeAll(ha0), wr = rt.wires[0];
const movedBoth = move(rt, { ...NONE, parts: [wr.from.part, wr.to.part] }, 20, 30).wires[0];
assert.deepEqual(movedBoth.route![0], [wr.route![0][0] + 20, wr.route![0][1] + 30]);
const movedOne = move(rt, { ...NONE, parts: [wr.from.part] }, 20, 30);
const ma = movedOne.parts.find((p) => p.id === wr.from.part)!, mb = movedOne.parts.find((p) => p.id === wr.to.part)!;
assert.notDeepEqual(wireRoute(movedOne.wires[0], ma, mb), movedOne.wires[0].route, "a route that no longer fits is ignored");

// Delays: the textbook static hazard shows up, in the time the delays predict
const hz = ex("Static hazard"), hzNet = compile(hz).net;
const settle = (c: Circuit, set: Record<string, number>) => { const s = new GateSim(compile(c).net); Object.entries(set).forEach(([k, v]) => s.set(k, [v])); return s; };
const hzRun = (a: number) => {
  const s = settle(hz, { a, b: 1, c: 1 });
  return new DelaySim(hzNet, DEFAULT_DELAYS, (b) => s.net(b)).run("a", [a ^ 1]);
};
const yBit = Number(hzNet.ports.y.bits[0]);
const fall = hzRun(1);
assert.deepEqual(fall.changes.get(yBit), [{ t: 4, v: 0 }, { t: 5, v: 1 }], "a falls: t1 falls at 2, y at 4; na rises at 1, t2 at 3, y back at 5");
assert.deepEqual(findHazards(fall, hzNet), [{ port: "y", bit: 0, kind: "static-1", edges: 2 }]);
assert.equal(fall.settled, 5);
assert.equal(findHazards(hzRun(0), hzNet).length, 0, "a rising hands over the other way: t1 rises first, so no dip");
// A slower inverter makes the dip longer
const slow = settle(hz, { a: 1, b: 1, c: 1 });
assert.deepEqual(new DelaySim(hzNet, { ...DEFAULT_DELAYS, not: 4 }, (b) => slow.net(b)).run("a", [0]).changes.get(yBit), [{ t: 4, v: 0 }, { t: 8, v: 1 }]);
// The consensus term bc removes the hazard, which is what the K-map's extra group is for
const fixed: Circuit = { ...hz, parts: hz.parts.map((p) => (p.id === "p7" ? { ...p, n: 3 } : p)).concat({ id: "p9", kind: "and", x: 360, y: 400, label: "t3" }),
  wires: [...hz.wires, { id: "w9", from: { part: "p2", pin: "out" }, to: { part: "p9", pin: "a" } }, { id: "w10", from: { part: "p3", pin: "out" }, to: { part: "p9", pin: "b" } }, { id: "w11", from: { part: "p9", pin: "y" }, to: { part: "p7", pin: "c" } }] };
const fixedSim = settle(fixed, { a: 1, b: 1, c: 1 }), fixedNet = compile(fixed).net;
assert.deepEqual(findHazards(new DelaySim(fixedNet, DEFAULT_DELAYS, (b) => fixedSim.net(b)).run("a", [0]), fixedNet), []);
// Flip-flops: clock to output takes its delay, and reset clears; no change at all is no event
const cnt2 = ex("2-bit counter"), cntNet = compile(cnt2).net, cs = new GateSim(cntNet);
const ckRun = new DelaySim(cntNet, DEFAULT_DELAYS, (b) => cs.net(b)).run("clk", [1]);
assert.deepEqual(ckRun.changes.get(Number(cntNet.ports.led0.bits[0])), [{ t: 2, v: 1 }]);
assert.equal(new DelaySim(cntNet, DEFAULT_DELAYS, (b) => cs.net(b)).run("clk", [0]).settled, 0);
// Whatever happens on the way, it must end exactly where the zero-delay simulator ends
const everyCircuit: [string, Circuit][] = [...CIRCUIT_EXAMPLES.map((e) => [e.label, e.circuit] as [string, Circuit]), ...Object.entries(PART_CASES)];
for (const [label, c] of everyCircuit) {
  const net = compile(c).net, gs = new GateSim(net);
  const widths = new Map(inputParts(c).map((p) => [p.label, portWidth(p)]));
  for (const e of defaultEvents(c, 40)) {
    const bits = toBits(e.value, widths.get(e.port) ?? 1);
    const ds = new DelaySim(net, DEFAULT_DELAYS, (b) => gs.net(b));
    const tr = ds.run(e.port, bits);
    gs.set(e.port, bits);
    assert.ok(!tr.truncated, `${label}: settles`);
    for (const [name, p] of Object.entries(net.ports)) p.bits.forEach((b, i) => assert.equal(ds.value(b), gs.net(b), `${label}: ${name}[${i}] after ${e.port}=${e.value}`));
  }
}
// As a waveform: bus bits combine; a signal starts from its value before the change
const tp = transientToParsed({ changes: new Map([[5, [{ t: 1, v: 1 }]], [6, [{ t: 1, v: 1 }, { t: 3, v: 0 }]]]), before: new Map([[5, 0], [6, 0]]), settled: 3, truncated: false }, [{ name: "bus", bits: [5, 6, 7] }], () => 1);
assert.deepEqual(tp.signals[0].changes, [{ time: 0, value: "100" }, { time: 1, value: "111" }, { time: 3, value: "101" }]);

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

// Timing: longest path in unit gate delays (lib/studio/circuit-analysis.ts)
const lp = (c: Circuit) => longestPath(compile(c).net);
assert.equal(lp(ex("Half adder")).delay, 1);
assert.equal(lp(ex("Majority vote")).delay, 3, "AND, then two ORs for the 3-input OR");
assert.equal(lp(ex("2-bit counter")).delay, 1, "flip-flop to flip-flop through one gate");
const add4 = lp(ex("4-bit adder"));
assert.equal(add4.delay, 9, "ripple carry: XOR, then AND+OR per bit");
const addNet = compile(ex("4-bit adder"));
assert.equal(add4.nets[add4.nets.length - 1], addNet.net.ports.carry.bits[0], "ends at the carry out");
assert.ok(addNet.net.ports.cin.bits.includes(add4.nets[0]) || addNet.net.ports.a.bits.includes(add4.nets[0]) || addNet.net.ports.b.bits.includes(add4.nets[0]), "starts at an input");
assert.equal(lp(PART_CASES.swap).delay, 0, "splitters and mergers are free");
// Logic analyzer trace: only changes are kept; VCD text for other viewers
const trace = { probes: [{ name: "a", width: 1 }, { name: "n", width: 4 }], steps: [[0, 0], [1, 0], [1, 5], [1, 5], [0, 15]] };
const pv = traceToParsed(trace);
assert.deepEqual(pv.signals[0].changes, [{ time: 0, value: "0" }, { time: 1, value: "1" }, { time: 4, value: "0" }]);
assert.deepEqual(pv.signals[1].changes.map((c) => c.value), ["0000", "0101", "1111"]);
assert.equal(pv.maxTime, 5);
const vcd = traceToVcd(trace, "demo");
assert.match(vcd, /\$var wire 4 " n \$end/);
assert.match(vcd, /#2\nb0101 "/);
assert.ok(!/#3\n/.test(vcd), "no entry for a step where nothing changed");
assert.equal(parseVcd(vcd).signals[1].changes.length, 3, "our own parser reads it back");
// Replacing the circuit: one draw still has the old rows with the new, longer probe list, and must not throw
const stale = { probes: [{ name: "a", width: 1 }, { name: "bus", width: 4 }], steps: [[1], [0]] };
assert.deepEqual(traceToParsed(stale).signals[1].changes, []);
assert.ok(traceToVcd(stale).includes("enddefinitions"));

// Blocks: every example and part case, with all its logic moved into a block, behaves the same
const ALL: [string, Circuit][] = [...CIRCUIT_EXAMPLES.map((e) => [e.label, e.circuit] as [string, Circuit]), ...Object.entries(PART_CASES)];
const logicOf = (c: Circuit): Selection => ({ ...NONE, parts: c.parts.filter((p) => !inputParts(c).includes(p) && !outputParts(c).includes(p)).map((p) => p.id) });
const sameOutputs = (a: Circuit, b: Circuit, label: string) => {
  const ev = defaultEvents(a, 40);
  assert.deepEqual(expectedOutputs(b, ev), expectedOutputs(a, ev), label);
};
const uid2 = (p: string) => `${p}_${++uidN}`;
const blocked = (c: Circuit, name = "blk"): Circuit => {
  const r = makeBlock(c, logicOf(c), name, uid2);
  if (typeof r === "string") throw new Error(r);
  return { ...r.circuit, blocks: { ...c.blocks, [name]: r.def } };
};
for (const [label, c] of ALL) {
  const top = blocked(c);
  assert.deepEqual(validate(top).filter((i) => i.level === "error"), [], `block: ${label}`);
  assert.equal(top.parts.filter((p) => p.kind === "block").length, 1);
  sameOutputs(c, top, `block: ${label}`);
  assert.match(generateVerilog(top), /^module blk \(/m);
  assert.match(generateVerilog(top), /\n {4}blk u_blk1 \(/);
}
assert.match(makeBlock(half, { ...NONE, parts: ["p1", "p3"] }, "x", uid2) as string, /Leave switches/);
// Ungroup undoes it: the block's logic back in the circuit, rewired, behaving the same
for (const [label, c] of ALL) {
  const top = blocked(c);
  const r = ungroupBlock(top, top.parts.find((p) => p.kind === "block")!.id, uid2);
  if (typeof r === "string") throw new Error(`${label}: ${r}`);
  assert.equal(r.circuit.parts.filter((p) => p.kind === "block").length, 0, `ungroup: ${label}`);
  assert.equal(r.circuit.parts.length, c.parts.length, `ungroup: ${label}: same parts`);
  assert.deepEqual(validate(r.circuit).filter((i) => i.level === "error"), [], `ungroup: ${label}`);
  sameOutputs(c, r.circuit, `ungroup: ${label}`);
  assert.equal(new Set(r.circuit.parts.map((p) => p.label)).size, r.circuit.parts.length, `ungroup: ${label}: labels unique`);
}
assert.match(ungroupBlock(half, "p1", uid2) as string, /Select one block/);
// Nested: the block instance itself put in a block; Verilog lists the inner module first
const add4b = blocked(ex("4-bit adder"));
const nested = blocked(add4b, "outer");
assert.deepEqual(validate(nested).filter((i) => i.level === "error"), []);
sameOutputs(ex("4-bit adder"), nested, "nested blocks");
const nv = generateVerilog(nested);
assert.ok(nv.indexOf("module blk (") < nv.indexOf("module outer (") && nv.indexOf("module outer (") < nv.indexOf("module add4 ("));
assert.ok(usesBlock(nested.blocks!, "outer", "blk") && !usesBlock(nested.blocks!, "blk", "outer"));
// Renaming follows every instance; editing a block's ports updates its instances and drops their stale wires
const renamed = renameBlock(nested, "blk", "core");
assert.deepEqual(Object.keys(renamed.blocks!).sort(), ["core", "outer"]);
assert.match(generateVerilog(renamed), /module core \(/);
sameOutputs(nested, renamed, "renamed block");
const def = add4b.blocks!.blk, carryOut = outputParts(def).find((p) => /carry/.test(p.label))!;
const slim = withBlock(add4b, "blk", { ...def, parts: def.parts.filter((p) => p.id !== carryOut.id), wires: def.wires.filter((w) => w.to.part !== carryOut.id) });
const inst = slim.parts.find((p) => p.kind === "block")!;
assert.ok(!inst.ports!.outputs.some((o) => o.name === carryOut.label));
assert.ok(!slim.wires.some((w) => w.from.part === inst.id && w.from.pin === carryOut.label), "the wire from the removed pin is gone");
assert.equal(blockNameIssue(add4b, "blk"), `"blk" is already used.`);
assert.equal(blockNameIssue(add4b, "add4"), `"add4" is already used.`);
assert.equal(blockNameIssue(add4b, "fresh"), null);
// A block containing itself is reported, not a hang
const selfish: Circuit = { ...add4b, blocks: { blk: { ...def, parts: [...def.parts, { id: "me", kind: "block", block: "blk", ports: inst.ports, label: "me", x: 0, y: 0 }] } } };
assert.ok(validate(selfish).some((i) => i.level === "error" && /nested too deeply/.test(i.msg)));

// Import: a netlist (here our own compile() output) drawn as a circuit behaves the same
for (const [label, c] of ALL) {
  const back = netlistToCircuit(compile(c).net, c.module);
  if (typeof back === "string") throw new Error(`${label}: ${back}`);
  assert.deepEqual(validate(back).filter((i) => i.level === "error"), [], `import: ${label}`);
  sameOutputs(c, back, `import: ${label}`);
}
const imported = netlistToCircuit(compile(nested).net, "flat") as Circuit;
sameOutputs(nested, imported, "import flattens blocks");
assert.ok(imported.parts.every((p) => p.x >= 40 && p.y >= 40), "laid out on the canvas");
assert.match(netlistToCircuit({ ports: {}, cells: [{ type: "$_DFF_PP1_", conn: { C: [2], D: [3], Q: [4], R: [5] } }] }, "m") as string, /reset to 1/);
assert.match(netlistToCircuit({ ports: {}, cells: [{ type: "$_AOI3_", conn: {} }] }, "m") as string, /no part for/);
console.log("circuit: all checks passed");
