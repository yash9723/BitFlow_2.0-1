/**
 * lib/arena/formal.ts — "prove it" problems: the DUT is given and correct; the
 * student writes a property harness (assert/assume/cover). Grading (lib/grading.ts
 * gradeFormal) runs a bounded formal check (Yosys + Z3, 20 cycles) of the harness on
 * the DUT (no assertion may fail) and on hidden one-line mutants of it (each must
 * make an assertion fail). Mutants come from the model harness in the private
 * reference solutions (scripts/import-reference-solutions.ts).
 */

import type { ArenaProblem } from "./types";

const RULES = `
**How it's graded**

The design on the left is **correct**. In \`harness.v\` you write a top module whose inputs are left
free: the solver may drive them with *any* values, cycle by cycle, and searches for a sequence that
breaks one of your \`assert\`s. Use \`assume\` to rule out inputs the design never has to handle.

- On the correct design no assertion may fail within 20 clock cycles.
- It is then checked against hidden **buggy copies** of the design, each with one small change
  (an operator, a constant, a condition…). A bug counts as caught when one of your assertions fails.
- Catch every bug to solve the problem. **Run** checks your harness on the correct design and shows a
  counterexample waveform when an assertion fails.

Handy tools: \`$past(x)\` is \`x\` one clock earlier; a \`past_valid\` register (0 in the first cycle,
then 1) keeps \`$past\` from looking before the start; a few registers in the harness can model what
the design *should* do, and you assert the design matches.
`;

/** Opening lines shared by every harness skeleton. */
const PAST_VALID = `    // past_valid is 0 in the first cycle only, so $past() never looks before the start.
    reg past_valid = 1'b0;
    always @(posedge clk) past_valid <= 1'b1;
    always @(*) if (!past_valid) assume(rst);    // begin in reset`;

export const FORMAL_PROBLEMS: ArenaProblem[] = [
  // ─── 1. Decade counter ─────────────────────────────────────────────────────
  {
    id: "arena-formal-001",
    slug: "prove-decade-counter",
    title: "Prove It: Decade Counter",
    category: "Formal",
    difficulty: "Easy",
    tags: ["formal", "assertions", "counter"],
    estimatedMin: 20,
    xpReward: 200,
    problemType: "formal",
    statement: `## Prove It: Decade Counter

Write properties that pin down this decimal counter so tightly that any small change to it breaks one.

| Port    | Dir | Width | Meaning |
|---------|-----|-------|---------|
| \`rst\`   | in  | 1 | Synchronous reset: \`q\` becomes 0 on the next edge |
| \`en\`    | in  | 1 | Count on the next edge when 1, hold when 0 |
| \`q\`     | out | 4 | Counts 0, 1, …, 9, 0, … |
| \`carry\` | out | 1 | 1 exactly while \`en\` is 1 and \`q\` is 9 (the next edge wraps) |
${RULES}`,
    examples: [{ input: "q = 9, en = 1", output: "carry = 1; q = 0 after the edge" }],
    constraints: ["Write the properties in harness.v", "Instantiate the design as dut", "No file I/O"],
    starterCode: `module decade_counter (
    input  wire       clk,
    input  wire       rst,
    input  wire       en,
    output reg  [3:0] q,
    output wire       carry
);
    always @(posedge clk) begin
        if (rst)
            q <= 4'd0;
        else if (en)
            q <= (q == 4'd9) ? 4'd0 : q + 4'd1;
    end

    assign carry = en && (q == 4'd9);
endmodule
`,
    testbenchSkeleton: `module formal_tb (
    input wire clk,
    input wire rst,
    input wire en
);
    wire [3:0] q;
    wire       carry;

    decade_counter dut (.clk(clk), .rst(rst), .en(en), .q(q), .carry(carry));

${PAST_VALID}

    always @(posedge clk) begin
        if (past_valid) begin
            assert(q <= 4'd9);                     // example: q never leaves 0..9
            // TODO: what is q after a reset? when en was 0? when en was 1?
        end
    end

    // TODO: when exactly is carry 1?
endmodule
`,
    hiddenTestcases: [],
  },

  // ─── 2. Round-robin arbiter ────────────────────────────────────────────────
  {
    id: "arena-formal-002",
    slug: "prove-round-robin-arbiter",
    title: "Prove It: Round-Robin Arbiter",
    category: "Formal",
    difficulty: "Medium",
    tags: ["formal", "assertions", "arbiter", "fairness"],
    estimatedMin: 30,
    xpReward: 300,
    problemType: "formal",
    statement: `## Prove It: Round-Robin Arbiter

Four requesters share one bus. Each cycle the arbiter grants the bus for the **next** cycle to one of
the requesters asking now, searching round-robin from the one after the last winner.

| Port    | Dir | Width | Meaning |
|---------|-----|-------|---------|
| \`rst\`   | in  | 1 | Synchronous reset: no grant; requester 0 has priority next |
| \`req\`   | in  | 4 | \`req[i]\` = requester *i* wants the bus |
| \`grant\` | out | 4 | One-hot (or 0): who owns the bus this cycle |

Properties worth proving: at most one grant; a grant only goes to a requester that asked in the
previous cycle; if anyone asked, someone is granted; nobody who keeps asking waits too long; and the
search really starts after the last winner.
${RULES}`,
    examples: [{ input: "last winner 1, req = 1011", output: "grant = 1000 next cycle (search order 2, 3, 0, 1)" }],
    constraints: ["Write the properties in harness.v", "Instantiate the design as dut", "No file I/O"],
    starterCode: `module rr_arbiter (
    input  wire       clk,
    input  wire       rst,
    input  wire [3:0] req,
    output reg  [3:0] grant
);
    reg [1:0] last;          // index of the most recent winner
    reg [3:0] next;
    reg [1:0] next_idx, idx;
    integer   i;

    always @(*) begin
        next     = 4'b0000;
        next_idx = last;
        for (i = 1; i <= 4; i = i + 1) begin
            idx = last + i;
            if (next == 4'b0000 && req[idx]) begin
                next     = 4'b0001 << idx;
                next_idx = idx;
            end
        end
    end

    always @(posedge clk) begin
        if (rst) begin
            grant <= 4'b0000;
            last  <= 2'd3;
        end else begin
            grant <= next;
            last  <= next_idx;
        end
    end
endmodule
`,
    testbenchSkeleton: `module formal_tb (
    input wire       clk,
    input wire       rst,
    input wire [3:0] req
);
    wire [3:0] grant;

    rr_arbiter dut (.clk(clk), .rst(rst), .req(req), .grant(grant));

${PAST_VALID}

    always @(posedge clk) begin
        if (past_valid) begin
            assert((grant & (grant - 4'd1)) == 4'd0);   // example: at most one grant
            // TODO: grants only go to requesters that asked last cycle
            // TODO: if anyone asked (and there was no reset), someone is granted
            // TODO: round-robin order: model "last winner" here and check who wins next
        end
    end
endmodule
`,
    hiddenTestcases: [],
  },

  // ─── 3. FIFO ───────────────────────────────────────────────────────────────
  {
    id: "arena-formal-003",
    slug: "prove-fifo4",
    formalDepth: 12,             // the solver slows sharply past ~12 cycles here; every bug shows within 12
    title: "Prove It: 4-Entry FIFO",
    category: "Formal",
    difficulty: "Medium",
    tags: ["formal", "assertions", "fifo", "memory"],
    estimatedMin: 35,
    xpReward: 300,
    problemType: "formal",
    statement: `## Prove It: 4-Entry FIFO

A first-in first-out buffer of four bytes. Writes when full and reads when empty are ignored.

| Port      | Dir | Width | Meaning |
|-----------|-----|-------|---------|
| \`rst\`     | in  | 1 | Synchronous reset: empty |
| \`wr_en\`   | in  | 1 | Push \`din\` on the next edge (ignored when \`full\`) |
| \`din\`     | in  | 8 | Byte to push |
| \`rd_en\`   | in  | 1 | Pop the oldest byte on the next edge (ignored when \`empty\`) |
| \`dout\`    | out | 8 | The oldest byte (meaningful when not \`empty\`) |
| \`count\`   | out | 3 | Bytes stored, 0..4 |
| \`full\`, \`empty\` | out | 1 | \`count == 4\`, \`count == 0\` |

Tip: keep a model of the FIFO in the harness (a count, and the queued bytes) and assert the design agrees with it.
${RULES.replace("within 20 clock cycles", "within 12 clock cycles")}`,
    examples: [{ input: "push 0x11, push 0x22, pop", output: "dout = 0x22, count = 1" }],
    constraints: ["Write the properties in harness.v", "Instantiate the design as dut", "No file I/O"],
    starterCode: `module fifo4 (
    input  wire       clk,
    input  wire       rst,
    input  wire       wr_en,
    input  wire [7:0] din,
    input  wire       rd_en,
    output wire [7:0] dout,
    output reg  [2:0] count,
    output wire       full,
    output wire       empty
);
    reg  [7:0] mem0, mem1, mem2, mem3;
    reg  [1:0] wp, rp;
    wire       do_wr = wr_en && !full;
    wire       do_rd = rd_en && !empty;

    always @(posedge clk) begin
        if (rst) begin
            wp    <= 2'd0;
            rp    <= 2'd0;
            count <= 3'd0;
        end else begin
            if (do_wr) begin
                case (wp)
                    2'd0: mem0 <= din;
                    2'd1: mem1 <= din;
                    2'd2: mem2 <= din;
                    2'd3: mem3 <= din;
                endcase
                wp <= wp + 2'd1;
            end
            if (do_rd) rp <= rp + 2'd1;
            count <= count + do_wr - do_rd;
        end
    end

    assign full  = (count == 3'd4);
    assign empty = (count == 3'd0);
    assign dout  = (rp == 2'd0) ? mem0 : (rp == 2'd1) ? mem1 : (rp == 2'd2) ? mem2 : mem3;
endmodule
`,
    testbenchSkeleton: `module formal_tb (
    input wire       clk,
    input wire       rst,
    input wire       wr_en,
    input wire [7:0] din,
    input wire       rd_en
);
    wire [7:0] dout;
    wire [2:0] count;
    wire       full, empty;

    fifo4 dut (.clk(clk), .rst(rst), .wr_en(wr_en), .din(din), .rd_en(rd_en),
               .dout(dout), .count(count), .full(full), .empty(empty));

${PAST_VALID}

    always @(posedge clk) begin
        if (past_valid) begin
            assert(count <= 3'd4);                 // example: never more than 4 stored
            // TODO: full and empty agree with count
            // TODO: count goes up on an accepted push, down on an accepted pop
            // TODO: dout is the oldest byte still stored (model the queue here)
        end
    end
endmodule
`,
    hiddenTestcases: [],
  },

  // ─── 4. Valid/ready register slice ─────────────────────────────────────────
  {
    id: "arena-formal-004",
    slug: "prove-register-slice",
    title: "Prove It: Valid/Ready Register Slice",
    category: "Formal",
    difficulty: "Hard",
    tags: ["formal", "assertions", "handshake", "axi-stream"],
    estimatedMin: 35,
    xpReward: 350,
    problemType: "formal",
    statement: `## Prove It: Valid/Ready Register Slice

A one-entry pipeline stage on a valid/ready stream (as in AXI-Stream). A byte moves across an interface
in a cycle where both \`valid\` and \`ready\` are 1.

| Port        | Dir | Width | Meaning |
|-------------|-----|-------|---------|
| \`rst\`       | in  | 1 | Synchronous reset: holds nothing |
| \`in_valid\`  | in  | 1 | Upstream offers \`in_data\` |
| \`in_ready\`  | out | 1 | The slice can take a byte this cycle: it is empty, or its byte leaves this cycle |
| \`in_data\`   | in  | 8 | |
| \`out_valid\` | out | 1 | The slice holds a byte for downstream |
| \`out_ready\` | in  | 1 | Downstream takes the byte this cycle |
| \`out_data\`  | out | 8 | |

The stream rules: once \`out_valid\` is 1 it stays 1 with the **same** data until the byte is taken;
a byte taken in comes out on the next cycle; nothing is lost or duplicated.
${RULES}`,
    examples: [{ input: "in_valid=1, in_data=0x5A, in_ready=1", output: "next cycle out_valid=1, out_data=0x5A" }],
    constraints: ["Write the properties in harness.v", "Instantiate the design as dut", "No file I/O"],
    starterCode: `module reg_slice (
    input  wire       clk,
    input  wire       rst,
    input  wire       in_valid,
    output wire       in_ready,
    input  wire [7:0] in_data,
    output reg        out_valid,
    input  wire       out_ready,
    output reg  [7:0] out_data
);
    assign in_ready = !out_valid || out_ready;

    always @(posedge clk) begin
        if (rst)
            out_valid <= 1'b0;
        else if (in_ready)
            out_valid <= in_valid;

        if (in_ready && in_valid)
            out_data <= in_data;
    end
endmodule
`,
    testbenchSkeleton: `module formal_tb (
    input wire       clk,
    input wire       rst,
    input wire       in_valid,
    input wire [7:0] in_data,
    input wire       out_ready
);
    wire       in_ready, out_valid;
    wire [7:0] out_data;

    reg_slice dut (.clk(clk), .rst(rst), .in_valid(in_valid), .in_ready(in_ready), .in_data(in_data),
                   .out_valid(out_valid), .out_ready(out_ready), .out_data(out_data));

${PAST_VALID}

    always @(posedge clk) begin
        if (past_valid && !$past(rst)) begin
            // example: a byte that wasn't taken stays offered
            if ($past(out_valid) && !$past(out_ready)) assert(out_valid);
            // TODO: ...with the same data
            // TODO: a byte taken in appears on the output next cycle
        end
    end
    // TODO: when must in_ready be 1? When must out_valid be 0?
endmodule
`,
    hiddenTestcases: [],
  },

  // ─── 5. Traffic-light crossing ─────────────────────────────────────────────
  {
    id: "arena-formal-005",
    slug: "prove-traffic-crossing",
    title: "Prove It: Traffic Crossing Safety",
    category: "Formal",
    difficulty: "Hard",
    tags: ["formal", "assertions", "fsm", "safety"],
    estimatedMin: 35,
    xpReward: 350,
    problemType: "formal",
    statement: `## Prove It: Traffic Crossing Safety

A controller for a crossing of a north-south (\`ns\`) and an east-west (\`ew\`) road. Each light is
0 = red, 1 = yellow, 2 = green.

After reset north-south is green. Each road's green lasts **6** cycles, then yellow **2** cycles, then
that road turns red and the other road turns green.

Prove safety (the two roads are never both allowed to move) and the timing: every green lasts exactly
6 cycles, every yellow exactly 2, and the lights only change in the order green → yellow → red.
${RULES}`,
    examples: [{ input: "reset, then 6 cycles", output: "ns: green ×6, yellow ×2, red …; ew: red ×8, then green" }],
    constraints: ["Write the properties in harness.v", "Instantiate the design as dut", "No file I/O"],
    starterCode: `module crossing (
    input  wire       clk,
    input  wire       rst,
    output reg  [1:0] ns,
    output reg  [1:0] ew
);
    localparam NS_GO = 2'd0, NS_SLOW = 2'd1, EW_GO = 2'd2, EW_SLOW = 2'd3;
    localparam RED = 2'd0, YELLOW = 2'd1, GREEN = 2'd2;

    reg [1:0] state;
    reg [2:0] t;        // cycles spent in the current state

    always @(posedge clk) begin
        if (rst) begin
            state <= NS_GO;
            t     <= 3'd0;
        end else begin
            t <= t + 3'd1;
            case (state)
                NS_GO:   if (t == 3'd5) begin state <= NS_SLOW; t <= 3'd0; end
                NS_SLOW: if (t == 3'd1) begin state <= EW_GO;   t <= 3'd0; end
                EW_GO:   if (t == 3'd5) begin state <= EW_SLOW; t <= 3'd0; end
                EW_SLOW: if (t == 3'd1) begin state <= NS_GO;   t <= 3'd0; end
            endcase
        end
    end

    always @(*) begin
        ns = RED;
        ew = RED;
        case (state)
            NS_GO:   ns = GREEN;
            NS_SLOW: ns = YELLOW;
            EW_GO:   ew = GREEN;
            EW_SLOW: ew = YELLOW;
        endcase
    end
endmodule
`,
    testbenchSkeleton: `module formal_tb (
    input wire clk,
    input wire rst
);
    wire [1:0] ns, ew;

    crossing dut (.clk(clk), .rst(rst), .ns(ns), .ew(ew));

${PAST_VALID}

    // example: at least one road is red at all times
    always @(*) if (past_valid) assert(ns == 2'd0 || ew == 2'd0);

    // TODO: after a reset, north-south is green
    // TODO: a light only goes green -> yellow -> red (-> green)
    // TODO: count how long each colour lasts; assert green = 6 and yellow = 2 cycles
endmodule
`,
    hiddenTestcases: [],
  },
];
