/**
 * lib/arena/sequential.ts — Sequential set for HDL Arena.
 * Inputs change just after a rising edge and outputs are read just after the next one.
 * Reference solutions: private/arena-sets-refs.json.
 */

import type { ArenaProblem } from "./types";
import { CLOCK, check, hiddenTest, TIMESCALE } from "./tb";

const RESET = "reset = 1; @(posedge clk); #1; reset = 0;";

export const SEQUENTIAL_PROBLEMS: ArenaProblem[] = [
  {
    id: "arena-seq-001", slug: "lfsr-8-maximal", title: "8-bit Maximal LFSR",
    category: "Sequential", difficulty: "Easy", tags: ["LFSR", "shift-register", "sequential", "interview"],
    estimatedMin: 15, xpReward: 150,
    statement: `## 8-bit Maximal LFSR

Build a Fibonacci linear-feedback shift register with the polynomial x⁸ + x⁶ + x⁵ + x⁴ + 1. It walks through all 255 non-zero values before repeating.

| Port | Direction | Width | Description |
|------|-----------|-------|-------------|
| \`clk\` | input | 1 | Rising edge |
| \`reset\` | input | 1 | Synchronous; loads \`8'h01\` |
| \`en\` | input | 1 | 1 steps the register, 0 holds it |
| \`q\` | output | 8 | The register |

On each enabled edge, \`q\` shifts left by one and the new bit 0 is \`q[7] ^ q[5] ^ q[4] ^ q[3]\`.`,
    constraints: ["Synchronous reset, and reset wins over en.", "Use non-blocking assignments."],
    examples: [
      { input: "After reset, en = 1", output: "q = 01, 02, 04, 08, 11, 23, 47, 8E, ..." },
    ],
    starterCode: `${TIMESCALE}
module lfsr_8 (
    input  wire       clk,
    input  wire       reset,
    input  wire       en,
    output reg  [7:0] q
);

    always @(posedge clk) begin
        if (reset)
            q <= 8'h01;
        else if (en) begin
            // TODO: shift left and feed back q[7]^q[5]^q[4]^q[3]
        end
    end

endmodule
`,
    testbenchSkeleton: `${TIMESCALE}module tb_lfsr_8;
    reg clk, reset, en;
    wire [7:0] q;

    lfsr_8 dut (.clk(clk), .reset(reset), .en(en), .q(q));

    initial clk = 0;
    always #5 clk = ~clk;

    initial begin
        $dumpfile("wave.vcd");
        $dumpvars(0, tb_lfsr_8);
        reset = 1; en = 0;
        @(posedge clk); #1; reset = 0; en = 1;
        repeat (8) begin
            @(posedge clk); #1;
            $display("q=%h", q);
        end
        // TODO: check the whole period comes back to 01 after 255 steps
        $finish;
    end
endmodule
`,
    hiddenTestcases: [
      hiddenTest("tc-seq-001-01", "First values after reset", 25,
        `${CLOCK} reg reset, en; wire [7:0] q; reg [7:0] w; integer i;
    lfsr_8 dut (.clk(clk), .reset(reset), .en(en), .q(q));`,
        `en = 1; ${RESET}
        w = 8'h01;
        ${check("q !== w", "after reset got %h want 01", "q")}
        for (i = 0; i < 40; i = i + 1) begin
            @(posedge clk); #1; w = {w[6:0], w[7] ^ w[5] ^ w[4] ^ w[3]};
            ${check("q !== w", "step %0d got %h want %h", "i, q, w")}
        end`),
      hiddenTest("tc-seq-001-02", "Period is exactly 255", 45,
        `${CLOCK} reg reset, en; wire [7:0] q; reg seen [0:255]; integer i;
    lfsr_8 dut (.clk(clk), .reset(reset), .en(en), .q(q));`,
        `for (i = 0; i < 256; i = i + 1) seen[i] = 0;
        en = 1; ${RESET}
        for (i = 0; i < 255; i = i + 1) begin
            ${check("q === 8'h00", "reached the all-zero state at step %0d", "i")}
            ${check("seen[q] !== 1'b0", "value %h repeated at step %0d", "q, i")}
            seen[q] = 1;
            @(posedge clk); #1;
        end
        ${check("q !== 8'h01", "after 255 steps got %h want 01", "q")}`),
      hiddenTest("tc-seq-001-03", "en holds and reset wins", 30,
        `${CLOCK} reg reset, en; wire [7:0] q; reg [7:0] h;
    lfsr_8 dut (.clk(clk), .reset(reset), .en(en), .q(q));`,
        `en = 1; ${RESET}
        repeat (5) @(posedge clk);
        #1; h = q; en = 0;
        repeat (4) @(posedge clk);
        #1; ${check("q !== h", "en=0 changed q from %h to %h", "h, q")}
        en = 1; reset = 1; @(posedge clk); #1;
        ${check("q !== 8'h01", "reset with en=1 got %h want 01", "q")}`),
    ],
  },

  {
    id: "arena-seq-002", slug: "gray-counter-4", title: "4-bit Gray Counter",
    category: "Sequential", difficulty: "Medium", tags: ["counter", "gray-code", "sequential", "interview"],
    estimatedMin: 15, xpReward: 300,
    statement: `## 4-bit Gray Counter

Count in Gray code: only one output bit changes per step. FIFO pointers cross clock domains this way.

| Port | Direction | Width | Description |
|------|-----------|-------|-------------|
| \`clk\` | input | 1 | Rising edge |
| \`reset\` | input | 1 | Synchronous; output 0 |
| \`en\` | input | 1 | 1 counts, 0 holds |
| \`gray\` | output | 4 | The count in Gray code |

The sequence is 0000, 0001, 0011, 0010, 0110, 0111, 0101, 0100, 1100, 1101, 1111, 1110, 1010, 1011, 1001, 1000, then back to 0000.

Keep \`gray\` a flip-flop output, so it can't glitch between edges. Add any other state you need.`,
    constraints: ["Synchronous reset.", "Wraps from 1000 to 0000."],
    examples: [
      { input: "en = 1 after reset", output: "gray = 0, 1, 3, 2, 6, 7, 5, 4, 12, ..." },
    ],
    starterCode: `${TIMESCALE}
module gray_counter (
    input  wire       clk,
    input  wire       reset,
    input  wire       en,
    output reg  [3:0] gray
);

    always @(posedge clk) begin
        if (reset)
            gray <= 4'd0;
        else if (en) begin
            // TODO: move to the next Gray code
        end
    end

endmodule
`,
    testbenchSkeleton: `${TIMESCALE}module tb_gray_counter;
    reg clk, reset, en;
    wire [3:0] gray;

    gray_counter dut (.clk(clk), .reset(reset), .en(en), .gray(gray));

    initial clk = 0;
    always #5 clk = ~clk;

    initial begin
        $dumpfile("wave.vcd");
        $dumpvars(0, tb_gray_counter);
        reset = 1; en = 0;
        @(posedge clk); #1; reset = 0; en = 1;
        repeat (17) begin
            @(posedge clk); #1;
            $display("gray=%b", gray);
        end
        $finish;
    end
endmodule
`,
    hiddenTestcases: [
      hiddenTest("tc-seq-002-01", "Full sequence and wrap", 60,
        `${CLOCK} reg reset, en; wire [3:0] gray; integer i, b; reg [4:0] n;
    gray_counter dut (.clk(clk), .reset(reset), .en(en), .gray(gray));`,
        `en = 1; ${RESET}
        ${check("gray !== 4'd0", "after reset got %b", "gray")}
        n = 0;
        for (i = 0; i < 40; i = i + 1) begin
            @(posedge clk); #1; n = n + 1; b = n[3:0] ^ (n[3:0] >> 1);
            ${check("gray !== b[3:0]", "step %0d got %b want %b", "i, gray, b[3:0]")}
        end`),
      hiddenTest("tc-seq-002-02", "en holds, reset clears mid-count", 40,
        `${CLOCK} reg reset, en; wire [3:0] gray; reg [3:0] h;
    gray_counter dut (.clk(clk), .reset(reset), .en(en), .gray(gray));`,
        `en = 1; ${RESET}
        repeat (6) @(posedge clk);
        #1; h = gray; en = 0;
        repeat (5) @(posedge clk);
        #1; ${check("gray !== h", "en=0 changed %b to %b", "h, gray")}
        en = 1; @(posedge clk); #1;
        ${check("gray === h", "en=1 did not move from %b", "h")}
        reset = 1; @(posedge clk); #1; reset = 0;
        ${check("gray !== 4'd0", "reset got %b", "gray")}
        @(posedge clk); #1;
        ${check("gray !== 4'd1", "first count after reset got %b: reset left some state behind", "gray")}`),
    ],
  },

  {
    id: "arena-seq-003", slug: "serial-adder", title: "Bit-Serial Adder",
    category: "Sequential", difficulty: "Medium", tags: ["adder", "serial", "Mealy", "sequential", "interview"],
    estimatedMin: 15, xpReward: 300,
    statement: `## Bit-Serial Adder

Two numbers arrive one bit per clock, least significant bit first. Output their sum the same way.

| Port | Direction | Width | Description |
|------|-----------|-------|-------------|
| \`clk\` | input | 1 | Rising edge |
| \`reset\` | input | 1 | Synchronous; clears the carry |
| \`a\`, \`b\` | input | 1 | The current bit of each number |
| \`sum\` | output | 1 | Sum bit for the current \`a\` and \`b\` |

\`sum\` is combinational: it answers for the bits on \`a\` and \`b\` now, using the carry left by the previous bit. The carry updates on the rising edge. This is a one-flip-flop Mealy machine.`,
    constraints: ["sum must respond to a and b without waiting for a clock edge.", "reset clears the stored carry."],
    examples: [
      { input: "a = 0011, b = 0001, LSB first", output: "sum = 0100", explanation: "3 + 1 = 4; the carry ripples through two bits." },
    ],
    starterCode: `${TIMESCALE}
module serial_adder (
    input  wire clk,
    input  wire reset,
    input  wire a,
    input  wire b,
    output wire sum
);

    // This forgets the carry, so it only works when no bit position overflows.
    // TODO: add a carry flip-flop
    assign sum = a ^ b;

endmodule
`,
    testbenchSkeleton: `${TIMESCALE}module tb_serial_adder;
    reg clk, reset, a, b;
    wire sum;
    reg [3:0] x, y, s;
    integer i;

    serial_adder dut (.clk(clk), .reset(reset), .a(a), .b(b), .sum(sum));

    initial clk = 0;
    always #5 clk = ~clk;

    initial begin
        $dumpfile("wave.vcd");
        $dumpvars(0, tb_serial_adder);
        x = 4'd3; y = 4'd1; a = 0; b = 0;
        reset = 1; @(posedge clk); #1; reset = 0;
        for (i = 0; i < 4; i = i + 1) begin
            a = x[i]; b = y[i]; #1;
            s[i] = sum;
            @(posedge clk); #1;
        end
        $display("%0d + %0d = %0d", x, y, s);
        $finish;
    end
endmodule
`,
    hiddenTestcases: [
      hiddenTest("tc-seq-003-01", "All pairs of 4-bit numbers", 60,
        `${CLOCK} reg reset, a, b; wire sum; integer x, y, i, t;
    serial_adder dut (.clk(clk), .reset(reset), .a(a), .b(b), .sum(sum));`,
        `a = 0; b = 0;
        for (x = 0; x < 16; x = x + 1) for (y = 0; y < 16; y = y + 1) begin
            ${RESET}
            t = x + y;
            for (i = 0; i < 5; i = i + 1) begin
                a = x[i]; b = y[i]; #1;
                ${check("sum !== t[i]", "%0d + %0d bit %0d got %b", "x, y, i, sum")}
                @(posedge clk); #1;
            end
        end`),
      hiddenTest("tc-seq-003-02", "Long words, and reset clears a pending carry", 40,
        `${CLOCK} reg reset, a, b; wire sum; reg [31:0] x, y, t; integer i, k;
    serial_adder dut (.clk(clk), .reset(reset), .a(a), .b(b), .sum(sum));`,
        `a = 0; b = 0;
        for (k = 0; k < 6; k = k + 1) begin
            x = $random; y = $random; t = x + y;
            ${RESET}
            for (i = 0; i < 32; i = i + 1) begin
                a = x[i]; b = y[i]; #1;
                ${check("sum !== t[i]", "bit %0d of %h + %h got %b", "i, x, y, sum")}
                @(posedge clk); #1;
            end
        end
        a = 1; b = 1; @(posedge clk); #1;
        a = 0; b = 0; ${RESET} #1;
        ${check("sum !== 1'b0", "carry survived reset: sum=%b", "sum")}
        a = 1; b = 0; #1;
        ${check("sum !== 1'b1", "1 + 0 with no carry gave %b", "sum")}`),
    ],
  },

  {
    id: "arena-seq-004", slug: "four-sample-debouncer", title: "Four-Sample Debouncer",
    category: "Sequential", difficulty: "Medium", tags: ["debounce", "counter", "sequential", "interview"],
    estimatedMin: 20, xpReward: 300,
    statement: `## Four-Sample Debouncer

A button bounces when pressed. Clean its signal so the output only changes after the input has settled.

| Port | Direction | Width | Description |
|------|-----------|-------|-------------|
| \`clk\` | input | 1 | Rising edge |
| \`reset\` | input | 1 | Synchronous; \`clean\` and the count go to 0 |
| \`noisy\` | input | 1 | The bouncing input |
| \`clean\` | output | 1 | The filtered output |

\`clean\` takes the value of \`noisy\` on the **4th consecutive** rising edge at which \`noisy\` differs from \`clean\`. Any edge at which they match restarts the count.`,
    constraints: ["Synchronous reset.", "Exactly 4 samples: 3 is too few and 5 is one too many."],
    examples: [
      { input: "noisy goes 1 and stays there", output: "clean is still 0 after edges 1, 2, 3 and becomes 1 after edge 4" },
      { input: "noisy = 1, 1, 1, 0, 1, 1, 1, 0", output: "clean stays 0: it never saw four in a row" },
    ],
    starterCode: `${TIMESCALE}
module button_debouncer (
    input  wire clk,
    input  wire reset,
    input  wire noisy,
    output reg  clean
);

    // This passes every bounce straight through.
    // TODO: only change clean after 4 consecutive differing samples
    always @(posedge clk) begin
        if (reset) clean <= 1'b0;
        else       clean <= noisy;
    end

endmodule
`,
    testbenchSkeleton: `${TIMESCALE}module tb_button_debouncer;
    reg clk, reset, noisy;
    wire clean;

    button_debouncer dut (.clk(clk), .reset(reset), .noisy(noisy), .clean(clean));

    initial clk = 0;
    always #5 clk = ~clk;

    initial begin
        $dumpfile("wave.vcd");
        $dumpvars(0, tb_button_debouncer);
        reset = 1; noisy = 0;
        @(posedge clk); #1; reset = 0; noisy = 1;
        repeat (5) begin
            @(posedge clk); #1;
            $display("noisy=%b clean=%b", noisy, clean);
        end
        $finish;
    end
endmodule
`,
    hiddenTestcases: [
      hiddenTest("tc-seq-004-01", "Changes on exactly the 4th sample, both ways", 40,
        `${CLOCK} reg reset, noisy; wire clean; integer i;
    button_debouncer dut (.clk(clk), .reset(reset), .noisy(noisy), .clean(clean));`,
        `noisy = 0; ${RESET}
        noisy = 1;
        for (i = 1; i <= 3; i = i + 1) begin
            @(posedge clk); #1;
            ${check("clean !== 1'b0", "rise changed early at sample %0d", "i")}
        end
        @(posedge clk); #1; ${check("clean !== 1'b1", "rise not taken at sample 4")}
        repeat (3) @(posedge clk);
        #1; ${check("clean !== 1'b1", "output moved while the input was steady")}
        noisy = 0;
        for (i = 1; i <= 3; i = i + 1) begin
            @(posedge clk); #1;
            ${check("clean !== 1'b1", "fall changed early at sample %0d", "i")}
        end
        @(posedge clk); #1; ${check("clean !== 1'b0", "fall not taken at sample 4")}`),
      hiddenTest("tc-seq-004-02", "Bounces restart the count", 40,
        `${CLOCK} reg reset, noisy; wire clean; integer k;
    button_debouncer dut (.clk(clk), .reset(reset), .noisy(noisy), .clean(clean));`,
        `noisy = 0; ${RESET}
        for (k = 0; k < 6; k = k + 1) begin
            noisy = 1; repeat (3) @(posedge clk);
            #1; ${check("clean !== 1'b0", "three samples were enough on burst %0d", "k")}
            noisy = 0; @(posedge clk); #1;
            ${check("clean !== 1'b0", "output moved on a bounce, burst %0d", "k")}
        end
        noisy = 1; repeat (3) @(posedge clk);
        #1; ${check("clean !== 1'b0", "the count was not restarted by the last bounce")}
        @(posedge clk); #1; ${check("clean !== 1'b1", "a settled input was not taken")}
        noisy = 0; repeat (3) @(posedge clk);
        #1; ${check("clean !== 1'b1", "a change straight after a change needed fewer than four samples")}
        @(posedge clk); #1; ${check("clean !== 1'b0", "a change straight after a change was not taken at sample 4")}`),
      hiddenTest("tc-seq-004-03", "Reset clears a part-finished count", 20,
        `${CLOCK} reg reset, noisy; wire clean;
    button_debouncer dut (.clk(clk), .reset(reset), .noisy(noisy), .clean(clean));`,
        `noisy = 0; ${RESET}
        noisy = 1; repeat (3) @(posedge clk);
        #1; ${RESET}
        ${check("clean !== 1'b0", "reset left clean at %b", "clean")}
        repeat (3) @(posedge clk);
        #1; ${check("clean !== 1'b0", "reset did not clear the count")}
        @(posedge clk); #1; ${check("clean !== 1'b1", "four samples after reset were not taken")}`),
    ],
  },

  {
    id: "arena-seq-005", slug: "divide-by-3-50-duty", title: "Divide by 3 with 50% Duty",
    category: "Sequential", difficulty: "Hard", tags: ["clock-divider", "duty-cycle", "negedge", "sequential", "interview"],
    estimatedMin: 25, xpReward: 450,
    statement: `## Divide by 3 with 50% Duty

Divide a clock by three, with the output high for exactly half of each period. A rising-edge-only counter can't do it: 1.5 input cycles needs the falling edge too.

| Port | Direction | Width | Description |
|------|-----------|-------|-------------|
| \`clk\` | input | 1 | Input clock with a 50% duty cycle |
| \`reset\` | input | 1 | Synchronous; held for at least two full clock periods; \`clk_out\` goes to 0 |
| \`clk_out\` | output | 1 | Period of 3 input cycles, high for 1.5 of them |

The tests measure time between \`clk_out\` edges, so which input edge it starts on doesn't matter. It must start running within 6 input cycles after reset is released.

The usual answer: a counter makes a pulse one cycle wide, a falling-edge flip-flop delays it by half a cycle, and an OR of the two is high for 1.5 cycles.`,
    constraints: ["Output period = 3 input periods; high time = 1.5 input periods.", "reset must stop and restart the output.", "No delays (#) in the design."],
    examples: [
      { input: "clk period 10 ns", output: "clk_out period 30 ns, high for 15 ns" },
    ],
    starterCode: `${TIMESCALE}
module divide_by_3 (
    input  wire clk,
    input  wire reset,
    output wire clk_out
);

    reg [1:0] count;
    reg       rise_q;     // a one-cycle pulse from the rising edge
    reg       fall_q;     // the same pulse, half a cycle later

    // TODO: drive count, rise_q and fall_q (fall_q on negedge clk)

    assign clk_out = 1'b0;   // TODO: combine rise_q and fall_q

endmodule
`,
    testbenchSkeleton: `${TIMESCALE}module tb_divide_by_3;
    reg clk, reset;
    wire clk_out;

    divide_by_3 dut (.clk(clk), .reset(reset), .clk_out(clk_out));

    initial clk = 0;
    always #5 clk = ~clk;

    always @(clk_out) $display("%0t clk_out=%b", $time, clk_out);

    initial begin
        $dumpfile("wave.vcd");
        $dumpvars(0, tb_divide_by_3);
        reset = 1;
        repeat (3) @(posedge clk);
        #1; reset = 0;
        repeat (20) @(posedge clk);
        $finish;
    end
endmodule
`,
    hiddenTestcases: [
      hiddenTest("tc-seq-005-01", "Period 30 ns and high time 15 ns", 70,
        `${CLOCK} reg reset; wire clk_out; realtime last_rise; integer rises, falls;
    divide_by_3 dut (.clk(clk), .reset(reset), .clk_out(clk_out));
    always @(posedge clk_out) begin
        if (rises > 0) ${check("$realtime - last_rise != 30.0", "period %0f ns, want 30", "$realtime - last_rise")}
        last_rise = $realtime; rises = rises + 1;
    end
    always @(negedge clk_out) if (rises > 0) begin
        ${check("$realtime - last_rise != 15.0", "high for %0f ns, want 15", "$realtime - last_rise")}
        falls = falls + 1;
    end`,
        `rises = 0; falls = 0;
        reset = 1; repeat (3) @(posedge clk);
        #1; reset = 0;
        repeat (60) @(posedge clk);
        ${check("rises < 18", "only %0d rising edges in 60 input cycles", "rises")}
        ${check("falls < 18", "only %0d falling edges in 60 input cycles", "falls")}`),
      hiddenTest("tc-seq-005-02", "reset stops the output and it restarts cleanly", 30,
        `${CLOCK} reg reset; wire clk_out; integer rises, i; realtime last_rise;
    divide_by_3 dut (.clk(clk), .reset(reset), .clk_out(clk_out));
    always @(posedge clk_out) begin
        if (rises > 0) ${check("$realtime - last_rise != 30.0", "period %0f ns", "$realtime - last_rise")}
        last_rise = $realtime; rises = rises + 1;
    end`,
        `rises = 0;
        reset = 1; repeat (3) @(posedge clk);
        #1; reset = 0;
        repeat (16) @(posedge clk);
        @(negedge clk); reset = 1;
        repeat (3) @(posedge clk);
        #1; ${check("clk_out !== 1'b0", "clk_out=%b during reset", "clk_out")}
        rises = 0;
        repeat (4) begin @(posedge clk); @(negedge clk); ${check("clk_out !== 1'b0", "clk_out=%b during reset", "clk_out")} end
        reset = 0;
        for (i = 0; i < 40; i = i + 1) @(posedge clk);
        ${check("rises < 11", "only %0d rising edges after restart", "rises")}`),
    ],
  },
];
