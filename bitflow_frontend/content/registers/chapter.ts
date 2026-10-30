import { draw, p } from "@/lib/academy/draw";
import type { AcademyTopic } from "@/lib/academy-types";

const pulse = (expect: Record<string, number>) => [{ set: { clk: 1 }, expect }, { set: { clk: 0 }, expect: {} }];

const chapter: AcademyTopic = {
  slug: "registers",
  title: "Registers and Shift Registers",
  summary: "Storing a whole word, moving bits along a chain, serial and parallel conversion, and generating pseudo-random bits.",
  icon: "▤",
  difficulty: "core",
  order: 14,
  estimatedMinutes: 30,
  prerequisites: ["sequential"],
  sections: [
    {
      id: "register",
      heading: "Storing a word",
      blocks: [
        p("A **register** is a row of D flip-flops sharing one clock, storing one bit each. Eight of them hold a byte. Almost every data path is registers with logic between them: on each clock edge, the results of the logic land in the next register."),
        p("A plain flip-flop loads on every edge, but usually a register should only load when told to. A **load enable** adds a MUX in front of each D: when enable is 1 it takes new data, and when it's 0 it reloads its own output."),
        { kind: "circuit", circuit: draw("register_with_enable", (d) => {
            const data = d.hex("data", 4, 30, 30), en = d.sw("en", 30, 130), clk = d.clock("clk", 30, 220);
            d.part("reg", "r", 240, 90, { w: 4 });
            d.wire(data, "r", "d"); d.wire(en, "r", "en"); d.wire(clk, "r", "clk");
            d.display("stored", 4, 430, 110, d.pin("r", "q"));
          }), caption: "A 4-bit register with load enable. Change **data** freely: **stored** only changes at a clock edge while **en** is on.", tryThis: ["Set data to 5, turn on **en**, and press Clock edge. It stores 5.", "Turn **en** off, set data to 9, and clock again. It keeps 5."],
          checks: [{ set: { data: 5, en: 1, clk: 1 }, expect: { stored: 5 } }, { set: { clk: 0 }, expect: {} }, { set: { data: 9, en: 0, clk: 1 }, expect: { stored: 5 } }, { set: { clk: 0, en: 1 }, expect: { stored: 5 } }, { set: { clk: 1 }, expect: { stored: 9 } }] },
      ],
    },
    {
      id: "shift",
      heading: "Shift registers",
      blocks: [
        p("Connect each flip-flop's output to the next one's input, and on every clock edge the bits all move along by one place. That's a **shift register**."),
        { kind: "anim", id: "shift-register" },
        { kind: "table", headers: ["Type", "In", "Out", "Used for"], rows: [["SISO", "Serial", "Serial", "Delaying a bit stream"], ["SIPO", "Serial", "Parallel", "Receiving: a serial line into a word"], ["PISO", "Parallel", "Serial", "Transmitting: a word onto a serial line"], ["PIPO", "Parallel", "Parallel", "An ordinary register"]] },
        p("A **universal shift register** does all of this, choosing with mode inputs what each flip-flop's input MUX selects. The classic part is the 74194."),
        { kind: "table", headers: ["s1 s0", "Action"], rows: [["0 0", "Hold"], ["0 1", "Shift right"], ["1 0", "Shift left"], ["1 1", "Parallel load"]] },
        { kind: "circuit", circuit: draw("universal_shift", (d) => {
            const si = d.sw("si", 20, 10), data = d.hex("data", 4, 20, 90), load = d.sw("load", 20, 190), dir = d.sw("dir", 20, 270), clk = d.clock("clk", 20, 350);
            d.part("shift", "sr", 240, 110, { w: 4 });
            d.wire(si, "sr", "si"); d.wire(data, "sr", "d"); d.wire(load, "sr", "load"); d.wire(dir, "sr", "dir"); d.wire(clk, "sr", "clk");
            d.display("value", 4, 440, 120, d.pin("sr", "q"));
            d.led("out", 440, 210, d.pin("sr", "so"));
          }), caption: "A 4-bit shift register. With **dir** off, bits move towards bit 0, and **si** enters at the top. With **dir** on, they go the other way. The display is in hex.", tryThis: ["Turn on **si** and clock four times: F appears, filling from the top: 8, C, E, F.", "Set data to 5 and turn on **load**, clock once, then turn **load** off and clock again. 0101 shifts to 0010, which is the same as dividing by 2."],
          checks: [{ set: { si: 1, data: 0, load: 0, dir: 0 }, expect: {} }, ...pulse({ value: 8 }), ...pulse({ value: 12 }), ...pulse({ value: 14 }), ...pulse({ value: 15 }), { set: { load: 1, data: 5, si: 0 }, expect: {} }, ...pulse({ value: 5, out: 1 }), { set: { load: 0 }, expect: {} }, ...pulse({ value: 2, out: 0 }), { set: { dir: 1 }, expect: {} }, ...pulse({ value: 4 })] },
        { kind: "callout", tone: "tip", text: "A shift left multiplies by 2, and a shift right divides by 2. For signed numbers, an **arithmetic** right shift copies the sign bit instead of shifting in 0, so 1100 (−4) becomes 1110 (−2)." },
        { kind: "practice", question: "An 8-bit SISO shift register runs on a 1 MHz clock. How long until a bit that goes in comes out?", options: ["1 µs", "4 µs", "8 µs", "8 ms"], correctIndex: 2, explanation: "Each clock moves it one place, and one clock is 1 µs: 8 × 1 µs = **8 µs**." },
        { kind: "practice", question: "How many clock edges does it take to load 4 bits serially into a 4-bit SIPO?", options: ["1", "2", "4", "16"], correctIndex: 2, explanation: "One bit enters per edge, so **4**." },
      ],
    },
    {
      id: "serial",
      heading: "Serial communication",
      blocks: [
        p("Sending bits one at a time over a single wire needs a PISO at the sender and a SIPO at the receiver. That's the heart of UART, SPI and I²C. A UART adds a start bit and a stop bit around each byte, so the receiver knows where it begins."),
        { kind: "link", href: "/lab", label: "Build a UART in the Board Lab", text: "The Lab has serial lessons you can run in simulation, or on a real FPGA board." },
        { kind: "practice", question: "A UART sends 8 data bits plus a start and a stop bit at 9600 baud. Roughly how many bytes can it send per second?", options: ["960", "1200", "9600", "76800"], correctIndex: 0, explanation: "Each byte takes 10 bit times, so 9600 ÷ 10 = **960**." },
      ],
    },
    {
      id: "gate-lfsr",
      heading: "Linear feedback shift registers",
      level: "gate",
      blocks: [
        p("Feed a shift register's input from an XOR of some of its outputs, and it steps through a long sequence that looks random. This is a **linear feedback shift register** (LFSR). With the right tap positions, an n-bit LFSR visits 2ⁿ − 1 states before repeating, and it needs just one gate. LFSRs generate test patterns, compute CRC checksums and scramble data."),
        { kind: "circuit", circuit: draw("lfsr_4bit", (d) => {
            const clk = d.clock("clk", 20, 340);
            d.part("dff", "f0", 240, 20); d.part("dff", "f1", 240, 120); d.part("dff", "f2", 240, 220); d.part("dff", "f3", 240, 320);
            const [q0, q1, q2, q3] = ["f0", "f1", "f2", "f3"].map((f) => d.pin(f, "q"));
            d.wire(d.gate("xnor", "fb", 90, 20, q3, q2), "f0", "d");
            d.wire(q0, "f1", "d"); d.wire(q1, "f2", "d"); d.wire(q2, "f3", "d");
            for (const f of ["f0", "f1", "f2", "f3"]) d.wire(clk, f, "clk");
            d.part("merge", "out", 440, 160, { w: 4 });
            d.wire(q0, "out", "b0"); d.wire(q1, "out", "b1"); d.wire(q2, "out", "b2"); d.wire(q3, "out", "b3");
            d.display("state", 4, 560, 170, d.pin("out", "out"));
          }), caption: "A 4-bit LFSR with XNOR feedback from the top two bits. It visits 15 of the 16 states. Only 1111 is left out, and it would stay stuck there.", tryThis: ["Keep pressing Clock edge. The display goes 1, 3, 7, E, D, B, 6, and so on, and it returns to 0 after 15 clocks."],
          checks: [...pulse({ state: 1 }), ...pulse({ state: 3 }), ...pulse({ state: 7 }), ...pulse({ state: 14 }), ...pulse({ state: 13 }), ...pulse({ state: 11 }), ...pulse({ state: 6 })] },
        { kind: "practice", gate: true, question: "What's the longest possible sequence of an 8-bit LFSR?", options: ["8", "128", "255", "256"], correctIndex: 2, explanation: "2⁸ − 1 = **255**. One state is always a lock-up state." },
        { kind: "practice", gate: true, question: "1011 (−5) is shifted right arithmetically by one place. What's the result?", options: ["0101", "1101", "0110", "1110"], correctIndex: 1, explanation: "Copy the sign bit in: **1101**, which is −3. Shifting rounds towards minus infinity, so −5 ÷ 2 gives −3." },
        { kind: "practice", gate: true, question: "A 16-bit word arrives serially at 2 Mbit/s into a SIPO. How long until the whole word is in?", options: ["2 µs", "8 µs", "16 µs", "32 µs"], correctIndex: 1, explanation: "Each bit takes 0.5 µs, so 16 × 0.5 µs = **8 µs**." },
      ],
    },
  ],
  quiz: [
    { id: "q1", question: "A register is…", options: ["A row of flip-flops sharing a clock", "A row of gates", "A kind of adder", "A single latch"], correctIndex: 0, explanation: "One flip-flop per bit, all clocked together." },
    { id: "q2", question: "How does a load enable hold a value?", options: ["It stops the clock", "A MUX feeds the output back to D", "It disconnects the power", "It uses a latch"], correctIndex: 1, explanation: "The flip-flop reloads its own value each edge." },
    { id: "q3", question: "What happens at a clock edge in a shift register?", options: ["All bits clear", "All bits move one place", "One bit flips", "Nothing, unless enabled by data"], correctIndex: 1, explanation: "Each flip-flop takes the previous one's output." },
    { id: "q4", question: "Which type turns serial data into a word?", options: ["SISO", "SIPO", "PISO", "PIPO"], correctIndex: 1, explanation: "Serial in, parallel out." },
    { id: "q5", question: "Which type does a transmitter use?", options: ["SISO", "SIPO", "PISO", "PIPO"], correctIndex: 2, explanation: "Load a word in parallel, and shift it out serially." },
    { id: "q6", question: "Shifting an unsigned number left one place…", options: ["adds 1", "doubles it", "halves it", "inverts it"], correctIndex: 1, explanation: "Every bit moves to a position worth twice as much." },
    { id: "q7", question: "What does an arithmetic right shift copy into the top bit?", options: ["0", "1", "The sign bit", "The bit shifted out"], correctIndex: 2, explanation: "So the sign stays the same." },
    { id: "q8", question: "What does a universal shift register add over a plain one?", options: ["Mode inputs for hold, shift left, shift right and load", "A bigger clock", "More outputs only", "Memory cells"], correctIndex: 0, explanation: "A MUX in front of each flip-flop picks the action." },
    { id: "q9", question: "What's a 4-bit register's maximum stored value?", options: ["4", "8", "15", "16"], correctIndex: 2, explanation: "2⁴ − 1 = 15." },
    { id: "q10", question: "What is an LFSR used for?", options: ["Pseudo-random sequences, test patterns and CRCs", "Adding numbers", "Storing programs", "Driving displays"], correctIndex: 0, explanation: "A long, repeatable sequence from very little logic." },
  ],
  flashcards: [
    { id: "f1", front: "Register", back: "n flip-flops on one clock, storing n bits." },
    { id: "f2", front: "Load enable", back: "A MUX before D: take new data, or reload the output." },
    { id: "f3", front: "SIPO", back: "Serial in, parallel out: receiving." },
    { id: "f4", front: "PISO", back: "Parallel in, serial out: transmitting." },
    { id: "f5", front: "Delay through an n-bit SISO", back: "n clock periods." },
    { id: "f6", front: "Universal shift register modes", back: "Hold, shift right, shift left, parallel load." },
    { id: "f7", front: "Shift left, shift right", back: "Multiply by 2, divide by 2." },
    { id: "f8", front: "Arithmetic right shift", back: "Copies the sign bit." },
    { id: "f9", front: "LFSR", back: "A shift register with XOR feedback." },
    { id: "f10", front: "Maximal LFSR length", back: "2ⁿ − 1 states." },
  ],
  videos: [],
};

export default chapter;
