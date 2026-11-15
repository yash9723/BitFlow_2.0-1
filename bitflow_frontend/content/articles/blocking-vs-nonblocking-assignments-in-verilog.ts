import { p } from "@/lib/academy/draw";
import type { Article } from "@/lib/article-types";

const article: Article = {
  slug: "blocking-vs-nonblocking-assignments-in-verilog",
  title: "Blocking vs nonblocking assignments in Verilog",
  description: "When to use = and when to use <= in Verilog, why mixing them breaks a design, and a step-by-step animation of two registers swapping.",
  published: "2026-11-09",
  readMinutes: 7,
  sections: [
    {
      id: "rule",
      heading: "The rule, first",
      blocks: [
        { kind: "list", items: [
          "In a **clocked** block (`always @(posedge clk)`), use **nonblocking** assignments: `q <= d;`",
          "In a **combinational** block (`always @(*)`), use **blocking** assignments: `y = a & b;`",
          "Do not mix the two styles in one block, and do not drive the same variable from two blocks.",
        ] },
        p("The rest of this page is why that rule exists. It comes from how Verilog simulators schedule assignments, and from what you want the hardware to do."),
      ],
    },
    {
      id: "what-they-do",
      heading: "What each one does",
      blocks: [
        { kind: "table", headers: ["", "Blocking `=`", "Nonblocking `<=`"], rows: [
          ["When the value changes", "Immediately, before the next line runs", "At the end of the current time step, after every right-hand side has been read"],
          ["Reads see", "The updated value", "The old value"],
          ["Models", "Wires and logic: results follow straight from inputs", "Flip-flops: every register samples at the same clock edge"],
        ] },
        p("A **blocking** assignment finishes before the next statement starts, so statements in a block behave like a program. A **nonblocking** assignment says \"this variable will take this value when the time step ends\". All the right-hand sides in the step are evaluated first, and only then do the updates land together. That is exactly how flip-flops on one clock behave."),
      ],
    },
    {
      id: "swap",
      heading: "The swap that shows the difference",
      blocks: [
        p("Start with a = 1 and b = 2 and ask for the two values to swap at a clock edge. Step through both versions."),
        { kind: "anim", id: "blocking-nonblocking" },
        { kind: "code", text: "// Swaps: the right-hand sides are read before either update lands\nalways @(posedge clk) begin\n  a <= b;\n  b <= a;\nend\n\n// Does not swap: a is already b by the time b reads it\nalways @(posedge clk) begin\n  a = b;\n  b = a;\nend" },
        p("With nonblocking, both sides are read first, so a gets 2 and b gets 1. With blocking, `a = b` changes a at once, and `b = a` then reads the new a: both end up 2. Real flip-flops behave like the first version, so use `<=` for registers."),
      ],
    },
    {
      id: "register",
      heading: "A register, line by line",
      blocks: [
        p("This animation steps a register with a synchronous reset. Watch which lines run, and notice that q only changes when clk rises, even while d changes in between."),
        { kind: "anim", id: "walk-register" },
      ],
    },
    {
      id: "shift-register",
      heading: "A classic mistake: the shift register",
      blocks: [
        { kind: "code", text: "// Intended: a 3-stage shift register\nalways @(posedge clk) begin\n  q1 = d;   // blocking\n  q2 = q1;\n  q3 = q2;\nend" },
        p("Because each line sees the new value from the line above, d runs through all three stages in one clock edge, and the design is a single register in disguise. With `<=` each stage takes the old value of the previous one, and the data moves one stage per clock, as intended."),
      ],
    },
    {
      id: "combinational",
      heading: "Why blocking in combinational blocks",
      blocks: [
        { kind: "code", text: "always @(*) begin\n  t = a & b;     // blocking: t is ready for the next line\n  y = t | c;\nend" },
        p("In combinational logic you want a later line to see the result of an earlier one, the same as a chain of gates. Blocking assignments do that. Using `<=` here can make a simulation read stale values and disagree with the synthesised hardware."),
        { kind: "callout", tone: "warning", text: "Also give every output a value on every path through a combinational block (include the else branch and a default in case statements). Otherwise the tool infers a latch, which is rarely what you meant." },
      ],
    },
  ],
  faq: [
    { q: "Which assignment should I use in an always @(posedge clk) block?", a: "Nonblocking (<=). It makes every register sample the old values at the clock edge and update together, which is how flip-flops behave." },
    { q: "Which assignment should I use in an always @(*) block?", a: "Blocking (=). Combinational logic should let a later statement see the result of an earlier one, like a chain of gates." },
    { q: "What happens if I mix blocking and nonblocking in the same block?", a: "Simulation can disagree with the hardware that gets synthesised, and the results can depend on the order of statements. Keep one style per block." },
  ],
  related: [
    { href: "/academy/gates-to-verilog", label: "Academy: From Gates to Verilog" },
    { href: "/articles/combinational-vs-sequential-logic", label: "Combinational vs sequential logic" },
    { href: "/articles/what-is-verilog", label: "What is Verilog?" },
  ],
};
export default article;
