import { draw, p } from "@/lib/academy/draw";
import type { AcademyTopic } from "@/lib/academy-types";

const chapter: AcademyTopic = {
  slug: "combinational",
  title: "Multiplexers, Decoders and Encoders",
  summary: "The blocks that route and translate data: MUX and DEMUX, decoders, encoders, priority encoders and code converters.",
  icon: "Σ",
  difficulty: "core",
  order: 11,
  estimatedMinutes: 40,
  prerequisites: ["karnaugh-maps", "adders-comparators"],
  sections: [
    {
      id: "mux",
      heading: "Multiplexers",
      blocks: [
        p("A **multiplexer**, or MUX, is a data selector: many inputs, one output, and select lines that choose which input gets through. With n select lines it chooses among 2ⁿ inputs."),
        { kind: "anim", id: "mux-router" },
        { kind: "formula", text: "y = s₁'s₀'d₀ + s₁'s₀d₁ + s₁s₀'d₂ + s₁s₀d₃", note: "A 4:1 MUX: each term is an AND of one input with its select pattern." },
        { kind: "circuit", circuit: draw("mux_4to1", (d) => {
            const ins = [0, 1, 2, 3].map((i) => d.sw(`d${i}`, 30, 10 + i * 70));
            const s = d.hex("sel", 2, 30, 300);
            d.part("mux", "m", 260, 90, { n: 2 });
            ins.forEach((from, i) => d.wire(from, "m", `d${i}`));
            d.wire(s, "m", "s");
            d.led("y", 440, 130, d.pin("m", "y"));
          }), caption: "A 4:1 MUX as a single part. Click **sel** to step through the inputs.", tryThis: ["Turn on only **d2**. The light comes on only when sel is 2.", "Press **Slow motion** and change sel, to see the output follow the new input."],
          checks: [{ set: { d0: 0, d1: 0, d2: 1, d3: 0, sel: 2 }, expect: { y: 1 } }, { set: { d0: 0, d1: 0, d2: 1, d3: 0, sel: 1 }, expect: { y: 0 } }, { set: { d0: 1, d1: 0, d2: 0, d3: 0, sel: 0 }, expect: { y: 1 } }] },
        { kind: "link", href: "/studio/challenges/mux4-gates", label: "Challenge: 4:1 multiplexer from gates", text: "Turn the equation above into gates, and earn XP." },
      ],
    },
    {
      id: "mux-logic",
      heading: "A MUX can make any function",
      blocks: [
        p("A MUX is also a programmable logic block, since it's really a look-up table: put the truth table's outputs on the data inputs, and the select lines read them back. FPGAs are built on this idea (Chapter 18)."),
        p("A 4:1 MUX has two select lines but can handle a 3-variable function. Use two variables as selects. For each select pattern, what's left is a function of the third variable: 0, 1, c or c'."),
        { kind: "example", title: "F(a, b, c) = Σm(1, 2, 6, 7) with a 4:1 MUX", problem: "Use a and b as select lines. What goes on each data input?", steps: ["ab = 00 covers minterms 0 and 1. F is 0 then 1, so F = c.", "ab = 01 covers minterms 2 and 3. F is 1 then 0, so F = c'.", "ab = 10 covers minterms 4 and 5. F is 0 then 0, so F = 0.", "ab = 11 covers minterms 6 and 7. F is 1 then 1, so F = 1."], answer: "**d₀ = c, d₁ = c', d₂ = 0, d₃ = 1**" },
        { kind: "circuit", circuit: draw("mux_as_logic", (d) => {
            const a = d.sw("a", 20, 290), b = d.sw("b", 20, 370), c = d.sw("c", 20, 40);
            d.part("not", "nc", 170, 100); d.wire(c, "nc", "a");
            d.part("const0", "zero", 170, 170); d.part("const1", "one", 170, 230);
            d.part("merge", "sel", 170, 310, { w: 2 });
            d.wire(b, "sel", "b0"); d.wire(a, "sel", "b1");
            d.part("mux", "m", 340, 100, { n: 2 });
            d.wire(c, "m", "d0"); d.wire(d.pin("nc", "y"), "m", "d1"); d.wire(d.pin("zero", "out"), "m", "d2"); d.wire(d.pin("one", "out"), "m", "d3"); d.wire(d.pin("sel", "out"), "m", "s");
            d.led("F", 500, 130, d.pin("m", "y"));
          }), caption: "The worked example, wired up.", tryThis: ["Set a, b, c to 1, 1, 0, which is minterm 6: the light comes on.", "Set them to 1, 0, 1, which is minterm 5: it goes off."],
          checks: [0, 1, 2, 3, 4, 5, 6, 7].map((m) => ({ set: { a: (m >> 2) & 1, b: (m >> 1) & 1, c: m & 1 }, expect: { F: [1, 2, 6, 7].includes(m) ? 1 : 0 } })) },
        { kind: "practice", question: "How many 2:1 MUXes make an 8:1 MUX?", options: ["3", "4", "7", "8"], correctIndex: 2, explanation: "Arrange them as a tree: 4 + 2 + 1 = **7**. In general, an N:1 MUX takes N − 1 of them." },
      ],
    },
    {
      id: "decoders",
      heading: "Decoders and DEMUX",
      blocks: [
        p("A **decoder** does the opposite of an encoder: n input bits light up exactly one of 2ⁿ outputs. It's how a memory chip selects one row, and how a processor picks which unit an instruction uses."),
        { kind: "circuit", circuit: draw("decoder_2to4", (d) => {
            const s = d.hex("code", 2, 30, 120);
            d.part("decoder", "dec", 180, 110, { w: 2 });
            d.wire(s, "dec", "sel");
            d.part("split", "lines", 310, 90, { w: 4 });
            d.wire(d.pin("dec", "y"), "lines", "in");
            [3, 2, 1, 0].forEach((i, k) => d.led(`y${i}`, 450, 10 + k * 70, d.pin("lines", `b${i}`)));
          }), caption: "A 2:4 decoder. One light is on at a time.", tryThis: ["Click **code** to count from 0 to 3 and watch the light step along."],
          checks: [{ set: { code: 0 }, expect: { y0: 1, y1: 0, y2: 0, y3: 0 } }, { set: { code: 2 }, expect: { y0: 0, y1: 0, y2: 1, y3: 0 } }, { set: { code: 3 }, expect: { y0: 0, y1: 0, y2: 0, y3: 1 } }] },
        p("Each output of a decoder is one **minterm**. So a decoder plus OR gates can build any function, because a sum of minterms is all you need."),
        { kind: "circuit", circuit: draw("decoder_full_adder", (d) => {
            const abc = d.hex("abc", 3, 20, 170);
            d.part("decoder", "dec", 150, 160, { w: 3 });
            d.wire(abc, "dec", "sel");
            d.part("split", "m", 280, 110, { w: 8 });
            d.wire(d.pin("dec", "y"), "m", "in");
            const pick = (ms: number[], label: string, y: number) => d.gate("or", label, 420, y, ...ms.map((i) => d.pin("m", `b${i}`)));
            d.led("sum", 590, 80, pick([1, 2, 4, 7], "s_or", 70));
            d.led("carry", 590, 230, pick([3, 5, 6, 7], "c_or", 220));
          }), caption: "A full adder from a 3:8 decoder and two ORs: sum = Σm(1, 2, 4, 7) and carry = Σm(3, 5, 6, 7).", tryThis: ["Set abc to 7. Both lights come on, because 1 + 1 + 1 = 11 in binary."],
          checks: [0, 1, 2, 3, 4, 5, 6, 7].map((m) => ({ set: { abc: m }, expect: { sum: [1, 2, 4, 7].includes(m) ? 1 : 0, carry: [3, 5, 6, 7].includes(m) ? 1 : 0 } })) },
        p("A **DEMUX** is the same circuit with a different job: it routes one data line to one of many outputs. Tie the data to 1 and it's a decoder, as you saw in the animation."),
        { kind: "practice", question: "How many 3:8 decoders make a 4:16 decoder, ignoring any inverter on the enable?", options: ["2", "3", "4", "8"], correctIndex: 0, explanation: "The extra input bit enables one or the other, so **2** are enough." },
      ],
    },
    {
      id: "encoders",
      heading: "Encoders and priority encoders",
      blocks: [
        p("An **encoder** goes the other way: of 2ⁿ input lines, whichever is on gets turned into its n-bit number. A plain encoder assumes exactly one input is on. If two are on, its output is nonsense."),
        p("A **priority encoder** fixes that: the highest-numbered active input wins, and a **valid** output says whether any input is active at all. Interrupt controllers work this way, and so do keyboard scanners."),
        { kind: "circuit", circuit: draw("priority_encoder", (d) => {
            const ins = [3, 2, 1, 0].map((i, k) => d.sw(`i${i}`, 30, 10 + k * 70));
            d.part("merge", "lines", 180, 90, { w: 4 });
            ins.forEach((from, k) => d.wire(from, "lines", `b${3 - k}`));
            d.part("priority", "enc", 300, 100, { w: 2 });
            d.wire(d.pin("lines", "out"), "enc", "in");
            d.display("code", 2, 460, 70, d.pin("enc", "y"));
            d.led("valid", 460, 170, d.pin("enc", "valid"));
          }), caption: "A 4:2 priority encoder.", tryThis: ["Turn on **i1**, then **i2**. The code jumps to 2 and stays there, whatever **i1** does.", "Turn everything off. The code reads 0, the same as if **i0** were on, so only **valid** tells them apart."],
          checks: [{ set: { i3: 0, i2: 0, i1: 0, i0: 0 }, expect: { valid: 0 } }, { set: { i3: 0, i2: 0, i1: 1, i0: 1 }, expect: { code: 1, valid: 1 } }, { set: { i3: 0, i2: 1, i1: 1, i0: 0 }, expect: { code: 2, valid: 1 } }, { set: { i3: 1, i2: 1, i1: 1, i0: 1 }, expect: { code: 3, valid: 1 } }] },
        { kind: "practice", question: "In a 4:2 priority encoder where the highest input wins, inputs i0 and i2 are on. What's the output?", options: ["00", "01", "10", "11"], correctIndex: 2, explanation: "i2 wins, so the code is 2, or **10**." },
      ],
    },
    {
      id: "converters",
      heading: "Code converters",
      blocks: [
        p("Chapter 4 introduced several codes. A **code converter** is just a combinational circuit from one to another. You design it like anything else: write the truth table, use don't-cares for patterns that can't occur, then minimise each output."),
        { kind: "circuit", circuit: draw("bcd_to_excess3", (d) => {
            const bcd = d.hex("bcd", 4, 30, 60);
            d.part("const", "three", 30, 170, { w: 4, value: 3 });
            d.part("adder", "add", 220, 60, { w: 4 });
            d.wire(bcd, "add", "a"); d.wire(d.pin("three", "out"), "add", "b");
            d.display("excess3", 4, 400, 70, d.pin("add", "sum"));
          }), caption: "BCD to Excess-3: add 3. Some conversions really are this short.",
          checks: [{ set: { bcd: 5 }, expect: { excess3: 8 } }, { set: { bcd: 9 }, expect: { excess3: 12 } }, { set: { bcd: 0 }, expect: { excess3: 3 } }] },
        p("The one you'll see most often drives a **seven-segment display**, with one output per segment."),
        { kind: "circuit", circuit: draw("seven_segment", (d) => {
            const n = d.hex("n", 4, 30, 90);
            d.part("bcd7", "dec", 190, 30, {});
            d.wire(n, "dec", "in");
            d.part("seg7", "digit", 380, 40, {});
            for (const s of "abcdefg") d.wire(d.pin("dec", s), "digit", s);
          }), caption: "A BCD to seven-segment decoder. Click the number to count from 0 to 9.", tryThis: ["Past 9 the display goes blank, because this decoder treats 10 to 15 as invalid."],
          checks: [{ set: { n: 5 }, expect: { digit: 0x6d } }, { set: { n: 8 }, expect: { digit: 0x7f } }, { set: { n: 12 }, expect: { digit: 0 } }] },
        { kind: "link", href: "/studio/challenges/bcd-7seg", label: "Challenge: BCD to 7-segment", text: "Build the decoder yourself, one segment at a time." },
      ],
    },
    {
      id: "gate-mux",
      heading: "Exam problems on these blocks",
      level: "gate",
      blocks: [
        p("To turn a 2ⁿ:1 MUX into an (n + 1)-variable function, use the method above. The same idea stacks: with a 2:1 MUX, any function of two variables can be built if you may feed in a variable and its inverse."),
        { kind: "table", headers: ["Function", "With one 2:1 MUX, select = a"], rows: [["NOT a", "d₀ = 1, d₁ = 0"], ["a AND b", "d₀ = 0, d₁ = b"], ["a OR b", "d₀ = b, d₁ = 1"], ["a XOR b", "d₀ = b, d₁ = b'"]], caption: "So a 2:1 MUX is functionally complete, if constants and inverted inputs are available." },
        { kind: "practice", gate: true, question: "How many select lines does a 32:1 MUX have?", options: ["4", "5", "16", "32"], correctIndex: 1, explanation: "2⁵ = 32, so **5**." },
        { kind: "practice", gate: true, question: "How many 4:1 MUXes make a 64:1 MUX, in a full tree?", options: ["15", "16", "21", "32"], correctIndex: 2, explanation: "Levels of 16, 4 and 1 make **21**." },
        { kind: "practice", gate: true, question: "A 2:1 MUX has select a, d₀ = b and d₁ = b'. What's its output?", options: ["a AND b", "a OR b", "a XOR b", "a XNOR b"], correctIndex: 2, explanation: "y = a'b + ab', which is **a XOR b**." },
        { kind: "practice", gate: true, question: "How many 2:4 decoders with enable make a 4:16 decoder?", options: ["4", "5", "8", "16"], correctIndex: 1, explanation: "4 drive the 16 outputs, and 1 more decodes the top two bits into their enables: **5**." },
      ],
    },
  ],
  quiz: [
    { id: "q1", question: "How many select lines does an 8:1 MUX need?", options: ["2", "3", "4", "8"], correctIndex: 1, explanation: "2³ = 8." },
    { id: "q2", question: "What does a MUX do?", options: ["Selects one of several inputs", "Adds two numbers", "Stores a bit", "Compares two numbers"], correctIndex: 0, explanation: "It's a data selector." },
    { id: "q3", question: "A 3:8 decoder's outputs correspond to…", options: ["maxterms", "minterms of its 3 inputs", "the sum of the inputs", "priority codes"], correctIndex: 1, explanation: "Exactly one output is on for each input pattern, like one minterm." },
    { id: "q4", question: "How does a DEMUX relate to a decoder?", options: ["They're unrelated", "A decoder is a DEMUX with its data input tied to 1", "A decoder is two DEMUXes", "A DEMUX has no select lines"], correctIndex: 1, explanation: "The select lines pick the output, and the data just decides its level." },
    { id: "q5", question: "An 8:3 encoder has how many inputs?", options: ["3", "8", "11", "24"], correctIndex: 1, explanation: "8 input lines give a 3-bit code." },
    { id: "q6", question: "What problem does a priority encoder solve?", options: ["Too many outputs", "More than one input on at a time", "Slow inputs", "Missing clocks"], correctIndex: 1, explanation: "The highest-priority active input wins." },
    { id: "q7", question: "Why does a priority encoder have a valid output?", options: ["To tell no inputs from input 0", "To save power", "To reset it", "To drive displays"], correctIndex: 0, explanation: "Both give code 0, so valid is needed to tell them apart." },
    { id: "q8", question: "What's the MUX data input for a 3-variable function if the select pattern's two minterms are both 1?", options: ["0", "1", "c", "c'"], correctIndex: 1, explanation: "The output is 1 whatever c is." },
    { id: "q9", question: "How many 2:1 MUXes make a 4:1 MUX?", options: ["2", "3", "4", "5"], correctIndex: 1, explanation: "Two select between pairs, and a third chooses between them." },
    { id: "q10", question: "BCD to Excess-3 can be built with…", options: ["An adder with the constant 3", "An inverter on each bit", "A 2:1 MUX", "A flip-flop"], correctIndex: 0, explanation: "Excess-3 is the digit plus 3." },
  ],
  flashcards: [
    { id: "f1", front: "MUX", back: "2ⁿ inputs, n select lines, 1 output." },
    { id: "f2", front: "Decoder", back: "n inputs, 2ⁿ outputs, exactly one on." },
    { id: "f3", front: "DEMUX", back: "1 data input routed to one of 2ⁿ outputs." },
    { id: "f4", front: "Encoder", back: "2ⁿ inputs (one on), n-bit output." },
    { id: "f5", front: "Priority encoder", back: "The highest active input wins. A valid output shows if any is on." },
    { id: "f6", front: "Function with a MUX", back: "Use n − 1 variables as selects. Each data input is 0, 1, x or x'." },
    { id: "f7", front: "2:1 MUXes for N:1", back: "N − 1" },
    { id: "f8", front: "Decoder + OR", back: "Any function: OR together the minterm outputs." },
    { id: "f9", front: "Code converter design", back: "Truth table, don't-cares for impossible patterns, minimise each output." },
    { id: "f10", front: "XOR with a 2:1 MUX", back: "Select a, d₀ = b, d₁ = b'." },
  ],
  videos: [
    { id: "v1", title: "Digital Electronics playlist", url: "https://youtube.com/playlist?list=PLBlnK6fEyqRjMH3mWf6kwqiTbT798eAOm&si=S4pKpxd5N_FIwpUy", channel: "Neso Academy" },
  ],
};

export default chapter;
