import { p } from "@/lib/academy/draw";
import type { Article } from "@/lib/article-types";

const article: Article = {
  slug: "combinational-vs-sequential-logic",
  title: "Combinational vs sequential logic",
  description: "Combinational logic depends only on its current inputs; sequential logic also remembers. How to tell them apart, how each is written in Verilog, and why it matters.",
  published: "2026-11-09",
  readMinutes: 6,
  sections: [
    {
      id: "difference",
      heading: "The difference in one sentence",
      blocks: [
        p("**Combinational logic** has outputs that depend only on the inputs right now. **Sequential logic** has outputs that also depend on what happened before, because it contains memory. If the same inputs can give different outputs at different times, the circuit is sequential."),
        { kind: "table", headers: ["", "Combinational", "Sequential"], rows: [
          ["Memory", "None", "Yes (flip-flops, latches)"],
          ["Output depends on", "Current inputs", "Current inputs and stored state"],
          ["Clock", "Not needed", "Usually clocked"],
          ["Examples", "Gates, adders, multiplexers, decoders", "Registers, counters, state machines, memories"],
        ] },
      ],
    },
    {
      id: "comb-verilog",
      heading: "Combinational logic in Verilog",
      blocks: [
        p("Use `assign`, or an `always @(*)` block with blocking assignments. The output follows the inputs. Step through this multiplexer: every change to an input wakes the block again."),
        { kind: "anim", id: "walk-mux-always" },
        { kind: "callout", tone: "warning", text: "In an always @(*) block, give every output a value on every path (an else branch, a default in case). If one path leaves an output unassigned, the output has to remember its old value, and the tool builds a latch you did not intend." },
      ],
    },
    {
      id: "seq-verilog",
      heading: "Sequential logic in Verilog",
      blocks: [
        p("Use `always @(posedge clk)` with nonblocking assignments. The value is stored at each rising edge and held until the next one. This counter remembers where it is, and the output depends on the history of edges."),
        { kind: "anim", id: "walk-counter" },
        p("The difference between a latch and a flip-flop matters too: a latch follows its input while enabled, a flip-flop captures it at an edge."),
        { kind: "anim", id: "latch-vs-ff" },
      ],
    },
    {
      id: "together",
      heading: "How real designs combine them",
      blocks: [
        p("Nearly every synchronous design is registers connected by combinational logic. On each clock edge the registers capture the results of the logic between them. The clock period has to be long enough for the slowest path of gates to settle, which is what limits how fast a design can run."),
        { kind: "link", href: "/academy/sequential", label: "Latches and Flip-Flops", text: "The Academy chapter on how a circuit remembers." },
        { kind: "link", href: "/academy/combinational", label: "Multiplexers, Decoders and Encoders", text: "The blocks that route and translate data." },
      ],
    },
  ],
  faq: [
    { q: "Is a multiplexer combinational or sequential?", a: "Combinational. Its output depends only on its data and select inputs at that moment, and it has no memory." },
    { q: "Is a counter combinational or sequential?", a: "Sequential. It stores its current count in flip-flops and changes it at each clock edge, so its next output depends on its past." },
    { q: "What is an inferred latch?", a: "An unintended memory element created when a combinational always block does not assign an output on every path. Add an else branch or a default to avoid it." },
  ],
  related: [
    { href: "/articles/blocking-vs-nonblocking-assignments-in-verilog", label: "Blocking vs nonblocking assignments" },
    { href: "/academy/sequential", label: "Academy: Latches and Flip-Flops" },
    { href: "/academy/counters", label: "Academy: Counters" },
  ],
};
export default article;
