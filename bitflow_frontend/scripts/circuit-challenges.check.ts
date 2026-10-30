/**
 * scripts/circuit-challenges.check.ts — the graded circuit challenges and the checks on circuits
 * from outside (npx tsx scripts/circuit-challenges.check.ts). Worked solutions live in private/
 * and are checked when present (not in CI, since the repo is public).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import type { Circuit, Part, PartKind, Wire } from "../lib/studio/circuit";
import { validate } from "../lib/studio/circuit";
import { CHALLENGES, type CircuitChallenge, challengeById, gradeCircuit, starterCircuit } from "../lib/studio/circuit-challenges";
import { MAX_CIRCUIT_CHARS, flatPartCount, kindsUsed, parseCircuit } from "../lib/studio/circuit-json";

const ch = (id: string): CircuitChallenge => challengeById(id)!;

// Every challenge is well formed, and its empty starter doesn't pass
assert.equal(new Set(CHALLENGES.map((c) => c.id)).size, CHALLENGES.length);
for (const c of CHALLENGES) {
  assert.match(c.id, /^[a-z0-9-]+$/);
  const s = starterCircuit(c);
  assert.deepEqual(validate(s).filter((i) => i.level === "error"), [], `${c.id}: starter`);
  assert.deepEqual(parseCircuit(JSON.stringify(s)), s, `${c.id}: survives JSON`);
  assert.equal(gradeCircuit(c, s).ok, false, `${c.id}: the starter must fail`);
  assert.ok(c.budget > 0 && c.xp > 0 && c.parts.length > 0 && c.statement && c.hint);
  if (c.spec.kind === "seq") assert.ok(c.inputs.some((p) => p.clock), `${c.id}: a clock`);
}

// A small way to build answers: add() returns an output pin; link() wires one in
function build(c: CircuitChallenge) {
  const circuit = starterCircuit(c);
  let n = 0;
  const add = (kind: PartKind, extra: Partial<Part> = {}) => {
    const id = `u${++n}`;
    circuit.parts.push({ id, kind, label: id, x: 200, y: 40 * n, ...extra });
    return id;
  };
  const link = (from: Wire["from"], part: string, pin: string) => circuit.wires.push({ id: `w${++n}`, from, to: { part, pin } });
  const input = (name: string) => ({ part: `in_${name}`, pin: "out" });
  const gate = (kind: PartKind, ...xs: Wire["from"][]) => {
    const id = add(kind, xs.length > 2 ? { n: xs.length } : {});
    xs.forEach((x, i) => link(x, id, "abcd"[i]));
    return { part: id, pin: "y" };
  };
  const out = (name: string, from: Wire["from"]) => link(from, `out_${name}`, "in");
  return { circuit, add, link, input, gate, out };
}

// A right answer passes, with its gates counted
const ha = build(ch("half-adder"));
ha.out("sum", ha.gate("xor", ha.input("a"), ha.input("b")));
ha.out("carry", ha.gate("and", ha.input("a"), ha.input("b")));
assert.deepEqual(gradeCircuit(ch("half-adder"), ha.circuit), { ok: true, reason: null, gates: 2 });

// Swapped outputs fail, and say where
const swapped = build(ch("half-adder"));
swapped.out("carry", swapped.gate("xor", swapped.input("a"), swapped.input("b")));
swapped.out("sum", swapped.gate("and", swapped.input("a"), swapped.input("b")));
const sw = gradeCircuit(ch("half-adder"), swapped.circuit);
assert.equal(sw.ok, false);
assert.deepEqual(sw.failing?.inputs, { a: 0, b: 1 });
assert.deepEqual(sw.failing?.wrong.map((w) => [w.name, w.expected, w.got]), [["sum", 1, 0], ["carry", 0, 1]]);

// The right kinds of gate only, wherever they are hidden
const banned = build(ch("not-from-nand"));
banned.out("y", banned.gate("not", banned.input("a")));
assert.match(gradeCircuit(ch("not-from-nand"), banned.circuit).reason!, /doesn't allow not/);
const inner: Circuit = { module: "hide", parts: [{ id: "i", kind: "switch", x: 0, y: 0, label: "x" }, { id: "n", kind: "not", x: 0, y: 0, label: "n" }, { id: "o", kind: "led", x: 0, y: 0, label: "z" }],
  wires: [{ id: "w1", from: { part: "i", pin: "out" }, to: { part: "n", pin: "a" } }, { id: "w2", from: { part: "n", pin: "y" }, to: { part: "o", pin: "in" } }] };
const hidden = build(ch("not-from-nand"));
const inst = hidden.add("block", { block: "hide", ports: { inputs: [{ name: "x", width: 1 }], outputs: [{ name: "z", width: 1 }] } });
hidden.link(hidden.input("a"), inst, "x");
hidden.out("y", { part: inst, pin: "z" });
hidden.circuit.blocks = { hide: inner };
assert.match(gradeCircuit(ch("not-from-nand"), hidden.circuit).reason!, /doesn't allow not/);
assert.ok(kindsUsed(hidden.circuit).has("not"));

// Over budget: it works, and the grade says so; a block's gates count, a 3-input gate counts twice
const wasteful = build(ch("not-from-nand"));
const n1 = wasteful.gate("nand", wasteful.input("a"), wasteful.input("a"));
const n2 = wasteful.gate("nand", n1, n1);
wasteful.out("y", wasteful.gate("nand", n2, n2));
assert.deepEqual(gradeCircuit(ch("not-from-nand"), wasteful.circuit), { ok: false, reason: null, gates: 3, overBudget: true });
const wide = build(ch("even-parity"));
const three = wide.gate("xor", wide.input("a"), wide.input("b"), wide.input("c"));
wide.out("p", wide.gate("xor", three, wide.input("d")));
assert.deepEqual(gradeCircuit(ch("even-parity"), wide.circuit), { ok: true, reason: null, gates: 3 });

// Missing or mislabelled ports
const renamed = build(ch("half-adder"));
renamed.circuit.parts = renamed.circuit.parts.map((p) => (p.label === "sum" ? { ...p, label: "total" } : p));
assert.match(gradeCircuit(ch("half-adder"), renamed.circuit).reason!, /output labelled sum/);
const narrow = starterCircuit(ch("comparator-2bit"));
narrow.parts = narrow.parts.map((p) => (p.label === "a" ? { ...p, w: 3 } : p));
assert.match(gradeCircuit(ch("comparator-2bit"), narrow).reason!, /a must be 2 bits wide, but it is 3/);

// Sequential: the right T flip-flop passes; one that ignores t, or one that changes without a clock, doesn't
const t = build(ch("t-from-d"));
const ff = t.add("dff");
t.link(t.gate("xor", { part: ff, pin: "q" }, t.input("t")), ff, "d");
t.link(t.input("clk"), ff, "clk");
t.out("q", { part: ff, pin: "q" });
assert.deepEqual(gradeCircuit(ch("t-from-d"), t.circuit), { ok: true, reason: null, gates: 1 });
const lazy = build(ch("t-from-d"));
const ff2 = lazy.add("dff");
lazy.link(lazy.gate("xor", { part: ff2, pin: "q" }, { part: ff2, pin: "q" }), ff2, "d");
lazy.link(lazy.input("clk"), ff2, "clk");
lazy.out("q", { part: ff2, pin: "q" });
assert.match(gradeCircuit(ch("t-from-d"), lazy.circuit).failing!.step, /After clock edge/);
const wire = build(ch("t-from-d"));
wire.out("q", wire.input("t"));
const noClock = gradeCircuit(ch("t-from-d"), wire.circuit);
assert.match(noClock.failing!.step, /inputs alone changed the output/);

// The models themselves against independent definitions
const detect = ch("detect-101").spec;
if (detect.kind === "seq") {
  let state = 0, seed = 7;
  const bits: number[] = [];
  for (let i = 0; i < 2000; i++) {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
    const x = (seed >>> 16) & 1;
    bits.push(x);
    state = detect.next(state, { x });
    const hit = i >= 2 && bits[i - 2] === 1 && bits[i - 1] === 0 && bits[i] === 1;
    assert.equal(detect.out(state).y, +hit, `101 detector at bit ${i}`);
  }
}
const jk = ch("jk-from-d").spec;
if (jk.kind === "seq") {
  assert.deepEqual([[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]].map(([j, k, s]) => jk.next(s, { j, k })), [0, 1, 0, 1, 1, 1, 0, 0]);
}
const seg = ch("bcd-7seg").spec;
if (seg.kind === "comb") {
  assert.deepEqual(seg.f({ bcd: 8 }), { a: 1, b: 1, c: 1, d: 1, e: 1, f: 1, g: 1 });
  assert.deepEqual(seg.f({ bcd: 1 }), { a: 0, b: 1, c: 1, d: 0, e: 0, f: 0, g: 0 });
  assert.deepEqual(seg.f({ bcd: 12 }), {}, "don't-cares aren't checked");
}

// Circuits from outside: garbage is refused before anything compiles it
for (const bad of ["", "not json", "null", "[]", "{}", '{"module":"m"}', '{"module":"m","parts":[{}],"wires":[]}', 42, null]) {
  assert.equal(typeof parseCircuit(bad), "string", String(bad));
}
const good = { module: "m", parts: [{ id: "a", kind: "switch", x: 0, y: 0, label: "a" }], wires: [] };
const withPart = (p: object) => ({ ...good, parts: [p] });
assert.equal(typeof parseCircuit(good), "object");
assert.match(parseCircuit(withPart({ id: "a", kind: "constructor", x: 0, y: 0, label: "a" })) as string, /doesn't know/);
assert.match(parseCircuit(withPart({ id: "a", kind: "__proto__", x: 0, y: 0, label: "a" })) as string, /doesn't know/);
assert.match(parseCircuit(withPart({ id: "a", kind: "and", x: "0", y: 0, label: "a" })) as string, /no position/);
assert.match(parseCircuit(withPart({ id: "a", kind: "block", block: "__proto__", x: 0, y: 0, label: "a" })) as string, /doesn't include/);
assert.match(parseCircuit({ ...good, wires: [{ id: "w", from: {}, to: {} }] }) as string, /broken wire/);
assert.match(parseCircuit({ ...good, blocks: [] }) as string, /too many blocks/);
assert.match(parseCircuit({ ...good, blocks: { x: { module: "x", parts: [{ id: "a", kind: "nope", x: 0, y: 0, label: "a" }], wires: [] } } }) as string, /doesn't know/);
assert.match(parseCircuit("x".repeat(MAX_CIRCUIT_CHARS + 1)) as string, /too large/);

// Blocks that multiply are counted without being expanded, and a block containing itself is infinite
const instance = (block: string, i: number): Part => ({ id: `${block}${i}`, kind: "block", block, x: 0, y: 0, label: `${block}${i}`, ports: { inputs: [], outputs: [] } });
const tenOf = (block: string) => Array.from({ length: 10 }, (_, i) => instance(block, i));
const bomb: Circuit = { module: "bomb", parts: tenOf("b0"), wires: [], blocks: Object.fromEntries(Array.from({ length: 8 }, (_, d) => [`b${d}`, { module: `b${d}`, parts: d === 7 ? [{ id: "n", kind: "nand", x: 0, y: 0, label: "n" }] : tenOf(`b${d + 1}`), wires: [] } as Circuit])) };
const t0 = Date.now();
assert.equal(flatPartCount(bomb), 1e8);
assert.match(gradeCircuit(ch("not-from-nand"), bomb).reason!, /more than 400 parts/);
assert.ok(Date.now() - t0 < 500, "refused without expanding it");
assert.equal(flatPartCount({ module: "s", parts: [instance("me", 0)], wires: [], blocks: { me: { module: "me", parts: [instance("me", 1)], wires: [] } } }), Infinity);

// Worked solutions, when this checkout has them
const refsPath = path.join(__dirname, "../private/circuit-challenge-refs.json");
if (fs.existsSync(refsPath)) {
  const refs = JSON.parse(fs.readFileSync(refsPath, "utf8")) as Record<string, Circuit>;
  for (const c of CHALLENGES) {
    assert.ok(refs[c.id], `${c.id}: no worked solution`);
    const parsed = parseCircuit(JSON.stringify(refs[c.id]));
    assert.notEqual(typeof parsed, "string", `${c.id}: ${parsed}`);
    const g = gradeCircuit(c, parsed as Circuit);
    assert.ok(g.ok, `${c.id}: ${JSON.stringify(g)}`);
    console.log(`  ${c.id}: ${g.gates} of ${c.budget} gates`);
  }
} else console.log("  worked solutions: skipped (private/ isn't in this checkout)");

console.log("circuit-challenges: all checks passed");
