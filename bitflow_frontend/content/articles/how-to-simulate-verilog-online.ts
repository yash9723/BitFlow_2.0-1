import { p } from "@/lib/academy/draw";
import type { Article } from "@/lib/article-types";

const article: Article = {
  slug: "how-to-simulate-verilog-online",
  title: "How to simulate Verilog (on your computer or in a browser)",
  description: "What simulating Verilog means, a minimal design and testbench, the commands to run it with Icarus Verilog, and how to do the same in a browser.",
  published: "2026-11-09",
  readMinutes: 7,
  sections: [
    {
      id: "what",
      heading: "What simulating means",
      blocks: [
        p("A **simulator** runs your hardware description on a computer: it applies inputs over time and calculates how every signal responds. You do not need a chip or a board. You write a **testbench**, a Verilog module that drives the design's inputs and checks or prints its outputs, and the simulator produces text output and a **waveform** you can inspect."),
      ],
    },
    {
      id: "files",
      heading: "A design and a testbench",
      blocks: [
        { kind: "code", text: "// and_gate.v\nmodule and_gate (input wire a, input wire b, output wire y);\n  assign y = a & b;\nendmodule", caption: "The design under test." },
        { kind: "code", text: "// tb.v\nmodule tb;\n  reg  a, b;\n  wire y;\n  and_gate dut (.a(a), .b(b), .y(y));\n\n  initial begin\n    $dumpfile(\"wave.vcd\");   // record a waveform file\n    $dumpvars(0, tb);\n    a = 0; b = 0; #10;\n    a = 0; b = 1; #10;\n    a = 1; b = 0; #10;\n    a = 1; b = 1; #10;\n    $finish;\n  end\n\n  always @(a or b) #1 $display(\"a=%b b=%b y=%b\", a, b, y);\nendmodule", caption: "The testbench: it declares the inputs as reg, connects the design, steps through all four input combinations, and records the signals." },
        p("In a testbench the inputs are `reg` because you assign them from an `initial` block, and the outputs are `wire`. `#10` waits ten time units. `$dumpfile` and `$dumpvars` write the waveform. These system tasks are for simulation only and do not become hardware."),
      ],
    },
    {
      id: "icarus",
      heading: "Running it with Icarus Verilog",
      blocks: [
        { kind: "code", text: "iverilog -o sim and_gate.v tb.v   # compile\nvvp sim                           # run\ngtkwave wave.vcd                  # look at the waveform", caption: "Icarus Verilog is an open-source simulator. iverilog compiles, vvp runs, and GTKWave displays the .vcd file." },
        p("The output lists y for each input pair. For a larger design, Verilator is another open-source option that compiles Verilog to C++ and runs quickly, and SystemVerilog support varies by simulator, so check what yours supports."),
      ],
    },
    {
      id: "browser",
      heading: "Simulating in a browser",
      blocks: [
        p("If you would rather not install anything, BitFlow's Sandbox does the same thing in a browser: you edit the design and testbench, press Run, and get the console output and an interactive waveform. The simulation runs on BitFlow's servers using the same open-source tools, so running code needs a free account."),
        { kind: "list", items: [
          "Browse the Design Studio's tools (circuit editor, state-machine designer, truth tables) for free. They generate Verilog and a testbench you can run.",
          "Open the Sandbox, paste a design and testbench, and run it.",
          "Solve graded problems, where a hidden testbench checks your design.",
        ] },
        { kind: "link", href: "/studio", label: "Design Studio", text: "Draw a circuit or state machine and get Verilog with a self-checking testbench." },
        { kind: "link", href: "/problems", label: "Practice problems", text: "Graded Verilog problems, from a single wire upwards." },
      ],
    },
    {
      id: "good-testbench",
      heading: "What makes a good testbench",
      blocks: [
        { kind: "list", items: [
          "**Self-checking.** Compare outputs to expected values and print PASS or FAIL, so you do not have to read waveforms for every run.",
          "**Cover the edges.** Test the first and last values, resets, and every combination when the design is small enough.",
          "**Test the clock behaviour.** For sequential designs, change inputs between clock edges and check that outputs only change at edges.",
        ] },
        { kind: "link", href: "/academy/gates-to-verilog", label: "From Gates to Verilog", text: "The Academy chapter covers testbenches, assertions and the design flow." },
      ],
    },
  ],
  faq: [
    { q: "Do I need to install anything to simulate Verilog?", a: "On your own computer you need a simulator such as Icarus Verilog or Verilator and, to view waveforms, a viewer such as GTKWave. In a browser tool such as BitFlow's Sandbox you do not install anything." },
    { q: "What is a testbench?", a: "A Verilog module with no ports that connects to your design, drives its inputs over time and checks or prints its outputs. It is used only in simulation." },
    { q: "What is a VCD file?", a: "A Value Change Dump: a text file recording every change of every signal over time. Waveform viewers such as GTKWave read it to draw the signals." },
  ],
  related: [
    { href: "/articles/what-is-verilog", label: "What is Verilog?" },
    { href: "/studio", label: "Design Studio" },
    { href: "/problems", label: "Practice problems" },
    { href: "/academy/gates-to-verilog", label: "Academy: From Gates to Verilog" },
  ],
};
export default article;
