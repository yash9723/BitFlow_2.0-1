import { draw, p } from "@/lib/academy/draw";
import type { AcademyTopic } from "@/lib/academy-types";

const chapter: AcademyTopic = {
  slug: "memory",
  title: "Memories and Programmable Logic",
  summary: "How RAM and ROM store and find data, why DRAM forgets, sizing memories, and PLAs, PALs and FPGAs.",
  icon: "▦",
  difficulty: "core",
  order: 18,
  estimatedMinutes: 45,
  prerequisites: ["sequential", "combinational"],
  interactive: "memory-visualizer",
  sections: [
    {
      id: "organisation",
      heading: "How a memory is organised",
      blocks: [
        p("A memory is a grid of cells that hold bits. An **address** selects one row, or **word**, through a decoder, which you met in Chapter 11. A write-enable says whether to store into that row or read from it."),
        { kind: "formula", text: "capacity = 2^(address bits) × word width", note: "So a 2¹⁰ × 8 memory is 1024 bytes, written 1K × 8." },
        { kind: "anim", id: "memory-grid" },
        { kind: "circuit", circuit: draw("small_ram", (d) => {
            const addr = d.hex("addr", 2, 20, 20), data = d.hex("data", 4, 20, 110), we = d.sw("we", 20, 210), clk = d.clock("clk", 20, 300);
            d.part("ram", "mem", 240, 90, { w: 4, n: 2 });
            d.wire(addr, "mem", "addr"); d.wire(data, "mem", "d"); d.wire(we, "mem", "we"); d.wire(clk, "mem", "clk");
            d.display("q", 4, 430, 130, d.pin("mem", "q"));
          }), caption: "A 4-word, 4-bit RAM as one part. Writes happen at a clock edge while **we** is on, and the selected word always shows on **q**.", tryThis: ["Set addr to 1 and data to 6, turn on **we**, and press Clock edge. Now q is 6.", "Turn **we** off and change addr to 0. q shows that word's contents, then return to 1 and the 6 is still there."],
          checks: [{ set: { addr: 1, data: 6, we: 1, clk: 1 }, expect: { q: 6 } }, { set: { clk: 0, we: 0, addr: 0 }, expect: { q: 0 } }, { set: { addr: 1 }, expect: { q: 6 } }, { set: { addr: 2, data: 9, we: 1 }, expect: { q: 0 } }, { set: { clk: 1 }, expect: { q: 9 } }, { set: { clk: 0, we: 0, addr: 1 }, expect: { q: 6 } }] },
        { kind: "practice", question: "A memory has 12 address lines and 8 data lines. What's its capacity?", options: ["1 KB", "4 KB", "8 KB", "96 bits"], correctIndex: 1, explanation: "2¹² = 4096 words of 1 byte is **4 KB**." },
      ],
    },
    {
      id: "ram",
      heading: "SRAM and DRAM",
      blocks: [
        p("**RAM** loses its contents without power, and comes in two kinds. **SRAM** stores each bit in the same kind of loop as a latch: two cross-coupled inverters, plus two access transistors. **DRAM** stores a bit as charge on a tiny capacitor, reached through a single transistor."),
        { kind: "anim", id: "dram-refresh" },
        { kind: "table", headers: ["", "SRAM", "DRAM"], rows: [["Transistors per bit", "6", "1, plus a capacitor"], ["Refresh", "Not needed", "Needed, about every 64 ms"], ["Speed", "Fast", "Slower"], ["Density and cost", "Low density, expensive", "High density, cheap"], ["Reads", "Don't disturb the bit", "Destroy the bit, so it's written back"], ["Used for", "Caches, registers", "Main memory"]] },
        { kind: "callout", tone: "note", text: "That's why every computer uses both: a little fast SRAM cache close to the processor, and a lot of DRAM behind it." },
      ],
    },
    {
      id: "rom",
      heading: "ROM and its relatives",
      blocks: [
        p("**Non-volatile** memory keeps its contents without power. The oldest form, a mask ROM, is fixed when the chip is made, and each later type made rewriting easier."),
        { kind: "table", headers: ["Type", "How it's written", "How it's erased"], rows: [["Mask ROM", "At the factory", "It can't be"], ["PROM", "Once, by blowing fuses", "It can't be"], ["EPROM", "Electrically", "Ultraviolet light, the whole chip"], ["EEPROM", "Electrically", "Electrically, a byte at a time"], ["Flash", "Electrically", "Electrically, a block at a time"]] },
        p("A ROM is a look-up table: any combinational function of n inputs fits in a ROM with n address lines. Give it the inputs as an address, and the answer has been stored in advance."),
        { kind: "circuit", circuit: draw("rom_squares", (d) => {
            const n = d.hex("n", 3, 30, 50);
            d.part("rom", "table", 220, 40, { w: 6, n: 3, data: [0, 1, 4, 9, 16, 25, 36, 49] });
            d.wire(n, "table", "addr");
            d.display("square", 6, 420, 50, d.pin("table", "q"));
          }), caption: "An 8 × 6 ROM holding squares. Nothing is calculated: the answer is just read out. Displays are in hex, so 5 gives 19, which is 25.",
          checks: [{ set: { n: 5 }, expect: { square: 25 } }, { set: { n: 7 }, expect: { square: 49 } }, { set: { n: 0 }, expect: { square: 0 } }] },
      ],
    },
    {
      id: "sizing",
      heading: "Building bigger memories",
      blocks: [
        p("You combine chips in two ways. To get a **wider** word, put chips side by side, with the same address going to all. To get **more words**, stack chips and use the top address bits, through a decoder, to choose which one is active."),
        { kind: "formula", text: "chips = (words needed ÷ words per chip) × (width needed ÷ width per chip)" },
        { kind: "example", title: "64K × 8 from 16K × 4 chips", problem: "How many chips do you need, and how are they decoded?", steps: ["Width: 8 ÷ 4 = 2 chips side by side.", "Depth: 64K ÷ 16K = 4 rows of those.", "That's 4 × 2 = 8 chips.", "64K needs 16 address lines, and each chip uses 14. The top 2 go to a 2:4 decoder that selects a row."], answer: "**8 chips** and a **2:4 decoder**." },
        { kind: "practice", question: "How many 1K × 4 chips make a 4K × 8 memory?", options: ["2", "4", "8", "16"], correctIndex: 2, explanation: "4 rows of 2 chips: **8**." },
      ],
    },
    {
      id: "pld",
      heading: "Programmable logic",
      blocks: [
        p("So far, all our logic has been fixed at design time. **Programmable logic devices** let you change a chip's function after it's made, and they've become the main way to prototype digital systems. The early ones are all a programmable AND-OR array."),
        { kind: "table", headers: ["Device", "AND plane", "OR plane"], rows: [["PROM", "Fixed (every minterm)", "Programmable"], ["PAL", "Programmable", "Fixed"], ["PLA", "Programmable", "Programmable"]] },
        { kind: "anim", id: "pla-program" },
        p("A **CPLD** joins several PAL-like blocks with a switch matrix. An **FPGA** goes much further: thousands of small logic cells in a grid, and programmable wiring between them. Each cell holds a **look-up table** and a flip-flop."),
        { kind: "anim", id: "lut-explorer" },
        p("An FPGA also has block RAM, multipliers and clock managers built in. Its configuration lives in SRAM, so it loads from flash at power-up, and you can reprogram it as often as you like."),
        { kind: "link", href: "/flash", label: "Flash a real FPGA board", text: "Build a design here and program it onto a board from your browser." },
        { kind: "practice", question: "How many bits of memory does a 4-input LUT hold?", options: ["4", "8", "16", "32"], correctIndex: 2, explanation: "2⁴ = **16**: one bit for each input combination." },
      ],
    },
    {
      id: "gate-memory",
      heading: "Exam numbers",
      level: "gate",
      blocks: [
        p("Questions on memories mostly come down to address lines, chip counts and refresh. The number of address lines is log₂ of the number of words. To size a ROM for a function, use the inputs as address lines and the outputs as data lines."),
        { kind: "practice", gate: true, question: "What size of ROM can hold a 4-bit by 4-bit multiplier?", options: ["16 × 8", "256 × 4", "256 × 8", "65536 × 8"], correctIndex: 2, explanation: "8 input bits give 256 addresses, and the product needs 8 bits: **256 × 8**." },
        { kind: "practice", gate: true, question: "How many address lines does a 2 MB memory organised in bytes need?", options: ["16", "20", "21", "24"], correctIndex: 2, explanation: "2 MB = 2²¹ bytes, so **21**." },
        { kind: "practice", gate: true, question: "A 4K × 8 memory is built from 1K × 8 chips. What decoder selects the chips?", options: ["1:2", "2:4", "3:8", "4:16"], correctIndex: 1, explanation: "4 chips need 2 selecting address bits, so a **2:4** decoder." },
        { kind: "practice", gate: true, question: "How many functions of 4 inputs can a single 4-input LUT implement?", options: ["16", "256", "4096", "65536"], correctIndex: 3, explanation: "16 bits can be set in 2¹⁶ = **65536** ways, so every 4-input function." },
      ],
    },
  ],
  quiz: [
    { id: "q1", question: "What's the capacity of a memory with 10 address lines and 16 data lines?", options: ["1K × 16", "10 × 16", "16K × 10", "1K × 10"], correctIndex: 0, explanation: "2¹⁰ = 1K words of 16 bits." },
    { id: "q2", question: "What selects a row in a memory?", options: ["A decoder driven by the address", "The data lines", "The clock alone", "The output enable"], correctIndex: 0, explanation: "One decoder output goes high for each address." },
    { id: "q3", question: "How is a bit stored in SRAM?", options: ["In a loop of two inverters", "As charge on a capacitor", "As a blown fuse", "As light"], correctIndex: 0, explanation: "It's a latch with access transistors." },
    { id: "q4", question: "How is a bit stored in DRAM?", options: ["In a loop of two inverters", "As charge on a capacitor", "As a blown fuse", "In a flip-flop"], correctIndex: 1, explanation: "One transistor and one capacitor." },
    { id: "q5", question: "Why does DRAM need refreshing?", options: ["Its capacitors leak", "Its clock stops", "It's too fast", "Its address decoder forgets"], correctIndex: 0, explanation: "Charge leaks away, so it has to be restored periodically." },
    { id: "q6", question: "Which of these is non-volatile?", options: ["SRAM", "DRAM", "Flash", "A D flip-flop"], correctIndex: 2, explanation: "Flash keeps its contents without power." },
    { id: "q7", question: "To double a memory's word width, you connect chips…", options: ["Side by side, sharing the address", "End to end, using a decoder", "With a shift register", "It can't be done"], correctIndex: 0, explanation: "Each chip supplies part of the word." },
    { id: "q8", question: "In a PAL, which plane is programmable?", options: ["OR only", "AND only", "Both", "Neither"], correctIndex: 1, explanation: "PAL fixes the OR plane; PLA programs both." },
    { id: "q9", question: "What's the core logic element of an FPGA?", options: ["A look-up table and a flip-flop", "A NAND gate", "A processor", "A fuse"], correctIndex: 0, explanation: "A LUT makes any small function, and the flip-flop stores results." },
    { id: "q10", question: "Why does an FPGA usually need a flash chip beside it?", options: ["Its configuration is in SRAM and is lost at power-off", "To run faster", "To add logic", "To supply power"], correctIndex: 0, explanation: "It reloads its configuration at every power-up." },
  ],
  flashcards: [
    { id: "f1", front: "Memory capacity", back: "2^(address bits) × word width" },
    { id: "f2", front: "SRAM cell", back: "6 transistors: two cross-coupled inverters and two access transistors." },
    { id: "f3", front: "DRAM cell", back: "1 transistor and 1 capacitor." },
    { id: "f4", front: "DRAM refresh", back: "Read each row and write it back, about every 64 ms." },
    { id: "f5", front: "ROM as logic", back: "Inputs are the address, and outputs are the data." },
    { id: "f6", front: "Wider words", back: "Chips side by side, sharing the address." },
    { id: "f7", front: "More words", back: "Extra address bits go through a decoder to the chip selects." },
    { id: "f8", front: "PROM, PAL, PLA", back: "PROM: OR programmable. PAL: AND programmable. PLA: both." },
    { id: "f9", front: "n-input LUT", back: "2ⁿ bits of memory, used as any function of n inputs." },
    { id: "f10", front: "FPGA", back: "A grid of LUTs and flip-flops, with programmable routing, block RAM and multipliers." },
  ],
  videos: [
    { id: "v1", title: "Digital Electronics playlist", url: "https://youtube.com/playlist?list=PLBlnK6fEyqRjMH3mWf6kwqiTbT798eAOm&si=S4pKpxd5N_FIwpUy", channel: "Neso Academy" },
  ],
};

export default chapter;
