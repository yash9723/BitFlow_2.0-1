import { p } from "@/lib/academy/draw";
import type { AcademyTopic } from "@/lib/academy-types";

const chapter: AcademyTopic = {
  slug: "gates-to-verilog",
  title: "From Gates to Verilog",
  summary: "Stop drawing and start describing: how every circuit in this course is written in Verilog, simulated, and turned into real hardware.",
  icon: "</>",
  difficulty: "core",
  order: 20,
  estimatedMinutes: 40,
  prerequisites: ["sequential", "fsms"],
  sections: [
    {
      id: "why",
      heading: "Why stop drawing",
      blocks: [
        p("A modern chip has billions of transistors, and nobody draws those. Engineers write a **hardware description language** (HDL) and let tools work out the gates. **Verilog** is the most widely used. Here's the key thing to remember: it may look like a programming language, but you're describing hardware. Every line exists at once, and they all run in parallel."),
        { kind: "anim", id: "circuit-to-verilog" },
      ],
    },
    {
      id: "module",
      heading: "Modules and combinational logic",
      blocks: [
        p("A **module** is one block with named inputs and outputs. Inside, `assign` describes combinational logic: the output continuously follows the expression, exactly like wires and gates."),
        { kind: "code", text: "module half_adder (\n  input  wire a,\n  input  wire b,\n  output wire sum,\n  output wire carry\n);\n  assign sum   = a ^ b;\n  assign carry = a & b;\nendmodule", caption: "The half adder from Chapter 10. The two `assign` lines happen at the same time, and their order doesn't matter." },
        p("For larger combinational logic, use `always @(*)`. Its contents read like a program, but the result is still logic with no memory, and that holds only if every output gets a value on every path."),
        { kind: "code", text: "module mux4 (input wire [3:0] d, input wire [1:0] s, output reg y);\n  always @(*) begin\n    case (s)\n      2'b00: y = d[0];\n      2'b01: y = d[1];\n      2'b10: y = d[2];\n      2'b11: y = d[3];\n    endcase\n  end\nendmodule", caption: "The 4:1 MUX from Chapter 11. `reg` here only means \"assigned inside an always block\". It doesn't mean a register exists." },
        { kind: "link", href: "/problems/the-first-wire", label: "Write your first module", text: "The Learning Path starts here, with instant feedback from a real simulator." },
      ],
    },
    {
      id: "sequential",
      heading: "Flip-flops and blocking assignments",
      blocks: [
        p("`always @(posedge clk)` describes flip-flops: everything assigned in it updates at the clock edge. This is where one rule matters more than any other."),
        { kind: "anim", id: "blocking-nonblocking" },
        { kind: "table", headers: ["Describing", "Use", "Written"], rows: [["Combinational logic", "Blocking", "`always @(*)` with `=`"], ["Flip-flops", "Nonblocking", "`always @(posedge clk)` with `<=`"]], caption: "Follow this one rule and a whole class of bugs goes away." },
        { kind: "code", text: "module counter4 (input wire clk, input wire rst, output reg [3:0] q);\n  always @(posedge clk) begin\n    if (rst) q <= 4'd0;\n    else     q <= q + 4'd1;\n  end\nendmodule", caption: "A 4-bit synchronous counter with reset, from Chapter 15. `q + 1` gets you an adder, and you don't have to design it." },
        { kind: "practice", question: "Which code describes a 3-bit shift register?", options: ["`a <= in; b <= a; c <= b;` in `always @(posedge clk)`", "`a = in; b = a; c = b;` in `always @(posedge clk)`", "`assign a = in; assign b = a; assign c = b;`", "`a <= in; b <= a; c <= b;` in `always @(*)`"], correctIndex: 0, explanation: "With nonblocking assignments, each flip-flop takes the **old** value of the one before. Blocking would copy `in` straight through all three." },
      ],
    },
    {
      id: "pitfalls",
      heading: "Common mistakes",
      blocks: [
        { kind: "table", headers: ["You write", "You get", "Fix"], rows: [["`if` with no `else` in `always @(*)`", "An accidental latch", "Assign a default first, or cover every case"], ["`=` in a clocked block", "Order-dependent behaviour", "Use `<=`"], ["A signal driven from two blocks", "Multiple drivers: X in simulation, or a synthesis error", "Drive each signal from one place"], ["A missing signal in `always @(a)`", "Simulation differs from hardware", "Use `always @(*)`"], ["`#10` delays in a design", "Ignored by synthesis", "Use a clock, and keep delays to testbenches"]] },
        { kind: "code", text: "// An accidental latch: y must remember its value when en is 0\nalways @(*) if (en) y = d;\n\n// Fixed: every path assigns y\nalways @(*) begin\n  y = 1'b0;\n  if (en) y = d;\nend", caption: "The most common beginner bug. The synthesis tool warns you, so read its warnings." },
        { kind: "practice", question: "What does `always @(*) if (sel) y = a;` create?", options: ["A 2:1 MUX", "A latch", "A flip-flop", "Nothing, because it's an error"], correctIndex: 1, explanation: "When `sel` is 0, y isn't assigned, so it has to hold its value. That needs memory: **a latch**." },
      ],
    },
    {
      id: "testbench",
      heading: "Testing with a testbench",
      blocks: [
        p("A **testbench** is a Verilog module with no ports. It creates the design, drives its inputs and checks its outputs. It only ever runs in simulation, so it can use delays and printing, which real hardware can't."),
        { kind: "code", text: "module tb;\n  reg  a = 0, b = 0;\n  wire sum, carry;\n  half_adder dut (.a(a), .b(b), .sum(sum), .carry(carry));\n\n  initial begin\n    a = 1; b = 1; #1;\n    if (sum !== 0 || carry !== 1) $display(\"FAIL\");\n    else                          $display(\"PASS\");\n    $finish;\n  end\nendmodule", caption: "A small self-checking testbench. `!==` compares exactly, so it also catches X and Z." },
        { kind: "link", href: "/sandbox", label: "Open the Sandbox", text: "Write Verilog and a testbench, simulate it with a real simulator, and see the waveform." },
      ],
    },
    {
      id: "flow",
      heading: "From code to chip",
      blocks: [
        { kind: "list", ordered: true, items: ["**Simulate:** check the behaviour with testbenches.", "**Synthesize:** the tool turns your Verilog into a netlist of gates and flip-flops, and minimizes it, using methods like the ones in Chapters 7 and 8.", "**Place and route:** decide where each cell goes and how to wire them.", "**Check timing:** every path must meet the setup and hold rules from Chapter 17.", "**Program or manufacture:** generate a bitstream for an FPGA, or masks for a chip."] },
        { kind: "callout", tone: "tip", text: "Everything from this course shows up in that list. Synthesis uses K-maps' ideas, timing analysis is Chapter 17, and FPGA mapping fills the LUTs from Chapter 18." },
        { kind: "link", href: "/flash", label: "Put a design on a real board", text: "Synthesize in your browser and flash an FPGA over USB." },
      ],
    },
    {
      id: "gate-verilog",
      heading: "Reading Verilog in exams and interviews",
      level: "gate",
      blocks: [
        p("Questions usually ask what a snippet does. Work out the signal values for each clock edge in a table, using the old values for all `<=` assignments. Interviewers love the two cases in this chapter's animation: a swap with `<=`, and what goes wrong with `=`."),
        { kind: "practice", gate: true, question: "After one clock edge with `a <= b; b <= a;`, starting at a = 0 and b = 1, what are a and b?", options: ["a = 1, b = 0", "a = 1, b = 1", "a = 0, b = 0", "a = 0, b = 1"], correctIndex: 0, explanation: "Both read the old values, so they **swap**." },
        { kind: "practice", gate: true, question: "After one clock edge with `a = b; b = a;`, starting at a = 0 and b = 1, what are a and b?", options: ["a = 1, b = 0", "a = 1, b = 1", "a = 0, b = 0", "a = 0, b = 1"], correctIndex: 1, explanation: "a becomes 1 at once, and then b reads that new a: **both are 1**." },
        { kind: "practice", gate: true, question: "How many flip-flops does `reg [7:0] count;` create if assigned in `always @(posedge clk)`?", options: ["1", "4", "8", "256"], correctIndex: 2, explanation: "One per bit: **8**." },
        { kind: "practice", gate: true, question: "What does `assign y = s ? a : b;` describe?", options: ["A latch", "A 2:1 MUX", "A flip-flop", "A decoder"], correctIndex: 1, explanation: "If s is 1 the output is a, or else b: **a 2:1 MUX**." },
      ],
    },
    {
      id: "next",
      heading: "Where to go from here",
      blocks: [
        p("You've gone from a single bit to a complete view of digital design. The best way to make it stick is to build things. Here are some ways to keep going."),
        { kind: "link", href: "/problems", label: "Solve Verilog problems", text: "Graded problems from a first wire up to full designs, with hidden tests." },
        { kind: "link", href: "/lab", label: "Build real hardware in the Board Lab", text: "LEDs, sensors, serial, and sound, simulated or on a real FPGA board." },
        { kind: "link", href: "/studio/challenges", label: "Take the circuit challenges", text: "Earn XP building circuits within a gate budget." },
        { kind: "link", href: "/academy/roadmap", label: "See the VLSI career roadmap", text: "RTL design, verification, DFT and physical design: what each job does, and how to prepare." },
      ],
    },
  ],
  quiz: [
    { id: "q1", question: "How do Verilog `assign` statements run?", options: ["All at once, in parallel", "Top to bottom", "Only at a clock edge", "Only once"], correctIndex: 0, explanation: "They describe gates, which are all active at once." },
    { id: "q2", question: "What does `always @(*)` describe, when written correctly?", options: ["Combinational logic", "A flip-flop", "A testbench", "A clock"], correctIndex: 0, explanation: "The output follows the inputs, with no memory." },
    { id: "q3", question: "What does `always @(posedge clk)` describe?", options: ["Flip-flops", "Combinational logic", "A latch", "A delay"], correctIndex: 0, explanation: "Assignments happen at the rising edge." },
    { id: "q4", question: "Which assignment should you use in a clocked block?", options: ["=", "<=", "assign", "=="], correctIndex: 1, explanation: "Nonblocking, so all flip-flops see the old values." },
    { id: "q5", question: "What creates an accidental latch?", options: ["An output left unassigned on some path of `always @(*)`", "Using `<=`", "A long case statement", "Using a clock"], correctIndex: 0, explanation: "The output has to remember its value on that path." },
    { id: "q6", question: "What does `reg` mean in Verilog?", options: ["Always a hardware register", "A variable assigned in an always block", "A clock", "A testbench"], correctIndex: 1, explanation: "It may become a wire or a flip-flop, depending on the block." },
    { id: "q7", question: "What is a testbench?", options: ["A module that drives and checks a design in simulation", "A circuit board", "The synthesis tool", "A kind of flip-flop"], correctIndex: 0, explanation: "It has no ports, and it never becomes hardware." },
    { id: "q8", question: "What does synthesis produce?", options: ["A netlist of gates and flip-flops", "A testbench", "A waveform", "A simulator"], correctIndex: 0, explanation: "Place and route then lays that netlist out." },
    { id: "q9", question: "Why isn't `#10` used in designs?", options: ["Synthesis ignores it", "It's too slow", "It causes latches", "It's not valid Verilog"], correctIndex: 0, explanation: "Hardware has no way to wait a chosen time, except by counting clocks." },
    { id: "q10", question: "What does `!==` catch that `!=` doesn't?", options: ["X and Z values", "Large numbers", "Negative numbers", "Clock edges"], correctIndex: 0, explanation: "It compares exactly, so an X doesn't quietly pass." },
  ],
  flashcards: [
    { id: "f1", front: "assign", back: "Continuous, combinational logic." },
    { id: "f2", front: "always @(*)", back: "Combinational logic, with =. Assign every output on every path." },
    { id: "f3", front: "always @(posedge clk)", back: "Flip-flops, with <=." },
    { id: "f4", front: "Blocking (=)", back: "Happens at once; later lines see the new value." },
    { id: "f5", front: "Nonblocking (<=)", back: "All right-hand sides read first, and all update together." },
    { id: "f6", front: "Accidental latch", back: "An output unassigned on some path of a combinational block." },
    { id: "f7", front: "reg", back: "A variable assigned in an always block, not necessarily a register." },
    { id: "f8", front: "Testbench", back: "A module with no ports that drives and checks a design." },
    { id: "f9", front: "Design flow", back: "Simulate, synthesize, place and route, check timing, program." },
    { id: "f10", front: "s ? a : b", back: "A 2:1 MUX." },
  ],
  videos: [],
};

export default chapter;
