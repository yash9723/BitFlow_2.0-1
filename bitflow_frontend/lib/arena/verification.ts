/**
 * lib/arena/verification.ts — "find the bugs" problems: the DUT is given and
 * correct; the student writes tb.v. Grading (lib/grading.ts gradeTestbench) runs
 * the testbench on the DUT (must pass) and on hidden one-line mutants of it
 * (each must be caught). Mutants come from the model testbench in the private
 * reference solutions (scripts/import-reference-solutions.ts).
 */

import type { ArenaProblem } from "./types";

const RULES = `
**How it's graded**

The design on the left is **correct**. Your \`tb.v\` must instantiate it as \`dut\`, drive its inputs,
and check its outputs against the specification above.

- On the correct design your testbench must finish (\`$finish\`) without printing \`FAIL\`.
- It is then run against hidden **buggy copies** of the design, each with one small change
  (an operator, a constant, a condition, a clock edge…). A bug counts as caught when your testbench prints a line containing
  \`FAIL\` (or fails to finish).
- Catch every bug to solve the problem. Missed bugs are listed with the line they change.
- Check behaviour through the ports (hierarchical peeks into \`dut\` are fine); reading files with \`$fopen\`, \`$readmemh\`
  and similar is not allowed.
`;

export const VERIFICATION_PROBLEMS: ArenaProblem[] = [
  // ─── 1. ALU slice ──────────────────────────────────────────────────────────
  {
    id: "arena-ver-001",
    slug: "verify-alu4",
    title: "Find the Bugs: 4-bit ALU",
    category: "Verification",
    difficulty: "Easy",
    tags: ["verification", "testbench", "combinational", "alu"],
    estimatedMin: 20,
    xpReward: 200,
    problemType: "testbench",
    statement: `## Find the Bugs: 4-bit ALU

Write a testbench that would catch any small mistake in this 4-bit ALU.

| Port   | Dir | Width | Meaning |
|--------|-----|-------|---------|
| \`a\`, \`b\` | in | 4 | Operands |
| \`op\`   | in  | 2 | \`00\` add, \`01\` subtract (a − b), \`10\` AND, \`11\` XOR |
| \`y\`    | out | 4 | Result, modulo 16 |
| \`zero\` | out | 1 | 1 when \`y\` is 0 |

Tip: a combinational block with only 1024 input combinations can be checked exhaustively against a model you compute in the testbench.
${RULES}`,
    examples: [{ input: "a=9, b=8, op=00", output: "y=1, zero=0", explanation: "9 + 8 = 17, modulo 16 = 1" }],
    constraints: ["Instantiate the design as `dut`", "Print FAIL on any mismatch", "Call $finish"],
    starterCode: `module alu4 (
    input  wire [3:0] a,
    input  wire [3:0] b,
    input  wire [1:0] op,
    output reg  [3:0] y,
    output wire       zero
);
    always @(*) begin
        case (op)
            2'b00:   y = a + b;
            2'b01:   y = a - b;
            2'b10:   y = a & b;
            default: y = a ^ b;
        endcase
    end

    assign zero = (y == 4'd0);
endmodule
`,
    testbenchSkeleton: `module tb;
    reg  [3:0] a, b;
    reg  [1:0] op;
    wire [3:0] y;
    wire       zero;
    integer    errors;

    alu4 dut (.a(a), .b(b), .op(op), .y(y), .zero(zero));

    initial begin
        errors = 0;

        // One example check. Add enough checks to catch any small bug.
        a = 4'd3; b = 4'd4; op = 2'b00; #1;
        if (y !== 4'd7) begin
            $display("FAIL: 3 + 4 gave %0d", y);
            errors = errors + 1;
        end

        // TODO: check every operation, the wrap-around, and the zero flag.

        if (errors == 0) $display("ALL TESTS PASSED");
        $finish;
    end
endmodule
`,
    hiddenTestcases: [],
  },

  // ─── 2. Mod-10 counter ─────────────────────────────────────────────────────
  {
    id: "arena-ver-002",
    slug: "verify-counter-mod10",
    title: "Find the Bugs: Decade Counter",
    category: "Verification",
    difficulty: "Medium",
    tags: ["verification", "testbench", "sequential", "counter"],
    estimatedMin: 25,
    xpReward: 250,
    problemType: "testbench",
    statement: `## Find the Bugs: Decade Counter

Write a testbench for this counter.

| Port    | Dir | Width | Meaning |
|---------|-----|-------|---------|
| \`clk\`   | in  | 1 | Rising-edge clock |
| \`rst\`   | in  | 1 | Synchronous reset (active high): \`count\` becomes 0 |
| \`en\`    | in  | 1 | Count enable: when 0, \`count\` holds |
| \`count\` | out | 4 | Counts 0, 1, …, 9, 0, … on each enabled edge |
| \`tc\`    | out | 1 | Terminal count: 1 when \`en\` is 1 **and** \`count\` is 9 (combinational) |

Think about reset, holding, the wrap from 9 to 0, and exactly when \`tc\` is high.
${RULES}`,
    examples: [{ input: "rst for one edge, then en=1 for 12 edges", output: "count: 1 2 3 4 5 6 7 8 9 0 1 2" }],
    constraints: ["Instantiate the design as `dut`", "Change inputs away from the rising clock edge", "Print FAIL on any mismatch", "Call $finish"],
    starterCode: `module counter_mod10 (
    input  wire       clk,
    input  wire       rst,
    input  wire       en,
    output reg  [3:0] count,
    output wire       tc
);
    assign tc = en && (count == 4'd9);

    always @(posedge clk) begin
        if (rst)
            count <= 4'd0;
        else if (en)
            count <= (count == 4'd9) ? 4'd0 : count + 4'd1;
    end
endmodule
`,
    testbenchSkeleton: `module tb;
    reg        clk, rst, en;
    wire [3:0] count;
    wire       tc;
    integer    errors;

    counter_mod10 dut (.clk(clk), .rst(rst), .en(en), .count(count), .tc(tc));

    initial clk = 0;
    always #5 clk = ~clk;

    initial begin
        errors = 0;
        rst = 1; en = 0;
        @(posedge clk); #1;
        if (count !== 4'd0) begin
            $display("FAIL: count is %0d after reset", count);
            errors = errors + 1;
        end
        rst = 0;

        // TODO: count through a full cycle, check holding, the wrap, and tc.

        if (errors == 0) $display("ALL TESTS PASSED");
        $finish;
    end
endmodule
`,
    hiddenTestcases: [],
  },

  // ─── 3. Priority encoder ───────────────────────────────────────────────────
  {
    id: "arena-ver-003",
    slug: "verify-priority-encoder",
    title: "Find the Bugs: Priority Encoder",
    category: "Verification",
    difficulty: "Medium",
    tags: ["verification", "testbench", "combinational", "encoder"],
    estimatedMin: 20,
    xpReward: 250,
    problemType: "testbench",
    statement: `## Find the Bugs: Priority Encoder

Write a testbench for this 8-input priority encoder.

| Port    | Dir | Width | Meaning |
|---------|-----|-------|---------|
| \`req\`   | in  | 8 | Request lines |
| \`idx\`   | out | 3 | Index of the **highest** set bit of \`req\` (0 when none is set) |
| \`valid\` | out | 1 | 1 when any bit of \`req\` is set |

With 256 possible inputs you can check them all against a reference you compute in the testbench.
${RULES}`,
    examples: [{ input: "req = 8'b0010_0110", output: "idx = 5, valid = 1" }],
    constraints: ["Instantiate the design as `dut`", "Print FAIL on any mismatch", "Call $finish"],
    starterCode: `module prio_enc8 (
    input  wire [7:0] req,
    output reg  [2:0] idx,
    output wire       valid
);
    assign valid = |req;

    always @(*) begin
        idx = 3'd0;
        if      (req[7]) idx = 3'd7;
        else if (req[6]) idx = 3'd6;
        else if (req[5]) idx = 3'd5;
        else if (req[4]) idx = 3'd4;
        else if (req[3]) idx = 3'd3;
        else if (req[2]) idx = 3'd2;
        else if (req[1]) idx = 3'd1;
    end
endmodule
`,
    testbenchSkeleton: `module tb;
    reg  [7:0] req;
    wire [2:0] idx;
    wire       valid;
    integer    errors;

    prio_enc8 dut (.req(req), .idx(idx), .valid(valid));

    initial begin
        errors = 0;

        req = 8'b1000_0000; #1;
        if (idx !== 3'd7 || valid !== 1'b1) begin
            $display("FAIL: req=%b gave idx=%0d valid=%b", req, idx, valid);
            errors = errors + 1;
        end

        // TODO: check the rest of the inputs.

        if (errors == 0) $display("ALL TESTS PASSED");
        $finish;
    end
endmodule
`,
    hiddenTestcases: [],
  },

  // ─── 4. Sequence detector ──────────────────────────────────────────────────
  {
    id: "arena-ver-004",
    slug: "verify-seq-1011",
    title: "Find the Bugs: 1011 Detector",
    category: "Verification",
    difficulty: "Hard",
    tags: ["verification", "testbench", "fsm", "sequence-detector"],
    estimatedMin: 35,
    xpReward: 350,
    problemType: "testbench",
    statement: `## Find the Bugs: 1011 Detector

Write a testbench for this Moore sequence detector.

| Port    | Dir | Width | Meaning |
|---------|-----|-------|---------|
| \`clk\`   | in  | 1 | Rising-edge clock; \`din\` is sampled on each edge |
| \`rst\`   | in  | 1 | Synchronous reset (active high) |
| \`din\`   | in  | 1 | Serial input |
| \`found\` | out | 1 | 1 for the cycle after the edge that completed \`1011\` |

Overlapping matches count: in \`1011011\` the pattern ends twice (after the 4th and the 7th bit).

A good testbench keeps its own model of the last few bits and compares \`found\` after every edge,
on long pseudo-random streams as well as hand-picked ones.
${RULES}`,
    examples: [{ input: "din: 1 0 1 1 0 1 1", output: "found after bit 4 and bit 7" }],
    constraints: ["Instantiate the design as `dut`", "Change inputs away from the rising clock edge", "Print FAIL on any mismatch", "Call $finish"],
    starterCode: `module seq1011 (
    input  wire clk,
    input  wire rst,
    input  wire din,
    output wire found
);
    localparam S0 = 3'd0, S1 = 3'd1, S10 = 3'd2, S101 = 3'd3, S1011 = 3'd4;
    reg [2:0] state;

    always @(posedge clk) begin
        if (rst) state <= S0;
        else case (state)
            S0:      state <= din ? S1    : S0;
            S1:      state <= din ? S1    : S10;
            S10:     state <= din ? S101  : S0;
            S101:    state <= din ? S1011 : S10;
            S1011:   state <= din ? S1    : S10;
            default: state <= S0;
        endcase
    end

    assign found = (state == S1011);
endmodule
`,
    testbenchSkeleton: `module tb;
    reg  clk, rst, din;
    wire found;
    integer errors;

    seq1011 dut (.clk(clk), .rst(rst), .din(din), .found(found));

    initial clk = 0;
    always #5 clk = ~clk;

    task send(input b);
        begin
            din = b;
            @(posedge clk); #1;
        end
    endtask

    initial begin
        errors = 0;
        rst = 1; din = 0;
        @(posedge clk); #1;
        rst = 0;

        send(1); send(0); send(1); send(1);
        if (found !== 1'b1) begin
            $display("FAIL: 1011 not detected");
            errors = errors + 1;
        end

        // TODO: check found on every cycle, overlaps, near-misses and reset.

        if (errors == 0) $display("ALL TESTS PASSED");
        $finish;
    end
endmodule
`,
    hiddenTestcases: [],
  },

  // ─── 5. FIFO ───────────────────────────────────────────────────────────────
  {
    id: "arena-ver-005",
    slug: "verify-fifo4",
    title: "Find the Bugs: 4-Deep FIFO",
    category: "Verification",
    difficulty: "Hard",
    tags: ["verification", "testbench", "sequential", "fifo"],
    estimatedMin: 40,
    xpReward: 400,
    problemType: "testbench",
    statement: `## Find the Bugs: 4-Deep FIFO

Write a testbench for this synchronous FIFO (4 entries of 8 bits).

| Port    | Dir | Width | Meaning |
|---------|-----|-------|---------|
| \`clk\`   | in  | 1 | Rising-edge clock |
| \`rst\`   | in  | 1 | Synchronous reset: the FIFO becomes empty |
| \`wr_en\` | in  | 1 | Write \`din\` on this edge (ignored when full) |
| \`rd_en\` | in  | 1 | Remove the oldest entry on this edge (ignored when empty) |
| \`din\`   | in  | 8 | Data to write |
| \`dout\`  | out | 8 | The oldest entry, visible while not empty (no read latency) |
| \`full\`  | out | 1 | 1 when holding 4 entries |
| \`empty\` | out | 1 | 1 when holding none |

Reads and writes in the same cycle both happen (when allowed). Model the queue in your testbench
and compare \`dout\`, \`full\` and \`empty\` after every edge, including writes when full and reads when empty.
${RULES}`,
    examples: [{ input: "write 10, 20; read", output: "dout 10, then 20" }],
    constraints: ["Instantiate the design as `dut`", "Change inputs away from the rising clock edge", "Print FAIL on any mismatch", "Call $finish"],
    starterCode: `module fifo4 (
    input  wire       clk,
    input  wire       rst,
    input  wire       wr_en,
    input  wire       rd_en,
    input  wire [7:0] din,
    output wire [7:0] dout,
    output wire       full,
    output wire       empty
);
    reg [7:0] mem [0:3];
    reg [1:0] wptr, rptr;
    reg [2:0] cnt;

    wire do_wr = wr_en && !full;
    wire do_rd = rd_en && !empty;

    assign full  = (cnt == 3'd4);
    assign empty = (cnt == 3'd0);
    assign dout  = mem[rptr];

    always @(posedge clk) begin
        if (rst) begin
            wptr <= 2'd0;
            rptr <= 2'd0;
            cnt  <= 3'd0;
        end else begin
            if (do_wr) begin
                mem[wptr] <= din;
                wptr      <= wptr + 2'd1;
            end
            if (do_rd)
                rptr <= rptr + 2'd1;
            cnt <= cnt + do_wr - do_rd;
        end
    end
endmodule
`,
    testbenchSkeleton: `module tb;
    reg        clk, rst, wr_en, rd_en;
    reg  [7:0] din;
    wire [7:0] dout;
    wire       full, empty;
    integer    errors;

    fifo4 dut (.clk(clk), .rst(rst), .wr_en(wr_en), .rd_en(rd_en), .din(din),
               .dout(dout), .full(full), .empty(empty));

    initial clk = 0;
    always #5 clk = ~clk;

    initial begin
        errors = 0;
        rst = 1; wr_en = 0; rd_en = 0; din = 0;
        @(posedge clk); #1;
        rst = 0;
        if (empty !== 1'b1) begin
            $display("FAIL: not empty after reset");
            errors = errors + 1;
        end

        // TODO: write and read entries and check dout, full and empty after every edge.

        if (errors == 0) $display("ALL TESTS PASSED");
        $finish;
    end
endmodule
`,
    hiddenTestcases: [],
  },
];
