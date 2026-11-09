import { p } from "@/lib/academy/draw";
import type { Article } from "@/lib/article-types";

const article: Article = {
  slug: "what-is-an-fpga",
  title: "What is an FPGA?",
  description: "An FPGA is a chip whose logic you rewire after it is made. What is inside one, how it differs from a microcontroller, and how a design gets onto it.",
  published: "2026-11-09",
  readMinutes: 6,
  sections: [
    {
      id: "short-answer",
      heading: "The short answer",
      blocks: [
        p("An **FPGA** (field-programmable gate array) is a chip full of small logic blocks and wiring that you can reconfigure after it has been made. Instead of running a program, you load a **configuration** that connects those blocks into the digital circuit you designed. Load a different one and the same chip becomes a different circuit."),
      ],
    },
    {
      id: "inside",
      heading: "What is inside",
      blocks: [
        { kind: "list", items: [
          "**Look-up tables (LUTs).** A LUT with k inputs is a tiny memory of 2^k bits. Fill it with a truth table and it can implement any function of its k inputs.",
          "**Flip-flops.** Each logic block can store a bit, so a LUT followed by a flip-flop makes registered logic.",
          "**Routing.** Programmable switches connect the blocks to each other.",
          "**Extras.** Many FPGAs also have blocks of RAM, multipliers (DSP blocks), clock-management circuits and I/O pins that talk to the outside world.",
        ] },
        p("Try the look-up table below: change what it stores and see which function it becomes."),
        { kind: "anim", id: "lut-explorer" },
      ],
    },
    {
      id: "vs",
      heading: "FPGA, microcontroller or ASIC?",
      blocks: [
        { kind: "table", headers: ["", "Microcontroller", "FPGA", "ASIC"], rows: [
          ["What you write", "A program that a processor runs", "A hardware description that becomes a circuit", "A hardware description, made into a custom chip"],
          ["Parallelism", "Mostly one thing at a time per core", "Everything you described runs at once", "Same"],
          ["Changing it", "Reflash the program", "Reload the configuration", "Not possible once manufactured"],
          ["Cost to start", "Low", "Low to moderate (a board)", "Very high (manufacturing)"],
        ] },
        p("An FPGA is good when you need many things to happen in parallel with exact timing, or when you want to try a hardware design before committing to a chip. A microcontroller is simpler and cheaper when a program is enough."),
      ],
    },
    {
      id: "flow",
      heading: "How a design gets onto an FPGA",
      blocks: [
        { kind: "list", ordered: true, items: [
          "**Write** the design in a hardware description language such as Verilog.",
          "**Simulate** it with a testbench to check the behaviour.",
          "**Synthesise** it: a tool turns the code into a netlist of LUTs and flip-flops.",
          "**Place and route:** the tool chooses which physical blocks to use and how to wire them.",
          "**Generate a bitstream:** the configuration file for your specific chip.",
          "**Program** the board over USB. Many FPGAs lose their configuration when power is removed and load it again from a flash chip at start-up.",
        ] },
        { kind: "link", href: "/lab", label: "Board Lab", text: "Write Verilog and watch it run on a 3D FPGA board in your browser, then put it on a real board." },
        { kind: "link", href: "/flash", label: "Flash an FPGA board", text: "Program a supported board straight from the browser over USB." },
      ],
    },
  ],
  faq: [
    { q: "Is an FPGA a processor?", a: "No. It has no fixed instruction set. You can build a processor inside one, but by default it is a blank array of logic that becomes whatever circuit you configure." },
    { q: "Can I learn FPGA design without buying a board?", a: "Yes. Write and simulate your designs first, and use a browser-based board model to see them drive LEDs and displays. A real board is a good step when you want to see it run in hardware." },
    { q: "What language do I use to program an FPGA?", a: "Usually a hardware description language: Verilog, SystemVerilog or VHDL. Some tools can also start from higher-level descriptions, but the HDLs are the common starting point." },
  ],
  related: [
    { href: "/lab", label: "Board Lab" },
    { href: "/flash", label: "Flash an FPGA board" },
    { href: "/articles/what-is-verilog", label: "What is Verilog?" },
    { href: "/academy/memory", label: "Academy: Memories and Programmable Logic" },
  ],
};
export default article;
