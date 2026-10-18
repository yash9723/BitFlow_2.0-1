/**
 * lib/arena/fsm.ts — FSM category problems for HDL Arena
 *
 * These are independent of the Learning Path.
 * No moduleId, no orderIndex — Arena problems are unordered by design.
 *
 * Verilog-2001 strict rules (same as Learning Path):
 *   - No inline integer initialization
 *   - No ternary in $display — use if/else
 *   - No SystemVerilog constructs
 *   - $finish must be called
 */

import type { ArenaProblem } from "./types";

export const FSM_PROBLEMS: ArenaProblem[] = [

  // ─── Problem 1: Largest Digit Seen So Far ──────────────────────────────────
  {
    id:           "arena-fsm-001",
    slug:         "largest-digit-fsm",
    title:        "Largest Digit Seen So Far",
    category:     "FSM",
    difficulty:   "Medium",
    tags:         ["FSM", "sequential", "comparator", "state-machine"],
    estimatedMin: 25,
    xpReward:     300,

    statement: `## Largest Digit Seen So Far

Design a synchronous FSM over the input alphabet \`{0, 1, 2, 3}\` that at each clock cycle outputs the **largest digit seen so far** (including the current input).

The FSM starts with no history — on the first clock edge after reset, \`dout\` should equal \`din\` (since there is nothing previous to compare against).

On reset, the machine returns to a state representing "largest seen = 0 (nothing yet)".

**Interface**

| Port     | Direction | Width | Description                              |
|----------|-----------|-------|------------------------------------------|
| \`clk\`  | input     | 1     | Clock — rising edge triggered            |
| \`reset\`| input     | 1     | Synchronous reset — clears max seen      |
| \`din\`  | input     | 2     | Current digit (0–3)                      |
| \`dout\` | output    | 2     | Largest digit seen so far (inclusive)    |

**Example**

| Cycle | din | dout | Notes                      |
|-------|-----|------|----------------------------|
| 0     | 0   | 0    | First input                |
| 1     | 0   | 0    | Still 0                    |
| 2     | 1   | 1    | New max                    |
| 3     | 0   | 1    | 1 is still the max         |
| 4     | 3   | 3    | New max                    |
| 5     | 2   | 3    | 3 is still the max         |

**FSM Hint**

You have 4 states: MAX0, MAX1, MAX2, MAX3 — representing "the largest digit seen so far is 0, 1, 2, or 3."

Transitions are simple: move to the state matching \`max(current_state, din)\`.

Output is purely a function of state (Moore machine).

**Constraints**
- Synchronous reset: on \`posedge clk\` when \`reset=1\`, return to the initial state (MAX0 or an "empty" state — your choice, but \`dout\` should equal \`din\` on the very first valid cycle after reset).
- This is an interview-level FSM problem from the Maven Silicon trainer.`,

    constraints: [
      "din is always a valid 2-bit value (0–3).",
      "dout must reflect the maximum including the current din.",
      "reset is synchronous.",
      "Use non-blocking assignments (<=).",
    ],

    examples: [
      {
        input:       "din sequence: 0,0,1,0,3,2",
        output:      "dout sequence: 0,0,1,1,3,3",
        explanation: "Max is updated only when a larger digit arrives.",
      },
      {
        input:       "din sequence: 3,2,1,0",
        output:      "dout sequence: 3,3,3,3",
        explanation: "First input is the max — held forever.",
      },
      {
        input:       "din sequence: 0,1,2,3",
        output:      "dout sequence: 0,1,2,3",
        explanation: "Strictly increasing — max updates every cycle.",
      },
    ],

    starterCode: `\`timescale 1ns / 1ps

module largest_digit_fsm (
    input  wire       clk,
    input  wire       reset,
    input  wire [1:0] din,
    output reg  [1:0] dout
);

    // FSM states: MAX0=0, MAX1=1, MAX2=2, MAX3=3
    // State represents the largest digit seen so far.
    // On each posedge clk: transition to max(state, din).
    // Output (Moore): dout = state.

    reg [1:0] state;

    always @(posedge clk) begin
        if (reset)
            state <= 2'd0;
        else begin
            // TODO: update state to max(state, din)
            // Hint: if (din > state) state <= din;
        end
    end

    // Output is purely a function of state (Moore)
    always @(*) begin
        dout = state;
    end

endmodule
`,

    testbenchSkeleton: `\`timescale 1ns / 1ps
module tb_largest_digit_fsm;
    reg clk, rst, digit_en;
    reg [3:0] digit_in;
    wire [3:0] largest_out;
    
    largest_digit_fsm dut (
        .clk(clk),
        .rst(rst),
        .digit_en(digit_en),
        .digit_in(digit_in),
        .largest_out(largest_out)
    );
    
    initial clk = 0;
    always #5 clk = ~clk;
    
    initial begin
        $dumpfile("wave.vcd");
        $dumpvars(0, tb_largest_digit_fsm);
        
        // TODO: Write your test cases here
        // Test 1: Input sequence [5, 2, 8, 3] → largest should be 8
        // Test 2: Input sequence [1, 1, 1, 1] → largest should be 1
        // Test 3: Reset mid-sequence, then new values
        
        $finish;
    end
endmodule
`,

    hiddenTestcases: [

      // ── TC1: Basic increasing sequence ─────────────────────────────────────
      {
        id:          "tc-fsm-001-01",
        description: "Strictly increasing 0→1→2→3",
        weight:      20,
        expected:    "ALL TESTS PASSED",
        testbench: `\`timescale 1ns / 1ps
module tb_fsm_001_tc1;
    reg clk, reset; reg [1:0] din; wire [1:0] dout;
    integer errors;
    largest_digit_fsm dut (.clk(clk),.reset(reset),.din(din),.dout(dout));
    initial clk = 0;
    always #5 clk = ~clk;
    initial begin
        errors = 0;
        reset=1; din=0; @(posedge clk); #1; reset=0;
        din=2'd0; @(posedge clk); #1; if(dout!==2'd0) begin $display("FAIL c0: exp 0 got %0d",dout); errors=errors+1; end
        din=2'd1; @(posedge clk); #1; if(dout!==2'd1) begin $display("FAIL c1: exp 1 got %0d",dout); errors=errors+1; end
        din=2'd2; @(posedge clk); #1; if(dout!==2'd2) begin $display("FAIL c2: exp 2 got %0d",dout); errors=errors+1; end
        din=2'd3; @(posedge clk); #1; if(dout!==2'd3) begin $display("FAIL c3: exp 3 got %0d",dout); errors=errors+1; end
        if (errors==0) $display("ALL TESTS PASSED");
        else $display("TESTS FAILED: %0d error(s)", errors);
        $finish;
    end
endmodule`,
      },

      // ── TC2: Strictly decreasing 3→2→1→0 ──────────────────────────────────
      {
        id:          "tc-fsm-001-02",
        description: "Strictly decreasing 3→2→1→0 — max stays at 3",
        weight:      20,
        expected:    "ALL TESTS PASSED",
        testbench: `\`timescale 1ns / 1ps
module tb_fsm_001_tc2;
    reg clk, reset; reg [1:0] din; wire [1:0] dout;
    integer errors;
    largest_digit_fsm dut (.clk(clk),.reset(reset),.din(din),.dout(dout));
    initial clk = 0;
    always #5 clk = ~clk;
    initial begin
        errors = 0;
        reset=1; din=0; @(posedge clk); #1; reset=0;
        din=2'd3; @(posedge clk); #1; if(dout!==2'd3) begin $display("FAIL c0: exp 3 got %0d",dout); errors=errors+1; end
        din=2'd2; @(posedge clk); #1; if(dout!==2'd3) begin $display("FAIL c1: exp 3 got %0d",dout); errors=errors+1; end
        din=2'd1; @(posedge clk); #1; if(dout!==2'd3) begin $display("FAIL c2: exp 3 got %0d",dout); errors=errors+1; end
        din=2'd0; @(posedge clk); #1; if(dout!==2'd3) begin $display("FAIL c3: exp 3 got %0d",dout); errors=errors+1; end
        if (errors==0) $display("ALL TESTS PASSED");
        else $display("TESTS FAILED: %0d error(s)", errors);
        $finish;
    end
endmodule`,
      },

      // ── TC3: Mixed sequence from problem statement ──────────────────────────
      {
        id:          "tc-fsm-001-03",
        description: "Mixed sequence: 0,0,1,0,3,2 → 0,0,1,1,3,3",
        weight:      20,
        expected:    "ALL TESTS PASSED",
        testbench: `\`timescale 1ns / 1ps
module tb_fsm_001_tc3;
    reg clk, reset; reg [1:0] din; wire [1:0] dout;
    integer errors;
    largest_digit_fsm dut (.clk(clk),.reset(reset),.din(din),.dout(dout));
    initial clk = 0;
    always #5 clk = ~clk;
    initial begin
        errors = 0;
        reset=1; din=0; @(posedge clk); #1; reset=0;
        din=2'd0; @(posedge clk); #1; if(dout!==2'd0) begin $display("FAIL c0 exp 0 got %0d",dout); errors=errors+1; end
        din=2'd0; @(posedge clk); #1; if(dout!==2'd0) begin $display("FAIL c1 exp 0 got %0d",dout); errors=errors+1; end
        din=2'd1; @(posedge clk); #1; if(dout!==2'd1) begin $display("FAIL c2 exp 1 got %0d",dout); errors=errors+1; end
        din=2'd0; @(posedge clk); #1; if(dout!==2'd1) begin $display("FAIL c3 exp 1 got %0d",dout); errors=errors+1; end
        din=2'd3; @(posedge clk); #1; if(dout!==2'd3) begin $display("FAIL c4 exp 3 got %0d",dout); errors=errors+1; end
        din=2'd2; @(posedge clk); #1; if(dout!==2'd3) begin $display("FAIL c5 exp 3 got %0d",dout); errors=errors+1; end
        if (errors==0) $display("ALL TESTS PASSED");
        else $display("TESTS FAILED: %0d error(s)", errors);
        $finish;
    end
endmodule`,
      },

      // ── TC4: Reset mid-sequence ─────────────────────────────────────────────
      {
        id:          "tc-fsm-001-04",
        description: "Reset mid-sequence — max clears and restarts",
        weight:      20,
        expected:    "ALL TESTS PASSED",
        testbench: `\`timescale 1ns / 1ps
module tb_fsm_001_tc4;
    reg clk, reset; reg [1:0] din; wire [1:0] dout;
    integer errors;
    largest_digit_fsm dut (.clk(clk),.reset(reset),.din(din),.dout(dout));
    initial clk = 0;
    always #5 clk = ~clk;
    initial begin
        errors = 0;
        // First run: build up to max=3
        reset=1; din=0; @(posedge clk); #1; reset=0;
        din=2'd3; @(posedge clk); #1;
        din=2'd2; @(posedge clk); #1;
        if(dout!==2'd3) begin $display("FAIL pre-reset: exp 3 got %0d",dout); errors=errors+1; end
        // Reset: max must clear
        reset=1; din=2'd2; @(posedge clk); #1; reset=0;
        din=2'd1; @(posedge clk); #1;
        if(dout!==2'd1) begin $display("FAIL post-reset c0: exp 1 got %0d",dout); errors=errors+1; end
        din=2'd2; @(posedge clk); #1;
        if(dout!==2'd2) begin $display("FAIL post-reset c1: exp 2 got %0d",dout); errors=errors+1; end
        if (errors==0) $display("ALL TESTS PASSED");
        else $display("TESTS FAILED: %0d error(s)", errors);
        $finish;
    end
endmodule`,
      },

      // ── TC5: Long constant stream + spike ──────────────────────────────────
      {
        id:          "tc-fsm-001-05",
        description: "Constant 0 stream then spike to 2, then constant 1",
        weight:      20,
        expected:    "ALL TESTS PASSED",
        testbench: `\`timescale 1ns / 1ps
module tb_fsm_001_tc5;
    reg clk, reset; reg [1:0] din; wire [1:0] dout;
    integer errors;
    integer i;
    largest_digit_fsm dut (.clk(clk),.reset(reset),.din(din),.dout(dout));
    initial clk = 0;
    always #5 clk = ~clk;
    initial begin
        errors = 0;
        reset=1; din=0; @(posedge clk); #1; reset=0;
        // 10 cycles of 0
        din=2'd0;
        for (i=0; i<10; i=i+1) begin
            @(posedge clk); #1;
            if(dout!==2'd0) begin $display("FAIL zeros i=%0d: exp 0 got %0d",i,dout); errors=errors+1; end
        end
        // Spike to 2
        din=2'd2; @(posedge clk); #1;
        if(dout!==2'd2) begin $display("FAIL spike: exp 2 got %0d",dout); errors=errors+1; end
        // 5 cycles of 1 — max must stay 2
        din=2'd1;
        for (i=0; i<5; i=i+1) begin
            @(posedge clk); #1;
            if(dout!==2'd2) begin $display("FAIL post-spike i=%0d: exp 2 got %0d",i,dout); errors=errors+1; end
        end
        if (errors==0) $display("ALL TESTS PASSED");
        else $display("TESTS FAILED: %0d error(s)", errors);
        $finish;
    end
endmodule`,
      },

    ],
  },

  {
  id: "arena-fsm-002",
  slug: "two-zeros-two-ones-detector",
  title: "Two Zeros and Two Ones Detector",
  category: "FSM",
  difficulty: "Medium",
  tags: ["fsm", "state-machine", "counters", "assertion"],
  
  statement: `# Two Zeros and Two Ones Detector (FSM)

Design a synchronous FSM with one input \`din\` and one output \`dout\`.

The output remains **0** initially. Once the input stream has contained **at least two 0's and at least two 1's**, the output becomes **1** and stays **1 forever**.

The occurrences do **not** need to be consecutive.

## Examples

* Input sequence: \`0,1,0,1\`
  * Zero count = 2
  * One count = 2
  * Output sequence = \`0,0,0,1\`

* Input sequence: \`1,1,0,0\`
  * Output sequence = \`0,0,0,1\`

* Input sequence: \`0,0,0,1,1\`
  * Output sequence = \`0,0,0,0,1\`

* Input sequence: \`1,0,1,0,1,0\`
  * Output sequence = \`0,0,0,1,1,1\`

Once \`dout\` becomes 1, it must remain 1 regardless of future inputs.

## Interface

| Port  | Direction | Width | Description                                      |
|-------|-----------|-------|--------------------------------------------------|
| clk   | input     | 1     | Rising-edge clock                                |
| reset | input     | 1     | Synchronous active-high reset                    |
| din   | input     | 1     | Serial input bit                                 |
| dout  | output    | 1     | Assertion after two 0's and two 1's seen        |

## Constraints

* Use \`always @(posedge clk)\`
* Reset is synchronous and active-high
* Use non-blocking assignments (\`<=\`)
* Input \`din\` is always either 0 or 1
* Once \`dout=1\`, it must remain 1 permanently
* Occurrences are cumulative and non-consecutive

## FSM Hint 🔒

Track:
* Number of zeros seen: {0, 1, 2+}
* Number of ones seen: {0, 1, 2+}

Output asserts when both counters have saturated.
`,
  
  examples: [
    {
      input: "0,1,0,1",
      output: "0,0,0,1",
      explanation: "After 4 cycles: 2 zeros + 2 ones → dout=1"
    },
    {
      input: "1,1,0,0",
      output: "0,0,0,1",
      explanation: "After 4 cycles: 2 ones + 2 zeros → dout=1"
    },
    {
      input: "0,0,0,1,1",
      output: "0,0,0,0,1",
      explanation: "After 5 cycles: 3 zeros + 2 ones → dout=1"
    }
  ],
  
  constraints: [
    "Use always @(posedge clk) for the FSM",
    "Synchronous active-high reset",
    "Non-blocking assignments (<=)",
    "Input din is {0, 1} only",
    "dout becomes 1 and never returns to 0",
    "Counts are cumulative; order is irrelevant"
  ],
  
  starterCode: `\`timescale 1ns / 1ps

module two_zeros_ones_detector(
    input clk,
    input reset,
    input din,
    output reg dout
);
    // TODO: Declare state registers for counting zeros and ones
    // Hint: Use 2-bit counters that saturate at 2
    
    always @(posedge clk) begin
        if (reset) begin
            // TODO: Initialize counters and output
        end else begin
            // TODO: Increment zero or one counter based on din
            // TODO: Assert dout when both counts reach 2
            // TODO: Keep dout=1 once asserted
        end
    end
endmodule
`,
  
  testbenchSkeleton: `\`timescale 1ns / 1ps

module tb_two_zeros_ones_detector;
    reg clk, reset, din;
    wire dout;
    
    two_zeros_ones_detector dut (
        .clk(clk),
        .reset(reset),
        .din(din),
        .dout(dout)
    );
    
    initial clk = 0;
    always #5 clk = ~clk;
    
    task apply_sequence(input [47:0] seq, input [2:0] len);
        integer i;
        for (i = 0; i < len; i = i + 1) begin
            din = seq[i];
            @(posedge clk);
        end
    endtask
    
    initial begin
        $dumpfile("wave.vcd");
        $dumpvars(0, tb_two_zeros_ones_detector);
        
        // Test 1: Balanced sequence (0,1,0,1)
        reset = 1; @(posedge clk);
        reset = 0; @(posedge clk);
        apply_sequence(48'b010101, 4);  // 0,1,0,1
        
        // After sequence: dout should be 1
        if (dout !== 1) $display("FAIL: Test 1 - dout should be 1 after 0,1,0,1");
        
        // Test 2: Ones first (1,1,0,0)
        reset = 1; @(posedge clk);
        reset = 0; @(posedge clk);
        apply_sequence(48'b001111, 4);  // 1,1,0,0
        
        if (dout !== 1) $display("FAIL: Test 2 - dout should be 1 after 1,1,0,0");
        
        // Test 3: Zeros first (0,0,0,1,1)
        reset = 1; @(posedge clk);
        reset = 0; @(posedge clk);
        apply_sequence(48'b011000, 5);  // 0,0,0,1,1
        
        if (dout !== 1) $display("FAIL: Test 3 - dout should be 1 after 0,0,0,1,1");
        
        // Test 4: Reset mid-sequence
        reset = 1; @(posedge clk);
        reset = 0; @(posedge clk);
        din = 0; @(posedge clk);  // zero count = 1
        din = 0; @(posedge clk);  // zero count = 2
        
        // NOW RESET
        reset = 1; @(posedge clk);
        if (dout !== 0) $display("FAIL: Test 4 - dout should be 0 after reset");
        
        reset = 0; @(posedge clk);
        din = 1; @(posedge clk);  // one count = 1
        din = 1; @(posedge clk);  // one count = 2
        
        // Should still be 0 (no zeros after reset)
        if (dout !== 0) $display("FAIL: Test 4b - dout should stay 0 until both seen");
        
        din = 0; @(posedge clk);  // zero count = 1
        din = 0; @(posedge clk);  // zero count = 2
        
        if (dout !== 1) $display("FAIL: Test 4c - dout should be 1 after reset recovery");
        
        // Test 5: Sticky output (must stay 1)
        din = 0; @(posedge clk);
        din = 0; @(posedge clk);
        din = 0; @(posedge clk);
        
        if (dout !== 1) $display("FAIL: Test 5 - dout must stay 1 forever");
        
        $display("ALL TESTS PASSED");
        $finish;
    end
endmodule
`,
  
  hiddenTestcases: [
    {
      id: "tc-1",
      description: "Balanced sequence: 0,1,0,1",
      testbench: `\`timescale 1ns / 1ps
module tb_hidden1;
    reg clk, reset, din;
    wire dout;
    two_zeros_ones_detector dut (.clk(clk), .reset(reset), .din(din), .dout(dout));
    initial clk = 0; always #5 clk = ~clk;
    initial begin
        $dumpfile("wave.vcd");
        $dumpvars(0, tb_hidden1);
        reset = 1; @(posedge clk); reset = 0; @(posedge clk);
        din = 0; @(posedge clk); if (dout !== 0) $finish;
        din = 1; @(posedge clk); if (dout !== 0) $finish;
        din = 0; @(posedge clk); if (dout !== 0) $finish;
        din = 1; @(posedge clk); if (dout !== 1) $finish;
        $display("ALL TESTS PASSED");
        $finish;
    end
endmodule
`,
      expected: "ALL TESTS PASSED",
      weight: 20
    },
    {
      id: "tc-2",
      description: "Ones first: 1,1,0,0",
      testbench: `\`timescale 1ns / 1ps
module tb_hidden2;
    reg clk, reset, din;
    wire dout;
    two_zeros_ones_detector dut (.clk(clk), .reset(reset), .din(din), .dout(dout));
    initial clk = 0; always #5 clk = ~clk;
    initial begin
        $dumpfile("wave.vcd");
        $dumpvars(0, tb_hidden2);
        reset = 1; @(posedge clk); reset = 0; @(posedge clk);
        din = 1; @(posedge clk); if (dout !== 0) $finish;
        din = 1; @(posedge clk); if (dout !== 0) $finish;
        din = 0; @(posedge clk); if (dout !== 0) $finish;
        din = 0; @(posedge clk); if (dout !== 1) $finish;
        $display("ALL TESTS PASSED");
        $finish;
    end
endmodule
`,
      expected: "ALL TESTS PASSED",
      weight: 20
    },
    {
      id: "tc-3",
      description: "Zeros first: 0,0,0,1,1",
      testbench: `\`timescale 1ns / 1ps
module tb_hidden3;
    reg clk, reset, din;
    wire dout;
    two_zeros_ones_detector dut (.clk(clk), .reset(reset), .din(din), .dout(dout));
    initial clk = 0; always #5 clk = ~clk;
    initial begin
        $dumpfile("wave.vcd");
        $dumpvars(0, tb_hidden3);
        reset = 1; @(posedge clk); reset = 0; @(posedge clk);
        din = 0; @(posedge clk); if (dout !== 0) $finish;
        din = 0; @(posedge clk); if (dout !== 0) $finish;
        din = 0; @(posedge clk); if (dout !== 0) $finish;
        din = 1; @(posedge clk); if (dout !== 0) $finish;
        din = 1; @(posedge clk); if (dout !== 1) $finish;
        $display("ALL TESTS PASSED");
        $finish;
    end
endmodule
`,
      expected: "ALL TESTS PASSED",
      weight: 20
    },
    {
      id: "tc-4",
      description: "Reset mid-sequence",
      testbench: `\`timescale 1ns / 1ps
module tb_hidden4;
    reg clk, reset, din;
    wire dout;
    two_zeros_ones_detector dut (.clk(clk), .reset(reset), .din(din), .dout(dout));
    initial clk = 0; always #5 clk = ~clk;
    initial begin
        $dumpfile("wave.vcd");
        $dumpvars(0, tb_hidden4);
        reset = 1; @(posedge clk); reset = 0; @(posedge clk);
        din = 0; @(posedge clk);
        din = 0; @(posedge clk);
        reset = 1; @(posedge clk); if (dout !== 0) $finish;
        reset = 0; @(posedge clk);
        din = 1; @(posedge clk);
        din = 1; @(posedge clk);
        if (dout !== 0) $finish;
        din = 0; @(posedge clk);
        din = 0; @(posedge clk);
        if (dout !== 1) $finish;
        $display("ALL TESTS PASSED");
        $finish;
    end
endmodule
`,
      expected: "ALL TESTS PASSED",
      weight: 20
    },
    {
      id: "tc-5",
      description: "Sticky output: 0,1,0,1,0,0,0,1,1",
      testbench: `\`timescale 1ns / 1ps
module tb_hidden5;
    reg clk, reset, din;
    wire dout;
    two_zeros_ones_detector dut (.clk(clk), .reset(reset), .din(din), .dout(dout));
    initial clk = 0; always #5 clk = ~clk;
    initial begin
        $dumpfile("wave.vcd");
        $dumpvars(0, tb_hidden5);
        reset = 1; @(posedge clk); reset = 0; @(posedge clk);
        din = 0; @(posedge clk);
        din = 1; @(posedge clk);
        din = 0; @(posedge clk);
        din = 1; @(posedge clk); if (dout !== 1) $finish;
        // After this, dout must stay 1 forever
        din = 0; @(posedge clk); if (dout !== 1) $finish;
        din = 0; @(posedge clk); if (dout !== 1) $finish;
        din = 0; @(posedge clk); if (dout !== 1) $finish;
        din = 1; @(posedge clk); if (dout !== 1) $finish;
        din = 1; @(posedge clk); if (dout !== 1) $finish;
        $display("ALL TESTS PASSED");
        $finish;
    end
endmodule
`,
      expected: "ALL TESTS PASSED",
      weight: 20
    }
  ],
  
  xpReward: 350,
  estimatedMin: 30
},

{
  id: "arena-fsm-003",
  slug: "sequence-detector-110-101",
  title: "Sequence Detector — Detect 110 or 101 (Moore FSM)",
  category: "FSM",
  difficulty: "Hard",
  tags: ["fsm", "moore-fsm", "sequence-detection", "overlapping"],
  
  statement: `# Sequence Detector — Detect 110 or 101 (Moore FSM)

Design a Moore finite-state machine with one input \`din\` and one output \`dout\`.

The output becomes **1** whenever the most recent three input bits form either:
* \`110\`
* \`101\`

Overlapping sequences must be detected.

Since this is a Moore machine, the output depends **only on the current state**, not on the input.

## Examples

* Input sequence: \`1,1,0\`
  * Output sequence = \`0,0,1\`
  * Explanation: "110" detected

* Input sequence: \`1,0,1\`
  * Output sequence = \`0,0,1\`
  * Explanation: "101" detected

* Input sequence: \`1,1,0,1,0,1\`
  * Output sequence = \`0,0,1,1,0,1\`
  * Explanation: Three overlapping detections:
    * Cycle 3: "110" detected
    * Cycle 4: "101" detected (overlapping!)
    * Cycle 6: "101" detected again

* Input sequence: \`1,1,1,1\`
  * Output sequence = \`0,0,0,0\`
  * No target sequence appears

## Interface

| Port  | Direction | Width | Description                                   |
|-------|-----------|-------|-----------------------------------------------|
| clk   | input     | 1     | Rising-edge clock                             |
| reset | input     | 1     | Synchronous active-high reset                 |
| din   | input     | 1     | Serial input bit                              |
| dout  | output    | 1     | Asserted when sequence 110 or 101 is detected |

## Constraints

* Implement a **Moore FSM** (output depends only on state)
* Use \`always @(posedge clk)\` for the state machine
* Use synchronous active-high reset
* Use non-blocking assignments (\`<=\`)
* Overlapping sequences **must be detected**
* \`dout\` is combinational from current state (not registered)

## FSM Hint 🔒

Track the last useful bits as states:
* S0: no pattern
* S1: last bit is 1
* S10: last 2 bits are 10
* S11: last 2 bits are 11
* S101_DETECT: just saw 101
* S110_DETECT: just saw 110

Use careful transition design to preserve suffix for overlap detection.
`,
  
  examples: [
    {
      input: "1,1,0",
      output: "0,0,1",
      explanation: "Pattern '110' detected at cycle 3"
    },
    {
      input: "1,0,1",
      output: "0,0,1",
      explanation: "Pattern '101' detected at cycle 3"
    },
    {
      input: "1,1,0,1,0,1",
      output: "0,0,1,1,0,1",
      explanation: "Overlapping detections at cycles 3,4,6"
    }
  ],
  
  constraints: [
    "Moore FSM: output depends only on state",
    "Use always @(posedge clk) for state transitions",
    "Synchronous active-high reset to initial state",
    "Non-blocking assignments (<=) required",
    "Must detect overlapping patterns",
    "Output should become 1 immediately when pattern is detected"
  ],
  
 starterCode: `\`timescale 1ns / 1ps

module seq_detector_110_101(
    input clk,
    input reset,
    input din,
    output dout
);
    // Declare state registers
    reg [2:0] state, next_state;
    
    // Combinational logic
    
    // Sequential logic
    
    // Next-state logic
    
endmodule
`,

testbenchSkeleton: `\`timescale 1ns / 1ps

module tb_seq_detector_110_101;
    reg clk, reset, din;
    wire dout;
    
    seq_detector_110_101 dut (
        .clk(clk),
        .reset(reset),
        .din(din),
        .dout(dout)
    );
    
    initial clk = 0;
    always #5 clk = ~clk;
    
    initial begin
        $dumpfile("wave.vcd");
        $dumpvars(0, tb_seq_detector_110_101);
        
        // Write your test cases here
        
        $finish;
    end
endmodule
`,
  
  hiddenTestcases: [
    {
      id: "tc-1",
      description: "Pattern 110",
      testbench: `\`timescale 1ns / 1ps
module tb_h1;
    reg clk, reset, din;
    wire dout;
    seq_detector_110_101 dut (.clk(clk), .reset(reset), .din(din), .dout(dout));
    initial clk = 0; always #5 clk = ~clk;
    initial begin
        $dumpfile("wave.vcd");
        $dumpvars(0, tb_h1);
        reset = 1; @(posedge clk); reset = 0; @(posedge clk);
        din = 1; @(posedge clk); if (dout !== 0) $finish;
        din = 1; @(posedge clk); if (dout !== 0) $finish;
        din = 0; @(posedge clk); if (dout !== 1) $finish;
        $display("ALL TESTS PASSED");
        $finish;
    end
endmodule
`,
      expected: "ALL TESTS PASSED",
      weight: 15
    },
    {
      id: "tc-2",
      description: "Pattern 101",
      testbench: `\`timescale 1ns / 1ps
module tb_h2;
    reg clk, reset, din;
    wire dout;
    seq_detector_110_101 dut (.clk(clk), .reset(reset), .din(din), .dout(dout));
    initial clk = 0; always #5 clk = ~clk;
    initial begin
        $dumpfile("wave.vcd");
        $dumpvars(0, tb_h2);
        reset = 1; @(posedge clk); reset = 0; @(posedge clk);
        din = 1; @(posedge clk); if (dout !== 0) $finish;
        din = 0; @(posedge clk); if (dout !== 0) $finish;
        din = 1; @(posedge clk); if (dout !== 1) $finish;
        $display("ALL TESTS PASSED");
        $finish;
    end
endmodule
`,
      expected: "ALL TESTS PASSED",
      weight: 15
    },
    {
      id: "tc-3",
      description: "Overlapping 110->101",
      testbench: `\`timescale 1ns / 1ps
module tb_h3;
    reg clk, reset, din;
    wire dout;
    seq_detector_110_101 dut (.clk(clk), .reset(reset), .din(din), .dout(dout));
    initial clk = 0; always #5 clk = ~clk;
    initial begin
        $dumpfile("wave.vcd");
        $dumpvars(0, tb_h3);
        reset = 1; @(posedge clk); reset = 0; @(posedge clk);
        din = 1; @(posedge clk); if (dout !== 0) $finish;
        din = 1; @(posedge clk); if (dout !== 0) $finish;
        din = 0; @(posedge clk); if (dout !== 1) $finish;
        din = 1; @(posedge clk); if (dout !== 1) $finish;
        $display("ALL TESTS PASSED");
        $finish;
    end
endmodule
`,
      expected: "ALL TESTS PASSED",
      weight: 20
    },
    {
      id: "tc-4",
      description: "No pattern (1111)",
      testbench: `\`timescale 1ns / 1ps
module tb_h4;
    reg clk, reset, din;
    wire dout;
    seq_detector_110_101 dut (.clk(clk), .reset(reset), .din(din), .dout(dout));
    initial clk = 0; always #5 clk = ~clk;
    initial begin
        $dumpfile("wave.vcd");
        $dumpvars(0, tb_h4);
        reset = 1; @(posedge clk); reset = 0; @(posedge clk);
        din = 1; @(posedge clk); if (dout !== 0) $finish;
        din = 1; @(posedge clk); if (dout !== 0) $finish;
        din = 1; @(posedge clk); if (dout !== 0) $finish;
        din = 1; @(posedge clk); if (dout !== 0) $finish;
        $display("ALL TESTS PASSED");
        $finish;
    end
endmodule
`,
      expected: "ALL TESTS PASSED",
      weight: 15
    },
    {
      id: "tc-5",
      description: "Long overlapping sequence 110110101",
      testbench: `\`timescale 1ns / 1ps
module tb_h5;
    reg clk, reset, din;
    wire dout;
    seq_detector_110_101 dut (.clk(clk), .reset(reset), .din(din), .dout(dout));
    initial clk = 0; always #5 clk = ~clk;
    initial begin
        $dumpfile("wave.vcd");
        $dumpvars(0, tb_h5);
        reset = 1; @(posedge clk); reset = 0; @(posedge clk);
        // 1 1 0 1 1 0 1 0 1
        din = 1; @(posedge clk); if (dout !== 0) $finish;
        din = 1; @(posedge clk); if (dout !== 0) $finish;
        din = 0; @(posedge clk); if (dout !== 1) $finish;
        din = 1; @(posedge clk); if (dout !== 1) $finish;
        din = 1; @(posedge clk); if (dout !== 0) $finish;
        din = 0; @(posedge clk); if (dout !== 1) $finish;
        din = 1; @(posedge clk); if (dout !== 1) $finish;
        din = 0; @(posedge clk); if (dout !== 0) $finish;
        din = 1; @(posedge clk); if (dout !== 1) $finish;
        $display("ALL TESTS PASSED");
        $finish;
    end
endmodule
`,
      expected: "ALL TESTS PASSED",
      weight: 20
    }
  ],
  
  xpReward: 400,
  estimatedMin: 35
},

{
  id: "arena-fsm-004",
  slug: "sliding-window-parity",
  title: "3-Bit Sliding Window Parity Generator",
  category: "FSM",
  difficulty: "Medium",
  tags: ["fsm", "parity", "shift-register", "sliding-window"],
  
  statement: `# 3-Bit Sliding Window Parity Generator

Design an FSM that continuously observes a serial input \`w\`.

For every three consecutive bits observed, generate an output \`p\` equal to the **odd parity** of those three bits.

The parity output must be:
* **1** when the number of 1's in the current 3-bit window is odd
* **0** otherwise

## Examples

* Window = 001 → p = 1 (one 1 → odd)
* Window = 011 → p = 0 (two 1's → even)
* Window = 111 → p = 1 (three 1's → odd)
* Window = 100 → p = 1 (one 1 → odd)

The window slides by one bit every clock cycle.

## Interface

| Port  | Direction | Width | Description                            |
|-------|-----------|-------|----------------------------------------|
| clk   | input     | 1     | Rising-edge clock                      |
| reset | input     | 1     | Synchronous active-high reset          |
| w     | input     | 1     | Serial input bit                       |
| p     | output    | 1     | Odd parity of most recent three bits   |

## Behavior

On each rising edge of \`clk\`:
1. Shift in the new input bit \`w\`
2. Form the latest 3-bit window
3. Output: \`p = b2 XOR b1 XOR b0\`
   where \`b2, b1, b0\` are the three most recent bits

## Constraints

* Use \`always @(posedge clk)\` for state transitions
* Synchronous active-high reset
* Use non-blocking assignments (\`<=\`)
* Output updates every cycle (after 3 bits have been seen)
* Window slides continuously
* Minimize the number of states (hint: 2 bits is enough)

## Examples

### Example 1
Input sequence: \`0,0,1,1,0\`

Windows formed:
* Cycle 1: 0__ (incomplete)
* Cycle 2: 00_ (incomplete)
* Cycle 3: 001 → p = 1
* Cycle 4: 011 → p = 0
* Cycle 5: 110 → p = 0

Output: \`p = X, X, 1, 0, 0\`

### Example 2
Input sequence: \`1,1,1,1\`

Windows formed:
* Cycle 3: 111 → p = 1
* Cycle 4: 111 → p = 1

Output: \`p = X, X, 1, 1\`

## Optimization Hint 🔒

You don't need 8 states for all possible 3-bit values.
Think about what you need to remember from cycle to cycle
to compute the parity of the next window.
`,
  
  examples: [
    {
      input: "0,0,1,1,0",
      output: "X,X,1,0,0",
      explanation: "Windows: 001(p=1), 011(p=0), 110(p=0)"
    },
    {
      input: "1,1,1,1",
      output: "X,X,1,1",
      explanation: "All-ones windows: 111(p=1), 111(p=1)"
    }
  ],
  
  constraints: [
    "Use always @(posedge clk) for the state machine",
    "Synchronous active-high reset",
    "Non-blocking assignments (<=) required",
    "Output updates every cycle after third bit",
    "Window slides continuously by one bit",
    "Minimize state encoding (2 bits sufficient)"
  ],
  
  starterCode: `\`timescale 1ns / 1ps

module sliding_window_parity(
    input clk,
    input reset,
    input w,
    output p
);
    // Declare registers to store window bits
    
    // Combinational logic for parity
    
    // Sequential logic to shift and reset
    
endmodule
`,
  
  testbenchSkeleton: `\`timescale 1ns / 1ps

module tb_sliding_window_parity;
    reg clk, reset, w;
    wire p;
    
    sliding_window_parity dut (
        .clk(clk),
        .reset(reset),
        .w(w),
        .p(p)
    );
    
    initial clk = 0;
    always #5 clk = ~clk;
    
    initial begin
        $dumpfile("wave.vcd");
        $dumpvars(0, tb_sliding_window_parity);
        
        // Write your test cases here
        // Remember: first two outputs are don't-care (X)
        // Valid parity starts from cycle 3
        
        $finish;
    end
endmodule
`,
  
  hiddenTestcases: [
    {
      id: "tc-1",
      description: "Sequence 0,0,1,1,0",
      testbench: `\`timescale 1ns / 1ps
module tb_h1;
    reg clk, reset, w;
    wire p;
    sliding_window_parity dut (.clk(clk), .reset(reset), .w(w), .p(p));
    initial clk = 0; always #5 clk = ~clk;
    initial begin
        $dumpfile("wave.vcd");
        $dumpvars(0, tb_h1);
        reset = 1; @(posedge clk); reset = 0; @(posedge clk);
        w = 0; @(posedge clk);
        w = 0; @(posedge clk);
        w = 1; @(posedge clk); if (p !== 1) $finish;
        w = 1; @(posedge clk); if (p !== 0) $finish;
        w = 0; @(posedge clk); if (p !== 0) $finish;
        $display("ALL TESTS PASSED");
        $finish;
    end
endmodule
`,
      expected: "ALL TESTS PASSED",
      weight: 18
    },
    {
      id: "tc-2",
      description: "All ones: 1,1,1,1",
      testbench: `\`timescale 1ns / 1ps
module tb_h2;
    reg clk, reset, w;
    wire p;
    sliding_window_parity dut (.clk(clk), .reset(reset), .w(w), .p(p));
    initial clk = 0; always #5 clk = ~clk;
    initial begin
        $dumpfile("wave.vcd");
        $dumpvars(0, tb_h2);
        reset = 1; @(posedge clk); reset = 0; @(posedge clk);
        w = 1; @(posedge clk);
        w = 1; @(posedge clk);
        w = 1; @(posedge clk); if (p !== 1) $finish;
        w = 1; @(posedge clk); if (p !== 1) $finish;
        $display("ALL TESTS PASSED");
        $finish;
    end
endmodule
`,
      expected: "ALL TESTS PASSED",
      weight: 18
    },
    {
      id: "tc-3",
      description: "All zeros: 0,0,0,0,0",
      testbench: `\`timescale 1ns / 1ps
module tb_h3;
    reg clk, reset, w;
    wire p;
    sliding_window_parity dut (.clk(clk), .reset(reset), .w(w), .p(p));
    initial clk = 0; always #5 clk = ~clk;
    initial begin
        $dumpfile("wave.vcd");
        $dumpvars(0, tb_h3);
        reset = 1; @(posedge clk); reset = 0; @(posedge clk);
        w = 0; @(posedge clk);
        w = 0; @(posedge clk);
        w = 0; @(posedge clk); if (p !== 0) $finish;
        w = 0; @(posedge clk); if (p !== 0) $finish;
        w = 0; @(posedge clk); if (p !== 0) $finish;
        $display("ALL TESTS PASSED");
        $finish;
    end
endmodule
`,
      expected: "ALL TESTS PASSED",
      weight: 16
    },
    {
      id: "tc-4",
      description: "Alternating: 1,0,1,0,1,0,1",
      testbench: `\`timescale 1ns / 1ps
module tb_h4;
    reg clk, reset, w;
    wire p;
    sliding_window_parity dut (.clk(clk), .reset(reset), .w(w), .p(p));
    initial clk = 0; always #5 clk = ~clk;
    initial begin
        $dumpfile("wave.vcd");
        $dumpvars(0, tb_h4);
        reset = 1; @(posedge clk); reset = 0; @(posedge clk);
        w = 1; @(posedge clk);
        w = 0; @(posedge clk);
        w = 1; @(posedge clk); if (p !== 0) $finish;
        w = 0; @(posedge clk); if (p !== 0) $finish;
        w = 1; @(posedge clk); if (p !== 0) $finish;
        w = 0; @(posedge clk); if (p !== 0) $finish;
        w = 1; @(posedge clk); if (p !== 0) $finish;
        $display("ALL TESTS PASSED");
        $finish;
    end
endmodule
`,
      expected: "ALL TESTS PASSED",
      weight: 16
    },
    {
      id: "tc-5",
      description: "Reset mid-sequence: 1,1,0 then reset then 1,0,0",
      testbench: `\`timescale 1ns / 1ps
module tb_h5;
    reg clk, reset, w;
    wire p;
    sliding_window_parity dut (.clk(clk), .reset(reset), .w(w), .p(p));
    initial clk = 0; always #5 clk = ~clk;
    initial begin
        $dumpfile("wave.vcd");
        $dumpvars(0, tb_h5);
        reset = 1; @(posedge clk); reset = 0; @(posedge clk);
        w = 1; @(posedge clk);
        w = 1; @(posedge clk);
        w = 0; @(posedge clk); if (p !== 0) $finish;
        reset = 1; @(posedge clk);
        reset = 0; @(posedge clk);
        w = 1; @(posedge clk);
        w = 0; @(posedge clk);
        w = 0; @(posedge clk); if (p !== 1) $finish;
        $display("ALL TESTS PASSED");
        $finish;
    end
endmodule
`,
      expected: "ALL TESTS PASSED",
      weight: 16
    }
  ],
  
  xpReward: 350,
  estimatedMin: 25
},

{
  id: "arena-fsm-005",
  slug: "four-equal-cycles-detector",
  title: "Four Consecutive Equal Cycles Detector",
  category: "FSM",
  difficulty: "Hard",
  tags: ["fsm", "sequence-detection", "equality", "counter"],
  
  statement: `# Four Consecutive Equal Cycles Detector

A sequential circuit has two 1-bit inputs \`w1\` and \`w2\` and one output \`z\`.

At every clock cycle, **compare the two inputs**.

If \`w1 == w2\` for **four consecutive clock cycles**, assert \`z = 1\`.

Otherwise \`z = 0\`.

Once four consecutive equal cycles have been reached, \`z\` remains high **as long as equality continues**.

Any mismatch **resets the count**.

## Equality Definition

Define:
\`\`\`
eq = (w1 == w2)
\`\`\`

The output becomes 1 when the pattern \`eq = 1111\` has been observed.

Overlapping occurrences must be supported.

## Interface

| Port  | Direction | Width | Description                      |
|-------|-----------|-------|----------------------------------|
| clk   | input     | 1     | Rising-edge clock                |
| reset | input     | 1     | Synchronous active-high reset    |
| w1    | input     | 1     | First input stream               |
| w2    | input     | 1     | Second input stream              |
| z     | output    | 1     | High after four equal cycles     |

## Behavior

1. Compute \`eq = (w1 == w2)\` every cycle
2. Count consecutive cycles where \`eq = 1\`
3. When count reaches 4, set \`z = 1\`
4. While \`eq = 1\`, keep \`z = 1\`
5. When \`eq = 0\`, reset count and \`z = 0\`

## Constraints

* Use \`always @(posedge clk)\` for state machine
* Synchronous active-high reset
* Non-blocking assignments (\`<=\`) required
* A mismatch immediately resets the count
* Four or more consecutive equal cycles keeps \`z = 1\`
* Minimize the number of states

## Examples

### Example 1
Inputs:
\`\`\`
w1: 0110111000110
w2: 1110101000111
eq: 0111101111100
\`\`\`

Output:
\`\`\`
z:  0000100001110
\`\`\`

Explanation:
* Cycles 1-2: eq=0 → z=0 (reset)
* Cycle 3: eq=1, count=1 → z=0
* Cycle 4: eq=1, count=2 → z=0
* Cycle 5: eq=1, count=3 → z=0
* Cycle 6: eq=0 → z=0 (reset count)
* Cycle 7: eq=1, count=1 → z=0
* Cycle 8: eq=1, count=2 → z=0
* Cycle 9: eq=1, count=3 → z=0
* Cycle 10: eq=1, count=4 → z=1 ✓
* Cycle 11: eq=1, count=5 → z=1 (stays high)
* Cycle 12: eq=1, count=6 → z=1 (stays high)
* Cycle 13: eq=0 → z=0 (reset)

### Example 2
Inputs:
\`\`\`
w1: 111111
w2: 111111
eq: 111111
\`\`\`

Output:
\`\`\`
z:  000111
\`\`\`

All equal → z becomes 1 on cycle 4, stays 1.

### Example 3
Inputs:
\`\`\`
w1: 101010
w2: 010101
eq: 000000
\`\`\`

Output:
\`\`\`
z:  000000
\`\`\`

Never equal → z always 0.

## FSM Hint 🔒

Reduce the problem to detecting the pattern \`1111\` on the equality signal \`eq\`.

Think of states representing:
* Initial/no matches
* One consecutive match
* Two consecutive matches
* Three consecutive matches
* Four or more consecutive matches

A mismatch immediately drops back to the initial state.
`,
  
  examples: [
    {
      input: "w1=0110111000110, w2=1110101000111",
      output: "0000100001110",
      explanation: "Four equal cycles detected at positions 10-13, maintains z=1 while equality continues"
    },
    {
      input: "w1=111111, w2=111111",
      output: "000111",
      explanation: "All inputs equal, z=1 from cycle 4 onwards"
    },
    {
      input: "w1=101010, w2=010101",
      output: "000000",
      explanation: "No matching cycles, z always 0"
    }
  ],
  
  constraints: [
    "Use always @(posedge clk) for the state machine",
    "Synchronous active-high reset",
    "Non-blocking assignments (<=) required",
    "Mismatch immediately resets the count",
    "Four consecutive equal cycles keeps z=1",
    "Overlapping detections must work",
    "Minimize state encoding (3 bits sufficient)"
  ],
  
  starterCode: `\`timescale 1ns / 1ps

module four_equal_detector(
    input clk,
    input reset,
    input w1,
    input w2,
    output z
);
    // Declare state registers
    
    // Compute equality
    
    // Combinational output logic
    
    // Sequential state machine
    
endmodule
`,
  
  testbenchSkeleton: `\`timescale 1ns / 1ps

module tb_four_equal_detector;
    reg clk, reset, w1, w2;
    wire z;
    
    four_equal_detector dut (
        .clk(clk),
        .reset(reset),
        .w1(w1),
        .w2(w2),
        .z(z)
    );
    
    initial clk = 0;
    always #5 clk = ~clk;
    
    initial begin
        $dumpfile("wave.vcd");
        $dumpvars(0, tb_four_equal_detector);
        
        // Write your test cases here
        // Test basic 4-equal detection, reset behavior, overlapping patterns
        
        $finish;
    end
endmodule
`,
  
  hiddenTestcases: [
    {
      id: "tc-1",
      description: "Four equal then mismatch",
      testbench: `\`timescale 1ns / 1ps
module tb_h1;
    reg clk, reset, w1, w2;
    wire z;
    four_equal_detector dut (.clk(clk), .reset(reset), .w1(w1), .w2(w2), .z(z));
    initial clk = 0; always #5 clk = ~clk;
    initial begin
        $dumpfile("wave.vcd");
        $dumpvars(0, tb_h1);
        reset = 1; @(posedge clk); reset = 0; @(posedge clk);
        w1 = 1; w2 = 1; @(posedge clk); if (z !== 0) $finish;
        w1 = 1; w2 = 1; @(posedge clk); if (z !== 0) $finish;
        w1 = 1; w2 = 1; @(posedge clk); if (z !== 0) $finish;
        w1 = 1; w2 = 1; @(posedge clk); if (z !== 1) $finish;
        w1 = 1; w2 = 0; @(posedge clk); if (z !== 0) $finish;
        $display("ALL TESTS PASSED");
        $finish;
    end
endmodule
`,
      expected: "ALL TESTS PASSED",
      weight: 18
    },
    {
      id: "tc-2",
      description: "All equal sequence",
      testbench: `\`timescale 1ns / 1ps
module tb_h2;
    reg clk, reset, w1, w2;
    wire z;
    four_equal_detector dut (.clk(clk), .reset(reset), .w1(w1), .w2(w2), .z(z));
    initial clk = 0; always #5 clk = ~clk;
    initial begin
        $dumpfile("wave.vcd");
        $dumpvars(0, tb_h2);
        reset = 1; @(posedge clk); reset = 0; @(posedge clk);
        w1 = 1; w2 = 1; @(posedge clk); if (z !== 0) $finish;
        w1 = 1; w2 = 1; @(posedge clk); if (z !== 0) $finish;
        w1 = 1; w2 = 1; @(posedge clk); if (z !== 0) $finish;
        w1 = 1; w2 = 1; @(posedge clk); if (z !== 1) $finish;
        w1 = 1; w2 = 1; @(posedge clk); if (z !== 1) $finish;
        w1 = 1; w2 = 1; @(posedge clk); if (z !== 1) $finish;
        $display("ALL TESTS PASSED");
        $finish;
    end
endmodule
`,
      expected: "ALL TESTS PASSED",
      weight: 18
    },
    {
      id: "tc-3",
      description: "Never equal",
      testbench: `\`timescale 1ns / 1ps
module tb_h3;
    reg clk, reset, w1, w2;
    wire z;
    four_equal_detector dut (.clk(clk), .reset(reset), .w1(w1), .w2(w2), .z(z));
    initial clk = 0; always #5 clk = ~clk;
    initial begin
        $dumpfile("wave.vcd");
        $dumpvars(0, tb_h3);
        reset = 1; @(posedge clk); reset = 0; @(posedge clk);
        w1 = 1; w2 = 0; @(posedge clk); if (z !== 0) $finish;
        w1 = 0; w2 = 1; @(posedge clk); if (z !== 0) $finish;
        w1 = 1; w2 = 0; @(posedge clk); if (z !== 0) $finish;
        w1 = 0; w2 = 1; @(posedge clk); if (z !== 0) $finish;
        w1 = 1; w2 = 0; @(posedge clk); if (z !== 0) $finish;
        $display("ALL TESTS PASSED");
        $finish;
    end
endmodule
`,
      expected: "ALL TESTS PASSED",
      weight: 16
    },
    {
      id: "tc-4",
      description: "Overlapping: equal, equal, equal, equal, unequal, equal, equal, equal, equal",
      testbench: `\`timescale 1ns / 1ps
module tb_h4;
    reg clk, reset, w1, w2;
    wire z;
    four_equal_detector dut (.clk(clk), .reset(reset), .w1(w1), .w2(w2), .z(z));
    initial clk = 0; always #5 clk = ~clk;
    initial begin
        $dumpfile("wave.vcd");
        $dumpvars(0, tb_h4);
        reset = 1; @(posedge clk); reset = 0; @(posedge clk);
        w1 = 0; w2 = 0; @(posedge clk); if (z !== 0) $finish;
        w1 = 0; w2 = 0; @(posedge clk); if (z !== 0) $finish;
        w1 = 0; w2 = 0; @(posedge clk); if (z !== 0) $finish;
        w1 = 0; w2 = 0; @(posedge clk); if (z !== 1) $finish;
        w1 = 0; w2 = 1; @(posedge clk); if (z !== 0) $finish;
        w1 = 1; w2 = 1; @(posedge clk); if (z !== 0) $finish;
        w1 = 1; w2 = 1; @(posedge clk); if (z !== 0) $finish;
        w1 = 1; w2 = 1; @(posedge clk); if (z !== 0) $finish;
        w1 = 1; w2 = 1; @(posedge clk); if (z !== 1) $finish;
        $display("ALL TESTS PASSED");
        $finish;
    end
endmodule
`,
      expected: "ALL TESTS PASSED",
      weight: 18
    },
    {
      id: "tc-5",
      description: "Reset mid-sequence",
      testbench: `\`timescale 1ns / 1ps
module tb_h5;
    reg clk, reset, w1, w2;
    wire z;
    four_equal_detector dut (.clk(clk), .reset(reset), .w1(w1), .w2(w2), .z(z));
    initial clk = 0; always #5 clk = ~clk;
    initial begin
        $dumpfile("wave.vcd");
        $dumpvars(0, tb_h5);
        reset = 1; @(posedge clk); reset = 0; @(posedge clk);
        w1 = 1; w2 = 1; @(posedge clk);
        w1 = 1; w2 = 1; @(posedge clk);
        reset = 1; @(posedge clk);
        if (z !== 0) $finish;
        reset = 0; @(posedge clk);
        w1 = 1; w2 = 1; @(posedge clk);
        w1 = 1; w2 = 1; @(posedge clk);
        w1 = 1; w2 = 1; @(posedge clk);
        w1 = 1; w2 = 1; @(posedge clk);
        if (z !== 1) $finish;
        $display("ALL TESTS PASSED");
        $finish;
    end
endmodule
`,
      expected: "ALL TESTS PASSED",
      weight: 16
    }
  ],
  
  xpReward: 450,
  estimatedMin: 35
},

{
  id: "arena-fsm-006",
  slug: "first-bit-equality-detector",
  title: "First Bit Equality Detector",
  category: "FSM",
  difficulty: "Easy",
  tags: ["fsm", "memory", "equality", "reference"],
  
  statement: `# First Bit Equality Detector

Design a finite-state machine that observes a serial input bit stream.

The machine should output:
* **1** if the current input bit is equal to the **first bit ever received**
* **0** otherwise

The first bit itself should always produce output **1**, since it is equal to itself.

Once the first bit is observed, it remains the **reference bit forever**.

## Interface

| Port  | Direction | Width | Description                              |
|-------|-----------|-------|------------------------------------------|
| clk   | input     | 1     | Rising-edge clock                        |
| reset | input     | 1     | Synchronous active-high reset            |
| din   | input     | 1     | Serial input bit                         |
| y     | output    | 1     | High when current bit equals first bit   |

## Behavior

**Initially** the machine has no history.

**On the first clock cycle after reset:**
1. Capture the first input bit
2. Output **1** (it equals itself)

**After that:**
* \`y = 1\` if \`current_bit == first_bit\`
* \`y = 0\` otherwise

The remembered first bit **never changes** until reset.

## Examples

### Example 1
Input:  \`0,1,0,0,1,1\`

Breakdown:
* Cycle 1: din=0 (first bit) → y=1 ✓
* Cycle 2: din=1 (1 ≠ 0) → y=0
* Cycle 3: din=0 (0 = 0) → y=1
* Cycle 4: din=0 (0 = 0) → y=1
* Cycle 5: din=1 (1 ≠ 0) → y=0
* Cycle 6: din=1 (1 ≠ 0) → y=0

Output: \`1,0,1,1,0,0\`

### Example 2
Input:  \`1,1,0,1,0,0\`

Breakdown:
* Cycle 1: din=1 (first bit) → y=1
* Cycle 2: din=1 (1 = 1) → y=1
* Cycle 3: din=0 (0 ≠ 1) → y=0
* Cycle 4: din=1 (1 = 1) → y=1
* Cycle 5: din=0 (0 ≠ 1) → y=0
* Cycle 6: din=0 (0 ≠ 1) → y=0

Output: \`1,1,0,1,0,0\`

### Example 3
Input:  \`0,0,0,0\`

Breakdown:
* Cycle 1: din=0 (first bit) → y=1
* Cycle 2: din=0 (0 = 0) → y=1
* Cycle 3: din=0 (0 = 0) → y=1
* Cycle 4: din=0 (0 = 0) → y=1

Output: \`1,1,1,1\`

## Constraints

* Use \`always @(posedge clk)\` for state machine
* Synchronous active-high reset
* Non-blocking assignments (\`<=\`) required
* First observed bit becomes the reference bit
* First bit itself must generate output 1
* Minimize the number of states (hint: 3 states maximum)

## FSM Hint 🔒

Think about the minimum information you must remember forever:

1. No first bit captured yet
2. First bit was 0
3. First bit was 1

That's all you need.
`,
  
  examples: [
    {
      input: "0,1,0,0,1,1",
      output: "1,0,1,1,0,0",
      explanation: "First bit is 0, output 1 when input matches, 0 otherwise"
    },
    {
      input: "1,1,0,1,0,0",
      output: "1,1,0,1,0,0",
      explanation: "First bit is 1, output 1 when input matches"
    },
    {
      input: "0,0,0,0",
      output: "1,1,1,1",
      explanation: "All inputs match first bit"
    }
  ],
  
  constraints: [
    "Use always @(posedge clk) for state transitions",
    "Synchronous active-high reset",
    "Non-blocking assignments (<=) required",
    "First observed bit is the permanent reference",
    "First bit always outputs 1",
    "Minimize states (3 sufficient)"
  ],
  
  starterCode: `\`timescale 1ns / 1ps

module first_bit_equality(
    input clk,
    input reset,
    input din,
    output y
);
    // Declare state registers
    
    // Combinational output logic
    
    // Sequential state machine
    
endmodule
`,
  
  testbenchSkeleton: `\`timescale 1ns / 1ps

module tb_first_bit_equality;
    reg clk, reset, din;
    wire y;
    
    first_bit_equality dut (
        .clk(clk),
        .reset(reset),
        .din(din),
        .y(y)
    );
    
    initial clk = 0;
    always #5 clk = ~clk;
    
    initial begin
        $dumpfile("wave.vcd");
        $dumpvars(0, tb_first_bit_equality);
        
        // Write your test cases here
        // Test: first bit = 0, then mix of 0's and 1's
        // Test: first bit = 1, then mix of 0's and 1's
        // Test: reset behavior
        
        $finish;
    end
endmodule
`,
  
  hiddenTestcases: [
    {
      id: "tc-1",
      description: "First bit 0, sequence 0,1,0,0,1,1",
      testbench: `\`timescale 1ns / 1ps
module tb_h1;
    reg clk, reset, din;
    wire y;
    first_bit_equality dut (.clk(clk), .reset(reset), .din(din), .y(y));
    initial clk = 0; always #5 clk = ~clk;
    initial begin
        $dumpfile("wave.vcd");
        $dumpvars(0, tb_h1);
        reset = 1; @(posedge clk); reset = 0; @(posedge clk);
        din = 0; @(posedge clk); if (y !== 1) $finish;
        din = 1; @(posedge clk); if (y !== 0) $finish;
        din = 0; @(posedge clk); if (y !== 1) $finish;
        din = 0; @(posedge clk); if (y !== 1) $finish;
        din = 1; @(posedge clk); if (y !== 0) $finish;
        din = 1; @(posedge clk); if (y !== 0) $finish;
        $display("ALL TESTS PASSED");
        $finish;
    end
endmodule
`,
      expected: "ALL TESTS PASSED",
      weight: 18
    },
    {
      id: "tc-2",
      description: "First bit 1, sequence 1,1,0,1,0,0",
      testbench: `\`timescale 1ns / 1ps
module tb_h2;
    reg clk, reset, din;
    wire y;
    first_bit_equality dut (.clk(clk), .reset(reset), .din(din), .y(y));
    initial clk = 0; always #5 clk = ~clk;
    initial begin
        $dumpfile("wave.vcd");
        $dumpvars(0, tb_h2);
        reset = 1; @(posedge clk); reset = 0; @(posedge clk);
        din = 1; @(posedge clk); if (y !== 1) $finish;
        din = 1; @(posedge clk); if (y !== 1) $finish;
        din = 0; @(posedge clk); if (y !== 0) $finish;
        din = 1; @(posedge clk); if (y !== 1) $finish;
        din = 0; @(posedge clk); if (y !== 0) $finish;
        din = 0; @(posedge clk); if (y !== 0) $finish;
        $display("ALL TESTS PASSED");
        $finish;
    end
endmodule
`,
      expected: "ALL TESTS PASSED",
      weight: 18
    },
    {
      id: "tc-3",
      description: "All bits match first bit (0,0,0,0)",
      testbench: `\`timescale 1ns / 1ps
module tb_h3;
    reg clk, reset, din;
    wire y;
    first_bit_equality dut (.clk(clk), .reset(reset), .din(din), .y(y));
    initial clk = 0; always #5 clk = ~clk;
    initial begin
        $dumpfile("wave.vcd");
        $dumpvars(0, tb_h3);
        reset = 1; @(posedge clk); reset = 0; @(posedge clk);
        din = 0; @(posedge clk); if (y !== 1) $finish;
        din = 0; @(posedge clk); if (y !== 1) $finish;
        din = 0; @(posedge clk); if (y !== 1) $finish;
        din = 0; @(posedge clk); if (y !== 1) $finish;
        $display("ALL TESTS PASSED");
        $finish;
    end
endmodule
`,
      expected: "ALL TESTS PASSED",
      weight: 16
    },
    {
      id: "tc-4",
      description: "All bits match first bit (1,1,1,1)",
      testbench: `\`timescale 1ns / 1ps
module tb_h4;
    reg clk, reset, din;
    wire y;
    first_bit_equality dut (.clk(clk), .reset(reset), .din(din), .y(y));
    initial clk = 0; always #5 clk = ~clk;
    initial begin
        $dumpfile("wave.vcd");
        $dumpvars(0, tb_h4);
        reset = 1; @(posedge clk); reset = 0; @(posedge clk);
        din = 1; @(posedge clk); if (y !== 1) $finish;
        din = 1; @(posedge clk); if (y !== 1) $finish;
        din = 1; @(posedge clk); if (y !== 1) $finish;
        din = 1; @(posedge clk); if (y !== 1) $finish;
        $display("ALL TESTS PASSED");
        $finish;
    end
endmodule
`,
      expected: "ALL TESTS PASSED",
      weight: 16
    },
    {
      id: "tc-5",
      description: "Reset clears memory, then new reference bit",
      testbench: `\`timescale 1ns / 1ps
module tb_h5;
    reg clk, reset, din;
    wire y;
    first_bit_equality dut (.clk(clk), .reset(reset), .din(din), .y(y));
    initial clk = 0; always #5 clk = ~clk;
    initial begin
        $dumpfile("wave.vcd");
        $dumpvars(0, tb_h5);
        reset = 1; @(posedge clk); reset = 0; @(posedge clk);
        din = 0; @(posedge clk); if (y !== 1) $finish;
        din = 1; @(posedge clk); if (y !== 0) $finish;
        reset = 1; @(posedge clk);
        reset = 0; @(posedge clk);
        din = 1; @(posedge clk); if (y !== 1) $finish;
        din = 1; @(posedge clk); if (y !== 1) $finish;
        din = 0; @(posedge clk); if (y !== 0) $finish;
        $display("ALL TESTS PASSED");
        $finish;
    end
endmodule
`,
      expected: "ALL TESTS PASSED",
      weight: 16
    }
  ],
  
  xpReward: 300,
  estimatedMin: 20
},

{
  id: "arena-fsm-007",
  slug: "rotate-string-left-fsm",
  title: "Rotate String Left by One Bit (FSM)",
  category: "FSM",
  difficulty: "Hard",
  tags: ["mealy-fsm", "string-rotation", "buffering"],
  
  statement: `# Rotate String Left by One Bit (FSM)

Design a Mealy finite-state machine over the alphabet:
\`\`\`
{0, 1, b}
\`\`\`

where **b** represents a blank symbol indicating the **end of the input stream**.

The machine must output a copy of the input string except that **the first bit is moved to the end** of the string.

In other words:
\`\`\`
b0 b1 b2 ... bn
↓
b1 b2 ... bn b0
\`\`\`

(where b0 is the first bit, b1 is the second, etc.)

## Examples

### Example 1
Input: \`1010011b\`

Breakdown:
* First bit captured: 1
* Subsequent bits output unchanged: 010011
* Blank arrives: output captured first bit: 1

Output: \`0100111\`

Explanation:
The first bit 1 is removed from the front and appended at the end.

### Example 2
Input: \`0110b\`

First bit: 0
Subsequent: 11
Last: 0

Output: \`1100\`

### Example 3
Input: \`10000b\`

First bit: 1
Subsequent: 0000
Last: 1

Output: \`00001\`

## Interface

| Symbol | Description                    |
|--------|--------------------------------|
| 0      | Binary zero                    |
| 1      | Binary one                     |
| b      | Blank (end of input stream)    |

## Behavior

1. **Capture the first bit** when it arrives
2. **Output all subsequent bits unchanged** (pass-through)
3. **When the blank symbol arrives**, output the remembered first bit
4. The resulting stream is the original string rotated left by one position

## Constraints

* Implement as a **Mealy FSM** (output depends on state AND input)
* **Minimize the number of states** (3 states sufficient)
* Blank symbol marks the end of the string
* First bit should appear exactly once at the end
* No additional storage beyond FSM state
* Use \`always @(posedge clk)\` for sequential logic
* Synchronous active-high reset
* Non-blocking assignments (\`<=\`) required

## FSM Hint 🔒

What information must be remembered after the first symbol arrives?

There are only three possibilities:
1. No first bit captured yet
2. First bit = 0
3. First bit = 1

Therefore the minimal machine contains **3 states**.

State diagram:
\`\`\`
INIT -[0/X]→ FIRST_0
INIT -[1/X]→ FIRST_1
FIRST_0 -[0/0]→ FIRST_0
FIRST_0 -[1/1]→ FIRST_0
FIRST_0 -[b/0]→ INIT
FIRST_1 -[0/0]→ FIRST_1
FIRST_1 -[1/1]→ FIRST_1
FIRST_1 -[b/1]→ INIT
\`\`\`
(notation: input/output)

The first output (when capturing the first bit) is undefined/don't-care.
`,
  
  examples: [
    {
      input: "1010011b",
      output: "0100111",
      explanation: "First bit 1 captured, rotate to end: 010011 + 1 = 0100111"
    },
    {
      input: "0110b",
      output: "1100",
      explanation: "First bit 0 captured: 110 + 0 = 1100"
    },
    {
      input: "10000b",
      output: "00001",
      explanation: "First bit 1 captured: 0000 + 1 = 00001"
    }
  ],
  
  constraints: [
    "Mealy FSM: output depends on state and input",
    "Minimize states (3 sufficient)",
    "Blank symbol marks end of input stream",
    "First bit appears exactly once at end",
    "Use always @(posedge clk)",
    "Synchronous active-high reset",
    "Non-blocking assignments (<=)"
  ],
  
  starterCode: `\`timescale 1ns / 1ps

module rotate_string_left(
    input clk,
    input reset,
    input [2:0] din,      // 3'b000=0, 3'b001=1, 3'b010=b
    output reg [2:0] dout // Same encoding
);
    // Declare state registers
    
    // Next-state and output logic (Mealy FSM)
    
    // Sequential state update
    
endmodule
`,
  
  testbenchSkeleton: `\`timescale 1ns / 1ps

module tb_rotate_string_left;
    reg clk, reset;
    reg [2:0] din;
    wire [2:0] dout;
    
    rotate_string_left dut (
        .clk(clk),
        .reset(reset),
        .din(din),
        .dout(dout)
    );
    
    initial clk = 0;
    always #5 clk = ~clk;
    
    // Input encoding: 3'b000=0, 3'b001=1, 3'b010=b
    
    initial begin
        $dumpfile("wave.vcd");
        $dumpvars(0, tb_rotate_string_left);
        
        // Write your test cases here
        // Test: rotate 1010011b -> 0100111
        // Test: rotate 0110b -> 1100
        // Test: reset behavior, multiple strings
        
        $finish;
    end
endmodule
`,
  
  hiddenTestcases: [
    {
      id: "tc-1",
      description: "Rotate 1010011b",
      testbench: `\`timescale 1ns / 1ps
module tb_h1;
    reg clk, reset;
    reg [2:0] din;
    wire [2:0] dout;
    rotate_string_left dut (.clk(clk), .reset(reset), .din(din), .dout(dout));
    initial clk = 0; always #5 clk = ~clk;
    initial begin
        $dumpfile("wave.vcd");
        $dumpvars(0, tb_h1);
        reset = 1; @(posedge clk); reset = 0; @(posedge clk);
        din = 3'b001; @(posedge clk);
        din = 3'b000; @(posedge clk); if (dout !== 3'b000) $finish;
        din = 3'b001; @(posedge clk); if (dout !== 3'b001) $finish;
        din = 3'b000; @(posedge clk); if (dout !== 3'b000) $finish;
        din = 3'b000; @(posedge clk); if (dout !== 3'b000) $finish;
        din = 3'b001; @(posedge clk); if (dout !== 3'b001) $finish;
        din = 3'b001; @(posedge clk); if (dout !== 3'b001) $finish;
        din = 3'b010; @(posedge clk); if (dout !== 3'b001) $finish;
        $display("ALL TESTS PASSED");
        $finish;
    end
endmodule
`,
      expected: "ALL TESTS PASSED",
      weight: 18
    },
    {
      id: "tc-2",
      description: "Rotate 0110b",
      testbench: `\`timescale 1ns / 1ps
module tb_h2;
    reg clk, reset;
    reg [2:0] din;
    wire [2:0] dout;
    rotate_string_left dut (.clk(clk), .reset(reset), .din(din), .dout(dout));
    initial clk = 0; always #5 clk = ~clk;
    initial begin
        $dumpfile("wave.vcd");
        $dumpvars(0, tb_h2);
        reset = 1; @(posedge clk); reset = 0; @(posedge clk);
        din = 3'b000; @(posedge clk);
        din = 3'b001; @(posedge clk); if (dout !== 3'b001) $finish;
        din = 3'b001; @(posedge clk); if (dout !== 3'b001) $finish;
        din = 3'b010; @(posedge clk); if (dout !== 3'b000) $finish;
        $display("ALL TESTS PASSED");
        $finish;
    end
endmodule
`,
      expected: "ALL TESTS PASSED",
      weight: 18
    },
    {
      id: "tc-3",
      description: "Rotate 10000b",
      testbench: `\`timescale 1ns / 1ps
module tb_h3;
    reg clk, reset;
    reg [2:0] din;
    wire [2:0] dout;
    rotate_string_left dut (.clk(clk), .reset(reset), .din(din), .dout(dout));
    initial clk = 0; always #5 clk = ~clk;
    initial begin
        $dumpfile("wave.vcd");
        $dumpvars(0, tb_h3);
        reset = 1; @(posedge clk); reset = 0; @(posedge clk);
        din = 3'b001; @(posedge clk);
        din = 3'b000; @(posedge clk); if (dout !== 3'b000) $finish;
        din = 3'b000; @(posedge clk); if (dout !== 3'b000) $finish;
        din = 3'b000; @(posedge clk); if (dout !== 3'b000) $finish;
        din = 3'b000; @(posedge clk); if (dout !== 3'b000) $finish;
        din = 3'b010; @(posedge clk); if (dout !== 3'b001) $finish;
        $display("ALL TESTS PASSED");
        $finish;
    end
endmodule
`,
      expected: "ALL TESTS PASSED",
      weight: 16
    },
    {
      id: "tc-4",
      description: "Single bit 0b",
      testbench: `\`timescale 1ns / 1ps
module tb_h4;
    reg clk, reset;
    reg [2:0] din;
    wire [2:0] dout;
    rotate_string_left dut (.clk(clk), .reset(reset), .din(din), .dout(dout));
    initial clk = 0; always #5 clk = ~clk;
    initial begin
        $dumpfile("wave.vcd");
        $dumpvars(0, tb_h4);
        reset = 1; @(posedge clk); reset = 0; @(posedge clk);
        din = 3'b000; @(posedge clk);
        din = 3'b010; @(posedge clk); if (dout !== 3'b000) $finish;
        $display("ALL TESTS PASSED");
        $finish;
    end
endmodule
`,
      expected: "ALL TESTS PASSED",
      weight: 16
    },
    {
      id: "tc-5",
      description: "Reset clears state, process new string",
      testbench: `\`timescale 1ns / 1ps
module tb_h5;
    reg clk, reset;
    reg [2:0] din;
    wire [2:0] dout;
    rotate_string_left dut (.clk(clk), .reset(reset), .din(din), .dout(dout));
    initial clk = 0; always #5 clk = ~clk;
    initial begin
        $dumpfile("wave.vcd");
        $dumpvars(0, tb_h5);
        reset = 1; @(posedge clk); reset = 0; @(posedge clk);
        din = 3'b001; @(posedge clk);
        din = 3'b000; @(posedge clk); if (dout !== 3'b000) $finish;
        din = 3'b010; @(posedge clk); if (dout !== 3'b001) $finish;
        reset = 1; @(posedge clk);
        reset = 0; @(posedge clk);
        din = 3'b000; @(posedge clk);
        din = 3'b001; @(posedge clk); if (dout !== 3'b001) $finish;
        din = 3'b010; @(posedge clk); if (dout !== 3'b000) $finish;
        $display("ALL TESTS PASSED");
        $finish;
    end
endmodule
`,
      expected: "ALL TESTS PASSED",
      weight: 16
    }
  ],
  
  xpReward: 450,
  estimatedMin: 40
},

{
  id: "arena-fsm-008",
  slug: "vending-machine-credit-carry",
  title: "Coin-Operated Vending Machine with Credit Carry",
  category: "FSM",
  difficulty: "Hard",
  tags: ["mealy-fsm", "vending-machine", "credit-system", "state-machines"],
  
  statement: `# Coin-Operated Vending Machine with Credit Carry

Design a Mealy FSM for a vending machine that sells candy.

## Pricing

The machine accepts:
* **₹5 coins**
* **₹10 coins**

A candy costs: **₹15**

## Special Rule: Credit Carry

If the user inserts **₹20 total** (for example ₹10 followed by ₹10):
1. The machine **dispenses one candy**
2. Does **NOT** return change
3. **Carries forward the extra ₹5 credit** to the next purchase

Thus after dispensing, the machine behaves as though ₹5 has already been inserted for the next candy.

## Interface

| Port     | Direction | Description                    |
|----------|-----------|--------------------------------|
| clk      | input     | Rising-edge clock              |
| reset    | input     | Synchronous active-high reset  |
| coin5    | input     | ₹5 coin inserted               |
| coin10   | input     | ₹10 coin inserted              |
| dispense | output    | Candy release signal (1=yes)   |

**Only one coin input will be asserted in a cycle.**

## State Model

Current credit is one of:
* **₹0**
* **₹5**
* **₹10**

## Transitions

| Current | Input  | Action | New State |
|---------|--------|--------|-----------|
| ₹0      | ₹5     | —      | ₹5        |
| ₹0      | ₹10    | —      | ₹10       |
| ₹5      | ₹5     | —      | ₹10       |
| ₹5      | ₹10    | Dispense | ₹0        |
| ₹10     | ₹5     | Dispense | ₹0        |
| ₹10     | ₹10    | Dispense | ₹5 (carry) |

## Examples

### Example 1
Input: \`5, 10\`

Credit evolution:
\`\`\`
₹0 → ₹5 → ₹15
\`\`\`

Output:
\`\`\`
dispense = 0, 1
\`\`\`

### Example 2
Input: \`10, 5\`

Credit evolution:
\`\`\`
₹0 → ₹10 → ₹15
\`\`\`

Output:
\`\`\`
dispense = 0, 1
\`\`\`

### Example 3
Input: \`10, 10, 10\`

Credit evolution:
\`\`\`
₹0 → ₹10 → ₹20 (dispense, carry ₹5) → ₹5 → ₹15 (dispense)
\`\`\`

Output:
\`\`\`
dispense = 0, 1, 1
\`\`\`

## Constraints

* Use \`always @(posedge clk)\` for state transitions
* Synchronous active-high reset
* Non-blocking assignments (\`<=\`) required
* Only one coin inserted per cycle (coin5 and coin10 never both 1)
* **No change is returned**
* **Extra ₹5 from ₹20 must carry** into the next purchase
* Minimize the number of states (3 states sufficient)

## FSM Hint 🔒

Think of each state as representing the current stored amount:
* **S0** = ₹0 credit
* **S5** = ₹5 credit
* **S10** = ₹10 credit

The ₹20 case does **not** require a new state—it simply:
1. Dispenses a candy
2. Transitions to **S5** (carrying the ₹5 forward)

Mealy output (\`dispense\`) depends on both state and input.
`,
  
  examples: [
    {
      input: "5,10",
      output: "0,1",
      explanation: "₹0→₹5 (no dispense), ₹5+₹10=₹15 (dispense)"
    },
    {
      input: "10,5",
      output: "0,1",
      explanation: "₹0→₹10 (no dispense), ₹10+₹5=₹15 (dispense)"
    },
    {
      input: "10,10,10",
      output: "0,1,1",
      explanation: "₹0→₹10, ₹10+₹10=₹20 (dispense, carry ₹5), ₹5+₹10=₹15 (dispense)"
    }
  ],
  
  constraints: [
    "Use always @(posedge clk) for state machine",
    "Synchronous active-high reset",
    "Non-blocking assignments (<=) required",
    "Only one coin per cycle",
    "No change returned",
    "₹5 from ₹20 transaction must carry forward",
    "Minimize states (3 sufficient)"
  ],
  
  starterCode: `\`timescale 1ns / 1ps

module vending_machine(
    input clk,
    input reset,
    input coin5,
    input coin10,
    output reg dispense
);
    // Declare state registers
    
    // Next-state and output logic
    
    // Sequential state update
    
endmodule
`,
  
  testbenchSkeleton: `\`timescale 1ns / 1ps

module tb_vending_machine;
    reg clk, reset, coin5, coin10;
    wire dispense;
    
    vending_machine dut (
        .clk(clk),
        .reset(reset),
        .coin5(coin5),
        .coin10(coin10),
        .dispense(dispense)
    );
    
    initial clk = 0;
    always #5 clk = ~clk;
    
    initial begin
        $dumpfile("wave.vcd");
        $dumpvars(0, tb_vending_machine);
        
        // Write your test cases here
        // Test: credit carry (₹10+₹10), accumulation paths, reset behavior
        
        $finish;
    end
endmodule
`,
  
  hiddenTestcases: [
    {
      id: "tc-1",
      description: "5 then 10: 0→5→15",
      testbench: `\`timescale 1ns / 1ps
module tb_h1;
    reg clk, reset, coin5, coin10;
    wire dispense;
    vending_machine dut (.clk(clk), .reset(reset), .coin5(coin5), .coin10(coin10), .dispense(dispense));
    initial clk = 0; always #5 clk = ~clk;
    initial begin
        $dumpfile("wave.vcd");
        $dumpvars(0, tb_h1);
        reset = 1; @(posedge clk); reset = 0; @(posedge clk);
        coin5 = 1; coin10 = 0; @(posedge clk); if (dispense !== 0) $finish;
        coin5 = 0; coin10 = 1; @(posedge clk); if (dispense !== 1) $finish;
        $display("ALL TESTS PASSED");
        $finish;
    end
endmodule
`,
      expected: "ALL TESTS PASSED",
      weight: 16
    },
    {
      id: "tc-2",
      description: "10 then 5: 0→10→15",
      testbench: `\`timescale 1ns / 1ps
module tb_h2;
    reg clk, reset, coin5, coin10;
    wire dispense;
    vending_machine dut (.clk(clk), .reset(reset), .coin5(coin5), .coin10(coin10), .dispense(dispense));
    initial clk = 0; always #5 clk = ~clk;
    initial begin
        $dumpfile("wave.vcd");
        $dumpvars(0, tb_h2);
        reset = 1; @(posedge clk); reset = 0; @(posedge clk);
        coin5 = 0; coin10 = 1; @(posedge clk); if (dispense !== 0) $finish;
        coin5 = 1; coin10 = 0; @(posedge clk); if (dispense !== 1) $finish;
        $display("ALL TESTS PASSED");
        $finish;
    end
endmodule
`,
      expected: "ALL TESTS PASSED",
      weight: 16
    },
    {
      id: "tc-3",
      description: "Credit carry: 10,10,10 → dispense, carry ₹5, dispense",
      testbench: `\`timescale 1ns / 1ps
module tb_h3;
    reg clk, reset, coin5, coin10;
    wire dispense;
    vending_machine dut (.clk(clk), .reset(reset), .coin5(coin5), .coin10(coin10), .dispense(dispense));
    initial clk = 0; always #5 clk = ~clk;
    initial begin
        $dumpfile("wave.vcd");
        $dumpvars(0, tb_h3);
        reset = 1; @(posedge clk); reset = 0; @(posedge clk);
        coin5 = 0; coin10 = 1; @(posedge clk); if (dispense !== 0) $finish;
        coin5 = 0; coin10 = 1; @(posedge clk); if (dispense !== 1) $finish;
        coin5 = 0; coin10 = 1; @(posedge clk); if (dispense !== 1) $finish;
        $display("ALL TESTS PASSED");
        $finish;
    end
endmodule
`,
      expected: "ALL TESTS PASSED",
      weight: 18
    },
    {
      id: "tc-4",
      description: "5,5,5: accumulate to 15",
      testbench: `\`timescale 1ns / 1ps
module tb_h4;
    reg clk, reset, coin5, coin10;
    wire dispense;
    vending_machine dut (.clk(clk), .reset(reset), .coin5(coin5), .coin10(coin10), .dispense(dispense));
    initial clk = 0; always #5 clk = ~clk;
    initial begin
        $dumpfile("wave.vcd");
        $dumpvars(0, tb_h4);
        reset = 1; @(posedge clk); reset = 0; @(posedge clk);
        coin5 = 1; coin10 = 0; @(posedge clk); if (dispense !== 0) $finish;
        coin5 = 1; coin10 = 0; @(posedge clk); if (dispense !== 0) $finish;
        coin5 = 1; coin10 = 0; @(posedge clk); if (dispense !== 1) $finish;
        $display("ALL TESTS PASSED");
        $finish;
    end
endmodule
`,
      expected: "ALL TESTS PASSED",
      weight: 18
    },
    {
      id: "tc-5",
      description: "Reset clears state: buy, reset, buy again",
      testbench: `\`timescale 1ns / 1ps
module tb_h5;
    reg clk, reset, coin5, coin10;
    wire dispense;
    vending_machine dut (.clk(clk), .reset(reset), .coin5(coin5), .coin10(coin10), .dispense(dispense));
    initial clk = 0; always #5 clk = ~clk;
    initial begin
        $dumpfile("wave.vcd");
        $dumpvars(0, tb_h5);
        reset = 1; @(posedge clk); reset = 0; @(posedge clk);
        coin5 = 1; coin10 = 0; @(posedge clk);
        coin5 = 0; coin10 = 1; @(posedge clk); if (dispense !== 1) $finish;
        reset = 1; @(posedge clk);
        reset = 0; @(posedge clk);
        coin5 = 0; coin10 = 1; @(posedge clk);
        coin5 = 1; coin10 = 0; @(posedge clk); if (dispense !== 1) $finish;
        $display("ALL TESTS PASSED");
        $finish;
    end
endmodule
`,
      expected: "ALL TESTS PASSED",
      weight: 16
    }
  ],
  
  xpReward: 500,
  estimatedMin: 35
},

{
  id: "arena-fsm-009",
  slug: "toggle-on-110-lsb-first",
  title: "Toggle Output on Detection of 110 (LSB First)",
  category: "FSM",
  difficulty: "Expert",
  tags: ["mealy-fsm", "toggle-logic", "lsb-first", "overlapping-detection"],
  
  statement: `# Toggle Output on Detection of 110 (LSB First)

Design a finite-state machine that monitors a serial input stream and **toggles its output** whenever the bit pattern **110** is detected.

## Key Concept: LSB First

The pattern is transmitted **LSB first**, meaning the bits arrive in the order:
\`\`\`
0 → 1 → 1
\`\`\`

Therefore the FSM effectively detects the **serial sequence 011**.

Overlapping occurrences **must be detected**.

## Output Behavior

The output is **initialized to 0**.

Whenever a pattern occurrence is found:
\`\`\`
y ← ~y
\`\`\`

Otherwise the output **retains its previous value**.

## Interface

| Port  | Direction | Description           |
|-------|-----------|----------------------|
| clk   | input     | Rising-edge clock     |
| reset | input     | Synchronous reset     |
| din   | input     | Serial input bit      |
| y     | output    | Toggle output         |

## Behavior

**Initial condition:**
\`\`\`
y = 0
\`\`\`

**Pattern to detect (serial):**
\`\`\`
011
\`\`\`
(which is 110 in normal bit order, transmitted LSB first)

**When detected:**
\`\`\`
y = ~y
\`\`\`

Overlapping patterns must be supported.

## Examples

### Example 1
Input: \`011011\`

Pattern occurrences:
\`\`\`
011 (positions 0-2)
   011 (positions 3-5)
\`\`\`

Output (\`y\` value sampled after each cycle):
\`\`\`
000111
\`\`\`

Explanation:
* Cycles 1-3: y=0, accumulating pattern, detection at cycle 3 toggles y→1
* Cycles 4-6: y=1 initially, accumulating new pattern, detection at cycle 6 toggles y→0

### Example 2
Input: \`011011011\`

Pattern occurrences at cycles 3, 6, 9.

Output transitions:
\`\`\`
0 → 1 → 0 → 1
\`\`\`

Final output: **1** (after third toggle)

## State Design

Each state encodes:
1. **Pattern matching progress**: How much of "011" has been matched
   * None (0 bits matched)
   * "0" (1 bit matched)
   * "01" (2 bits matched)

2. **Current output value**: 0 or 1

This gives **3 × 2 = 6 states**:
\`\`\`
S0: pattern=none, y=0
S1: pattern="0", y=0
S2: pattern="01", y=0
S3: pattern=none, y=1
S4: pattern="0", y=1
S5: pattern="01", y=1
\`\`\`

When the full pattern "011" is matched:
* Output toggles: y = ~y
* Pattern resets to "none"
* Transition to state matching new y value

## Constraints

* Implement as a **Mealy FSM** (output depends on state AND input)
* Use \`always @(posedge clk)\` for state transitions
* Synchronous active-high reset
* Non-blocking assignments (\`<=\`) required
* Pattern is LSB first: arrives as 0→1→1
* Output toggles, not pulses
* Overlapping patterns must be detected
* Minimize states (6 states sufficient)

## FSM Hint 🔒

Separate the FSM memory into two parts:

1. **Pattern matching progress:**
   * none: no bits matched
   * 0: "0" matched
   * 01: "01" matched

2. **Current output value:**
   * 0 or 1

Combining gives 3 × 2 = 6 states total.

When pattern "011" is complete:
* Toggle output: y ← ~y
* Reset pattern to "none"
* Move to state with same pattern progress but toggled output
`,
  
  examples: [
    {
      input: "011011",
      output: "000111",
      explanation: "Two overlapping detections, y toggles each time"
    },
    {
      input: "011011011",
      output: "000111000",
      explanation: "Three detections, final y=1 after toggling three times"
    }
  ],
  
  constraints: [
    "Mealy FSM: output depends on state and input",
    "Minimize states (6 sufficient)",
    "Pattern transmitted LSB first (011 serial)",
    "Output toggles on pattern detection",
    "Overlapping patterns must be detected",
    "Use always @(posedge clk)",
    "Synchronous active-high reset",
    "Non-blocking assignments (<=) required"
  ],
  
  starterCode: `\`timescale 1ns / 1ps

module toggle_110_detector(
    input clk,
    input reset,
    input din,
    output reg y
);
    // Declare state registers for pattern matching + output tracking
    
    // Next-state logic based on current state and input
    
    // Sequential state update and output toggle on pattern detection
    
endmodule
`,
  
  testbenchSkeleton: `\`timescale 1ns / 1ps

module tb_toggle_110_detector;
    reg clk, reset, din;
    wire y;
    
    toggle_110_detector dut (
        .clk(clk),
        .reset(reset),
        .din(din),
        .y(y)
    );
    
    initial clk = 0;
    always #5 clk = ~clk;
    
    initial begin
        $dumpfile("wave.vcd");
        $dumpvars(0, tb_toggle_110_detector);
        
        // Write your test cases here
        // Test: overlapping patterns, toggle behavior, reset
        // Remember: pattern is 011 (LSB first = 110 normal order)
        
        $finish;
    end
endmodule
`,
  
  hiddenTestcases: [
    {
      id: "tc-1",
      description: "Single pattern 011",
      testbench: `\`timescale 1ns / 1ps
module tb_h1;
    reg clk, reset, din;
    wire y;
    toggle_110_detector dut (.clk(clk), .reset(reset), .din(din), .y(y));
    initial clk = 0; always #5 clk = ~clk;
    initial begin
        $dumpfile("wave.vcd");
        $dumpvars(0, tb_h1);
        reset = 1; @(posedge clk); reset = 0; @(posedge clk);
        din = 0; @(posedge clk); if (y !== 0) $finish;
        din = 1; @(posedge clk); if (y !== 0) $finish;
        din = 1; @(posedge clk); if (y !== 1) $finish;
        $display("ALL TESTS PASSED");
        $finish;
    end
endmodule
`,
      expected: "ALL TESTS PASSED",
      weight: 16
    },
    {
      id: "tc-2",
      description: "Two consecutive patterns 011011",
      testbench: `\`timescale 1ns / 1ps
module tb_h2;
    reg clk, reset, din;
    wire y;
    toggle_110_detector dut (.clk(clk), .reset(reset), .din(din), .y(y));
    initial clk = 0; always #5 clk = ~clk;
    initial begin
        $dumpfile("wave.vcd");
        $dumpvars(0, tb_h2);
        reset = 1; @(posedge clk); reset = 0; @(posedge clk);
        din = 0; @(posedge clk); if (y !== 0) $finish;
        din = 1; @(posedge clk); if (y !== 0) $finish;
        din = 1; @(posedge clk); if (y !== 1) $finish;
        din = 0; @(posedge clk); if (y !== 1) $finish;
        din = 1; @(posedge clk); if (y !== 1) $finish;
        din = 1; @(posedge clk); if (y !== 0) $finish;
        $display("ALL TESTS PASSED");
        $finish;
    end
endmodule
`,
      expected: "ALL TESTS PASSED",
      weight: 18
    },
    {
      id: "tc-3",
      description: "Three patterns 011011011",
      testbench: `\`timescale 1ns / 1ps
module tb_h3;
    reg clk, reset, din;
    wire y;
    toggle_110_detector dut (.clk(clk), .reset(reset), .din(din), .y(y));
    initial clk = 0; always #5 clk = ~clk;
    initial begin
        $dumpfile("wave.vcd");
        $dumpvars(0, tb_h3);
        reset = 1; @(posedge clk); reset = 0; @(posedge clk);
        din = 0; @(posedge clk);
        din = 1; @(posedge clk);
        din = 1; @(posedge clk); if (y !== 1) $finish;
        din = 0; @(posedge clk);
        din = 1; @(posedge clk);
        din = 1; @(posedge clk); if (y !== 0) $finish;
        din = 0; @(posedge clk);
        din = 1; @(posedge clk);
        din = 1; @(posedge clk); if (y !== 1) $finish;
        $display("ALL TESTS PASSED");
        $finish;
    end
endmodule
`,
      expected: "ALL TESTS PASSED",
      weight: 20
    },
    {
      id: "tc-4",
      description: "No pattern match 010010",
      testbench: `\`timescale 1ns / 1ps
module tb_h4;
    reg clk, reset, din;
    wire y;
    toggle_110_detector dut (.clk(clk), .reset(reset), .din(din), .y(y));
    initial clk = 0; always #5 clk = ~clk;
    initial begin
        $dumpfile("wave.vcd");
        $dumpvars(0, tb_h4);
        reset = 1; @(posedge clk); reset = 0; @(posedge clk);
        din = 0; @(posedge clk);
        din = 1; @(posedge clk);
        din = 0; @(posedge clk); if (y !== 0) $finish;
        din = 0; @(posedge clk);
        din = 1; @(posedge clk);
        din = 0; @(posedge clk); if (y !== 0) $finish;
        $display("ALL TESTS PASSED");
        $finish;
    end
endmodule
`,
      expected: "ALL TESTS PASSED",
      weight: 16
    },
    {
      id: "tc-5",
      description: "Reset clears output, new pattern detected",
      testbench: `\`timescale 1ns / 1ps
module tb_h5;
    reg clk, reset, din;
    wire y;
    toggle_110_detector dut (.clk(clk), .reset(reset), .din(din), .y(y));
    initial clk = 0; always #5 clk = ~clk;
    initial begin
        $dumpfile("wave.vcd");
        $dumpvars(0, tb_h5);
        reset = 1; @(posedge clk); reset = 0; @(posedge clk);
        din = 0; @(posedge clk);
        din = 1; @(posedge clk);
        din = 1; @(posedge clk); if (y !== 1) $finish;
        reset = 1; @(posedge clk);
        if (y !== 0) $finish;
        reset = 0; @(posedge clk);
        din = 0; @(posedge clk);
        din = 1; @(posedge clk);
        din = 1; @(posedge clk); if (y !== 1) $finish;
        $display("ALL TESTS PASSED");
        $finish;
    end
endmodule
`,
      expected: "ALL TESTS PASSED",
      weight: 16
    }
  ],
  
  xpReward: 600,
  estimatedMin: 40
},


{
  id: "arena-fsm-010",
  slug: "three-consecutive-heads",
  title: "Three Consecutive Heads Detector",
  category: "FSM",
  difficulty: "Easy",
  tags: ["moore-fsm", "counter", "pattern-detection", "coin-toss"],
  
  statement: `# Three Consecutive Heads Detector

A fair coin is tossed once every clock cycle.

Design a finite-state machine that detects when **three consecutive tosses result in Heads (H)**.

The output should become **high when three consecutive heads have occurred**.

If another Head arrives, the output should **remain high**.

Any **Tail resets the count** of consecutive heads.

## Interface

| Port  | Direction | Description                              |
|-------|-----------|------------------------------------------|
| clk   | input     | Rising-edge clock                        |
| reset | input     | Synchronous active-high reset            |
| toss  | input     | Coin result (1=Head, 0=Tail)             |
| y     | output    | High when ≥3 consecutive Heads occurred  |

## Input Alphabet

* **H = 1** (Heads)
* **T = 0** (Tails)

## Output Behavior

\`\`\`
y = 1  iff three or more consecutive heads have occurred
\`\`\`

Any tail **clears the count** and resets to 0.

## Examples

### Example 1
Input: \`H, H, H\`

Explanation:
* Toss 1 (H): 1 head so far → y=0
* Toss 2 (H): 2 heads so far → y=0
* Toss 3 (H): 3 heads! → y=1

Output: \`0, 0, 1\`

### Example 2
Input: \`H, H, H, H\`

Explanation:
* After 3 heads: y=1
* Another head arrives: y stays 1 (still ≥3 consecutive)

Output: \`0, 0, 1, 1\`

### Example 3
Input: \`H, H, T, H, H, H\`

Explanation:
* Tosses 1-2: 2 heads → y=0
* Toss 3 (T): Tail resets count → y=0
* Tosses 4-5: 2 heads again → y=0
* Toss 6 (H): 3 heads reached → y=1

Output: \`0, 0, 0, 0, 0, 1\`

## Constraints

* Implement a **Moore FSM** (output depends only on state)
* Use \`always @(posedge clk)\` for state transitions
* Synchronous active-high reset
* Non-blocking assignments (\`<=\`) required
* Overlapping sequences naturally supported
* Minimize the number of states (4 sufficient)

## State Model

Think of the states as representing the number of **consecutive heads**:

* **S0**: 0 consecutive heads → y=0
* **S1**: 1 consecutive head → y=0
* **S2**: 2 consecutive heads → y=0
* **S3**: 3 or more consecutive heads → y=1

## Transitions

| Current State | Input | Next State | Output |
|---|---|---|---|
| S0 (0 heads) | H | S1 | 0 |
| S0 (0 heads) | T | S0 | 0 |
| S1 (1 head) | H | S2 | 0 |
| S1 (1 head) | T | S0 | 0 |
| S2 (2 heads) | H | S3 | 0 |
| S2 (2 heads) | T | S0 | 0 |
| S3 (3+ heads) | H | S3 | 1 |
| S3 (3+ heads) | T | S0 | 1 |

Note: The output shown is the **current output** (Moore); it updates after the state transition takes effect.

## FSM Hint 🔒

Think of each state as counting consecutive heads:
* S0 = 0 heads seen
* S1 = 1 head seen
* S2 = 2 heads seen
* S3 = 3 or more heads seen

A tail in any state resets to S0.
A head advances to the next state.

Only **4 states** required.
`,
  
  examples: [
    {
      input: "1,1,1",
      output: "0,0,1",
      explanation: "Three consecutive heads detected"
    },
    {
      input: "1,1,1,1",
      output: "0,0,1,1",
      explanation: "After 3 heads, additional heads keep output high"
    },
    {
      input: "1,1,0,1,1,1",
      output: "0,0,0,0,0,1",
      explanation: "Tail resets count, then three new heads detected"
    }
  ],
  
  constraints: [
    "Moore FSM: output depends only on state",
    "Use always @(posedge clk) for transitions",
    "Synchronous active-high reset",
    "Non-blocking assignments (<=) required",
    "Tail resets the consecutive head count",
    "Overlapping sequences naturally supported",
    "Minimize states (4 sufficient)"
  ],
  
  starterCode: `\`timescale 1ns / 1ps

module three_heads_detector(
    input clk,
    input reset,
    input toss,
    output y
);
    // Declare state registers
    
    // Moore output logic
    
    // Next-state logic
    
    // Sequential state update
    
endmodule
`,
  
  testbenchSkeleton: `\`timescale 1ns / 1ps

module tb_three_heads_detector;
    reg clk, reset, toss;
    wire y;
    
    three_heads_detector dut (
        .clk(clk),
        .reset(reset),
        .toss(toss),
        .y(y)
    );
    
    initial clk = 0;
    always #5 clk = ~clk;
    
    initial begin
        $dumpfile("wave.vcd");
        $dumpvars(0, tb_three_heads_detector);
        
        // Write your test cases here
        // Test: three consecutive heads, continued heads, tail reset
        // Remember: 1=Head, 0=Tail
        
        $finish;
    end
endmodule
`,
  
  hiddenTestcases: [
    {
      id: "tc-1",
      description: "Simple HHH",
      testbench: `\`timescale 1ns / 1ps
module tb_h1;
    reg clk, reset, toss;
    wire y;
    three_heads_detector dut (.clk(clk), .reset(reset), .toss(toss), .y(y));
    initial clk = 0; always #5 clk = ~clk;
    initial begin
        $dumpfile("wave.vcd");
        $dumpvars(0, tb_h1);
        reset = 1; @(posedge clk); reset = 0; @(posedge clk);
        toss = 1; @(posedge clk); if (y !== 0) $finish;
        toss = 1; @(posedge clk); if (y !== 0) $finish;
        toss = 1; @(posedge clk); if (y !== 1) $finish;
        $display("ALL TESTS PASSED");
        $finish;
    end
endmodule
`,
      expected: "ALL TESTS PASSED",
      weight: 16
    },
    {
      id: "tc-2",
      description: "HHHH: continues with H after detection",
      testbench: `\`timescale 1ns / 1ps
module tb_h2;
    reg clk, reset, toss;
    wire y;
    three_heads_detector dut (.clk(clk), .reset(reset), .toss(toss), .y(y));
    initial clk = 0; always #5 clk = ~clk;
    initial begin
        $dumpfile("wave.vcd");
        $dumpvars(0, tb_h2);
        reset = 1; @(posedge clk); reset = 0; @(posedge clk);
        toss = 1; @(posedge clk); if (y !== 0) $finish;
        toss = 1; @(posedge clk); if (y !== 0) $finish;
        toss = 1; @(posedge clk); if (y !== 1) $finish;
        toss = 1; @(posedge clk); if (y !== 1) $finish;
        $display("ALL TESTS PASSED");
        $finish;
    end
endmodule
`,
      expected: "ALL TESTS PASSED",
      weight: 16
    },
    {
      id: "tc-3",
      description: "HHTHHH: tail resets counter",
      testbench: `\`timescale 1ns / 1ps
module tb_h3;
    reg clk, reset, toss;
    wire y;
    three_heads_detector dut (.clk(clk), .reset(reset), .toss(toss), .y(y));
    initial clk = 0; always #5 clk = ~clk;
    initial begin
        $dumpfile("wave.vcd");
        $dumpvars(0, tb_h3);
        reset = 1; @(posedge clk); reset = 0; @(posedge clk);
        toss = 1; @(posedge clk); if (y !== 0) $finish;
        toss = 1; @(posedge clk); if (y !== 0) $finish;
        toss = 0; @(posedge clk); if (y !== 0) $finish;
        toss = 1; @(posedge clk); if (y !== 0) $finish;
        toss = 1; @(posedge clk); if (y !== 0) $finish;
        toss = 1; @(posedge clk); if (y !== 1) $finish;
        $display("ALL TESTS PASSED");
        $finish;
    end
endmodule
`,
      expected: "ALL TESTS PASSED",
      weight: 18
    },
    {
      id: "tc-4",
      description: "HHTHHTHHH: multiple resets",
      testbench: `\`timescale 1ns / 1ps
module tb_h4;
    reg clk, reset, toss;
    wire y;
    three_heads_detector dut (.clk(clk), .reset(reset), .toss(toss), .y(y));
    initial clk = 0; always #5 clk = ~clk;
    initial begin
        $dumpfile("wave.vcd");
        $dumpvars(0, tb_h4);
        reset = 1; @(posedge clk); reset = 0; @(posedge clk);
        toss = 1; @(posedge clk);
        toss = 1; @(posedge clk);
        toss = 0; @(posedge clk); if (y !== 0) $finish;
        toss = 1; @(posedge clk);
        toss = 1; @(posedge clk);
        toss = 0; @(posedge clk); if (y !== 0) $finish;
        toss = 1; @(posedge clk);
        toss = 1; @(posedge clk);
        toss = 1; @(posedge clk); if (y !== 1) $finish;
        $display("ALL TESTS PASSED");
        $finish;
    end
endmodule
`,
      expected: "ALL TESTS PASSED",
      weight: 18
    },
    {
      id: "tc-5",
      description: "Reset clears output: HHH, reset, HHH",
      testbench: `\`timescale 1ns / 1ps
module tb_h5;
    reg clk, reset, toss;
    wire y;
    three_heads_detector dut (.clk(clk), .reset(reset), .toss(toss), .y(y));
    initial clk = 0; always #5 clk = ~clk;
    initial begin
        $dumpfile("wave.vcd");
        $dumpvars(0, tb_h5);
        reset = 1; @(posedge clk); reset = 0; @(posedge clk);
        toss = 1; @(posedge clk);
        toss = 1; @(posedge clk);
        toss = 1; @(posedge clk); if (y !== 1) $finish;
        reset = 1; @(posedge clk);
        if (y !== 0) $finish;
        reset = 0; @(posedge clk);
        toss = 1; @(posedge clk);
        toss = 1; @(posedge clk);
        toss = 1; @(posedge clk); if (y !== 1) $finish;
        $display("ALL TESTS PASSED");
        $finish;
    end
endmodule
`,
      expected: "ALL TESTS PASSED",
      weight: 16
    }
  ],
  
  xpReward: 300,
  estimatedMin: 20
},


{
  id: "arena-fsm-011",
  slug: "binary-divisibility-by-3",
  title: "Binary Divisibility by 3 Detector",
  category: "FSM",
  difficulty: "Hard",
  tags: ["moore-fsm", "modular-arithmetic", "divisibility", "serial-binary"],
  
  statement: `# Binary Divisibility by 3 Detector

A serial bit stream arrives **one bit per clock cycle (MSB first)**.

Design an FSM whose output becomes **high whenever the binary number formed by all bits received so far is divisible by 3**.

The output should reflect divisibility **after every new bit arrives**.

## Interface

| Port  | Direction | Description                                    |
|-------|-----------|------------------------------------------------|
| clk   | input     | Rising-edge clock                              |
| reset | input     | Synchronous active-high reset                  |
| din   | input     | Serial input bit                               |
| y     | output    | High when accumulated number divisible by 3    |

## Examples

### Example 1
Input stream: \`1, 1, 0, 1\`

Binary numbers formed:
* After bit 1: \`1\` (decimal 1)
* After bit 1: \`11\` (decimal 3)
* After bit 0: \`110\` (decimal 6)
* After bit 1: \`1101\` (decimal 13)

Divisibility by 3:
* 1 mod 3 = 1 (not divisible) → y = 0
* 3 mod 3 = 0 (divisible) → y = 1
* 6 mod 3 = 0 (divisible) → y = 1
* 13 mod 3 = 1 (not divisible) → y = 0

Output: \`0, 1, 1, 0\`

### Example 2
Input stream: \`1, 0, 0, 1\`

Binary numbers formed:
* After bit 1: \`1\` (decimal 1)
* After bit 0: \`10\` (decimal 2)
* After bit 0: \`100\` (decimal 4)
* After bit 1: \`1001\` (decimal 9)

Divisibility by 3:
* 1 mod 3 = 1 → y = 0
* 2 mod 3 = 2 → y = 0
* 4 mod 3 = 1 → y = 0
* 9 mod 3 = 0 → y = 1

Output: \`0, 0, 0, 1\`

## Mathematical Foundation

When a new bit \`b\` arrives, the decimal value of the accumulated binary number becomes:
\`\`\`
new_number = old_number * 2 + b
\`\`\`

To check divisibility by 3, we only need to track:
\`\`\`
new_number mod 3 = (old_number * 2 + b) mod 3
                 = ((old_number mod 3) * 2 + b) mod 3
\`\`\`

This means we only need to remember the **remainder when divided by 3**, which has only 3 possible values:
* 0: number is divisible by 3
* 1: remainder is 1
* 2: remainder is 2

## State Transitions

| Current Remainder | Input Bit | Calculation | New Remainder |
|---|---|---|---|
| 0 | 0 | (0×2+0) mod 3 = 0 | 0 |
| 0 | 1 | (0×2+1) mod 3 = 1 | 1 |
| 1 | 0 | (1×2+0) mod 3 = 2 | 2 |
| 1 | 1 | (1×2+1) mod 3 = 0 | 0 |
| 2 | 0 | (2×2+0) mod 3 = 1 | 1 |
| 2 | 1 | (2×2+1) mod 3 = 2 | 2 |

## Constraints

* Implement a **Moore FSM** (output depends only on state)
* Use \`always @(posedge clk)\` for state transitions
* Synchronous active-high reset
* Non-blocking assignments (\`<=\`) required
* Input stream is **MSB first** (most significant bit first)
* **Minimize the number of states** (only 3 required!)

## FSM States

* **S0**: Remainder = 0 (divisible by 3) → y = 1
* **S1**: Remainder = 1 → y = 0
* **S2**: Remainder = 2 → y = 0

## Reset Behavior

Reset initializes the FSM to represent the number 0, which is divisible by 3:
\`\`\`
reset → S0 (remainder 0) → y = 1
\`\`\`

## FSM Hint 🔒

Instead of remembering the entire number, remember only:
\`\`\`
(number mod 3)
\`\`\`

Possible remainder values are:
* 0: divisible by 3
* 1: remainder 1
* 2: remainder 2

This gives exactly **3 states**.

When a new bit arrives, compute:
\`\`\`
new_remainder = (old_remainder * 2 + bit) mod 3
\`\`\`

The output is simply:
\`\`\`
y = 1 if remainder == 0, else y = 0
\`\`\`
`,
  
  examples: [
    {
      input: "1,1,0,1",
      output: "0,1,1,0",
      explanation: "Numbers: 1(not div), 3(div), 6(div), 13(not div)"
    },
    {
      input: "1,0,0,1",
      output: "0,0,0,1",
      explanation: "Numbers: 1, 2, 4, 9(div by 3)"
    }
  ],
  
  constraints: [
    "Moore FSM: output depends only on state",
    "Use always @(posedge clk) for transitions",
    "Synchronous active-high reset",
    "Non-blocking assignments (<=) required",
    "MSB-first input stream",
    "Track remainder (number mod 3)",
    "Only 3 states required"
  ],
  
  starterCode: `\`timescale 1ns / 1ps

module divisibility_by_3(
    input clk,
    input reset,
    input din,
    output y
);
    // Declare state registers to track (number mod 3)
    
    // Moore output logic
    
    // Next-state logic based on transition table
    
    // Sequential state update
    
endmodule
`,
  
  testbenchSkeleton: `\`timescale 1ns / 1ps

module tb_divisibility_by_3;
    reg clk, reset, din;
    wire y;
    
    divisibility_by_3 dut (
        .clk(clk),
        .reset(reset),
        .din(din),
        .y(y)
    );
    
    initial clk = 0;
    always #5 clk = ~clk;
    
    initial begin
        $dumpfile("wave.vcd");
        $dumpvars(0, tb_divisibility_by_3);
        
        // Write your test cases here
        // Test: sequences that form numbers divisible by 3
        // Test: reset behavior
        // Remember: MSB first, track remainder mod 3
        
        $finish;
    end
endmodule
`,
  
  hiddenTestcases: [
    {
      id: "tc-1",
      description: "1,1,0,1 -> [1,3,6,13]",
      testbench: `\`timescale 1ns / 1ps
module tb_h1;
    reg clk, reset, din;
    wire y;
    divisibility_by_3 dut (.clk(clk), .reset(reset), .din(din), .y(y));
    initial clk = 0; always #5 clk = ~clk;
    initial begin
        $dumpfile("wave.vcd");
        $dumpvars(0, tb_h1);
        reset = 1; @(posedge clk); reset = 0; @(posedge clk);
        din = 1; @(posedge clk); if (y !== 0) $finish;
        din = 1; @(posedge clk); if (y !== 1) $finish;
        din = 0; @(posedge clk); if (y !== 1) $finish;
        din = 1; @(posedge clk); if (y !== 0) $finish;
        $display("ALL TESTS PASSED");
        $finish;
    end
endmodule
`,
      expected: "ALL TESTS PASSED",
      weight: 18
    },
    {
      id: "tc-2",
      description: "1,0,0,1 -> [1,2,4,9]",
      testbench: `\`timescale 1ns / 1ps
module tb_h2;
    reg clk, reset, din;
    wire y;
    divisibility_by_3 dut (.clk(clk), .reset(reset), .din(din), .y(y));
    initial clk = 0; always #5 clk = ~clk;
    initial begin
        $dumpfile("wave.vcd");
        $dumpvars(0, tb_h2);
        reset = 1; @(posedge clk); reset = 0; @(posedge clk);
        din = 1; @(posedge clk); if (y !== 0) $finish;
        din = 0; @(posedge clk); if (y !== 0) $finish;
        din = 0; @(posedge clk); if (y !== 0) $finish;
        din = 1; @(posedge clk); if (y !== 1) $finish;
        $display("ALL TESTS PASSED");
        $finish;
    end
endmodule
`,
      expected: "ALL TESTS PASSED",
      weight: 18
    },
    {
      id: "tc-3",
      description: "1,1 -> [1,3] both divisibility checks",
      testbench: `\`timescale 1ns / 1ps
module tb_h3;
    reg clk, reset, din;
    wire y;
    divisibility_by_3 dut (.clk(clk), .reset(reset), .din(din), .y(y));
    initial clk = 0; always #5 clk = ~clk;
    initial begin
        $dumpfile("wave.vcd");
        $dumpvars(0, tb_h3);
        reset = 1; @(posedge clk); reset = 0; @(posedge clk);
        din = 1; @(posedge clk); if (y !== 0) $finish;
        din = 1; @(posedge clk); if (y !== 1) $finish;
        $display("ALL TESTS PASSED");
        $finish;
    end
endmodule
`,
      expected: "ALL TESTS PASSED",
      weight: 16
    },
    {
      id: "tc-4",
      description: "0,1,1 -> [0,1,3] zero input handling",
      testbench: `\`timescale 1ns / 1ps
module tb_h4;
    reg clk, reset, din;
    wire y;
    divisibility_by_3 dut (.clk(clk), .reset(reset), .din(din), .y(y));
    initial clk = 0; always #5 clk = ~clk;
    initial begin
        $dumpfile("wave.vcd");
        $dumpvars(0, tb_h4);
        reset = 1; @(posedge clk); reset = 0; @(posedge clk);
        din = 0; @(posedge clk); if (y !== 1) $finish;
        din = 1; @(posedge clk); if (y !== 0) $finish;
        din = 1; @(posedge clk); if (y !== 1) $finish;
        $display("ALL TESTS PASSED");
        $finish;
    end
endmodule
`,
      expected: "ALL TESTS PASSED",
      weight: 16
    },
    {
      id: "tc-5",
      description: "Reset clears: stream, reset, new stream",
      testbench: `\`timescale 1ns / 1ps
module tb_h5;
    reg clk, reset, din;
    wire y;
    divisibility_by_3 dut (.clk(clk), .reset(reset), .din(din), .y(y));
    initial clk = 0; always #5 clk = ~clk;
    initial begin
        $dumpfile("wave.vcd");
        $dumpvars(0, tb_h5);
        reset = 1; @(posedge clk); reset = 0; @(posedge clk);
        din = 1; @(posedge clk);
        din = 1; @(posedge clk); if (y !== 1) $finish;
        reset = 1; @(posedge clk);
        if (y !== 1) $finish;
        reset = 0; @(posedge clk);
        din = 1; @(posedge clk);
        din = 0; @(posedge clk);
        din = 0; @(posedge clk); if (y !== 0) $finish;
        din = 1; @(posedge clk); if (y !== 1) $finish;
        $display("ALL TESTS PASSED");
        $finish;
    end
endmodule
`,
      expected: "ALL TESTS PASSED",
      weight: 16
    }
  ],
  
  xpReward: 550,
  estimatedMin: 35
}

];