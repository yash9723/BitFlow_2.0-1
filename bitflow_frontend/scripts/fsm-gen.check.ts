/**
 * scripts/fsm-gen.check.ts — self-check for lib/studio/expr.ts and lib/studio/fsm.ts
 * (npx tsx scripts/fsm-gen.check.ts). The generated Verilog is run on the simulator
 * by scripts/studio-sim.check.ts.
 */
import assert from "node:assert/strict";
import { evaluate, evaluateIn, exprProblem, identifiers, parseExpr } from "../lib/studio/expr";
import { type FsmModel, FSM_EXAMPLES, fromExtracted, generateTestbench, generateVerilog, guidedWalk, step, validate } from "../lib/studio/fsm";

// ── Expressions ───────────────────────────────────────────────────────────────
const W = { a: 4, b: 4, c: 1, d: 1, s: 8 };
const ev = (src: string, v: Record<string, number>) => Number(evaluate(parseExpr(src), W, v));
assert.equal(ev("a == 4'b1010", { a: 10 }), 1);
assert.equal(ev("a[3:1]", { a: 0b1011 }), 0b101);
assert.equal(ev("a[0]", { a: 0b1011 }), 1);
assert.equal(ev("c | d & 0", { c: 1, d: 1 }), 1, "& binds tighter than |");
assert.equal(ev("!c && d", { c: 0, d: 1 }), 1);
assert.equal(ev("~c", { c: 1 }), 0, "~ on a 1-bit input stays 1 bit");
assert.equal(ev("(a + b) == 5'd16", { a: 8, b: 8 }), 1, "the sum is computed at the comparison's width");
assert.equal(ev("(a + b) == 4'd0", { a: 8, b: 8 }), 1, "...and wraps at 4 bits when that is the widest");
assert.equal(ev("a - 1 == 15", { a: 0 }), 0, "unsized 1 makes the subtraction 32 bits wide");
assert.equal(ev("s >= 8'hF0", { s: 0xf5 }), 1);
assert.equal(ev("a != 3 && b < 2", { a: 4, b: 1 }), 1);
assert.equal(Number(evaluateIn(parseExpr("a + b"), 5, W, { a: 15, b: 1 })), 16, "an assignment widens to its target");
assert.equal(Number(evaluateIn(parseExpr("a + b"), 4, W, { a: 15, b: 1 })), 0);
assert.deepEqual(identifiers(parseExpr("(a == 2) && !c || a[1]")), ["a", "c"]);
assert.match(exprProblem("q", W)!, /isn't an input/);
assert.match(exprProblem("a[4]", W)!, /past its width/);
assert.match(exprProblem("a ==", W)!, /ends too early/);
assert.match(exprProblem("(a", W)!, /expected "\)"/);
assert.match(exprProblem("4'b1x", W)!, /x\/z/);
assert.equal(exprProblem("a == 4'hA", W), null);

// ── Models ────────────────────────────────────────────────────────────────────
for (const { label, model } of FSM_EXAMPLES) {
  const errors = validate(model).filter((i) => i.level === "error");
  assert.deepEqual(errors, [], `${label} validates`);
  // the guided walk takes every transition of the examples
  let state = model.reset;
  const taken = new Set<string>();
  for (const v of guidedWalk(model, 40)) { const r = step(model, state, v); if (r.taken) taken.add(r.taken); state = r.next; }
  assert.equal(taken.size, model.transitions.length, `${label}: walk takes every transition`);
  const v = generateVerilog(model);
  assert.match(v, new RegExp(`module ${model.module} \\(`));
  assert.ok(!/,\n\);/.test(v), "no trailing comma in the port list");
  assert.match(generateTestbench(model, guidedWalk(model, 8)), /ALL TESTS PASSED/);
}

// 101 Moore: 1,0,1 -> found during the 4th cycle (state GOT101)
const moore = FSM_EXAMPLES[0].model;
let s = moore.reset;
const seen: string[] = [];
for (const din of [1, 0, 1, 0, 1]) { const r = step(moore, s, { din }); seen.push(`${moore.states.find((x) => x.id === s)!.name}:${r.outputs.found}`); s = r.next; }
assert.deepEqual(seen, ["IDLE:0", "GOT1:0", "GOT10:0", "GOT101:1", "GOT10:0"]);

// Mealy: output on the transition
const mealy = FSM_EXAMPLES[1].model;
assert.equal(step(mealy, "s2", { din: 1 }).outputs.found, BigInt(1));
assert.equal(step(mealy, "s2", { din: 0 }).outputs.found, BigInt(0));

// Validation finds shadowed, overlapping and unreachable things, and reserved names
const bad: FsmModel = {
  module: "m", kind: "moore", encoding: "binary", reset: "s0",
  inputs: [{ name: "a", width: 1 }, { name: "b", width: 1 }], outputs: [{ name: "y", width: 1 }],
  states: [
    { id: "s0", name: "A", x: 0, y: 0, outputs: {} }, { id: "s1", name: "B", x: 0, y: 0, outputs: { y: "2" } },
    { id: "s2", name: "C", x: 0, y: 0, outputs: {} },
  ],
  transitions: [
    { id: "t0", from: "s0", to: "s1", cond: "a", outputs: {} },
    { id: "t1", from: "s0", to: "s0", cond: "a && b", outputs: {} },
    { id: "t2", from: "s0", to: "s1", cond: "b", outputs: {} },
  ],
};
const msgs = validate(bad).map((i) => `${i.level}: ${i.msg}`);
assert.ok(msgs.some((m) => /A → A is never taken: an earlier transition/.test(m)), msgs.join("\n"));
assert.ok(msgs.some((m) => /A → B overlaps an earlier/.test(m)), msgs.join("\n"));
assert.ok(msgs.some((m) => /State C can't be reached/.test(m)), msgs.join("\n"));
assert.ok(msgs.some((m) => /2 doesn't fit in y/.test(m)), msgs.join("\n"));
assert.ok(validate({ ...bad, inputs: [{ name: "clk", width: 1 }] }).some((i) => /reserved/.test(i.msg)));
assert.ok(validate({ ...bad, transitions: [{ id: "t", from: "s0", to: "s1", cond: "a ==", outputs: {} }] }).some((i) => i.level === "error"));

// An unconditional transition ends the if-chain (later ones can't be taken)
const uncond = { ...bad, transitions: [{ id: "t0", from: "s0", to: "s1", cond: "", outputs: {} }, { id: "t1", from: "s0", to: "s2", cond: "a", outputs: {} }] };
assert.ok(!/else if \(a\)/.test(generateVerilog(uncond)));

// Import from the Synth panel's extracted FSM
const { model: imported, skipped } = fromExtracted({
  module: "seq", reset: "rst=1",
  states: [{ id: 0, code: 0, name: "IDLE", reset: true }, { id: 1, code: 1, name: "ONE", reset: false }, { id: 2, code: 2, name: null, reset: false }],
  transitions: [
    { from: 0, to: 1, conditions: ["din=1"] }, { from: 0, to: 0, conditions: ["din=0"] },
    { from: 1, to: 2, conditions: ["din=0 & mode [1]=1", "din=1 & mode [1]=0"] },
    { from: 2, to: 0, conditions: ["…"] },
  ],
});
assert.deepEqual(imported.inputs, [{ name: "din", width: 1 }, { name: "mode", width: 2 }]);
assert.deepEqual(imported.states.map((x) => x.name), ["IDLE", "ONE", "S2"]);
assert.deepEqual(imported.transitions.map((t) => t.cond), ["din", "(!din && mode[1]) || (din && !mode[1])"]);
assert.equal(skipped, 1);
assert.deepEqual(validate(imported).filter((i) => i.level === "error"), []);

console.log("fsm-gen: all checks passed");
