/**
 * scripts/fsm-tools.check.ts — state minimization, typed input runs, the trace as a timing diagram,
 * and Gray state codes (npx tsx scripts/fsm-tools.check.ts). The Verilog is run on the
 * simulator by scripts/studio-sim.check.ts.
 */
import assert from "node:assert/strict";
import type { Values } from "../lib/studio/expr";
import { type FsmModel, FSM_EXAMPLES, allInputs, generateTestbench, generateVerilog, guidedWalk, stateCodes, step, validate } from "../lib/studio/fsm";
import { type Minimized, minimizeFsm, parseSequence, traceToDiagram } from "../lib/studio/fsm-tools";
import { diagramSvg, validate as validateDiagram } from "../lib/studio/wave";

const ex = (label: string) => FSM_EXAMPLES.find((e) => e.label.startsWith(label))!.model;
const min = (m: FsmModel) => { const r = minimizeFsm(m); if (typeof r === "string") throw new Error(r); return r as Minimized; };
const outsOf = (m: FsmModel, s: string, v: Values) => JSON.stringify(m.outputs.map((o) => String(step(m, s, v).outputs[o.name])));

/** Do the two machines give the same outputs on every input sequence? Walks every reachable pair of states. */
function equivalent(a: FsmModel, b: FsmModel): boolean {
  const combos = allInputs(a.inputs), seen = new Set<string>(), todo: [string, string][] = [[a.reset, b.reset]];
  while (todo.length) {
    const [s, t] = todo.pop()!;
    const k = `${s}/${t}`;
    if (seen.has(k)) continue;
    seen.add(k);
    for (const v of combos) {
      if (outsOf(a, s, v) !== outsOf(b, t, v)) return false;
      todo.push([step(a, s, v).next, step(b, t, v).next]);
    }
  }
  return true;
}

// The textbook table: E and G match, and then so do D and F
const red = ex("Reducible");
const r = min(red);
assert.deepEqual(r.model.states.map((s) => s.name), ["A", "B", "C", "D", "E"]);
assert.deepEqual(r.merged, [{ keep: "D", gone: ["F"] }, { keep: "E", gone: ["G"] }]);
assert.deepEqual(r.passes[0], [["A", "B", "C"], ["D", "E", "F", "G"]], "first by outputs");
assert.deepEqual(r.passes.slice(1), [[["A"], ["B", "C"], ["D", "F"], ["E", "G"]], [["A"], ["B"], ["C"], ["D", "F"], ["E", "G"]]], "then split until nothing changes (worked by hand)");
assert.deepEqual(r.unreachable, []);
assert.deepEqual(validate(r.model).filter((i) => i.level === "error"), []);
assert.ok(equivalent(red, r.model));

// A minimal machine stays as it is; an unreachable state goes
for (const label of ["101 detector (Moore)", "101 detector (Mealy)", "Traffic light", "Vending"]) {
  const m = ex(label), x = min(m);
  assert.equal(x.model.states.length, m.states.length, `${label} is already minimal`);
  assert.equal(x.merged.length, 0);
  assert.ok(equivalent(m, x.model));
}
const withIsland: FsmModel = { ...ex("101 detector (Moore)"), states: [...ex("101 detector (Moore)").states, { id: "z", name: "ISLAND", x: 0, y: 0, outputs: {} }],
  transitions: [...ex("101 detector (Moore)").transitions, { id: "tz", from: "z", to: "s0", cond: "", outputs: {} }] };
assert.deepEqual(min(withIsland).unreachable, ["ISLAND"]);
assert.ok(!min(withIsland).model.states.some((s) => s.name === "ISLAND"));
assert.ok(!min(withIsland).model.transitions.some((t) => t.from === "z"));
// A reachable-looking transition whose condition is never true doesn't keep a state alive, and goes with it
const never: FsmModel = { ...withIsland, transitions: [...withIsland.transitions, { id: "tn", from: "s0", to: "z", cond: "din && !din", outputs: {} }] };
assert.deepEqual(min(never).unreachable, ["ISLAND"]);
assert.ok(!min(never).model.transitions.some((t) => t.id === "tn"));
assert.ok(equivalent(never, min(never).model));
// Refusals
assert.match(minimizeFsm({ ...red, reset: "gone" }) as string, /Fix the errors/);
assert.match(minimizeFsm({ ...red, inputs: [{ name: "x", width: 13 }] }) as string, /up to 12 input bits/);

// Random machines: the result is equivalent, and has exactly as many states as an independent table-filling method finds
function tableFill(m: FsmModel): number {
  const combos = allInputs(m.inputs), reach = [m.reset];
  for (let i = 0; i < reach.length; i++) for (const v of combos) { const n = step(m, reach[i], v).next; if (!reach.includes(n)) reach.push(n); }
  const pair = (a: string, b: string) => [a, b].sort().join("/");
  const marked = new Set<string>();
  for (const a of reach) for (const b of reach) if (a < b && combos.some((v) => outsOf(m, a, v) !== outsOf(m, b, v))) marked.add(pair(a, b));
  for (let grew = true; grew;) {
    grew = false;
    for (const a of reach) for (const b of reach) {
      if (a >= b || marked.has(pair(a, b))) continue;
      if (combos.some((v) => { const x = step(m, a, v).next, y = step(m, b, v).next; return x !== y && marked.has(pair(x, y)); })) { marked.add(pair(a, b)); grew = true; }
    }
  }
  const classes: string[] = [];
  for (const a of reach) if (!classes.some((c) => c === a || !marked.has(pair(c, a)))) classes.push(a);
  return classes.length;
}
let seed = 99;
const rand = (n: number) => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return (seed >>> 16) % n; };
const CONDS = ["x", "!x", "y", "x && y", "!x && !y", ""];
let reduced = 0;
for (let trial = 0; trial < 300; trial++) {
  const n = 2 + rand(7), kind = rand(2) ? "moore" as const : "mealy" as const;
  const ids = Array.from({ length: n }, (_, i) => `s${i}`);
  const val = () => (rand(4) ? "" : "1");
  const m: FsmModel = { module: "m", kind, encoding: "binary", reset: "s0", inputs: [{ name: "x", width: 1 }, { name: "y", width: 1 }], outputs: [{ name: "z", width: 1 }],
    states: ids.map((id) => ({ id, name: id.toUpperCase(), x: 0, y: 0, outputs: (kind === "moore" ? { z: val() } : {}) as Record<string, string> })),
    transitions: ids.flatMap((from) => Array.from({ length: 1 + rand(3) }, (_, k) => ({ id: `${from}t${k}`, from, to: ids[rand(n)], cond: CONDS[rand(CONDS.length)], outputs: (kind === "mealy" ? { z: val() } : {}) as Record<string, string> }))) };
  const x = min(m);
  assert.ok(equivalent(m, x.model), `trial ${trial}: not equivalent`);
  assert.equal(x.model.states.length, tableFill(m), `trial ${trial}: state count`);
  assert.equal(min(x.model).model.states.length, x.model.states.length, `trial ${trial}: minimizing again changes nothing`);
  assert.ok(x.model.states.some((s) => s.id === m.reset), `trial ${trial}: reset stays`);
  if (x.model.states.length < m.states.length) reduced++;
}
assert.ok(reduced > 50, `the random machines should often reduce (${reduced})`);

// Gray codes: one bit changes between neighbours, none repeat, all fit, and Verilog says so
const gray = stateCodes({ ...red, encoding: "gray" });
const vals = red.states.map((_, i) => gray.value(i));
assert.equal(gray.width, 3);
assert.equal(new Set(vals.map(String)).size, vals.length);
vals.slice(1).forEach((v, i) => assert.equal((v ^ vals[i]).toString(2).replace(/0/g, "").length, 1, `codes ${i} and ${i + 1}`));
assert.deepEqual(vals.slice(0, 4).map(Number), [0, 1, 3, 2]);
assert.match(generateVerilog({ ...red, encoding: "gray" }), /Gray-code state encoding/);
assert.match(generateVerilog({ ...red, encoding: "gray" }), /C = 3'd3/);
assert.deepEqual([stateCodes({ ...red, encoding: "binary" }).value(3), stateCodes({ ...red, encoding: "onehot" }).value(3)], [BigInt(3), BigInt(8)]);
assert.ok(generateTestbench({ ...red, encoding: "gray" }, guidedWalk(red, 8)).includes("ALL TESTS PASSED"));

// Typed runs
const det = ex("101 detector (Moore)");
assert.deepEqual(parseSequence(det, "10 1"), [{ din: 1 }, { din: 0 }, { din: 1 }]);
assert.match(parseSequence(det, "") as string, /Type the inputs/);
assert.match(parseSequence(det, "102") as string, /only 0 and 1 for din/);
const vend = ex("Vending");
assert.deepEqual(parseSequence(vend, "1 2 0"), [{ coin: 1 }, { coin: 2 }, { coin: 0 }]);
assert.match(parseSequence(vend, "4") as string, /coin = "4" doesn't fit in 2 bits/);
const two: FsmModel = { ...det, inputs: [{ name: "a", width: 1 }, { name: "b", width: 3 }] };
assert.deepEqual(parseSequence(two, "1,5 0,7"), [{ a: 1, b: 5 }, { a: 0, b: 7 }]);
assert.match(parseSequence(two, "1") as string, /needs 2 values: a, b/);
assert.deepEqual(parseSequence({ ...det, inputs: [] }, "2"), [{}, {}]);
assert.match(parseSequence({ ...det, inputs: [] }, "x") as string, /no inputs/);
assert.match(parseSequence(det, "1".repeat(201)) as string, /up to 200 cycles/);

// A run as a timing diagram: a reset cycle, then the run, with the state named above each cycle
let state = det.reset;
const trace = (parseSequence(det, "1011") as Record<string, number>[]).map((inputs) => { const s = step(det, state, inputs); const row = { state, inputs, outputs: s.outputs }; state = s.next; return row; });
const d = traceToDiagram(det, trace);
assert.deepEqual(validateDiagram(d).filter((i) => i.level === "error"), []);
assert.equal(d.cycles, 5);
assert.deepEqual(d.signals.map((s) => [s.name, s.dir]), [["clk", "clock"], ["rst", "in"], ["din", "in"], ["found", "out"]]);
assert.deepEqual(d.signals[1].values, ["1", "0", "0", "0", "0"]);
assert.deepEqual(d.signals[2].values, ["0", "1", "0", "1", "1"]);
assert.deepEqual(d.notes!.map((n) => n.text), ["IDLE", "IDLE", "GOT1", "GOT10", "GOT101"]);
assert.deepEqual(d.signals[3].values, ["0", "0", "0", "0", "1"], "found is high in GOT101");
assert.ok(diagramSvg(d).includes(">GOT101<"), "the state names are drawn");
assert.equal(traceToDiagram(det, Array.from({ length: 100 }, () => trace[0])).cycles, 64, "cut to the diagram's limit");

console.log("fsm-tools: all checks passed");
