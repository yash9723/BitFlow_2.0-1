/**
 * lib/arena/timing.ts — "make it fast" problems. The starter computes the right
 * answer but its longest path between registers is too long; the learner
 * pipelines it to reach a clock frequency on a real FPGA. Grading
 * (app/api/problems/[slug]/submit) runs the hidden tests, then places and routes
 * the design for an iCE40-HX8K inside `timing.wrapper` (registers on every input
 * and output, so all of the design's logic is timed) and needs Fmax >= target.
 * Targets sit between the starter's Fmax and a pipelined reference's
 * (private/timing/verify.ts measures both).
 */

import type { ArenaProblem, ArenaTestcase } from "./types";

interface TbSpec {
  dut:      string;                    // module name
  inputs:   [string, number][];        // [name, width]
  output:   [string, number];
  latency:  number;                    // register stages: inputs set before edge 1, result after edge `latency`
  expected: string;                    // Verilog expression over the inputs (and `helpers`)
  helpers?: string;                    // functions the expression uses
  directed: string[];                  // corner cases: one assignment statement each
}

/**
 * A testbench that applies a new input on every clock edge and checks every
 * result `latency` edges later. `random` vectors follow the directed ones.
 */
function pipelineTb(name: string, s: TbSpec, random: number, seed: number): string {
  const [out, ow] = s.output;
  const n = s.directed.length + random;
  const decl = s.inputs.map(([i, w]) => `    reg  [${w - 1}:0] ${i};`).join("\n");
  const ports = [...s.inputs.map(([i]) => `.${i}(${i})`), `.${out}(${out})`].join(", ");
  const randomise = s.inputs.map(([i]) => `${i} = $random(seed);`).join(" ");
  const directed = s.directed.map((d, k) => `            if (i == ${k}) begin ${d} end`).join("\n");
  return `\`timescale 1ns / 1ps
module ${name};
    reg clk = 0;
    always #5 clk = ~clk;
${decl}
    wire [${ow - 1}:0] ${out};
    ${s.dut} dut (.clk(clk), ${ports});
${s.helpers ?? ""}
    localparam N = ${n}, LAT = ${s.latency};
    reg [${ow - 1}:0] want [0:N-1];
    integer i, errors = 0, seed = ${seed};

    initial begin
        $dumpfile("wave.vcd");
        $dumpvars(0, ${name});
        for (i = 0; i < N + LAT; i = i + 1) begin
            // New inputs before every edge; past the last vector they keep changing.
            ${randomise}
${directed}
            if (i < N) want[i] = ${s.expected};
            @(posedge clk); #1;
            // After edge i+1 the output holds the result of vector i+1-LAT.
            if (i + 1 >= LAT && i + 1 - LAT < N && ${out} !== want[i + 1 - LAT]) begin
                if (errors < 5) $display("FAIL: vector %0d: ${out} = %0d, expected %0d", i + 1 - LAT, ${out}, want[i + 1 - LAT]);
                errors = errors + 1;
            end
        end
        if (errors == 0) $display("ALL TESTS PASSED");
        else $display("TESTS FAILED: %0d of %0d results wrong", errors, N);
        $finish;
    end
endmodule
`;
}

function testcases(slug: string, s: TbSpec): ArenaTestcase[] {
  const tb = (k: number, random: number, seed: number, directed: boolean, description: string): ArenaTestcase => ({
    id: `tc-${slug}-${k}`, description, weight: 50, expected: "ALL TESTS PASSED",
    testbench: pipelineTb(`tb_${slug.replace(/-/g, "_")}_${k}`, directed ? s : { ...s, directed: [] }, random, seed),
  });
  return [
    tb(1, 40, 11, true, "Corner cases, then random inputs every cycle"),
    tb(2, 600, 7, false, "600 random inputs, one per cycle"),
  ];
}

const GRADING = (target: number, starter: number, latency: number) => `
**How it's graded**

1. Hidden tests feed a new input on **every** clock edge and check every result exactly
   ${latency} edges later (inputs set before edge 1, result after edge ${latency}).
2. The design is then placed and routed for a **Lattice iCE40-HX8K** (Yosys + nextpnr), with a register
   added on every input and output so all of your logic is timed. The slowest register-to-register
   path sets the maximum clock frequency, which must reach **${target} MHz**. The starter design reaches
   about ${starter} MHz.
3. Accepted designs are ranked by frequency on the leaderboard.

The Synth panel's FPGA tab shows a place-and-route result for your design before you submit.
Shorter paths between registers mean a faster clock: split a long chain of logic with a register in the
middle, and keep the total number of stages at ${latency}.
`;

// ─── Specs (shared by the testbenches and the timing wrappers) ───────────────

const ADDER: TbSpec = {
  dut: "fast_adder", inputs: [["a", 32], ["b", 32]], output: ["sum", 33], latency: 2,
  expected: "{1'b0, a} + {1'b0, b}",
  directed: ["a = 32'hFFFFFFFF; b = 32'd1;", "a = 32'hFFFFFFFF; b = 32'hFFFFFFFF;", "a = 32'h0000FFFF; b = 32'h00000001;", "a = 0; b = 0;", "a = 32'h80000000; b = 32'h80000000;"],
};

const MAX4: TbSpec = {
  dut: "fast_max4", inputs: [["a", 16], ["b", 16], ["c", 16], ["d", 16]], output: ["m", 16], latency: 2,
  expected: "max2(max2(a, b), max2(c, d))",
  helpers: "    function [15:0] max2(input [15:0] x, input [15:0] y); max2 = x > y ? x : y; endfunction",
  directed: ["a = 1; b = 2; c = 3; d = 4;", "a = 16'hFFFF; b = 0; c = 0; d = 0;", "a = 5; b = 5; c = 5; d = 5;", "a = 0; b = 0; c = 0; d = 16'h8000;", "a = 16'h7FFF; b = 16'h8000; c = 1; d = 16'hFFFE;"],
};

const MULT: TbSpec = {
  dut: "fast_mult", inputs: [["a", 16], ["b", 16]], output: ["p", 32], latency: 3,
  expected: "{16'd0, a} * {16'd0, b}",
  directed: ["a = 16'hFFFF; b = 16'hFFFF;", "a = 0; b = 16'h1234;", "a = 1; b = 16'hABCD;", "a = 16'h8000; b = 2;", "a = 16'h00FF; b = 16'hFF00;"],
};

const POPCOUNT: TbSpec = {
  dut: "fast_popcount", inputs: [["x", 32]], output: ["count", 6], latency: 3,
  expected: "pop(x)",
  helpers: "    function [5:0] pop(input [31:0] v); integer k; begin pop = 0; for (k = 0; k < 32; k = k + 1) pop = pop + v[k]; end endfunction",
  directed: ["x = 0;", "x = 32'hFFFFFFFF;", "x = 32'h80000001;", "x = 32'hAAAAAAAA;", "x = 32'h00010000;"],
};

/** A top module with a register on every input and output of the design, for timing. */
function wrapper(s: TbSpec): string {
  const [out, ow] = s.output;
  const ins = s.inputs.map(([i, w]) => `input [${w - 1}:0] ${i}`).join(", ");
  const regs = s.inputs.map(([i, w]) => `    reg [${w - 1}:0] ${i}_r;`).join("\n");
  const ports = [...s.inputs.map(([i]) => `.${i}(${i}_r)`), `.${out}(${out}_w)`].join(", ");
  const load = s.inputs.map(([i]) => `${i}_r <= ${i};`).join(" ");
  return `module timing_top(input clk, ${ins}, output reg [${ow - 1}:0] ${out});
${regs}
    wire [${ow - 1}:0] ${out}_w;
    ${s.dut} dut (.clk(clk), ${ports});
    always @(posedge clk) begin ${load} ${out} <= ${out}_w; end
endmodule
`;
}

const port = (rows: [string, string, string, string][]) =>
  "| Port | Dir | Width | Meaning |\n|------|-----|-------|---------|\n" + rows.map((r) => `| \`${r[0]}\` | ${r[1]} | ${r[2]} | ${r[3]} |`).join("\n");

export const TIMING_PROBLEMS: ArenaProblem[] = [
  {
    id: "arena-timing-001",
    slug: "fast-adder-32",
    title: "Make It Fast: 32-bit Adder",
    category: "Pipeline",
    difficulty: "Medium",
    tags: ["timing", "pipelining", "adder", "fpga"],
    estimatedMin: 30,
    xpReward: 300,
    timing: { targetMhz: 145, wrapper: wrapper(ADDER) },
    statement: `## Make It Fast: 32-bit Adder

The starter adds two 32-bit numbers correctly, but its 32-bit carry chain is one long path between
registers. Make the adder run at **145 MHz** on an iCE40 FPGA without changing what it computes.

${port([["clk", "in", "1", "Clock"], ["a", "in", "32", "First operand"], ["b", "in", "32", "Second operand"], ["sum", "out", "33", "a + b, including the carry out"]])}

A new pair of operands arrives on every clock edge; \`sum\` shows each result 2 edges later.
${GRADING(145, 130, 2)}`,
    examples: [{ input: "a = 32'hFFFFFFFF, b = 1 (before edge 1)", output: "sum = 33'h100000000 after edge 2" }],
    constraints: ["Keep the module name and ports", "Exactly 2 register stages from inputs to sum", "A new input every cycle (no stalls)"],
    starterCode: `module fast_adder (
    input  wire        clk,
    input  wire [31:0] a,
    input  wire [31:0] b,
    output reg  [32:0] sum
);
    // Correct, but the whole 32-bit addition happens between two registers.
    reg [32:0] stage1;
    always @(posedge clk) begin
        stage1 <= a + b;
        sum    <= stage1;
    end
endmodule
`,
    testbenchSkeleton: pipelineTb("tb_fast_adder", ADDER, 20, 3),
    hiddenTestcases: testcases("fast-adder-32", ADDER),
  },
  {
    id: "arena-timing-002",
    slug: "fast-max4",
    title: "Make It Fast: Maximum of Four",
    category: "Pipeline",
    difficulty: "Medium",
    tags: ["timing", "pipelining", "comparator", "fpga"],
    estimatedMin: 30,
    xpReward: 300,
    timing: { targetMhz: 130, wrapper: wrapper(MAX4) },
    statement: `## Make It Fast: Maximum of Four

The starter finds the largest of four unsigned 16-bit numbers with three comparisons, two of them in a
row, between a pair of registers. Make it run at **130 MHz** on an iCE40 FPGA.

${port([["clk", "in", "1", "Clock"], ["a, b, c, d", "in", "16 each", "Unsigned numbers"], ["m", "out", "16", "The largest of the four"]])}

New numbers arrive on every clock edge; \`m\` shows each result 2 edges later.
${GRADING(130, 88, 2)}`,
    examples: [{ input: "a = 1, b = 2, c = 3, d = 4 (before edge 1)", output: "m = 4 after edge 2" }],
    constraints: ["Keep the module name and ports", "Exactly 2 register stages from inputs to m", "A new input every cycle (no stalls)"],
    starterCode: `module fast_max4 (
    input  wire        clk,
    input  wire [15:0] a, b, c, d,
    output reg  [15:0] m
);
    // Correct, but the second comparison waits for the first two in the same cycle.
    wire [15:0] ab = a > b ? a : b;
    wire [15:0] cd = c > d ? c : d;
    reg  [15:0] stage1;
    always @(posedge clk) begin
        stage1 <= ab > cd ? ab : cd;
        m      <= stage1;
    end
endmodule
`,
    testbenchSkeleton: pipelineTb("tb_fast_max4", MAX4, 20, 3),
    hiddenTestcases: testcases("fast-max4", MAX4),
  },
  {
    id: "arena-timing-003",
    slug: "fast-mult-16",
    title: "Make It Fast: 16×16 Multiplier",
    category: "Pipeline",
    difficulty: "Hard",
    tags: ["timing", "pipelining", "multiplier", "fpga"],
    estimatedMin: 45,
    xpReward: 450,
    timing: { targetMhz: 85, wrapper: wrapper(MULT) },
    statement: `## Make It Fast: 16×16 Multiplier

The iCE40-HX has no hardware multipliers, so \`a * b\` becomes a large array of LUTs and adders.
The starter does the whole product in one clock cycle. Make it run at **85 MHz**.

${port([["clk", "in", "1", "Clock"], ["a", "in", "16", "Unsigned multiplicand"], ["b", "in", "16", "Unsigned multiplier"], ["p", "out", "32", "a × b"]])}

New operands arrive on every clock edge; \`p\` shows each product 3 edges later.
${GRADING(85, 68, 3)}

A product is a sum of partial products: \`a * b = a*b[3:0] + (a*b[7:4] << 4) + ...\`.`,
    examples: [{ input: "a = 16'hFFFF, b = 16'hFFFF (before edge 1)", output: "p = 32'hFFFE0001 after edge 3" }],
    constraints: ["Keep the module name and ports", "Exactly 3 register stages from inputs to p", "A new input every cycle (no stalls)"],
    starterCode: `module fast_mult (
    input  wire        clk,
    input  wire [15:0] a,
    input  wire [15:0] b,
    output reg  [31:0] p
);
    // Correct, but the full 16x16 product is computed in one cycle.
    reg [31:0] stage1, stage2;
    always @(posedge clk) begin
        stage1 <= a * b;
        stage2 <= stage1;
        p      <= stage2;
    end
endmodule
`,
    testbenchSkeleton: pipelineTb("tb_fast_mult", MULT, 20, 3),
    hiddenTestcases: testcases("fast-mult-16", MULT),
  },
  {
    id: "arena-timing-004",
    slug: "fast-popcount-32",
    title: "Make It Fast: Population Count",
    category: "Pipeline",
    difficulty: "Hard",
    tags: ["timing", "pipelining", "adder tree", "fpga"],
    estimatedMin: 40,
    xpReward: 450,
    timing: { targetMhz: 140, wrapper: wrapper(POPCOUNT) },
    statement: `## Make It Fast: Population Count

Count the 1 bits in a 32-bit word. The starter adds the bits one after another in a single cycle.
Make it run at **140 MHz** on an iCE40 FPGA.

${port([["clk", "in", "1", "Clock"], ["x", "in", "32", "The word"], ["count", "out", "6", "Number of 1 bits in x (0 to 32)"]])}

A new word arrives on every clock edge; \`count\` shows each result 3 edges later.
${GRADING(140, 105, 3)}`,
    examples: [{ input: "x = 32'hAAAAAAAA (before edge 1)", output: "count = 16 after edge 3" }],
    constraints: ["Keep the module name and ports", "Exactly 3 register stages from x to count", "A new input every cycle (no stalls)"],
    starterCode: `module fast_popcount (
    input  wire        clk,
    input  wire [31:0] x,
    output reg  [5:0]  count
);
    // Correct, but all 32 additions happen in one cycle.
    reg [5:0] ones, stage1, stage2;
    integer i;
    always @* begin
        ones = 0;
        for (i = 0; i < 32; i = i + 1) ones = ones + x[i];
    end
    always @(posedge clk) begin
        stage1 <= ones;
        stage2 <= stage1;
        count  <= stage2;
    end
endmodule
`,
    testbenchSkeleton: pipelineTb("tb_fast_popcount", POPCOUNT, 20, 3),
    hiddenTestcases: testcases("fast-popcount-32", POPCOUNT),
  },
];
