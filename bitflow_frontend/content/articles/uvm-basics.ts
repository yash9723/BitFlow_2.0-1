import { p } from "@/lib/academy/draw";
import type { Article } from "@/lib/article-types";

const article: Article = {
  slug: "uvm-basics",
  title: "UVM basics: the Universal Verification Methodology explained",
  description: "What UVM is and how a UVM testbench is built: sequence items, sequences, drivers, monitors, agents, scoreboards, the environment and the test, plus the phases that run them.",
  published: "2026-11-17",
  readMinutes: 9,
  sections: [
    {
      id: "what",
      heading: "What UVM is",
      blocks: [
        p("**UVM (Universal Verification Methodology)** is a standard class library for SystemVerilog, maintained by Accellera and standardised as IEEE 1800.2. It gives every verification team the same building blocks for testbenches: components that generate stimulus, drive it into the design, watch what comes out and check it."),
        p("A plain Verilog testbench is one module that pokes inputs and checks outputs. That works for a counter, but not for a PCIe controller verified by ten engineers over a year. UVM's point is **reuse**: an agent written for one AXI interface plugs into every block that has one."),
      ],
    },
    {
      id: "pieces",
      heading: "The pieces of a UVM testbench",
      blocks: [
        { kind: "table", headers: ["Component", "Job"], rows: [
          ["Sequence item (uvm_sequence_item)", "One transaction: a bus write, a packet. Fields are usually `rand` so they can be randomized."],
          ["Sequence (uvm_sequence)", "Generates a stream of sequence items: the stimulus scenario."],
          ["Sequencer (uvm_sequencer)", "Hands items from the running sequences to the driver."],
          ["Driver (uvm_driver)", "Turns each transaction into pin-level wiggles on the interface."],
          ["Monitor (uvm_monitor)", "Watches the pins and turns activity back into transactions; never drives anything."],
          ["Agent (uvm_agent)", "Bundles sequencer, driver and monitor for one interface. Passive agents only monitor."],
          ["Scoreboard (uvm_scoreboard)", "Compares what the design did with what a reference model predicts."],
          ["Environment (uvm_env)", "Holds the agents, scoreboards and coverage for a block."],
          ["Test (uvm_test)", "Builds the environment, configures it and picks which sequences run."],
        ] },
        p("Components pass transactions through **TLM ports** (analysis ports from monitors to scoreboards), and get configuration from the **uvm_config_db**, including the virtual interface that connects classes to the design's pins."),
      ],
    },
    {
      id: "example",
      heading: "A sequence item and a driver",
      blocks: [
        { kind: "code", text: "class bus_item extends uvm_sequence_item;\n  rand bit [7:0]  addr;\n  rand bit [31:0] data;\n  rand bit        write;\n  `uvm_object_utils(bus_item)\n  function new(string name = \"bus_item\"); super.new(name); endfunction\nendclass\n\nclass bus_driver extends uvm_driver #(bus_item);\n  `uvm_component_utils(bus_driver)\n  virtual bus_if vif;\n  function new(string name, uvm_component parent); super.new(name, parent); endfunction\n  task run_phase(uvm_phase phase);\n    forever begin\n      seq_item_port.get_next_item(req);\n      @(posedge vif.clk);\n      vif.addr <= req.addr; vif.wdata <= req.data; vif.we <= req.write; vif.valid <= 1;\n      @(posedge vif.clk); vif.valid <= 0;\n      seq_item_port.item_done();\n    end\n  endtask\nendclass" },
      ],
    },
    {
      id: "phases",
      heading: "Phases",
      blocks: [
        p("Every component runs through the same **phases**, so the whole testbench is built and started in a predictable order:"),
        { kind: "list", items: [
          "**build_phase:** create child components (top-down).",
          "**connect_phase:** connect ports between them.",
          "**run_phase:** the time-consuming part where stimulus runs. A test raises an **objection** to keep the simulation alive and drops it when done.",
          "**check_phase / report_phase:** final checks and the summary.",
        ] },
      ],
    },
    {
      id: "learn",
      heading: "How to learn it",
      blocks: [
        p("UVM sits on top of SystemVerilog classes, randomization and coverage, which sit on top of solid Verilog. Learn in that order: write self-checking Verilog testbenches first, then SystemVerilog constrained-random stimulus and covergroups, then UVM. Most UVM interview questions are really about those foundations."),
      ],
    },
  ],
  faq: [
    { q: "What is UVM in verification?", a: "UVM (Universal Verification Methodology) is a standardized SystemVerilog class library (IEEE 1800.2) for building reusable, constrained-random testbenches out of sequences, drivers, monitors, agents, scoreboards and environments." },
    { q: "What is the difference between a driver and a monitor in UVM?", a: "A driver converts transactions into signal activity on the design's pins. A monitor only observes the pins and converts activity back into transactions for scoreboards and coverage; it never drives signals." },
    { q: "What is a UVM agent?", a: "An agent groups the sequencer, driver and monitor for one interface. An active agent drives stimulus; a passive agent only monitors." },
    { q: "Do I need to know SystemVerilog before UVM?", a: "Yes. UVM is written in SystemVerilog and relies on classes, randomization, interfaces and coverage, so those should be learned first." },
  ],
  related: [
    { href: "/articles/systemverilog-vs-verilog", label: "SystemVerilog vs Verilog" },
    { href: "/articles/verilog-interview-questions", label: "Verilog interview questions" },
    { href: "/articles/how-to-simulate-verilog-online", label: "How to simulate Verilog online" },
    { href: "/academy/roadmap", label: "VLSI career roadmap" },
  ],
};
export default article;
