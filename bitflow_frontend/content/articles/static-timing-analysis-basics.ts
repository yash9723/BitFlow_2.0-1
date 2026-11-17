import { p } from "@/lib/academy/draw";
import type { Article } from "@/lib/article-types";

const article: Article = {
  slug: "static-timing-analysis-basics",
  title: "Static timing analysis (STA) basics",
  description: "How static timing analysis checks every path in a design without simulation: timing paths, arrival and required time, slack, WNS and TNS, corners, and the SDC constraints that drive it.",
  published: "2026-11-17",
  readMinutes: 8,
  sections: [
    {
      id: "what",
      heading: "What STA does",
      blocks: [
        p("**Static timing analysis** checks that every signal in a synchronous design arrives in time, without running a single test vector. It adds up the delays along every path through the netlist and compares them with the clock period. Because it covers every path, it finds the slowest one even if no testbench ever exercises it."),
        p("Simulation checks that the design does the right thing; STA checks that it does it fast enough. A chip needs both."),
      ],
    },
    {
      id: "paths",
      heading: "Timing paths",
      blocks: [
        p("STA splits the design into paths, each starting at a launch point and ending at a capture point:"),
        { kind: "list", items: [
          "**Register to register:** clock pin of one flip-flop, through logic, to the D pin of another. Most paths are these.",
          "**Input to register:** a top-level input to a flip-flop, constrained with `set_input_delay`.",
          "**Register to output:** a flip-flop to a top-level output, constrained with `set_output_delay`.",
          "**Input to output:** pure combinational paths straight through the block.",
        ] },
      ],
    },
    {
      id: "slack",
      heading: "Arrival time, required time and slack",
      blocks: [
        { kind: "formula", text: "slack = required time − arrival time", note: "For setup. Positive slack means the path is fast enough; negative slack is a violation." },
        p("The **arrival time** is when the data actually reaches the capture pin: clock-to-Q plus every cell and wire delay on the path. The **required time** is the latest it may arrive: the next clock edge, minus the capturing flip-flop's setup time, adjusted for clock skew and uncertainty."),
        { kind: "example", title: "Reading one path", problem: "Clock period 10 ns, t_cq = 0.4 ns, logic = 7.9 ns, setup = 0.3 ns, clock uncertainty 0.2 ns.", steps: [
          "Arrival = 0.4 + 7.9 = 8.3 ns.",
          "Required = 10 − 0.3 − 0.2 = 9.5 ns.",
          "Slack = 9.5 − 8.3 = +1.2 ns.",
        ], answer: "The path meets setup with 1.2 ns to spare; the clock could run at about 1 / (10 − 1.2) ns ≈ 114 MHz." },
        p("Two summary numbers describe a whole design: **WNS** (worst negative slack, the single worst path) and **TNS** (total negative slack, the sum over all failing endpoints). WNS tells you how far off you are; TNS tells you how widespread the problem is."),
      ],
    },
    {
      id: "corners",
      heading: "Corners and hold",
      blocks: [
        p("Cell delays change with manufacturing **process**, **voltage** and **temperature** (PVT). STA runs at several **corners**: setup is usually worst at the slow corner (slow process, low voltage), hold at the fast corner. A design must pass both."),
        p("The hold check uses the **same** clock edge, so it doesn't depend on the clock period. A hold violation can't be fixed by slowing the clock."),
      ],
    },
    {
      id: "sdc",
      heading: "Constraints (SDC)",
      blocks: [
        p("STA only checks what you tell it about. The constraints, usually in SDC (Synopsys Design Constraints) format, define the clocks and the environment:"),
        { kind: "code", text: "create_clock -name clk -period 10 [get_ports clk]\nset_clock_uncertainty 0.2 [get_clocks clk]\nset_input_delay  2 -clock clk [all_inputs]\nset_output_delay 2 -clock clk [all_outputs]\nset_clock_groups -asynchronous -group clk -group clk_b   ;# a CDC boundary" },
        { kind: "callout", tone: "warning", text: "A missing constraint doesn't fail; it silently leaves paths unchecked. Always review the report of unconstrained paths." },
      ],
    },
    {
      id: "try-it",
      heading: "See it on your own design",
      blocks: [
        p("The Sandbox's ASIC panel runs OpenSTA on your design after synthesizing it to SkyWater 130 nm cells. It reports setup and hold slack, WNS, TNS, f_max and the critical path stage by stage, so you can see which lines of your Verilog are slow."),
        { kind: "link", href: "/sandbox", label: "Open the Sandbox", text: "Write Verilog, simulate it, and run the ASIC and FPGA flows on it." },
      ],
    },
  ],
  faq: [
    { q: "What is static timing analysis?", a: "Static timing analysis checks that every timing path in a synchronous circuit meets its setup and hold requirements by summing cell and wire delays, without simulating input vectors." },
    { q: "What is slack in STA?", a: "Slack is the required time minus the arrival time of a signal at a capture point. Positive slack means the timing is met; negative slack is a violation." },
    { q: "What are WNS and TNS?", a: "WNS (worst negative slack) is the slack of the single worst path. TNS (total negative slack) is the sum of negative slack over all failing endpoints, showing how widespread the violations are." },
    { q: "Why is STA better than timing simulation?", a: "Timing simulation only checks the paths the test vectors happen to exercise. STA checks every path exhaustively and is much faster, which is why it is used for timing signoff." },
  ],
  related: [
    { href: "/articles/setup-and-hold-time", label: "Setup and hold time" },
    { href: "/articles/rtl-to-gds-flow", label: "The RTL to GDS flow" },
    { href: "/articles/clock-domain-crossing", label: "Clock domain crossing" },
    { href: "/academy/timing", label: "Academy: Timing and Hazards" },
  ],
};
export default article;
