import { p } from "@/lib/academy/draw";
import type { Article } from "@/lib/article-types";

const article: Article = {
  slug: "async-fifo-design",
  title: "Asynchronous FIFO design in Verilog: Gray pointers and CDC",
  description: "How an asynchronous (dual-clock) FIFO safely moves data between clock domains: why the pointers are Gray-coded, how they are synchronised, and the exact full and empty conditions, with Verilog.",
  published: "2026-11-15",
  readMinutes: 10,
  sections: [
    {
      id: "problem",
      heading: "The problem it solves",
      blocks: [
        p("An asynchronous FIFO is a small dual-port memory with a **write side** on one clock and a **read side** on another, unrelated clock. It is the standard way to pass a stream of data across a clock-domain crossing (CDC): a camera on 74.25 MHz feeding a processor on 100 MHz, or a UART receiver handing bytes to a bus."),
        p("The memory itself is easy. The hard part is the **full** and **empty** flags: the write side must know where the read pointer is, and the read side must know where the write pointer is, and each pointer lives in the other clock domain."),
      ],
    },
    {
      id: "why-gray",
      heading: "Why the pointers are Gray-coded",
      blocks: [
        p("A single bit crossing clock domains is made safe with a two-flip-flop synchroniser. A multi-bit binary counter is not: going from 0111 to 1000 changes four bits at once, and if the receiving clock samples in the middle it can see any mix of old and new bits, such as 1111. The other side would then believe the FIFO is in a state it never was in."),
        p("In **Gray code**, consecutive values differ in exactly one bit. If a Gray pointer is sampled while it changes, the result is either the old value or the new one, never a wild value. A slightly stale pointer is safe: it only makes the FIFO look a little fuller or emptier than it is, for a clock or two."),
        { kind: "code", text: "// Binary to Gray: one XOR per bit\nassign gray = bin ^ (bin >> 1);" },
        { kind: "table", headers: ["Binary", "Gray"], rows: [
          ["000", "000"], ["001", "001"], ["010", "011"], ["011", "010"], ["100", "110"], ["101", "111"], ["110", "101"], ["111", "100"],
        ] },
      ],
    },
    {
      id: "extra-bit",
      heading: "The extra pointer bit",
      blocks: [
        p("For a FIFO with 2^A entries, each pointer has **A + 1** bits. The low A bits address the memory; the extra top bit flips every time the pointer wraps around. That is how equal addresses are told apart:"),
        { kind: "list", items: [
          "Pointers completely equal: the reader has caught up with the writer, so the FIFO is **empty**.",
          "Addresses equal but wrap bits different: the writer is a whole lap ahead, so the FIFO is **full**.",
        ] },
        p("In Gray code the \"different wrap bit\" test becomes: the top **two** bits are inverted and the rest are equal. That is the one line people most often get wrong."),
      ],
    },
    {
      id: "verilog",
      heading: "The Verilog",
      blocks: [
        { kind: "code", text: "module async_fifo #(parameter W = 8, parameter A = 4) (   // 2^A entries\n  input              wclk, wrst, wen,\n  input  [W-1:0]     wdata,\n  output reg         full,\n  input              rclk, rrst, ren,\n  output [W-1:0]     rdata,\n  output reg         empty\n);\n  reg [W-1:0] mem [0:(1<<A)-1];\n\n  // ---- write domain ----\n  reg [A:0] wbin, wgray, rq1_wgray, rq2_wgray;\n  reg [A:0] rgray, wq1_rgray, wq2_rgray;\n  wire [A:0] wbin_next  = wbin + (wen & ~full);\n  wire [A:0] wgray_next = wbin_next ^ (wbin_next >> 1);\n\n  always @(posedge wclk) begin\n    if (wen && !full) mem[wbin[A-1:0]] <= wdata;\n    if (wrst) begin\n      wbin <= 0; wgray <= 0; full <= 0;\n      wq1_rgray <= 0; wq2_rgray <= 0;\n    end else begin\n      wbin <= wbin_next; wgray <= wgray_next;\n      {wq2_rgray, wq1_rgray} <= {wq1_rgray, rgray};   // read pointer -> write clock\n      full <= (wgray_next == {~wq2_rgray[A:A-1], wq2_rgray[A-2:0]});\n    end\n  end\n\n  // ---- read domain ----\n  reg [A:0] rbin;\n  wire [A:0] rbin_next  = rbin + (ren & ~empty);\n  wire [A:0] rgray_next = rbin_next ^ (rbin_next >> 1);\n  assign rdata = mem[rbin[A-1:0]];\n\n  always @(posedge rclk) begin\n    if (rrst) begin\n      rbin <= 0; rgray <= 0; empty <= 1;\n      rq1_wgray <= 0; rq2_wgray <= 0;\n    end else begin\n      rbin <= rbin_next; rgray <= rgray_next;\n      {rq2_wgray, rq1_wgray} <= {rq1_wgray, wgray};   // write pointer -> read clock\n      empty <= (rgray_next == rq2_wgray);\n    end\n  end\nendmodule", caption: "A dual-clock FIFO with registered full and empty flags (after Cummings, SNUG 2002)" },
        { kind: "callout", tone: "note", text: "Both flags are computed from the *next* pointer value so that they are registered and correct on the same edge the pointer moves. Each flag is pessimistic in the safe direction: full may stay high a couple of write clocks after a read, and empty may stay high a couple of read clocks after a write. It never claims space or data that is not there." },
      ],
    },
    {
      id: "rules",
      heading: "Rules that keep it safe",
      blocks: [
        { kind: "list", items: [
          "Only Gray-coded **registered** pointers cross between domains. Never synchronise the binary pointer, and never send a Gray value straight from combinational logic.",
          "Each pointer crosses through two flip-flops in the receiving domain.",
          "Use the synchronised pointer only to compute that domain's flag. Nothing else from the other domain is used.",
          "The depth must be a power of two, or the Gray sequence will not wrap with a single-bit change.",
          "Constrain the crossing paths in your timing tool (for example a max-delay or false-path constraint on the synchroniser inputs).",
        ] },
      ],
    },
    {
      id: "depth",
      heading: "How deep should it be?",
      blocks: [
        p("If the writer can burst faster than the reader drains, the FIFO must absorb the difference. For a burst of B words written at f_w while the reader reads at f_r (one word per clock each):"),
        { kind: "formula", text: "depth ≥ B − B · (f_r / f_w)", note: "the words the reader has not yet removed when the burst ends; round up to a power of two and add a little margin for the synchroniser delay." },
        { kind: "example", title: "Sizing a FIFO", problem: "Bursts of 80 words written at 100 MHz, read at 80 MHz.", steps: [
          "During the burst the reader removes 80 × 80/100 = 64 words.",
          "80 − 64 = 16 words are left in the FIFO.",
          "Round up and allow for a few cycles of synchroniser lag: 32 entries.",
        ], answer: "A 32-deep FIFO." },
      ],
    },
  ],
  faq: [
    { q: "Why are Gray codes used in asynchronous FIFOs?", a: "Consecutive Gray values differ in only one bit, so if the other clock domain samples a pointer while it is changing, it sees either the old or the new value and never an invalid mix of bits." },
    { q: "How is the full condition detected in an asynchronous FIFO?", a: "The write pointer's next Gray value is compared with the synchronised read pointer: the FIFO is full when the top two bits are inverted and all other bits are equal, meaning the writer is exactly one lap ahead." },
    { q: "How is the empty condition detected?", a: "The read pointer's next Gray value equals the write pointer synchronised into the read clock domain." },
    { q: "Why does an asynchronous FIFO use two flip-flop synchronisers?", a: "The first flip-flop can go metastable when it samples a pointer bit that is changing; the second gives it a full clock period to settle before the value is used." },
  ],
  related: [
    { href: "/problems/async-fifo-cdc", label: "Problem: asynchronous FIFO (CDC safe)" },
    { href: "/problems/fifo-sync", label: "Problem: synchronous FIFO" },
    { href: "/studio/generators", label: "Verilog generators: async FIFO and CDC synchronisers" },
    { href: "/articles/setup-and-hold-time", label: "Setup and hold time explained" },
  ],
};
export default article;
