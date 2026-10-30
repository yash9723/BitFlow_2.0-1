import { draw, p } from "@/lib/academy/draw";
import type { AcademyTopic } from "@/lib/academy-types";

const chapter: AcademyTopic = {
  slug: "arithmetic-circuits",
  title: "Fast Arithmetic: Lookahead, BCD and Multipliers",
  summary: "Beat the ripple with carry lookahead, add in decimal, multiply in hardware, and see how Booth's algorithm handles signed numbers.",
  icon: "×",
  difficulty: "advanced",
  order: 12,
  estimatedMinutes: 45,
  prerequisites: ["adders-comparators"],
  sections: [
    {
      id: "lookahead",
      heading: "Carry lookahead",
      blocks: [
        p("A ripple adder is slow because each carry waits for the one before it. But every carry is just a function of the inputs, so why not compute them all directly? For each bit, define two signals."),
        { kind: "table", headers: ["Signal", "Equation", "Meaning"], rows: [["Generate", "gᵢ = aᵢbᵢ", "This column makes a carry, whatever comes in"], ["Propagate", "pᵢ = aᵢ ⊕ bᵢ", "This column passes on a carry coming in"]] },
        p("A column carries out if it generates, or if it propagates and a carry came in: cᵢ₊₁ = gᵢ + pᵢcᵢ. Now substitute each carry into the next until only g, p and c₀ remain."),
        { kind: "formula", text: "c₁ = g₀ + p₀c₀" },
        { kind: "formula", text: "c₂ = g₁ + p₁g₀ + p₁p₀c₀" },
        { kind: "formula", text: "c₃ = g₂ + p₂g₁ + p₂p₁g₀ + p₂p₁p₀c₀" },
        { kind: "formula", text: "c₄ = g₃ + p₃g₂ + p₃p₂g₁ + p₃p₂p₁g₀ + p₃p₂p₁p₀c₀" },
        p("Each line is two levels of logic, AND then OR, so every carry is ready after the same short time: 1 gate delay for g and p, plus 2 for the carry. Now race them."),
        { kind: "anim", id: "adder-race" },
        p("You can see the catch in the equations: the terms get longer, and c₄ already needs a 5-input AND. That's why adders use **4-bit groups**. Each group produces its own group generate and propagate, and a second lookahead unit works across groups, so the delay grows with the logarithm of the width, not the width."),
        { kind: "table", headers: ["Width", "Ripple: last carry", "Lookahead: slowest carry"], rows: [["4 bits", "8", "3"], ["16 bits", "32", "7"], ["64 bits", "128", "11"]], caption: "In gate delays, counting each AND or OR as one, whatever its width." },
        { kind: "practice", question: "For a column with a = 1, b = 0, what are g and p?", options: ["g = 1, p = 0", "g = 0, p = 1", "g = 1, p = 1", "g = 0, p = 0"], correctIndex: 1, explanation: "ab = 0 and a ⊕ b = 1, so **g = 0, p = 1**: it passes on any carry that arrives." },
        { kind: "practice", question: "With a 4-bit lookahead adder, what does a sum bit take, counting XOR as one gate delay?", options: ["2", "3", "4", "8"], correctIndex: 2, explanation: "1 for p and g, 2 for the carry, and 1 for sᵢ = pᵢ ⊕ cᵢ, making **4**." },
      ],
    },
    {
      id: "bcd",
      heading: "BCD adder",
      blocks: [
        p("Chapter 4 said a BCD digit sum above 9 needs 6 added. In hardware, use a normal 4-bit adder, detect the bad cases, and pass the result through a second adder that adds 0 or 6."),
        { kind: "formula", text: "correct = carry + s₃s₂ + s₃s₁", note: "Sum above 15 sets the carry. Sums from 10 to 15 have s₃ = 1 and either s₂ or s₁ = 1." },
        { kind: "circuit", circuit: draw("bcd_adder", (d) => {
            const a = d.hex("a", 4, 20, 20), b = d.hex("b", 4, 20, 110);
            d.part("adder", "add1", 170, 20, { w: 4 });
            d.wire(a, "add1", "a"); d.wire(b, "add1", "b");
            d.part("split", "s", 330, 170, { w: 4 });
            d.wire(d.pin("add1", "sum"), "s", "in");
            const t32 = d.gate("and", "s3s2", 450, 240, d.pin("s", "b3"), d.pin("s", "b2"));
            const t31 = d.gate("and", "s3s1", 450, 320, d.pin("s", "b3"), d.pin("s", "b1"));
            const fix = d.gate("or", "fix", 600, 270, d.pin("add1", "cout"), t32, t31);
            d.part("merge", "six", 740, 180, { w: 4 });
            d.part("const0", "zero", 600, 180);
            d.wire(d.pin("zero", "out"), "six", "b0"); d.wire(fix, "six", "b1"); d.wire(fix, "six", "b2"); d.wire(d.pin("zero", "out"), "six", "b3");
            d.part("adder", "add2", 860, 40, { w: 4 });
            d.wire(d.pin("add1", "sum"), "add2", "a"); d.wire(d.pin("six", "out"), "add2", "b");
            d.display("digit", 4, 1010, 50, d.pin("add2", "sum"));
            d.led("tens", 1010, 280, fix);
          }), caption: "One BCD digit of a BCD adder. **tens** is the carry into the next digit. Input only 0 to 9 on a and b.", tryThis: ["Set a = 7 and b = 5. The first adder gives 12, a bad digit, so 6 gets added: the display shows 2 with **tens** on, which reads 12.", "Set a = 9 and b = 9. The sum is 18, and the display shows 8 with **tens** on."],
          checks: [{ set: { a: 3, b: 4 }, expect: { digit: 7, tens: 0 } }, { set: { a: 7, b: 5 }, expect: { digit: 2, tens: 1 } }, { set: { a: 9, b: 9 }, expect: { digit: 8, tens: 1 } }, { set: { a: 5, b: 5 }, expect: { digit: 0, tens: 1 } }] },
        { kind: "practice", question: "What does a BCD adder output for 8 + 6?", options: ["digit 4, carry 1", "digit E, carry 0", "digit 14, carry 0", "digit 2, carry 1"], correctIndex: 0, explanation: "8 + 6 = 14 = 1110, which is above 9. Adding 6 gives 1 0100, so **digit 4, carry 1**." },
      ],
    },
    {
      id: "multiply",
      heading: "Multipliers",
      blocks: [
        p("Binary multiplication is shift and add. Each partial product is the top number ANDed with one multiplier bit, and the rest is addition. So you can choose: one adder and a clock cycle per bit, or a large block of gates and the answer at once."),
        { kind: "anim", id: "shift-add" },
        p("A **sequential multiplier** uses one adder and a shift register, taking n clock cycles for n bits. An **array multiplier** lays out all the ANDs and adders as a grid of pure logic: it's fast, with no clock, but large. An n × n array takes n² AND gates and n − 1 rows of adders."),
        { kind: "circuit", circuit: draw("array_multiplier_2x2", (d) => {
            const a = d.hex("a", 2, 20, 30), b = d.hex("b", 2, 20, 200);
            d.part("split", "as", 150, 30, { w: 2 }); d.part("split", "bs", 150, 200, { w: 2 });
            d.wire(a, "as", "in"); d.wire(b, "bs", "in");
            const [a0, a1, b0, b1] = [d.pin("as", "b0"), d.pin("as", "b1"), d.pin("bs", "b0"), d.pin("bs", "b1")];
            const p0 = d.gate("and", "a0b0", 300, 10, a0, b0);
            const a1b0 = d.gate("and", "a1b0", 300, 90, a1, b0), a0b1 = d.gate("and", "a0b1", 300, 170, a0, b1), a1b1 = d.gate("and", "a1b1", 300, 250, a1, b1);
            const p1 = d.gate("xor", "x1", 470, 110, a1b0, a0b1), c1 = d.gate("and", "c1", 470, 190, a1b0, a0b1);
            const p2 = d.gate("xor", "x2", 620, 210, c1, a1b1), p3 = d.gate("and", "c2", 620, 290, c1, a1b1);
            d.part("merge", "pp", 770, 120, { w: 4 });
            d.wire(p0, "pp", "b0"); d.wire(p1, "pp", "b1"); d.wire(p2, "pp", "b2"); d.wire(p3, "pp", "b3");
            d.display("product", 4, 880, 130, d.pin("pp", "out"));
          }), caption: "A 2 × 2 array multiplier: four ANDs make the partial products, and two half adders add them. Displays are in hex.", tryThis: ["Set a = 3 and b = 3. The product is 9.", "Press **Slow motion** and change an input, to see the outputs settle at different times."],
          checks: [{ set: { a: 3, b: 3 }, expect: { product: 9 } }, { set: { a: 2, b: 3 }, expect: { product: 6 } }, { set: { a: 1, b: 2 }, expect: { product: 2 } }, { set: { a: 0, b: 3 }, expect: { product: 0 } }] },
        { kind: "practice", question: "How many bits can the product of an 8-bit and a 6-bit unsigned number need?", options: ["8", "14", "16", "48"], correctIndex: 1, explanation: "n × m bits need up to n + m bits: **14**." },
      ],
    },
    {
      id: "alu",
      heading: "Putting it together: the ALU",
      blocks: [
        p("An **arithmetic logic unit** is an adder and some gates behind a MUX. An operation code selects which result reaches the output, and flags like zero and carry report what happened. It's the heart of a processor, and you now know every part inside it."),
        { kind: "circuit", circuit: draw("small_alu", (d) => {
            const a = d.hex("a", 4, 30, 20), b = d.hex("b", 4, 30, 100), op = d.hex("op", 3, 30, 190);
            d.part("alu", "unit", 240, 60, { w: 4 });
            d.wire(a, "unit", "a"); d.wire(b, "unit", "b"); d.wire(op, "unit", "op");
            d.display("y", 4, 430, 40, d.pin("unit", "y"));
            d.led("zero", 430, 120, d.pin("unit", "zero"));
            d.led("carry", 430, 190, d.pin("unit", "cout"));
          }), caption: "A 4-bit ALU. The operation codes are: 0 add, 1 subtract, 2 AND, 3 OR, 4 XOR, 5 set-if-less-than, 6 NOT a, 7 pass a.", tryThis: ["Set a = 5 and b = 5, then op = 1. The result is 0, and **zero** lights. That's how a processor checks equality.", "Step through op with a = 12 and b = 10, and check each result by hand."],
          checks: [{ set: { a: 5, b: 3, op: 0 }, expect: { y: 8 } }, { set: { a: 5, b: 5, op: 1 }, expect: { y: 0, zero: 1 } }, { set: { a: 12, b: 10, op: 2 }, expect: { y: 8 } }, { set: { a: 12, b: 10, op: 4 }, expect: { y: 6 } }] },
      ],
    },
    {
      id: "booth",
      heading: "Booth's algorithm",
      level: "gate",
      blocks: [
        p("Plain shift and add doesn't handle two's complement multipliers directly, and it does an addition for every 1. Booth's idea uses a simple fact: a run of 1s equals one subtraction and one addition. For example, 0111 1110 = 1000 0000 − 0000 0010."),
        { kind: "table", headers: ["Q₀ Q₋₁", "Meaning", "Action"], rows: [["0 0", "Inside a run of 0s", "Nothing"], ["1 1", "Inside a run of 1s", "Nothing"], ["1 0", "A run of 1s starts", "A = A − M"], ["0 1", "A run of 1s ends", "A = A + M"]], caption: "After each step, shift A, Q and Q₋₁ right together, copying A's sign bit." },
        { kind: "anim", id: "booth" },
        p("Long runs make Booth quick. But alternating bits, such as 0101 0101, are its worst case, because every pair triggers an operation. Hardware often uses **modified Booth**, which looks at three bits at a time and halves the number of partial products."),
        { kind: "practice", gate: true, question: "How many additions or subtractions does Booth's algorithm do for the 8-bit multiplier 0111 1110?", options: ["1", "2", "6", "7"], correctIndex: 1, explanation: "One subtract where the run of 1s starts and one add where it ends: **2**." },
        { kind: "practice", gate: true, question: "How many does it do for the 8-bit multiplier 0101 0101?", options: ["2", "4", "8", "16"], correctIndex: 2, explanation: "Every pair of neighbours differs, so all **8** steps do an operation." },
        { kind: "practice", gate: true, question: "What's the recoded form of 0110 under Booth?", options: ["+1 0 −1 0", "0 +1 +1 0", "+1 −1 0 0", "−1 +1 0 0"], correctIndex: 0, explanation: "0110 = 6 = 8 − 2, which is **+1 0 −1 0**." },
        p("To add many numbers at once, as a multiplier must, there's a neat trick: a **carry-save adder** doesn't propagate carries at all. It reduces three numbers to two, a sum word and a carry word, in a single full-adder delay. Stack these in a **Wallace tree**, and only the last two numbers need a real carry-propagate adder."),
        { kind: "practice", gate: true, question: "A 16-bit carry lookahead adder of 4-bit groups: what's the slowest carry, in gate delays, by this chapter's count?", options: ["3", "7", "16", "32"], correctIndex: 1, explanation: "Two levels of lookahead give **7**, against 32 for ripple." },
      ],
    },
  ],
  quiz: [
    { id: "q1", question: "What is carry generate for a column?", options: ["a + b", "ab", "a ⊕ b", "a'b'"], correctIndex: 1, explanation: "A column makes a carry on its own only if both bits are 1." },
    { id: "q2", question: "What is carry propagate for a column?", options: ["ab", "a'b'", "a ⊕ b", "a + b + c"], correctIndex: 2, explanation: "If exactly one bit is 1, a carry that arrives passes through." },
    { id: "q3", question: "Which equation is right?", options: ["cᵢ₊₁ = gᵢ + pᵢcᵢ", "cᵢ₊₁ = gᵢpᵢcᵢ", "cᵢ₊₁ = gᵢ ⊕ pᵢ", "cᵢ₊₁ = pᵢ + cᵢ"], correctIndex: 0, explanation: "Carry out if the column generates, or it propagates and a carry came in." },
    { id: "q4", question: "Why does lookahead use 4-bit groups?", options: ["Fan-in grows too large otherwise", "Adders only come in 4 bits", "To save the carry", "To add BCD"], correctIndex: 0, explanation: "Without groups, the AND gates need very many inputs." },
    { id: "q5", question: "How does lookahead's delay grow with width?", options: ["Linearly", "Logarithmically", "Exponentially", "It stays exactly fixed"], correctIndex: 1, explanation: "Each added level of groups covers four times the width." },
    { id: "q6", question: "When does a BCD adder add 6?", options: ["Always", "When the sum exceeds 9", "When a carry goes in", "When the sum is even"], correctIndex: 1, explanation: "It skips the six unused patterns." },
    { id: "q7", question: "What does an n × n array multiplier use?", options: ["n ANDs", "n² ANDs and n − 1 rows of adders", "One adder and a register", "2n MUXes"], correctIndex: 1, explanation: "Each pair of bits needs an AND, and the rows are then added." },
    { id: "q8", question: "What's a sequential multiplier's main trade-off?", options: ["Small but takes n cycles", "Large but instant", "Only works on odd numbers", "Needs no adder"], correctIndex: 0, explanation: "It reuses one adder across many clock cycles." },
    { id: "q9", question: "In Booth's algorithm, what does the pair Q₀ Q₋₁ = 1 0 mean?", options: ["Add M", "Subtract M", "Do nothing", "Stop"], correctIndex: 1, explanation: "A run of 1s begins, so subtract." },
    { id: "q10", question: "What does a carry-save adder do?", options: ["Reduces 3 numbers to 2 with no carry propagation", "Stores carries in memory", "Adds BCD", "Multiplies by 2"], correctIndex: 0, explanation: "It leaves the carries as a separate word to be added later." },
  ],
  flashcards: [
    { id: "f1", front: "Generate and propagate", back: "gᵢ = aᵢbᵢ, pᵢ = aᵢ ⊕ bᵢ" },
    { id: "f2", front: "Carry recurrence", back: "cᵢ₊₁ = gᵢ + pᵢcᵢ" },
    { id: "f3", front: "Sum, in lookahead", back: "sᵢ = pᵢ ⊕ cᵢ" },
    { id: "f4", front: "4-bit lookahead timing", back: "3 gate delays for carries, 4 for sums." },
    { id: "f5", front: "BCD correction condition", back: "carry + s₃s₂ + s₃s₁" },
    { id: "f6", front: "Product width", back: "n + m bits for n × m." },
    { id: "f7", front: "Array multiplier size", back: "n² ANDs, n − 1 rows of adders." },
    { id: "f8", front: "Booth pairs", back: "10 subtract, 01 add, 00 and 11 nothing." },
    { id: "f9", front: "Booth's worst case", back: "Alternating bits." },
    { id: "f10", front: "Carry-save adder", back: "Three numbers in, two out, one full-adder delay." },
  ],
  videos: [],
};

export default chapter;
