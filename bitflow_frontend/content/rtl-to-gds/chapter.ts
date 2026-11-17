import { p } from "@/lib/academy/draw";
import type { AcademyTopic } from "@/lib/academy-types";

const chapter: AcademyTopic = {
  slug: "rtl-to-gds",
  title: "From RTL to GDS",
  summary: "How your Verilog becomes a manufacturable chip: synthesis, floorplan, placement, clock tree, routing, signoff and the GDS file sent to the foundry.",
  icon: "▦",
  difficulty: "advanced",
  order: 21,
  estimatedMinutes: 45,
  prerequisites: ["timing", "gates-to-verilog"],
  sections: [
    {
      id: "big-picture",
      heading: "The big picture",
      blocks: [
        p("In the last chapter you described circuits in Verilog. A chip factory can't read Verilog. It needs a **layout**: the exact shape of every transistor and wire, layer by layer, stored in a **GDSII** file. The chain of tools in between is the **RTL to GDS flow**, and the people who run its back half are **physical design engineers**."),
        { kind: "table", headers: ["Step", "What it decides", "Result"], rows: [
          ["Synthesis", "Which gates", "Netlist of standard cells"],
          ["Floorplan", "How big, where the pins and power go", "Die, core, rows, power grid"],
          ["Placement", "Where each gate sits", "Every cell at an (x, y)"],
          ["Clock tree synthesis", "How the clock reaches every flip-flop", "Balanced buffer tree"],
          ["Routing", "Which wires, on which metal layers", "Connected layout"],
          ["Signoff", "Is it fast enough, manufacturable, and correct?", "Clean STA, DRC and LVS"],
          ["GDS export", "Nothing new: write it out", "GDSII file → tape-out"],
        ] },
        { kind: "anim", id: "chip-layers-3d" },
      ],
    },
    {
      id: "synthesis",
      heading: "Synthesis",
      blocks: [
        p("A foundry offers a **standard cell library**: a few hundred pre-drawn gates (NAND2, NOR3, flip-flops, buffers) in several drive strengths, all the same height so they line up in rows. Each cell has a **liberty** file entry with its area, its delay for each input slope and output load, and its power."),
        p("**Synthesis** turns your RTL into a **netlist** that uses only those cells. It first builds generic logic, optimises it (the Boolean algebra and K-map ideas from earlier chapters, done by algorithms), then **maps** it onto real cells, picking bigger, faster cells for critical paths and small ones elsewhere."),
        { kind: "code", text: "// RTL\nassign y = ~(a & b);\n\n// after synthesis (Sky130)\nsky130_fd_sc_hd__nand2_1 U1 (.A(a), .B(b), .Y(y));", caption: "One line of RTL, one standard cell. A real design maps to thousands." },
      ],
    },
    {
      id: "floorplan",
      heading: "Floorplanning and power",
      blocks: [
        p("Before placing anything, the floorplan fixes the **die** (the whole chip), the **core** (the area where cells go), the standard-cell **rows**, the I/O pin positions, and any large blocks such as memories."),
        p("It also builds the **power distribution network**: a grid of wide VDD and VSS straps on the top metal layers, connected down to rails along every row. If the grid is too thin, the voltage sags under load (**IR drop**) and cells slow down."),
        { kind: "formula", text: "utilization = total cell area ÷ core area", note: "Typically 40–70%. The rest is room for the router and for buffers added later." },
      ],
    },
    {
      id: "placement",
      heading: "Placement",
      blocks: [
        p("**Global placement** treats the netlist like a system of springs: connected cells pull together, crowded regions push apart, and the solver finds positions that keep wires short. **Legalisation** and **detailed placement** then snap every cell into a row slot with no overlaps."),
        p("Placement is **timing-driven**: the tool knows which paths are critical (from static timing analysis) and pulls their cells closer, because wire length is delay."),
      ],
    },
    {
      id: "cts",
      heading: "Clock tree synthesis",
      blocks: [
        p("Until now the clock was ideal: it reached every flip-flop at the same instant. Real clock nets drive thousands of flip-flops, far too much load for one wire. **CTS** builds a tree of buffers so that every flip-flop gets a sharp clock edge at nearly the same time."),
        p("The leftover difference in arrival times is **skew**. You met its effect in the timing chapter: skew helps setup on some paths and hurts hold on others. After CTS, tools fix hold violations by inserting delay buffers on paths that are now too fast."),
        { kind: "anim", id: "timing-budget" },
      ],
    },
    {
      id: "routing",
      heading: "Routing",
      blocks: [
        p("A chip has a stack of metal layers separated by insulator and joined by **vias**. Lower layers are thin and used for short local connections; upper layers are thick, for long wires, clocks and power. Each layer prefers one direction (horizontal or vertical), alternating up the stack."),
        p("**Global routing** plans which region and layer each net uses and spots congestion. **Detailed routing** then draws exact tracks and vias that obey every **design rule**: minimum width, minimum spacing, via overlap. After routing, the real resistance and capacitance of every wire are **extracted** and timing is recomputed."),
        { kind: "callout", tone: "note", text: "On advanced nodes wire delay can exceed gate delay. That's why placement, CTS and routing all care about timing, not just connectivity." },
      ],
    },
    {
      id: "signoff",
      heading: "Signoff and tape-out",
      blocks: [
        { kind: "list", items: [
          "**STA:** every path meets setup and hold at every process, voltage and temperature corner, using the extracted wire delays.",
          "**DRC:** the layout obeys all of the foundry's geometric rules.",
          "**LVS:** the transistors and connections in the layout match the netlist exactly.",
          "**Antenna, density, ERC:** manufacturing hazards are fixed.",
        ] },
        p("When everything is clean, the layout is written as **GDSII** and sent to the foundry: **tape-out**. The name dates from when the file was literally written to magnetic tape."),
      ],
    },
    {
      id: "open-source",
      heading: "Doing it yourself",
      blocks: [
        p("All of this used to need million-dollar tools. Today an open-source flow covers every step on the **SkyWater 130 nm** process: **Yosys** for synthesis, **OpenROAD** for floorplan, placement, CTS and routing, **OpenSTA** for timing, **Magic** and **KLayout** for DRC and GDS, **Netgen** for LVS. **OpenLane** wraps them into one script, and **TinyTapeout** puts small community designs on a real shuttle."),
        { kind: "link", href: "/sandbox", label: "Run synthesis and STA on your own design", text: "The Sandbox's ASIC panel maps your Verilog to Sky130 cells and reports area, critical path and f_max. The TinyTapeout export packages it for a real chip." },
        { kind: "link", href: "/articles/rtl-to-gds-flow", label: "Read: the RTL to GDS flow, step by step", text: "A shorter reference version of this chapter, with the open-source tool for each step." },
      ],
    },
    {
      id: "check",
      heading: "Check your understanding",
      blocks: [
        { kind: "practice", question: "Which step first gives a design real wire delays?", options: ["Synthesis", "Placement", "Routing and parasitic extraction", "GDS export"], correctIndex: 2, explanation: "Synthesis and placement only estimate wires. Real wire resistance and capacitance are known once the wires are drawn and extracted after routing." },
        { kind: "practice", question: "After clock tree synthesis, a path that met hold before now fails it. What is the usual fix?", options: ["Lower the clock frequency", "Insert delay buffers on the short path", "Increase utilization", "Re-run synthesis with a faster library"], correctIndex: 1, explanation: "Hold doesn't depend on the clock period, so slowing the clock does nothing. Adding delay to the fast path restores the hold margin." },
        { kind: "practice", question: "What does LVS check?", options: ["That every path meets timing", "That the layout obeys spacing and width rules", "That the layout's devices and connections match the netlist", "That the power grid has low IR drop"], correctIndex: 2, explanation: "Layout versus schematic extracts the circuit from the drawn layout and compares it with the netlist. Spacing and width rules are DRC." },
      ],
    },
  ],
  quiz: [
    { id: "q1", question: "What does synthesis produce?", options: ["A netlist of standard cells", "A GDSII layout", "A placed design", "A clock tree"], correctIndex: 0, explanation: "Synthesis maps RTL onto library cells; nothing has a position yet." },
    { id: "q2", question: "What is utilization?", options: ["Cell area divided by core area", "Clock period divided by delay", "Used metal layers divided by all layers", "Flip-flops divided by gates"], correctIndex: 0, explanation: "Leaving room between cells gives the router space and lets the tool add buffers." },
    { id: "q3", question: "Why does a chip need clock tree synthesis?", options: ["One wire can't drive thousands of flip-flops with a sharp, simultaneous edge", "To make the clock faster", "To remove the need for flip-flops", "To check DRC"], correctIndex: 0, explanation: "CTS builds a balanced buffer tree so every flip-flop sees the edge at nearly the same time." },
    { id: "q4", question: "What is skew?", options: ["The difference in clock arrival time between flip-flops", "The slope of a signal edge", "The wire length of the critical path", "The difference between two process corners"], correctIndex: 0, explanation: "Skew helps setup on some paths and hurts hold on others." },
    { id: "q5", question: "What does IR drop mean?", options: ["Supply voltage sagging across a resistive power grid", "Infrared light damaging the wafer", "A failing LVS check", "Current leaking through off transistors"], correctIndex: 0, explanation: "Current through the grid's resistance lowers the voltage cells see, slowing them down." },
    { id: "q6", question: "Which check confirms the layout matches the netlist?", options: ["LVS", "DRC", "STA", "Antenna"], correctIndex: 0, explanation: "Layout versus schematic compares the extracted circuit with the netlist." },
    { id: "q7", question: "Which check confirms the layout can be manufactured?", options: ["DRC", "LVS", "STA", "Simulation"], correctIndex: 0, explanation: "Design rule checks enforce the foundry's width, spacing and enclosure rules." },
    { id: "q8", question: "What is tape-out?", options: ["Sending the final GDSII to the foundry", "Removing unused cells", "Routing the clock", "Running the first simulation"], correctIndex: 0, explanation: "The name comes from writing the layout to magnetic tape." },
    { id: "q9", question: "Why do metal layers usually alternate preferred directions?", options: ["Horizontal and vertical layers can cross without touching, so routing is simpler", "To reduce power", "Because vias only go one way", "To make DRC unnecessary"], correctIndex: 0, explanation: "One layer runs horizontally, the next vertically; vias join them where a net turns." },
    { id: "q10", question: "Which open-source tool does placement, CTS and routing on Sky130?", options: ["OpenROAD", "Yosys", "Icarus Verilog", "GTKWave"], correctIndex: 0, explanation: "Yosys synthesizes; OpenROAD does the physical steps; OpenSTA, Magic, KLayout and Netgen handle signoff." },
  ],
  flashcards: [
    { id: "f1", front: "Standard cell", back: "A pre-drawn gate or flip-flop from the foundry's library, all of the same height." },
    { id: "f2", front: "Netlist", back: "The design as instances of library cells and the wires between them." },
    { id: "f3", front: "Floorplan", back: "Die and core size, rows, pin positions, macros and the power grid." },
    { id: "f4", front: "CTS", back: "Clock tree synthesis: a buffer tree delivering the clock with low skew." },
    { id: "f5", front: "Global vs detailed routing", back: "Plan regions and layers for each net, then draw exact tracks and vias." },
    { id: "f6", front: "Parasitic extraction", back: "Measuring each routed wire's resistance and capacitance for accurate timing." },
    { id: "f7", front: "DRC / LVS", back: "Manufacturing rules met / layout matches the netlist." },
    { id: "f8", front: "GDSII", back: "The layout file format sent to the foundry at tape-out." },
  ],
  videos: [],
};
export default chapter;
