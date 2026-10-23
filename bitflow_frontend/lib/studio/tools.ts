/** lib/studio/tools.ts — the Design Studio's tools (hub tiles, sitemap). Add one per shipped tool. */

export interface StudioTool { href: string; title: string; blurb: string; icon: string }

export const STUDIO_TOOLS: StudioTool[] = [
  {
    href: "/studio/circuit", title: "Circuit editor", icon: "⏚",
    blurb: "Wire gates, flip-flops, switches and LEDs on a canvas and watch the circuit run live, then export Verilog with a testbench.",
  },
  {
    href: "/studio/fsm", title: "FSM designer", icon: "◎",
    blurb: "Draw a Moore or Mealy state machine, step it clock by clock, and get Verilog with a testbench that checks every cycle.",
  },
  {
    href: "/studio/timing", title: "Timing diagram", icon: "⎍",
    blurb: "Draw waveforms cycle by cycle (or sample them from a simulation), export SVG, PNG or WaveJSON, and test a design against them.",
  },
  {
    href: "/studio/logic", title: "Truth table & K-map", icon: "⊞",
    blurb: "Fill in a truth table to get the K-map groups, the minimal sum-of-products and product-of-sums, and Verilog with a testbench that checks every row.",
  },
  {
    href: "/studio/pipeline", title: "CPU pipeline", icon: "⫸",
    blurb: "Write RISC-V assembly and step a 5-stage pipeline cycle by cycle: forwarding, load-use stalls and branch flushes, with CPI and a check against the ISA.",
  },
  {
    href: "/studio/testbench", title: "Testbench generator", icon: "⊳",
    blurb: "Paste a Verilog or SystemVerilog module and get a self-checking testbench: clock and reset, exhaustive or random stimulus, X/Z checks and a slot for your reference model.",
  },
  {
    href: "/studio/generators", title: "Verilog generators", icon: "⚙",
    blurb: "LFSR, CRC, FIFOs (including an asynchronous one), UART receiver, SPI master, arbiter, CDC synchronisers, VGA timing, 7-segment driver, sine table and more, in Verilog or SystemVerilog, each with a self-checking testbench.",
  },
  {
    href: "/studio/boolean", title: "Boolean algebra", icon: "∧",
    blurb: "Type an expression like A'B + AB' and get its truth table, minimal SOP and POS, canonical forms, and an equivalence check against another expression.",
  },
  {
    href: "/studio/numbers", title: "Number formats", icon: "#",
    blurb: "Two's complement in any width, fixed-point Q formats and IEEE-754 half/single/double, bit by bit, with Verilog literals.",
  },
  {
    href: "/studio/cache", title: "Cache simulator", icon: "▦",
    blurb: "Run an address trace through a direct-mapped or set-associative cache: tag/index/offset, hits, the 3 Cs of misses, write-backs and AMAT.",
  },
];

/** The localStorage drafts a share link carries, per tool page (components/studio/ShareControl.tsx). */
export const SHARE_KEYS: Record<string, string[]> = {
  "/studio/circuit": ["bitflow_studio_circuit"],
  "/studio/fsm": ["bitflow_studio_fsm"],
  "/studio/timing": ["bitflow_studio_timing", "bitflow_studio_timing_mode", "bitflow_studio_timing_module", "bitflow_studio_timing_design"],
  "/studio/logic": ["bitflow_studio_logic", "bitflow_studio_logic_form", "bitflow_studio_logic_module"],
  "/studio/pipeline": ["bitflow_studio_pipeline"],
  "/studio/testbench": ["bitflow_studio_testbench"],
  "/studio/generators": ["bitflow_studio_generators"],
  "/studio/boolean": ["bitflow_studio_boolean"],
  "/studio/numbers": ["bitflow_studio_numbers"],
  "/studio/cache": ["bitflow_studio_cache"],
};
