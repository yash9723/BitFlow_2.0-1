/**
 * scripts/academy.check.ts — tests the Academy's content (npx tsx scripts/academy.check.ts):
 * every live circuit runs and does what its chapter says, K-map answers are the real minimal
 * forms, worked figures match the arithmetic, and links and the chapter list are right.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ACADEMY_TOPICS } from "../lib/academy-content";
import { ACADEMY_TOPIC_META } from "../lib/academy-meta";
import type { AcademyBlock, AcademyTopic } from "../lib/academy-types";
import { GateSim, toNumber } from "../lib/gate-sim";
import { getProblemBySlug } from "../lib/problems/index";
import { compile, toBits, validate } from "../lib/studio/circuit";
import { challengeById } from "../lib/studio/circuit-challenges";
import { crossesPart, routeAll } from "../lib/studio/circuit-route";
import { wireRoute } from "../lib/studio/circuit-edit";
import { ANIM_IDS, LEVEL, addColumns, asSigned, MEALY_101, MOORE_101, REDUCIBLE, boothSteps, claCarryTime, claLevels, cmosState, compareSteps, divideSteps, encoderError, fromGray, inverterOut, inverterState, johnsonNext, latchFfTick, loadModel, mealyOut, neighbours, noiseChain, partitionSteps, qmSteps, rcWave, reads, ringNext, rippleCarryTime, rippleSteps, shiftAddSteps, shiftStep, srSteps, toGray, wheelMove } from "../lib/academy/anim";
import { type Cell, type Implicant, minimizationSteps, primeImplicants } from "../lib/studio/logic-min";
import { type Parsed, counterexample, parseBool } from "../lib/studio/boolexpr";
import { draw } from "../lib/academy/draw";
import { DelaySim } from "../lib/studio/delay-sim";
import { minimizePos, minimizeSop, posText, sopText } from "../lib/studio/logic-min";

const ROOT = process.cwd();
const blocksOf = (t: AcademyTopic) => t.sections.flatMap((s) => s.blocks ?? []);
const rewritten = (t: AcademyTopic) => blocksOf(t).length > 0;

function checkCircuit(where: string, b: Extract<AcademyBlock, { kind: "circuit" }>) {
  const errors = validate(b.circuit).filter((i) => i.level === "error");
  assert.deepEqual(errors, [], `${where}: circuit has errors`);
  const { net } = compile(b.circuit);
  assert.ok(b.checks.length > 0, `${where}: circuit has no checks`);
  // One simulator across the checks, so a sequential circuit's checks can walk through its states.
  const sim = new GateSim(net);
  for (const c of b.checks) {
    for (const [port, v] of Object.entries(c.set)) {
      assert.ok(sim.ports[port], `${where}: no input ${port}`);
      sim.set(port, toBits(v, sim.ports[port].bits.length));
    }
    for (const [port, v] of Object.entries(c.expect)) {
      assert.ok(sim.ports[port], `${where}: no output ${port}`);
      assert.equal(toNumber(sim.get(port)), v, `${where}: with ${JSON.stringify(c.set)}, ${port}`);
    }
  }
  // It has to be readable: no wire runs through a part it doesn't connect to.
  const routed = routeAll(b.circuit), byId = new Map(routed.parts.map((p) => [p.id, p]));
  for (const w of routed.wires) {
    const pts = wireRoute(w, byId.get(w.from.part)!, byId.get(w.to.part)!);
    for (const p of routed.parts) {
      if (p.id === w.from.part || p.id === w.to.part) continue;
      assert.ok(!crossesPart(pts, p), `${where}: wire ${w.from.part}.${w.from.pin} → ${w.to.part}.${w.to.pin} runs through ${p.label}`);
    }
  }
}

function checkLink(where: string, href: string) {
  const [, area, rest] = href.match(/^\/([^/]+)\/?(.*)$/) ?? [];
  assert.ok(area, `${where}: bad link ${href}`);
  if (area === "academy" && rest && !rest.includes("/") && rest !== "roadmap") return assert.ok(ACADEMY_TOPICS.some((t) => t.slug === rest), `${where}: no chapter ${href}`);
  if (area === "problems" && rest) return assert.ok(getProblemBySlug(rest), `${where}: no problem ${href}`);
  if (area === "studio" && rest.startsWith("challenges/")) return assert.ok(challengeById(rest.slice(11)), `${where}: no challenge ${href}`);
  assert.ok(fs.existsSync(path.join(ROOT, "app", area, rest, "page.tsx")), `${where}: no page ${href}`);
}

let circuits = 0, kmaps = 0, practice = 0;
const anims = new Set<string>();
const topicIds = new Set<string>();
for (const t of ACADEMY_TOPICS) {
  assert.ok(!topicIds.has(t.slug), `duplicate chapter ${t.slug}`);
  topicIds.add(t.slug);
  for (const s of t.prerequisites ?? []) assert.ok(ACADEMY_TOPICS.some((x) => x.slug === s), `${t.slug}: unknown prerequisite ${s}`);

  const ids = (list: { id: string }[], what: string) => assert.equal(new Set(list.map((x) => x.id)).size, list.length, `${t.slug}: duplicate ${what} id`);
  ids(t.sections, "section"); ids(t.quiz, "quiz"); ids(t.flashcards, "flashcard"); ids(t.videos, "video");
  for (const q of t.quiz) {
    assert.ok(q.correctIndex >= 0 && q.correctIndex < q.options.length, `${t.slug}/${q.id}: answer out of range`);
    assert.equal(new Set(q.options).size, q.options.length, `${t.slug}/${q.id}: repeated option`);
  }

  if (!rewritten(t)) continue;
  assert.ok(t.quiz.length >= 10, `${t.slug}: needs at least 10 quiz questions`);
  assert.ok(t.flashcards.length >= 8, `${t.slug}: needs at least 8 flashcards`);
  // Text supports **bold** and `code` only: a stray * or ` would show up literally on the page.
  for (const m of JSON.stringify({ sections: t.sections.map((s) => (s.blocks ?? []).map((b) => (b.kind === "circuit" ? b.caption : b.kind === "code" ? "" : b))), quiz: t.quiz, cards: t.flashcards })
    .replace(/`[^`]*`/g, "").replace(/\*\*[^*]+\*\*/g, "").matchAll(/.{0,30}[*`].{0,30}/g)) assert.fail(`${t.slug}: stray markup in "${m[0]}"`);
  for (const s of t.sections) {
    const where = `${t.slug}/${s.id}`;
    assert.ok(s.blocks?.length, `${where}: empty section`);
    s.blocks!.forEach((b, i) => {
      const at = `${where}[${i}]`;
      switch (b.kind) {
        case "circuit": circuits++; checkCircuit(at, b); break;
        case "kmap": {
          kmaps++;
          assert.equal(b.cells.length, 2 ** b.names.length, `${at}: wrong number of K-map cells`);
          const text = b.form === "pos" ? posText(minimizePos(b.names.length, b.cells), b.names, "math") : sopText(minimizeSop(b.names.length, b.cells), b.names, "math");
          assert.equal(text, b.expect, `${at}: K-map answer`);
          break;
        }
        case "practice":
          practice++;
          assert.ok(b.correctIndex >= 0 && b.correctIndex < b.options.length, `${at}: answer out of range`);
          assert.equal(new Set(b.options).size, b.options.length, `${at}: repeated option`);
          break;
        case "table": for (const r of b.rows) assert.equal(r.length, b.headers.length, `${at}: row width`); break;
        case "link": checkLink(at, b.href); break;
        case "anim": anims.add(b.id); assert.ok(ANIM_IDS.includes(b.id), `${at}: unknown animation ${b.id}`); break;
        case "simplify": {
          // Every line of a derivation really is equal to the first.
          const lines = b.steps.map((s) => parseBool(s.expr));
          lines.forEach((l, k) => assert.ok(typeof l !== "string", `${at}: line ${k}: ${l}`));
          for (const l of lines.slice(1)) {
            const diff = counterexample(lines[0] as Parsed, l as Parsed);
            assert.equal(diff, null, `${at}: ${b.steps[0].expr} is not equal to a later line`);
          }
          break;
        }
        case "timing": for (const sig of b.diagram.signals) assert.ok(sig.dir === "clock" || sig.values.length === b.diagram.cycles, `${at}: ${sig.name} needs ${b.diagram.cycles} values`); break;
      }
    });
  }
}
assert.ok(circuits >= 30 && kmaps >= 14 && practice >= 75, "chapters lost their circuits or practice questions");

// ── Worked figures in the text are computed here, not trusted ─────────────────
function says(slug: string, ...facts: string[]) {
  const t = ACADEMY_TOPICS.find((x) => x.slug === slug)!;
  const words = JSON.stringify({ sections: t.sections, quiz: t.quiz });
  for (const f of facts) assert.ok(words.includes(f), `${slug} should say "${f}"`);
}
const bin = (n: number, w = 0) => n.toString(2).padStart(w, "0");
const parity = (n: number) => bin(n).split("").filter((c) => c === "1").length % 2;
const gray = (n: number) => n ^ (n >> 1);
const unsigned = (s: string, base = 2) => parseInt(s, base);
const signed = (s: string) => unsigned(s) - (s[0] === "1" ? 2 ** s.length : 0);

says("what-is-digital", `2⁵ = ${2 ** 5}`, `2¹⁰ = ${2 ** 10}`, `${(2.4 - 2).toFixed(1)} V`, `0.7 − 0.2 = **${(0.7 - 0.2).toFixed(1)} V**`);
says("number-systems",
  `101101₂`, `**${unsigned("101101")}**`, bin(45), `D6₁₆ = 13×16 + 6 = ${0xd6}`, `110101₂ = ${unsigned("110101").toString(8)}₈`,
  `(212)₃`, `= ${unsigned("212", 3)}.`, `**1657**`, `${0x3af}`, `13.25`, `**r = ${Math.sqrt(144) - 1}**`);
assert.equal(unsigned("1657", 8), 0x3af);
assert.equal(bin(13) + ".01", "1101.01");
assert.equal(unsigned("23", 6) + unsigned("14", 6), unsigned("41", 6));     // the "find r" practice question
says("binary-arithmetic",
  `**${bin(11 + 6)}**, which is ${11 + 6}`, `**${bin(13 * 5)}**, which is ${13 * 5}`, `**${bin(256 - 104, 8).replace(/(.{4})/, "$1 ")}**`,
  `1011 = −8 + 2 + 1 = ${signed("1011")}`.replace("-", "−"), `**${"−106"}**`, `**−20**`, `**7642**`, `**7643**`);
assert.equal(signed("11111011"), -5);
assert.equal(signed(bin(100 + 50, 8)), -106);
assert.equal(signed("101100"), -20);
assert.equal(9999 - 2357, 7642);
says("codes",
  `${bin(59)}`, `${bin(5, 4)} ${bin(9, 4)}`, `${bin(5 + 3, 4)} ${bin(9 + 3, 4)}`, `${bin(gray(0b1011), 4)}`, `**0110011**`);
for (let i = 0; i < 8; i++) says("codes", `"${i}","${bin(i, 3)}","${bin(gray(i), 3)}"`);
assert.equal(parity(0b1011), 1);
// Hamming(7,4): positions 1..7 of the codeword, computed from the data, and the checks that find a flipped bit.
{
  const code = (d: string) => { const c = [0, 0, 0, +d[0], 0, +d[1], +d[2], +d[3]];
    for (const pp of [1, 2, 4]) c[pp] = [1, 2, 3, 4, 5, 6, 7].filter((i) => i & pp && i !== pp).reduce((a, i) => a ^ c[i], 0);
    return c.slice(1).join(""); };
  const syndrome = (w: string) => [1, 2, 3, 4, 5, 6, 7].reduce((s, i) => (w[i - 1] === "1" ? s ^ i : s), 0);
  assert.equal(code("1011"), "0110011");
  assert.equal(syndrome("0110011"), 0);
  assert.equal(syndrome("0110111"), 5);
  says("codes", "0110111");
}
{
  const words = [0b00000, 0b01011, 0b10101, 0b11110];                       // the distance practice question
  const dist = words.flatMap((a, i) => words.slice(i + 1).map((b) => bin(a ^ b).split("").filter((c) => c === "1").length));
  assert.equal(Math.min(...dist), 3);
}

{
  const eq = (a: string, b: string) => {
    const x = parseBool(a), y = parseBool(b);
    assert.ok(typeof x !== "string" && typeof y !== "string", `${a} / ${b}`);
    return counterexample(x as Parsed, y as Parsed) === null;
  };
  // Claims the chapters state in words, each tested as logic.
  for (const [a, b] of [["AB + AB'", "A"], ["(AB)'", "A' + B'"], ["(A + B)'", "A'B'"], ["A + BC", "(A + B)(A + C)"], ["A + A'B", "A + B"], ["(A + B)(A + B')", "A"],
    ["A + A'B + A'B'", "1"], ["(A + B'C)'", "A'(B + C')"], ["XY + X'Z + YZ", "XY + X'Z"], ["(A ^ B) ^ A", "B"]] as const) {
    assert.ok(eq(a, b), `${a} should equal ${b}`);
  }
  assert.ok(!eq("(AB)'", "A'B'"), "the Not equal preset really isn't equal");
  says("boolean-algebra", "Σm(1, 2, 6)", "ΠM(0, 3, 4, 5, 7)", "2⁸ = **256**", "2⁴ = **16**");
  says("karnaugh-maps", "**b'd'**", "a'b'd + cd", "**2**");
  // The essential-prime counts and prime lists stated for the two K-maps in the chapter.
  const primesOf = (n: number, ones: number[]) => minimizationSteps(n, ones.reduce<Cell[]>((c, m) => { c[m] = 1; return c; }, Array(2 ** n).fill(0)), "sop");
  const m1 = primesOf(4, [0, 2, 4, 5, 7, 8, 10, 13, 15]);
  assert.equal(m1.primes.length, 4); assert.equal(m1.essentials.length, 2);
  const m2 = primesOf(3, [0, 1, 2, 5, 6, 7]);
  assert.equal(m2.primes.length, 6); assert.equal(m2.essentials.length, 0);
  const m3 = primesOf(4, [0, 1, 2, 5, 6, 7, 8, 9, 10, 14]);
  assert.equal(m3.primes.length, 6); assert.equal(m3.essentials.length, 2);
  says("quine-mccluskey", "Six primes reduce to three terms");
  // Petrick: exactly the example's three minimal covers.
  assert.ok(eq("(P + R)(P + Q)(Q + R)", "PQ + PR + QR"));
  // NAND gate counts stated in the gates chapter, as circuits they'd be: F = ab + cd in 3.
  assert.ok(eq("((AB)'(CD)')'", "AB + CD"));
  says("gates", "F = NAND(NAND(a, b), NAND(c, d))", "**4**");
}

// ── Chapters 9 to 12: figures in the text, computed ───────────────────────────
{
  const round = (x: number, d = 3) => +x.toFixed(d);
  // Noise margins in the family table.
  for (const [row, oh, ol, ih, il] of [["TTL (5 V)", 2.4, 0.4, 2.0, 0.8], ["74LS (5 V)", 2.7, 0.5, 2.0, 0.8], ["74HC CMOS (5 V)", 4.4, 0.1, 3.5, 1.5]] as const) {
    says("logic-families", `"${row}","${oh}","${ol}","${ih.toFixed(1)}","${il}","${round(oh - ih, 2)}","${round(il - ol, 2)}"`);
  }
  says("logic-families", `"-0.98"`.replace("-", "−"), String(round(-0.98 + 1.105, 3)), String(round(-1.475 + 1.63, 3)));
  assert.equal(Math.min(16 / 1.6, 400 / 40), 10);
  assert.equal(Math.min(8 / 0.4, 400 / 50), 8);
  assert.equal(round(10e-12 * 1 * 100e6, 6), 0.001);
  assert.equal(Math.round((1 - (0.9 / 1.2) ** 2) * 100), 44);
  says("adders-comparators", "(8 − 1) × 2 + 3 = **17 ns**");
  assert.equal(7 * 2 + 3, 17);
  assert.equal((0b1010 + 0b0101 + 1) ^ 0b1111, 0b11111 ^ 0, "cin flips all 4 sum bits and the carry");
  says("combinational", "4 + 2 + 1 = **7**", "16, 4 and 1 make **21**");
  // Booth run counts and the recoding.
  const ops = (bits: string) => boothSteps(1, parseInt(bits, 2), bits.length).rows.filter((r) => r.op !== "none").length;
  assert.equal(ops("01111110"), 2); assert.equal(ops("01010101"), 8);
  assert.equal(0b1000 - 0b0010, 0b0110);
  // The carry table in the chapter.
  for (const [n, ripple, cla] of [[4, 8, 3], [16, 32, 7], [64, 128, 11]] as const) {
    assert.equal(rippleCarryTime(n), ripple);
    assert.equal(Math.max(...Array.from({ length: n }, (_, i) => claCarryTime(i + 1, n))), cla, `${n}-bit lookahead`);
    says("arithmetic-circuits", `"${n} bits","${ripple}","${cla}"`);
  }
  assert.equal(claLevels(4), 1); assert.equal(claLevels(16), 2); assert.equal(claLevels(64), 3);
  // The carry times are what real gates do: an n-bit chain of g + p·c, one gate delay per AND and OR.
  for (const n of [4, 8]) {
    const c = draw(`chain${n}`, (d) => {
      const cin = d.sw("cin", 0, 0), p = d.sw("p", 0, 0), g = d.sw("g", 0, 0);
      let carry = cin;
      for (let i = 0; i < n; i++) carry = d.gate("or", `o${i}`, 0, 0, g, d.gate("and", `a${i}`, 0, 0, p, carry));
      d.led("cout", 0, 0, carry);
    });
    const { net } = compile(c), sim = new GateSim(net);
    sim.set("p", [1]);
    const uniform = { not: 1, and: 1, or: 1, xor: 1, mux: 1, ff: 1 };
    const t = new DelaySim(net, uniform, (b) => sim.net(b)).run("cin", [1]);
    assert.equal(t.settled, rippleCarryTime(n), "a carry takes two gate delays per stage");
  }
}

// ── Chapters 13 to 16: claims in the text, computed ───────────────────────────
{
  // The counter chapter's unused states really do return to the sequence.
  const mod5 = (s: number) => { const q2 = s >> 2, q1 = (s >> 1) & 1, q0 = s & 1; return ((q1 & q0) << 2) | ((q1 ^ q0) << 1) | ((q2 | q0) ^ 1); };
  assert.deepEqual([0, 1, 2, 3, 4].map(mod5), [1, 2, 3, 4, 0]);
  assert.deepEqual([5, 6, 7].map(mod5), [2, 2, 4]);
  says("counters", "State 5 goes to 2, state 6 goes to 2, and state 7 goes to 4");
  assert.equal(5 * 10, 50); assert.equal(1000 / 50, 20);
  assert.equal(1000 / (8 + 6 + 2), 62.5);
  assert.equal(Math.ceil(Math.log2(60)), 6);
  // The exam question's D2 = q1, D1 = q0, D0 = q2' counter has a cycle of 6.
  { let s = 0, n = 0; do { s = (((s >> 1) & 1) << 2) | ((s & 1) << 1) | ((s >> 2) ^ 1); n++; } while (s !== 0); assert.equal(n, 6); }
  // The LFSR in the registers chapter: 15 states, and it leaves out only 1111.
  { const seen = new Set<number>(); let s = 0; do { seen.add(s); s = ((s << 1) & 15) | (((s >> 3) ^ (s >> 2) ^ 1) & 1); } while (s !== 0); assert.equal(seen.size, 15); assert.ok(!seen.has(15));
    assert.equal(((15 << 1) & 15) | (((15 >> 3) ^ (15 >> 2) ^ 1) & 1), 15, "1111 is stuck"); }
  says("registers", "1, 3, 7, E, D, B, 6");
  assert.equal(Math.floor(asSigned(0b1011, 4) / 2), -3);
  assert.equal(9600 / 10, 960);
  says("sequential", "1 → 0 → 1 → **0**");
  assert.equal(Math.ceil(Math.log2(17)), 5); assert.equal(Math.ceil(Math.log2(9)), 4);
}

// ── The animations' logic ─────────────────────────────────────────────────────
assert.deepEqual([...anims].sort(), [...ANIM_IDS].sort(), "every animation is used by a chapter");
{
  // Below the margin a digital chain stays right, and an analog one drifts out of range; above it, both fail.
  const margin = LEVEL.high - LEVEL.inHigh;
  const small = noiseChain(1, 0.5), big = noiseChain(1, margin + 0.1);
  assert.ok(small.digital.every((v) => v === LEVEL.high));
  assert.notEqual(reads(small.analog[5]), 1);
  assert.notEqual(reads(big.digital[5]), 1);
  assert.ok(noiseChain(0, 0.4).digital.every((v) => v === LEVEL.low));

  for (const n of [1, 2, 45, 255]) assert.equal(divideSteps(n).map((s) => s.r).reverse().join(""), n.toString(2));
  for (let a = 0; a < 256; a += 7) for (let b = 0; b < 256; b += 11) {
    const cols = addColumns(a, b, 8), sum = cols.reduce((v, c, i) => v + c.sum * 2 ** i, 0) + cols[7].cout * 256;
    assert.equal(sum, a + b);
    const trueSum = asSigned(a, 8) + asSigned(b, 8);
    assert.equal(cols[7].cin !== cols[7].cout, trueSum > 127 || trueSum < -128, "overflow is carry in XOR carry out");
  }
  assert.deepEqual(wheelMove(7, 1, 4), { next: 8, carry: false, overflow: true });
  assert.deepEqual(wheelMove(15, 1, 4), { next: 0, carry: true, overflow: false });
  assert.deepEqual(wheelMove(8, -1, 4), { next: 7, carry: false, overflow: true });
  assert.deepEqual(wheelMove(0, -3, 4), { next: 13, carry: true, overflow: false });

  for (let n = 0; n < 256; n++) {
    assert.equal(fromGray(toGray(n)), n);
    assert.equal((toGray(n) ^ toGray((n + 1) % 256)).toString(2).replace(/0/g, ""), "1", "Gray neighbours differ in one bit");
  }
  // The encoder claim on the page: with misaligned sensors Gray is never more than a sector off, and binary is.
  let grayWorst = 0, binaryWorst = 0;
  for (let i = 0; i < 800; i++) { grayWorst = Math.max(grayWorst, encoderError(i / 100, "gray", 0.12)); binaryWorst = Math.max(binaryWorst, encoderError(i / 100, "binary", 0.12)); }
  assert.ok(grayWorst <= 1, "Gray stays within a sector");
  assert.ok(binaryWorst > 1, "binary jumps");

  for (const [gate, fn] of [["not", (a: number) => a ^ 1], ["nand", (a: number, b: number) => (a & b) ^ 1], ["nor", (a: number, b: number) => (a | b) ^ 1]] as const) {
    for (const a of [0, 1]) for (const b of [0, 1]) {
      const st = cmosState(gate, a, b);
      assert.equal(st.y, fn(a, b), `${gate}(${a},${b})`);
      assert.notEqual(st.up, st.down, `${gate}(${a},${b}) must connect the output to exactly one rail`);
    }
  }
  assert.deepEqual(neighbours(5, 4).sort((a, b) => a - b), [1, 4, 7, 13]);

  // The SR latch: set, reset and hold settle where they should; releasing S = R = 1 together never settles.
  assert.deepEqual(srSteps(1, 0, 0, 1).steps.at(-1), { q: 1, qn: 0 });
  assert.deepEqual(srSteps(0, 1, 1, 0).steps.at(-1), { q: 0, qn: 1 });
  assert.deepEqual(srSteps(0, 0, 1, 0), { steps: [], settles: true });
  assert.deepEqual(srSteps(1, 1, 1, 0).steps.at(-1), { q: 0, qn: 0 });
  assert.equal(srSteps(0, 0, 0, 0).settles, false);
  // Latch against flip-flop: the latch follows D while the clock is high, the flip-flop only at the rise.
  { let s = { clk: 0, latch: 0, ff: 0 };
    s = latchFfTick(s, 1, 1); assert.deepEqual([s.latch, s.ff], [1, 1]);
    s = latchFfTick(s, 1, 0); assert.deepEqual([s.latch, s.ff], [0, 1]);
    s = latchFfTick(s, 0, 1); assert.deepEqual([s.latch, s.ff], [0, 1]);
    s = latchFfTick(s, 1, 0); assert.deepEqual([s.latch, s.ff], [0, 0]); }
  // Shift register.
  assert.deepEqual(shiftStep([1, 0, 1, 1], 0, "right"), { bits: [0, 1, 0, 1], out: 1 });
  assert.deepEqual(shiftStep([1, 0, 1, 1], 0, "left"), { bits: [0, 1, 1, 0], out: 1 });
  // Ripple counters end up at v + 1, passing through one wrong value per extra stage.
  for (let v = 0; v < 16; v++) {
    const st = rippleSteps(v, 4), trailing = (v ^ (v + 1)).toString(2).length;
    assert.equal(st.at(-1), (v + 1) % 16); assert.equal(st.length, Math.min(trailing, 4));
  }
  assert.deepEqual(rippleSteps(7, 4), [6, 4, 0, 8]);
  // Ring and Johnson periods.
  { const period = (next: (b: number[]) => number[], start: number[]) => { let b = next(start), n = 1; while (b.join() !== start.join()) { b = next(b); n++; } return n; };
    assert.equal(period(ringNext, [1, 0, 0, 0]), 4); assert.equal(period(johnsonNext, [0, 0, 0, 0]), 8); assert.equal(period(johnsonNext, [0, 0, 0, 0, 0]), 10); }
  // The detectors match a brute-force search for 101 on every input of 12 bits, and agree with each other.
  for (let word = 0; word < 4096; word++) {
    let moore = 0, mealy = 0, last3 = 0;
    for (let i = 0; i < 12; i++) {
      const x = (word >> i) & 1, seen = i >= 2 && ((last3 << 1) | x) === 0b101;
      const mo = mealyOut(mealy, x);
      moore = MOORE_101[moore].next[x]; mealy = MEALY_101[mealy].next[x];
      assert.equal(MOORE_101[moore].out, seen ? 1 : 0, "Moore detector"); assert.equal(mo, seen ? 1 : 0, "Mealy detector");
      last3 = ((last3 << 1) | x) & 3;
    }
  }
  // State minimization ends at the 4 classes the chapter claims, and they really are equivalent.
  { const rounds = partitionSteps(REDUCIBLE), end = rounds.at(-1)!;
    assert.equal(new Set(end).size, 4);
    assert.equal(end[1], end[2]); assert.equal(end[3], end[4]); assert.equal(end[5], end[6]); assert.notEqual(end[0], end[1]);
    const run = (from: number, word: number, len: number) => { let s = from, out = ""; for (let i = 0; i < len; i++) { s = REDUCIBLE[s].next[(word >> i) & 1]; out += REDUCIBLE[s].out; } return out; };
    for (let a = 0; a < 7; a++) for (let b = 0; b < 7; b++) for (let w = 0; w < 256; w++) if (end[a] === end[b]) assert.equal(run(a, w, 8), run(b, w, 8), "merged states behave the same"); }

  // The inverter: output falls as input rises, symmetric, near the rails at each end; both on only mid-swing.
  for (let v = 0; v < 5; v += 0.1) assert.ok(inverterOut(v) >= inverterOut(v + 0.1));
  assert.ok(inverterOut(0) > 4.9 && inverterOut(5) < 0.1);
  assert.ok(Math.abs(inverterOut(2.5) - 2.5) < 1e-9);
  assert.deepEqual(inverterState(0), { nmos: false, pmos: true });
  assert.deepEqual(inverterState(5), { nmos: true, pmos: false });
  assert.deepEqual(inverterState(2.5), { nmos: true, pmos: true });
  // Loading: the closed form matches the drawn wave, more load is slower, and voltage counts twice.
  for (const [n, mhz] of [[1, 5], [10, 20], [30, 50]] as const) {
    const m = loadModel(n, mhz, 5), wave = rcWave(m.halfPeriod, m.tau, 400);
    assert.ok(Math.abs(Math.max(...wave) - m.high) < 0.01, "the wave peaks at the stated swing");
    assert.ok(Math.abs(Math.min(...wave) - m.low) < 0.01, "and troughs at the stated low");
  }
  assert.ok(loadModel(20, 5, 5).delay > loadModel(2, 5, 5).delay);
  assert.ok(loadModel(2, 2, 5).ok, "an easy case works"); assert.ok(!loadModel(30, 50, 5).ok, "too fast fails");
  assert.ok(Math.abs(loadModel(2, 5, 5).milliwatts / loadModel(2, 5, 1.8).milliwatts - (5 / 1.8) ** 2) < 1e-9);
  // Comparing: the verdict matches the numbers and stops at the first difference.
  for (let a = 0; a < 16; a++) for (let b = 0; b < 16; b++) {
    const st = compareSteps(a, b, 4), last = st[st.length - 1];
    assert.equal(last.verdict, a === b ? "same" : a > b ? "greater" : "less");
    assert.ok(st.slice(0, -1).every((x) => x.verdict === "same"));
  }
  // Multiplying.
  for (let a = 0; a < 16; a++) for (let b = 0; b < 16; b++) assert.equal(shiftAddSteps(a, b, 4).at(-1)!.total, a * b);
  for (let m = -8; m < 8; m++) for (let q = -8; q < 8; q++) assert.equal(boothSteps(m, q, 4).product, m * q + 0, `Booth ${m} × ${q}`);   // + 0: JavaScript's -8 × 0 is -0

  const ones = [0, 1, 2, 5, 6, 7, 8, 9, 10, 14], { steps } = qmSteps(ones, []), last = steps[steps.length - 1];
  const keyed = (ts: Implicant[]) => ts.map((t) => `${t.value},${t.mask}`).sort();
  assert.ok(last.kind === "done");
  if (last.kind === "done") assert.deepEqual(keyed(last.primes), keyed(primeImplicants(ones, [])));
  for (const st of steps) if (st.kind === "merge") {
    assert.equal(st.result.mask & st.result.value, 0);
    assert.equal(st.a.value | st.result.mask, st.b.value | st.result.mask, "merged terms agree outside the new dash");
  }
}

// ── The chapter list that client pages use ────────────────────────────────────
assert.deepEqual(
  ACADEMY_TOPIC_META,
  ACADEMY_TOPICS.map(({ slug, title, summary, icon, difficulty, order, estimatedMinutes }) => ({ slug, title, summary, icon, difficulty, order, estimatedMinutes })),
  "lib/academy-meta.ts is out of step with the chapters",
);

// Chapters are heavy: no client code may import them directly.
function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== "node_modules") walk(f, out); }
    else if (/\.tsx?$/.test(e.name)) out.push(f);
  }
  return out;
}
for (const f of ["app", "components", "hooks"].flatMap((d) => (fs.existsSync(path.join(ROOT, d)) ? walk(path.join(ROOT, d)) : []))) {
  const src = fs.readFileSync(f, "utf8");
  if (/^\s*["']use client["']/.test(src)) assert.ok(!src.includes("academy-content"), `${path.relative(ROOT, f)} is client code importing lib/academy-content`);
}

console.log(`academy: ${ACADEMY_TOPICS.length} chapters OK (${circuits} circuits, ${kmaps} K-maps, ${practice} practice questions, ${anims.size} animations tested)`);
