import { p } from "@/lib/academy/draw";
import type { Article } from "@/lib/article-types";

const article: Article = {
  slug: "verilog-interview-questions",
  title: "Verilog interview questions and answers (RTL design)",
  description: "The Verilog and digital-design questions that come up most in RTL, FPGA and VLSI interviews, with short, correct answers and code, from blocking assignments to CDC and FIFOs.",
  published: "2026-11-15",
  readMinutes: 12,
  sections: [
    {
      id: "how-to-use",
      heading: "How to use this list",
      blocks: [
        p("These are the questions interviewers for RTL design, FPGA and VLSI front-end roles ask again and again. Each answer is the short version you would say out loud, followed by the detail that shows you understand it. Where there is a BitFlow problem for it, write the code there: interviewers increasingly ask you to write and debug Verilog live."),
      ],
    },
    {
      id: "language",
      heading: "Language basics",
      blocks: [
        { kind: "example", title: "1. What is the difference between blocking (=) and nonblocking (<=) assignments?", problem: "The classic opener, and the source of many simulation-versus-hardware bugs.", steps: [
          "A blocking assignment updates the variable immediately, so the next statement sees the new value.",
          "A nonblocking assignment schedules the update for the end of the time step; every right-hand side in the step is read first.",
          "Use <= in clocked blocks (it models flip-flops sampling together) and = in combinational always @(*) blocks.",
        ], answer: "Nonblocking for sequential logic, blocking for combinational logic, never mixed in one block." },
        { kind: "example", title: "2. What is the difference between wire and reg?", problem: "Often followed by: does reg mean a register?", steps: [
          "A wire is a net driven continuously by an assign or a module output; it holds no value of its own.",
          "A reg is a variable assigned inside an always or initial block.",
          "reg does not mean flip-flop: a reg assigned in always @(*) synthesises to plain combinational logic. (SystemVerilog's logic type replaces both in most code.)",
        ], answer: "The difference is how a signal is assigned, not what hardware it becomes." },
        { kind: "example", title: "3. What is the difference between == and ===?", problem: "Tests whether you know Verilog's four-state values (0, 1, X, Z).", steps: [
          "== is logical equality: if either side has an X or Z bit, the result is X.",
          "=== is case equality: it compares X and Z literally and always returns 0 or 1.",
          "=== is for testbenches; it is not synthesisable as a comparison against X or Z.",
        ], answer: "== can return X; === never does." },
        { kind: "example", title: "4. What is the difference between parameter and localparam?", problem: "Comes up when you write a reusable, configurable module.", steps: [
          "A parameter can be overridden when the module is instantiated (#(.WIDTH(16))).",
          "A localparam cannot be overridden; use it for constants derived inside the module, such as state encodings.",
        ], answer: "parameter is an input to the module; localparam is internal." },
        { kind: "example", title: "5. What do $display, $strobe and $monitor do differently?", problem: "A testbench question about when values are printed.", steps: [
          "$display prints immediately, when the statement runs, so it can show values before nonblocking updates land.",
          "$strobe prints at the end of the time step, after nonblocking updates.",
          "$monitor prints whenever any of its arguments changes.",
        ], answer: "Use $strobe to see the values registers actually settled to." },
      ],
    },
    {
      id: "synthesis",
      heading: "Synthesis and hardware",
      blocks: [
        { kind: "example", title: "6. What causes an unintended latch, and how do you avoid it?", problem: "Probably the most common debugging question.", steps: [
          "A combinational always block that does not assign a signal on every path: an if without an else, or a case without a default.",
          "The tool must remember the old value, so it builds a latch.",
          "Fix: assign every output a default at the top of the block, then override it.",
        ], answer: "Incomplete assignment in combinational logic infers a latch." },
        { kind: "example", title: "7. Which Verilog constructs are not synthesisable?", problem: "Checks that you know the difference between describing hardware and describing a simulation.", steps: [
          "Delays (#10), initial blocks in most ASIC flows (FPGAs can use them for power-up values), $display and other system tasks, force/release, and loops whose bounds are not constant.",
          "Real-valued arithmetic and === against X or Z.",
        ], answer: "Anything that describes simulation behaviour rather than hardware structure." },
        { kind: "example", title: "8. What is the difference between case, casez and casex?", problem: "Asked alongside priority encoders and instruction decoders.", steps: [
          "case matches exactly, including X and Z.",
          "casez treats Z (and ?) in the item as don't-care.",
          "casex treats both X and Z as don't-care, which can hide X bugs in simulation; prefer casez or SystemVerilog's case inside.",
        ], answer: "Use casez for wildcard matching; avoid casex." },
        { kind: "example", title: "9. Synchronous or asynchronous reset: which and why?", problem: "There is no single right answer; the trade-offs are what is being tested.", steps: [
          "Synchronous reset is sampled at the clock edge: simpler timing and immune to glitches, but it needs the clock running.",
          "Asynchronous reset acts immediately and works without a clock, but its release must be synchronised to avoid metastability (assert asynchronously, de-assert synchronously).",
        ], answer: "Either is fine if used consistently; the common ASIC answer is async assert, sync de-assert." },
      ],
    },
    {
      id: "timing-cdc",
      heading: "Timing and clock domains",
      blocks: [
        { kind: "example", title: "10. What are setup and hold time?", problem: "Usually followed by a maximum-frequency calculation.", steps: [
          "Setup: how long data must be stable before the clock edge. Hold: how long after.",
          "Setup limits the maximum frequency: T ≥ t_cq + t_logic + t_su.",
          "Hold does not depend on the clock period, so a hold violation cannot be fixed by slowing the clock.",
        ], answer: "See the full article on setup and hold time for worked numbers." },
        { kind: "example", title: "11. What is metastability and how do you handle it?", problem: "The core of every clock-domain-crossing question.", steps: [
          "When a flip-flop samples an input that changes inside its setup-hold window, its output can hover between 0 and 1 for an unbounded time.",
          "For a single-bit signal crossing clock domains, use a two-flip-flop synchroniser: the second flop gives the first a full cycle to resolve.",
        ], answer: "It cannot be prevented, only made improbable enough by synchronising." },
        { kind: "example", title: "12. How do you pass a multi-bit value between clock domains?", problem: "The follow-up to metastability.", steps: [
          "Not by synchronising each bit: the bits can be caught at different times.",
          "Use an asynchronous FIFO (Gray-coded pointers), a handshake (req/ack) with the data held stable, or Gray code for counters that change by one.",
        ], answer: "Asynchronous FIFO for streams, handshake for occasional values." },
      ],
    },
    {
      id: "design",
      heading: "Write-the-code questions",
      blocks: [
        { kind: "example", title: "13. Write a rising-edge detector.", problem: "Output a one-cycle pulse when a synchronous input goes from 0 to 1.", steps: [
          "Register the input once to remember its previous value.",
          "The pulse is the current value AND NOT the previous one.",
        ], answer: "One flip-flop and one AND gate, shown below." },
        { kind: "code", text: "module rise_detect (input clk, input x, output rise);\n  reg x_d;\n  always @(posedge clk) x_d <= x;\n  assign rise = x & ~x_d;\nendmodule" },
        { kind: "link", href: "/problems/edge-detector", label: "Try it: edge detector", text: "Write and simulate it against BitFlow's tests." },
        { kind: "example", title: "14. Design a sequence detector for 1011.", problem: "Expect follow-ups: overlapping or not, Moore or Mealy.", steps: [
          "Draw states for each matched prefix: S0, S1, S10, S101, and S1011 for Moore.",
          "Work out where each state goes on 0 and on 1, keeping the longest suffix that is still a prefix (that handles overlap).",
          "Write a state register plus combinational next-state and output logic.",
        ], answer: "Five states for Moore, four for Mealy. The FSM article has both in full." },
        { kind: "example", title: "15. Why use a FIFO, and how deep should it be?", problem: "A system-level question that tests whether you think about rates, not just logic.", steps: [
          "A FIFO absorbs rate differences between a producer and a consumer, often across clock domains.",
          "Depth ≈ burst length × (1 − read rate / write rate), rounded up to a power of two with margin for synchroniser latency.",
        ], answer: "Size it from the worst-case burst, not the average rate." },
      ],
    },
    {
      id: "practice",
      heading: "Practise under interview conditions",
      blocks: [
        p("Reading answers is not the same as writing working RTL with someone watching. BitFlow's mock interviews give you a timed problem and grade your Verilog against hidden tests, the way an online assessment does."),
        { kind: "link", href: "/interview", label: "Start a mock interview", text: "Timed RTL problems with automatic grading." },
      ],
    },
  ],
  faq: [
    { q: "What Verilog questions are asked in RTL design interviews?", a: "The most common are blocking vs nonblocking assignments, wire vs reg, latch inference, setup and hold time, metastability and clock-domain crossing, FSM design such as a sequence detector, and FIFO design and sizing." },
    { q: "What is the difference between blocking and nonblocking assignments in Verilog?", a: "Blocking (=) updates immediately so later statements see the new value; nonblocking (<=) updates at the end of the time step after all right-hand sides are read. Use nonblocking in clocked blocks and blocking in combinational blocks." },
    { q: "How do you avoid latches in Verilog?", a: "In every combinational always block, assign each output on every path: give each signal a default value at the top of the block, include else branches, and add a default to every case statement." },
    { q: "How do you safely cross clock domains in Verilog?", a: "Use a two-flip-flop synchroniser for single-bit signals, and an asynchronous FIFO with Gray-coded pointers or a request/acknowledge handshake for multi-bit data." },
  ],
  related: [
    { href: "/articles/blocking-vs-nonblocking-assignments-in-verilog", label: "Blocking vs nonblocking assignments" },
    { href: "/articles/fsm-in-verilog", label: "How to write an FSM in Verilog" },
    { href: "/articles/setup-and-hold-time", label: "Setup and hold time explained" },
    { href: "/articles/async-fifo-design", label: "Asynchronous FIFO design" },
  ],
};
export default article;
