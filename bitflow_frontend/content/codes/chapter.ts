import { draw, p } from "@/lib/academy/draw";
import type { AcademyTopic } from "@/lib/academy-types";

const chapter: AcademyTopic = {
  slug: "codes",
  title: "Codes: BCD, Gray, ASCII, Parity and Hamming",
  summary: "The same bits can mean different things. Codes that suit displays, sensors, text and error checking.",
  icon: "⌗",
  difficulty: "core",
  order: 4,
  estimatedMinutes: 35,
  prerequisites: ["binary-arithmetic"],
  sections: [
    {
      id: "why-codes",
      heading: "Bits mean what we agree they mean",
      blocks: [
        p("The pattern 0100 0001 has no meaning of its own. It could be the number 65, the letter A, or two decimal digits. A **code** is an agreement about what patterns stand for. Plain binary is best for arithmetic, but other jobs suit other codes."),
      ],
    },
    {
      id: "bcd",
      heading: "BCD and Excess-3",
      blocks: [
        p("**Binary-coded decimal (BCD)** stores each decimal digit in its own 4 bits. It's handy wherever numbers go straight to a display, such as clocks, meters and calculators, because each digit can drive its own display without any conversion."),
        { kind: "table", headers: ["Decimal 59 as…", "Bits", "Size"], rows: [["BCD", "0101 1001", "8 bits"], ["Plain binary", "111011", "6 bits"]], caption: "BCD costs more bits. The patterns 1010 to 1111 are never used." },
        p("BCD arithmetic needs a correction. Adding 7 + 5 in binary gives 1100, which isn't a valid digit. If a digit goes above 9, add 6 to skip the six unused patterns: 1100 + 0110 = 1 0010, which reads as 1 and 2, or 12. Chapter 12 builds this as a circuit."),
        p("**Excess-3** is BCD with 3 added to each digit, so 59 becomes 1000 1100. Its useful property is that it's **self-complementing**: inverting all the bits gives the code for 9 minus that digit. For example, 2 is 0101 and inverting gives 1010, which is the code for 7. That makes decimal subtraction easier to build."),
        { kind: "table", headers: ["Digit", "BCD (8421)", "2421", "Excess-3"], rows: [["0", "0000", "0000", "0011"], ["1", "0001", "0001", "0100"], ["2", "0010", "0010", "0101"], ["3", "0011", "0011", "0110"], ["4", "0100", "0100", "0111"], ["5", "0101", "1011", "1000"], ["6", "0110", "1100", "1001"], ["7", "0111", "1101", "1010"], ["8", "1000", "1110", "1011"], ["9", "1001", "1111", "1100"]], caption: "8421 and 2421 are named after the weights of their bits. Excess-3 has no fixed weights. 2421 is also self-complementing." },
      ],
    },
    {
      id: "gray",
      heading: "Gray code",
      blocks: [
        p("In plain binary, going from 3 (011) to 4 (100) flips three bits at once. Real signals never switch at exactly the same moment, so for an instant a sensor could read anything, like 111 or 000. **Gray code** fixes this by making **only one bit change between neighbours**."),
        p("You can build it by reflecting. Take the list for n bits, write it again in reverse below, then put 0 in front of the top half and 1 in front of the bottom half."),
        { kind: "table", headers: ["Decimal", "Binary", "Gray"], rows: [["0", "000", "000"], ["1", "001", "001"], ["2", "010", "011"], ["3", "011", "010"], ["4", "100", "110"], ["5", "101", "111"], ["6", "110", "101"], ["7", "111", "100"]], caption: "Each Gray code differs from the one above it in one bit, and the last wraps around to the first with one bit too." },
        p("Converting uses XOR, which outputs 1 when its two inputs differ. The top bit stays the same in both directions."),
        { kind: "list", items: ["**Binary to Gray:** each Gray bit is the XOR of that binary bit and the one to its left. 1011 → 1110.", "**Gray to binary:** each binary bit is the XOR of that Gray bit and the binary bit you just found to its left. 1110 → 1011."] },
        { kind: "circuit", circuit: draw("bin_to_gray", (d) => {
            const bin = d.hex("bin", 4, 40, 150);
            d.part("split", "bit", 190, 130, { w: 4 });
            d.wire(bin, "bit", "in");
            const [b3, b2, b1, b0] = [3, 2, 1, 0].map((i) => d.pin("bit", `b${i}`));
            const g2 = d.gate("xor", "x2", 340, 90, b3, b2), g1 = d.gate("xor", "x1", 340, 190, b2, b1), g0 = d.gate("xor", "x0", 340, 290, b1, b0);
            d.part("merge", "code", 500, 130, { w: 4 });
            d.wire(g0, "code", "b0"); d.wire(g1, "code", "b1"); d.wire(g2, "code", "b2"); d.wire(b3, "code", "b3");
            d.display("gray", 4, 640, 150, d.pin("code", "out"));
          }), caption: "Binary to Gray with three XOR gates. Both displays are in hex.", tryThis: ["Set bin to B (1011). The output is E (1110), as in the rule above.", "Count up and write down the outputs in binary. Only one bit changes per step."],
          checks: [{ set: { bin: 11 }, expect: { gray: 14 } }, { set: { bin: 0 }, expect: { gray: 0 } }, { set: { bin: 15 }, expect: { gray: 8 } }] },
        { kind: "anim", id: "encoder-disc" },
        p("You'll meet Gray code again in rotary position sensors, in FIFO pointers that cross between clocks, and in **K-maps**, whose rows and columns follow Gray order so that neighbouring cells differ by one variable. That's what lets you spot simplifications at a glance. Here's a preview of Chapter 7:"),
        { kind: "kmap", names: ["a", "b", "c"], cells: [0, 0, 0, 1, 0, 1, 1, 1], output: "maj", caption: "The majority function: the output is 1 when at least two inputs are 1. The columns run 00, 01, 11, 10, so neighbours differ in one bit, and each loop is one simple term.", expect: "bc + ac + ab" },
      ],
    },
    {
      id: "ascii",
      heading: "ASCII: bits as text",
      blocks: [
        p("**ASCII** gives each English letter, digit and symbol a 7-bit code. Unicode's UTF-8 encoding, used across the web today, keeps ASCII unchanged as its first 128 codes."),
        { kind: "table", headers: ["Character", "Decimal", "Hex", "Binary"], rows: [["A", "65", "0x41", "100 0001"], ["a", "97", "0x61", "110 0001"], ["0", "48", "0x30", "011 0000"]] },
        p("The codes were arranged with care. Upper and lower case differ in one bit (0x20), so flipping that bit changes case. A digit character's value is its code minus 48, so the character '7' is 55 and 55 − 48 = 7."),
        { kind: "callout", tone: "warning", text: "A keypad or serial port sending the character 7 sends 55, not 7. Forgetting to subtract 48 is one of the most common bugs in serial projects." },
      ],
    },
    {
      id: "parity",
      heading: "Parity: spotting an error",
      blocks: [
        p("Bits get flipped by noise on long wires and by radiation in memories. The simplest check adds one **parity bit**, chosen so that the total count of 1s is always even (**even parity**) or always odd (**odd parity**). The receiver counts the 1s, and a wrong count means something flipped."),
        p("The parity bit is just the XOR of the data bits, since XOR outputs 1 when the number of 1s at its inputs is odd."),
        { kind: "circuit", circuit: draw("even_parity", (d) => {
            const [a, b, c, e] = ["d3", "d2", "d1", "d0"].map((n, i) => d.sw(n, 40, 30 + i * 80));
            d.led("parity", 500, 130, d.gate("xor", "x3", 340, 130, d.gate("xor", "x2", 200, 90, a, b), d.gate("xor", "x1", 200, 200, c, e)));
          }), caption: "An even parity generator for 4 data bits. The light turns on when the data has an odd number of 1s, making the total even.", tryThis: ["Set the data to 1011. It has three 1s, so the parity bit is 1.", "Flip any one switch. The parity bit always changes, which is how one flipped bit gets noticed."],
          checks: [{ set: { d3: 1, d2: 0, d1: 1, d0: 1 }, expect: { parity: 1 } }, { set: { d3: 1, d2: 1, d1: 0, d0: 0 }, expect: { parity: 0 } }] },
        { kind: "callout", tone: "note", text: "Parity catches any odd number of flipped bits, but it misses an even number, because two flips leave the count even. It also can't tell you which bit is wrong." },
        { kind: "link", href: "/studio/challenges/even-parity", label: "Challenge: even parity bit", text: "Build a parity generator yourself in the circuit editor, within a gate budget, and earn XP." },
      ],
    },
    {
      id: "hamming",
      heading: "Hamming code: fixing an error",
      blocks: [
        p("Richard Hamming's idea was to use several parity bits, each checking a different group of positions, so that the pattern of failed checks spells out **where** the error is. Parity bits sit at positions that are powers of 2: 1, 2, 4, and so on. Each one covers every position whose number has that bit set."),
        { kind: "table", headers: ["Parity bit", "Covers positions", "Why"], rows: [["p1", "1, 3, 5, 7", "Numbers with bit 0 set"], ["p2", "2, 3, 6, 7", "Numbers with bit 1 set"], ["p4", "4, 5, 6, 7", "Numbers with bit 2 set"]] },
        { kind: "example", title: "Encode 1011 with Hamming(7,4)", problem: "Protect the data bits d1 d2 d3 d4 = 1 0 1 1, which go in positions 3, 5, 6 and 7.", steps: ["p1 makes positions 1, 3, 5, 7 even: 1 + 0 + 1 is two 1s, so p1 = 0.", "p2 makes positions 2, 3, 6, 7 even: 1 + 1 + 1 is three 1s, so p2 = 1.", "p4 makes positions 4, 5, 6, 7 even: 0 + 1 + 1 is two 1s, so p4 = 0.", "Write positions 1 to 7 in order: p1 p2 d1 p4 d2 d3 d4."], answer: "**0110011**" },
        p("To check a received word, recompute all three parities. Each result, called c4, c2 and c1, is 0 if its group is still even. Read together as a binary number, **c4c2c1 is the position of the wrong bit**, and 000 means no single-bit error."),
        { kind: "circuit", circuit: draw("hamming_check", (d) => {
            const bits = [["p1", 1], ["p2", 2], ["d1", 3], ["p4", 4], ["d2", 5], ["d3", 6], ["d4", 7]] as const;
            const at = Object.fromEntries(bits.map(([n, pos], i) => [pos, d.sw(n, 40, 10 + i * 60)]));
            const c1 = d.gate("xor", "c1", 400, 20, at[1], at[3], at[5], at[7]);
            const c2 = d.gate("xor", "c2", 400, 170, at[2], at[3], at[6], at[7]);
            const c4 = d.gate("xor", "c4", 400, 320, at[4], at[5], at[6], at[7]);
            d.part("merge", "syn", 560, 170, { w: 3 });
            d.wire(c1, "syn", "b0"); d.wire(c2, "syn", "b1"); d.wire(c4, "syn", "b2");
            d.display("wrong_bit", 3, 680, 180, d.pin("syn", "out"));
          }), caption: "A Hamming(7,4) checker. The switches are the received bits and the display gives the position of the wrong one, or 0 if the word is fine.", tryThis: ["Enter the codeword from above: p1=0, p2=1, d1=1, p4=0, d2=0, d3=1, d4=1. The display shows 0.", "Now flip **d2**, which is position 5. The display shows 5.", "Flip it back, then flip any other switch. The display always names the switch you flipped."],
          checks: [{ set: { p1: 0, p2: 1, d1: 1, p4: 0, d2: 0, d3: 1, d4: 1 }, expect: { wrong_bit: 0 } }, { set: { p1: 0, p2: 1, d1: 1, p4: 0, d2: 1, d3: 1, d4: 1 }, expect: { wrong_bit: 5 } }, { set: { p1: 1, p2: 1, d1: 1, p4: 0, d2: 0, d3: 1, d4: 1 }, expect: { wrong_bit: 1 } }] },
        { kind: "example", title: "Finding an error", problem: "You sent 0110011 and received 0110111. Which bit is wrong?", steps: ["c1 checks positions 1, 3, 5, 7: 0, 1, 1, 1 has three 1s, so c1 = 1.", "c2 checks positions 2, 3, 6, 7: 1, 1, 1, 1 has four 1s, so c2 = 0.", "c4 checks positions 4, 5, 6, 7: 0, 1, 1, 1 has three 1s, so c4 = 1.", "c4c2c1 = 101, which is 5."], answer: "**Position 5** is wrong. Flip it to get back 0110011." },
        p("How many parity bits do you need? With m data bits and p parity bits, the checks must be able to name each of the m + p positions, plus \"no error\":"),
        { kind: "formula", text: "2ᵖ ≥ m + p + 1", note: "For m = 4, p = 3 works because 8 ≥ 8. For m = 8 you need p = 4 because 16 ≥ 13, while p = 3 gives only 8." },
      ],
    },
    {
      id: "gate-distance",
      heading: "Hamming distance",
      level: "gate",
      blocks: [
        p("The **Hamming distance** between two words is the number of positions where they differ. The distance of a code, d, is the smallest distance between any two of its valid codewords. It sets what the code can do:"),
        { kind: "table", headers: ["To…", "You need"], rows: [["Detect up to s errors", "d ≥ s + 1"], ["Correct up to t errors", "d ≥ 2t + 1"]] },
        p("Simple parity has d = 2, so it detects 1 error and corrects none. Hamming(7,4) has d = 3, so it detects 2 errors or corrects 1. Memory chips with error correction commonly add one more overall parity bit, for d = 4: correct 1 error and also detect 2."),
        { kind: "practice", gate: true, question: "What is the minimum number of parity bits needed to correct a single-bit error in 11 data bits?", options: ["3", "4", "5", "11"], correctIndex: 1, explanation: "Test 2ᵖ ≥ 11 + p + 1. For p = 3, 8 ≥ 15 is false. For p = 4, 16 ≥ 16 is true, so **4**." },
        { kind: "practice", gate: true, question: "A code's codewords are 00000, 01011, 10101 and 11110. How many errors can it correct?", options: ["0", "1", "2", "3"], correctIndex: 1, explanation: "The smallest distance between any pair is 3 (for example, 00000 and 01011 differ in 3 places). d = 3 ≥ 2t + 1 gives **t = 1**." },
      ],
    },
  ],
  quiz: [
    { id: "q1", question: "What is decimal 47 in BCD?", options: ["0010 1111", "0100 0111", "0111 0100", "0101 1010"], correctIndex: 1, explanation: "4 is 0100 and 7 is 0111." },
    { id: "q2", question: "Which pattern is not valid BCD?", options: ["0000", "1001", "1010", "0111"], correctIndex: 2, explanation: "BCD digits stop at 9, or 1001, so 1010 is unused." },
    { id: "q3", question: "What is decimal 6 in Excess-3?", options: ["0110", "1001", "1000", "0011"], correctIndex: 1, explanation: "6 + 3 = 9, which is 1001." },
    { id: "q4", question: "What's special about neighbouring values in Gray code?", options: ["They differ in exactly one bit", "They are complements", "They are always even", "They differ by 2"], correctIndex: 0, explanation: "Only one bit changes per step, so no reading can catch several bits mid-change." },
    { id: "q5", question: "What is the Gray code of binary 0110?", options: ["0101", "0100", "0111", "1010"], correctIndex: 0, explanation: "Top bit 0, then 0⊕1 = 1, 1⊕1 = 0, 1⊕0 = 1, giving 0101." },
    { id: "q6", question: "What is the binary value of Gray code 1101?", options: ["1001", "1011", "1110", "1101"], correctIndex: 0, explanation: "b3 = 1, b2 = 1⊕1 = 0, b1 = 0⊕0 = 0, b0 = 0⊕1 = 1, giving 1001." },
    { id: "q7", question: "The ASCII code of 'A' is 65. What is the code of 'c'?", options: ["67", "97", "99", "100"], correctIndex: 2, explanation: "'C' is 65 + 2 = 67, and lower case adds 32, which gives 99." },
    { id: "q8", question: "What is the even parity bit for data 1101?", options: ["0", "1", "It depends on the clock", "2"], correctIndex: 1, explanation: "There are three 1s, an odd count, so the parity bit is 1 to make the total even." },
    { id: "q9", question: "Which errors does a single parity bit miss?", options: ["One flipped bit", "Three flipped bits", "Two flipped bits", "None"], correctIndex: 2, explanation: "Two flips leave the count of 1s even, so the check still passes." },
    { id: "q10", question: "In Hamming(7,4), the checks give c4c2c1 = 110. What does that mean?", options: ["No error", "Position 3 is wrong", "Position 6 is wrong", "Two bits are wrong"], correctIndex: 2, explanation: "110 in binary is 6, the position of the wrong bit." },
  ],
  flashcards: [
    { id: "f1", front: "BCD", back: "Each decimal digit in its own 4 bits. Patterns 1010 to 1111 are unused." },
    { id: "f2", front: "BCD correction", back: "If a digit's sum goes above 9, add 6." },
    { id: "f3", front: "Excess-3", back: "BCD plus 3 per digit. Self-complementing: inverting gives 9 minus the digit." },
    { id: "f4", front: "Gray code", back: "Only one bit changes between neighbouring values." },
    { id: "f5", front: "Binary to Gray", back: "gᵢ = bᵢ ⊕ bᵢ₊₁, and the top bit stays the same." },
    { id: "f6", front: "ASCII 'A', 'a', '0'", back: "65, 97, 48." },
    { id: "f7", front: "Parity bit", back: "The XOR of the data bits (even parity). Detects any odd number of flips." },
    { id: "f8", front: "Hamming parity positions", back: "Powers of 2: 1, 2, 4, 8…" },
    { id: "f9", front: "Parity bits needed", back: "Smallest p with 2ᵖ ≥ m + p + 1." },
    { id: "f10", front: "Code distance d", back: "Detects d − 1 errors, corrects ⌊(d − 1)/2⌋." },
  ],
  videos: [],
};

export default chapter;
