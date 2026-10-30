/**
 * scripts/logic-circuit.check.ts — K-map to circuit and back (npx tsx scripts/logic-circuit.check.ts):
 * every generated form computes the table it came from, on the same path the editor uses
 * (compile, GateSim, tableFromNetlist), and only uses the gates its form allows.
 */
import assert from "node:assert/strict";
import { compile, validate } from "../lib/studio/circuit";
import { type CircuitForm, FORM_LABELS, circuitFromTable, gateCount } from "../lib/studio/logic-circuit";
import { size } from "../lib/studio/circuit-edit";
import {
  type Cell, type TruthTable, invertingText, kmapSheets, minimizationSteps, minimizePos, minimizeSop, onesIn, qmPasses, primeImplicants, sheetTerm, tableFromNetlist, termMinterms, termPattern,
} from "../lib/studio/logic-min";

const FORMS = Object.keys(FORM_LABELS) as CircuitForm[];
const ALLOWED: Record<CircuitForm, string[]> = { sop: ["not", "and", "or"], pos: ["not", "and", "or"], nand: ["nand"], nor: ["nor"] };
const IO = ["switch", "led", "const0", "const1"];
const rows = (n: number, f: (m: number) => Cell): Cell[] => Array.from({ length: 1 << n }, (_, m) => f(m));

function roundTrip(t: TruthTable, label: string) {
  for (const form of FORMS) {
    const c = circuitFromTable(t, form);
    assert.deepEqual(validate(c).filter((i) => i.level === "error"), [], `${label} ${form}: valid`);
    for (const p of c.parts) assert.ok([...ALLOWED[form], ...IO].includes(p.kind), `${label} ${form}: ${p.kind} isn't allowed`);
    const back = tableFromNetlist(compile(c).net);
    if (typeof back === "string") throw new Error(`${label} ${form}: ${back}`);
    assert.deepEqual(back.inputs, t.inputs, `${label} ${form}: input order`);
    t.outputs.forEach((o, i) => o.cells.forEach((v, m) => {
      if (v !== "x") assert.equal(back.outputs[i].cells[m], v, `${label} ${form}: ${o.name} at row ${m}`);
    }));
    assert.ok(c.wires.every((w) => {
      const a = c.parts.find((p) => p.id === w.from.part)!, b = c.parts.find((p) => p.id === w.to.part)!;
      return b.x >= a.x + size(a).w;
    }), `${label} ${form}: every wire runs left to right`);
    // No two parts on top of each other
    for (const a of c.parts) for (const b of c.parts) {
      if (a === b) continue;
      const A = size(a), B = size(b);
      assert.ok(a.x + A.w <= b.x || b.x + B.w <= a.x || a.y + A.h <= b.y || b.y + B.h <= a.y, `${label} ${form}: ${a.label} overlaps ${b.label}`);
    }
  }
}

// Textbook functions
const maj = rows(3, (m) => ([3, 5, 6, 7].includes(m) ? 1 : 0));
roundTrip({ inputs: ["a", "b", "c"], outputs: [{ name: "y", cells: maj }] }, "majority");
roundTrip({ inputs: ["a", "b", "cin"], outputs: [{ name: "sum", cells: rows(3, (m) => ((m ^ (m >> 1) ^ (m >> 2)) & 1) as Cell) }, { name: "cout", cells: maj }] }, "full adder");
roundTrip({ inputs: ["d3", "d2", "d1", "d0"], outputs: [{ name: "seg_a", cells: rows(4, (m) => (m > 9 ? "x" : [1, 4].includes(m) ? 0 : 1)) }] }, "BCD seg a");
// Corners: constants, a single literal (true and inverted), a one-term function, every input needed
roundTrip({ inputs: ["a", "b"], outputs: [{ name: "lo", cells: [0, 0, 0, 0] }, { name: "hi", cells: [1, 1, 1, 1] }, { name: "same", cells: [0, 0, 1, 1] }, { name: "inv", cells: [1, 0, 1, 0] }] }, "corners");
roundTrip({ inputs: ["a", "b", "c", "d", "e", "f"], outputs: [{ name: "all", cells: rows(6, (m) => (m === 63 ? 1 : 0)) }, { name: "any", cells: rows(6, (m) => (m ? 1 : 0)) }] }, "6-input AND and OR");
roundTrip({ inputs: ["a", "b"], outputs: [{ name: "y", cells: ["x", "x", "x", "x"] }] }, "all don't-cares");

// Random tables with don't-cares, 2 to 6 inputs
let seed = 4242;
const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
for (let trial = 0; trial < 150; trial++) {
  const n = 2 + (trial % 5);
  const names = ["a", "b", "c", "d", "e", "f"].slice(0, n);
  const cell = () => () => { const r = rand(); return (r < 0.4 ? 1 : r < 0.85 ? 0 : "x") as Cell; };
  roundTrip({ inputs: names, outputs: [{ name: "x", cells: rows(n, cell()) }, { name: "y", cells: rows(n, cell()) }] }, `random ${trial}`);
}

// A term shared by two outputs is built once
const shared = circuitFromTable({ inputs: ["a", "b", "c"], outputs: [{ name: "x", cells: rows(3, (m) => (m >= 6 ? 1 : 0)) }, { name: "y", cells: rows(3, (m) => (m >= 6 || m === 1 ? 1 : 0)) }] }, "sop");
assert.equal(shared.parts.filter((p) => p.kind === "and" && p.n === undefined).length, 1, "ab appears once");
assert.equal(gateCount(circuitFromTable({ inputs: ["a", "b"], outputs: [{ name: "y", cells: [0, 0, 0, 1] }] }, "nand")), 2, "y = ab is two NANDs");
assert.equal(gateCount(circuitFromTable({ inputs: ["a", "b"], outputs: [{ name: "y", cells: [0, 1, 1, 1] }] }, "nor")), 2, "y = a + b is two NORs");

// Expressions in the inverting forms
const names = ["a", "b", "c"];
assert.equal(invertingText(minimizeSop(3, maj), names, "nand"), "((bc)'(ac)'(ab)')'");
assert.equal(invertingText(minimizePos(3, maj), names, "nor"), "((b + c)' + (a + c)' + (a + b)')'");
assert.equal(invertingText(minimizeSop(2, [0, 0, 1, 1]), ["a", "b"], "nand"), "a");
assert.equal(invertingText(minimizeSop(2, [0, 0, 0, 0]), ["a", "b"], "nand"), "0");
assert.equal(invertingText(minimizePos(2, [1, 1, 1, 1]), ["a", "b"], "nor"), "1");
assert.equal(invertingText(minimizeSop(2, [0, 1, 1, 1]), ["a", "b"], "nand"), "(b'a')'", "a one-literal term just flips");

// Quine-McCluskey passes and the grouping steps
const prev = primeImplicants([3, 5, 6, 7], []);
assert.deepEqual(qmPasses([3, 5, 6, 7], []).flat().filter((t) => !t.merged).map(({ value, mask }) => ({ value, mask })), prev);
assert.equal(qmPasses([3, 5, 6, 7], []).length, 2, "minterms, then one merge pass");
assert.equal(termPattern({ value: 0b001, mask: 0b100 }, 3), "-01");
assert.deepEqual(termMinterms({ value: 0b001, mask: 0b100 }, 3), [1, 5]);
assert.equal(onesIn({ value: 0b101, mask: 0 }), 2);
const steps = minimizationSteps(3, maj);
assert.equal(steps.steps.length, 3);
assert.ok(steps.steps.every((s) => s.essential), "each majority term is the only one covering a corner");
assert.deepEqual(steps.steps.flatMap((s) => s.fresh).sort(), [3, 5, 6, 7], "every one is covered exactly once as fresh");
// Cyclic core: no essential primes, the method still finds a minimum
const cyclic = minimizationSteps(3, rows(3, (m) => ([0, 1, 2, 5, 6, 7].includes(m) ? 1 : 0)));
assert.equal(cyclic.essentials.length, 0);
assert.equal(cyclic.steps.length, 3);
// POS steps cover the zeros, and don't-cares never need covering
const pos = minimizationSteps(3, rows(3, (m) => ([3, 5, 6, 7].includes(m) ? 1 : m === 0 ? "x" : 0)), "pos");
assert.deepEqual(pos.targets, [1, 2, 4]);
assert.deepEqual(pos.steps.flatMap((s) => s.fresh).sort(), [1, 2, 4]);

// 5- and 6-input maps: sheets of 4-variable maps cover every row exactly once
for (const n of [2, 3, 4, 5, 6]) {
  const vars = ["a", "b", "c", "d", "e", "f"].slice(0, n);
  const { outer, sheets, inner } = kmapSheets(vars);
  const innerBits = n - outer.length;
  const seen = sheets.flatMap((s) => inner.rows.flatMap((_, r) => inner.cols.map((_, c) => (s << innerBits) | inner.minterm(r, c))));
  assert.deepEqual([...seen].sort((a, b) => a - b), Array.from({ length: 1 << n }, (_, m) => m), `${n} inputs`);
}
// A group that spans sheets shows on each; one that doesn't, only on its own
assert.deepEqual(sheetTerm({ value: 0b00011, mask: 0b10000 }, 1, 4), { value: 0b0011, mask: 0 });
assert.deepEqual(sheetTerm({ value: 0b00011, mask: 0b10000 }, 0, 4), { value: 0b0011, mask: 0 });
assert.equal(sheetTerm({ value: 0b10011, mask: 0 }, 0, 4), null);
assert.deepEqual(sheetTerm({ value: 0b100011, mask: 0b010000 }, 2, 4), { value: 0b0011, mask: 0 });
assert.deepEqual(sheetTerm({ value: 0b100011, mask: 0b010000 }, 3, 4), { value: 0b0011, mask: 0 });
assert.equal(sheetTerm({ value: 0b100011, mask: 0b010000 }, 1, 4), null);

console.log("logic-circuit: all checks passed");
