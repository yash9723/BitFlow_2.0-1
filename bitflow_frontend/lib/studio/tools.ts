/** lib/studio/tools.ts — the Design Studio's tools (hub tiles, sitemap). Add one per shipped tool. */

export interface StudioTool { href: string; title: string; blurb: string; icon: string }

export const STUDIO_TOOLS: StudioTool[] = [
  {
    href: "/studio/fsm", title: "FSM designer", icon: "◎",
    blurb: "Draw a Moore or Mealy state machine, step it clock by clock, and get Verilog with a testbench that checks every cycle.",
  },
  {
    href: "/studio/logic", title: "Truth table & K-map", icon: "⊞",
    blurb: "Fill in a truth table to get the K-map groups, the minimal sum-of-products and product-of-sums, and Verilog with a testbench that checks every row.",
  },
];
