/**
 * lib/arena/combinational.ts — Combinational set for HDL Arena.
 * Hidden tests here are exhaustive: every input value is tried.
 * Reference solutions: private/arena-sets-refs.json.
 */

import type { ArenaProblem } from "./types";
import { check, hiddenTest, TIMESCALE } from "./tb";

export const COMBINATIONAL_PROBLEMS: ArenaProblem[] = [
  {
    id: "arena-comb-001", slug: "onehot-to-binary-8", title: "One-Hot to Binary (8 bits)",
    category: "Combinational", difficulty: "Easy", tags: ["encoder", "one-hot", "combinational", "interview"],
    estimatedMin: 10, xpReward: 150,
    statement: `## One-Hot to Binary

Convert an 8-bit one-hot code to its 3-bit index, and flag whether the input really was one-hot.

| Port | Direction | Width | Description |
|------|-----------|-------|-------------|
| \`onehot\` | input | 8 | The code |
| \`bin\` | output | 3 | Index of the set bit; 0 when \`valid\` is 0 |
| \`valid\` | output | 1 | 1 only when exactly one bit is set |

Zero bits set, or two or more bits set, is not one-hot.`,
    constraints: ["Purely combinational: no clock and no latches.", "bin must be 0 whenever valid is 0."],
    examples: [
      { input: "onehot = 8'b0000_0001", output: "bin = 0, valid = 1" },
      { input: "onehot = 8'b0100_0000", output: "bin = 6, valid = 1" },
      { input: "onehot = 8'b0100_0100", output: "bin = 0, valid = 0", explanation: "Two bits are set." },
    ],
    starterCode: `${TIMESCALE}
module onehot_to_binary (
    input  wire [7:0] onehot,
    output reg  [2:0] bin,
    output reg        valid
);

    always @(*) begin
        bin   = 3'd0;
        valid = 1'b0;
        // TODO: set bin and valid from onehot
    end

endmodule
`,
    testbenchSkeleton: `${TIMESCALE}module tb_onehot_to_binary;
    reg  [7:0] onehot;
    wire [2:0] bin;
    wire       valid;

    onehot_to_binary dut (.onehot(onehot), .bin(bin), .valid(valid));

    initial begin
        $dumpfile("wave.vcd");
        $dumpvars(0, tb_onehot_to_binary);
        onehot = 8'b0000_0100; #1;
        $display("onehot=%b bin=%0d valid=%b", onehot, bin, valid);
        // TODO: try the other bits, zero bits set, and two bits set
        $finish;
    end
endmodule
`,
    hiddenTestcases: [
      hiddenTest("tc-comb-001-01", "Each of the eight one-hot codes", 40,
        `reg [7:0] onehot; wire [2:0] bin; wire valid; integer i;
    onehot_to_binary dut (.onehot(onehot), .bin(bin), .valid(valid));`,
        `for (i = 0; i < 8; i = i + 1) begin
            onehot = 8'd1 << i; #1;
            ${check("bin !== i[2:0] || valid !== 1'b1", "onehot=%b got bin=%0d valid=%b", "onehot, bin, valid")}
        end`),
      hiddenTest("tc-comb-001-02", "All 256 inputs, including invalid codes", 60,
        `reg [7:0] onehot; wire [2:0] bin; wire valid; integer i, b, n, at;
    onehot_to_binary dut (.onehot(onehot), .bin(bin), .valid(valid));`,
        `for (i = 0; i < 256; i = i + 1) begin
            onehot = i[7:0]; #1;
            n = 0; at = 0;
            for (b = 0; b < 8; b = b + 1) if (onehot[b]) begin n = n + 1; at = b; end
            if (n != 1) at = 0;
            ${check("valid !== (n == 1) || bin !== at[2:0]", "onehot=%b got bin=%0d valid=%b", "onehot, bin, valid")}
        end`),
    ],
  },

  {
    id: "arena-comb-002", slug: "bcd-to-seven-seg", title: "BCD to Seven-Segment",
    category: "Combinational", difficulty: "Easy", tags: ["decoder", "7-segment", "combinational", "interview"],
    estimatedMin: 15, xpReward: 150,
    statement: `## BCD to Seven-Segment

Drive a common-anode (active-low) seven-segment display from a BCD digit.

| Port | Direction | Width | Description |
|------|-----------|-------|-------------|
| \`bcd\` | input | 4 | Digit, 0 to 9 |
| \`seg\` | output | 7 | \`{g,f,e,d,c,b,a}\`; 0 lights a segment |

Segments are named the usual way: \`a\` top, \`b\` upper right, \`c\` lower right, \`d\` bottom, \`e\` lower left, \`f\` upper left, \`g\` middle.

The digit 6 has its top bar lit, 7 uses only \`a\`, \`b\`, \`c\`, and 9 has its bottom bar lit.

Inputs 10 to 15 are not BCD: turn every segment off.`,
    constraints: ["Purely combinational: no latches.", "seg is active low."],
    examples: [
      { input: "bcd = 0", output: "seg = 7'b1000000", explanation: "All segments except g." },
      { input: "bcd = 8", output: "seg = 7'b0000000" },
      { input: "bcd = 12", output: "seg = 7'b1111111", explanation: "Not a digit, so blank." },
    ],
    starterCode: `${TIMESCALE}
module bcd_to_seven_seg (
    input  wire [3:0] bcd,
    output reg  [6:0] seg     // {g,f,e,d,c,b,a}, active low
);

    always @(*) begin
        seg = 7'b1111111;
        // TODO: a case statement with one pattern per digit
    end

endmodule
`,
    testbenchSkeleton: `${TIMESCALE}module tb_bcd_to_seven_seg;
    reg  [3:0] bcd;
    wire [6:0] seg;

    bcd_to_seven_seg dut (.bcd(bcd), .seg(seg));

    initial begin
        $dumpfile("wave.vcd");
        $dumpvars(0, tb_bcd_to_seven_seg);
        bcd = 4'd0; #1;
        $display("bcd=%0d seg=%b", bcd, seg);
        // TODO: check the other digits and the invalid codes
        $finish;
    end
endmodule
`,
    hiddenTestcases: [
      hiddenTest("tc-comb-002-01", "Digits 0 to 9", 70,
        `reg [3:0] bcd; wire [6:0] seg; reg [6:0] want [0:9]; integer i;
    bcd_to_seven_seg dut (.bcd(bcd), .seg(seg));`,
        `want[0] = 7'b1000000; want[1] = 7'b1111001; want[2] = 7'b0100100; want[3] = 7'b0110000; want[4] = 7'b0011001;
        want[5] = 7'b0010010; want[6] = 7'b0000010; want[7] = 7'b1111000; want[8] = 7'b0000000; want[9] = 7'b0010000;
        for (i = 0; i < 10; i = i + 1) begin
            bcd = i[3:0]; #1;
            ${check("seg !== want[i]", "digit %0d got %b want %b", "i, seg, want[i]")}
        end`),
      hiddenTest("tc-comb-002-02", "Codes 10 to 15 blank the display", 30,
        `reg [3:0] bcd; wire [6:0] seg; integer i;
    bcd_to_seven_seg dut (.bcd(bcd), .seg(seg));`,
        `for (i = 10; i < 16; i = i + 1) begin
            bcd = i[3:0]; #1;
            ${check("seg !== 7'b1111111", "code %0d got %b, want all off", "i, seg")}
        end`),
    ],
  },

  {
    id: "arena-comb-003", slug: "majority-of-seven", title: "Majority of Seven",
    category: "Combinational", difficulty: "Medium", tags: ["majority", "population-count", "combinational", "interview"],
    estimatedMin: 15, xpReward: 300,
    statement: `## Majority of Seven

Seven voters each drive one bit. Output 1 when at least four of them vote 1.

| Port | Direction | Width | Description |
|------|-----------|-------|-------------|
| \`v\` | input | 7 | The votes |
| \`y\` | output | 1 | 1 when four or more bits of \`v\` are 1 |

Interviewers often follow up by asking how the logic scales. Counting the ones and comparing with 4 is the simple answer; a compressor tree of full adders is the small one.`,
    constraints: ["Purely combinational."],
    examples: [
      { input: "v = 7'b0001111", output: "y = 1", explanation: "Exactly four votes." },
      { input: "v = 7'b0101010", output: "y = 0", explanation: "Only three votes." },
    ],
    starterCode: `${TIMESCALE}
module majority_of_seven (
    input  wire [6:0] v,
    output wire       y
);

    // TODO: y is 1 when four or more bits of v are 1
    assign y = 1'b0;

endmodule
`,
    testbenchSkeleton: `${TIMESCALE}module tb_majority_of_seven;
    reg  [6:0] v;
    wire       y;

    majority_of_seven dut (.v(v), .y(y));

    initial begin
        $dumpfile("wave.vcd");
        $dumpvars(0, tb_majority_of_seven);
        v = 7'b0001111; #1;
        $display("v=%b y=%b", v, y);
        // TODO: try exactly three votes, none, and all seven
        $finish;
    end
endmodule
`,
    hiddenTestcases: [
      hiddenTest("tc-comb-003-01", "Just under and just over the threshold", 30,
        `reg [6:0] v; wire y;
    majority_of_seven dut (.v(v), .y(y));`,
        `v = 7'b0000111; #1; ${check("y !== 1'b0", "three votes %b gave %b", "v, y")}
        v = 7'b0001111; #1; ${check("y !== 1'b1", "four votes %b gave %b", "v, y")}
        v = 7'b0101010; #1; ${check("y !== 1'b0", "three votes %b gave %b", "v, y")}
        v = 7'b1010101; #1; ${check("y !== 1'b1", "four votes %b gave %b", "v, y")}
        v = 7'b0000000; #1; ${check("y !== 1'b0", "no votes gave %b", "y")}
        v = 7'b1111111; #1; ${check("y !== 1'b1", "seven votes gave %b", "y")}`),
      hiddenTest("tc-comb-003-02", "All 128 inputs", 70,
        `reg [6:0] v; wire y; integer i, b, n;
    majority_of_seven dut (.v(v), .y(y));`,
        `for (i = 0; i < 128; i = i + 1) begin
            v = i[6:0]; #1;
            n = 0;
            for (b = 0; b < 7; b = b + 1) if (v[b]) n = n + 1;
            ${check("y !== (n >= 4)", "v=%b has %0d votes, got y=%b", "v, n, y")}
        end`),
    ],
  },

  {
    id: "arena-comb-004", slug: "leading-zero-count-16", title: "Leading Zero Count (16 bits)",
    category: "Combinational", difficulty: "Medium", tags: ["priority-encoder", "clz", "combinational", "interview"],
    estimatedMin: 20, xpReward: 300,
    statement: `## Leading Zero Count

Count how many zero bits sit above the highest 1. Floating-point normalisers and CPU \`clz\` instructions need exactly this.

| Port | Direction | Width | Description |
|------|-----------|-------|-------------|
| \`in\` | input | 16 | The value |
| \`count\` | output | 5 | Zeros before the first 1, from bit 15 down; 16 when \`in\` is 0 |`,
    constraints: ["Purely combinational.", "count is 16 when in is 0."],
    examples: [
      { input: "in = 16'h8000", output: "count = 0" },
      { input: "in = 16'h0001", output: "count = 15" },
      { input: "in = 16'h00F0", output: "count = 8", explanation: "Bits below the first 1 don't matter." },
      { input: "in = 16'h0000", output: "count = 16" },
    ],
    starterCode: `${TIMESCALE}
module leading_zero_count (
    input  wire [15:0] in,
    output reg  [4:0]  count
);

    always @(*) begin
        count = 5'd0;
        // TODO: count the zeros above the highest 1
    end

endmodule
`,
    testbenchSkeleton: `${TIMESCALE}module tb_leading_zero_count;
    reg  [15:0] in;
    wire [4:0]  count;

    leading_zero_count dut (.in(in), .count(count));

    initial begin
        $dumpfile("wave.vcd");
        $dumpvars(0, tb_leading_zero_count);
        in = 16'h00F0; #1;
        $display("in=%h count=%0d", in, count);
        // TODO: try zero, the top bit, and the bottom bit
        $finish;
    end
endmodule
`,
    hiddenTestcases: [
      hiddenTest("tc-comb-004-01", "Single bits and zero", 30,
        `reg [15:0] in; wire [4:0] count; integer i, w;
    leading_zero_count dut (.in(in), .count(count));`,
        `in = 16'd0; #1; ${check("count !== 5'd16", "in=0 got %0d, want 16", "count")}
        for (i = 0; i < 16; i = i + 1) begin
            in = 16'd1 << i; #1; w = 15 - i;
            ${check("count !== w[4:0]", "in=%h got %0d want %0d", "in, count, w")}
        end`),
      hiddenTest("tc-comb-004-02", "All 65536 inputs", 70,
        `reg [15:0] in; wire [4:0] count; integer i, n;
    leading_zero_count dut (.in(in), .count(count));`,
        `for (i = 0; i < 65536; i = i + 1) begin
            in = i[15:0]; #1;
            n = 0;
            while (n < 16 && !in[15 - n]) n = n + 1;
            ${check("count !== n[4:0]", "in=%h got %0d want %0d", "in, count, n")}
        end`),
    ],
  },

  {
    id: "arena-comb-005", slug: "binary-to-bcd-8", title: "Binary to BCD (8 bits)",
    category: "Combinational", difficulty: "Hard", tags: ["double-dabble", "BCD", "combinational", "interview"],
    estimatedMin: 30, xpReward: 450,
    statement: `## Binary to BCD

Convert an 8-bit binary number to three BCD digits, in combinational logic.

| Port | Direction | Width | Description |
|------|-----------|-------|-------------|
| \`bin\` | input | 8 | 0 to 255 |
| \`bcd\` | output | 12 | \`{hundreds, tens, ones}\`, four bits each |

Division by 10 works in simulation but synthesises into a lot of logic. The classic answer is **double dabble**: shift the binary number left into the BCD digits one bit at a time, and before each shift add 3 to any digit that is 5 or more.`,
    constraints: ["Purely combinational."],
    examples: [
      { input: "bin = 8'd255", output: "bcd = 12'h255" },
      { input: "bin = 8'd128", output: "bcd = 12'h128" },
      { input: "bin = 8'd9", output: "bcd = 12'h009" },
    ],
    starterCode: `${TIMESCALE}
module binary_to_bcd (
    input  wire [7:0]  bin,
    output reg  [11:0] bcd
);

    always @(*) begin
        bcd = 12'd0;
        // TODO: double dabble: loop over the 8 bits from the top
    end

endmodule
`,
    testbenchSkeleton: `${TIMESCALE}module tb_binary_to_bcd;
    reg  [7:0]  bin;
    wire [11:0] bcd;

    binary_to_bcd dut (.bin(bin), .bcd(bcd));

    initial begin
        $dumpfile("wave.vcd");
        $dumpvars(0, tb_binary_to_bcd);
        bin = 8'd128; #1;
        $display("bin=%0d bcd=%h", bin, bcd);
        // TODO: try 0, 9, 10, 99, 100 and 255
        $finish;
    end
endmodule
`,
    hiddenTestcases: [
      hiddenTest("tc-comb-005-01", "Digit boundaries", 30,
        `reg [7:0] bin; wire [11:0] bcd;
    binary_to_bcd dut (.bin(bin), .bcd(bcd));`,
        `bin = 8'd0;   #1; ${check("bcd !== 12'h000", "bin=0 got %h", "bcd")}
        bin = 8'd9;   #1; ${check("bcd !== 12'h009", "bin=9 got %h", "bcd")}
        bin = 8'd10;  #1; ${check("bcd !== 12'h010", "bin=10 got %h", "bcd")}
        bin = 8'd99;  #1; ${check("bcd !== 12'h099", "bin=99 got %h", "bcd")}
        bin = 8'd100; #1; ${check("bcd !== 12'h100", "bin=100 got %h", "bcd")}
        bin = 8'd255; #1; ${check("bcd !== 12'h255", "bin=255 got %h", "bcd")}`),
      hiddenTest("tc-comb-005-02", "All 256 inputs", 70,
        `reg [7:0] bin; wire [11:0] bcd; integer i, w;
    binary_to_bcd dut (.bin(bin), .bcd(bcd));`,
        `for (i = 0; i < 256; i = i + 1) begin
            bin = i[7:0]; #1;
            w = ((i / 100) << 8) | (((i / 10) % 10) << 4) | (i % 10);
            ${check("bcd !== w[11:0]", "bin=%0d got %h", "bin, bcd")}
        end`),
    ],
  },
];
