/** scripts/boolexpr.check.ts — self-check for lib/studio/boolexpr.ts (npx tsx scripts/boolexpr.check.ts). */
import assert from "node:assert/strict";
import { type Parsed, counterexample, gateCount, parseBool, table, toVerilog } from "../lib/studio/boolexpr";
import { minimizeSop, sopText } from "../lib/studio/logic-min";

const p = (s: string, single = true) => { const r = parseBool(s, single); if (typeof r === "string") throw new Error(`${s}: ${r}`); return r; };
const tt = (s: string, single = true) => { const r = p(s, single); return table(r.expr, r.vars).join(""); };
const same = (a: string, b: string) => counterexample(p(a), p(b)) === null;

// Notations agree: XOR four ways
for (const s of ["A'B + AB'", "~A&B | A&~B", "A ^ B", "A⊕B", "!A·B ∨ A·¬B", "(A+B)(A'+B')", "A'B+AB’"]) assert.equal(tt(s), "0110", s);
assert.deepEqual(p("C + AB").vars, ["A", "B", "C"], "alphabetical");
assert.equal(tt("AB + C"), "01010111");
assert.equal(tt("A(B + C)"), "00000111", "juxtaposition before a parenthesis");
assert.equal(tt("(A + B)'"), "1000");
assert.equal(tt("A''"), "01", "double negation");
assert.equal(tt("1"), "1");
assert.equal(tt("A + 0"), "01");
assert.equal(tt("a ^ b & c", false), tt("a ^ (b & c)", false), "AND binds tighter than XOR");
assert.equal(tt("a | b ^ c", false), tt("a | (b ^ c)", false), "XOR binds tighter than OR");
assert.deepEqual(p("sel & a | ~sel & b", false).vars, ["a", "b", "sel"]);
assert.equal(tt("sel&a | ~sel&b", false), "00100111", "a 2:1 mux (rows: a b sel)");
assert.deepEqual(p("A1 A2").vars, ["A1", "A2"], "single-letter mode keeps digits on a name");
assert.match(parseBool("A + ") as string, /ends too soon/);
assert.match(parseBool("(A + B") as string, /Missing \)/);
assert.match(parseBool("A $ B") as string, /Unexpected "\$" at position 3/);
assert.match(parseBool("A + )") as string, /Unexpected "\)"/);
assert.match(parseBool("") as string, /Type an expression/);

// Laws: De Morgan, absorption, consensus, distribution; and a real difference
assert.ok(same("(AB)'", "A' + B'"));
assert.ok(same("(A + B)'", "A'B'"));
assert.ok(same("A + AB", "A"));
assert.ok(same("AB + A'C + BC", "AB + A'C"), "consensus");
assert.ok(same("A + BC", "(A + B)(A + C)"));
const diff = counterexample(p("A + B"), p("A ^ B"));
assert.deepEqual(diff, { env: { A: 1, B: 1 }, a: 1, b: 0 });
assert.equal(counterexample(p("A"), p("A + B'B")), null, "variables only in one side are enumerated too");

// Verilog text keeps the meaning, with minimal parentheses
for (const s of ["A'B + AB'", "(A + B)(C + D')", "A ^ B ^ C", "(A ^ B)'", "A(B + C)'D"]) {
  const v = toVerilog(p(s).expr);
  assert.ok(same(s, v), `${s} -> ${v}`);
}
assert.equal(toVerilog(p("A'B + AB'").expr), "~A & B | A & ~B");
assert.equal(toVerilog(p("(A + B)C").expr), "(A | B) & C");
assert.equal(toVerilog(p("A + (B + C)").expr), "A | (B | C)");
assert.deepEqual(gateCount(p("A'B + AB'").expr), { and: 2, or: 1, xor: 0, not: 2 });

// Through the minimiser: XOR stays two terms, absorption collapses
const minimal = (s: string) => { const r: Parsed = p(s); return sopText(minimizeSop(r.vars.length, table(r.expr, r.vars)), r.vars, "math"); };
assert.equal(minimal("A + AB"), "A");
assert.equal(minimal("AB + A'C + BC"), "A'C + AB");
assert.equal(minimal("A'B + AB'"), "A'B + AB'");
console.log("boolexpr: all checks passed");
