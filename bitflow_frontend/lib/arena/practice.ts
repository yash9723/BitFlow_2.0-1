/**
 * lib/arena/practice.ts — Arena problems for the Combinational, Arithmetic, Sequential,
 * Protocol and Memory categories. Each hidden testcase has its own model of the design and
 * prints ALL TESTS PASSED or FAIL lines. Reference solutions: private/reference-solutions.json.
 */
import type { ArenaProblem, ArenaTestcase } from "./types";

const TS = "`timescale 1ns / 1ps";
const END = `        if (errors == 0) $display("ALL TESTS PASSED");
        else $display("TESTS FAILED: %0d error(s)", errors);
        $finish;`;
const tc = (id: string, description: string, testbench: string, weight = 50): ArenaTestcase => ({ id, description, testbench, expected: "ALL TESTS PASSED", weight });

// ─── Hamming(7,4) single-error correction ────────────────────────────────────

const HAMMING_ENCODE = `    function [6:0] encode; input [3:0] d;
        reg p1, p2, p4;
        begin
            p1 = d[0] ^ d[1] ^ d[3];
            p2 = d[0] ^ d[2] ^ d[3];
            p4 = d[1] ^ d[2] ^ d[3];
            encode = {d[3], d[2], d[1], p4, d[0], p2, p1};
        end
    endfunction`;

const hamming: ArenaProblem = {
  id: "arena-prac-001", slug: "hamming-7-4-corrector", title: "Hamming(7,4) Error Corrector", category: "Combinational",
  difficulty: "Medium", tags: ["ecc", "hamming", "xor", "syndrome"], estimatedMin: 25, xpReward: 250,
  statement: `## Hamming(7,4) Error Corrector

Memories and links protect data with error-correcting codes. Hamming(7,4) adds 3 parity bits to 4 data bits so that **any single flipped bit can be found and fixed**.

Bit positions 1…7 of the codeword map to \`code[0]\`…\`code[6]\`:

| position | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|----------|---|---|---|---|---|---|---|
| bit | p1 | p2 | d1 | p4 | d2 | d3 | d4 |
| \`code[i]\` | 0 | 1 | 2 | 3 | 4 | 5 | 6 |

The sender sets \`p1 = d1^d2^d4\`, \`p2 = d1^d3^d4\`, \`p4 = d2^d3^d4\`. The receiver recomputes three checks over positions:
- \`s1\` = XOR of positions 1, 3, 5, 7;
- \`s2\` = XOR of positions 2, 3, 6, 7;
- \`s4\` = XOR of positions 4, 5, 6, 7.

The **syndrome** \`{s4, s2, s1}\` is 0 for a good codeword, otherwise the position (1…7) of the flipped bit.

Design \`hamming74_dec\`: input \`code[6:0]\`, outputs \`data[3:0]\` = \`{d4, d3, d2, d1}\` **after correcting** a single-bit error, and \`error\` = 1 when the syndrome is non-zero.`,
  examples: [
    { input: "code = 7'b1010101 (data 4'b1011, no error)", output: "data = 4'b1011, error = 0" },
    { input: "the same with position 6 flipped: 7'b1110101", output: "data = 4'b1011, error = 1" },
  ],
  constraints: ["Combinational.", "Correct exactly one bit when the syndrome is non-zero."],
  starterCode: `${TS}

module hamming74_dec (
    input  wire [6:0] code,
    output wire [3:0] data,
    output wire       error
);

    // TODO: compute the syndrome and flip the bit it points at
    assign data  = {code[6], code[5], code[4], code[2]};
    assign error = 1'b0;

endmodule
`,
  testbenchSkeleton: `${TS}
module tb_hamming74_dec;
    reg [6:0] code; wire [3:0] data; wire error;
    hamming74_dec dut (.code(code), .data(data), .error(error));
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_hamming74_dec); end
    initial begin
        code = 7'b1010101; #10 $display("code=%b -> data=%b error=%b (expect 1011 0)", code, data, error);
        code = 7'b1110101; #10 $display("code=%b -> data=%b error=%b (expect 1011 1)", code, data, error);
        $finish;
    end
endmodule
`,
  hiddenTestcases: [
    tc("tc-1", "Every valid codeword decodes with no error", `${TS}
module tb_hamming_clean;
    reg [6:0] code; wire [3:0] data; wire error;
    integer d, errors;
    hamming74_dec dut (.code(code), .data(data), .error(error));
${HAMMING_ENCODE}
    initial begin
        errors = 0;
        for (d = 0; d < 16; d = d + 1) begin
            code = encode(d[3:0]); #2;
            if (data !== d[3:0] || error !== 1'b0) begin $display("FAIL: code=%b: data=%b error=%b, expected %b 0", code, data, error, d[3:0]); errors = errors + 1; end
        end
${END}
    end
endmodule
`),
    tc("tc-2", "Every single-bit error is corrected and flagged", `${TS}
module tb_hamming_flip;
    reg [6:0] code; wire [3:0] data; wire error;
    integer d, k, errors;
    hamming74_dec dut (.code(code), .data(data), .error(error));
${HAMMING_ENCODE}
    initial begin
        errors = 0;
        for (d = 0; d < 16; d = d + 1)
            for (k = 0; k < 7; k = k + 1) begin
                code = encode(d[3:0]) ^ (7'd1 << k); #2;
                if (data !== d[3:0] || error !== 1'b1) begin $display("FAIL: data %b with code bit %0d flipped (%b): data=%b error=%b, expected %b 1", d[3:0], k, code, data, error, d[3:0]); errors = errors + 1; end
            end
${END}
    end
endmodule
`),
  ],
};

// ─── Saturating signed addition ──────────────────────────────────────────────

const saturatingAdd: ArenaProblem = {
  id: "arena-prac-002", slug: "saturating-add-signed", title: "Saturating Signed Adder", category: "Arithmetic",
  difficulty: "Easy", tags: ["signed", "overflow", "dsp", "saturation"], estimatedMin: 15, xpReward: 150,
  statement: `## Saturating Signed Adder

In audio and video processing, overflow must not wrap around (a loud sample turning into a negative one clicks horribly). Instead the result **saturates** at the largest or smallest value.

Add two signed 8-bit numbers \`a\` and \`b\` (−128 … 127):

- if the true sum is above 127, \`y\` = 127 (8'h7F);
- if it is below −128, \`y\` = −128 (8'h80);
- otherwise \`y\` is the sum.

\`sat\` = 1 when the result was clamped.

Signed overflow happens exactly when both operands have the same sign and the sum's sign differs.`,
  examples: [
    { input: "a=100, b=50", output: "y=127, sat=1" },
    { input: "a=-100, b=-50", output: "y=-128, sat=1" },
    { input: "a=-100, b=50", output: "y=-50, sat=0" },
  ],
  constraints: ["Combinational.", "All 65 536 input pairs are tested."],
  starterCode: `${TS}

module sat_add8 (
    input  wire [7:0] a,      // signed
    input  wire [7:0] b,      // signed
    output wire [7:0] y,      // signed, saturated
    output wire       sat
);

    // TODO: clamp on overflow instead of wrapping
    assign y   = a + b;
    assign sat = 1'b0;

endmodule
`,
  testbenchSkeleton: `${TS}
module tb_sat_add8;
    reg [7:0] a, b; wire [7:0] y; wire sat;
    sat_add8 dut (.a(a), .b(b), .y(y), .sat(sat));
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_sat_add8); end
    initial begin
        a = 100;  b = 50;   #10 $display("100 + 50 -> %0d sat=%b (expect 127 1)", $signed(y), sat);
        a = -100; b = -50;  #10 $display("-100 + -50 -> %0d sat=%b (expect -128 1)", $signed(y), sat);
        a = -100; b = 50;   #10 $display("-100 + 50 -> %0d sat=%b (expect -50 0)", $signed(y), sat);
        $finish;
    end
endmodule
`,
  hiddenTestcases: [
    tc("tc-1", "All 65 536 pairs", `${TS}
module tb_sat_add8_all;
    reg [7:0] a, b; wire [7:0] y; wire sat;
    integer i, j, sa, sb, s, ey, es, errors;
    sat_add8 dut (.a(a), .b(b), .y(y), .sat(sat));
    initial begin
        errors = 0;
        for (i = 0; i < 256; i = i + 1)
            for (j = 0; j < 256; j = j + 1) begin
                a = i[7:0]; b = j[7:0]; #1;
                sa = i; if (i > 127) sa = i - 256;
                sb = j; if (j > 127) sb = j - 256;
                s = sa + sb; es = 0;
                if (s > 127) begin s = 127; es = 1; end
                if (s < -128) begin s = -128; es = 1; end
                ey = s & 255;
                if (y !== ey || sat !== es) begin
                    if (errors < 10) $display("FAIL: %0d + %0d: y=%0d sat=%b, expected %0d %0d", sa, sb, $signed(y), sat, s, es);
                    errors = errors + 1;
                end
            end
${END}
    end
endmodule
`, 100),
  ],
};

// ─── Find first set ──────────────────────────────────────────────────────────

const ffs: ArenaProblem = {
  id: "arena-prac-003", slug: "find-first-set-32", title: "Find First Set (32-bit)", category: "Combinational",
  difficulty: "Easy", tags: ["priority", "ffs", "for-loop", "scheduler"], estimatedMin: 15, xpReward: 150,
  statement: `## Find First Set (32-bit)

The C library's \`ffs(x)\` returns the position of the **least significant** set bit, counting from 1, or 0 when \`x\` is 0. Hardware schedulers and interrupt controllers use the same function to pick the lowest-numbered request.

Design \`ffs32\`: input \`x[31:0]\`, output \`pos[5:0]\`:

| x | pos |
|---|-----|
| 32'h0000_0000 | 0 |
| 32'h0000_0001 | 1 |
| 32'h0000_0050 | 5 (bits 4 and 6 set; bit 4 is lowest) |
| 32'h8000_0000 | 32 |`,
  examples: [{ input: "x=32'h0000_0100", output: "pos=9" }],
  constraints: ["Combinational.", "pos needs 6 bits (0…32)."],
  starterCode: `${TS}

module ffs32 (
    input  wire [31:0] x,
    output reg  [5:0]  pos
);

    always @(*) begin
        pos = 6'd0;
        // TODO: 1 + the index of the lowest set bit (0 when x is 0)
    end

endmodule
`,
  testbenchSkeleton: `${TS}
module tb_ffs32;
    reg [31:0] x; wire [5:0] pos;
    ffs32 dut (.x(x), .pos(pos));
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_ffs32); end
    initial begin
        x = 32'h0;        #10 $display("x=%h -> pos=%0d (expect 0)", x, pos);
        x = 32'h1;        #10 $display("x=%h -> pos=%0d (expect 1)", x, pos);
        x = 32'h50;       #10 $display("x=%h -> pos=%0d (expect 5)", x, pos);
        x = 32'h80000000; #10 $display("x=%h -> pos=%0d (expect 32)", x, pos);
        $finish;
    end
endmodule
`,
  hiddenTestcases: [
    tc("tc-1", "Zero, every single bit, and random values", `${TS}
module tb_ffs32_hidden;
    reg [31:0] x; wire [5:0] pos;
    integer i, k, exp, seed, errors;
    ffs32 dut (.x(x), .pos(pos));
    initial begin
        errors = 0; seed = 3;
        for (i = 0; i < 3000; i = i + 1) begin
            if (i == 0) x = 0;
            else if (i <= 32) x = 32'd1 << (i - 1);
            else if (i <= 64) x = 32'hFFFFFFFF << (i - 33);
            else begin x = $random(seed); x = x & ($random(seed) << (i % 31)); end
            #1;
            exp = 0;
            for (k = 31; k >= 0; k = k - 1) if (x[k]) exp = k + 1;
            if (pos !== exp) begin if (errors < 10) $display("FAIL: x=%h: pos=%0d, expected %0d", x, pos, exp); errors = errors + 1; end
        end
${END}
    end
endmodule
`, 100),
  ],
};

// ─── Moving average ──────────────────────────────────────────────────────────

const movingAverage: ArenaProblem = {
  id: "arena-prac-004", slug: "moving-average-4", title: "Moving Average of 4", category: "Sequential",
  difficulty: "Medium", tags: ["filter", "dsp", "shift-register", "average"], estimatedMin: 20, xpReward: 220,
  statement: `## Moving Average of 4

A moving-average filter smooths a noisy sensor by averaging the last few samples. Keep the last **4 valid samples** of an 8-bit unsigned input and output their average, rounded down.

- On a rising edge with \`valid\` = 1, \`x\` enters the window and the oldest sample leaves;
- \`avg\` = (sum of the 4 samples in the window) / 4, rounded down, combinational from the stored samples;
- \`rst\` (synchronous) fills the window with zeros.

| valid samples so far | window | avg |
|----------------------|--------|-----|
| (after reset) | 0 0 0 0 | 0 |
| 100 | 100 0 0 0 | 25 |
| 100, 200 | 200 100 0 0 | 75 |
| 100, 200, 50, 30, 10 | 10 30 50 200 | 72 |

Dividing by 4 is just dropping 2 bits; the sum needs 10 bits.`,
  examples: [{ input: "samples 4, 4, 4, 4", output: "avg = 1, 2, 3, 4 (one per sample)" }],
  constraints: ["Samples with valid = 0 are ignored.", "Keep the sum wide enough: 4 × 255 = 1020."],
  starterCode: `${TS}

module mavg4 (
    input  wire       clk,
    input  wire       rst,
    input  wire       valid,
    input  wire [7:0] x,
    output wire [7:0] avg
);

    reg [7:0] s0, s1, s2, s3;     // the window, s0 newest

    always @(posedge clk) begin
        if (rst) begin
            s0 <= 0; s1 <= 0; s2 <= 0; s3 <= 0;
        end else if (valid) begin
            s0 <= x;              // TODO: shift the others along
        end
    end

    assign avg = s0;              // TODO: (s0 + s1 + s2 + s3) / 4

endmodule
`,
  testbenchSkeleton: `${TS}
module tb_mavg4;
    reg clk, rst, valid; reg [7:0] x; wire [7:0] avg;
    mavg4 dut (.clk(clk), .rst(rst), .valid(valid), .x(x), .avg(avg));
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_mavg4); end
    initial clk = 0;
    always #5 clk = ~clk;
    task sample; input [7:0] v; begin valid = 1; x = v; @(negedge clk); valid = 0; $display("after %0d: avg=%0d", v, avg); end endtask
    initial begin
        rst = 1; valid = 0; x = 0; @(negedge clk); rst = 0;
        sample(100); sample(200); sample(50); sample(30); sample(10);
        $display("expect 25, 75, 87, 95, 72");
        $finish;
    end
endmodule
`,
  hiddenTestcases: [
    tc("tc-1", "Random samples with gaps, compared every cycle", `${TS}
module tb_mavg4_hidden;
    reg clk, rst, valid; reg [7:0] x; wire [7:0] avg;
    reg [7:0] m0, m1, m2, m3;
    reg [9:0] sum;
    integer cyc, seed, errors;
    mavg4 dut (.clk(clk), .rst(rst), .valid(valid), .x(x), .avg(avg));
    initial clk = 0;
    always #5 clk = ~clk;
    always @(posedge clk)
        if (rst) begin m0 <= 0; m1 <= 0; m2 <= 0; m3 <= 0; end
        else if (valid) begin m0 <= x; m1 <= m0; m2 <= m1; m3 <= m2; end
    initial begin
        errors = 0; seed = 8;
        rst = 1; valid = 0; x = 0;
        @(negedge clk); @(negedge clk); rst = 0;
        for (cyc = 0; cyc < 600; cyc = cyc + 1) begin
            valid = ($random(seed) % 3) != 0;
            x = (cyc < 40) ? 8'hFF : $random(seed);
            if (cyc == 400) rst = 1;
            if (cyc == 401) rst = 0;
            @(negedge clk);
            sum = m0 + m1 + m2 + m3;
            if (avg !== sum[9:2]) begin if (errors < 10) $display("FAIL: cycle %0d: avg=%0d, expected %0d (window %0d %0d %0d %0d)", cyc, avg, sum[9:2], m0, m1, m2, m3); errors = errors + 1; end
        end
${END}
    end
endmodule
`, 100),
  ],
};

// ─── Skid buffer ─────────────────────────────────────────────────────────────

const SKID_PORTS = "skid_buffer dut (.clk(clk), .rst(rst), .s_valid(s_valid), .s_data(s_data), .s_ready(s_ready), .m_valid(m_valid), .m_data(m_data), .m_ready(m_ready));";
/** Scoreboard: every accepted word comes out once, in order; a stalled output stays put. Sampled at each rising edge. */
const skidTb = (name: string, body: string) => `${TS}
module ${name};
    reg clk, rst, s_valid, m_ready; reg [7:0] s_data; wire s_ready, m_valid; wire [7:0] m_data;
    reg [7:0] q [0:4095];
    integer head, tail, cyc, seed, errors, sent, got;
    reg was_stalled, ready_before; reg [7:0] stalled_data;
    ${SKID_PORTS}
    initial clk = 0;
    always #5 clk = ~clk;
    always @(posedge clk) if (!rst) begin
        if (was_stalled && (!m_valid || m_data !== stalled_data)) begin
            if (errors < 10) $display("FAIL: cycle %0d: m_valid/m_data changed while the output was stalled (m_valid=%b, m_data=%h, was %h)", cyc, m_valid, m_data, stalled_data);
            errors = errors + 1;
        end
        was_stalled = m_valid && !m_ready;
        stalled_data = m_data;
        if (s_valid && s_ready) begin q[tail] = s_data; tail = tail + 1; sent = sent + 1; end
        if (m_valid && m_ready) begin
            if (head == tail) begin if (errors < 10) $display("FAIL: cycle %0d: output %h was never sent", cyc, m_data); errors = errors + 1; end
            else begin
                if (m_data !== q[head]) begin if (errors < 10) $display("FAIL: cycle %0d: output %h, expected %h (word %0d)", cyc, m_data, q[head], head); errors = errors + 1; end
                head = head + 1;
            end
            got = got + 1;
        end
    end
    initial begin
        errors = 0; seed = 12; head = 0; tail = 0; sent = 0; got = 0; was_stalled = 0;
        rst = 1; s_valid = 0; s_data = 0; m_ready = 0;
        @(negedge clk); @(negedge clk); rst = 0;
${body}
${END}
    end
endmodule
`;

const skidBuffer: ArenaProblem = {
  id: "arena-prac-005", slug: "valid-ready-skid-buffer", title: "Valid/Ready Skid Buffer", category: "Protocol",
  difficulty: "Hard", tags: ["axi-stream", "handshake", "pipeline", "backpressure"], estimatedMin: 40, xpReward: 400,
  statement: `## Valid/Ready Skid Buffer

On a valid/ready stream (as in AXI-Stream), a word moves when **both** \`valid\` and \`ready\` are 1 at a rising edge. Long pipelines break the \`ready\` path into stages with a **skid buffer**: a register stage whose \`s_ready\` output comes **straight from a flip-flop**, so no combinational path runs from \`m_ready\` back to \`s_ready\`.

Because \`s_ready\` is registered, the buffer can't stop the upstream source in the very cycle the downstream stalls; it needs a second, "skid", register to catch the one extra word.

\`\`\`verilog
module skid_buffer (
    input  wire       clk, rst,
    input  wire       s_valid, input wire [7:0] s_data, output wire s_ready,   // from upstream
    output wire       m_valid, output wire [7:0] m_data, input  wire m_ready    // to downstream
);
\`\`\`

Requirements (each is tested):
1. **No loss, no duplicates, in order**: every word accepted (\`s_valid && s_ready\`) comes out exactly once (\`m_valid && m_ready\`).
2. **Stable while stalled**: if \`m_valid\` = 1 and \`m_ready\` = 0 at an edge, \`m_valid\` and \`m_data\` must not change until the word is taken.
3. **Full throughput**: with \`s_valid\` and \`m_ready\` held at 1, one word passes every cycle.
4. **Registered ready**: \`s_ready\` must not change when only \`m_ready\` changes within a clock cycle.
5. After \`rst\` (synchronous): \`m_valid\` = 0 and \`s_ready\` = 1.`,
  examples: [{ input: "m_ready drops for one cycle while words stream in", output: "the word arriving that cycle lands in the skid register; s_ready goes low for a cycle; nothing is lost" }],
  constraints: ["s_ready must be a register output (or logic of registers only).", "Never drop, duplicate or reorder a word."],
  starterCode: `${TS}

module skid_buffer (
    input  wire       clk,
    input  wire       rst,
    input  wire       s_valid,
    input  wire [7:0] s_data,
    output wire       s_ready,
    output wire       m_valid,
    output wire [7:0] m_data,
    input  wire       m_ready
);

    // A plain pipeline register: correct, but s_ready depends on m_ready combinationally.
    // TODO: add a skid register so s_ready can come from a flip-flop.
    reg       valid_r;
    reg [7:0] data_r;

    assign s_ready = m_ready || !valid_r;
    assign m_valid = valid_r;
    assign m_data  = data_r;

    always @(posedge clk) begin
        if (rst) valid_r <= 1'b0;
        else if (s_ready) begin
            valid_r <= s_valid;
            data_r  <= s_data;
        end
    end

endmodule
`,
  testbenchSkeleton: `${TS}
module tb_skid_buffer;
    reg clk, rst, s_valid, m_ready; reg [7:0] s_data; wire s_ready, m_valid; wire [7:0] m_data;
    integer i;
    ${SKID_PORTS}
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_skid_buffer); end
    initial clk = 0;
    always #5 clk = ~clk;
    initial begin
        rst = 1; s_valid = 0; s_data = 0; m_ready = 1; @(negedge clk); rst = 0;
        for (i = 0; i < 12; i = i + 1) begin
            s_valid = 1; s_data = i;
            m_ready = (i != 4);
            @(negedge clk);
            $display("cycle %0d: s_ready=%b m_valid=%b m_data=%0d", i, s_ready, m_valid, m_data);
        end
        $finish;
    end
endmodule
`,
  hiddenTestcases: [
    tc("tc-1", "Random valid and ready: every word arrives once, in order, and stalled outputs hold", skidTb("tb_skid_random", `        for (cyc = 0; cyc < 2000; cyc = cyc + 1) begin
            if (!s_valid || s_ready) begin s_valid = ($random(seed) % 3) != 0; s_data = $random(seed); end
            m_ready = ($random(seed) % 4) != 0;
            if (cyc > 1000 && cyc < 1100) m_ready = ($random(seed) % 5) == 0;     // heavy backpressure
            @(negedge clk);
        end
        s_valid = 0; m_ready = 1;
        for (cyc = 0; cyc < 10; cyc = cyc + 1) @(negedge clk);
        if (got !== sent) begin $display("FAIL: %0d words went in but %0d came out", sent, got); errors = errors + 1; end`), 40),
    tc("tc-2", "Full throughput: one word per cycle with no backpressure", skidTb("tb_skid_rate", `        m_ready = 1;
        for (cyc = 0; cyc < 100; cyc = cyc + 1) begin
            s_valid = 1; s_data = cyc;
            @(negedge clk);
        end
        if (got < 98) begin $display("FAIL: only %0d words passed in 100 cycles (expected one per cycle)", got); errors = errors + 1; end`), 30),
    tc("tc-3", "s_ready is registered (it can't follow m_ready within a cycle), and the reset state", skidTb("tb_skid_registered", `        if (s_ready !== 1'b1 || m_valid !== 1'b0) begin $display("FAIL: after reset s_ready=%b m_valid=%b, expected 1 0", s_ready, m_valid); errors = errors + 1; end
        for (cyc = 0; cyc < 400; cyc = cyc + 1) begin
            if (!s_valid || s_ready) begin s_valid = $random(seed); s_data = $random(seed); end
            m_ready = $random(seed);
            #1 ready_before = s_ready;
            m_ready = ~m_ready;
            #1 if (s_ready !== ready_before) begin if (errors < 10) $display("FAIL: cycle %0d: s_ready changed when only m_ready changed (a combinational path)", cyc); errors = errors + 1; end
            m_ready = ~m_ready;
            @(negedge clk);
        end`), 30),
  ],
};

// ─── True LRU for 4 ways ─────────────────────────────────────────────────────

const lru4: ArenaProblem = {
  id: "arena-prac-006", slug: "lru-tracker-4way", title: "True LRU Tracker (4 Ways)", category: "Memory",
  difficulty: "Hard", tags: ["cache", "lru", "replacement", "ages"], estimatedMin: 35, xpReward: 350,
  statement: `## True LRU Tracker (4 Ways)

A 4-way set-associative cache must choose which way to evict on a miss. **Least recently used** (LRU) replacement evicts the way that has gone longest without an access.

Track the recency order of 4 ways:

- after \`rst\` (synchronous) the order from most to least recently used is **3, 2, 1, 0**, so the victim is way 0;
- on a rising edge with \`access\` = 1, way \`way\` becomes the most recently used; the others keep their relative order;
- \`victim\` (combinational) is the least recently used way.

| event | order (MRU → LRU) | victim |
|-------|-------------------|--------|
| reset | 3 2 1 0 | 0 |
| access 0 | 0 3 2 1 | 1 |
| access 2 | 2 0 3 1 | 1 |
| access 1 | 1 2 0 3 | 3 |

One approach: a 2-bit **age** per way (0 = most recent, 3 = least). On an access to way w, every way younger than w ages by one, and w becomes 0.`,
  examples: [{ input: "reset, then access 0, 1, 2, 3", output: "victim after each: 1, 2, 3, 0" }],
  constraints: ["Accessing the most recently used way again changes nothing."],
  starterCode: `${TS}

module lru4 (
    input  wire       clk,
    input  wire       rst,
    input  wire       access,
    input  wire [1:0] way,
    output wire [1:0] victim
);

    // A round-robin pointer is NOT LRU: it ignores which ways were used.
    // TODO: track the recency order instead.
    reg [1:0] ptr;
    always @(posedge clk) begin
        if (rst) ptr <= 2'd0;
        else if (access) ptr <= ptr + 2'd1;
    end
    assign victim = ptr;

endmodule
`,
  testbenchSkeleton: `${TS}
module tb_lru4;
    reg clk, rst, access; reg [1:0] way; wire [1:0] victim;
    lru4 dut (.clk(clk), .rst(rst), .access(access), .way(way), .victim(victim));
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_lru4); end
    initial clk = 0;
    always #5 clk = ~clk;
    task hit; input [1:0] w; begin access = 1; way = w; @(negedge clk); access = 0; $display("access %0d -> victim %0d", w, victim); end endtask
    initial begin
        rst = 1; access = 0; way = 0; @(negedge clk); rst = 0;
        $display("after reset victim %0d (expect 0)", victim);
        hit(0); hit(2); hit(1);
        $display("expect victims 1, 1, 3");
        $finish;
    end
endmodule
`,
  hiddenTestcases: [
    tc("tc-1", "Random accesses compared with a reference recency list every cycle", `${TS}
module tb_lru4_hidden;
    reg clk, rst, access; reg [1:0] way; wire [1:0] victim;
    reg [1:0] age [0:3]; reg [1:0] ev; integer i, cyc, seed, errors;
    lru4 dut (.clk(clk), .rst(rst), .access(access), .way(way), .victim(victim));
    initial clk = 0;
    always #5 clk = ~clk;
    always @(posedge clk)
        if (rst) begin age[0] <= 3; age[1] <= 2; age[2] <= 1; age[3] <= 0; end
        else if (access)
            for (i = 0; i < 4; i = i + 1)
                if (i == way) age[i] <= 0;
                else if (age[i] < age[way]) age[i] <= age[i] + 1;
    initial begin
        errors = 0; seed = 77;
        rst = 1; access = 0; way = 0;
        @(negedge clk); @(negedge clk); rst = 0;
        for (cyc = 0; cyc < 1500; cyc = cyc + 1) begin
            access = ($random(seed) % 4) != 0;
            way = (cyc % 50 >= 40) ? 2'd3 : $random(seed);         // includes repeated hits on one way
            if (cyc == 1000) rst = 1;
            if (cyc == 1001) rst = 0;
            @(negedge clk);
            ev = 0;
            for (i = 0; i < 4; i = i + 1) if (age[i] == 3) ev = i;
            if (victim !== ev) begin if (errors < 10) $display("FAIL: cycle %0d: victim=%0d, expected %0d (ages %0d %0d %0d %0d)", cyc, victim, ev, age[0], age[1], age[2], age[3]); errors = errors + 1; end
        end
${END}
    end
endmodule
`, 100),
  ],
};

// ─── CRC-8 one byte per clock ────────────────────────────────────────────────

const CRC_MODEL = `    function [7:0] crc_step; input [7:0] c; input [7:0] d; integer k; reg [7:0] r;
        begin
            r = c;
            for (k = 7; k >= 0; k = k - 1) r = (r[7] ^ d[k]) ? ((r << 1) ^ 8'h07) : (r << 1);
            crc_step = r;
        end
    endfunction`;

const crc8Byte: ArenaProblem = {
  id: "arena-prac-007", slug: "crc8-byte-parallel", title: "CRC-8, One Byte per Clock", category: "Arithmetic",
  difficulty: "Medium", tags: ["crc", "xor", "unrolling", "smbus"], estimatedMin: 25, xpReward: 260,
  statement: `## CRC-8, One Byte per Clock

A serial CRC handles one bit per clock: shift left, and XOR in the polynomial when the bit shifted out differs from the incoming data bit. To run 8× faster, **unroll** eight of those steps into one block of combinational logic.

Design \`crc8_byte\` (combinational): given the current CRC \`crc_in\` and a data byte \`data\`, output the CRC after processing the byte **MSB first** with the CRC-8 polynomial \`x⁸ + x² + x + 1\` (8'h07), no reflection:

\`\`\`
r = crc_in
for each bit k of data from 7 down to 0:
    if (r[7] ^ data[k]) r = (r << 1) ^ 8'h07
    else                r = r << 1
crc_out = r
\`\`\`

Check value: starting from 0 and feeding the ASCII bytes of \`"123456789"\` gives 8'hF4 (the CRC-8/SMBUS check).`,
  examples: [{ input: "crc_in=8'h00, data=8'h31 ('1')", output: "crc_out=8'h97" }],
  constraints: ["Combinational.", "A for loop inside always @(*) is fine: synthesis unrolls it."],
  starterCode: `${TS}

module crc8_byte (
    input  wire [7:0] crc_in,
    input  wire [7:0] data,
    output reg  [7:0] crc_out
);

    always @(*) begin
        crc_out = crc_in ^ data;      // TODO: eight steps of the serial CRC
    end

endmodule
`,
  testbenchSkeleton: `${TS}
module tb_crc8_byte;
    reg [7:0] crc_in, data; wire [7:0] crc_out;
    crc8_byte dut (.crc_in(crc_in), .data(data), .crc_out(crc_out));
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_crc8_byte); end
    initial begin
        crc_in = 8'h00; data = 8'h31; #10 $display("crc(00, '1') = %h (expect 97)", crc_out);
        $finish;
    end
endmodule
`,
  hiddenTestcases: [
    tc("tc-1", "Random CRC and data values against the bit-serial definition", `${TS}
module tb_crc8_random;
    reg [7:0] crc_in, data; wire [7:0] crc_out;
    integer i, seed, errors;
    crc8_byte dut (.crc_in(crc_in), .data(data), .crc_out(crc_out));
${CRC_MODEL}
    initial begin
        errors = 0; seed = 4;
        for (i = 0; i < 3000; i = i + 1) begin
            crc_in = $random(seed); data = $random(seed); #1;
            if (crc_out !== crc_step(crc_in, data)) begin if (errors < 10) $display("FAIL: crc_in=%h data=%h: crc_out=%h, expected %h", crc_in, data, crc_out, crc_step(crc_in, data)); errors = errors + 1; end
        end
${END}
    end
endmodule
`, 60),
    tc("tc-2", "Chained over \"123456789\" gives the catalogue check value F4", `${TS}
module tb_crc8_check;
    reg [7:0] crc_in, data; wire [7:0] crc_out;
    reg [8*9-1:0] msg;
    integer i, errors;
    crc8_byte dut (.crc_in(crc_in), .data(data), .crc_out(crc_out));
    initial begin
        errors = 0; msg = "123456789"; crc_in = 8'h00;
        for (i = 8; i >= 0; i = i - 1) begin
            data = msg[i*8 +: 8]; #1;
            crc_in = crc_out;
        end
        if (crc_in !== 8'hF4) begin $display("FAIL: the CRC-8 of 123456789 is %h, expected f4", crc_in); errors = errors + 1; end
${END}
    end
endmodule
`, 40),
  ],
};

export const PRACTICE_ARENA: ArenaProblem[] = [hamming, saturatingAdd, ffs, movingAverage, skidBuffer, lru4, crc8Byte];
