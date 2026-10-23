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

  // ─── 6. typedef enum + struct packed in an ALU ─────────────────────────────
  {
    id: "sv-enum-alu", slug: "sv-enum-alu",
    title: "SystemVerilog: Enum-Driven ALU with Flags",
    difficulty: "intermediate", category: "systemverilog",
    tags: ["systemverilog", "typedef enum", "struct packed", "unique case", "alu"],
    learningLevel: "Verilog Intermediate",
    moduleId: "mod_sv", orderIndex: 75,
    xpReward: 150, waveformRequired: false,
    expectedOutputMode: "stdout_compare",
    statement: `## SystemVerilog: an enum-driven ALU

A \`typedef enum\` gives opcodes names, so a \`case\` reads like the instruction set; a \`struct packed\` groups
related bits (here the flags) under field names while still being a plain bit vector.

Build an **8-bit ALU**. \`op\` selects the operation:

| \`op\` | Name | \`y\` |
|------|------|-----|
| 0 | ADD | \`a + b\` |
| 1 | SUB | \`a - b\` |
| 2 | AND | \`a & b\` |
| 3 | OR  | \`a \\| b\` |
| 4 | XOR | \`a ^ b\` |
| 5 | SLL | \`a << b[2:0]\` |
| 6 | SRL | \`a >> b[2:0]\` (zeros in) |
| 7 | SRA | \`a >>> b[2:0]\` (copies of \`a[7]\` in) |

\`flags\` is \`{zero, negative, carry}\` (zero in bit 2): **zero** when \`y\` is 0, **negative** = \`y[7]\`,
**carry** = the carry out of bit 7 for ADD, 1 for SUB when there is no borrow (\`a >= b\`), and 0 for the other operations.
${SV_NOTE}`,
    constraints: ["Name the opcodes with a typedef enum and the flags with a struct packed.", "Purely combinational: always_comb, no clock."],
    examples: [
      { input: "op = ADD, a = 8'hF0, b = 8'h20", output: "y = 8'h10, flags = 3'b001", explanation: "0xF0 + 0x20 = 0x110: carry out, result not zero, bit 7 clear" },
      { input: "op = SUB, a = 8'h05, b = 8'h05", output: "y = 8'h00, flags = 3'b101", explanation: "Zero, and no borrow so carry = 1" },
      { input: "op = SRA, a = 8'h80, b = 8'h03", output: "y = 8'hF0, flags = 3'b010" },
    ],
    hints: [
      { tier: 1, content: "Compute carry and y together for ADD and SUB with a 9-bit sum: `{carry, y} = {1'b0, a} + {1'b0, b};`." },
      { tier: 2, content: "SUB is a + ~b + 1; the ninth bit of that sum is 1 exactly when there is no borrow. SRA needs a signed operand: `$signed(a) >>> b[2:0]`." },
      { tier: 3, content: "Default carry to 0 at the top of always_comb, then `unique case (op)` over the enum names, then fill the struct: `f.zero = (y == '0); f.negative = y[7]; f.carry = carry;` and `assign flags = f;`." },
    ],
    solutionExplanation: "The enum turns 3-bit codes into names, and `unique case` tells tools every value is handled exactly once. A 9-bit sum gives the carry for free; subtraction reuses the adder as a + ~b + 1. The packed struct's first field is its most significant bit, so `flags` comes out as {zero, negative, carry}.",
    publicTestcases: [], hiddenTestcases: [],
    starterCode: `\`timescale 1ns / 1ps

module alu8 (
    input  logic [7:0] a,
    input  logic [7:0] b,
    input  logic [2:0] op,
    output logic [7:0] y,
    output logic [2:0] flags     // {zero, negative, carry}
);
    typedef enum logic [2:0] { ADD, SUB, AND_OP, OR_OP, XOR_OP, SLL, SRL, SRA } op_t;
    typedef struct packed { logic zero; logic negative; logic carry; } flags_t;

    flags_t f;
    logic   carry;

    always_comb begin
        // TODO: y and carry for each operation, then the flags
    end
    assign flags = f;
endmodule
`,
    publicTestbench: `\`timescale 1ns / 1ps
module tb_alu8;
    logic [7:0] a, b, y;
    logic [2:0] op, flags;
    alu8 dut (.a(a), .b(b), .op(op), .y(y), .flags(flags));
    initial begin
        $dumpfile("wave.vcd"); $dumpvars(0, tb_alu8);
        a = 8'hF0; b = 8'h20; op = 3'd0; #1 $display("ADD F0+20: y=%h flags=%b (expect 10 001)", y, flags);
        a = 8'h05; b = 8'h05; op = 3'd1; #1 $display("SUB 05-05: y=%h flags=%b (expect 00 101)", y, flags);
        a = 8'h80; b = 8'h03; op = 3'd7; #1 $display("SRA 80>>>3: y=%h flags=%b (expect f0 010)", y, flags);
        $finish;
    end
endmodule
`,
    hiddenTestbench: `\`timescale 1ns / 1ps
module tb_alu8_hidden;
    reg  [7:0] a, b;
    reg  [2:0] op;
    wire [7:0] y;
    wire [2:0] flags;
    reg  [8:0] wide;
    reg  [7:0] wy;
    reg        wc;
    integer i, k, errors;
    alu8 dut (.a(a), .b(b), .op(op), .y(y), .flags(flags));
    task check;
        begin
            wc = 1'b0;
            case (op)
                3'd0: begin wide = {1'b0, a} + {1'b0, b}; wy = wide[7:0]; wc = wide[8]; end
                3'd1: begin wide = {1'b0, a} + {1'b0, ~b} + 9'd1; wy = wide[7:0]; wc = wide[8]; end
                3'd2: wy = a & b;
                3'd3: wy = a | b;
                3'd4: wy = a ^ b;
                3'd5: wy = a << b[2:0];
                3'd6: wy = a >> b[2:0];
                default: wy = $signed(a) >>> b[2:0];
            endcase
            #1;
            if (y !== wy || flags !== {wy == 8'd0, wy[7], wc}) begin
                $display("FAIL: op=%0d a=%h b=%h gave y=%h flags=%b, expected y=%h flags=%b", op, a, b, y, flags, wy, {wy == 8'd0, wy[7], wc});
                errors = errors + 1;
            end
        end
    endtask
    initial begin
        errors = 0;
        for (k = 0; k < 8; k = k + 1) begin
            op = k;
            a = 8'h00; b = 8'h00; check;
            a = 8'hFF; b = 8'h01; check;
            a = 8'h80; b = 8'h07; check;
            a = 8'h7F; b = 8'h80; check;
            a = 8'h01; b = 8'h02; check;
        end
        for (i = 0; i < 3000; i = i + 1) begin
            a = $random; b = $random; op = $random; check;
        end
        if (errors == 0) $display("ALL TESTS PASSED");
        $finish;
    end
endmodule
`,
  },

  // ─── 7. always_ff register file ────────────────────────────────────────────
  {
    id: "sv-register-file", slug: "sv-register-file",
    title: "SystemVerilog: Register File",
    difficulty: "intermediate", category: "systemverilog",
    tags: ["systemverilog", "always_ff", "memory", "register file", "sequential"],
    learningLevel: "Verilog Intermediate",
    moduleId: "mod_sv", orderIndex: 76,
    xpReward: 150, waveformRequired: false,
    expectedOutputMode: "stdout_compare",
    statement: `## SystemVerilog: a register file

A CPU keeps its working values in a **register file**: a small memory with one write port and two read ports,
so an instruction can read two operands and write a result every cycle.

Build eight 8-bit registers, **r0 to r7**:

- **Write**: on the rising edge of \`clk\`, if \`we\` is 1, register \`waddr\` takes \`wdata\`.
- **r0 is always 0**: writes to it are ignored (as in RISC-V's x0).
- **Read**: \`rdata1\` shows register \`raddr1\` and \`rdata2\` shows register \`raddr2\` **combinationally**; a write
  shows up on the read ports after the clock edge.
- **Reset**: \`rst\` (synchronous, active high) clears every register.

| Port | Dir | Width |
|------|-----|-------|
| \`clk\`, \`rst\`, \`we\` | in | 1 |
| \`waddr\`, \`raddr1\`, \`raddr2\` | in | 3 |
| \`wdata\` | in | 8 |
| \`rdata1\`, \`rdata2\` | out | 8 |
${SV_NOTE}`,
    constraints: ["Store the registers in an unpacked array of logic.", "Writes in always_ff; reads are continuous assignments."],
    examples: [
      { input: "we = 1, waddr = 3, wdata = 8'h5A, then a clock edge; raddr1 = 3", output: "rdata1 = 8'h5A" },
      { input: "we = 1, waddr = 0, wdata = 8'hFF, then a clock edge; raddr2 = 0", output: "rdata2 = 8'h00", explanation: "r0 ignores writes" },
    ],
    hints: [
      { tier: 1, content: "Declare `logic [7:0] regs [0:7];` and read it with `assign rdata1 = regs[raddr1];`." },
      { tier: 2, content: "In the always_ff block, a reset clears every entry with a for loop; otherwise write only when `we && waddr != 0`." },
      { tier: 3, content: "`if (rst) for (int i = 0; i < 8; i++) regs[i] <= '0; else if (we && waddr != 3'd0) regs[waddr] <= wdata;`" },
    ],
    solutionExplanation: "The array holds the state; always_ff makes the write a clocked, non-blocking update, so a value written this cycle is read from the next one. Never writing r0, and clearing it on reset, makes it read as zero forever, which is the cheapest way to build a hard-wired zero register.",
    publicTestcases: [], hiddenTestcases: [],
    starterCode: `\`timescale 1ns / 1ps

module regfile (
    input  logic       clk,
    input  logic       rst,
    input  logic       we,
    input  logic [2:0] waddr,
    input  logic [7:0] wdata,
    input  logic [2:0] raddr1,
    input  logic [2:0] raddr2,
    output logic [7:0] rdata1,
    output logic [7:0] rdata2
);
    // TODO: eight 8-bit registers, a clocked write port, two read ports; r0 reads 0
endmodule
`,
    publicTestbench: `\`timescale 1ns / 1ps
module tb_regfile;
    logic clk = 0, rst = 1, we = 0;
    logic [2:0] waddr = 0, raddr1 = 0, raddr2 = 0;
    logic [7:0] wdata = 0, rdata1, rdata2;
    regfile dut (.clk(clk), .rst(rst), .we(we), .waddr(waddr), .wdata(wdata), .raddr1(raddr1), .raddr2(raddr2), .rdata1(rdata1), .rdata2(rdata2));
    always #5 clk = ~clk;
    initial begin
        $dumpfile("wave.vcd"); $dumpvars(0, tb_regfile);
        @(negedge clk) rst = 0;
        we = 1; waddr = 3; wdata = 8'h5A; @(negedge clk);
        waddr = 0; wdata = 8'hFF;         @(negedge clk);
        we = 0; raddr1 = 3; raddr2 = 0; #1;
        $display("r3=%h (expect 5a)  r0=%h (expect 00)", rdata1, rdata2);
        $finish;
    end
endmodule
`,
    hiddenTestbench: `\`timescale 1ns / 1ps
module tb_regfile_hidden;
    reg clk = 0, rst, we;
    reg [2:0] waddr, raddr1, raddr2;
    reg [7:0] wdata;
    wire [7:0] rdata1, rdata2;
    reg [7:0] model [0:7];
    integer i, j, errors;
    regfile dut (.clk(clk), .rst(rst), .we(we), .waddr(waddr), .wdata(wdata), .raddr1(raddr1), .raddr2(raddr2), .rdata1(rdata1), .rdata2(rdata2));
    always #5 clk = ~clk;
    always @(posedge clk)
        if (rst) for (j = 0; j < 8; j = j + 1) model[j] <= 8'd0;
        else if (we && waddr != 3'd0) model[waddr] <= wdata;
    initial begin
        errors = 0;
        rst = 1; we = 0; waddr = 0; wdata = 0; raddr1 = 0; raddr2 = 0;
        @(negedge clk); @(negedge clk);
        for (i = 0; i < 800; i = i + 1) begin
            rst = (i % 97 == 50);
            we = $random; waddr = $random; wdata = $random; raddr1 = $random; raddr2 = $random;
            if (i < 16) begin we = 1; waddr = i; end
            #1;
            if (rdata1 !== model[raddr1] || rdata2 !== model[raddr2]) begin
                $display("FAIL at step %0d: r%0d read %h (expected %h), r%0d read %h (expected %h)", i, raddr1, rdata1, model[raddr1], raddr2, rdata2, model[raddr2]);
                errors = errors + 1;
            end
            @(negedge clk);
        end
        if (errors == 0) $display("ALL TESTS PASSED");
        $finish;
    end
endmodule
`,
  },

  // ─── 8. generate: a parameterised adder tree ───────────────────────────────
  {
    id: "sv-adder-tree", slug: "sv-adder-tree",
    title: "SystemVerilog: Adder Tree with generate",
    difficulty: "advanced", category: "systemverilog",
    tags: ["systemverilog", "generate", "parameter", "adder tree", "combinational"],
    learningLevel: "Verilog Advanced",
    moduleId: "mod_sv", orderIndex: 77,
    xpReward: 180, waveformRequired: false,
    expectedOutputMode: "stdout_compare",
    statement: `## SystemVerilog: an adder tree with \`generate\`

Adding N numbers one after another makes a chain N-1 adders long. A **tree** adds them in pairs, then the pair sums in pairs,
and so on: only log₂N adders deep, so it runs much faster. \`generate\` loops build that structure for any N.

Build \`adder_tree\` with a parameter **N** (a power of two, 2 to 64): \`data\` packs N unsigned 8-bit numbers
(number *i* is \`data[8*i +: 8]\`), and \`sum\` is their total, **8 + $clog2(N)** bits wide so it never overflows.

| Port | Dir | Width |
|------|-----|-------|
| \`data\` | in | 8·N |
| \`sum\` | out | 8 + $clog2(N) |

The tests instantiate it with N = 4, 8 and 16.
${SV_NOTE}`,
    constraints: ["Build the tree with generate for loops, not a single for loop in always_comb.", "Combinational: no clock."],
    examples: [
      { input: "N = 4, data = {8'd4, 8'd3, 8'd2, 8'd1}", output: "sum = 10" },
      { input: "N = 8, every number 255", output: "sum = 2040", explanation: "11 bits hold up to 2047" },
    ],
    hints: [
      { tier: 1, content: "Store the tree like a heap in one array of 2N-1 nodes: node i adds nodes 2i+1 and 2i+2; the leaves are nodes N-1 to 2N-2." },
      { tier: 2, content: "Make every node the full output width so no partial sum overflows: `wire [W-1:0] node [0:2*N-2];` with `localparam W = 8 + $clog2(N);`." },
      { tier: 3, content: "Two generate loops: `for (i = 0; i < N; i++) assign node[N-1+i] = data[8*i +: 8];` and `for (i = 0; i < N-1; i++) assign node[i] = node[2*i+1] + node[2*i+2];`, then `assign sum = node[0];`." },
    ],
    solutionExplanation: "Laid out as a heap, the tree needs no level-by-level bookkeeping: node i's children are 2i+1 and 2i+2, the N inputs are the last N nodes, and node 0 is the total. A generate loop instantiates one adder per internal node, so the netlist is a balanced tree log₂N adders deep however large N is.",
    publicTestcases: [], hiddenTestcases: [],
    starterCode: `\`timescale 1ns / 1ps

module adder_tree #(
    parameter N = 8                          // how many 8-bit numbers (a power of two)
) (
    input  logic [8*N-1:0]          data,    // number i is data[8*i +: 8]
    output logic [8+$clog2(N)-1:0]  sum
);
    localparam W = 8 + $clog2(N);
    // TODO: a tree of adders built with generate
endmodule
`,
    publicTestbench: `\`timescale 1ns / 1ps
module tb_adder_tree;
    logic [31:0] data;
    logic [9:0]  sum;
    adder_tree #(.N(4)) dut (.data(data), .sum(sum));
    initial begin
        $dumpfile("wave.vcd"); $dumpvars(0, tb_adder_tree);
        data = {8'd4, 8'd3, 8'd2, 8'd1}; #1 $display("1+2+3+4 = %0d (expect 10)", sum);
        data = {4{8'd255}};              #1 $display("4 x 255 = %0d (expect 1020)", sum);
        $finish;
    end
endmodule
`,
    hiddenTestbench: `\`timescale 1ns / 1ps
module tb_adder_tree_hidden;
    reg  [31:0]  d4;  wire [9:0]  s4;
    reg  [63:0]  d8;  wire [10:0] s8;
    reg  [127:0] d16; wire [11:0] s16;
    integer i, k, errors, w4, w8, w16;
    adder_tree #(.N(4))  t4  (.data(d4),  .sum(s4));
    adder_tree #(.N(8))  t8  (.data(d8),  .sum(s8));
    adder_tree #(.N(16)) t16 (.data(d16), .sum(s16));
    task check;
        begin
            #1;
            w4 = 0; w8 = 0; w16 = 0;
            for (k = 0; k < 4; k = k + 1)  w4  = w4  + d4[8*k +: 8];
            for (k = 0; k < 8; k = k + 1)  w8  = w8  + d8[8*k +: 8];
            for (k = 0; k < 16; k = k + 1) w16 = w16 + d16[8*k +: 8];
            if (s4 !== w4 || s8 !== w8 || s16 !== w16) begin
                $display("FAIL: sums %0d %0d %0d, expected %0d %0d %0d", s4, s8, s16, w4, w8, w16);
                errors = errors + 1;
            end
        end
    endtask
    initial begin
        errors = 0;
        d4 = 0; d8 = 0; d16 = 0; check;
        d4 = {4{8'hFF}}; d8 = {8{8'hFF}}; d16 = {16{8'hFF}}; check;
        for (i = 0; i < 16; i = i + 1) begin
            d4 = 0; d8 = 0; d16 = 0;
            d16[8*i +: 8] = 8'hFF; d8[8*(i % 8) +: 8] = 8'h80; d4[8*(i % 4) +: 8] = i + 1;
            check;
        end
        for (i = 0; i < 400; i = i + 1) begin
            d4 = $random; d8 = {$random, $random}; d16 = {$random, $random, $random, $random};
            check;
        end
        if (errors == 0) $display("ALL TESTS PASSED");
        $finish;
    end
endmodule
`,
  },

  // ─── 9. unique case one-hot mux ────────────────────────────────────────────
  {
    id: "sv-onehot-mux", slug: "sv-onehot-mux",
    title: "SystemVerilog: One-Hot Mux with unique case",
    difficulty: "intermediate", category: "systemverilog",
    tags: ["systemverilog", "unique case", "always_comb", "mux", "combinational"],
    learningLevel: "Verilog Intermediate",
    moduleId: "mod_sv", orderIndex: 78,
    xpReward: 120, waveformRequired: false,
    expectedOutputMode: "stdout_compare",
    statement: `## SystemVerilog: a one-hot mux with \`unique case\`

Buses often select a source with **one-hot** lines: one bit per source, at most one set. \`unique case\` tells the
synthesis tool the items never overlap, so it can build a fast parallel AND-OR mux instead of a priority chain;
simulators can also warn when two items match.

Build a 4-input, 8-bit one-hot mux:

- If exactly one bit of \`sel\` is set, \`y\` is that input (\`sel[0]\` → \`d0\` … \`sel[3]\` → \`d3\`) and \`err\` is 0.
- If \`sel\` is 0, \`y\` is 0 and \`err\` is 0 (nothing selected).
- If two or more bits are set, \`y\` is 0 and \`err\` is 1.

| Port | Dir | Width |
|------|-----|-------|
| \`sel\` | in | 4 |
| \`d0\` … \`d3\` | in | 8 each |
| \`y\` | out | 8 |
| \`err\` | out | 1 |
${SV_NOTE}`,
    constraints: ["Use unique case inside always_comb.", "Assign y and err on every path (defaults first), so no latch."],
    examples: [
      { input: "sel = 4'b0100, d2 = 8'h3C", output: "y = 8'h3C, err = 0" },
      { input: "sel = 4'b0110", output: "y = 8'h00, err = 1", explanation: "Two sources selected at once" },
    ],
    hints: [
      { tier: 1, content: "Default `y = '0; err = 1'b0;` at the top of always_comb." },
      { tier: 2, content: "List the four one-hot values as case items, add an item for 4'b0000 that does nothing, and let default catch everything else." },
      { tier: 3, content: "`unique case (sel) 4'b0001: y = d0; 4'b0010: y = d1; 4'b0100: y = d2; 4'b1000: y = d3; 4'b0000: ; default: err = 1'b1; endcase`" },
    ],
    solutionExplanation: "The defaults cover the idle and error cases for y, the four one-hot items pick a source, and default flags any value with more than one bit set. Because no two items can match the same sel, `unique` is a true promise to the tools, which then drop the priority logic an ordinary case would imply.",
    publicTestcases: [], hiddenTestcases: [],
    starterCode: `\`timescale 1ns / 1ps

module onehot_mux (
    input  logic [3:0] sel,
    input  logic [7:0] d0,
    input  logic [7:0] d1,
    input  logic [7:0] d2,
    input  logic [7:0] d3,
    output logic [7:0] y,
    output logic       err
);
    always_comb begin
        // TODO: defaults, then unique case on sel
    end
endmodule
`,
    publicTestbench: `\`timescale 1ns / 1ps
module tb_onehot_mux;
    logic [3:0] sel;
    logic [7:0] d0 = 8'h11, d1 = 8'h22, d2 = 8'h3C, d3 = 8'h44, y;
    logic err;
    onehot_mux dut (.sel(sel), .d0(d0), .d1(d1), .d2(d2), .d3(d3), .y(y), .err(err));
    initial begin
        $dumpfile("wave.vcd"); $dumpvars(0, tb_onehot_mux);
        sel = 4'b0100; #1 $display("sel=%b y=%h err=%b (expect 3c 0)", sel, y, err);
        sel = 4'b0110; #1 $display("sel=%b y=%h err=%b (expect 00 1)", sel, y, err);
        sel = 4'b0000; #1 $display("sel=%b y=%h err=%b (expect 00 0)", sel, y, err);
        $finish;
    end
endmodule
`,
    hiddenTestbench: `\`timescale 1ns / 1ps
module tb_onehot_mux_hidden;
    reg  [3:0] sel;
    reg  [7:0] d0, d1, d2, d3;
    wire [7:0] y;
    wire       err;
    reg  [7:0] wy;
    reg        we;
    integer i, s, errors;
    onehot_mux dut (.sel(sel), .d0(d0), .d1(d1), .d2(d2), .d3(d3), .y(y), .err(err));
    initial begin
        errors = 0;
        for (i = 0; i < 24; i = i + 1) begin
            d0 = $random; d1 = $random; d2 = $random; d3 = $random;
            for (s = 0; s < 16; s = s + 1) begin
                sel = s; #1;
                case (sel)
                    4'b0001: begin wy = d0; we = 0; end
                    4'b0010: begin wy = d1; we = 0; end
                    4'b0100: begin wy = d2; we = 0; end
                    4'b1000: begin wy = d3; we = 0; end
                    4'b0000: begin wy = 0;  we = 0; end
                    default: begin wy = 0;  we = 1; end
                endcase
                if (y !== wy || err !== we) begin
                    $display("FAIL: sel=%b gave y=%h err=%b, expected y=%h err=%b", sel, y, err, wy, we);
                    errors = errors + 1;
                end
            end
        end
        if (errors == 0) $display("ALL TESTS PASSED");
        $finish;
    end
endmodule
`,
  },

  // ─── 10. function automatic: CRC-8 ─────────────────────────────────────────
  {
    id: "sv-crc8-function", slug: "sv-crc8-function",
    title: "SystemVerilog: CRC-8 with a Function",
    difficulty: "advanced", category: "systemverilog",
    tags: ["systemverilog", "function automatic", "always_ff", "crc", "sequential"],
    learningLevel: "Verilog Advanced",
    moduleId: "mod_sv", orderIndex: 79,
    xpReward: 180, waveformRequired: false,
    expectedOutputMode: "stdout_compare",
    statement: `## SystemVerilog: CRC-8 with a \`function automatic\`

A **CRC** (cyclic redundancy check) is a checksum that catches burst errors: links and file formats append one
so the receiver can tell if bits were flipped. SystemVerilog functions (with \`return\`, local \`int\` loop variables and
\`automatic\` storage) keep the per-byte arithmetic readable, and the clocked part tiny.

Build \`crc8\`: a running **CRC-8** (polynomial **x⁸ + x² + x + 1**, written 0x07; start value 0; no final XOR;
most significant bit first; the "CRC-8/SMBUS" variant).

- On a rising clock edge with \`rst\` = 1, \`crc\` becomes 0.
- Otherwise, when \`valid\` is 1, \`crc\` takes the CRC of everything so far followed by \`data\`.

For one byte: XOR it into the CRC, then 8 times: shift left by one, and if the bit shifted out was 1, XOR in 0x07.

| Port | Dir | Width |
|------|-----|-------|
| \`clk\`, \`rst\`, \`valid\` | in | 1 |
| \`data\` | in | 8 |
| \`crc\` | out | 8 |

The check value: after the nine bytes of the text \`123456789\`, \`crc\` is **0xF4**.
${SV_NOTE}`,
    constraints: ["Put the per-byte step in a function automatic that returns the new CRC.", "Update crc in always_ff."],
    examples: [
      { input: "the bytes \"123456789\" (0x31 … 0x39) with valid = 1", output: "crc = 8'hF4" },
      { input: "one byte 8'h01 after reset", output: "crc = 8'h07" },
    ],
    hints: [
      { tier: 1, content: "Declare `function automatic logic [7:0] crc8_step(input logic [7:0] c, input logic [7:0] d);` inside the module." },
      { tier: 2, content: "Inside it: `logic [7:0] x; x = c ^ d; for (int i = 0; i < 8; i++) x = x[7] ? (x << 1) ^ 8'h07 : (x << 1); return x;`" },
      { tier: 3, content: "`always_ff @(posedge clk) if (rst) crc <= '0; else if (valid) crc <= crc8_step(crc, data);`" },
    ],
    solutionExplanation: "XOR-ing the byte in first and then doing eight shift-and-conditional-XOR steps is polynomial division by 0x07, one bit per step. The function is pure combinational logic (synthesis unrolls the loop), and the always_ff only decides when to take the next value, so the same function could be reused for a checker on the receive side.",
    publicTestcases: [], hiddenTestcases: [],
    starterCode: `\`timescale 1ns / 1ps

module crc8 (
    input  logic       clk,
    input  logic       rst,
    input  logic       valid,
    input  logic [7:0] data,
    output logic [7:0] crc
);
    // TODO: function automatic logic [7:0] crc8_step(...) and a clocked update
endmodule
`,
    publicTestbench: `\`timescale 1ns / 1ps
module tb_crc8;
    logic clk = 0, rst = 1, valid = 0;
    logic [7:0] data = 0, crc;
    crc8 dut (.clk(clk), .rst(rst), .valid(valid), .data(data), .crc(crc));
    always #5 clk = ~clk;
    initial begin
        $dumpfile("wave.vcd"); $dumpvars(0, tb_crc8);
        @(negedge clk) rst = 0;
        valid = 1;
        data = "1"; @(negedge clk); data = "2"; @(negedge clk); data = "3"; @(negedge clk);
        data = "4"; @(negedge clk); data = "5"; @(negedge clk); data = "6"; @(negedge clk);
        data = "7"; @(negedge clk); data = "8"; @(negedge clk); data = "9"; @(negedge clk);
        valid = 0;
        $display("CRC-8 of 123456789 = %h (expect f4)", crc);
        $finish;
    end
endmodule
`,
    hiddenTestbench: `\`timescale 1ns / 1ps
module tb_crc8_hidden;
    reg clk = 0, rst, valid;
    reg [7:0] data, model;
    wire [7:0] crc;
    integer i, errors;
    crc8 dut (.clk(clk), .rst(rst), .valid(valid), .data(data), .crc(crc));
    always #5 clk = ~clk;
    function [7:0] step;
        input [7:0] c, d;
        integer j;
        reg [7:0] x;
        begin
            x = c ^ d;
            for (j = 0; j < 8; j = j + 1) x = x[7] ? ((x << 1) ^ 8'h07) : (x << 1);
            step = x;
        end
    endfunction
    always @(posedge clk)
        if (rst) model <= 8'd0;
        else if (valid) model <= step(model, data);
    task feed(input [7:0] b);
        begin valid = 1; data = b; @(negedge clk); valid = 0; end
    endtask
    initial begin
        errors = 0; rst = 1; valid = 0; data = 0;
        @(negedge clk); @(negedge clk); rst = 0;
        feed("1"); feed("2"); feed("3"); feed("4"); feed("5"); feed("6"); feed("7"); feed("8"); feed("9");
        if (crc !== 8'hF4) begin $display("FAIL: CRC of 123456789 is %h, expected f4", crc); errors = errors + 1; end
        rst = 1; @(negedge clk); rst = 0;
        feed(8'h01);
        if (crc !== 8'h07) begin $display("FAIL: CRC of 01 is %h, expected 07", crc); errors = errors + 1; end
        for (i = 0; i < 1500; i = i + 1) begin
            rst = (i % 211 == 100); valid = $random; data = $random;
            @(negedge clk);
            if (crc !== model) begin $display("FAIL at step %0d: crc = %h, expected %h", i, crc, model); errors = errors + 1; end
        end
        if (errors == 0) $display("ALL TESTS PASSED");
        $finish;
    end
endmodule
`,
  },

  // ─── 11. typedef enum two-process FSM: req/ack handshake ───────────────────
  {
    id: "sv-req-ack-handshake", slug: "sv-req-ack-handshake",
    title: "SystemVerilog: Four-Phase Req/Ack Handshake",
    difficulty: "advanced", category: "systemverilog",
    tags: ["systemverilog", "typedef enum", "fsm", "handshake", "always_ff", "always_comb"],
    learningLevel: "Verilog Advanced",
    moduleId: "mod_sv", orderIndex: 80,
    xpReward: 200, waveformRequired: true,
    expectedOutputMode: "stdout_compare",
    statement: `## SystemVerilog: a four-phase req/ack handshake

When two blocks run at different speeds, a **four-phase handshake** passes data safely: the sender raises \`req\`
with the data held steady, the receiver raises \`ack\` once it has taken it, the sender drops \`req\`, and the
receiver drops \`ack\`. Only then can the next transfer start.

Build the **sender** as a state machine with a \`typedef enum\` and two processes (\`always_ff\` for the state,
\`always_comb\` for the next state):

| State | \`req\` | \`busy\` | Leaves when (sampled at the clock edge) |
|-------|-------|--------|------------------------------|
| IDLE | 0 | 0 | \`start\` is 1: go to REQ and copy \`data_in\` into \`data_out\` |
| REQ | 1 | 1 | \`ack\` is 1: go to RELEASE |
| RELEASE | 0 | 1 | \`ack\` is 0: go to IDLE |

- \`data_out\` is a register: it changes only when a transfer starts, so it is steady while \`req\` is high.
- \`done\` is 1 for exactly one cycle: the cycle after the clock edge that leaves RELEASE.
- \`rst\` (synchronous, active high) returns to IDLE with \`data_out\` = 0 and \`done\` = 0.
- \`start\` is ignored while busy.

| Port | Dir | Width |
|------|-----|-------|
| \`clk\`, \`rst\`, \`start\`, \`ack\` | in | 1 |
| \`data_in\` | in | 8 |
| \`req\`, \`busy\`, \`done\` | out | 1 |
| \`data_out\` | out | 8 |
${SV_NOTE}`,
    constraints: ["Name the states with typedef enum logic [1:0].", "One always_ff for the registers, one always_comb for the next state; req and busy decoded from the state."],
    examples: [
      { input: "start = 1 with data_in = 8'hA7 while idle", output: "next cycle: req = 1, busy = 1, data_out = 8'hA7" },
      { input: "the receiver raises ack, then drops it", output: "req drops after ack rises; done pulses once after ack falls, then busy = 0" },
    ],
    hints: [
      { tier: 1, content: "`typedef enum logic [1:0] { IDLE, REQ, RELEASE } state_t; state_t state, next_state;`" },
      { tier: 2, content: "In always_comb: `next_state = state;` then a unique case moving IDLE→REQ on start, REQ→RELEASE on ack, RELEASE→IDLE on !ack." },
      { tier: 3, content: "In always_ff (not in reset): `state <= next_state; done <= (state == RELEASE) && !ack; if (state == IDLE && start) data_out <= data_in;` and `assign req = (state == REQ); assign busy = (state != IDLE);`" },
    ],
    solutionExplanation: "Each phase of the protocol is one state, and each state waits for exactly one change of ack, so neither side can run ahead of the other. Decoding req from the state (instead of driving it from logic on the inputs) keeps it glitch-free, which matters when the receiver is in another clock domain. data_out only loads in IDLE, so it is stable for the whole time req is high.",
    publicTestcases: [], hiddenTestcases: [],
    starterCode: `\`timescale 1ns / 1ps

module req_ack_sender (
    input  logic       clk,
    input  logic       rst,
    input  logic       start,
    input  logic [7:0] data_in,
    input  logic       ack,
    output logic       req,
    output logic       busy,
    output logic       done,
    output logic [7:0] data_out
);
    typedef enum logic [1:0] { IDLE, REQ, RELEASE } state_t;
    state_t state, next_state;

    // TODO: always_ff for state, data_out and done; always_comb for next_state; decode req and busy
endmodule
`,
    publicTestbench: `\`timescale 1ns / 1ps
module tb_req_ack_sender;
    logic clk = 0, rst = 1, start = 0, ack = 0;
    logic [7:0] data_in = 8'hA7, data_out;
    logic req, busy, done;
    integer i;
    req_ack_sender dut (.clk(clk), .rst(rst), .start(start), .data_in(data_in), .ack(ack), .req(req), .busy(busy), .done(done), .data_out(data_out));
    always #5 clk = ~clk;
    initial begin
        $dumpfile("wave.vcd"); $dumpvars(0, tb_req_ack_sender);
        @(negedge clk) rst = 0;
        start = 1; @(negedge clk); start = 0;
        for (i = 0; i < 10; i = i + 1) begin
            $display("cycle %0d: req=%b ack=%b busy=%b done=%b data_out=%h", i, req, ack, busy, done, data_out);
            if (req) ack = 1; else if (i > 4) ack = 0;     // a receiver that answers at once
            @(negedge clk);
        end
        $finish;
    end
endmodule
`,
    hiddenTestbench: `\`timescale 1ns / 1ps
module tb_req_ack_sender_hidden;
    reg clk = 0, rst, start, ack;
    reg [7:0] data_in;
    wire req, busy, done;
    wire [7:0] data_out;
    reg [1:0] ms;          // model state: 0 idle, 1 req, 2 release
    reg [7:0] mdata;
    reg       mdone;
    integer i, errors, transfers, wait_n, seed;
    req_ack_sender dut (.clk(clk), .rst(rst), .start(start), .data_in(data_in), .ack(ack), .req(req), .busy(busy), .done(done), .data_out(data_out));
    always #5 clk = ~clk;
    // the model sees the same inputs at the same edges
    always @(posedge clk)
        if (rst) begin ms <= 0; mdata <= 0; mdone <= 0; end
        else begin
            mdone <= (ms == 2) && !ack;
            case (ms)
                0: if (start) begin ms <= 1; mdata <= data_in; end
                1: if (ack) ms <= 2;
                2: if (!ack) ms <= 0;
                default: ms <= 0;
            endcase
        end
    always @(posedge clk) if (!rst && mdone) transfers = transfers + 1;
    initial begin
        errors = 0; transfers = 0; seed = 9; wait_n = 0;
        rst = 1; start = 0; ack = 0; data_in = 0;
        @(negedge clk); @(negedge clk); rst = 0;
        for (i = 0; i < 1500; i = i + 1) begin
            if (req !== (ms == 1) || busy !== (ms != 0) || done !== mdone || data_out !== mdata) begin
                $display("FAIL at step %0d: req=%b busy=%b done=%b data_out=%h, expected req=%b busy=%b done=%b data_out=%h",
                         i, req, busy, done, data_out, ms == 1, ms != 0, mdone, mdata);
                errors = errors + 1;
            end
            // next inputs: random starts and data, a receiver with random delays, the odd reset
            start = ($random(seed) & 3) == 0;
            data_in = $random(seed);
            rst = (i % 401 == 300);
            if (wait_n > 0) wait_n = wait_n - 1;
            else if (req && !ack) begin ack = 1; wait_n = $random(seed) & 3; end
            else if (!req && ack) begin ack = 0; wait_n = $random(seed) & 3; end
            @(negedge clk);
        end
        if (transfers < 40) begin $display("FAIL: only %0d transfers completed", transfers); errors = errors + 1; end
        if (errors == 0) $display("ALL TESTS PASSED");
        $finish;
    end
endmodule
`,
  },
];
