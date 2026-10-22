/**
 * scripts/logic-min.check.ts — self-check for lib/studio/logic-min.ts (npx tsx scripts/logic-min.check.ts).
 */
import assert from "node:assert/strict";
import {
  type Cell, type Implicant, covers, generateVerilog, groupRects, kmapLayout, literals,
  minimizePos, minimizeSop, posText, primeImplicants, realizes, sopText, tableFromNetlist,
} from "../lib/studio/logic-min";

const table = (n: number, f: (m: number) => Cell): Cell[] => Array.from({ length: 1 << n }, (_, m) => f(m));

// Textbook cases
const abc = ["a", "b", "c"];
assert.equal(sopText(minimizeSop(3, table(3, (m) => (m >> 1) & 1 ? 1 : 0)), abc), "b");                 // y = b
assert.equal(sopText(minimizeSop(2, [0, 1, 1, 0]), ["a", "b"]), "(~a & b) | (a & ~b)");                   // xor
assert.equal(sopText(minimizeSop(2, [0, 1, 1, 0]), ["a", "b"], "math"), "a'b + ab'");
assert.equal(sopText(minimizeSop(3, table(3, () => 0)), abc), "1'b0");
assert.equal(sopText(minimizeSop(3, table(3, () => 1)), abc), "1'b1");
assert.equal(sopText(minimizeSop(2, [0, 1, 1, 0]), ["in1", "in2"], "math"), "in1'·in2 + in1·in2'", "multi-letter names get ·");
// majority: ab + ac + bc
assert.equal(sopText(minimizeSop(3, table(3, (m) => ([3, 5, 6, 7].includes(m) ? 1 : 0))), abc, "math"), "bc + ac + ab");
// a don't-care lets the term grow: ones {1,3}, x at {5,7} -> c
assert.equal(sopText(minimizeSop(3, table(3, (m) => ([1, 3].includes(m) ? 1 : [5, 7].includes(m) ? "x" : 0))), abc), "c");
// POS of majority: (a+b)(a+c)(b+c)
assert.equal(posText(minimizePos(3, table(3, (m) => ([3, 5, 6, 7].includes(m) ? 1 : 0))), abc, "math"), "(b + c)(a + c)(a + b)");

// K-map: 4 vars, the corners group (b'd') wraps both ways -> four 1x1 rectangles
const k4 = kmapLayout(["a", "b", "c", "d"]);
assert.deepEqual(k4.rows, [0, 1, 3, 2]);
assert.equal(k4.minterm(2, 3), 0b1110);
const corners = minimizeSop(4, table(4, (m) => ([0, 2, 8, 10].includes(m) ? 1 : 0)));
assert.deepEqual(corners, [{ value: 0, mask: 0b1010 }]);
assert.equal(groupRects(corners[0], k4).length, 4);
assert.deepEqual(groupRects({ value: 0b0100, mask: 0b0011 }, k4), [{ r: 1, c: 0, h: 1, w: 4 }]);   // row a'b

// Random functions: the result must match the table, and its term count must equal an
// independent exhaustive search over the primes (smallest k for which some k primes cover).
let seed = 12345;
const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
function exhaustiveMin(ones: number[], primes: Implicant[]): number {
  const useful = primes.filter((p) => ones.some((m) => covers(p, m)));
  if (!ones.length) return 0;
  for (let k = 1; k <= useful.length; k++) {
    const pick = (start: number, left: number, chosen: Implicant[]): boolean =>
      left === 0 ? ones.every((m) => chosen.some((p) => covers(p, m)))
        : useful.slice(start).some((p, i) => pick(start + i + 1, left - 1, [...chosen, p]));
    if (pick(0, k, [])) return k;
  }
  throw new Error("no cover");
}
for (let trial = 0; trial < 500; trial++) {
  const n = 2 + (trial % 5);                 // 2..6 inputs
  const cells = table(n, () => { const r = rand(); return r < 0.4 ? 1 : r < 0.85 ? 0 : "x"; });
  const sop = minimizeSop(n, cells), pos = minimizePos(n, cells);
  assert.ok(realizes(cells, sop, "sop"), `sop wrong for ${cells.join("")}`);
  assert.ok(realizes(cells, pos, "pos"), `pos wrong for ${cells.join("")}`);
  if (n <= 4) {
    const ones = cells.flatMap((c, m) => (c === 1 ? [m] : []));
    const dcs = cells.flatMap((c, m) => (c === "x" ? [m] : []));
    assert.equal(sop.length, exhaustiveMin(ones, primeImplicants(ones, dcs)), `not minimal for ${cells.join("")}`);
  }
  assert.ok(sop.every((t) => literals(t, n) <= n));
}

// Generated Verilog: one assign per output; the testbench skips don't-care rows
const { design, testbench } = generateVerilog({ inputs: ["a", "b"], outputs: [{ name: "y", cells: [0, 1, 1, "x"] }] });
assert.match(design, /assign y = a \| b;|assign y = b \| a;/);
assert.equal((testbench.match(/\{a, b\} = 2'b/g) ?? []).length, 3);
assert.match(testbench, /ALL TESTS PASSED/);
// A netlist's table: y = a & b[1]; bus bits become columns, MSB first
const net = {
  ports: { a: { direction: "input", bits: [2] }, b: { direction: "input", bits: [3, 4] }, y: { direction: "output", bits: [5] } },
  cells: [{ type: "$_AND_", conn: { A: [2], B: [4], Y: [5] } }],
};
assert.deepEqual(tableFromNetlist(net), { inputs: ["a", "b_1", "b_0"], outputs: [{ name: "y", cells: [0, 0, 0, 0, 0, 0, 1, 1] }] });
assert.match(tableFromNetlist({ ...net, cells: [{ type: "$_DFF_P_", conn: { C: [2], D: [3], Q: [5] } }] }) as string, /sequential/);
console.log("logic-min: all checks passed");
