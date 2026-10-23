/**
 * lib/problems/practice-pack.ts — extra Learning Path practice: 10 Beginner, 8 Intermediate
 * and 6 Advanced problems, slotted into the existing modules (lib/problems/modules.ts).
 *
 * Every hidden testbench carries its own model of the design and prints "FAIL: …" per
 * mismatch, then ALL TESTS PASSED / TESTS FAILED. Reference solutions are in
 * private/reference-solutions.json (not in git); scripts/check-problems.ts checks that each
 * starter compiles and does not pass.
 */
import type { Problem } from "@/lib/problem-types";

const TS = "`timescale 1ns / 1ps";
const END = `        if (errors == 0) $display("ALL TESTS PASSED");
        else $display("TESTS FAILED: %0d error(s)", errors);
        $finish;`;

type Draft = Omit<Problem, "id" | "publicTestcases" | "hiddenTestcases" | "waveformRequired" | "expectedOutputMode" | "difficulty" | "learningLevel">;
const make = (difficulty: Problem["difficulty"], learningLevel: Problem["learningLevel"]) => (p: Draft): Problem => ({
  id: p.slug, difficulty, learningLevel, publicTestcases: [], hiddenTestcases: [], waveformRequired: false, expectedOutputMode: "stdout_compare", ...p,
});
const beginner = make("beginner", "Verilog Beginner");
const intermediate = make("intermediate", "Verilog Intermediate");
const advanced = make("advanced", "Verilog Advanced");

// ═════════════════════════════════════════════════════════════════════════════
// Beginner
// ═════════════════════════════════════════════════════════════════════════════

const majorityOfThree = beginner({
  slug: "majority-of-three", title: "Majority of Three", category: "combinational",
  tags: ["gates", "assign", "voting"], moduleId: "mod_logic_gates", orderIndex: 41, xpReward: 30,
  statement: `## Majority of Three

Three sensors vote on whether a door is open. The output \`y\` is 1 when **at least two** of the inputs \`a\`, \`b\`, \`c\` are 1.

| a | b | c | y |
|---|---|---|---|
| 0 | 0 | 0 | 0 |
| 0 | 1 | 1 | 1 |
| 1 | 0 | 1 | 1 |
| 1 | 1 | 1 | 1 |

Majority voting is how triple-modular-redundant hardware (in spacecraft, for example) survives one failed unit.`,
  constraints: ["Use a single continuous assignment (assign).", "Use only &, | and parentheses."],
  examples: [{ input: "a=1, b=0, c=1", output: "y=1" }, { input: "a=0, b=0, c=1", output: "y=0" }],
  hints: [
    { tier: 1, content: "List the cases where y is 1: any two inputs both being 1 is enough." },
    { tier: 2, content: "`assign y = (a & b) | (b & c) | (a & c);`" },
  ],
  starterCode: `${TS}

module majority3 (
    input  wire a,
    input  wire b,
    input  wire c,
    output wire y
);

    // TODO: y is 1 when at least two inputs are 1
    assign y = 1'b0;

endmodule
`,
  publicTestbench: `${TS}
module tb_majority3;
    reg a, b, c; wire y;
    majority3 dut (.a(a), .b(b), .c(c), .y(y));
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_majority3); end
    initial begin
        a=0; b=0; c=0; #10 $display("000 -> y=%b (expect 0)", y);
        a=0; b=1; c=1; #10 $display("011 -> y=%b (expect 1)", y);
        a=1; b=0; c=0; #10 $display("100 -> y=%b (expect 0)", y);
        a=1; b=1; c=1; #10 $display("111 -> y=%b (expect 1)", y);
        $finish;
    end
endmodule
`,
  hiddenTestbench: `${TS}
module tb_majority3_hidden;
    reg a, b, c; wire y;
    integer i, errors;
    reg exp;
    majority3 dut (.a(a), .b(b), .c(c), .y(y));
    initial begin
        errors = 0;
        for (i = 0; i < 8; i = i + 1) begin
            {a, b, c} = i[2:0]; #5;
            exp = (a & b) | (b & c) | (a & c);
            if (y !== exp) begin $display("FAIL: a=%b b=%b c=%b: y=%b, expected %b", a, b, c, y, exp); errors = errors + 1; end
        end
${END}
    end
endmodule
`,
});

const parityErrorDetector = beginner({
  slug: "parity-error-detector", title: "Parity Error Detector", category: "combinational",
  tags: ["parity", "reduction", "error-detection"], moduleId: "mod_combinational", orderIndex: 42, xpReward: 40,
  statement: `## Parity Error Detector

A sender adds an **even parity** bit to every byte so that the 9 bits together always contain an even number of 1s. The receiver checks it.

Inputs: \`data[7:0]\` and the received \`parity\` bit. Output \`error\` is 1 when the 9 bits contain an **odd** number of 1s (one bit, or any odd number of bits, flipped on the way).

| data | parity | ones in all 9 bits | error |
|------|--------|--------------------|-------|
| 8'b0000_0011 | 0 | 2 | 0 |
| 8'b0000_0111 | 1 | 4 | 0 |
| 8'b0000_0111 | 0 | 3 | 1 |`,
  constraints: ["Use a reduction operator: no loops are needed."],
  examples: [{ input: "data=8'hFF, parity=0", output: "error=0" }, { input: "data=8'h01, parity=0", output: "error=1" }],
  hints: [
    { tier: 1, content: "The XOR of a group of bits is 1 exactly when the group has an odd number of 1s." },
    { tier: 2, content: "`assign error = ^{data, parity};`" },
  ],
  starterCode: `${TS}

module parity_check (
    input  wire [7:0] data,
    input  wire       parity,
    output wire       error
);

    // TODO: error = 1 when data and parity together hold an odd number of 1s
    assign error = 1'b0;

endmodule
`,
  publicTestbench: `${TS}
module tb_parity_check;
    reg [7:0] data; reg parity; wire error;
    parity_check dut (.data(data), .parity(parity), .error(error));
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_parity_check); end
    initial begin
        data = 8'b0000_0011; parity = 0; #10 $display("data=%b p=%b -> error=%b (expect 0)", data, parity, error);
        data = 8'b0000_0111; parity = 1; #10 $display("data=%b p=%b -> error=%b (expect 0)", data, parity, error);
        data = 8'b0000_0111; parity = 0; #10 $display("data=%b p=%b -> error=%b (expect 1)", data, parity, error);
        $finish;
    end
endmodule
`,
  hiddenTestbench: `${TS}
module tb_parity_check_hidden;
    reg [7:0] data; reg parity; wire error;
    integer i, k, ones, errors;
    parity_check dut (.data(data), .parity(parity), .error(error));
    initial begin
        errors = 0;
        for (i = 0; i < 512; i = i + 1) begin
            {data, parity} = i[8:0]; #2;
            ones = 0;
            for (k = 0; k < 9; k = k + 1) ones = ones + i[k];
            if (error !== ones % 2) begin $display("FAIL: data=%b parity=%b: error=%b, expected %0d", data, parity, error, ones % 2); errors = errors + 1; end
        end
${END}
    end
endmodule
`,
});

const bitReverse = beginner({
  slug: "bit-reverse-8", title: "Reverse the Bits", category: "combinational",
  tags: ["concatenation", "vectors", "for-loop"], moduleId: "mod_combinational", orderIndex: 43, xpReward: 40,
  statement: `## Reverse the Bits

Output \`out[7:0]\` is \`in[7:0]\` with its bit order reversed: \`out[0] = in[7]\`, \`out[1] = in[6]\`, …, \`out[7] = in[0]\`.

Bit reversal appears in FFT address generation and when a serial protocol sends LSB-first data that you store MSB-first.

| in | out |
|----|-----|
| 8'b1000_0000 | 8'b0000_0001 |
| 8'b1100_1010 | 8'b0101_0011 |`,
  constraints: ["Use a concatenation, or a for loop inside always @(*)."],
  examples: [{ input: "in=8'b0000_1111", output: "out=8'b1111_0000" }],
  hints: [
    { tier: 1, content: "List the bits in the opposite order inside { }." },
    { tier: 2, content: "`assign out = {in[0], in[1], in[2], in[3], in[4], in[5], in[6], in[7]};`" },
  ],
  starterCode: `${TS}

module bit_reverse (
    input  wire [7:0] in,
    output wire [7:0] out
);

    // TODO: out[i] = in[7 - i]
    assign out = in;

endmodule
`,
  publicTestbench: `${TS}
module tb_bit_reverse;
    reg [7:0] in; wire [7:0] out;
    bit_reverse dut (.in(in), .out(out));
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_bit_reverse); end
    initial begin
        in = 8'b1000_0000; #10 $display("in=%b -> out=%b (expect 00000001)", in, out);
        in = 8'b1100_1010; #10 $display("in=%b -> out=%b (expect 01010011)", in, out);
        $finish;
    end
endmodule
`,
  hiddenTestbench: `${TS}
module tb_bit_reverse_hidden;
    reg [7:0] in; wire [7:0] out;
    reg [7:0] exp;
    integer i, k, errors;
    bit_reverse dut (.in(in), .out(out));
    initial begin
        errors = 0;
        for (i = 0; i < 256; i = i + 1) begin
            in = i[7:0]; #2;
            for (k = 0; k < 8; k = k + 1) exp[k] = in[7 - k];
            if (out !== exp) begin $display("FAIL: in=%b: out=%b, expected %b", in, out, exp); errors = errors + 1; end
        end
${END}
    end
endmodule
`,
});

const countLeadingZeros = beginner({
  slug: "count-leading-zeros-8", title: "Count Leading Zeros", category: "combinational",
  tags: ["priority", "casez", "for-loop", "normalisation"], moduleId: "mod_combinational", orderIndex: 44, xpReward: 50,
  statement: `## Count Leading Zeros

Output \`count[3:0]\` is the number of 0 bits before the first 1, counting from the MSB of \`in[7:0]\`. If \`in\` is all zeros, \`count\` is 8.

| in | count |
|----|-------|
| 8'b1xxx_xxxx | 0 |
| 8'b0001_0110 | 3 |
| 8'b0000_0001 | 7 |
| 8'b0000_0000 | 8 |

Floating-point hardware uses this to normalise a result (shift until the top bit is 1).`,
  constraints: ["Combinational: always @(*) or assign.", "Give count a value on every path (no latches)."],
  examples: [{ input: "in=8'b0010_0000", output: "count=2" }],
  hints: [
    { tier: 1, content: "It's a priority encoder from the top: the first 1 you meet from bit 7 down decides the answer." },
    { tier: 2, content: "`casez (in) 8'b1???????: count = 0; 8'b01??????: count = 1; … 8'b00000000: count = 8; endcase`" },
    { tier: 3, content: "Or a loop: start at count = 8 and, for i from 0 up to 7, `if (in[i]) count = 7 - i;` (the last assignment wins: the highest 1)." },
  ],
  starterCode: `${TS}

module clz8 (
    input  wire [7:0] in,
    output reg  [3:0] count
);

    always @(*) begin
        count = 4'd0;
        // TODO: count the zeros above the highest 1 (8 when in is 0)
    end

endmodule
`,
  publicTestbench: `${TS}
module tb_clz8;
    reg [7:0] in; wire [3:0] count;
    clz8 dut (.in(in), .count(count));
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_clz8); end
    initial begin
        in = 8'b1000_0000; #10 $display("in=%b -> count=%0d (expect 0)", in, count);
        in = 8'b0001_0110; #10 $display("in=%b -> count=%0d (expect 3)", in, count);
        in = 8'b0000_0001; #10 $display("in=%b -> count=%0d (expect 7)", in, count);
        in = 8'b0000_0000; #10 $display("in=%b -> count=%0d (expect 8)", in, count);
        $finish;
    end
endmodule
`,
  hiddenTestbench: `${TS}
module tb_clz8_hidden;
    reg [7:0] in; wire [3:0] count;
    integer i, k, exp, errors;
    clz8 dut (.in(in), .count(count));
    initial begin
        errors = 0;
        for (i = 0; i < 256; i = i + 1) begin
            in = i[7:0]; #2;
            exp = 8;
            for (k = 0; k < 8; k = k + 1) if (in[k]) exp = 7 - k;
            if (count !== exp) begin $display("FAIL: in=%b: count=%0d, expected %0d", in, count, exp); errors = errors + 1; end
        end
${END}
    end
endmodule
`,
});

const absoluteValue = beginner({
  slug: "absolute-value-8", title: "Absolute Value", category: "combinational",
  tags: ["twos-complement", "signed", "arithmetic"], moduleId: "mod_combinational", orderIndex: 45, xpReward: 50,
  statement: `## Absolute Value

\`x[7:0]\` is a signed (two's complement) number from −128 to 127. Output \`y[7:0]\` is its magnitude as an **unsigned** number from 0 to 128.

| x (signed) | x (bits) | y |
|-----------|----------|---|
| 5 | 8'h05 | 5 |
| −5 | 8'hFB | 5 |
| −128 | 8'h80 | 128 (8'h80) |

Remember how two's complement negation works: invert every bit, then add 1. The sign bit \`x[7]\` tells you whether to negate.`,
  constraints: ["Combinational.", "−128 must give 128: y is unsigned, so 8 bits are enough."],
  examples: [{ input: "x=8'hFF (−1)", output: "y=8'h01" }, { input: "x=8'h7F (127)", output: "y=8'h7F" }],
  hints: [
    { tier: 1, content: "If x is negative (x[7] = 1), y = −x; otherwise y = x." },
    { tier: 2, content: "`assign y = x[7] ? (~x + 8'd1) : x;`" },
  ],
  starterCode: `${TS}

module abs8 (
    input  wire [7:0] x,      // two's complement
    output wire [7:0] y       // unsigned magnitude
);

    // TODO: negate x when it is negative
    assign y = x;

endmodule
`,
  publicTestbench: `${TS}
module tb_abs8;
    reg [7:0] x; wire [7:0] y;
    abs8 dut (.x(x), .y(y));
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_abs8); end
    initial begin
        x = 8'h05; #10 $display("x=%h -> y=%0d (expect 5)", x, y);
        x = 8'hFB; #10 $display("x=%h -> y=%0d (expect 5)", x, y);
        x = 8'h80; #10 $display("x=%h -> y=%0d (expect 128)", x, y);
        $finish;
    end
endmodule
`,
  hiddenTestbench: `${TS}
module tb_abs8_hidden;
    reg [7:0] x; wire [7:0] y;
    integer i, v, errors;
    abs8 dut (.x(x), .y(y));
    initial begin
        errors = 0;
        for (i = 0; i < 256; i = i + 1) begin
            x = i[7:0]; #2;
            v = i; if (i >= 128) v = 256 - i;
            if (y !== v) begin $display("FAIL: x=%h: y=%0d, expected %0d", x, y, v); errors = errors + 1; end
        end
${END}
    end
endmodule
`,
});

const bcdIncrement = beginner({
  slug: "bcd-increment", title: "BCD Digit Increment", category: "combinational",
  tags: ["bcd", "case", "carry"], moduleId: "mod_combinational", orderIndex: 46, xpReward: 45,
  statement: `## BCD Digit Increment

A BCD digit uses 4 bits for the values 0 to 9. Add 1 to digit \`d\`:

- \`q\` is the next digit, wrapping 9 → 0;
- \`carry\` is 1 when the digit wraps (it carries into the next decade);
- \`invalid\` is 1 when \`d\` is 10 to 15 (not a BCD digit); then \`q\` and \`carry\` are 0.

| d | q | carry | invalid |
|---|---|-------|---------|
| 3 | 4 | 0 | 0 |
| 9 | 0 | 1 | 0 |
| 12 | 0 | 0 | 1 |`,
  constraints: ["Combinational.", "Give every output a value on every path."],
  examples: [{ input: "d=4'd8", output: "q=9, carry=0, invalid=0" }],
  hints: [
    { tier: 1, content: "Three cases: d < 9, d == 9, and d > 9." },
    { tier: 2, content: "`if (d > 9) begin q = 0; carry = 0; invalid = 1; end else if (d == 9) begin q = 0; carry = 1; invalid = 0; end else begin q = d + 1; carry = 0; invalid = 0; end`" },
  ],
  starterCode: `${TS}

module bcd_inc (
    input  wire [3:0] d,
    output reg  [3:0] q,
    output reg        carry,
    output reg        invalid
);

    always @(*) begin
        q = d + 4'd1;
        carry = 1'b0;
        invalid = 1'b0;
        // TODO: wrap 9 to 0 with a carry; flag 10..15 as invalid
    end

endmodule
`,
  publicTestbench: `${TS}
module tb_bcd_inc;
    reg [3:0] d; wire [3:0] q; wire carry, invalid;
    bcd_inc dut (.d(d), .q(q), .carry(carry), .invalid(invalid));
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_bcd_inc); end
    initial begin
        d = 3;  #10 $display("d=%0d -> q=%0d carry=%b invalid=%b (expect 4 0 0)", d, q, carry, invalid);
        d = 9;  #10 $display("d=%0d -> q=%0d carry=%b invalid=%b (expect 0 1 0)", d, q, carry, invalid);
        d = 12; #10 $display("d=%0d -> q=%0d carry=%b invalid=%b (expect 0 0 1)", d, q, carry, invalid);
        $finish;
    end
endmodule
`,
  hiddenTestbench: `${TS}
module tb_bcd_inc_hidden;
    reg [3:0] d; wire [3:0] q; wire carry, invalid;
    integer i, eq, ec, ei, errors;
    bcd_inc dut (.d(d), .q(q), .carry(carry), .invalid(invalid));
    initial begin
        errors = 0;
        for (i = 0; i < 16; i = i + 1) begin
            d = i[3:0]; #2;
            if (i > 9) begin eq = 0; ec = 0; ei = 1; end
            else if (i == 9) begin eq = 0; ec = 1; ei = 0; end
            else begin eq = i + 1; ec = 0; ei = 0; end
            if (q !== eq || carry !== ec || invalid !== ei) begin
                $display("FAIL: d=%0d: q=%0d carry=%b invalid=%b, expected %0d %0d %0d", d, q, carry, invalid, eq, ec, ei);
                errors = errors + 1;
            end
        end
${END}
    end
endmodule
`,
});

const thermometer = beginner({
  slug: "thermometer-encoder", title: "Thermometer Code", category: "combinational",
  tags: ["encoding", "shift", "flash-adc"], moduleId: "mod_combinational", orderIndex: 47, xpReward: 45,
  statement: `## Thermometer Code

Convert a 3-bit number \`n\` (0 to 7) to a 7-bit **thermometer code** \`t\`: the lowest \`n\` bits are 1, the rest 0. Like mercury rising in a thermometer.

| n | t |
|---|---|
| 0 | 7'b000_0000 |
| 3 | 7'b000_0111 |
| 7 | 7'b111_1111 |

Flash ADCs produce thermometer codes (one comparator per level); a bar-graph LED display shows one.`,
  constraints: ["Combinational."],
  examples: [{ input: "n=5", output: "t=7'b001_1111" }],
  hints: [
    { tier: 1, content: "n ones at the bottom = 2ⁿ − 1." },
    { tier: 2, content: "`assign t = (7'd1 << n) - 7'd1;` — or a case statement with 8 rows." },
  ],
  starterCode: `${TS}

module thermo3 (
    input  wire [2:0] n,
    output wire [6:0] t
);

    // TODO: the lowest n bits of t are 1
    assign t = 7'd0;

endmodule
`,
  publicTestbench: `${TS}
module tb_thermo3;
    reg [2:0] n; wire [6:0] t;
    thermo3 dut (.n(n), .t(t));
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_thermo3); end
    initial begin
        n = 0; #10 $display("n=%0d -> t=%b (expect 0000000)", n, t);
        n = 3; #10 $display("n=%0d -> t=%b (expect 0000111)", n, t);
        n = 7; #10 $display("n=%0d -> t=%b (expect 1111111)", n, t);
        $finish;
    end
endmodule
`,
  hiddenTestbench: `${TS}
module tb_thermo3_hidden;
    reg [2:0] n; wire [6:0] t;
    reg [6:0] exp;
    integer i, k, errors;
    thermo3 dut (.n(n), .t(t));
    initial begin
        errors = 0;
        for (i = 0; i < 8; i = i + 1) begin
            n = i[2:0]; #2;
            for (k = 0; k < 7; k = k + 1) exp[k] = (k < i);
            if (t !== exp) begin $display("FAIL: n=%0d: t=%b, expected %b", n, t, exp); errors = errors + 1; end
        end
${END}
    end
endmodule
`,
});

const signedCompare = beginner({
  slug: "signed-vs-unsigned-compare", title: "Signed vs Unsigned Compare", category: "combinational",
  tags: ["signed", "comparison", "$signed", "debug"], moduleId: "mod_combinational", orderIndex: 48, xpReward: 55,
  statement: `## Signed vs Unsigned Compare

The same 4 bits mean different numbers: \`4'b1111\` is 15 unsigned but −1 in two's complement. Comparisons must know which.

Inputs \`a[3:0]\`, \`b[3:0]\`. Outputs:
- \`lt_u\` = 1 when a < b reading both as **unsigned** (0 … 15);
- \`lt_s\` = 1 when a < b reading both as **signed** (−8 … 7).

| a | b | unsigned | signed | lt_u | lt_s |
|---|---|----------|--------|------|------|
| 4'b0001 | 4'b1111 | 1 < 15 | 1 < −1? | 1 | 0 |
| 4'b1000 | 4'b0111 | 8 < 7? | −8 < 7 | 0 | 1 |

The starter's \`lt_s\` has the classic bug: the ports are unsigned, so \`<\` compares them as unsigned.`,
  constraints: ["Combinational.", "Use $signed(), or reason about the sign bits."],
  examples: [{ input: "a=4'b1110 (−2), b=4'b0001 (1)", output: "lt_u=0, lt_s=1" }],
  hints: [
    { tier: 1, content: "In Verilog a comparison is signed only if both operands are signed." },
    { tier: 2, content: "`assign lt_s = $signed(a) < $signed(b);`" },
    { tier: 3, content: "Without $signed: if the sign bits differ, the negative one is smaller; if they match, compare as unsigned." },
  ],
  starterCode: `${TS}

module cmp_su (
    input  wire [3:0] a,
    input  wire [3:0] b,
    output wire       lt_u,
    output wire       lt_s
);

    assign lt_u = a < b;
    assign lt_s = a < b;      // BUG: this compares as unsigned

endmodule
`,
  publicTestbench: `${TS}
module tb_cmp_su;
    reg [3:0] a, b; wire lt_u, lt_s;
    cmp_su dut (.a(a), .b(b), .lt_u(lt_u), .lt_s(lt_s));
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_cmp_su); end
    initial begin
        a = 4'b0001; b = 4'b1111; #10 $display("a=%b b=%b -> lt_u=%b lt_s=%b (expect 1 0)", a, b, lt_u, lt_s);
        a = 4'b1000; b = 4'b0111; #10 $display("a=%b b=%b -> lt_u=%b lt_s=%b (expect 0 1)", a, b, lt_u, lt_s);
        $finish;
    end
endmodule
`,
  hiddenTestbench: `${TS}
module tb_cmp_su_hidden;
    reg [3:0] a, b; wire lt_u, lt_s;
    integer i, j, sa, sb, errors;
    cmp_su dut (.a(a), .b(b), .lt_u(lt_u), .lt_s(lt_s));
    initial begin
        errors = 0;
        for (i = 0; i < 16; i = i + 1)
            for (j = 0; j < 16; j = j + 1) begin
                a = i[3:0]; b = j[3:0]; #2;
                sa = i; if (i > 7) sa = i - 16;
                sb = j; if (j > 7) sb = j - 16;
                if (lt_u !== (i < j) || lt_s !== (sa < sb)) begin
                    $display("FAIL: a=%b b=%b: lt_u=%b lt_s=%b, expected %0d %0d", a, b, lt_u, lt_s, (i < j), (sa < sb));
                    errors = errors + 1;
                end
            end
${END}
    end
endmodule
`,
});

const minMax = beginner({
  slug: "min-max-8", title: "Minimum and Maximum", category: "combinational",
  tags: ["comparison", "mux", "sorting"], moduleId: "mod_combinational", orderIndex: 49, xpReward: 45,
  statement: `## Minimum and Maximum

Two unsigned bytes come in, \`a\` and \`b\`. Output the smaller one on \`lo\` and the larger one on \`hi\`. When they are equal, both outputs equal that value.

This compare-and-swap cell is the building block of hardware sorting networks.

| a | b | lo | hi |
|---|---|----|----|
| 10 | 3 | 3 | 10 |
| 7 | 200 | 7 | 200 |`,
  constraints: ["Combinational.", "Use one comparison and two multiplexers."],
  examples: [{ input: "a=8'd42, b=8'd42", output: "lo=42, hi=42" }],
  hints: [
    { tier: 1, content: "Compute `a < b` once, then use it to pick each output." },
    { tier: 2, content: "`assign lo = (a < b) ? a : b; assign hi = (a < b) ? b : a;`" },
  ],
  starterCode: `${TS}

module minmax8 (
    input  wire [7:0] a,
    input  wire [7:0] b,
    output wire [7:0] lo,
    output wire [7:0] hi
);

    // TODO: lo = the smaller input, hi = the larger
    assign lo = a;
    assign hi = b;

endmodule
`,
  publicTestbench: `${TS}
module tb_minmax8;
    reg [7:0] a, b; wire [7:0] lo, hi;
    minmax8 dut (.a(a), .b(b), .lo(lo), .hi(hi));
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_minmax8); end
    initial begin
        a = 10; b = 3;   #10 $display("a=%0d b=%0d -> lo=%0d hi=%0d (expect 3 10)", a, b, lo, hi);
        a = 7;  b = 200; #10 $display("a=%0d b=%0d -> lo=%0d hi=%0d (expect 7 200)", a, b, lo, hi);
        $finish;
    end
endmodule
`,
  hiddenTestbench: `${TS}
module tb_minmax8_hidden;
    reg [7:0] a, b; wire [7:0] lo, hi;
    integer i, seed, errors;
    reg [7:0] el, eh;
    minmax8 dut (.a(a), .b(b), .lo(lo), .hi(hi));
    initial begin
        errors = 0; seed = 11;
        for (i = 0; i < 600; i = i + 1) begin
            if (i < 4) begin a = (i & 1) ? 8'hFF : 8'h00; b = (i & 2) ? 8'hFF : 8'h00; end
            else if (i < 8) begin a = i * 3; b = i * 3; end
            else begin a = $random(seed); b = $random(seed); end
            #2;
            if (a < b) begin el = a; eh = b; end else begin el = b; eh = a; end
            if (lo !== el || hi !== eh) begin $display("FAIL: a=%0d b=%0d: lo=%0d hi=%0d, expected %0d %0d", a, b, lo, hi, el, eh); errors = errors + 1; end
        end
${END}
    end
endmodule
`,
});

const oneHotChecker = beginner({
  slug: "one-hot-checker", title: "Is It One-Hot?", category: "combinational",
  tags: ["one-hot", "bit-tricks", "reduction"], moduleId: "mod_combinational", orderIndex: 50, xpReward: 55,
  statement: `## Is It One-Hot?

A one-hot vector has **exactly one** bit set. State machines with one-hot state encoding and bus grant signals must always be one-hot; a checker flags corruption.

Input \`v[7:0]\`. Outputs:
- \`is_onehot\` = 1 when exactly one bit of \`v\` is 1;
- \`is_zero\` = 1 when no bit is set.

| v | is_onehot | is_zero |
|---|-----------|---------|
| 8'b0001_0000 | 1 | 0 |
| 8'b0001_0100 | 0 | 0 |
| 8'b0000_0000 | 0 | 1 |`,
  constraints: ["Combinational."],
  examples: [{ input: "v=8'h80", output: "is_onehot=1" }],
  hints: [
    { tier: 1, content: "Subtracting 1 from a power of two clears its only 1 and sets every bit below it." },
    { tier: 2, content: "v is a power of two exactly when v != 0 and (v & (v − 1)) == 0." },
  ],
  starterCode: `${TS}

module onehot_check (
    input  wire [7:0] v,
    output wire       is_onehot,
    output wire       is_zero
);

    assign is_zero = (v == 8'd0);
    // TODO: exactly one bit of v is set
    assign is_onehot = 1'b0;

endmodule
`,
  publicTestbench: `${TS}
module tb_onehot_check;
    reg [7:0] v; wire is_onehot, is_zero;
    onehot_check dut (.v(v), .is_onehot(is_onehot), .is_zero(is_zero));
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_onehot_check); end
    initial begin
        v = 8'b0001_0000; #10 $display("v=%b -> onehot=%b zero=%b (expect 1 0)", v, is_onehot, is_zero);
        v = 8'b0001_0100; #10 $display("v=%b -> onehot=%b zero=%b (expect 0 0)", v, is_onehot, is_zero);
        v = 8'b0000_0000; #10 $display("v=%b -> onehot=%b zero=%b (expect 0 1)", v, is_onehot, is_zero);
        $finish;
    end
endmodule
`,
  hiddenTestbench: `${TS}
module tb_onehot_check_hidden;
    reg [7:0] v; wire is_onehot, is_zero;
    integer i, k, ones, errors;
    onehot_check dut (.v(v), .is_onehot(is_onehot), .is_zero(is_zero));
    initial begin
        errors = 0;
        for (i = 0; i < 256; i = i + 1) begin
            v = i[7:0]; #2;
            ones = 0;
            for (k = 0; k < 8; k = k + 1) ones = ones + v[k];
            if (is_onehot !== (ones == 1) || is_zero !== (ones == 0)) begin
                $display("FAIL: v=%b: is_onehot=%b is_zero=%b, expected %0d %0d", v, is_onehot, is_zero, (ones == 1), (ones == 0));
                errors = errors + 1;
            end
        end
${END}
    end
endmodule
`,
});

// ═════════════════════════════════════════════════════════════════════════════
// Intermediate (sequential: models run in the testbench on the same clock)
// ═════════════════════════════════════════════════════════════════════════════

/** A clocked hidden testbench: `decls`, a `model` (always @(posedge clk) mirror), `drive` (inputs set at each negedge) and `check`. */
function clockedTb(name: string, decls: string, dut: string, model: string, drive: string, check: string, cycles = 400): string {
  return `${TS}
module tb_${name}_hidden;
    reg clk;
${decls}
    integer cyc, seed, errors;
    ${dut}
    initial clk = 0;
    always #5 clk = ~clk;
    // Reference model, clocked with the design
${model}
    initial begin
        errors = 0; seed = 21;
        rst = 1;
        @(negedge clk); @(negedge clk);
        rst = 0;
        for (cyc = 0; cyc < ${cycles}; cyc = cyc + 1) begin
${drive}
            @(negedge clk);
${check}
        end
${END}
    end
endmodule
`;
}

const upDownLoad = intermediate({
  slug: "up-down-counter-load", title: "Up/Down Counter with Load", category: "sequential",
  tags: ["counter", "load", "enable", "terminal-count"], moduleId: "mod_sequential_design", orderIndex: 80, xpReward: 90,
  statement: `## Up/Down Counter with Load

A 4-bit counter with the controls found on a real counter chip (like the 74191). On each rising edge of \`clk\`, in priority order:

1. \`rst\` = 1: \`q\` ← 0 (synchronous reset);
2. \`load\` = 1: \`q\` ← \`d\`;
3. \`en\` = 1: count up (\`up\` = 1) or down (\`up\` = 0), wrapping 15 ↔ 0;
4. otherwise hold.

Output \`tc\` (terminal count, combinational) is 1 when the **next** count would wrap: \`en\` = 1 and either counting up from 15 or down from 0. Chain counters by feeding one counter's \`tc\` to the next one's \`en\`.`,
  constraints: ["q changes only on the rising edge; tc is combinational.", "Use non-blocking assignments in the clocked block."],
  examples: [
    { input: "load d=13, then en=1 up=1 for 4 cycles", output: "q: 13, 14, 15, 0, 1 — tc is 1 while q=15" },
    { input: "q=0, en=1, up=0", output: "tc=1; next q=15" },
  ],
  hints: [
    { tier: 1, content: "Write the clocked block as an if / else if chain in the priority order given." },
    { tier: 2, content: "`assign tc = en & ((up & (q == 4'd15)) | (~up & (q == 4'd0)));`" },
  ],
  starterCode: `${TS}

module updown_load (
    input  wire       clk,
    input  wire       rst,
    input  wire       en,
    input  wire       up,
    input  wire       load,
    input  wire [3:0] d,
    output reg  [3:0] q,
    output wire       tc
);

    always @(posedge clk) begin
        if (rst) q <= 4'd0;
        // TODO: load, then count up or down when enabled
    end

    // TODO: terminal count
    assign tc = 1'b0;

endmodule
`,
  publicTestbench: `${TS}
module tb_updown_load;
    reg clk, rst, en, up, load; reg [3:0] d; wire [3:0] q; wire tc;
    integer i;
    updown_load dut (.clk(clk), .rst(rst), .en(en), .up(up), .load(load), .d(d), .q(q), .tc(tc));
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_updown_load); end
    initial clk = 0;
    always #5 clk = ~clk;
    initial begin
        rst = 1; en = 0; up = 1; load = 0; d = 0;
        @(negedge clk); rst = 0; load = 1; d = 13;
        @(negedge clk); load = 0; en = 1;
        for (i = 0; i < 4; i = i + 1) begin
            $display("q=%0d tc=%b", q, tc);
            @(negedge clk);
        end
        $display("q=%0d (expect 1 after 13, 14, 15, 0)", q);
        up = 0;
        @(negedge clk); @(negedge clk);
        $display("q=%0d tc=%b (expect 15 0 after counting down twice)", q, tc);
        $finish;
    end
endmodule
`,
  hiddenTestbench: clockedTb("updown_load",
    `    reg rst, en, up, load; reg [3:0] d; wire [3:0] q; wire tc;
    reg [3:0] m; reg etc;`,
    "updown_load dut (.clk(clk), .rst(rst), .en(en), .up(up), .load(load), .d(d), .q(q), .tc(tc));",
    `    always @(posedge clk)
        if (rst) m <= 0;
        else if (load) m <= d;
        else if (en) m <= up ? m + 4'd1 : m - 4'd1;`,
    `            en = ($random(seed) % 4) != 0; up = $random(seed); load = ($random(seed) % 16) == 0; d = $random(seed);
            if (cyc == 200) rst = 1;
            if (cyc == 201) rst = 0;`,
    `            etc = en & ((up & (m == 4'd15)) | (~up & (m == 4'd0)));
            if (q !== m || tc !== etc) begin
                $display("FAIL: cycle %0d (en=%b up=%b load=%b d=%0d): q=%0d tc=%b, expected %0d %b", cyc, en, up, load, d, q, tc, m, etc);
                errors = errors + 1;
            end`),
});

const bcdCounter99 = intermediate({
  slug: "bcd-counter-00-99", title: "Two-Digit BCD Counter (00–99)", category: "sequential",
  tags: ["bcd", "counter", "cascade", "carry"], moduleId: "mod_counters_advanced", orderIndex: 81, xpReward: 100,
  statement: `## Two-Digit BCD Counter (00–99)

Count from 00 to 99 in decimal, one step per clock while \`en\` = 1, with each digit in its own 4-bit BCD register so it can drive two 7-segment displays.

- \`ones\` counts 0…9; when it wraps 9 → 0, \`tens\` advances;
- after 99 comes 00;
- \`rst\` (synchronous) clears both digits;
- \`carry\` (combinational) is 1 when \`en\` = 1 and the count is 99: the next step wraps. Use it to enable a third digit.`,
  constraints: ["Both digits change on the same clock edge.", "ones and tens never hold 10…15."],
  examples: [{ input: "count 19, en=1", output: "next: 20" }, { input: "count 99, en=1", output: "carry=1; next: 00" }],
  hints: [
    { tier: 1, content: "tens only changes in the cycle where ones is 9 and en is 1." },
    { tier: 2, content: "`if (en) begin if (ones == 9) begin ones <= 0; tens <= (tens == 9) ? 0 : tens + 1; end else ones <= ones + 1; end`" },
  ],
  starterCode: `${TS}

module bcd_counter99 (
    input  wire       clk,
    input  wire       rst,
    input  wire       en,
    output reg  [3:0] ones,
    output reg  [3:0] tens,
    output wire       carry
);

    always @(posedge clk) begin
        if (rst) begin
            ones <= 4'd0;
            tens <= 4'd0;
        end else if (en) begin
            ones <= ones + 4'd1;          // TODO: wrap at 9 and advance tens
        end
    end

    assign carry = 1'b0;                  // TODO

endmodule
`,
  publicTestbench: `${TS}
module tb_bcd_counter99;
    reg clk, rst, en; wire [3:0] ones, tens; wire carry;
    integer i;
    bcd_counter99 dut (.clk(clk), .rst(rst), .en(en), .ones(ones), .tens(tens), .carry(carry));
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_bcd_counter99); end
    initial clk = 0;
    always #5 clk = ~clk;
    initial begin
        rst = 1; en = 0;
        @(negedge clk); rst = 0; en = 1;
        for (i = 0; i < 21; i = i + 1) @(negedge clk);
        $display("after 21 counts: %0d%0d (expect 21)", tens, ones);
        $finish;
    end
endmodule
`,
  hiddenTestbench: clockedTb("bcd_counter99",
    `    reg rst, en; wire [3:0] ones, tens; wire carry;
    integer m;`,
    "bcd_counter99 dut (.clk(clk), .rst(rst), .en(en), .ones(ones), .tens(tens), .carry(carry));",
    `    always @(posedge clk)
        if (rst) m <= 0;
        else if (en) m <= (m == 99) ? 0 : m + 1;`,
    `            en = ($random(seed) % 8) != 0;
            if (cyc == 300) rst = 1;
            if (cyc == 301) rst = 0;`,
    `            if (tens !== m / 10 || ones !== m % 10 || carry !== (en && m == 99)) begin
                $display("FAIL: cycle %0d (en=%b): %0d%0d carry=%b, expected %0d carry=%0d", cyc, en, tens, ones, carry, m, (en && m == 99));
                errors = errors + 1;
            end`, 500),
});

const lfsr8 = intermediate({
  slug: "lfsr-8bit", title: "8-bit LFSR", category: "sequential",
  tags: ["lfsr", "shift-register", "xor", "pseudo-random"], moduleId: "mod_shift_registers", orderIndex: 82, xpReward: 90,
  statement: `## 8-bit LFSR

A **linear-feedback shift register** shifts left every clock and feeds the XOR of some of its bits back into bit 0. With the right taps it visits all 255 non-zero values before repeating: a cheap pseudo-random sequence.

Build an 8-bit Fibonacci LFSR with taps at bits **7, 5, 4 and 3**:

- \`rst\` (synchronous): \`q\` ← 8'h01 (never all zeros: zero would stay zero forever);
- \`en\` = 1: \`q\` ← \`{q[6:0], q[7] ^ q[5] ^ q[4] ^ q[3]}\`;
- otherwise hold.

| step | q |
|------|---|
| 0 | 01 |
| 1 | 02 |
| 2 | 04 |
| 3 | 08 |
| 4 | 11 |`,
  constraints: ["Shift left: bit 7 falls off, the feedback bit enters at bit 0."],
  examples: [{ input: "q=8'h08, en=1", output: "q=8'h11 (feedback = q[3] = 1)" }],
  hints: [
    { tier: 1, content: "Compute the feedback bit with XOR first, then shift it in." },
    { tier: 2, content: "`q <= {q[6:0], q[7] ^ q[5] ^ q[4] ^ q[3]};`" },
  ],
  starterCode: `${TS}

module lfsr8 (
    input  wire       clk,
    input  wire       rst,
    input  wire       en,
    output reg  [7:0] q
);

    wire feedback = 1'b0;                 // TODO: XOR of taps 7, 5, 4, 3

    always @(posedge clk) begin
        if (rst)     q <= 8'h01;
        else if (en) q <= {q[6:0], feedback};
    end

endmodule
`,
  publicTestbench: `${TS}
module tb_lfsr8;
    reg clk, rst, en; wire [7:0] q;
    integer i;
    lfsr8 dut (.clk(clk), .rst(rst), .en(en), .q(q));
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_lfsr8); end
    initial clk = 0;
    always #5 clk = ~clk;
    initial begin
        rst = 1; en = 0;
        @(negedge clk); rst = 0; en = 1;
        for (i = 0; i < 6; i = i + 1) begin $display("q=%h", q); @(negedge clk); end
        $display("expect 01 02 04 08 11 23");
        $finish;
    end
endmodule
`,
  hiddenTestbench: `${TS}
module tb_lfsr8_hidden;
    reg clk, rst, en; wire [7:0] q;
    reg [7:0] m;
    integer cyc, seed, errors, period;
    lfsr8 dut (.clk(clk), .rst(rst), .en(en), .q(q));
    initial clk = 0;
    always #5 clk = ~clk;
    always @(posedge clk)
        if (rst) m <= 8'h01;
        else if (en) m <= {m[6:0], m[7] ^ m[5] ^ m[4] ^ m[3]};
    initial begin
        errors = 0; seed = 5;
        rst = 1; en = 0;
        @(negedge clk); rst = 0;
        for (cyc = 0; cyc < 300; cyc = cyc + 1) begin
            en = ($random(seed) % 6) != 0;
            @(negedge clk);
            if (q !== m) begin $display("FAIL: cycle %0d (en=%b): q=%h, expected %h", cyc, en, q, m); errors = errors + 1; end
        end
        // Maximal length: back to 01 after exactly 255 steps
        rst = 1; @(negedge clk); rst = 0; en = 1;
        @(negedge clk); period = 1;
        while (q !== 8'h01 && period < 300) begin @(negedge clk); period = period + 1; end
        if (period !== 255) begin $display("FAIL: the sequence repeats after %0d steps, expected 255", period); errors = errors + 1; end
${END}
    end
endmodule
`,
});

const paramClockDivider = intermediate({
  slug: "parameterized-clock-divider", title: "Parameterized Clock Divider", category: "sequential",
  tags: ["parameter", "counter", "clock-enable", "reuse"], moduleId: "mod_counters_advanced", orderIndex: 83, xpReward: 100,
  statement: `## Parameterized Clock Divider

Write one module that works for **any** division ratio, set with a \`parameter N\` when it is instantiated:

\`\`\`verilog
clk_div #(.N(10)) every_tenth (.clk(clk), .rst(rst), .tick(tick10));
\`\`\`

- An internal counter goes 0, 1, …, N−1, 0, … (one step per clock);
- \`tick\` (combinational) is 1 while the counter is N−1: one cycle out of every N;
- \`rst\` (synchronous) sets the counter to 0.

Use \`tick\` as a **clock enable** for slower logic rather than as a clock. The hidden tests instantiate your module with N = 2, 3, 5 and 1000.`,
  constraints: ["Declare `parameter N = 5` (the default).", "The counter must be wide enough for N = 1000."],
  examples: [{ input: "N=3", output: "tick: 0 0 1 0 0 1 …" }],
  hints: [
    { tier: 1, content: "`module clk_div #(parameter N = 5) (...)` and a counter that wraps at N − 1." },
    { tier: 2, content: "`always @(posedge clk) if (rst || cnt == N - 1) cnt <= 0; else cnt <= cnt + 1; assign tick = (cnt == N - 1);`" },
  ],
  starterCode: `${TS}

module clk_div #(parameter N = 5) (
    input  wire clk,
    input  wire rst,
    output wire tick
);

    reg [15:0] cnt;

    always @(posedge clk) begin
        if (rst) cnt <= 0;
        else     cnt <= cnt + 1;      // TODO: wrap after N - 1
    end

    assign tick = 1'b0;               // TODO: one cycle in N

endmodule
`,
  publicTestbench: `${TS}
module tb_clk_div;
    reg clk, rst; wire tick3;
    integer i;
    clk_div #(.N(3)) dut (.clk(clk), .rst(rst), .tick(tick3));
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_clk_div); end
    initial clk = 0;
    always #5 clk = ~clk;
    initial begin
        rst = 1; @(negedge clk); rst = 0;
        for (i = 0; i < 9; i = i + 1) begin $display("cycle %0d tick=%b", i, tick3); @(negedge clk); end
        $display("expect tick on cycles 2, 5, 8");
        $finish;
    end
endmodule
`,
  hiddenTestbench: `${TS}
module tb_clk_div_hidden;
    reg clk, rst; wire t2, t3, t5, t1000;
    integer c2, c3, c5, c1000, cyc, errors;
    clk_div #(.N(2))    d2    (.clk(clk), .rst(rst), .tick(t2));
    clk_div #(.N(3))    d3    (.clk(clk), .rst(rst), .tick(t3));
    clk_div #(.N(5))    d5    (.clk(clk), .rst(rst), .tick(t5));
    clk_div #(.N(1000)) d1000 (.clk(clk), .rst(rst), .tick(t1000));
    initial clk = 0;
    always #5 clk = ~clk;
    always @(posedge clk)
        if (rst) begin c2 <= 0; c3 <= 0; c5 <= 0; c1000 <= 0; end
        else begin
            c2 <= (c2 == 1) ? 0 : c2 + 1;
            c3 <= (c3 == 2) ? 0 : c3 + 1;
            c5 <= (c5 == 4) ? 0 : c5 + 1;
            c1000 <= (c1000 == 999) ? 0 : c1000 + 1;
        end
    initial begin
        errors = 0;
        rst = 1; @(negedge clk); @(negedge clk); rst = 0;
        for (cyc = 0; cyc < 2600; cyc = cyc + 1) begin
            if (cyc == 1500) rst = 1;
            if (cyc == 1501) rst = 0;
            @(negedge clk);
            if (t2 !== (c2 == 1) || t3 !== (c3 == 2) || t5 !== (c5 == 4) || t1000 !== (c1000 == 999)) begin
                if (errors < 10) $display("FAIL: cycle %0d: ticks N=2,3,5,1000 = %b%b%b%b, expected %0d%0d%0d%0d", cyc, t2, t3, t5, t1000, (c2 == 1), (c3 == 2), (c5 == 4), (c1000 == 999));
                errors = errors + 1;
            end
        end
${END}
    end
endmodule
`,
});

const debouncer = intermediate({
  slug: "button-debouncer", title: "Button Debouncer", category: "sequential",
  tags: ["synchronizer", "debounce", "counter", "metastability"], moduleId: "mod_sequential_utils", orderIndex: 84, xpReward: 110,
  statement: `## Button Debouncer

A mechanical button bounces for a few milliseconds when pressed or released, and it is not synchronised to the clock. Clean it up in two stages:

1. **Synchroniser**: two flip-flops in a row, \`s0 <= btn; s1 <= s0;\` (protects against metastability).
2. **Debounce**: \`clean\` only changes after \`s1\` has differed from \`clean\` on **4 consecutive** clock edges. A counter \`cnt\` does this, on each rising edge:
   - if \`s1 == clean\`: \`cnt\` ← 0;
   - else if \`cnt == 3\`: \`clean\` ← \`s1\`, \`cnt\` ← 0;
   - else \`cnt\` ← \`cnt + 1\`.

\`rst\` (synchronous) clears \`s0\`, \`s1\`, \`cnt\` and \`clean\`. A real design would count to about a million (10 ms at 100 MHz); 4 keeps the simulation short.`,
  constraints: ["Follow the algorithm exactly: the tests compare clean on every cycle.", "All registers update on the rising edge."],
  examples: [{ input: "btn goes 0→1 and stays", output: "clean rises 6 cycles later (2 synchroniser + 4 debounce)" }],
  hints: [
    { tier: 1, content: "Keep everything in one always @(posedge clk) block with non-blocking assignments: the comparisons then use the previous s1." },
    { tier: 2, content: "`s0 <= btn; s1 <= s0; if (s1 == clean) cnt <= 0; else if (cnt == 3) begin clean <= s1; cnt <= 0; end else cnt <= cnt + 1;`" },
  ],
  starterCode: `${TS}

module debouncer (
    input  wire clk,
    input  wire rst,
    input  wire btn,
    output reg  clean
);

    reg s0, s1;
    reg [1:0] cnt;

    always @(posedge clk) begin
        if (rst) begin
            s0 <= 1'b0; s1 <= 1'b0; cnt <= 2'd0; clean <= 1'b0;
        end else begin
            s0 <= btn;
            s1 <= s0;
            // TODO: count steady differences; take s1 after 4 in a row
        end
    end

endmodule
`,
  publicTestbench: `${TS}
module tb_debouncer;
    reg clk, rst, btn; wire clean;
    integer i;
    debouncer dut (.clk(clk), .rst(rst), .btn(btn), .clean(clean));
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_debouncer); end
    initial clk = 0;
    always #5 clk = ~clk;
    initial begin
        rst = 1; btn = 0; @(negedge clk); rst = 0;
        btn = 1; @(negedge clk); btn = 0; @(negedge clk); btn = 1;      // bounce
        for (i = 0; i < 8; i = i + 1) begin @(negedge clk); $display("cycle %0d clean=%b", i, clean); end
        $display("clean should rise and stay at 1");
        $finish;
    end
endmodule
`,
  hiddenTestbench: clockedTb("debouncer",
    `    reg rst, btn; wire clean;
    reg ms0, ms1, mclean; reg [1:0] mcnt;
    integer phase, hold;`,
    "debouncer dut (.clk(clk), .rst(rst), .btn(btn), .clean(clean));",
    `    always @(posedge clk)
        if (rst) begin ms0 <= 0; ms1 <= 0; mcnt <= 0; mclean <= 0; end
        else begin
            ms0 <= btn; ms1 <= ms0;
            if (ms1 == mclean) mcnt <= 0;
            else if (mcnt == 3) begin mclean <= ms1; mcnt <= 0; end
            else mcnt <= mcnt + 1;
        end
    initial begin phase = 0; hold = 0; end`,
    `            // bursts of bouncing, then a steady level, each of random length
            if (hold == 0) begin phase = phase + 1; hold = 3 + ($random(seed) % 9 + 9) % 9; end
            hold = hold - 1;
            if ((phase % 2) == 1) btn = $random(seed); else btn = phase[1];`,
    `            if (clean !== mclean) begin $display("FAIL: cycle %0d: clean=%b, expected %b", cyc, clean, mclean); errors = errors + 1; end`, 500),
});

const pulseStretcher = intermediate({
  slug: "pulse-stretcher", title: "Pulse Stretcher", category: "sequential",
  tags: ["counter", "one-shot", "retrigger"], moduleId: "mod_sequential_utils", orderIndex: 85, xpReward: 90,
  statement: `## Pulse Stretcher

A one-cycle event is too short to see on an LED or to cross into a slower clock domain. Stretch it: after \`trig\` is sampled high, \`out\` stays high for the next **4 cycles**. A new \`trig\` while \`out\` is high restarts the 4 cycles (retriggerable one-shot).

Use a 3-bit down-counter \`cnt\`, on each rising edge:
- \`rst\`: \`cnt\` ← 0;
- else if \`trig\`: \`cnt\` ← 4;
- else if \`cnt\` ≠ 0: \`cnt\` ← \`cnt − 1\`.

\`out\` = (\`cnt\` ≠ 0), combinational from the counter.

| cycle | 0 | 1 | 2 | 3 | 4 | 5 |
|-------|---|---|---|---|---|---|
| trig  | 1 | 0 | 0 | 0 | 0 | 0 |
| out (after the edge) | 1 | 1 | 1 | 1 | 0 | 0 |`,
  constraints: ["out depends only on the counter."],
  examples: [{ input: "trig high on two edges 2 cycles apart", output: "out high for 2 + 4 = 6 cycles" }],
  hints: [
    { tier: 1, content: "Load 4 on trig, count down to 0 otherwise." },
    { tier: 2, content: "`if (rst) cnt <= 0; else if (trig) cnt <= 4; else if (cnt != 0) cnt <= cnt - 1; assign out = (cnt != 0);`" },
  ],
  starterCode: `${TS}

module pulse_stretch (
    input  wire clk,
    input  wire rst,
    input  wire trig,
    output wire out
);

    reg [2:0] cnt;

    always @(posedge clk) begin
        if (rst) cnt <= 3'd0;
        // TODO: load on trig, count down otherwise
    end

    assign out = (cnt != 3'd0);

endmodule
`,
  publicTestbench: `${TS}
module tb_pulse_stretch;
    reg clk, rst, trig; wire out;
    integer i;
    pulse_stretch dut (.clk(clk), .rst(rst), .trig(trig), .out(out));
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_pulse_stretch); end
    initial clk = 0;
    always #5 clk = ~clk;
    initial begin
        rst = 1; trig = 0; @(negedge clk); rst = 0;
        trig = 1; @(negedge clk); trig = 0;
        $display("cycle 0 out=%b", out);
        for (i = 1; i < 6; i = i + 1) begin @(negedge clk); $display("cycle %0d out=%b", i, out); end
        $display("expect out=1 for cycles 0-3");
        $finish;
    end
endmodule
`,
  hiddenTestbench: clockedTb("pulse_stretch",
    `    reg rst, trig; wire out;
    reg [2:0] m;`,
    "pulse_stretch dut (.clk(clk), .rst(rst), .trig(trig), .out(out));",
    `    always @(posedge clk)
        if (rst) m <= 0;
        else if (trig) m <= 4;
        else if (m != 0) m <= m - 1;`,
    `            trig = ($random(seed) % 7) == 0;
            if (cyc == 250) rst = 1;
            if (cyc == 251) rst = 0;`,
    `            if (out !== (m != 0)) begin $display("FAIL: cycle %0d (trig=%b): out=%b, expected %0d", cyc, trig, out, (m != 0)); errors = errors + 1; end`),
});

const serialToParallel = intermediate({
  slug: "serial-to-parallel-byte", title: "Serial to Parallel with Valid", category: "sequential",
  tags: ["shift-register", "deserializer", "valid", "uart"], moduleId: "mod_shift_registers", orderIndex: 86, xpReward: 100,
  statement: `## Serial to Parallel with Valid

Bits arrive one at a time, **least significant bit first**, on \`bit_in\`, each marked by \`bit_valid\` = 1 (cycles with \`bit_valid\` = 0 carry nothing). After every 8 valid bits, output the byte:

- \`data\` ← the 8 bits just received (the first bit received is \`data[0]\`), held until the next byte;
- \`valid\` = 1 for exactly one cycle, the cycle after the 8th bit.

On each rising edge: \`valid\` ← 0, then if \`bit_valid\`: shift \`bit_in\` into the top of a shift register (\`sh <= {bit_in, sh[7:1]}\`) and count; on the 8th bit also copy \`{bit_in, sh[7:1]}\` to \`data\`, set \`valid\` ← 1 and restart the count. \`rst\` (synchronous) clears the count, \`data\` and \`valid\`.

This is the core of a UART or SPI receiver.`,
  constraints: ["Use a 3-bit counter of received bits.", "data only changes when a byte completes."],
  examples: [{ input: "bits 1,0,1,0,0,0,0,0 (LSB first)", output: "data=8'h05, valid pulses once" }],
  hints: [
    { tier: 1, content: "Shifting into the top and out of the bottom puts the first bit received at bit 0 after 8 shifts." },
    { tier: 2, content: "`valid <= 0; if (bit_valid) begin sh <= {bit_in, sh[7:1]}; cnt <= cnt + 1; if (cnt == 7) begin data <= {bit_in, sh[7:1]}; valid <= 1; end end` (a 3-bit cnt wraps by itself)" },
  ],
  starterCode: `${TS}

module s2p8 (
    input  wire       clk,
    input  wire       rst,
    input  wire       bit_valid,
    input  wire       bit_in,
    output reg  [7:0] data,
    output reg        valid
);

    reg [7:0] sh;
    reg [2:0] cnt;

    always @(posedge clk) begin
        if (rst) begin
            cnt <= 3'd0; data <= 8'd0; valid <= 1'b0;
        end else begin
            valid <= 1'b0;
            // TODO: shift in valid bits; after the 8th, publish the byte
        end
    end

endmodule
`,
  publicTestbench: `${TS}
module tb_s2p8;
    reg clk, rst, bit_valid, bit_in; wire [7:0] data; wire valid;
    reg [7:0] byte_;
    integer i;
    s2p8 dut (.clk(clk), .rst(rst), .bit_valid(bit_valid), .bit_in(bit_in), .data(data), .valid(valid));
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_s2p8); end
    initial clk = 0;
    always #5 clk = ~clk;
    initial begin
        rst = 1; bit_valid = 0; bit_in = 0; @(negedge clk); rst = 0;
        byte_ = 8'hA5;
        for (i = 0; i < 8; i = i + 1) begin bit_valid = 1; bit_in = byte_[i]; @(negedge clk); end
        bit_valid = 0;
        $display("data=%h valid=%b (expect a5 1)", data, valid);
        @(negedge clk);
        $display("data=%h valid=%b (expect a5 0)", data, valid);
        $finish;
    end
endmodule
`,
  hiddenTestbench: clockedTb("s2p8",
    `    reg rst, bit_valid, bit_in; wire [7:0] data; wire valid;
    reg [7:0] msh, mdata; reg [2:0] mcnt; reg mvalid;`,
    "s2p8 dut (.clk(clk), .rst(rst), .bit_valid(bit_valid), .bit_in(bit_in), .data(data), .valid(valid));",
    `    always @(posedge clk)
        if (rst) begin mcnt <= 0; mdata <= 0; mvalid <= 0; end
        else begin
            mvalid <= 0;
            if (bit_valid) begin
                msh <= {bit_in, msh[7:1]};
                mcnt <= mcnt + 1;
                if (mcnt == 7) begin mdata <= {bit_in, msh[7:1]}; mvalid <= 1; end
            end
        end`,
    `            bit_valid = ($random(seed) % 4) != 0; bit_in = $random(seed);
            if (cyc == 333) rst = 1;
            if (cyc == 334) rst = 0;`,
    `            if (valid !== mvalid || data !== mdata) begin
                $display("FAIL: cycle %0d: data=%h valid=%b, expected %h %b", cyc, data, valid, mdata, mvalid);
                errors = errors + 1;
            end`, 500),
});

const stack4 = intermediate({
  slug: "stack-lifo-4", title: "4-Entry Stack (LIFO)", category: "memory",
  tags: ["stack", "lifo", "memory", "pointer"], moduleId: "mod_memory", orderIndex: 87, xpReward: 110,
  statement: `## 4-Entry Stack (LIFO)

A stack returns the most recently pushed item first. Build a 4-entry stack of bytes:

- \`push\` = 1: store \`din\` on top (ignored when \`full\`);
- \`pop\` = 1: remove the top item (ignored when \`empty\`);
- \`push\` and \`pop\` are never 1 in the same cycle;
- \`top\` (combinational) shows the top item, or 0 when the stack is empty;
- \`empty\` and \`full\` (combinational) reflect the number of items (0 or 4);
- \`rst\` (synchronous) empties the stack.

Keep the items in a small array and a stack pointer \`sp\` (the number of items, 0…4). Hardware stacks hold return addresses in CPUs.`,
  constraints: ["The stack pointer needs 3 bits (0…4).", "Never write past entry 3 or read below entry 0."],
  examples: [{ input: "push 1, push 2, push 3, pop", output: "top=2" }],
  hints: [
    { tier: 1, content: "Push writes mem[sp] and increments sp; pop decrements sp; top is mem[sp − 1]." },
    { tier: 2, content: "`assign top = empty ? 8'd0 : mem[sp - 1];`" },
  ],
  starterCode: `${TS}

module stack4 (
    input  wire       clk,
    input  wire       rst,
    input  wire       push,
    input  wire       pop,
    input  wire [7:0] din,
    output wire [7:0] top,
    output wire       empty,
    output wire       full
);

    reg [7:0] mem [0:3];
    reg [2:0] sp;                 // number of items

    always @(posedge clk) begin
        if (rst) sp <= 3'd0;
        // TODO: push and pop
    end

    assign empty = (sp == 3'd0);
    assign full  = (sp == 3'd4);
    assign top   = 8'd0;          // TODO

endmodule
`,
  publicTestbench: `${TS}
module tb_stack4;
    reg clk, rst, push, pop; reg [7:0] din; wire [7:0] top; wire empty, full;
    stack4 dut (.clk(clk), .rst(rst), .push(push), .pop(pop), .din(din), .top(top), .empty(empty), .full(full));
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_stack4); end
    initial clk = 0;
    always #5 clk = ~clk;
    initial begin
        rst = 1; push = 0; pop = 0; din = 0; @(negedge clk); rst = 0;
        push = 1; din = 8'h11; @(negedge clk);
        din = 8'h22; @(negedge clk);
        din = 8'h33; @(negedge clk);
        push = 0; $display("top=%h (expect 33)", top);
        pop = 1; @(negedge clk); pop = 0;
        $display("top=%h empty=%b full=%b (expect 22 0 0)", top, empty, full);
        $finish;
    end
endmodule
`,
  hiddenTestbench: clockedTb("stack4",
    `    reg rst, push, pop; reg [7:0] din; wire [7:0] top; wire empty, full;
    reg [7:0] mm [0:3]; integer msp, r; reg [7:0] etop;`,
    "stack4 dut (.clk(clk), .rst(rst), .push(push), .pop(pop), .din(din), .top(top), .empty(empty), .full(full));",
    `    always @(posedge clk)
        if (rst) msp <= 0;
        else if (push && msp < 4) begin mm[msp] <= din; msp <= msp + 1; end
        else if (pop && msp > 0) msp <= msp - 1;`,
    `            r = ($random(seed) % 10 + 10) % 10;
            push = (cyc % 60 < 30) ? (r < 6) : (r < 3);
            pop = !push && ((cyc % 60 < 30) ? (r > 7) : (r > 3));
            din = $random(seed);
            if (cyc == 250) rst = 1;
            if (cyc == 251) rst = 0;`,
    `            etop = 8'd0;
            if (msp > 0) etop = mm[msp - 1];
            if (top !== etop || empty !== (msp == 0) || full !== (msp == 4)) begin
                $display("FAIL: cycle %0d: top=%h empty=%b full=%b, expected %h %0d %0d", cyc, top, empty, full, etop, (msp == 0), (msp == 4));
                errors = errors + 1;
            end`),
});

// ═════════════════════════════════════════════════════════════════════════════
// Advanced
// ═════════════════════════════════════════════════════════════════════════════

const uartTx = advanced({
  slug: "uart-transmitter-8n1", title: "UART Transmitter (8N1)", category: "interface",
  tags: ["uart", "fsm", "serial", "protocol"], moduleId: "mod_fsm_advanced", orderIndex: 53, xpReward: 160,
  statement: `## UART Transmitter (8N1)

Send a byte over a serial line: a **start bit** (0), the 8 data bits **LSB first**, then a **stop bit** (1). The line idles at 1.

A baud-rate generator elsewhere supplies \`tick\`: one clock cycle high per bit period. Your transmitter:

| Port | Dir | Description |
|------|-----|-------------|
| \`clk\`, \`rst\` | in | clock; synchronous reset → idle, \`tx\` = 1 |
| \`tick\` | in | one-cycle pulse per bit period |
| \`start\`, \`data[7:0]\` | in | send \`data\` (only accepted while idle) |
| \`tx\` | out | the serial line (a register) |
| \`busy\` | out | 1 from the cycle after \`start\` is accepted until the stop bit has finished |

**Exact timing** (the tests check every cycle). Number the phases \`n\`: 0 idle, 1 start bit, 2…9 data bits 0…7, 10 stop bit. \`busy\` = (\`n\` ≠ 0). On each rising edge:
- idle and \`start\`: latch \`data\`, \`tx\` ← 0, \`n\` ← 1 (the start bit begins at once, not at a tick);
- otherwise, on a \`tick\` while busy, advance: from \`n\` = 1…8 output the next data bit; from \`n\` = 9 output the stop bit (\`tx\` ← 1); from \`n\` = 10 return to idle.`,
  constraints: ["tx must be a register (no glitches on the line).", "Ignore start while busy."],
  examples: [{ input: "start with data=8'h55, tick every 4 cycles", output: "tx: 0 (start), 1,0,1,0,1,0,1,0, 1 (stop), each held until the next tick" }],
  hints: [
    { tier: 1, content: "Keep a copy of the byte in a shift register and output bit 0, shifting right after each data bit." },
    { tier: 2, content: "`if (n == 0) begin if (start) begin sh <= data; tx <= 0; n <= 1; end end else if (tick) begin if (n == 10) begin n <= 0; tx <= 1; end else if (n == 9) begin tx <= 1; n <= 10; end else begin tx <= sh[0]; sh <= sh >> 1; n <= n + 1; end end`" },
  ],
  starterCode: `${TS}

module uart_tx (
    input  wire       clk,
    input  wire       rst,
    input  wire       tick,
    input  wire       start,
    input  wire [7:0] data,
    output reg        tx,
    output wire       busy
);

    reg [3:0] n;          // 0 idle, 1 start bit, 2..9 data bits, 10 stop bit
    reg [7:0] sh;

    assign busy = (n != 4'd0);

    always @(posedge clk) begin
        if (rst) begin
            n <= 4'd0;
            tx <= 1'b1;
        end else begin
            // TODO: accept start while idle; advance one phase per tick
        end
    end

endmodule
`,
  publicTestbench: `${TS}
module tb_uart_tx;
    reg clk, rst, tick, start; reg [7:0] data; wire tx, busy;
    integer i;
    uart_tx dut (.clk(clk), .rst(rst), .tick(tick), .start(start), .data(data), .tx(tx), .busy(busy));
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_uart_tx); end
    initial clk = 0;
    always #5 clk = ~clk;
    initial begin
        rst = 1; start = 0; data = 0; tick = 0; @(negedge clk); rst = 0;
        data = 8'h55; start = 1; @(negedge clk); start = 0;
        for (i = 0; i < 46; i = i + 1) begin
            tick = (i % 4 == 3);              // a tick every 4 cycles
            if (i % 4 == 0) $display("tx=%b busy=%b", tx, busy);
            @(negedge clk);
        end
        $display("expect 0, then 1 0 1 0 1 0 1 0, then 1 and busy=0");
        $finish;
    end
endmodule
`,
  hiddenTestbench: `${TS}
module tb_uart_tx_hidden;
    reg clk, rst, tick, start; reg [7:0] data; wire tx, busy;
    reg [3:0] mn; reg [7:0] msh; reg mtx;
    integer cyc, seed, errors, period;
    uart_tx dut (.clk(clk), .rst(rst), .tick(tick), .start(start), .data(data), .tx(tx), .busy(busy));
    initial clk = 0;
    always #5 clk = ~clk;
    always @(posedge clk)
        if (rst) begin mn <= 0; mtx <= 1; end
        else if (mn == 0) begin if (start) begin msh <= data; mtx <= 0; mn <= 1; end end
        else if (tick) begin
            if (mn == 10) begin mn <= 0; mtx <= 1; end
            else if (mn == 9) begin mtx <= 1; mn <= 10; end
            else begin mtx <= msh[0]; msh <= msh >> 1; mn <= mn + 1; end
        end
    initial begin
        errors = 0; seed = 9; period = 3;
        rst = 1; tick = 0; start = 0; data = 0;
        @(negedge clk); @(negedge clk); rst = 0;
        for (cyc = 0; cyc < 1500; cyc = cyc + 1) begin
            if (cyc == 700) period = 5;
            tick = (cyc % period) == 0;
            start = ($random(seed) % 5) == 0;
            data = $random(seed);
            @(negedge clk);
            if (tx !== mtx || busy !== (mn != 0)) begin
                if (errors < 10) $display("FAIL: cycle %0d: tx=%b busy=%b, expected %b %0d", cyc, tx, busy, mtx, (mn != 0));
                errors = errors + 1;
            end
        end
${END}
    end
endmodule
`,
});

/** A start/done hidden testbench for a multi-cycle unit: each trial pulses start and waits (up to `limit` cycles) for done. */
function startDoneTb(name: string, decls: string, dut: string, setup: string, check: string, trials: number, limit: number): string {
  return `${TS}
module tb_${name}_hidden;
    reg clk, rst, start;
${decls}
    integer trial, waited, seed, errors;
    ${dut}
    initial clk = 0;
    always #5 clk = ~clk;
    initial begin
        errors = 0; seed = 17;
        rst = 1; start = 0;
        @(negedge clk); @(negedge clk); rst = 0;
        for (trial = 0; trial < ${trials}; trial = trial + 1) begin
${setup}
            start = 1; @(negedge clk); start = 0;
            waited = 0;
            while (done !== 1'b1 && waited < ${limit}) begin @(negedge clk); waited = waited + 1; end
            if (done !== 1'b1) begin $display("FAIL: trial %0d: done never came (waited ${limit} cycles)", trial); errors = errors + 1; end
            else begin
${check}
                @(negedge clk);
                if (done !== 1'b0) begin $display("FAIL: trial %0d: done must be a one-cycle pulse", trial); errors = errors + 1; end
            end
        end
${END}
    end
endmodule
`;
}

const shiftAddMult = advanced({
  slug: "shift-add-multiplier", title: "Shift-and-Add Multiplier", category: "arithmetic",
  tags: ["multiplier", "datapath", "fsm", "start-done"], moduleId: "mod_capstone", orderIndex: 54, xpReward: 170,
  statement: `## Shift-and-Add Multiplier

Multiply two unsigned bytes with **one adder** over several cycles, the way you learned long multiplication: for each bit of the multiplier, add the shifted multiplicand if the bit is 1.

| Port | Dir | Description |
|------|-----|-------------|
| \`clk\`, \`rst\` | in | clock; synchronous reset |
| \`start\` | in | one-cycle pulse: latch \`a\` and \`b\` and begin |
| \`a\`, \`b\` | in, 8 bits | the operands |
| \`p\` | out, 16 bits | the product, valid when \`done\` pulses and held until the next start |
| \`done\` | out | one-cycle pulse when \`p\` is ready |

The tests wait up to 20 cycles for \`done\` after \`start\`; 8 or 9 cycles is typical. \`start\` only comes while the unit is idle.`,
  constraints: ["Don't use * on the operands: one adder, one bit per cycle.", "done is high for exactly one cycle."],
  examples: [{ input: "a=200, b=150", output: "p=30000 after ~8 cycles" }],
  hints: [
    { tier: 1, content: "Registers: the multiplicand shifted left each step (16 bits), the multiplier shifted right each step, the running sum, and a step counter." },
    { tier: 2, content: "Each step: `if (mr[0]) acc <= acc + mc; mc <= mc << 1; mr <= mr >> 1;` After 8 steps (the last add included), copy the sum to p and pulse done." },
  ],
  starterCode: `${TS}

module mult8 (
    input  wire        clk,
    input  wire        rst,
    input  wire        start,
    input  wire [7:0]  a,
    input  wire [7:0]  b,
    output reg  [15:0] p,
    output reg         done
);

    // TODO: shift-and-add, one multiplier bit per cycle
    always @(posedge clk) begin
        if (rst) begin
            p <= 16'd0;
            done <= 1'b0;
        end else begin
            done <= 1'b0;
        end
    end

endmodule
`,
  publicTestbench: `${TS}
module tb_mult8;
    reg clk, rst, start; reg [7:0] a, b; wire [15:0] p; wire done;
    integer i;
    mult8 dut (.clk(clk), .rst(rst), .start(start), .a(a), .b(b), .p(p), .done(done));
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_mult8); end
    initial clk = 0;
    always #5 clk = ~clk;
    initial begin
        rst = 1; start = 0; a = 0; b = 0; @(negedge clk); rst = 0;
        a = 200; b = 150; start = 1; @(negedge clk); start = 0;
        for (i = 0; i < 20 && !done; i = i + 1) @(negedge clk);
        $display("p=%0d done=%b after %0d cycles (expect 30000 1)", p, done, i);
        $finish;
    end
endmodule
`,
  hiddenTestbench: startDoneTb("mult8",
    `    reg [7:0] a, b; wire [15:0] p; wire done;`,
    "mult8 dut (.clk(clk), .rst(rst), .start(start), .a(a), .b(b), .p(p), .done(done));",
    `            if (trial == 0) begin a = 0; b = 77; end
            else if (trial == 1) begin a = 255; b = 255; end
            else if (trial == 2) begin a = 1; b = 0; end
            else begin a = $random(seed); b = $random(seed); end`,
    `                if (p !== a * b) begin $display("FAIL: trial %0d: %0d * %0d gave %0d, expected %0d", trial, a, b, p, a * b); errors = errors + 1; end`,
    60, 20),
});

const gcdUnit = advanced({
  slug: "gcd-calculator", title: "GCD Calculator", category: "arithmetic",
  tags: ["euclid", "datapath", "fsm", "start-done"], moduleId: "mod_capstone", orderIndex: 55, xpReward: 170,
  statement: `## GCD Calculator

Compute the **greatest common divisor** of two unsigned bytes in hardware with Euclid's subtraction algorithm:

\`\`\`
while (x != y)
    if (x > y) x = x - y; else y = y - x;
gcd = x
\`\`\`

…with one subtraction per clock cycle. Special cases: gcd(0, b) = b, gcd(a, 0) = a, gcd(0, 0) = 0 (subtracting would loop forever, so test for zero first).

| Port | Dir | Description |
|------|-----|-------------|
| \`clk\`, \`rst\` | in | clock; synchronous reset |
| \`start\` | in | one-cycle pulse: latch \`a\` and \`b\` (only while idle) |
| \`a\`, \`b\` | in, 8 bits | operands |
| \`g\` | out, 8 bits | the result, valid when \`done\` pulses, held until the next start |
| \`done\` | out | one-cycle pulse |

The tests allow up to 300 cycles per calculation.`,
  constraints: ["One subtraction per cycle (no % operator).", "done is a one-cycle pulse."],
  examples: [{ input: "a=48, b=18", output: "g=6 (48,18 → 30,18 → 12,18 → 12,6 → 6,6)" }, { input: "a=0, b=9", output: "g=9" }],
  hints: [
    { tier: 1, content: "Two states: idle and running. While running, compare x and y each cycle; when they are equal (or one is zero) publish the result." },
    { tier: 2, content: "While running: `if (x == 0) finish with y; else if (y == 0 || x == y) finish with x; else if (x > y) x <= x - y; else y <= y - x;`" },
  ],
  starterCode: `${TS}

module gcd8 (
    input  wire       clk,
    input  wire       rst,
    input  wire       start,
    input  wire [7:0] a,
    input  wire [7:0] b,
    output reg  [7:0] g,
    output reg        done
);

    reg [7:0] x, y;
    reg       running;

    always @(posedge clk) begin
        if (rst) begin
            running <= 1'b0; done <= 1'b0; g <= 8'd0;
        end else begin
            done <= 1'b0;
            // TODO: on start latch a, b; then subtract until finished
        end
    end

endmodule
`,
  publicTestbench: `${TS}
module tb_gcd8;
    reg clk, rst, start; reg [7:0] a, b; wire [7:0] g; wire done;
    integer i;
    gcd8 dut (.clk(clk), .rst(rst), .start(start), .a(a), .b(b), .g(g), .done(done));
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_gcd8); end
    initial clk = 0;
    always #5 clk = ~clk;
    initial begin
        rst = 1; start = 0; a = 0; b = 0; @(negedge clk); rst = 0;
        a = 48; b = 18; start = 1; @(negedge clk); start = 0;
        for (i = 0; i < 300 && !done; i = i + 1) @(negedge clk);
        $display("gcd(48, 18) = %0d (expect 6), %0d cycles", g, i);
        $finish;
    end
endmodule
`,
  hiddenTestbench: startDoneTb("gcd8",
    `    reg [7:0] a, b; wire [7:0] g; wire done;
    function integer ref_gcd;
        input integer p;
        input integer q;
        integer t;
        begin
            while (q != 0) begin t = p % q; p = q; q = t; end
            ref_gcd = p;
        end
    endfunction`,
    "gcd8 dut (.clk(clk), .rst(rst), .start(start), .a(a), .b(b), .g(g), .done(done));",
    `            if (trial == 0) begin a = 0; b = 0; end
            else if (trial == 1) begin a = 0; b = 9; end
            else if (trial == 2) begin a = 200; b = 0; end
            else if (trial == 3) begin a = 255; b = 1; end
            else if (trial == 4) begin a = 233; b = 144; end
            else begin a = $random(seed); b = $random(seed); end`,
    `                if (g !== ref_gcd(a, b)) begin $display("FAIL: trial %0d: gcd(%0d, %0d) gave %0d, expected %0d", trial, a, b, g, ref_gcd(a, b)); errors = errors + 1; end`,
    60, 300),
});

const restoringDivider = advanced({
  slug: "restoring-divider", title: "Restoring Divider", category: "arithmetic",
  tags: ["divider", "datapath", "start-done", "riscv"], moduleId: "mod_capstone", orderIndex: 56, xpReward: 180,
  statement: `## Restoring Divider

Divide two unsigned bytes with one subtractor, one quotient bit per cycle (long division in binary):

\`\`\`
rem = 0
for i = 7 downto 0:
    rem = (rem << 1) | dividend[i]
    if rem >= divisor: rem = rem - divisor; quotient[i] = 1
    else quotient[i] = 0
\`\`\`

**Division by zero** follows the RISC-V rule: \`quotient\` = 8'hFF, \`remainder\` = \`dividend\`, and \`div_by_zero\` = 1 (otherwise 0).

| Port | Dir | Description |
|------|-----|-------------|
| \`clk\`, \`rst\` | in | clock; synchronous reset |
| \`start\` | in | one-cycle pulse: latch the operands (only while idle) |
| \`dividend\`, \`divisor\` | in, 8 bits | operands |
| \`quotient\`, \`remainder\` | out, 8 bits | valid when \`done\` pulses, held until the next start |
| \`div_by_zero\` | out | valid with \`done\` |
| \`done\` | out | one-cycle pulse; the tests wait up to 20 cycles |`,
  constraints: ["Don't use / or % on the operands.", "done is a one-cycle pulse."],
  examples: [{ input: "200 / 7", output: "quotient=28, remainder=4" }, { input: "13 / 0", output: "quotient=255, remainder=13, div_by_zero=1" }],
  hints: [
    { tier: 1, content: "Keep the partial remainder one bit wider (9 bits) so the shifted value can't overflow before the comparison." },
    { tier: 2, content: "Each cycle: `r = {rem, dvd[7]}; dvd <= dvd << 1; if (r >= divisor) begin rem <= r - divisor; q <= {q[6:0], 1'b1}; end else begin rem <= r; q <= {q[6:0], 1'b0}; end`" },
  ],
  starterCode: `${TS}

module div8 (
    input  wire       clk,
    input  wire       rst,
    input  wire       start,
    input  wire [7:0] dividend,
    input  wire [7:0] divisor,
    output reg  [7:0] quotient,
    output reg  [7:0] remainder,
    output reg        div_by_zero,
    output reg        done
);

    // TODO: restoring division, one quotient bit per cycle
    always @(posedge clk) begin
        if (rst) begin
            done <= 1'b0; quotient <= 8'd0; remainder <= 8'd0; div_by_zero <= 1'b0;
        end else begin
            done <= 1'b0;
        end
    end

endmodule
`,
  publicTestbench: `${TS}
module tb_div8;
    reg clk, rst, start; reg [7:0] dividend, divisor; wire [7:0] quotient, remainder; wire div_by_zero, done;
    integer i;
    div8 dut (.clk(clk), .rst(rst), .start(start), .dividend(dividend), .divisor(divisor), .quotient(quotient), .remainder(remainder), .div_by_zero(div_by_zero), .done(done));
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_div8); end
    initial clk = 0;
    always #5 clk = ~clk;
    initial begin
        rst = 1; start = 0; dividend = 0; divisor = 0; @(negedge clk); rst = 0;
        dividend = 200; divisor = 7; start = 1; @(negedge clk); start = 0;
        for (i = 0; i < 20 && !done; i = i + 1) @(negedge clk);
        $display("200 / 7 = %0d remainder %0d (expect 28 remainder 4)", quotient, remainder);
        $finish;
    end
endmodule
`,
  hiddenTestbench: startDoneTb("div8",
    `    reg [7:0] dividend, divisor; wire [7:0] quotient, remainder; wire div_by_zero, done;`,
    "div8 dut (.clk(clk), .rst(rst), .start(start), .dividend(dividend), .divisor(divisor), .quotient(quotient), .remainder(remainder), .div_by_zero(div_by_zero), .done(done));",
    `            if (trial == 0) begin dividend = 13; divisor = 0; end
            else if (trial == 1) begin dividend = 255; divisor = 1; end
            else if (trial == 2) begin dividend = 0; divisor = 5; end
            else if (trial == 3) begin dividend = 7; divisor = 200; end
            else if (trial == 4) begin dividend = 255; divisor = 255; end
            else begin dividend = $random(seed); divisor = $random(seed); if (trial % 9 == 0) divisor = 0; end`,
    `                if (divisor == 0) begin
                    if (quotient !== 8'hFF || remainder !== dividend || div_by_zero !== 1'b1) begin
                        $display("FAIL: trial %0d: %0d / 0 gave q=%0d r=%0d dbz=%b, expected 255 %0d 1", trial, dividend, quotient, remainder, div_by_zero, dividend);
                        errors = errors + 1;
                    end
                end else if (quotient !== dividend / divisor || remainder !== dividend % divisor || div_by_zero !== 1'b0) begin
                    $display("FAIL: trial %0d: %0d / %0d gave q=%0d r=%0d dbz=%b, expected %0d %0d 0", trial, dividend, divisor, quotient, remainder, div_by_zero, dividend / divisor, dividend % divisor);
                    errors = errors + 1;
                end`,
    80, 20),
});

const parkingLot = advanced({
  slug: "parking-lot-counter", title: "Parking Lot Occupancy", category: "state_machine",
  tags: ["fsm", "sensors", "direction", "counter"], moduleId: "mod_fsm_basics", orderIndex: 57, xpReward: 160,
  statement: `## Parking Lot Occupancy

Two light barriers sit one after the other at a parking lot's single gate: \`a\` (outside) and \`b\` (inside). Each is 1 while a car blocks it. A car **entering** produces the sequence \`ab\` = 00 → 10 → 11 → 01 → 00; a car **leaving** produces 00 → 01 → 11 → 10 → 00. Cars may stop, back out, or take several cycles per step.

Track the car with an FSM, sampled once per clock:

| State | meaning | ab = 00 | 10 | 11 | 01 |
|-------|---------|---------|----|----|----|
| IDLE | nothing in the gate | IDLE | E1 | IDLE | X1 |
| E1 | entering, at a | IDLE | E1 | E2 | IDLE |
| E2 | entering, at both | IDLE | E1 | E2 | E3 |
| E3 | entering, at b | IDLE **+1** | IDLE | E2 | E3 |
| X1 | leaving, at b | IDLE | IDLE | X2 | X1 |
| X2 | leaving, at both | IDLE | X3 | X2 | X1 |
| X3 | leaving, at a | IDLE **−1** | X3 | X2 | IDLE |

- **+1**: \`count\` increases (saturating at 15) and \`enter\` pulses high for one cycle;
- **−1**: \`count\` decreases (saturating at 0) and \`leave\` pulses high for one cycle;
- \`count\`, \`enter\` and \`leave\` are registers; \`rst\` (synchronous) returns to IDLE with \`count\` = 0.`,
  constraints: ["Follow the table exactly: the tests compare count, enter and leave every cycle.", "enter and leave are high for one cycle per car."],
  examples: [{ input: "ab: 00,10,11,01,00", output: "count 0 → 1, enter pulses" }, { input: "ab: 00,10,00 (backs out)", output: "count unchanged" }],
  hints: [
    { tier: 1, content: "Write the next-state logic straight from the table with a case on the state and the inputs {a, b}." },
    { tier: 2, content: "Clear enter and leave at the top of the clocked block every cycle, and set one of them only on the counting transitions." },
  ],
  starterCode: `${TS}

module parking (
    input  wire       clk,
    input  wire       rst,
    input  wire       a,
    input  wire       b,
    output reg  [3:0] count,
    output reg        enter,
    output reg        leave
);

    localparam IDLE = 3'd0, E1 = 3'd1, E2 = 3'd2, E3 = 3'd3, X1 = 3'd4, X2 = 3'd5, X3 = 3'd6;
    reg [2:0] state;

    always @(posedge clk) begin
        if (rst) begin
            state <= IDLE; count <= 4'd0; enter <= 1'b0; leave <= 1'b0;
        end else begin
            enter <= 1'b0;
            leave <= 1'b0;
            // TODO: the transitions in the table
        end
    end

endmodule
`,
  publicTestbench: `${TS}
module tb_parking;
    reg clk, rst, a, b; wire [3:0] count; wire enter, leave;
    parking dut (.clk(clk), .rst(rst), .a(a), .b(b), .count(count), .enter(enter), .leave(leave));
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_parking); end
    initial clk = 0;
    always #5 clk = ~clk;
    task step; input aa, bb; begin a = aa; b = bb; @(negedge clk); end endtask
    initial begin
        rst = 1; a = 0; b = 0; @(negedge clk); rst = 0;
        step(1,0); step(1,1); step(0,1); step(0,0);
        $display("after one car enters: count=%0d (expect 1)", count);
        step(1,0); step(0,0);
        $display("after a car backs out: count=%0d (expect 1)", count);
        step(0,1); step(1,1); step(1,0); step(0,0);
        $display("after one car leaves: count=%0d (expect 0)", count);
        $finish;
    end
endmodule
`,
  hiddenTestbench: `${TS}
module tb_parking_hidden;
    reg clk, rst, a, b; wire [3:0] count; wire enter, leave;
    localparam IDLE = 0, E1 = 1, E2 = 2, E3 = 3, X1 = 4, X2 = 5, X3 = 6;
    integer ms, mc, cyc, seed, errors, k, r;
    reg me, ml;
    parking dut (.clk(clk), .rst(rst), .a(a), .b(b), .count(count), .enter(enter), .leave(leave));
    initial clk = 0;
    always #5 clk = ~clk;
    always @(posedge clk)
        if (rst) begin ms <= IDLE; mc <= 0; me <= 0; ml <= 0; end
        else begin
            me <= 0; ml <= 0;
            case (ms)
                IDLE: ms <= ({a,b} == 2'b10) ? E1 : ({a,b} == 2'b01) ? X1 : IDLE;
                E1:   ms <= ({a,b} == 2'b10) ? E1 : ({a,b} == 2'b11) ? E2 : IDLE;
                E2:   ms <= ({a,b} == 2'b10) ? E1 : ({a,b} == 2'b11) ? E2 : ({a,b} == 2'b01) ? E3 : IDLE;
                E3:   begin
                          ms <= ({a,b} == 2'b11) ? E2 : ({a,b} == 2'b01) ? E3 : IDLE;
                          if ({a,b} == 2'b00) begin me <= 1; if (mc < 15) mc <= mc + 1; end
                      end
                X1:   ms <= ({a,b} == 2'b01) ? X1 : ({a,b} == 2'b11) ? X2 : IDLE;
                X2:   ms <= ({a,b} == 2'b01) ? X1 : ({a,b} == 2'b11) ? X2 : ({a,b} == 2'b10) ? X3 : IDLE;
                X3:   begin
                          ms <= ({a,b} == 2'b11) ? X2 : ({a,b} == 2'b10) ? X3 : IDLE;
                          if ({a,b} == 2'b00) begin ml <= 1; if (mc > 0) mc <= mc - 1; end
                      end
                default: ms <= IDLE;
            endcase
        end
    initial begin
        errors = 0; seed = 31;
        rst = 1; a = 0; b = 0;
        @(negedge clk); @(negedge clk); rst = 0;
        for (cyc = 0; cyc < 1200; cyc = cyc + 1) begin
            // mostly well-formed cars (in or out, each step held a few cycles), sometimes noise
            r = ($random(seed) % 100 + 100) % 100;
            if (r < 75) begin
                k = (cyc / 3) % 4;
                if ((cyc / 12) % 3 == 2) {a, b} = (k == 0) ? 2'b01 : (k == 1) ? 2'b11 : (k == 2) ? 2'b10 : 2'b00;   // leaving
                else                     {a, b} = (k == 0) ? 2'b10 : (k == 1) ? 2'b11 : (k == 2) ? 2'b01 : 2'b00;   // entering
            end else {a, b} = $random(seed);
            if (cyc == 900) rst = 1;
            if (cyc == 901) rst = 0;
            @(negedge clk);
            if (count !== mc || enter !== me || leave !== ml) begin
                if (errors < 10) $display("FAIL: cycle %0d (ab=%b%b): count=%0d enter=%b leave=%b, expected %0d %b %b", cyc, a, b, count, enter, leave, mc, me, ml);
                errors = errors + 1;
            end
        end
${END}
    end
endmodule
`,
});

const stopwatch = advanced({
  slug: "stopwatch-mm-ss", title: "Stopwatch (MM:SS)", category: "state_machine",
  tags: ["bcd", "counter", "control", "capstone"], moduleId: "mod_capstone", orderIndex: 58, xpReward: 180,
  statement: `## Stopwatch (MM:SS)

Build the logic of a stopwatch showing minutes and seconds as four BCD digits \`m_tens m_ones : s_tens s_ones\` (00:00 to 59:59).

| Port | Dir | Description |
|------|-----|-------------|
| \`clk\`, \`rst\` | in | clock; synchronous reset: time 00:00, stopped |
| \`tick\` | in | one-cycle pulse per second |
| \`start_stop\` | in | one-cycle pulse: toggles \`running\` |
| \`clear\` | in | sets the time to 00:00 (does not change \`running\`) |
| \`s_ones\`, \`s_tens\`, \`m_ones\`, \`m_tens\` | out, 4 bits each | the time, BCD |
| \`running\` | out | 1 while counting |

On each rising edge, for the time: \`rst\` first, then \`clear\`, then (if \`running\` and \`tick\`) advance one second: 09 → 10, 59 seconds → the next minute, 59:59 → 00:00. \`start_stop\` toggles \`running\` on the same edge (the new value takes effect from the next edge).`,
  constraints: ["Every digit stays 0…9 (tens of seconds and of minutes 0…5).", "All outputs are registers."],
  examples: [{ input: "running, at 00:59, tick", output: "01:00" }, { input: "running, at 59:59, tick", output: "00:00" }],
  hints: [
    { tier: 1, content: "Four cascaded counters: each digit advances only when all the digits below it are at their maximum." },
    { tier: 2, content: "`if (s_ones != 9) s_ones <= s_ones + 1; else begin s_ones <= 0; if (s_tens != 5) s_tens <= s_tens + 1; else begin s_tens <= 0; … end end`" },
  ],
  starterCode: `${TS}

module stopwatch (
    input  wire       clk,
    input  wire       rst,
    input  wire       tick,
    input  wire       start_stop,
    input  wire       clear,
    output reg  [3:0] s_ones,
    output reg  [3:0] s_tens,
    output reg  [3:0] m_ones,
    output reg  [3:0] m_tens,
    output reg        running
);

    always @(posedge clk) begin
        if (rst) begin
            s_ones <= 0; s_tens <= 0; m_ones <= 0; m_tens <= 0; running <= 1'b0;
        end else begin
            // TODO: start_stop toggles running; clear; count seconds on tick
        end
    end

endmodule
`,
  publicTestbench: `${TS}
module tb_stopwatch;
    reg clk, rst, tick, start_stop, clear; wire [3:0] s_ones, s_tens, m_ones, m_tens; wire running;
    integer i;
    stopwatch dut (.clk(clk), .rst(rst), .tick(tick), .start_stop(start_stop), .clear(clear), .s_ones(s_ones), .s_tens(s_tens), .m_ones(m_ones), .m_tens(m_tens), .running(running));
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_stopwatch); end
    initial clk = 0;
    always #5 clk = ~clk;
    initial begin
        rst = 1; tick = 0; start_stop = 0; clear = 0; @(negedge clk); rst = 0;
        start_stop = 1; @(negedge clk); start_stop = 0;
        for (i = 0; i < 61; i = i + 1) begin tick = 1; @(negedge clk); tick = 0; @(negedge clk); end
        $display("%0d%0d:%0d%0d (expect 01:01)", m_tens, m_ones, s_tens, s_ones);
        $finish;
    end
endmodule
`,
  hiddenTestbench: `${TS}
module tb_stopwatch_hidden;
    reg clk, rst, tick, start_stop, clear; wire [3:0] s_ones, s_tens, m_ones, m_tens; wire running;
    integer t, mrun, cyc, seed, errors;
    stopwatch dut (.clk(clk), .rst(rst), .tick(tick), .start_stop(start_stop), .clear(clear), .s_ones(s_ones), .s_tens(s_tens), .m_ones(m_ones), .m_tens(m_tens), .running(running));
    initial clk = 0;
    always #5 clk = ~clk;
    always @(posedge clk)
        if (rst) begin t <= 0; mrun <= 0; end
        else begin
            if (start_stop) mrun <= !mrun;
            if (clear) t <= 0;
            else if (mrun && tick) t <= (t == 3599) ? 0 : t + 1;
        end
    initial begin
        errors = 0; seed = 44;
        rst = 1; tick = 0; start_stop = 0; clear = 0;
        @(negedge clk); @(negedge clk); rst = 0;
        for (cyc = 0; cyc < 9000; cyc = cyc + 1) begin
            tick = (cyc % 5) != 4;                                 // runs past 59:59 before the first stop
            start_stop = (cyc == 3) || (cyc == 6000) || (cyc == 6040) || (cyc > 6100 && ($random(seed) % 300) == 0);
            clear = (cyc > 8000) && (($random(seed) % 150) == 0);
            if (cyc == 8800) rst = 1;
            if (cyc == 8801) rst = 0;
            @(negedge clk);
            if (s_ones !== (t % 10) || s_tens !== ((t / 10) % 6) || m_ones !== ((t / 60) % 10) || m_tens !== (t / 600) || running !== mrun) begin
                if (errors < 10) $display("FAIL: cycle %0d: %0d%0d:%0d%0d running=%b, expected %0d%0d:%0d%0d %0d", cyc, m_tens, m_ones, s_tens, s_ones, running, t / 600, (t / 60) % 10, (t / 10) % 6, t % 10, mrun);
                errors = errors + 1;
            end
        end
${END}
    end
endmodule
`,
});

export const PRACTICE_BEGINNER: Problem[] = [majorityOfThree, parityErrorDetector, bitReverse, countLeadingZeros, absoluteValue, bcdIncrement, thermometer, signedCompare, minMax, oneHotChecker];
export const PRACTICE_INTERMEDIATE: Problem[] = [upDownLoad, bcdCounter99, lfsr8, paramClockDivider, debouncer, pulseStretcher, serialToParallel, stack4];
export const PRACTICE_ADVANCED: Problem[] = [uartTx, shiftAddMult, gcdUnit, restoringDivider, parkingLot, stopwatch];
