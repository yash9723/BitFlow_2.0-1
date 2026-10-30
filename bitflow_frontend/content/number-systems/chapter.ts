import { draw, p } from "@/lib/academy/draw";
import type { AcademyTopic } from "@/lib/academy-types";

const chapter: AcademyTopic = {
  slug: "number-systems",
  title: "Number Systems",
  summary: "Binary, octal and hexadecimal: reading them, converting between them, and how many bits a number needs.",
  icon: "0b",
  difficulty: "foundations",
  order: 2,
  estimatedMinutes: 30,
  prerequisites: ["what-is-digital"],
  interactive: "number-system-converter",
  sections: [
    {
      id: "positional",
      heading: "What a digit's position means",
      blocks: [
        p("You already use a positional number system. In 372, the 3 means three hundreds because of where it sits: 3×100 + 7×10 + 2×1. Each position is worth ten times the one to its right, because we count in **base 10**."),
        p("Nothing about this needs ten. In **base 2**, or **binary**, the digits are only 0 and 1, and each position is worth twice the one to its right: 1, 2, 4, 8, 16, 32 and so on. Binary suits hardware because each digit is one wire."),
        { kind: "formula", text: "(d₃d₂d₁d₀)ᵣ = d₃×r³ + d₂×r² + d₁×r¹ + d₀×r⁰", note: "r is the base, or radix. A subscript shows the base when it isn't obvious." },
        { kind: "example", title: "Binary to decimal", problem: "What is 101101₂ in decimal?", steps: ["Write the position values above the digits: 32, 16, 8, 4, 2, 1.", "Keep the values where the digit is 1: 32 + 8 + 4 + 1."], answer: "**45**" },
        { kind: "circuit", circuit: draw("show_bits", (d) => {
            const n = d.hex("n", 4, 40, 130);
            d.part("split", "bits", 210, 110, { w: 4 });
            d.wire(n, "bits", "in");
            [3, 2, 1, 0].forEach((b, i) => d.led(`b${b}`, 380, 30 + i * 70, d.pin("bits", `b${b}`)));
          }), caption: "Click the number on the left to count up (shift-click counts down). The lights show the same number in binary, with b3 worth 8 and b0 worth 1.", tryThis: ["Set the input to 13. Add the values of the lit bits: 8 + 4 + 1.", "Count from 0 to 7 and watch b0. It flips every step, b1 every two steps, b2 every four."],
          checks: [{ set: { n: 13 }, expect: { b3: 1, b2: 1, b1: 0, b0: 1 } }, { set: { n: 6 }, expect: { b3: 0, b2: 1, b1: 1, b0: 0 } }] },
      ],
    },
    {
      id: "to-binary",
      heading: "Decimal to binary",
      blocks: [
        p("To convert a whole number, **divide by 2 repeatedly** and keep the remainders. The first remainder is the rightmost bit."),
        { kind: "table", headers: ["Step", "Remainder"], rows: [["45 ÷ 2 = 22", "1 (rightmost)"], ["22 ÷ 2 = 11", "0"], ["11 ÷ 2 = 5", "1"], ["5 ÷ 2 = 2", "1"], ["2 ÷ 2 = 1", "0"], ["1 ÷ 2 = 0", "1 (leftmost)"]], caption: "Reading the remainders from the bottom up gives 101101, which matches the earlier example." },
        p("A fraction works the other way around: **multiply by 2 repeatedly** and keep the whole-number part each time. The first one you get is the bit right after the point."),
        { kind: "example", title: "A fraction in binary", problem: "Convert 0.625 to binary.", steps: ["0.625 × 2 = 1.25, so the first bit is 1. Carry on with 0.25.", "0.25 × 2 = 0.5, so the next bit is 0. Carry on with 0.5.", "0.5 × 2 = 1.0, so the next bit is 1. Nothing is left, so stop."], answer: "**0.101₂**, which is 1/2 + 1/8." },
        { kind: "callout", tone: "warning", text: "Many simple decimals never end in binary. 0.1 becomes 0.000110011… with the 0011 repeating forever. A machine has to cut it off somewhere, which is why 0.1 + 0.2 isn't exactly 0.3 on most computers." },
        { kind: "practice", question: "What is 13.25 in binary?", options: ["1101.01", "1101.1", "1011.01", "1101.001"], correctIndex: 0, explanation: "13 = 8 + 4 + 1 = 1101, and 0.25 = 1/4 = .01. Together: **1101.01**." },
      ],
    },
    {
      id: "hex-octal",
      heading: "Hexadecimal and octal",
      blocks: [
        p("Long strings of bits are hard to read and easy to miscopy. **Hexadecimal** (base 16) is a shorthand. It needs sixteen digit symbols, so it uses 0 to 9 and then A to F for ten to fifteen."),
        p("Because 16 = 2⁴, **each hex digit stands for exactly 4 bits**. Likewise, because 8 = 2³, each **octal** digit stands for exactly 3 bits. So you convert by grouping bits, starting from the point, with no arithmetic at all."),
        { kind: "table", headers: ["Hex", "Binary", "Hex", "Binary", "Hex", "Binary", "Hex", "Binary"], rows: [["0", "0000", "4", "0100", "8", "1000", "C", "1100"], ["1", "0001", "5", "0101", "9", "1001", "D", "1101"], ["2", "0010", "6", "0110", "A", "1010", "E", "1110"], ["3", "0011", "7", "0111", "B", "1011", "F", "1111"]] },
        { kind: "example", title: "Grouping bits", problem: "Write 1101 0110₂ in hex, and 110101₂ in octal.", steps: ["In fours: 1101 is D and 0110 is 6, so 1101 0110₂ = D6₁₆.", "As a check, D6₁₆ = 13×16 + 6 = 214.", "In threes: 110 is 6 and 101 is 5, so 110101₂ = 65₈."], answer: "**D6₁₆** and **65₈**." },
        { kind: "callout", tone: "tip", text: "Going from hex to octal? Go through binary. Write out the 4-bit groups, then regroup them in threes." },
        p("In Verilog and in datasheets you'll see prefixes that name the base: `8'hD6` and `0xD6` both mean hex D6, and `4'b1010` means binary 1010."),
        { kind: "link", href: "/studio/numbers", label: "Try the number tools", text: "Convert any value between bases, and see it as signed and unsigned." },
      ],
    },
    {
      id: "range",
      heading: "How big a number fits",
      blocks: [
        p("With n bits, the largest unsigned number is all ones, which is one less than the next power of 2. So n bits hold **0 to 2ⁿ − 1**."),
        { kind: "table", headers: ["Bits", "Largest value", "In hex"], rows: [["4", "15", "F"], ["8", "255", "FF"], ["10", "1023", "3FF"], ["16", "65,535", "FFFF"], ["32", "4,294,967,295", "FFFFFFFF"]] },
        { kind: "practice", question: "What is the fewest bits that can hold the value 1024?", options: ["9", "10", "11", "12"], correctIndex: 2, explanation: "10 bits stop at 1023, one short. 1024 = 2¹⁰ is a 1 followed by ten 0s, which is **11 bits**." },
      ],
    },
    {
      id: "gate-bases",
      heading: "Base problems in exams",
      level: "gate",
      blocks: [
        p("Exams like questions where the base itself is unknown. Expand both sides with the positional formula and solve the equation. Remember that every digit must be smaller than the base, which often rules out one of the roots."),
        { kind: "example", title: "Find the base", problem: "If (121)ᵣ = (144)₁₀, what is r?", steps: ["Expand the left side: 1×r² + 2×r + 1 = 144.", "That is a perfect square: (r + 1)² = 144.", "So r + 1 = 12 (a base can't be negative), and r = 11.", "All the digits 1, 2, 1 are below 11, so this base is allowed."], answer: "**r = 11**" },
        { kind: "practice", gate: true, question: "What is (3AF)₁₆ in octal?", options: ["(1657)₈", "(1567)₈", "(3517)₈", "(943)₈"], correctIndex: 0, explanation: "In binary, 3AF is 0011 1010 1111. Regrouped in threes that is 001 110 101 111, or **1657**. Both equal 943 in decimal, which is why D is a trap: 943 is the decimal value, written as if it were octal." },
        { kind: "practice", gate: true, question: "For which base r is (23)ᵣ + (14)ᵣ = (41)ᵣ?", options: ["5", "6", "7", "8"], correctIndex: 1, explanation: "The left side is (2r + 3) + (r + 4) = 3r + 7, and the right side is 4r + 1. So 3r + 7 = 4r + 1, which gives **r = 6**. The digits 1 to 4 are all allowed in base 6." },
      ],
    },
  ],
  quiz: [
    { id: "q1", question: "What is 11010₂ in decimal?", options: ["22", "24", "26", "30"], correctIndex: 2, explanation: "16 + 8 + 2 = 26." },
    { id: "q2", question: "What is 37 in binary?", options: ["100101", "100011", "110001", "101001"], correctIndex: 0, explanation: "32 + 4 + 1 = 37, which sets the bits worth 32, 4 and 1: 100101." },
    { id: "q3", question: "How many bits does one hex digit stand for?", options: ["2", "3", "4", "8"], correctIndex: 2, explanation: "16 = 2⁴, so one hex digit is exactly 4 bits." },
    { id: "q4", question: "What is 1011 1110₂ in hex?", options: ["BE", "B7", "AE", "EB"], correctIndex: 0, explanation: "1011 is B and 1110 is E." },
    { id: "q5", question: "What is 2F₁₆ in decimal?", options: ["32", "45", "47", "215"], correctIndex: 2, explanation: "2×16 + 15 = 47." },
    { id: "q6", question: "What is 0.75 in binary?", options: ["0.01", "0.11", "0.101", "0.75"], correctIndex: 1, explanation: "0.75 × 2 = 1.5 gives 1, then 0.5 × 2 = 1.0 gives 1, so 0.11, which is 1/2 + 1/4." },
    { id: "q7", question: "What is the largest unsigned value in 12 bits?", options: ["2047", "4095", "4096", "8191"], correctIndex: 1, explanation: "2¹² − 1 = 4095." },
    { id: "q8", question: "What is 57₈ in binary?", options: ["101111", "111101", "010111", "101011"], correctIndex: 0, explanation: "5 is 101 and 7 is 111, giving 101111." },
    { id: "q9", question: "What is (212)₃ in decimal?", options: ["21", "23", "25", "212"], correctIndex: 1, explanation: "2×9 + 1×3 + 2×1 = 23." },
    { id: "q10", question: "How many bits does the decimal value 1023 need?", options: ["9", "10", "11", "1023"], correctIndex: 1, explanation: "1023 = 2¹⁰ − 1, which is ten 1s." },
  ],
  flashcards: [
    { id: "f1", front: "Value of a number in base r", back: "Each digit times r to the power of its position, added together." },
    { id: "f2", front: "Decimal to binary, whole part", back: "Divide by 2 repeatedly. Remainders read bottom to top." },
    { id: "f3", front: "Decimal to binary, fraction", back: "Multiply by 2 repeatedly. Whole parts read top to bottom." },
    { id: "f4", front: "Bits per hex digit, per octal digit", back: "4 and 3." },
    { id: "f5", front: "Hex to octal", back: "Go through binary and regroup the bits in threes from the point." },
    { id: "f6", front: "Unsigned range of n bits", back: "0 to 2ⁿ − 1" },
    { id: "f7", front: "Hex digits A to F", back: "10, 11, 12, 13, 14, 15" },
    { id: "f8", front: "8'hD6", back: "An 8-bit value written in hex: 1101 0110, or 214." },
  ],
  videos: [
    { id: "v1", title: "Digital Electronics playlist", url: "https://youtube.com/playlist?list=PLBlnK6fEyqRjMH3mWf6kwqiTbT798eAOm&si=S4pKpxd5N_FIwpUy", channel: "Neso Academy" },
  ],
};

export default chapter;
