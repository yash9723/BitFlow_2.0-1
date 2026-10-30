import { draw, p } from "@/lib/academy/draw";
import type { AcademyTopic } from "@/lib/academy-types";

const chapter: AcademyTopic = {
  slug: "gates",
  title: "Logic Gates",
  summary: "AND, OR, NOT, NAND, NOR, XOR: the building blocks of digital logic, what's inside them, and why they take time.",
  icon: "⊕",
  difficulty: "foundations",
  order: 5,
  estimatedMinutes: 35,
  prerequisites: ["what-is-digital"],
  interactive: "logic-gate-playground",
  sections: [
    {
      id: "gates",
      heading: "The seven gates",
      blocks: [
        p("A **gate** is a small circuit that takes one or more input bits and produces one output bit by a fixed rule. Every digital chip, however large, is built from these few rules."),
        { kind: "circuit", circuit: draw("seven_gates", (d) => {
            const a = d.sw("a", 30, 190), b = d.sw("b", 30, 330);
            const names: [Parameters<typeof d.gate>[0], string, string][] = [["not", "NOT", "not_a"], ["and", "AND", "a_and_b"], ["or", "OR", "a_or_b"], ["nand", "NAND", "a_nand_b"], ["nor", "NOR", "a_nor_b"], ["xor", "XOR", "a_xor_b"], ["xnor", "XNOR", "a_xnor_b"]];
            names.forEach(([kind, label, led], i) => {
              const y = 10 + i * 76;
              d.led(led, 500, y, kind === "not" ? d.gate(kind, label, 300, y, a) : d.gate(kind, label, 300, y, a, b));
            });
          }), caption: "All seven gates side by side, driven by the same two switches. Flip them and compare the lights.", tryThis: ["With a = 1 and b = 1, which lights are on?", "Find the two pairs of gates whose lights are always opposite."],
          checks: [
            { set: { a: 0, b: 0 }, expect: { not_a: 1, a_and_b: 0, a_or_b: 0, a_nand_b: 1, a_nor_b: 1, a_xor_b: 0, a_xnor_b: 1 } },
            { set: { a: 1, b: 0 }, expect: { not_a: 0, a_and_b: 0, a_or_b: 1, a_nand_b: 1, a_nor_b: 0, a_xor_b: 1, a_xnor_b: 0 } },
            { set: { a: 0, b: 1 }, expect: { not_a: 1, a_and_b: 0, a_or_b: 1, a_nand_b: 1, a_nor_b: 0, a_xor_b: 1, a_xnor_b: 0 } },
            { set: { a: 1, b: 1 }, expect: { not_a: 0, a_and_b: 1, a_or_b: 1, a_nand_b: 0, a_nor_b: 0, a_xor_b: 0, a_xnor_b: 1 } },
          ] },
        { kind: "table", headers: ["Gate", "Output is 1 when…", "Written", "Verilog"], rows: [
          ["NOT", "the input is 0", "a'", "`~a`"], ["AND", "**all** inputs are 1", "a·b", "`a & b`"], ["OR", "**any** input is 1", "a + b", "`a | b`"],
          ["NAND", "not all inputs are 1", "(a·b)'", "`~(a & b)`"], ["NOR", "no input is 1", "(a + b)'", "`~(a | b)`"],
          ["XOR", "an **odd** number of inputs are 1", "a ⊕ b", "`a ^ b`"], ["XNOR", "an **even** number of inputs are 1", "(a ⊕ b)'", "`~(a ^ b)`"],
        ] },
        { kind: "callout", tone: "tip", text: "In a gate symbol, a small circle (a **bubble**) means \"invert\". NAND is an AND with a bubble on its output, and NOR is an OR with one." },
        p("XOR deserves a second look, because you'll use it often. With two inputs it answers \"are these different?\", which makes it a comparator. It is also a **controlled inverter**: a ⊕ 0 = a and a ⊕ 1 = a'. That's the trick the adder/subtractor used in Chapter 3."),
      ],
    },
    {
      id: "inside",
      heading: "What's inside a gate",
      blocks: [
        p("Modern chips build gates from CMOS transistors, which come in two complementary types. A **PMOS** transistor conducts when its input is 0, and an **NMOS** transistor conducts when its input is 1. Each gate has a network of PMOS transistors that can connect the output up to the supply, and a mirror network of NMOS transistors that can connect it down to ground."),
        { kind: "anim", id: "cmos-gate" },
        p("Compare NAND and NOR above. NAND has its PMOS transistors in parallel and its NMOS in series. NOR has them the other way round. Series becomes parallel and vice versa, and you'll see the same swap again in De Morgan's theorem in the next chapter."),
        { kind: "callout", tone: "note", text: "This is why NAND and NOR are the natural gates in CMOS. An AND gate is really a NAND followed by a NOT, so it costs two more transistors and is slower. Chapter 9 looks at this in detail." },
      ],
    },
    {
      id: "universal",
      heading: "One gate to build them all",
      blocks: [
        p("NAND is **universal**: you can build any logic function using NAND gates alone. To prove it, it's enough to build NOT, AND and OR, since every truth table can be written with those three."),
        { kind: "table", headers: ["To get", "Using NAND", "Why it works"], rows: [["NOT a", "NAND(a, a)", "(a·a)' = a'"], ["a AND b", "NAND(NAND(a, b), NAND(a, b))", "NOT of a NAND is an AND"], ["a OR b", "NAND(NAND(a, a), NAND(b, b))", "(a'·b')' = a + b, by De Morgan"]] },
        { kind: "circuit", circuit: draw("nand_universal", (d) => {
            const a = d.sw("a", 30, 110), b = d.sw("b", 30, 300);
            d.led("not_a", 620, 10, d.gate("nand", "n1", 330, 10, a, a));
            const n2 = d.gate("nand", "n2", 220, 110, a, b);
            d.led("a_and_b", 620, 110, d.gate("nand", "n3", 400, 110, n2, n2));
            const n4 = d.gate("nand", "n4", 220, 220, a, a), n5 = d.gate("nand", "n5", 220, 320, b, b);
            d.led("a_or_b", 620, 270, d.gate("nand", "n6", 400, 270, n4, n5));
          }), caption: "NOT, AND and OR, each built only from NAND gates.", tryThis: ["Check all four input combinations against the truth tables above.", "Count the gates: 1 for NOT, 2 for AND, 3 for OR."],
          checks: [{ set: { a: 0, b: 0 }, expect: { not_a: 1, a_and_b: 0, a_or_b: 0 } }, { set: { a: 1, b: 0 }, expect: { not_a: 0, a_and_b: 0, a_or_b: 1 } }, { set: { a: 0, b: 1 }, expect: { not_a: 1, a_and_b: 0, a_or_b: 1 } }, { set: { a: 1, b: 1 }, expect: { not_a: 0, a_and_b: 1, a_or_b: 1 } }] },
        p("NOR is universal in the same way, with the roles swapped: NOT takes 1 gate, OR takes 2 and AND takes 3."),
        { kind: "link", href: "/studio/challenges/xor-from-nand", label: "Challenge: XOR from four NANDs", text: "It can be done in four. Try it in the circuit editor and earn XP." },
        { kind: "practice", question: "How many 2-input NAND gates does F = ab + cd need?", options: ["2", "3", "5", "6"], correctIndex: 1, explanation: "F = NAND(NAND(a, b), NAND(c, d)), because by De Morgan ((ab)'(cd)')' = ab + cd. That's **3**. An AND-OR form maps directly onto NAND-NAND." },
      ],
    },
    {
      id: "more-inputs",
      heading: "Gates with more inputs",
      blocks: [
        p("AND, OR, NAND and NOR extend naturally to more inputs: a 3-input AND is 1 only if all three inputs are. Since AND and OR are associative, you can also build wide gates by chaining narrow ones."),
        p("Be careful with XOR. A wide XOR doesn't mean \"exactly one input is 1\". It means **an odd number of inputs are 1**, so a ⊕ b ⊕ c is 1 when all three are 1. This is why XOR is the parity gate from Chapter 4."),
        { kind: "callout", tone: "warning", text: "NAND and NOR are not associative. NAND(NAND(a, b), c) is not a 3-input NAND of a, b and c, so you can't chain them the way you chain AND gates." },
        { kind: "practice", question: "A 4-input XOR gate has inputs 1, 1, 1, 0. What's its output?", options: ["0", "1", "It is undefined", "It depends on the order"], correctIndex: 1, explanation: "Three inputs are 1, which is odd, so the output is **1**. Order doesn't matter, because XOR is associative and commutative." },
      ],
    },
    {
      id: "delay",
      heading: "Gates take time",
      blocks: [
        p("So far a gate's output has changed the instant its input does. In a real gate, charge has to move to change a voltage, so the output changes a little later. That's the **propagation delay**. In a modern chip it's measured in picoseconds, but it still decides how fast a chip can run: the clock must wait for the slowest path of gates to finish."),
        p("Delay also creates surprises. This circuit ANDs a signal with its own inverse. On paper a·a' is always 0, so the output should never turn on."),
        { kind: "circuit", slow: true, circuit: draw("glitch", (d) => {
            const a = d.sw("a", 30, 130);
            const n = d.gate("not", "inv", 210, 60, a);
            d.led("y", 560, 110, d.gate("and", "both", 390, 110, a, n));
          }), caption: "Slow motion is already on. The NOT gate takes time to react, so for a moment both inputs of the AND are 1.", tryThis: ["Turn **a** on and watch **y**. It flashes for a moment, though the logic says it never should.", "Turn **a** off. There's no flash this time, because the AND's input from a goes low first."],
          checks: [{ set: { a: 0 }, expect: { y: 0 } }, { set: { a: 1 }, expect: { y: 0 } }, { set: { a: 0 }, expect: { y: 0 } }] },
        p("That short wrong pulse is a **glitch**. It's why every signal in a synchronous design is allowed to settle before a flip-flop samples it at the next clock edge. Chapter 17 explains how to find these hazards and remove them."),
        { kind: "link", href: "/studio/circuit", label: "Open the circuit editor's Timing panel", text: "Set each gate's delay yourself and see glitches drawn as waveforms." },
      ],
    },
    {
      id: "verilog",
      heading: "Gates in Verilog",
      blocks: [
        p("You can describe gates in Verilog in two ways. The first lists the gates, and the second writes the equation and leaves the choice of gates to the synthesis tool. Real projects nearly always use the second."),
        { kind: "code", text: "// Listing gates (structural)\nnand n1 (y1, a, b);\nxor  x1 (y2, a, b);\n\n// Writing the equation (dataflow)\nassign y1 = ~(a & b);\nassign y2 = a ^ b;" },
        { kind: "callout", tone: "note", text: "`&` and `|` work bit by bit on buses, while `&&` and `||` treat each whole value as true or false. Use the single-character forms for logic." },
      ],
    },
    {
      id: "gate-logic",
      heading: "Positive and negative logic",
      level: "gate",
      blocks: [
        p("Nothing forces high voltage to mean 1. In **positive logic** it does, and in **negative logic** high means 0. The same physical gate then performs a different function: swap 0 and 1 throughout the truth table of a positive-logic AND and you get a negative-logic OR. A positive NAND is a negative NOR, and a positive XOR is a negative XNOR."),
        { kind: "table", headers: ["Positive logic", "Same gate in negative logic"], rows: [["AND", "OR"], ["OR", "AND"], ["NAND", "NOR"], ["NOR", "NAND"], ["XOR", "XNOR"], ["NOT", "NOT"]] },
        { kind: "practice", gate: true, question: "Using only 2-input NAND gates, which of these needs the most gates?", options: ["NOT", "AND", "OR", "XOR"], correctIndex: 3, explanation: "NOT takes 1, AND takes 2, OR takes 3 and XOR takes **4**." },
        { kind: "practice", gate: true, question: "What does (a ⊕ b) ⊕ a simplify to?", options: ["a", "b", "0", "a ⊕ b"], correctIndex: 1, explanation: "XOR is associative and a ⊕ a = 0, so the result is 0 ⊕ b = **b**. This is the idea behind XOR swaps and simple ciphers." },
      ],
    },
  ],
  quiz: [
    { id: "q1", question: "An AND gate's output is 1 when…", options: ["any input is 1", "all inputs are 1", "no input is 1", "an odd number of inputs are 1"], correctIndex: 1, explanation: "AND requires every input to be 1." },
    { id: "q2", question: "What is the output of NOR with inputs 0 and 0?", options: ["0", "1", "Undefined", "It depends on delay"], correctIndex: 1, explanation: "OR gives 0, and the inversion makes it 1." },
    { id: "q3", question: "Which gate is 1 exactly when its two inputs differ?", options: ["AND", "OR", "XOR", "XNOR"], correctIndex: 2, explanation: "That's the definition of two-input XOR." },
    { id: "q4", question: "a ⊕ 1 equals…", options: ["a", "a'", "0", "1"], correctIndex: 1, explanation: "XOR with 1 inverts, which makes XOR a controlled inverter." },
    { id: "q5", question: "Which set is universal on its own?", options: ["AND only", "OR only", "NAND only", "XOR only"], correctIndex: 2, explanation: "NAND alone can build NOT, AND and OR. So can NOR." },
    { id: "q6", question: "How do you make NOT from a NAND gate?", options: ["Tie both inputs to the signal", "Tie one input to 0", "Use two NANDs in series", "You can't"], correctIndex: 0, explanation: "NAND(a, a) = a'." },
    { id: "q7", question: "When does a PMOS transistor conduct?", options: ["When its input is 1", "When its input is 0", "Always", "Only while switching"], correctIndex: 1, explanation: "PMOS conducts on 0, NMOS on 1." },
    { id: "q8", question: "In a CMOS NAND, how are the NMOS transistors connected?", options: ["In series", "In parallel", "One of each", "They aren't used"], correctIndex: 0, explanation: "Both must conduct to pull the output down, and that needs both inputs at 1." },
    { id: "q9", question: "A 3-input XOR with inputs 1, 1, 1 outputs…", options: ["0", "1", "3", "Undefined"], correctIndex: 1, explanation: "XOR is 1 for an odd number of 1s." },
    { id: "q10", question: "What causes a glitch?", options: ["A wrong truth table", "Different paths having different delays", "Too many inputs", "A slow clock"], correctIndex: 1, explanation: "When paths have different delays, gates briefly see a combination of old and new values." },
  ],
  flashcards: [
    { id: "f1", front: "AND, OR, XOR in one word each", back: "All, any, odd." },
    { id: "f2", front: "Bubble on a gate symbol", back: "Inversion." },
    { id: "f3", front: "XOR as a controlled inverter", back: "a ⊕ 0 = a, a ⊕ 1 = a'." },
    { id: "f4", front: "Universal gates", back: "NAND and NOR: each can build any function alone." },
    { id: "f5", front: "Gate counts from NAND", back: "NOT 1, AND 2, OR 3, NOR 4, XOR 4." },
    { id: "f6", front: "PMOS and NMOS", back: "PMOS conducts on 0, and pulls up. NMOS conducts on 1, and pulls down." },
    { id: "f7", front: "CMOS NAND layout", back: "PMOS in parallel, NMOS in series." },
    { id: "f8", front: "Propagation delay", back: "The time from an input change to the output change." },
    { id: "f9", front: "Glitch", back: "A short wrong pulse caused by paths with different delays." },
    { id: "f10", front: "Positive AND in negative logic", back: "OR." },
  ],
  videos: [
    { id: "v1", title: "Digital Electronics playlist", url: "https://youtube.com/playlist?list=PLBlnK6fEyqRjMH3mWf6kwqiTbT798eAOm&si=S4pKpxd5N_FIwpUy", channel: "Neso Academy" },
  ],
};

export default chapter;
