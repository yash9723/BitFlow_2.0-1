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

(async () => {
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
  console.log("studio-sim: all checks passed");
})().catch((e) => { console.error(e); process.exit(1); });
