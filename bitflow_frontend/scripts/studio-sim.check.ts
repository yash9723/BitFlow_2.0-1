/**
 * scripts/studio-sim.check.ts — runs the Design Studio's generated Verilog and testbenches
 * on a real simulator backend and expects ALL TESTS PASSED. Needs BACKEND_URL and
 * JWT_SECRET (a local stack); without them it says so and exits 0, so it is not a CI step.
 *   BACKEND_URL=http://127.0.0.1:8100 JWT_SECRET=... npx tsx scripts/studio-sim.check.ts
 */
import assert from "node:assert/strict";
import { simulateOnBackend } from "../lib/backend";
import { type Cell, type TruthTable, generateVerilog } from "../lib/studio/logic-min";
import { type FsmModel, FSM_EXAMPLES, generateTestbench as fsmTestbench, generateVerilog as fsmVerilog, guidedWalk } from "../lib/studio/fsm";
import { WAVE_EXAMPLES, fromVcd, generateTestbench as waveTestbench, nsPerUnit, setDir } from "../lib/studio/wave";
import { parseVcd } from "../lib/vcd-parser";
import {
  CIRCUIT_EXAMPLES, defaultEvents as circuitEvents, generateTestbench as circuitTestbench, generateVerilog as circuitVerilog, inputParts, outputParts,
} from "../lib/studio/circuit";
import { NONE, makeBlock } from "../lib/studio/circuit-edit";
import { GENERATORS, type Values, defaults } from "../lib/studio/generators";
import { TEMPLATES } from "../lib/templates";
import { type TbOptions, generateTestbench as tbFor, parseModule } from "../lib/studio/tbgen";
import { PART_CASES } from "./circuit-cases";

if (!process.env.BACKEND_URL || !process.env.JWT_SECRET) {
  console.log("studio-sim: skipped (set BACKEND_URL and JWT_SECRET to run against a backend)");
  process.exit(0);
}

const rows = (n: number, f: (m: number) => Cell): Cell[] => Array.from({ length: 1 << n }, (_, m) => f(m));
let seed = 7;
const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

const cases: [string, { design: string; testbench: string }][] = [];
const tables: [string, TruthTable][] = [
  ["majority", { inputs: ["a", "b", "c"], outputs: [{ name: "y", cells: rows(3, (m) => ([3, 5, 6, 7].includes(m) ? 1 : 0)) }] }],
  ["full adder", { inputs: ["a", "b", "cin"], outputs: [
    { name: "sum", cells: rows(3, (m) => ((m ^ (m >> 1) ^ (m >> 2)) & 1) as Cell) },
    { name: "cout", cells: rows(3, (m) => ([3, 5, 6, 7].includes(m) ? 1 : 0)) },
  ] }],
  ["bcd seg a (don't-cares)", { inputs: ["d3", "d2", "d1", "d0"], outputs: [{ name: "seg_a", cells: rows(4, (m) => (m > 9 ? "x" : [1, 4].includes(m) ? 0 : 1)) }] }],
  ["random 6-input, 3 outputs", { inputs: ["a", "b", "c", "d", "e", "f"], outputs: ["x", "y", "z"].map((name) => ({
    name, cells: rows(6, () => { const r = rand(); return r < 0.4 ? 1 : r < 0.85 ? 0 : "x"; }),
  })) }],
  ["constant 0 and 1", { inputs: ["a", "b"], outputs: [{ name: "lo", cells: [0, 0, 0, 0] }, { name: "hi", cells: [1, 1, 1, 1] }] }],
];
for (const [name, t] of tables) for (const form of ["sop", "pos"] as const) cases.push([`logic: ${name} (${form})`, generateVerilog(t, form)]);

// FSMs: every example in both encodings, plus one that leans on Verilog's width rules,
// so the stepper (lib/studio/expr.ts) is checked against Icarus itself.
const widthy: FsmModel = {
  module: "widths", kind: "mealy", encoding: "binary", reset: "s0",
  inputs: [{ name: "a", width: 4 }, { name: "b", width: 4 }], outputs: [{ name: "sum", width: 5 }, { name: "hit", width: 1 }, { name: "low", width: 3 }],
  states: [{ id: "s0", name: "A", x: 0, y: 0, outputs: { sum: "a + b", low: "~a" } }, { id: "s1", name: "B", x: 0, y: 0, outputs: { sum: "a - b", low: "a[3:1] ^ 3'b101" } }],
  transitions: [
    { id: "t0", from: "s0", to: "s1", cond: "(a + b) == 5'd16 || a - 1 == 15", outputs: { hit: "1" } },
    { id: "t1", from: "s1", to: "s0", cond: "a > b && !(b == 0)", outputs: { hit: "a[0] & b[0]" } },
    { id: "t2", from: "s1", to: "s0", cond: "a == 4'hF", outputs: {} },
  ],
};
for (const { label, model } of [...FSM_EXAMPLES, { label: "width rules", model: widthy }]) {
  for (const encoding of ["binary", "onehot"] as const) {
    const m = { ...model, encoding };
    cases.push([`fsm: ${label} (${encoding})`, { design: fsmVerilog(m), testbench: fsmTestbench(m, guidedWalk(m, 60, 3)) }]);
  }
}

// Timing diagrams: each example against a design that meets it
const WAVE_DESIGNS: Record<string, [string, string]> = {
  "Counter with enable": ["counter_en", `module counter_en (input wire clk, input wire rst, input wire en, output reg [3:0] count);
    always @(posedge clk) if (rst) count <= 4'd0; else if (en) count <= count + 4'd1;
endmodule`],
  "D flip-flop": ["dff", "module dff (input wire clk, input wire d, output reg q);\n    always @(posedge clk) q <= d;\nendmodule"],
  "AND gate (no clock)": ["and_gate", "module and_gate (input wire a, input wire b, output wire y);\n    assign y = a & b;\nendmodule"],
};
for (const { label, diagram } of WAVE_EXAMPLES) {
  const [mod, design] = WAVE_DESIGNS[label];
  cases.push([`timing: ${label}`, { design, testbench: waveTestbench(diagram, mod) }]);
}

// Circuits: every example, testbench from its default walk (exhaustive Gray walk or clocked random walk)
for (const { label, circuit } of [...CIRCUIT_EXAMPLES, ...Object.entries(PART_CASES).map(([label, circuit]) => ({ label, circuit }))]) {
  cases.push([`circuit: ${label}`, { design: circuitVerilog(circuit), testbench: circuitTestbench(circuit, circuitEvents(circuit, 64, 5)) }]);
  // ...and with its logic in a block (a second module, instantiated)
  const r = makeBlock(circuit, { ...NONE, parts: circuit.parts.filter((p) => !inputParts(circuit).includes(p) && !outputParts(circuit).includes(p)).map((p) => p.id) },
    "core", (p) => `${p}_${Math.random().toString(36).slice(2, 8)}`);
  if (typeof r === "string") throw new Error(`${label}: ${r}`);
  const top = { ...r.circuit, blocks: { core: r.def } };
  cases.push([`circuit block: ${label}`, { design: circuitVerilog(top), testbench: circuitTestbench(top, circuitEvents(circuit, 64, 5)) }]);
}

// Generators: defaults and a few variants, each against its own model-checked testbench
for (const gen of GENERATORS) {
  const extra: Record<string, Values[]> = {
    lfsr: [{ width: 3, seed: "5" }, { width: 32, seed: "DEADBEEF" }], crc: [{ width: 32, poly: "04C11DB7", init: "FFFFFFFF", xorout: "FFFFFFFF" }, { width: 8, poly: "07", init: "0" }],
    clkdiv: [{ n: 2 }, { n: 7 }], pwm: [{ width: 2 }], debounce: [{ n: 1 }, { n: 9 }], fifo: [{ width: 1, depth: 2 }, { width: 16, depth: 16 }],
    gray: [{ width: 9 }], rom: [{ width: 4, values: "1 2 3" }], shift: [{ width: 33 }], bin2bcd: [{ width: 4 }, { width: 14 }],
  };
  for (const v of [defaults(gen), ...(extra[gen.id] ?? []).map((x) => ({ ...defaults(gen), ...x }))]) {
    const r = gen.build(v);
    if (typeof r === "string") throw new Error(`${gen.id}: ${r}`);
    cases.push([`generator ${gen.id} ${JSON.stringify(v).slice(0, 60)}`, { design: r.design, testbench: r.testbench }]);
  }
}

// Testbench generator: a testbench for every generator and template design, in both styles
const tbgen = (design: string, o: Partial<TbOptions> = {}) => {
  const m = parseModule(design);
  if (typeof m === "string") throw new Error(m);
  return { design, testbench: tbFor(m, o) };
};
/** Swap the generated TODO model for a real one. */
const withModel = (c: { design: string; testbench: string }, body: string) =>
  ({ ...c, testbench: c.testbench.replace(/ {6}\/\/ TODO[^\n]*\n( {6}exp_\w+ = 'bx;\n)+/, `      ${body}\n`) });
const tbDesigns: [string, string][] = [
  ...GENERATORS.map((g): [string, string] => { const r = g.build(defaults(g)); if (typeof r === "string") throw new Error(r); return [`generator ${g.id}`, r.design]; }),
  ...Object.entries(TEMPLATES).filter(([k]) => !["vhdlAlu", "uartEchoFiles", "uartEcho"].includes(k)).map(([k, t]): [string, string] => [`template ${k}`, t.design]),
];
for (const [name, design] of tbDesigns) for (const style of ["verilog", "sv"] as const) cases.push([`tbgen: ${name} (${style})`, tbgen(design, { style })]);
cases.push(["tbgen: uartEcho, X/Z check off (its led has no reset)", tbgen(TEMPLATES.uartEcho.design, { xcheck: false })]);
const HALF_MODEL = "exp_sum = a ^ b; exp_carry = a & b;";
const COUNTER_MODEL = "if (^exp_count === 1'bx) exp_count = 0; if (en) exp_count = exp_count + 1;";
const modelled: [string, { design: string; testbench: string }][] = [];
for (const style of ["verilog", "sv"] as const) {
  modelled.push([`tbgen: half adder against its model (${style})`, withModel(tbgen(TEMPLATES.halfAdder.design, { style }), HALF_MODEL)]);
  modelled.push([`tbgen: counter against its model (${style})`, withModel(tbgen(TEMPLATES.counter4bit.design, { style, cycles: 50 }), COUNTER_MODEL)]);
}
for (const [name, c] of modelled) assert.notEqual(c.testbench, tbgen(c.design).testbench, `${name}: model inserted`);
cases.push(...modelled);

(async () => {
  // Round trip: run the Sandbox counter template, sample its waveform into a diagram,
  // mark the output, and check the same design against the diagram's testbench.
  const tpl = TEMPLATES.counter4bit;
  const run = await simulateOnBackend({ design_v: tpl.design, testbench_v: tpl.testbench });
  // As the Waveform panel sees it: no scope, so testbench and DUT copies share names; keep the first of each, no parameters
  const vcd = parseVcd(Buffer.from(run.data.waveform.vcd_base64, "base64").toString("utf8"));
  const firsts = vcd.signals.filter((s, i) => s.type !== "parameter" && vcd.signals.findIndex((x) => x.name === s.name) === i);
  const sampled = fromVcd(firsts, vcd.maxTime, 20, nsPerUnit(vcd.timescale));
  assert.equal(sampled.period, 10, "a 10 ns clock in a 1 ps VCD");
  sampled.signals = sampled.signals.map((s) => (s.name === "count" ? setDir(s, "out") : s));
  assert.ok(sampled.signals.some((s) => s.dir === "clock"), "the clock was found");
  cases.push(["timing: diagram sampled from the counter template", { design: tpl.design, testbench: waveTestbench(sampled, "counter") }]);

  for (const [name, { design, testbench }] of cases) {
    const { status, data } = await simulateOnBackend({ design_v: design, testbench_v: testbench });
    const out = `${data?.stdout ?? ""}${data?.stderr ?? ""}`;
    assert.equal(status, 200, `${name}: HTTP ${status}`);
    assert.ok(out.includes("ALL TESTS PASSED") && !out.includes("FAIL"), `${name}:\n${out.slice(0, 2000)}`);
    console.log(`PASS ${name}`);
  }
  // A wrong design must fail its testbench: flip one assign
  const [, bad] = cases[0];
  const { data } = await simulateOnBackend({ design_v: bad.design.replace(/assign y = .*;/, "assign y = a;"), testbench_v: bad.testbench });
  assert.match(String(data?.stdout), /TESTS FAILED/, "a broken design is caught");
  console.log("PASS a broken design fails its testbench");
  for (const [name, c] of modelled) {
    const { data: good } = await simulateOnBackend({ design_v: c.design, testbench_v: c.testbench });
    assert.doesNotMatch(String(good?.stdout), /\(0 output checks/, `${name}: the model was checked`);
    const broken = c.design.replace("a ^ b", "a | b").replace("count + 1'b1", "count + 2'd2");
    assert.notEqual(broken, c.design);
    const { data: bad2 } = await simulateOnBackend({ design_v: broken, testbench_v: c.testbench });
    assert.match(String(bad2?.stdout), /TESTS FAILED/, `${name}: a broken design is caught`);
  }
  console.log("PASS tbgen models catch broken designs");
  console.log("studio-sim: all checks passed");
})().catch((e) => { console.error(e); process.exit(1); });
