import { p } from "@/lib/academy/draw";
import type { Article } from "@/lib/article-types";

const article: Article = {
  slug: "verilog-vs-vhdl",
  title: "Verilog vs VHDL: which should you learn?",
  description: "Both describe digital hardware and both are IEEE standards. How they differ in style, typing and where each is common, and how to choose.",
  published: "2026-11-09",
  readMinutes: 6,
  sections: [
    {
      id: "same-job",
      heading: "They do the same job",
      blocks: [
        p("Verilog and VHDL are both **hardware description languages**. You can describe the same circuits in either one, simulate them, and synthesise them for an FPGA or a chip. Neither is more capable of describing hardware than the other. The differences are in style, in how strictly they check your code, and in who uses them."),
        p("Both are IEEE standards: VHDL is IEEE 1076, and Verilog is IEEE 1364 with its successor SystemVerilog as IEEE 1800."),
      ],
    },
    {
      id: "side-by-side",
      heading: "The same circuit in both",
      blocks: [
        { kind: "code", text: "// Verilog\nmodule and2 (input wire a, input wire b, output wire y);\n  assign y = a & b;\nendmodule", caption: "A 2-input AND gate in Verilog." },
        { kind: "code", text: "-- VHDL\nlibrary ieee;\nuse ieee.std_logic_1164.all;\n\nentity and2 is\n  port (a, b : in std_logic;\n        y    : out std_logic);\nend entity;\n\narchitecture rtl of and2 is\nbegin\n  y <= a and b;\nend architecture;", caption: "The same gate in VHDL: an entity for the ports and an architecture for what it does." },
        p("The VHDL is longer. That is typical: VHDL is verbose and explicit, and Verilog is compact and C-like."),
      ],
    },
    {
      id: "differences",
      heading: "How they differ",
      blocks: [
        { kind: "table", headers: ["", "Verilog / SystemVerilog", "VHDL"], rows: [
          ["Look and feel", "Short, like C", "Longer, like Ada or Pascal"],
          ["Typing", "Loose: widths are adjusted for you, which is convenient and can hide mistakes", "Strict: mismatched types or widths are errors, which catches mistakes early"],
          ["Case", "Case sensitive", "Not case sensitive"],
          ["Verification", "SystemVerilog is the basis of the UVM methodology", "Verification is done with VHDL testbenches and libraries, or with other tools such as cocotb"],
          ["Open-source tools", "Icarus Verilog, Verilator, Yosys", "GHDL, Yosys (with a plugin)"],
        ] },
        { kind: "callout", tone: "note", text: "Strict typing is the reason many people call VHDL safer and many others call it tedious. Both views have something to them." },
      ],
    },
    {
      id: "who-uses",
      heading: "Where each is used",
      blocks: [
        p("This varies by industry and region, so treat it as a tendency and not a rule. Verilog and SystemVerilog are very common in chip design and verification, especially where UVM is used. VHDL is common in many FPGA, defence and aerospace teams and in some European companies and universities. Large projects sometimes mix both, and tools support that."),
        p("The best guide is local: what your course, your target job or your FPGA vendor's examples use."),
      ],
    },
    {
      id: "choose",
      heading: "Which should you learn first?",
      blocks: [
        { kind: "list", items: [
          "If you are headed for chip design or verification, start with Verilog and then SystemVerilog.",
          "If your course or employer uses VHDL, start there. The ideas transfer.",
          "If you have no constraint, Verilog is quicker to get started with and has more small examples, and BitFlow's lessons use it.",
        ] },
        p("What matters most is the thinking, not the syntax: hardware runs in parallel, registers change on clock edges, and every signal has a width. Once you have that, picking up the second language takes days, not months."),
        { kind: "link", href: "/academy/gates-to-verilog", label: "From Gates to Verilog", text: "Start with the concepts that apply to both languages." },
      ],
    },
  ],
  faq: [
    { q: "Is VHDL harder than Verilog?", a: "VHDL has more to type and is stricter about types, so the first steps feel slower. Verilog is shorter but lets some mistakes through. Many learners find the concepts, not the language, are the hard part." },
    { q: "Can I use both in one project?", a: "Yes. Most professional synthesis and simulation tools support mixed-language designs, so a Verilog module can instantiate a VHDL one and the other way round." },
    { q: "Which one is more used in industry?", a: "It depends on the industry and the region. Verilog and SystemVerilog are common in chip design and verification, while VHDL is common in many FPGA, defence and aerospace teams." },
  ],
  related: [
    { href: "/articles/what-is-verilog", label: "What is Verilog?" },
    { href: "/academy/gates-to-verilog", label: "Academy: From Gates to Verilog" },
    { href: "/problems", label: "Practice problems" },
  ],
};
export default article;
