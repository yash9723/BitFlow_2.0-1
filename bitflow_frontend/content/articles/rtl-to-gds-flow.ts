import { p } from "@/lib/academy/draw";
import type { Article } from "@/lib/article-types";

const article: Article = {
  slug: "rtl-to-gds-flow",
  title: "The RTL to GDS flow, step by step",
  description: "How Verilog becomes a chip layout: synthesis, floorplan, placement, clock tree synthesis, routing and signoff, what each step produces, and the open-source tools for SkyWater 130 nm.",
  published: "2026-11-17",
  readMinutes: 9,
  sections: [
    {
      id: "overview",
      heading: "From RTL to GDS in one picture",
      blocks: [
        p("**RTL** (register-transfer level) is the Verilog you write: registers and the logic between them. **GDS** (GDSII) is the file a foundry manufactures from: every polygon on every layer of the chip. The **RTL to GDS flow** is the chain of tools that turns the first into the second."),
        { kind: "table", headers: ["Step", "Input", "Output", "Open-source tool"], rows: [
          ["1. Synthesis", "RTL Verilog + cell library", "Gate-level netlist", "Yosys"],
          ["2. Floorplan", "Netlist + die size", "Die, core area, rows, I/O pins, power grid", "OpenROAD"],
          ["3. Placement", "Floorplan", "Every cell at a legal x, y", "OpenROAD (RePlAce, OpenDP)"],
          ["4. Clock tree synthesis", "Placed design", "Buffered, balanced clock network", "OpenROAD (TritonCTS)"],
          ["5. Routing", "Placed design + clock tree", "Metal wires and vias connecting every net", "OpenROAD (FastRoute, TritonRoute)"],
          ["6. Signoff", "Routed layout", "Timing, DRC and LVS reports", "OpenSTA, Magic, KLayout, Netgen"],
          ["7. GDS export", "Clean layout", "GDSII file for the foundry", "KLayout or Magic"],
        ] },
        p("Commercial flows (Cadence, Synopsys) follow the same steps with different tools. OpenLane and OpenROAD-flow-scripts package the open-source tools into one push-button flow for the SkyWater 130 nm (Sky130) process, which is what TinyTapeout and most hobby tape-outs use."),
      ],
    },
    {
      id: "synthesis",
      heading: "1. Synthesis: RTL to standard cells",
      blocks: [
        p("Synthesis reads your Verilog, works out the logic it describes, optimises it, and **maps** it onto the foundry's **standard cells**: pre-designed gates such as `sky130_fd_sc_hd__nand2_1` or a D flip-flop. Each cell comes with a liberty file (.lib) giving its area, delay and power."),
        p("The output is a **gate-level netlist**: a Verilog file that only instantiates cells and wires them up. This is the first point where you get real numbers: cell area in µm² and a first estimate of the critical path."),
        { kind: "callout", tone: "tip", text: "Anything that isn't synthesizable (initial blocks for logic, # delays, $display) is ignored or rejected here. Write RTL you'd expect to see as hardware." },
      ],
    },
    {
      id: "floorplan",
      heading: "2. Floorplan",
      blocks: [
        p("The floorplan decides the chip's shape before any cell is placed: the **die** size, the **core** area inside it where cells go, the horizontal **rows** that cells snap into, where the I/O pins sit on the edge, and the **power distribution network** (VDD and VSS straps on the upper metal layers)."),
        p("The key number is **utilization**: cell area divided by core area. Around 40–60% is typical. Too high and the router runs out of room for wires; too low and you waste silicon."),
      ],
    },
    {
      id: "placement",
      heading: "3. Placement",
      blocks: [
        p("Placement puts every cell at a position. **Global placement** spreads cells out to minimise total wire length while avoiding crowded spots; **detailed placement** then snaps each cell into a row without overlaps (legalisation). Timing-driven placement pulls the cells of critical paths closer together."),
      ],
    },
    {
      id: "cts",
      heading: "4. Clock tree synthesis",
      blocks: [
        p("Synthesis treats the clock as an ideal wire that reaches every flip-flop at once. In silicon one net cannot drive thousands of flip-flops, so **CTS** builds a tree of buffers that delivers the clock to every flip-flop at nearly the same time. What's left over is **skew**, which eats into setup or hold margins."),
        p("After CTS the timing is no longer ideal, so tools re-check hold time here and insert delay buffers on paths that became too fast."),
      ],
    },
    {
      id: "routing",
      heading: "5. Routing",
      blocks: [
        p("Routing draws the actual wires. **Global routing** assigns each net to coarse regions and metal layers; **detailed routing** draws exact tracks and vias that obey every design rule (minimum width, spacing, via enclosure). Sky130 has a local interconnect layer and five metal layers (met1–met5)."),
        p("Real wires have resistance and capacitance, so after routing the tool **extracts parasitics** (a SPEF file) and timing is computed again with the real wire delays."),
      ],
    },
    {
      id: "signoff",
      heading: "6. Signoff and 7. GDS",
      blocks: [
        { kind: "list", items: [
          "**Static timing analysis:** every path meets setup and hold at every process corner, with real wire delays.",
          "**DRC (design rule check):** every polygon obeys the foundry's manufacturing rules.",
          "**LVS (layout versus schematic):** the layout's transistors and connections match the netlist exactly.",
          "**Antenna and density checks:** long wires won't damage gates during manufacturing, and metal density is even.",
        ] },
        p("Once all checks are clean, the layout is streamed out as **GDSII**. Sending it to the foundry is called **tape-out**."),
      ],
    },
    {
      id: "try-it",
      heading: "Try the first steps on BitFlow",
      blocks: [
        p("BitFlow's Sandbox runs the first part of this flow: its ASIC panel synthesizes your Verilog onto Sky130 standard cells with Yosys and times it with OpenSTA, reporting area, the critical path, f_max and power. The FPGA tab shows the equivalent placed floorplan on an iCE40 FPGA, and the TinyTapeout export packages a design for a real shuttle."),
        { kind: "link", href: "/sandbox", label: "Open the Sandbox", text: "Write Verilog, simulate it, and run the ASIC and FPGA flows on it." },
      ],
    },
  ],
  faq: [
    { q: "What does RTL to GDS mean?", a: "It is the full ASIC design flow that turns register-transfer-level Verilog or VHDL into a GDSII layout file a foundry can manufacture: synthesis, floorplanning, placement, clock tree synthesis, routing, signoff checks and GDS export." },
    { q: "What is a GDSII file?", a: "GDSII is the standard binary format for chip layouts. It stores the polygons on every mask layer of the chip and is what is sent to the foundry at tape-out." },
    { q: "Can I do RTL to GDS with free tools?", a: "Yes. Yosys, OpenROAD, OpenSTA, Magic, KLayout and Netgen form a complete open-source flow, packaged by OpenLane and OpenROAD-flow-scripts for the SkyWater 130 nm process. TinyTapeout uses it to manufacture community designs." },
    { q: "What is the difference between synthesis and place and route?", a: "Synthesis turns RTL into a netlist of standard cells but says nothing about where they go. Place and route positions those cells on the die, builds the clock tree and draws the metal wires between them." },
  ],
  related: [
    { href: "/academy/rtl-to-gds", label: "Academy: From RTL to GDS" },
    { href: "/articles/static-timing-analysis-basics", label: "Static timing analysis basics" },
    { href: "/articles/setup-and-hold-time", label: "Setup and hold time" },
    { href: "/academy/roadmap", label: "VLSI career roadmap" },
  ],
};
export default article;
