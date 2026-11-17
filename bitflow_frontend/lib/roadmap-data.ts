export interface VLSIRole {
  id: string;
  title: string;
  category: "frontend" | "midend" | "backend" | "validation";
  categoryLabel: string;
  tagline: string;
  description: string;
  accentColor: string;
  badgeBg: string;
  badgeText: string;
  icon: string;
  entryBarrier: "Beginner Friendly" | "Moderate" | "Advanced" | "Specialized";
  coreTheory: string[];
  languages: string[];
  tools: string[];
  bitflowModules: { title: string; link: string }[];
  careerOutlook: string;
  keyResponsibilities: string[];
}

export interface RoadmapStage {
  id: string;
  stepNumber: number;
  title: string;
  subtitle: string;
  accentColor: string;
  roles: VLSIRole[];
}

export const VLSI_ROADMAP_STAGES: RoadmapStage[] = [
  {
    id: "stage-foundation",
    stepNumber: 1,
    title: "1. Core Academic Foundations",
    subtitle: "Essential theory every ECE student must master before branching into specialized VLSI roles.",
    accentColor: "#00e87a",
    roles: [
      {
        id: "role-fundamentals",
        title: "Digital Logic & Circuit Fundamentals",
        category: "frontend",
        categoryLabel: "Foundation Stage",
        tagline: "The bedrock of chip architecture and boolean logic.",
        description:
          "Before choosing a specialized VLSI track, every hardware engineer must master digital logic gates, combinational reduction (K-Maps), sequential storage (Flip-Flops & Latches), and basic CMOS transistor behavior.",
        accentColor: "#00e87a",
        badgeBg: "bg-phosphor/10 border-phosphor/30",
        badgeText: "text-phosphor",
        icon: "⚡",
        entryBarrier: "Beginner Friendly",
        coreTheory: [
          "Boolean Algebra & Karnaugh Maps (K-Maps)",
          "Combinational Logic (Adders, MUX, Demux, Encoders)",
          "Sequential Storage (SR/D/JK/T Flip-Flops & Latches)",
          "Synchronous vs Asynchronous Reset Logic",
          "CMOS Inverter Transistor Physics (NMOS/PMOS)"
        ],
        languages: ["Verilog HDL", "VHDL"],
        tools: ["Logisim", "Icarus Verilog", "GTKWave"],
        bitflowModules: [
          { title: "Logic Gates Module", link: "/learn" },
          { title: "Combinational Circuits", link: "/learn" },
          { title: "Sequential Basics", link: "/learn" }
        ],
        careerOutlook:
          "Prerequisite for all VLSI engineering roles. Taught in 2nd/3rd year ECE curriculum.",
        keyResponsibilities: [
          "Understand how high-level code translates into physical transistors.",
          "Design efficient logic circuits with minimal gate delay.",
          "Write clean, synthesis-ready Verilog code."
        ]
      }
    ]
  },
  {
    id: "stage-frontend",
    stepNumber: 2,
    title: "2. Front-End Design & Verification",
    subtitle: "Transforming product specifications into functional RTL architecture and verifying correctness.",
    accentColor: "#4db8ff",
    roles: [
      {
        id: "role-rtl-design",
        title: "RTL Design Engineer",
        category: "frontend",
        categoryLabel: "Front-End Track",
        tagline: "Architecting the digital logic of modern microprocessors and SoCs.",
        description:
          "RTL (Register-Transfer Level) Design Engineers write the core logic of chips using Hardware Description Languages. They translate microarchitectural specs into efficient hardware structures like pipelines, ALUs, cache controllers, and bus interfaces.",
        accentColor: "#00e87a",
        badgeBg: "bg-phosphor/10 border-phosphor/30",
        badgeText: "text-phosphor",
        icon: "💻",
        entryBarrier: "Moderate",
        coreTheory: [
          "Finite State Machine (FSM) Design (Moore vs Mealy)",
          "Static Timing Analysis (Setup & Hold Time Violation Rules)",
          "Clock Domain Crossing (CDC) & Multi-Flop Synchronizers",
          "Pipelining & Hazard Resolution (Data/Control Hazards)",
          "Bus Protocols (AMBA AHB/AXI, APB, Wishbone)",
          "Low Power Design (Clock Gating, Power Domains)"
        ],
        languages: ["Verilog", "SystemVerilog", "Python", "Tcl"],
        tools: [
          "Synopsys Design Compiler",
          "Xilinx Vivado / AMD Vitis",
          "Siemens QuestaSim",
          "Cadence Genus"
        ],
        bitflowModules: [
          { title: "FSM Control Fabric", link: "/learn" },
          { title: "Complex FSM Systems & Protocols", link: "/learn" },
          { title: "Capstone Interview Tier Problems", link: "/learn" }
        ],
        careerOutlook:
          "High-demand core role at companies like Intel, NVIDIA, Qualcomm, AMD, Apple, and Texas Instruments.",
        keyResponsibilities: [
          "Author high-performance Verilog/SystemVerilog RTL.",
          "Perform microarchitecture trade-off analysis (PPA: Power, Performance, Area).",
          "Fix timing violations and Lint/CDC warnings."
        ]
      },
      {
        id: "role-verification",
        title: "Design Verification (DV) Engineer",
        category: "frontend",
        categoryLabel: "Front-End Track",
        tagline: "Finding bugs before tape-out to prevent multi-million dollar chip re-spins.",
        description:
          "DV Engineers construct test environments to stress-test RTL designs under all possible edge cases. They write constrained-random testbenches and SystemVerilog Assertions to guarantee zero bugs before sending the design to manufacturing.",
        accentColor: "#4db8ff",
        badgeBg: "bg-info/10 border-info/30",
        badgeText: "text-info",
        icon: "🧪",
        entryBarrier: "Moderate",
        coreTheory: [
          "Object-Oriented Programming (OOP) for Hardware",
          "UVM (Universal Verification Methodology) Architecture",
          "Constrained-Random Test Generation",
          "Functional Coverage & Code Coverage Metrics",
          "SystemVerilog Assertions (SVA)",
          "Formal Verification & Property Checking"
        ],
        languages: ["SystemVerilog", "UVM", "C/C++ (DPI-C)", "Python"],
        tools: [
          "Synopsys VCS",
          "Cadence Xcelium",
          "Siemens QuestaSim",
          "VC Formal"
        ],
        bitflowModules: [
          { title: "Testbench & Waveform Mastery", link: "/learn" },
          { title: "Sequential Utilities & Synchronizers", link: "/learn" }
        ],
        careerOutlook:
          "Extremely high industry job ratio (~2 to 3 Verification Engineers per 1 RTL Engineer).",
        keyResponsibilities: [
          "Develop reusable UVM testbench components (Drivers, Monitors, Scoreboards).",
          "Achieve 100% functional and code coverage targets.",
          "Debug simulation failures and report RTL bugs to designers."
        ]
      },
      {
        id: "role-fpga",
        title: "FPGA Prototyping Engineer",
        category: "frontend",
        categoryLabel: "Front-End Track",
        tagline: "Emulating chip designs on reconfigurable hardware for real-time validation.",
        description:
          "FPGA Engineers map RTL designs onto programmable chips (FPGAs) to test software and system integration at near-real speeds before silicon fabrication.",
        accentColor: "#a855f7",
        badgeBg: "bg-purple-500/10 border-purple-500/30",
        badgeText: "text-purple-400",
        icon: "👾",
        entryBarrier: "Moderate",
        coreTheory: [
          "FPGA Fabrics (LUTs, CLBs, BRAM, DSP Blocks, I/O Banks)",
          "Clock & Reset Management (MMCM / PLLs)",
          "Hardware-Software Co-Design",
          "High-Speed Interfaces (PCIe, Ethernet, DDR Controllers)",
          "Embedded Systems & Soft Processors (MicroBlaze, Nios II, RISC-V)"
        ],
        languages: ["Verilog", "SystemVerilog", "VHDL", "Tcl"],
        tools: [
          "Xilinx Vivado ML",
          "Intel Quartus Prime",
          "Synopsys Synplify Pro",
          "Logic Analyzers (ILA / Signaltap)"
        ],
        bitflowModules: [
          { title: "Memory Elements & FIFOs", link: "/learn" },
          { title: "Counters & Sequential Design", link: "/learn" }
        ],
        careerOutlook:
          "Vital in defense, aerospace, telecommunications (5G/networking), high-frequency trading, and AI hardware acceleration.",
        keyResponsibilities: [
          "Synthesize and implement RTL onto Xilinx/Intel FPGAs.",
          "Meet strict FPGA setup/hold timing constraints (SDC).",
          "Debug live hardware issues using integrated logic analyzers."
        ]
      }
    ]
  },
  {
    id: "stage-midend",
    stepNumber: 3,
    title: "3. Implementation & Testability",
    subtitle: "Preparing chip logic for manufacturing testability and logic synthesis.",
    accentColor: "#ffb84d",
    roles: [
      {
        id: "role-dft",
        title: "Design for Testability (DFT) Engineer",
        category: "midend",
        categoryLabel: "Implementation Track",
        tagline: "Injecting diagnostic hardware so physical chips can be tested post-fabrication.",
        description:
          "DFT Engineers add specialized test hardware (Scan chains, BIST, JTAG) to chip logic. Once the silicon returns from the foundry, automated test equipment uses DFT patterns to instantly identify physical manufacturing defects.",
        accentColor: "#ffb84d",
        badgeBg: "bg-warn/10 border-warn/30",
        badgeText: "text-warn",
        icon: "🔬",
        entryBarrier: "Advanced",
        coreTheory: [
          "Scan Chain Insertion & Flip-Flop Stitching",
          "ATPG (Automatic Test Pattern Generation)",
          "Fault Models (Stuck-At, Transition Delay, Path Delay, Bridging)",
          "BIST (Built-In Self-Test for SRAM/DRAM)",
          "IEEE 1149.1 JTAG & Boundary Scan Standard",
          "Compression Architectures (EDT / SmartTest)"
        ],
        languages: ["Verilog", "Tcl", "Perl / Python", "STIL / WGL Test Formats"],
        tools: [
          "Siemens Tessent (DFTMAX / FastScan)",
          "Synopsys TetraMAX",
          "Cadence Modus DFT"
        ],
        bitflowModules: [
          { title: "Shift Registers (SISO/SIPO)", link: "/learn" },
          { title: "Sequential Utilities", link: "/learn" }
        ],
        careerOutlook:
          "Critical role in silicon production. Every commercial chip requires DFT to pass quality assurance.",
        keyResponsibilities: [
          "Insert scan architectures without degrading functional timing.",
          "Generate ATPG test vectors achieving >98% fault coverage.",
          "Interface with foundry test engineers to debug silicon failures."
        ]
      }
    ]
  },
  {
    id: "stage-backend",
    stepNumber: 4,
    title: "4. Physical Design & Layout",
    subtitle: "Translating synthesized gate netlists into geometric transistor silicon layouts.",
    accentColor: "#ff4f4f",
    roles: [
      {
        id: "role-physical-design",
        title: "Physical Design (PD) Engineer",
        category: "backend",
        categoryLabel: "Physical Implementation Track",
        tagline: "Floorplanning, placing, routing, and timing-closing complex silicon ICs.",
        description:
          "PD Engineers take synthesized logic gates and lay them out on a physical 2D/3D silicon canvas. They handle power distribution, component placement, clock tree synthesis (CTS), wire routing, and Static Timing Analysis (STA).",
        accentColor: "#ff4f4f",
        badgeBg: "bg-danger/10 border-danger/30",
        badgeText: "text-danger",
        icon: "🏗️",
        entryBarrier: "Advanced",
        coreTheory: [
          "Logic Synthesis (Gate mapping & Area Optimization)",
          "Floorplanning & Power Grid Network Design (IR Drop)",
          "Placement & Routing (P&R Algorithms)",
          "Clock Tree Synthesis (CTS - Skew & Jitter Control)",
          "Static Timing Analysis (STA - Setup/Hold Closure across PVT Corners)",
          "Physical Verification (DRC, LVS, ERC, Antenna Effects)"
        ],
        languages: ["Tcl (Tool Command Language)", "Python", "SDC (Synopsys Design Constraints)"],
        tools: [
          "Cadence Innovus Implementation System",
          "Synopsys IC Compiler II (ICC2)",
          "Synopsys PrimeTime (STA)",
          "Siemens Calibre (DRC/LVS)"
        ],
        bitflowModules: [
          { title: "Advanced Counters & Timing", link: "/learn" },
          { title: "Latch & Flip-Flop Delay Mechanics", link: "/learn" },
          { title: "From RTL to GDS", link: "/academy/rtl-to-gds" },
          { title: "Static timing analysis basics", link: "/articles/static-timing-analysis-basics" }
        ],
        careerOutlook:
          "High compensation role directly responsible for tape-out success and physical chip yields.",
        keyResponsibilities: [
          "Floorplan complex multi-million gate SoCs.",
          "Synthesize clock trees balancing minimum skew and insertion delay.",
          "Achieve timing closure across all PVT (Process, Voltage, Temperature) corners."
        ]
      },
      {
        id: "role-analog-layout",
        title: "Analog & Mixed-Signal Layout Engineer",
        category: "backend",
        categoryLabel: "Physical Layout Track",
        tagline: "Drawing transistor-level geometries for high-speed custom analog IP.",
        description:
          "Analog Layout Engineers manually or semi-automatically draw the geometric masks for custom circuits (PLLs, ADCs, DACs, SerDes, Power Management). They balance deep semiconductor physics with physical layout symmetry.",
        accentColor: "#ec4899",
        badgeBg: "bg-pink-500/10 border-pink-500/30",
        badgeText: "text-pink-400",
        icon: "🎨",
        entryBarrier: "Specialized",
        coreTheory: [
          "Semiconductor Physics (PN Junctions, MOSFET Sub-threshold)",
          "Matching Techniques (Common Centroid, Interdigitation)",
          "Parasitic Resistance & Capacitance Extraction (RC Extraction)",
          "DRC (Design Rule Checking) & LVS (Layout Vs Schematic)",
          "Electromigration (EM) & Voltage Drop (IR Drop)",
          "Substrate Noise & Guard Rings"
        ],
        languages: ["SPICE", "SKILL (Cadence)", "Python"],
        tools: [
          "Cadence Virtuoso Layout Suite",
          "Synopsys Custom Compiler",
          "Mentor Calibre"
        ],
        bitflowModules: [
          { title: "Logic Gates Transistor Basics", link: "/learn" }
        ],
        careerOutlook:
          "Niche and highly valued specialization in RF, high-speed interfaces, and sensor interfaces.",
        keyResponsibilities: [
          "Translate analog schematic diagrams into precise geometric silicon masks.",
          "Minimize parasitic capacitance and crosstalk in sensitive signal paths.",
          "Pass 100% DRC, LVS, and Antenna rule checks."
        ]
      }
    ]
  },
  {
    id: "stage-validation",
    stepNumber: 5,
    title: "5. Post-Silicon Validation & Fab",
    subtitle: "Testing manufactured physical silicon in the lab and preparing for mass production.",
    accentColor: "#38bdf8",
    roles: [
      {
        id: "role-post-silicon",
        title: "Post-Silicon Validation & Bring-Up Engineer",
        category: "validation",
        categoryLabel: "Silicon Bring-Up Track",
        tagline: "Powering up fresh silicon in the lab and validating real-world performance.",
        description:
          "When the first silicon wafers arrive from foundry fabrication, Post-Silicon Engineers bring up the physical chips in specialized electronics labs. They hook up high-speed oscilloscopes, logic analyzers, and automated test rigs to prove the chip works in the real world.",
        accentColor: "#38bdf8",
        badgeBg: "bg-sky-400/10 border-sky-400/30",
        badgeText: "text-sky-400",
        icon: "⚡",
        entryBarrier: "Moderate",
        coreTheory: [
          "Laboratory Instrumentation & High-Speed Measurement",
          "Signal Integrity (Eye Diagrams, Jitter Analysis, Noise Margins)",
          "Power-On Reset (POR) & Voltage Margining",
          "Thermal Analysis & Heat Sink Validation",
          "Silicon Bug Workaround Strategies"
        ],
        languages: ["Python", "C / C++", "LabVIEW", "Tcl"],
        tools: [
          "Tektronix / Keysight High-Speed Oscilloscopes",
          "Logic Analyzers & Protocol Analyzers",
          "Custom Python Automation Rigs"
        ],
        bitflowModules: [
          { title: "Capstone Systems", link: "/learn" },
          { title: "FSM Protocol Controllers", link: "/learn" }
        ],
        careerOutlook:
          "Exciting hands-on hardware role bridging software, hardware, and lab diagnostics.",
        keyResponsibilities: [
          "Power up first-pass silicon safely in the lab.",
          "Measure electrical eye diagrams and timing margins across temperature chambers.",
          "Automate regression test benches for silicon characterization."
        ]
      }
    ]
  }
];
