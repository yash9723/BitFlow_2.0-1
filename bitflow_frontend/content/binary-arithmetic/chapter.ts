import { draw, p } from "@/lib/academy/draw";
import type { AcademyTopic } from "@/lib/academy-types";

const chapter: AcademyTopic = {
  slug: "binary-arithmetic",
  title: "Binary Arithmetic and Signed Numbers",
  summary: "Adding, subtracting and multiplying in binary, two's complement, and how to spot overflow.",
  icon: "±",
  difficulty: "foundations",
  order: 3,
  estimatedMinutes: 35,
  prerequisites: ["number-systems"],
  sections: [
    {
      id: "add",
      heading: "Adding in binary",
      blocks: [
        p("Binary addition works just like the column addition you learned at school, with fewer facts to remember. When a column reaches two, write 0 and carry 1 into the next column."),
        { kind: "table", headers: ["Column adds up to", "Write", "Carry"], rows: [["0", "0", "0"], ["1", "1", "0"], ["2 (1 + 1)", "0", "1"], ["3 (1 + 1 + carry)", "1", "1"]] },
        { kind: "anim", id: "column-add" },
        { kind: "example", title: "11 + 6", problem: "Add 1011 and 0110.", steps: ["Rightmost column: 1 + 0 = 1, carry 0.", "Next: 1 + 1 = 2, write 0, carry 1.", "Next: 0 + 1 + 1 = 2, write 0, carry 1.", "Next: 1 + 0 + 1 = 2, write 0, carry 1.", "The last carry becomes a new leftmost digit."], answer: "**10001**, which is 17." },
        p("Four bits can only hold up to 15, so that sum needed a fifth bit. If the hardware has only four bits, it keeps 0001 and raises its **carry out**. For unsigned numbers, a carry out of the top bit means the result didn't fit. This is called **overflow**."),
      ],
    },
    {
      id: "sub-mul",
      heading: "Subtracting and multiplying",
      blocks: [
        p("Subtraction by hand works by borrowing: when a column would go below zero, borrow from the next column, which adds two here. For example, 1010 − 0011 = 0111, or 10 − 3 = 7. Later in this chapter you'll see that hardware avoids borrowing altogether."),
        p("Multiplication is easier than in decimal because each digit is 0 or 1. Every 1 in the multiplier adds a shifted copy of the top number, and every 0 adds nothing. This is called **shift and add**."),
        { kind: "example", title: "13 × 5", problem: "Multiply 1101 by 101.", steps: ["The rightmost multiplier bit is 1: copy 1101.", "The middle bit is 0: add nothing.", "The left bit is 1: copy 1101 shifted two places, giving 110100.", "Add them: 1101 + 110100 = 1000001."], answer: "**1000001**, which is 65." },
        { kind: "callout", tone: "tip", text: "Shifting left by one place multiplies by 2, and shifting right by one place divides by 2 and drops the remainder. Hardware does this with wires, at no cost, so designers multiply by 2, 4 or 8 this way." },
      ],
    },
    {
      id: "signed",
      heading: "Negative numbers",
      blocks: [
        p("Hardware has no minus sign, only bits, so negative numbers need an agreed coding. There have been three main ones. Here is how each writes −5 in 4 bits."),
        { kind: "table", headers: ["Method", "How it makes a negative", "+5", "−5", "4-bit range"], rows: [["Sign-magnitude", "Top bit is the sign, the rest is the size", "0101", "1101", "−7 to +7"], ["1's complement", "Invert every bit", "0101", "1010", "−7 to +7"], ["2's complement", "Invert every bit, then add 1", "0101", "1011", "−8 to +7"]] },
        p("The first two have an awkward flaw: two different patterns mean zero (0000 and 1000 in sign-magnitude, 0000 and 1111 in 1's complement), and adding signed numbers needs special cases. **Two's complement** has one zero, and the plain binary adder works on it unchanged. Nearly every computer uses it."),
        p("The easiest way to read a two's complement number is to give the top bit a **negative weight**. In 4 bits the position values are −8, 4, 2, 1. So 1011 = −8 + 2 + 1 = −5."),
        { kind: "formula", text: "n-bit two's complement range: −2ⁿ⁻¹ to 2ⁿ⁻¹ − 1", note: "8 bits hold −128 to 127. There's one more negative value than positive, because 0 uses up one of the patterns with a 0 on top." },
        { kind: "example", title: "Negating a number", problem: "What is −104 in 8-bit two's complement?", steps: ["104 = 0110 1000.", "Invert every bit: 1001 0111.", "Add 1: 1001 1000.", "Check with weights: −128 + 16 + 8 = −104."], answer: "**1001 1000**" },
        { kind: "callout", tone: "tip", text: "A shortcut for negating: copy the bits from the right up to and including the first 1, then invert everything to its left. From 0110 1000, keep 1000 and invert 0110 to get 1001 1000." },
        p("To fit a number into more bits, copy its sign bit into the new positions. This is **sign extension**: 1011 and 1111 1011 are both −5, and 0101 and 0000 0101 are both +5."),
        { kind: "practice", question: "What decimal value is the 8-bit two's complement number 1111 1011?", options: ["−5", "−4", "251", "−123"], correctIndex: 0, explanation: "Invert to get 0000 0100, then add 1 to get 0000 0101, which is 5. So the value is **−5**. It would be 251 only if it were unsigned." },
      ],
    },
    {
      id: "sub-by-adding",
      heading: "Subtracting by adding",
      blocks: [
        p("This is why two's complement won: **A − B = A + (invert B) + 1**. One adder can do both jobs. An XOR gate on each B input passes the bit through when its control is 0 and inverts it when its control is 1, and the same control feeds the adder's carry in to provide the + 1."),
        { kind: "circuit", circuit: draw("add_sub", (d) => {
            const a = d.hex("a", 4, 40, 40), b = d.hex("b", 4, 40, 130), sub = d.sw("sub", 40, 230);
            d.part("merge", "copies", 200, 210, { w: 4 });
            [0, 1, 2, 3].forEach((i) => d.wire(sub, "copies", `b${i}`));
            d.part("xor", "flip", 340, 120, { w: 4 });
            d.wire(b, "flip", "a"); d.wire(d.pin("copies", "out"), "flip", "b");
            d.part("adder", "add", 500, 40, { w: 4 });
            d.wire(a, "add", "a"); d.wire(d.pin("flip", "y"), "add", "b"); d.wire(sub, "add", "cin");
            d.display("result", 4, 680, 30, d.pin("add", "sum"));
            d.led("carry", 680, 110, d.pin("add", "cout"));
          }), caption: "A 4-bit adder/subtractor. With **sub** off it adds. With **sub** on, each bit of b is inverted and the carry in is 1, so it subtracts. The displays are in hex.", tryThis: ["Set a = 9, b = 3 and turn **sub** on. The result is 6.", "Now try a = 3, b = 9. The result is A, or 1010, which is −6 in two's complement.", "Notice the carry light. When subtracting, a carry of 1 means there was **no** borrow."],
          checks: [{ set: { a: 9, b: 3, sub: 0 }, expect: { result: 12, carry: 0 } }, { set: { a: 9, b: 3, sub: 1 }, expect: { result: 6, carry: 1 } }, { set: { a: 3, b: 9, sub: 1 }, expect: { result: 10, carry: 0 } }] },
        { kind: "example", title: "6 − 3 in 4 bits", problem: "Compute 0110 − 0011 by adding.", steps: ["−3 is the two's complement of 0011, which is 1101.", "Add: 0110 + 1101 = 1 0011.", "Drop the carry out of the top bit, as the hardware does."], answer: "**0011**, which is 3." },
      ],
    },
    {
      id: "overflow",
      heading: "Signed overflow",
      blocks: [
        p("Overflow means the true answer doesn't fit in the bits you have. For signed numbers it isn't the same thing as a carry out, as the last example shows: it had a carry out and a correct answer."),
        p("The signs tell you. Adding a positive and a negative can never overflow, because the result lies between them. Adding two numbers of the **same sign** overflows if the result has the **opposite sign**."),
        { kind: "table", headers: ["Sum", "True answer", "Result in 4 bits", "Overflow?"], rows: [["0111 + 0001", "7 + 1 = 8", "1000 = −8", "Yes: two positives gave a negative"], ["1000 + 1111", "−8 + −1 = −9", "0111 = +7", "Yes: two negatives gave a positive"], ["0110 + 1101", "6 + −3 = 3", "0011 = +3", "No: the signs differ"]] },
        { kind: "anim", id: "number-wheel" },
        p("Hardware uses an equivalent rule that takes a single gate:"),
        { kind: "formula", text: "overflow = carry into the top bit ⊕ carry out of the top bit" },
        { kind: "practice", question: "In 8-bit two's complement, what does 100 + 50 give?", options: ["150, with no overflow", "−106, with overflow", "22, with overflow", "−150, with overflow"], correctIndex: 1, explanation: "150 is above the limit of 127, so it overflows. The bits 1001 0110 read as −128 + 22 = **−106**. A positive plus a positive gave a negative, which is the sign of overflow." },
        { kind: "callout", tone: "warning", text: "Adding unsigned and adding signed use the same bits and the same adder. What differs is how you read the result and which flag you check: **carry out** for unsigned, **overflow** for signed." },
      ],
    },
    {
      id: "gate-complements",
      heading: "Complements in any base",
      level: "gate",
      blocks: [
        p("Complements work in every base. For a number N with n digits in base r, the **r's complement** is rⁿ − N and the **(r−1)'s complement** is rⁿ − 1 − N. In base 2 those are the 2's and 1's complements, and in base 10 the 10's and 9's complements."),
        { kind: "example", title: "Decimal complements", problem: "Find the 9's and 10's complements of 2357.", steps: ["9's complement: subtract each digit from 9, which gives 7642.", "10's complement: add 1, which gives 7643."], answer: "**7642** and **7643**." },
        p("In 1's complement arithmetic, a carry out of the top bit has to be added back into the bottom. This is called **end-around carry**. To compute 6 − 3 in 4 bits, add 0110 + 1100 to get 1 0010, then add the carry back in to get 0011 = 3. Two's complement needs no such step, and that's one reason it won."),
        { kind: "practice", gate: true, question: "What is the decimal value of the 6-bit two's complement number 101100?", options: ["−20", "−12", "44", "−44"], correctIndex: 0, explanation: "With weights −32, 16, 8, 4, 2, 1: −32 + 8 + 4 = **−20**. As a check, invert to 010011 and add 1 to get 010100 = 20." },
        { kind: "practice", gate: true, question: "Which sum overflows in 5-bit two's complement?", options: ["01100 + 11000", "01100 + 00100", "01100 + 00011", "11000 + 11100"], correctIndex: 1, explanation: "The 5-bit range is −16 to 15. Those sums are 12 + (−8) = 4, 12 + 4 = **16**, 12 + 3 = 15, and (−8) + (−4) = −12. Only 16 falls outside the range." },
      ],
    },
  ],
  quiz: [
    { id: "q1", question: "What is 0111 + 0101 in binary?", options: ["1100", "1010", "1110", "1101"], correctIndex: 0, explanation: "7 + 5 = 12, which is 1100." },
    { id: "q2", question: "What does a column of 1 + 1 + carry 1 produce?", options: ["Write 0, carry 1", "Write 1, carry 1", "Write 1, carry 0", "Write 0, carry 0"], correctIndex: 1, explanation: "The column adds to 3, which is 11 in binary." },
    { id: "q3", question: "What is 101 × 11?", options: ["1000", "1111", "1110", "10101"], correctIndex: 1, explanation: "5 × 3 = 15, which is 1111." },
    { id: "q4", question: "What does shifting a binary number left by two places do?", options: ["Adds 2", "Multiplies by 2", "Multiplies by 4", "Divides by 4"], correctIndex: 2, explanation: "Each left shift doubles the value, so two shifts multiply by 4." },
    { id: "q5", question: "What is −6 in 4-bit two's complement?", options: ["1110", "1001", "1010", "0110"], correctIndex: 2, explanation: "6 is 0110. Invert to get 1001, then add 1 to get 1010." },
    { id: "q6", question: "What is the 8-bit two's complement range?", options: ["0 to 255", "−127 to 127", "−128 to 127", "−128 to 128"], correctIndex: 2, explanation: "−2⁷ to 2⁷ − 1." },
    { id: "q7", question: "Which coding has only one pattern for zero?", options: ["Sign-magnitude", "1's complement", "2's complement", "All three"], correctIndex: 2, explanation: "The other two have a positive and a negative zero." },
    { id: "q8", question: "What is 1010 sign-extended to 8 bits?", options: ["0000 1010", "1000 1010", "1111 1010", "1010 0000"], correctIndex: 2, explanation: "Copy the sign bit, 1, into the new positions." },
    { id: "q9", question: "Signed overflow can happen when you add…", options: ["Two numbers of the same sign", "Two numbers of opposite signs", "Any two numbers", "Only two negative numbers"], correctIndex: 0, explanation: "A positive and a negative sum lies between them, so it always fits." },
    { id: "q10", question: "In a 4-bit adder, the carry into the top bit is 1 and the carry out is 0. What happened?", options: ["Nothing unusual", "Signed overflow", "An unsigned carry", "The result is zero"], correctIndex: 1, explanation: "Overflow is the XOR of the two carries, and they differ." },
  ],
  flashcards: [
    { id: "f1", front: "Two's complement negate", back: "Invert every bit, then add 1." },
    { id: "f2", front: "Top bit's weight in n-bit two's complement", back: "−2ⁿ⁻¹" },
    { id: "f3", front: "n-bit two's complement range", back: "−2ⁿ⁻¹ to 2ⁿ⁻¹ − 1" },
    { id: "f4", front: "A − B in hardware", back: "A + (invert B) + 1, using one adder and XOR gates." },
    { id: "f5", front: "Sign extension", back: "Copy the sign bit into the new upper positions. The value stays the same." },
    { id: "f6", front: "Signed overflow rule", back: "Carry into the top bit XOR carry out of the top bit. Or: same-sign inputs gave an opposite-sign result." },
    { id: "f7", front: "Unsigned overflow", back: "A carry out of the top bit." },
    { id: "f8", front: "End-around carry", back: "In 1's complement, add the carry out back into the bottom bit." },
    { id: "f9", front: "Shift left, shift right", back: "Multiply by 2, divide by 2." },
  ],
  videos: [],
};

export default chapter;
