import { draw, p } from "@/lib/academy/draw";
import type { AcademyTopic } from "@/lib/academy-types";

const FULL_ADDER = draw("full_adder", (d) => {
  const a = d.sw("a", 30, 20), b = d.sw("b", 30, 100), c = d.sw("cin", 30, 220);
  const x = d.gate("xor", "x1", 190, 40, a, b);
  d.led("sum", 660, 40, d.gate("xor", "x2", 370, 30, x, c));
  const g = d.gate("and", "g", 190, 290, a, b), pc = d.gate("and", "pc", 370, 150, x, c);
  d.led("cout", 660, 220, d.gate("or", "o1", 520, 220, pc, g));
});

const chapter: AcademyTopic = {
  slug: "adders-comparators",
  title: "Adders, Subtractors and Comparators",
  summary: "Build arithmetic out of gates: half and full adders, a 4-bit adder whose carry you can watch ripple, subtraction, and magnitude comparison.",
  icon: "+",
  difficulty: "core",
  order: 10,
  estimatedMinutes: 35,
  prerequisites: ["binary-arithmetic", "gates"],
  sections: [
    {
      id: "half",
      heading: "The half adder",
      blocks: [
        p("Chapter 3 did binary addition by hand. Now build it. Start with the smallest job, adding two single bits. The answer needs two bits, a sum and a carry, so write the truth table for each and spot the gates."),
        { kind: "table", headers: ["a", "b", "carry", "sum"], rows: [["0", "0", "0", "0"], ["0", "1", "0", "1"], ["1", "0", "0", "1"], ["1", "1", "1", "0"]], caption: "The sum column is XOR, and the carry column is AND." },
        { kind: "circuit", circuit: draw("half_adder", (d) => {
            const a = d.sw("a", 30, 40), b = d.sw("b", 30, 170);
            d.led("sum", 420, 40, d.gate("xor", "x1", 240, 30, a, b));
            d.led("carry", 420, 160, d.gate("and", "c1", 240, 150, a, b));
          }), caption: "A half adder. It's called half because it can't accept a carry from a previous column.", tryThis: ["Set both inputs to 1. Is the output 10 in binary, the number 2?"],
          checks: [{ set: { a: 0, b: 0 }, expect: { sum: 0, carry: 0 } }, { set: { a: 1, b: 0 }, expect: { sum: 1, carry: 0 } }, { set: { a: 1, b: 1 }, expect: { sum: 0, carry: 1 } }] },
      ],
    },
    {
      id: "full",
      heading: "The full adder",
      blocks: [
        p("Every column except the rightmost also has a carry coming in, so it adds three bits. A **full adder** does this. Sum is 1 when an odd number of inputs are 1, and carry is 1 when at least two are."),
        { kind: "formula", text: "sum = a ⊕ b ⊕ cin     cout = ab + (a ⊕ b)·cin" },
        { kind: "circuit", circuit: FULL_ADDER, caption: "A full adder is two half adders and an OR gate. The first half adds a and b, and the second adds in the carry.", tryThis: ["Find the three input patterns where cout is 1 but sum is 0.", "Press **Slow motion** and flip **cin**. Notice how a change to cin takes a shorter path than a change to a."],
          checks: [{ set: { a: 0, b: 0, cin: 0 }, expect: { sum: 0, cout: 0 } }, { set: { a: 1, b: 0, cin: 0 }, expect: { sum: 1, cout: 0 } }, { set: { a: 1, b: 1, cin: 0 }, expect: { sum: 0, cout: 1 } }, { set: { a: 1, b: 0, cin: 1 }, expect: { sum: 0, cout: 1 } }, { set: { a: 1, b: 1, cin: 1 }, expect: { sum: 1, cout: 1 } }] },
        { kind: "practice", question: "A full adder has inputs 1, 0, 1. What are its outputs?", options: ["sum 0, carry 1", "sum 1, carry 0", "sum 1, carry 1", "sum 0, carry 0"], correctIndex: 0, explanation: "1 + 0 + 1 = 2, which is 10 in binary: **sum 0, carry 1**." },
      ],
    },
    {
      id: "ripple",
      heading: "Chaining them: ripple carry",
      blocks: [
        p("To add 4-bit numbers, use four full adders, one per column, and connect each carry out to the next carry in. Each column has to wait for the carry from the column before it. Nothing here is clocked: the answer just settles when the carry has rippled through."),
        { kind: "circuit", slow: true, circuit: draw("ripple_adder", (d) => {
            const fa = (i: number, y: number) => d.block(FULL_ADDER, `fa${i}`, 330, y);
            const a = d.hex("a", 4, 20, 40), b = d.hex("b", 4, 20, 170), cin = d.sw("cin", 20, 350);
            d.part("split", "as", 170, 10, { w: 4 }); d.part("split", "bs", 170, 150, { w: 4 });
            d.wire(a, "as", "in"); d.wire(b, "bs", "in");
            d.part("merge", "total", 560, 150, { w: 4 });
            let carry = cin;
            [0, 1, 2, 3].forEach((i) => {
              const u = fa(i, 10 + i * 110);
              d.wire(d.pin("as", `b${i}`), u, "a"); d.wire(d.pin("bs", `b${i}`), u, "b"); d.wire(carry, u, "cin");
              d.wire(d.pin(u, "sum"), "total", `b${i}`);
              carry = d.pin(u, "cout");
            });
            d.display("sum", 4, 680, 170, d.pin("total", "out"));
            d.led("carry", 680, 350, carry);
          }), caption: "Four full adders in a chain, already in slow motion. Displays are in hex.", tryThis: ["Set a to F and b to 0. Now flip **cin** on, and watch the carry travel through every adder in turn. That's the worst case.", "Set a to 3 and b to 5, and flip **cin**. Much less happens, so it settles sooner."],
          checks: [{ set: { a: 3, b: 5, cin: 0 }, expect: { sum: 8, carry: 0 } }, { set: { a: 15, b: 0, cin: 1 }, expect: { sum: 0, carry: 1 } }, { set: { a: 9, b: 9, cin: 1 }, expect: { sum: 3, carry: 1 } }] },
        p("So the carry sets the speed limit. If one full adder's carry takes t_c and its sum takes t_s, the worst case for an n-bit ripple adder is:"),
        { kind: "formula", text: "t = (n − 1) × t_c + t_s", note: "Chapter 12 shows how lookahead logic beats this." },
        { kind: "practice", question: "A full adder has a carry delay of 2 ns and a sum delay of 3 ns. What's the worst-case delay of an 8-bit ripple adder?", options: ["16 ns", "17 ns", "24 ns", "40 ns"], correctIndex: 1, explanation: "(8 − 1) × 2 + 3 = **17 ns**." },
        { kind: "link", href: "/studio/challenges/ripple-adder-4", label: "Challenge: 4-bit ripple-carry adder", text: "Wire one yourself in the circuit editor and earn XP." },
      ],
    },
    {
      id: "subtract",
      heading: "Subtractors",
      blocks: [
        p("You already know the trick from Chapter 3: A − B = A + B' + 1, so an adder and a set of XOR gates do the job. Still, it's worth knowing the subtractor's own equations, because exams ask for them."),
        { kind: "table", headers: ["Circuit", "Difference", "Borrow out"], rows: [["Half subtractor", "a ⊕ b", "a'b"], ["Full subtractor", "a ⊕ b ⊕ bin", "a'b + (a ⊕ b)'·bin"]] },
        { kind: "callout", tone: "tip", text: "The difference is the same XOR as the sum. Only the borrow differs: it fires when a is smaller, so a appears inverted." },
        { kind: "practice", question: "What are the half subtractor's outputs when a = 0 and b = 1?", options: ["difference 1, borrow 1", "difference 1, borrow 0", "difference 0, borrow 1", "difference 0, borrow 0"], correctIndex: 0, explanation: "0 − 1 needs a borrow, and leaves 1: **difference 1, borrow 1**." },
      ],
    },
    {
      id: "compare",
      heading: "Comparators",
      blocks: [
        p("A **magnitude comparator** tells you whether A is greater than, less than or equal to B. For single bits, the logic is short."),
        { kind: "circuit", circuit: draw("compare_1bit", (d) => {
            const a = d.sw("a", 30, 90), b = d.sw("b", 30, 240);
            const na = d.gate("not", "na", 170, 10, a), nb = d.gate("not", "nb", 170, 330, b);
            d.led("lt", 500, 30, d.gate("and", "l1", 330, 30, na, b));
            d.led("eq", 500, 150, d.gate("xnor", "e1", 330, 150, a, b));
            d.led("gt", 500, 280, d.gate("and", "g1", 330, 280, a, nb));
          }), caption: "A 1-bit comparator. Exactly one light is on at any time.",
          checks: [{ set: { a: 0, b: 0 }, expect: { lt: 0, eq: 1, gt: 0 } }, { set: { a: 0, b: 1 }, expect: { lt: 1, eq: 0, gt: 0 } }, { set: { a: 1, b: 0 }, expect: { lt: 0, eq: 0, gt: 1 } }, { set: { a: 1, b: 1 }, expect: { lt: 0, eq: 1, gt: 0 } }] },
        p("For wider numbers, you compare the way you'd compare two decimal numbers: from the left, and the first difference decides."),
        { kind: "anim", id: "compare-bits" },
        p("In gates, write eᵢ for \"bits i are equal\", which is an XNOR. Then for 4 bits:"),
        { kind: "formula", text: "A = B: e₃e₂e₁e₀" },
        { kind: "formula", text: "A > B: a₃b₃' + e₃a₂b₂' + e₃e₂a₁b₁' + e₃e₂e₁a₀b₀'" },
        { kind: "circuit", circuit: draw("compare_4bit", (d) => {
            const a = d.hex("a", 4, 30, 40), b = d.hex("b", 4, 30, 150);
            d.part("cmp", "c", 240, 70, { w: 4 });
            d.wire(a, "c", "a"); d.wire(b, "c", "b");
            d.led("eq", 430, 30, d.pin("c", "eq")); d.led("lt", 430, 100, d.pin("c", "lt")); d.led("gt", 430, 170, d.pin("c", "gt"));
          }), caption: "A 4-bit comparator as one part, like the classic 7485 chip. Click the numbers to count up.",
          checks: [{ set: { a: 11, b: 9 }, expect: { eq: 0, lt: 0, gt: 1 } }, { set: { a: 4, b: 9 }, expect: { eq: 0, lt: 1, gt: 0 } }, { set: { a: 7, b: 7 }, expect: { eq: 1, lt: 0, gt: 0 } }] },
        { kind: "link", href: "/studio/challenges/comparator-2bit", label: "Challenge: 2-bit comparator", text: "Build the gate version yourself and earn XP." },
      ],
    },
    {
      id: "gate-counts",
      heading: "Gate counts and tricks",
      level: "gate",
      blocks: [
        p("Exams often ask how to build one block from another. A full adder needs 2 half adders and 1 OR gate, or 9 NAND gates. A full subtractor is a full adder with one input inverted and the outputs adjusted, and it also takes 9 NANDs."),
        p("A comparison needs no special hardware either. Subtract: the carry out and the zero flag tell you everything. That's what a processor's compare instruction does."),
        { kind: "practice", gate: true, question: "How many 2-input NAND gates does a full adder need at minimum?", options: ["5", "7", "9", "11"], correctIndex: 2, explanation: "**9**: 4 for each XOR-based half adder sharing one term in the carry." },
        { kind: "practice", gate: true, question: "In a 4-bit ripple adder with inputs A = 1010 and B = 0101 and cin = 0, flipping cin to 1 makes how many sum bits change?", options: ["1", "2", "3", "All 4"], correctIndex: 3, explanation: "A + B = 1111, so every column propagates. Adding 1 gives 1 0000, and **all 4** sum bits flip, along with the carry out." },
        { kind: "practice", gate: true, question: "A 2-bit magnitude comparator's truth table has how many rows and how many outputs?", options: ["3 outputs, 16 rows", "2 outputs, 4 rows", "3 outputs, 4 rows", "4 outputs, 16 rows"], correctIndex: 0, explanation: "Two 2-bit inputs make 4 input bits, so 2⁴ = 16 rows, with **3 outputs** (eq, lt, gt)." },
      ],
    },
  ],
  quiz: [
    { id: "q1", question: "A half adder's sum output is which gate?", options: ["AND", "OR", "XOR", "NAND"], correctIndex: 2, explanation: "It's 1 when the two bits differ." },
    { id: "q2", question: "A half adder's carry output is which gate?", options: ["AND", "OR", "XOR", "NOR"], correctIndex: 0, explanation: "A carry happens only when both bits are 1." },
    { id: "q3", question: "How is a full adder different from a half adder?", options: ["It has a carry in", "It has no carry out", "It uses no gates", "It handles 4 bits"], correctIndex: 0, explanation: "It adds three bits: a, b and the carry in." },
    { id: "q4", question: "What does a full adder output for 1 + 1 + 1?", options: ["sum 0, carry 1", "sum 1, carry 1", "sum 1, carry 0", "sum 0, carry 0"], correctIndex: 1, explanation: "3 is 11 in binary." },
    { id: "q5", question: "A full adder can be built from…", options: ["2 half adders and an OR", "2 half adders and an AND", "3 half adders", "1 half adder and a NOT"], correctIndex: 0, explanation: "Either half adder can produce the carry, so they're ORed." },
    { id: "q6", question: "How many full adders does a 16-bit ripple adder with a carry in use?", options: ["8", "15", "16", "32"], correctIndex: 2, explanation: "One per bit." },
    { id: "q7", question: "What limits a ripple adder's speed?", options: ["The sum of the top bit", "The carry passing through every stage", "The clock", "The number of inputs"], correctIndex: 1, explanation: "In the worst case, the carry has to pass through all the stages." },
    { id: "q8", question: "What is a half subtractor's borrow output?", options: ["ab", "a'b", "ab'", "a ⊕ b"], correctIndex: 1, explanation: "A borrow is needed when a is 0 and b is 1." },
    { id: "q9", question: "To compare 1011 and 1001, which bit decides?", options: ["Bit 3", "Bit 2", "Bit 1", "Bit 0"], correctIndex: 2, explanation: "Bits 3 and 2 match. Bit 1 is the first difference." },
    { id: "q10", question: "A = B in a 2-bit comparator can be written…", options: ["(a₁ ⊕ b₁)(a₀ ⊕ b₀)", "(a₁ ⊕ b₁)'(a₀ ⊕ b₀)'", "a₁b₁ + a₀b₀", "a₁b₀ + a₀b₁"], correctIndex: 1, explanation: "Both pairs must match, so it's XNOR of each pair, ANDed." },
  ],
  flashcards: [
    { id: "f1", front: "Half adder", back: "sum = a ⊕ b, carry = ab" },
    { id: "f2", front: "Full adder sum", back: "a ⊕ b ⊕ cin" },
    { id: "f3", front: "Full adder carry", back: "ab + (a ⊕ b)cin, or ab + bc + ca" },
    { id: "f4", front: "Ripple adder worst case", back: "(n − 1)t_c + t_s" },
    { id: "f5", front: "Half subtractor", back: "difference = a ⊕ b, borrow = a'b" },
    { id: "f6", front: "Full subtractor borrow", back: "a'b + (a ⊕ b)'bin" },
    { id: "f7", front: "Bits equal", back: "XNOR" },
    { id: "f8", front: "A > B, 1 bit", back: "ab'" },
    { id: "f9", front: "Multi-bit comparison", back: "Start at the MSB. The first difference decides." },
    { id: "f10", front: "NAND gates in a full adder", back: "9" },
  ],
  videos: [],
};

export default chapter;
