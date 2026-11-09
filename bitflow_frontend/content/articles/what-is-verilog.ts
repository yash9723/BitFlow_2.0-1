import { p } from "@/lib/academy/draw";
import type { Article } from "@/lib/article-types";

const article: Article = {
  slug: "what-is-verilog",
  title: "What is Verilog?",
  description: "Verilog is a hardware description language: you describe circuits, and tools simulate them or turn them into gates. A plain-language introduction with a first example.",
  published: "2026-11-09",
  readMinutes: 6,
  sections: [
    {
      id: "short-answer",
      heading: "The short answer",
      blocks: [
        p("**Verilog** is a hardware description language, or HDL. You use it to describe digital circuits: what they are made of, how they are connected and what they do. Software tools can then **simulate** the description to check it, or **synthesise** it into real logic gates for an FPGA or a chip."),
        p("It was created in the 1980s and standardised by the IEEE as 1364 (versions in 1995, 2001 and 2005). **SystemVerilog** (IEEE 1800) is its modern successor. It contains all of Verilog-2005 and adds features for cleaner design code and for verification. Most people today write the Verilog subset of it, or SystemVerilog, in the same files."),
      ],
    },
    {
      id: "not-a-program",
      heading: "It describes hardware, it does not run like a program",
      blocks: [
        p("The biggest surprise for programmers is that Verilog statements are not executed one after another. A circuit has many parts, and they all exist and work at the same time. Verilog lets you write each part down, and the order you list them in does not matter."),
        { kind: "code", text: "module half_adder (\n  input  wire a,\n  input  wire b,\n  output wire sum,\n  output wire carry\n);\n  assign sum   = a ^ b;   // an XOR gate\n  assign carry = a & b;   // an AND gate\nendmodule", caption: "A half adder. Both assign lines are active all the time: whenever a or b changes, sum and carry follow." },
        p("A **module** is one block with named inputs and outputs, like a chip. `assign` describes combinational logic: the output continuously follows the expression. Step through the animation to see the circuit and its Verilog change together."),
        { kind: "anim", id: "walk-assign-gates" },
      ],
    },
    {
      id: "what-for",
      heading: "What people use it for",
      blocks: [
        { kind: "list", items: [
          "**Design.** Writing the circuit itself, at the register-transfer level (RTL): registers, and the logic between them.",
          "**Simulation.** Running the design on a computer, with a **testbench** that drives the inputs and checks the outputs, before any hardware exists.",
          "**Synthesis.** A tool such as Yosys turns the description into a netlist of gates, which is then placed and routed onto an FPGA or made into a chip.",
          "**Verification.** Checking a large design with randomised tests, assertions and coverage (usually in SystemVerilog).",
        ] },
        { kind: "callout", tone: "note", text: "Not all Verilog can become hardware. Constructs like `#10` delays, `$display` and `initial` blocks are for testbenches and simulation. The part you intend to build is called synthesisable code." },
      ],
    },
    {
      id: "verilog-or-systemverilog",
      heading: "Verilog or SystemVerilog?",
      blocks: [
        p("For learning, start with Verilog basics: modules, `assign`, `always` blocks, `wire` and `reg`. Everything you learn works in SystemVerilog too, and you can add its conveniences (such as `logic`, `always_ff` and `always_comb`) when you are comfortable. Simulators like Icarus Verilog and Verilator support Verilog and much of SystemVerilog."),
      ],
    },
    {
      id: "start",
      heading: "How to start",
      blocks: [
        { kind: "list", ordered: true, items: [
          "Learn what a gate is and how logic combines (the Academy starts there).",
          "Write a small module, such as the half adder above, and simulate it with a testbench.",
          "Move on to clocked logic: registers, counters and state machines.",
          "Put a design on an FPGA board when you are ready to see it run for real.",
        ] },
        { kind: "link", href: "/academy/gates-to-verilog", label: "From Gates to Verilog", text: "The Academy chapter that turns the circuits you have drawn into Verilog, with animated walkthroughs." },
      ],
    },
  ],
  faq: [
    { q: "Is Verilog a programming language?", a: "Not in the usual sense. It is a hardware description language: it describes circuits that all work at once, rather than a list of steps that run in order. Parts of it (for testbenches) look like a program, but the design code describes hardware." },
    { q: "What is the difference between Verilog and SystemVerilog?", a: "SystemVerilog (IEEE 1800) is a superset of Verilog-2005 (IEEE 1364). It adds features for cleaner design code, such as logic, always_ff and always_comb, and many features for verification. Valid Verilog is almost always valid SystemVerilog." },
    { q: "Do I need an FPGA to learn Verilog?", a: "No. You can learn it entirely in a simulator, which runs your design on a computer and shows its signals as waveforms. An FPGA board is a good next step when you want to see a design drive real LEDs and buttons." },
  ],
  related: [
    { href: "/academy/gates-to-verilog", label: "Academy: From Gates to Verilog" },
    { href: "/articles/verilog-vs-vhdl", label: "Verilog vs VHDL" },
    { href: "/articles/blocking-vs-nonblocking-assignments-in-verilog", label: "Blocking vs nonblocking assignments" },
    { href: "/lab", label: "Board Lab: run Verilog on a 3D FPGA board" },
  ],
};
export default article;
