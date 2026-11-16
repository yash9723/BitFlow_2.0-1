import { p } from "@/lib/academy/draw";
import type { Article } from "@/lib/article-types";

const article: Article = {
  slug: "systemverilog-vs-verilog",
  title: "SystemVerilog vs Verilog: what's the difference?",
  description: "SystemVerilog is a superset of Verilog. What it adds for RTL design (logic, always_ff, enums, structs, interfaces) and for verification (classes, constrained random, assertions, coverage), and which to learn first.",
  published: "2026-11-15",
  readMinutes: 7,
  sections: [
    {
      id: "short-answer",
      heading: "The short answer",
      blocks: [
        p("**SystemVerilog is Verilog with a lot added.** Since 2009 the two have been one standard, IEEE 1800, and every Verilog-2005 design is legal SystemVerilog. The additions fall into two groups:"),
        { kind: "list", items: [
          "**For design (RTL):** clearer types and blocks that let the tools catch mistakes, such as `logic`, `always_ff`, `always_comb`, `enum`, `struct`, packages and interfaces. These are synthesisable.",
          "**For verification:** object-oriented testbenches, constrained-random stimulus, assertions (SVA) and functional coverage. These run in simulation only, and are the foundation of UVM.",
        ] },
        p("If you are learning digital design, start with Verilog: it is smaller, and everything in it carries over. Then pick up the SystemVerilog design features, which take an afternoon. The verification half is a field of its own."),
      ],
    },
    {
      id: "design-features",
      heading: "What SystemVerilog adds for design",
      blocks: [
        { kind: "table", headers: ["Verilog", "SystemVerilog", "Why it helps"], rows: [
          ["`wire` / `reg`", "`logic`", "One type for almost everything; no more guessing which keyword a signal needs"],
          ["`always @(posedge clk)`", "`always_ff @(posedge clk)`", "The tool checks that the block really describes flip-flops"],
          ["`always @(*)`", "`always_comb`", "Warns if the block would infer a latch; sensitivity is automatic"],
          ["`localparam` state codes", "`enum`", "Named states, shown by name in waveforms, with checked assignments"],
          ["Separate signals", "`struct packed`", "Group related fields, such as a packet header, into one signal"],
          ["Repeated port lists", "`interface`", "Bundle a whole bus (valid, ready, data…) and connect it in one line"],
          ["`include` files", "`package`", "Share types, constants and functions between modules with proper scoping"],
        ] },
        { kind: "code", text: "// Verilog\nlocalparam IDLE = 2'd0, RUN = 2'd1;\nreg [1:0] state;\nalways @(posedge clk) state <= rst ? IDLE : next;\n\n// SystemVerilog\ntypedef enum logic [1:0] {IDLE, RUN} state_t;\nstate_t state;\nalways_ff @(posedge clk) state <= rst ? IDLE : next;", caption: "The same state register in both languages" },
      ],
    },
    {
      id: "verification-features",
      heading: "What SystemVerilog adds for verification",
      blocks: [
        { kind: "list", items: [
          "**Classes:** object-oriented testbenches with inheritance, the base of UVM.",
          "**Constrained random:** `rand` variables and `constraint` blocks generate legal but unexpected stimulus automatically.",
          "**Assertions (SVA):** properties such as \"every request gets a grant within 4 cycles\", checked every cycle in simulation and usable by formal tools.",
          "**Functional coverage:** `covergroup`s record which scenarios the tests actually exercised, so you know when you are done.",
          "**Mailboxes, semaphores, queues and dynamic arrays** for building testbench components that talk to each other.",
        ] },
        { kind: "code", text: "// An assertion: req must be followed by gnt within 1 to 4 cycles\nassert property (@(posedge clk) disable iff (rst)\n  req |-> ##[1:4] gnt);" },
      ],
    },
    {
      id: "comparison",
      heading: "Side by side",
      blocks: [
        { kind: "table", headers: ["", "Verilog", "SystemVerilog"], rows: [
          ["Standard", "IEEE 1364 (last revision 2005)", "IEEE 1800 (absorbed IEEE 1364 in 2009)"],
          ["Relationship", "The base language", "A superset: all Verilog is valid SystemVerilog"],
          ["Used for", "RTL design, simple testbenches", "RTL design and industrial verification (UVM)"],
          ["File extension", ".v", ".sv"],
          ["Learning curve", "Small", "Design part small; verification part large"],
          ["Jobs that expect it", "FPGA and RTL design", "RTL design, and nearly every verification role"],
        ] },
      ],
    },
    {
      id: "which-first",
      heading: "Which should you learn first?",
      blocks: [
        { kind: "list", ordered: true, items: [
          "**Verilog first**, for the hardware concepts: modules, always blocks, blocking vs nonblocking, FSMs, testbenches.",
          "**SystemVerilog design features next:** `logic`, `always_ff`, `always_comb`, `enum`, `struct`. Use them in all new RTL.",
          "**SystemVerilog verification** if you are heading for a verification role: classes, constrained random, SVA, coverage, then UVM.",
        ] },
        { kind: "callout", tone: "tip", text: "BitFlow's Verilog generators can emit either language for the same block (FIFOs, UART, SPI, arbiters, CDC synchronisers), which is a quick way to compare the two styles on real designs." },
      ],
    },
  ],
  faq: [
    { q: "Is SystemVerilog the same as Verilog?", a: "No, but it contains it. SystemVerilog (IEEE 1800) is a superset of Verilog: every Verilog design is valid SystemVerilog, and SystemVerilog adds design features such as logic, always_ff and enum, plus verification features such as classes, constrained random, assertions and coverage." },
    { q: "Should I learn Verilog or SystemVerilog first?", a: "Learn Verilog first for the core hardware concepts, then add SystemVerilog's design features. Learn SystemVerilog's verification features and UVM if you are aiming for a verification role." },
    { q: "Is SystemVerilog synthesisable?", a: "Its design subset is: logic, always_ff, always_comb, enum, struct, packages and interfaces are supported by synthesis tools. Classes, randomisation and coverage are for simulation only." },
    { q: "Is Verilog still used?", a: "Yes. Much RTL is still written in Verilog-2005 style, and the language lives on inside SystemVerilog, which is what most new design and verification code uses." },
  ],
  related: [
    { href: "/articles/what-is-verilog", label: "What is Verilog?" },
    { href: "/articles/verilog-vs-vhdl", label: "Verilog vs VHDL" },
    { href: "/studio/generators", label: "Verilog and SystemVerilog generators" },
    { href: "/studio/testbench", label: "Testbench generator" },
  ],
};
export default article;
