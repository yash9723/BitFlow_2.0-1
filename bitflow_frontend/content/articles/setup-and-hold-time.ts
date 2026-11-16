import { p } from "@/lib/academy/draw";
import type { Article } from "@/lib/article-types";

const article: Article = {
  slug: "setup-and-hold-time",
  title: "Setup and hold time explained (with worked examples)",
  description: "What setup and hold time are, the two timing equations every digital designer uses, a worked maximum-frequency example, how clock skew changes both, and how to fix each kind of violation.",
  published: "2026-11-15",
  readMinutes: 8,
  sections: [
    {
      id: "definitions",
      heading: "The definitions",
      blocks: [
        p("A flip-flop samples its D input at the clock edge, but it needs the input to be steady for a short window around that edge:"),
        { kind: "list", items: [
          "**Setup time (t_su):** how long D must be stable **before** the clock edge.",
          "**Hold time (t_h):** how long D must stay stable **after** the clock edge.",
          "**Clock-to-Q delay (t_cq):** how long after the edge the new value appears at Q.",
        ] },
        p("If D changes inside the setup-hold window, the flip-flop may capture the wrong value or go **metastable**: its output hovers between 0 and 1 for an unpredictable time before settling. Timing analysis exists to make sure that never happens between flip-flops on the same clock."),
      ],
    },
    {
      id: "equations",
      heading: "The two equations",
      blocks: [
        p("Picture one register launching data, a cloud of combinational logic, and a second register capturing it on the next edge."),
        { kind: "formula", text: "T_clk ≥ t_cq + t_logic,max + t_su", note: "Setup: the slowest path must arrive before the next edge, with t_su to spare." },
        { kind: "formula", text: "t_cq,min + t_logic,min ≥ t_h", note: "Hold: the fastest path must not reach the capturing flip-flop before its hold window from the same edge has closed." },
        p("Notice what is missing from the hold equation: the clock period. **A hold violation cannot be fixed by slowing the clock down.** A design with a hold violation fails at any frequency."),
      ],
    },
    {
      id: "worked-example",
      heading: "Worked example: maximum clock frequency",
      blocks: [
        { kind: "example", title: "How fast can this path run?", problem: "t_cq = 0.3 ns, the slowest logic path is 4.2 ns, the fastest is 0.05 ns, t_su = 0.5 ns, t_h = 0.1 ns, t_cq,min = 0.1 ns. Ignore skew.", steps: [
          "Setup: T_clk ≥ 0.3 + 4.2 + 0.5 = 5.0 ns.",
          "f_max = 1 / 5.0 ns = 200 MHz.",
          "Hold: t_cq,min + t_logic,min = 0.1 + 0.05 = 0.15 ns, which is ≥ t_h = 0.1 ns. Hold is met with 0.05 ns of slack.",
        ], answer: "The path runs at up to 200 MHz, and hold is met." },
      ],
    },
    {
      id: "skew",
      heading: "What clock skew does",
      blocks: [
        p("Clock skew (t_skew) is how much later the clock reaches the capturing flip-flop than the launching one. It helps one check and hurts the other:"),
        { kind: "formula", text: "T_clk ≥ t_cq + t_logic,max + t_su − t_skew", note: "Positive skew gives the slow path extra time." },
        { kind: "formula", text: "t_cq,min + t_logic,min ≥ t_h + t_skew", note: "…and takes the same amount away from the hold margin." },
        { kind: "example", title: "Same path, 0.1 ns of skew", problem: "Use the numbers above with t_skew = +0.1 ns.", steps: [
          "Setup: T_clk ≥ 5.0 − 0.1 = 4.9 ns, so f_max rises to about 204 MHz.",
          "Hold: 0.15 ns ≥ 0.1 + 0.1 = 0.2 ns is false. The path now has a hold violation of 0.05 ns.",
        ], answer: "Skew bought 4 MHz and broke hold. This is why clock trees are balanced so carefully." },
      ],
    },
    {
      id: "fixes",
      heading: "How to fix each violation",
      blocks: [
        { kind: "table", headers: ["", "Setup violation", "Hold violation"], rows: [
          ["Meaning", "The slow path is too slow for the clock", "The fast path is too fast"],
          ["Lower the clock frequency?", "Fixes it", "Does nothing"],
          ["Usual fixes", "Pipeline the path, restructure or simplify the logic, use faster cells, retime registers", "Insert delay (buffers) on the short path, reduce skew"],
          ["Found by", "Static timing analysis at the slow corner", "Static timing analysis at the fast corner"],
        ] },
        { kind: "callout", tone: "tip", text: "In RTL, the setup fix you control is pipelining: split a long combinational path with a register. BitFlow's 3-stage pipelined multiplier problem is exactly this trade: more latency, a much shorter critical path." },
      ],
    },
    {
      id: "metastability",
      heading: "Signals from another clock domain",
      blocks: [
        p("The equations above only work when both flip-flops share a clock. A signal from another clock domain, or a push button, can change at any moment, so it will eventually violate setup or hold. You cannot prevent that, so you contain it: pass the signal through **two flip-flops in a row** (a synchroniser) before using it. The first may go metastable; the second gives it a full clock period to settle."),
        { kind: "code", text: "reg s1, s2;\nalways @(posedge clk) begin\n  s1 <= async_in;   // may go metastable\n  s2 <= s1;         // safe to use\nend" },
        p("Multi-bit values need more than this, because the bits can be caught at different moments. That is what Gray-coded pointers in an asynchronous FIFO solve."),
      ],
    },
  ],
  faq: [
    { q: "What is setup time?", a: "The minimum time the data input of a flip-flop must be stable before the active clock edge so that it is captured correctly." },
    { q: "What is hold time?", a: "The minimum time the data input must remain stable after the active clock edge. If it changes sooner, the flip-flop may capture the new value or go metastable." },
    { q: "Can a hold violation be fixed by reducing the clock frequency?", a: "No. The hold check compares two delays from the same clock edge, so the clock period does not appear in it. Hold violations are fixed by adding delay to the fast path or reducing clock skew." },
    { q: "How do you calculate the maximum clock frequency?", a: "Find the minimum period T = t_cq + t_logic,max + t_su (minus any useful skew) over the slowest register-to-register path, then f_max = 1 / T." },
  ],
  related: [
    { href: "/academy/timing", label: "Academy: Timing and Hazards" },
    { href: "/problems/pipelined-multiplier-3stage", label: "Problem: 3-stage pipelined multiplier" },
    { href: "/articles/async-fifo-design", label: "Asynchronous FIFO design" },
    { href: "/studio/timing", label: "Timing diagram editor" },
  ],
};
export default article;
