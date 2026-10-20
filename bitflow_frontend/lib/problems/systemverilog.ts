/**
 * lib/problems/systemverilog.ts — "SystemVerilog Essentials": the SV features that
 * make RTL safer and shorter, in the subset Icarus Verilog 12 simulates (-g2012):
 * logic, always_comb / always_ff, typedef enum, packed structs, unique case.
 * Not covered (Icarus can't simulate them): interfaces, classes, SVA.
 * Hidden tests are plain Verilog testbenches; references live in private/.
 */

import type { Problem } from "@/lib/problem-types";

const SV_NOTE = `
> **SystemVerilog here** is the subset Icarus Verilog simulates: \`logic\`, \`always_comb\`, \`always_ff\`,
> \`typedef enum\`, \`struct packed\`, \`unique case\`, \`'0\` / \`'1\` fills. Interfaces and classes are not supported.
`;

export const SV_PROBLEMS: Problem[] = [
  // ─── 1. logic + always_comb ────────────────────────────────────────────────
  {
    id: "sv-priority-encoder", slug: "sv-priority-encoder",
    title: "SystemVerilog: logic and always_comb",
    difficulty: "intermediate", category: "systemverilog",
    tags: ["systemverilog", "always_comb", "logic", "combinational"],
    learningLevel: "Verilog Intermediate",
    moduleId: "mod_sv", orderIndex: 70,
    xpReward: 110, waveformRequired: false,
    expectedOutputMode: "stdout_compare",
    statement: `## SystemVerilog: \`logic\` and \`always_comb\`

In SystemVerilog one type, \`logic\`, replaces both \`wire\` and \`reg\`, and \`always_comb\` replaces \`always @(*)\`:
it runs once at time 0 and re-runs whenever anything it reads changes, and tools warn when it would infer a latch.

Build an **8-to-3 priority encoder**: \`y\` is the index of the highest set bit of \`in\`, and \`valid\` is 1 when any bit is set.
When \`in\` is 0, \`y\` is 0 and \`valid\` is 0.

| Port    | Dir | Width |
|---------|-----|-------|
| \`in\`    | in  | 8 |
| \`y\`     | out | 3 |
| \`valid\` | out | 1 |
${SV_NOTE}`,
    constraints: ["Use logic for every signal and always_comb for the logic.", "Bit 7 has the highest priority."],
    examples: [
      { input: "in = 8'b0010_0110", output: "y = 5, valid = 1", explanation: "Bit 5 is the highest set bit" },
      { input: "in = 8'b0000_0000", output: "y = 0, valid = 0" },
    ],
    hints: [
      { tier: 1, content: "Give y and valid default values at the top of the always_comb block, then override them." },
      { tier: 2, content: "A for loop from bit 0 up to bit 7 that assigns y whenever in[i] is 1 leaves the highest index last." },
      { tier: 3, content: "`for (int i = 0; i < 8; i++) if (in[i]) begin y = i[2:0]; valid = 1'b1; end` after `y = '0; valid = 1'b0;`" },
    ],
    solutionExplanation: "Defaults first, then a loop that lets later (higher) bits overwrite earlier ones: the last assignment wins, which is exactly priority. `always_comb` guarantees every path assigns y and valid, so no latch.",
    publicTestcases: [], hiddenTestcases: [],
    starterCode: `\`timescale 1ns / 1ps

module priority_encoder (
    input  logic [7:0] in,
    output logic [2:0] y,
    output logic       valid
);
    always_comb begin
        // TODO: defaults, then find the highest set bit
    end
endmodule
`,
    publicTestbench: `\`timescale 1ns / 1ps
module tb_priority_encoder;
    logic [7:0] in;
    logic [2:0] y;
    logic       valid;
    priority_encoder dut (.in(in), .y(y), .valid(valid));
    initial begin
        $dumpfile("wave.vcd"); $dumpvars(0, tb_priority_encoder);
        in = 8'b0010_0110; #1 $display("in=%b y=%0d valid=%b (expect 5, 1)", in, y, valid);
        in = 8'b0000_0001; #1 $display("in=%b y=%0d valid=%b (expect 0, 1)", in, y, valid);
        in = 8'b0000_0000; #1 $display("in=%b y=%0d valid=%b (expect 0, 0)", in, y, valid);
        $finish;
    end
endmodule
`,
    hiddenTestbench: `\`timescale 1ns / 1ps
module tb_priority_encoder_hidden;
    reg  [7:0] in;
    wire [2:0] y;
    wire       valid;
    integer i, k, errors, want;
    priority_encoder dut (.in(in), .y(y), .valid(valid));
    initial begin
        errors = 0;
        for (i = 0; i < 256; i = i + 1) begin
            in = i; #1;
            want = 0;
            for (k = 0; k < 8; k = k + 1) if (i[k]) want = k;
            if (y !== want[2:0] || valid !== (i != 0)) begin
                $display("FAIL: in=%b gave y=%0d valid=%b, expected y=%0d valid=%b", in, y, valid, want, i != 0);
                errors = errors + 1;
            end
        end
        if (errors == 0) $display("ALL TESTS PASSED");
        $finish;
    end
endmodule
`,
  },

  // ─── 2. always_ff ──────────────────────────────────────────────────────────
  {
    id: "sv-updown-counter", slug: "sv-updown-counter",
    title: "SystemVerilog: always_ff Up/Down Counter",
    difficulty: "intermediate", category: "systemverilog",
    tags: ["systemverilog", "always_ff", "counter", "sequential"],
    learningLevel: "Verilog Intermediate",
    moduleId: "mod_sv", orderIndex: 71,
    xpReward: 120, waveformRequired: false,
    expectedOutputMode: "stdout_compare",
    statement: `## SystemVerilog: \`always_ff\` Up/Down Counter

\`always_ff @(posedge clk)\` says "this block is flip-flops": tools reject blocking assignments to its
outputs from elsewhere and warn if it isn't clocked.

Build an 8-bit counter. On each rising edge, in priority order:

1. \`rst\` = 1: \`count\` becomes 0
2. \`load\` = 1: \`count\` becomes \`d\`
3. \`en\` = 1: \`count\` counts **up** when \`up\` = 1, **down** when \`up\` = 0 (wrapping 255 ↔ 0)
4. otherwise \`count\` holds
${SV_NOTE}`,
    constraints: ["Use always_ff and nonblocking assignments (<=).", "Synchronous reset."],
    examples: [
      { input: "count = 255, en = 1, up = 1", output: "count = 0 after the edge" },
      { input: "load = 1, d = 42, en = 1", output: "count = 42 (load wins over counting)" },
    ],
    hints: [
      { tier: 1, content: "One if / else if chain inside always_ff, in the priority order given." },
      { tier: 2, content: "8-bit arithmetic wraps by itself: count + 8'd1 from 255 is 0." },
      { tier: 3, content: "`else if (en) count <= up ? count + 8'd1 : count - 8'd1;`" },
    ],
    solutionExplanation: "The if/else-if order is the priority: reset, then load, then count. Unsigned 8-bit addition and subtraction wrap modulo 256, so no special cases are needed.",
    publicTestcases: [], hiddenTestcases: [],
    starterCode: `\`timescale 1ns / 1ps

module updown_counter (
    input  logic       clk,
    input  logic       rst,
    input  logic       load,
    input  logic [7:0] d,
    input  logic       en,
    input  logic       up,
    output logic [7:0] count
);
    always_ff @(posedge clk) begin
        // TODO
    end
endmodule
`,
    publicTestbench: `\`timescale 1ns / 1ps
module tb_updown_counter;
    logic clk = 0, rst = 1, load = 0, en = 0, up = 1;
    logic [7:0] d = 0, count;
    updown_counter dut (.clk(clk), .rst(rst), .load(load), .d(d), .en(en), .up(up), .count(count));
    always #5 clk = ~clk;
    initial begin
        $dumpfile("wave.vcd"); $dumpvars(0, tb_updown_counter);
        @(negedge clk) begin rst = 0; en = 1; end
        repeat (3) @(negedge clk);
        $display("after 3 up: count=%0d (expect 3)", count);
        up = 0; repeat (5) @(negedge clk);
        $display("after 5 down: count=%0d (expect 254)", count);
        load = 1; d = 8'd42; @(negedge clk) load = 0;
        $display("after load 42: count=%0d (expect 42)", count);
        $finish;
    end
endmodule
`,
    hiddenTestbench: `\`timescale 1ns / 1ps
module tb_updown_counter_hidden;
    reg clk = 0, rst, load, en, up;
    reg  [7:0] d;
    wire [7:0] count;
    reg  [7:0] model;
    integer i, errors;
    updown_counter dut (.clk(clk), .rst(rst), .load(load), .d(d), .en(en), .up(up), .count(count));
    always #5 clk = ~clk;
    initial begin
        errors = 0; model = 0;
        rst = 1; load = 0; en = 0; up = 0; d = 0;
        @(negedge clk);
        for (i = 0; i < 600; i = i + 1) begin
            rst  = (i % 97) == 3;
            load = (i % 37) == 5;
            en   = $random;
            up   = (i % 64) < 40;
            d    = $random;
            @(posedge clk);
            if (rst) model = 0; else if (load) model = d; else if (en) model = up ? model + 1 : model - 1;
            @(negedge clk);
            if (count !== model) begin
                if (errors < 10) $display("FAIL: step %0d rst=%b load=%b en=%b up=%b d=%0d: count=%0d, expected %0d", i, rst, load, en, up, d, count, model);
                errors = errors + 1;
            end
        end
        if (errors == 0) $display("ALL TESTS PASSED");
        $finish;
    end
endmodule
`,
  },

  // ─── 3. typedef enum FSM ───────────────────────────────────────────────────
  {
    id: "sv-enum-detector", slug: "sv-enum-detector",
    title: "SystemVerilog: enum State Machine",
    difficulty: "intermediate", category: "systemverilog",
    tags: ["systemverilog", "enum", "fsm", "sequence-detector"],
    learningLevel: "Verilog Intermediate",
    moduleId: "mod_sv", orderIndex: 72,
    xpReward: 140, waveformRequired: false,
    expectedOutputMode: "stdout_compare",
    statement: `## SystemVerilog: \`enum\` State Machine

\`typedef enum logic [2:0] { IDLE, S1, S11, S110, S1101 } state_t;\` gives states names the simulator and the
waveform viewer know about, instead of bare numbers in \`localparam\`s.

Build a Moore detector for the bit sequence **1101** on \`din\`, overlapping: \`hit\` is 1 for the cycle
after the last bit of each 1101 arrives. In \`1101101\` there are two matches.

| Port   | Dir | Width | Meaning |
|--------|-----|-------|---------|
| \`rst\`  | in  | 1 | Synchronous reset to the idle state |
| \`din\`  | in  | 1 | One bit per clock |
| \`hit\`  | out | 1 | 1 while in the "just saw 1101" state |

An enum variable only takes its own names: \`next = S1;\` is fine, but \`next = din ? S1 : IDLE;\` is a plain
\`logic\` value to the simulator and needs a cast (\`state_t'(...)\`). An \`if\`/\`else\` is simplest.
${SV_NOTE}`,
    constraints: ["Declare the states with typedef enum.", "Moore output: hit depends only on the state.", "Overlapping matches count."],
    examples: [{ input: "din = 1,1,0,1,1,0,1", output: "hit = 1 after the 4th and the 7th bit" }],
    hints: [
      { tier: 1, content: "Five states: IDLE, S1 (saw 1), S11, S110 and S1101 (the hit state)." },
      { tier: 2, content: "Each state is the longest ending of the bits so far that is also a beginning of 1101. From S11, another 1 stays in S11: …111 still ends in 11." },
      { tier: 3, content: "S1101: on 1 go to S11 (…11011 ends in 11), on 0 go to IDLE. S110: on 1 → S1101, on 0 → IDLE. S11: on 0 → S110. S1: on 1 → S11, on 0 → IDLE. Write each as `if (din) next = …; else next = …;`." },
    ],
    solutionExplanation: "Each state is the longest suffix of the input so far that is also a prefix of 1101. Overlap falls out of that rule: after 1101, the trailing 1 already counts toward the next match.",
    publicTestcases: [], hiddenTestcases: [],
    starterCode: `\`timescale 1ns / 1ps

module seq1101 (
    input  logic clk,
    input  logic rst,
    input  logic din,
    output logic hit
);
    typedef enum logic [2:0] { IDLE, S1, S11, S110, S1101 } state_t;
    state_t state, next;

    always_ff @(posedge clk)
        if (rst) state <= IDLE;
        else     state <= next;

    always_comb begin
        next = state;
        // TODO: transitions
    end

    assign hit = (state == S1101);
endmodule
`,
    publicTestbench: `\`timescale 1ns / 1ps
module tb_seq1101;
    logic clk = 0, rst = 1, din = 0, hit;
    logic [6:0] bits = 7'b1101101;
    seq1101 dut (.clk(clk), .rst(rst), .din(din), .hit(hit));
    always #5 clk = ~clk;
    initial begin
        $dumpfile("wave.vcd"); $dumpvars(0, tb_seq1101);
        @(negedge clk) rst = 0;
        for (int i = 6; i >= 0; i--) begin
            din = bits[i];
            @(negedge clk) $display("din=%b -> state=%s hit=%b", din, dut.state.name(), hit);
        end
        $finish;
    end
endmodule
`,
    hiddenTestbench: `\`timescale 1ns / 1ps
module tb_seq1101_hidden;
    reg clk = 0, rst, din;
    wire hit;
    reg [3:0] last;
    integer i, errors, seen;
    seq1101 dut (.clk(clk), .rst(rst), .din(din), .hit(hit));
    always #5 clk = ~clk;
    initial begin
        errors = 0; last = 0; seen = 0;
        rst = 1; din = 0;
        @(negedge clk); rst = 0;
        for (i = 0; i < 800; i = i + 1) begin
            din = (i % 11 < 7) ? $random : ((i % 4) != 2);
            if (i == 400) rst = 1;
            @(posedge clk);
            last = rst ? 4'd0 : {last[2:0], din};
            seen = rst ? 0 : (seen < 4 ? seen + 1 : 4);
            @(negedge clk);
            if (hit !== (seen == 4 && last == 4'b1101)) begin
                if (errors < 10) $display("FAIL: step %0d, last bits %b: hit=%b", i, last, hit);
                errors = errors + 1;
            end
            if (rst) rst = 0;
        end
        if (errors == 0) $display("ALL TESTS PASSED");
        $finish;
    end
endmodule
`,
  },

  // ─── 4. packed struct ──────────────────────────────────────────────────────
  {
    id: "sv-packet-header", slug: "sv-packet-header",
    title: "SystemVerilog: Packed Struct Header Parser",
    difficulty: "intermediate", category: "systemverilog",
    tags: ["systemverilog", "struct", "packed", "combinational"],
    learningLevel: "Verilog Intermediate",
    moduleId: "mod_sv", orderIndex: 73,
    xpReward: 140, waveformRequired: false,
    expectedOutputMode: "stdout_compare",
    statement: `## SystemVerilog: Packed Struct Header Parser

A \`struct packed\` names the fields of a bit vector, so \`hdr.length\` replaces \`word[7:0]\` and the
layout is written down once.

A 16-bit packet header, most significant bits first:

| Bits    | Field     | Meaning |
|---------|-----------|---------|
| [15:12] | \`version\` | must be 1 |
| [11:8]  | \`kind\`    | 0 control, 1 data, 2 ack, others reserved |
| [7:0]   | \`length\`  | total packet length in bytes, including the 2-byte header |

Outputs: \`ok\` = version is 1 **and** kind is not reserved **and** length ≥ 2; \`is_data\` = ok and kind is data;
\`payload\` = length − 2 when ok, else 0.
${SV_NOTE}`,
    constraints: ["Declare a typedef struct packed for the header and use its fields.", "Combinational only."],
    examples: [
      { input: "word = 16'h110A", output: "ok = 1, is_data = 1, payload = 8" },
      { input: "word = 16'h210A", output: "ok = 0 (version 2), payload = 0" },
    ],
    hints: [
      { tier: 1, content: "`typedef struct packed { logic [3:0] version; logic [3:0] kind; logic [7:0] length; } header_t;` The first field is the most significant." },
      { tier: 2, content: "`header_t h; assign h = word;` then use h.version, h.kind and h.length." },
      { tier: 3, content: "`ok = h.version == 4'd1 && h.kind <= 4'd2 && h.length >= 8'd2;`" },
    ],
    solutionExplanation: "A packed struct is just a bit vector with named slices; assigning the word to it costs nothing in hardware. The checks are plain comparisons on the fields.",
    publicTestcases: [], hiddenTestcases: [],
    starterCode: `\`timescale 1ns / 1ps

module header_parser (
    input  logic [15:0] word,
    output logic        ok,
    output logic        is_data,
    output logic [7:0]  payload
);
    // TODO: typedef struct packed { ... } header_t;

    // TODO: view word as a header_t and compute the outputs
endmodule
`,
    publicTestbench: `\`timescale 1ns / 1ps
module tb_header_parser;
    logic [15:0] word;
    logic        ok, is_data;
    logic [7:0]  payload;
    header_parser dut (.word(word), .ok(ok), .is_data(is_data), .payload(payload));
    initial begin
        word = 16'h110A; #1 $display("%h: ok=%b data=%b payload=%0d (expect 1 1 8)", word, ok, is_data, payload);
        word = 16'h210A; #1 $display("%h: ok=%b data=%b payload=%0d (expect 0 0 0)", word, ok, is_data, payload);
        word = 16'h1201; #1 $display("%h: ok=%b data=%b payload=%0d (expect 0 0 0)", word, ok, is_data, payload);
        $finish;
    end
endmodule
`,
    hiddenTestbench: `\`timescale 1ns / 1ps
module tb_header_parser_hidden;
    reg  [15:0] word;
    wire        ok, is_data;
    wire [7:0]  payload;
    reg         w_ok, w_data;
    reg  [7:0]  w_pay;
    integer i, errors;
    header_parser dut (.word(word), .ok(ok), .is_data(is_data), .payload(payload));
    initial begin
        errors = 0;
        for (i = 0; i < 4096; i = i + 1) begin
            word = (i < 2048) ? {i[11:8], i[3:0], i[7:4], i[10:7]} : $random;
            if (i < 64) word = {4'd1, i[1:0] == 0 ? 4'd1 : {2'b0, i[1:0]}, 6'd0, i[3:2]};
            #1;
            w_ok   = word[15:12] == 4'd1 && word[11:8] <= 4'd2 && word[7:0] >= 8'd2;
            w_data = w_ok && word[11:8] == 4'd1;
            w_pay  = w_ok ? word[7:0] - 8'd2 : 8'd0;
            if (ok !== w_ok || is_data !== w_data || payload !== w_pay) begin
                if (errors < 10) $display("FAIL: word=%h gave ok=%b data=%b payload=%0d, expected %b %b %0d", word, ok, is_data, payload, w_ok, w_data, w_pay);
                errors = errors + 1;
            end
        end
        if (errors == 0) $display("ALL TESTS PASSED");
        $finish;
    end
endmodule
`,
  },

  // ─── 5. unique case ────────────────────────────────────────────────────────
  {
    id: "sv-seven-seg", slug: "sv-seven-seg",
    title: "SystemVerilog: unique case Hex Display",
    difficulty: "intermediate", category: "systemverilog",
    tags: ["systemverilog", "unique-case", "decoder", "combinational"],
    learningLevel: "Verilog Intermediate",
    moduleId: "mod_sv", orderIndex: 74,
    xpReward: 120, waveformRequired: false,
    expectedOutputMode: "stdout_compare",
    statement: `## SystemVerilog: \`unique case\` Hex Display

\`unique case\` tells the tools that exactly one branch matches: the simulator warns if none or several
do, and synthesis may build a parallel decoder instead of a priority chain.

Decode a 4-bit hex digit to a common-cathode seven-segment display. \`seg\` is \`{g, f, e, d, c, b, a}\`
(1 = segment on), with the usual layout: a top, b top-right, c bottom-right, d bottom, e bottom-left,
f top-left, g middle. Letters: A, b, C, d, E, F.

| Digit | seg (gfedcba) | Digit | seg |
|-------|---------------|-------|-----|
| 0 | 0111111 | 8 | 1111111 |
| 1 | 0000110 | 9 | 1101111 |
| 2 | 1011011 | A | 1110111 |
| 3 | 1001111 | b | 1111100 |
| 4 | 1100110 | C | 0111001 |
| 5 | 1101101 | d | 1011110 |
| 6 | 1111101 | E | 1111001 |
| 7 | 0000111 | F | 1110001 |
${SV_NOTE}`,
    constraints: ["Use always_comb with a unique case covering all 16 values."],
    examples: [{ input: "digit = 4'hA", output: "seg = 7'b1110111" }],
    hints: [
      { tier: 1, content: "Sixteen case items, one per digit, copied from the table." },
      { tier: 2, content: "Write the constants as 7'b... in gfedcba order so they match the table directly." },
      { tier: 3, content: "With all 16 values listed no default is needed; unique case checks that one always matches." },
    ],
    solutionExplanation: "A table in code. `unique case` documents that the items are mutually exclusive and complete, which lets synthesis drop priority logic and makes the simulator flag a missing value.",
    publicTestcases: [], hiddenTestcases: [],
    starterCode: `\`timescale 1ns / 1ps

module hex7seg (
    input  logic [3:0] digit,
    output logic [6:0] seg      // {g, f, e, d, c, b, a}
);
    always_comb begin
        unique case (digit)
            4'h0: seg = 7'b0111111;
            4'h1: seg = 7'b0000110;
            // TODO: 2 .. F
            default: seg = 7'b0000000;
        endcase
    end
endmodule
`,
    publicTestbench: `\`timescale 1ns / 1ps
module tb_hex7seg;
    logic [3:0] digit;
    logic [6:0] seg;
    hex7seg dut (.digit(digit), .seg(seg));
    initial begin
        for (int i = 0; i < 16; i++) begin
            digit = i; #1 $display("%h -> %b", digit, seg);
        end
        $finish;
    end
endmodule
`,
    hiddenTestbench: `\`timescale 1ns / 1ps
module tb_hex7seg_hidden;
    reg  [3:0] digit;
    wire [6:0] seg;
    reg  [6:0] want [0:15];
    integer i, errors;
    hex7seg dut (.digit(digit), .seg(seg));
    initial begin
        want[0] = 7'b0111111; want[1] = 7'b0000110; want[2] = 7'b1011011; want[3] = 7'b1001111;
        want[4] = 7'b1100110; want[5] = 7'b1101101; want[6] = 7'b1111101; want[7] = 7'b0000111;
        want[8] = 7'b1111111; want[9] = 7'b1101111; want[10] = 7'b1110111; want[11] = 7'b1111100;
        want[12] = 7'b0111001; want[13] = 7'b1011110; want[14] = 7'b1111001; want[15] = 7'b1110001;
        errors = 0;
        for (i = 0; i < 16; i = i + 1) begin
            digit = i; #1;
            if (seg !== want[i]) begin
                $display("FAIL: digit %h gave %b, expected %b", digit, seg, want[i]);
                errors = errors + 1;
            end
        end
        if (errors == 0) $display("ALL TESTS PASSED");
        $finish;
    end
endmodule
`,
  },
];
