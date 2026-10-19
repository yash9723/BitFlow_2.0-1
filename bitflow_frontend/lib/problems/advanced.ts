/**
 * lib/problems/advanced.ts — Advanced Tier Learning Path
 *
 * M11: Finite State Machines (6 problems) — Modes, Mealy, sequence detection
 * M12: Protocol Controllers (5 problems) — SPI, I²C, arbiters, FIFO, PWM
 * M14: Capstone Problems (reserved for second batch)
 *
 * Total problems in this batch: 11
 * Difficulty: all "advanced", most waveformRequired: true
 *
 * Import this into lib/problems/index.ts:
 *   import { ADVANCED_PROBLEMS } from "@/lib/problems/advanced";
 * Then add to ALL_PROBLEMS and add module defs to LEARNING_PATH.
 */

import type { Problem } from "@/lib/problem-types";

export const ADVANCED_PROBLEMS: Problem[] = [
  // ═══════════════════════════════════════════════════════════════════════════
  // M11 — FINITE STATE MACHINES: The Control Fabric
  // ═══════════════════════════════════════════════════════════════════════════

  // ─── 11.01 — Sequence Detector "1011" (Moore, Non-Overlapping) ────────────
  {
    id: "seq-detect-1011-moore", slug: "seq-detect-1011-moore",
    title: `Sequence Detector "1011" (Moore, Non-Overlapping)`,
    difficulty: "advanced", category: "state_machine",
    tags: ["FSM", "Moore", "sequence-detect", "interview"],
    learningLevel: "Verilog Advanced",
    moduleId: "mod_fsm_basics", orderIndex: 35,
    xpReward: 200, waveformRequired: true,
    expectedOutputMode: "stdout_compare",

    statement: `## Sequence Detector "1011" — Moore FSM, Non-Overlapping

Detect the 4-bit pattern **1011** in a continuous serial bit stream. Output \`y\` asserts for **exactly one clock cycle** after the complete pattern is detected, then the FSM returns to the initial idle state (non-overlapping).

**Interface**

| Port | Direction | Description                         |
|------|-----------|-------------------------------------|
| \`clk\` | input   | Clock                               |
| \`rst\` | input   | Async reset (active-high)           |
| \`x\`   | input   | Serial input bit (1 bit per cycle)  |
| \`y\`   | output  | Detection pulse (Moore, registered) |

**State Diagram:** minimum 4 states required:
- \`IDLE\`: no pattern bits seen
- \`S1\`: first \`1\` matched
- \`S10\`: \`10\` matched (when second bit is \`0\`)
- \`S101\`: \`101\` matched (when third bit is \`1\`)
- On the fourth bit, if it's \`1\`, fire output; else restart.

**Key insight (Moore vs Mealy):** Output \`y\` depends **only on the state**, not on the current input. \`y=1\` only when in the "detection state" (which appears only briefly as an intermediate state). After output asserts, FSM returns to IDLE (non-overlapping).

**Example trace:**
\`\`\`
Input stream: 1_1011_0_1011_...
y pulses:     0_0001_0_0001_...
\`\`\`

The second "1011" is detected independently; partial matches like "101" followed by "0" reset the sequence.`,

    constraints: [
      "Use a 3-block FSM design: State Register (Block 1), Next-State Logic (Block 2), Output Logic (Block 3).",
      "Output y is a registered Moore output (depends only on state).",
      "Async reset returns to IDLE state.",
      "Non-overlapping: after detecting 1011, FSM returns to IDLE, not to a state that could reuse the last bit.",
      "y is high for exactly 1 cycle; then immediately goes low.",
    ],
    examples: [
      { input: "x stream: 1, 1, 0, 1, 1", output: "y pulses on 5th bit (detect pattern)", explanation: "Pattern matched" },
      { input: "x stream: 1, 0, 1, 1, 1", output: "y pulses on 5th bit; pattern wraps", explanation: "Partial reset then match" },
      { input: "x stream: 1, 1, 1, 0, 1, 0, 1, 1", output: "y stays low; then pulses on 8th bit", explanation: "First three 1s reset; then partial match rebuilds" },
    ],
    hints: [
      { tier: 1, content: "Draw a 4-state diagram: IDLE → (x=1) → S1 → (x=0) → S10 → (x=1) → S101 → (x=1) → DETECT. From DETECT, always return to IDLE next cycle." },
      { tier: 2, content: "On any wrong bit, return to IDLE (or a partial match state if the new bit is 1 and you're mid-sequence). The simplest version resets fully on any mismatch." },
      { tier: 3, content: "```\nalways @(posedge clk) q <= next_q;\nalways @(*) begin\n  next_q = IDLE;  // default\n  case(q)\n    IDLE:   if(x) next_q = S1;\n    S1:     next_q = (x) ? S1 : S10;  // 1→S1, 0→S10\n    S10:    next_q = (x) ? S101 : IDLE;\n    S101:   next_q = (x) ? DETECT : IDLE;\n    DETECT: next_q = IDLE;\n  endcase\nend\nassign y = (q == DETECT);\n```" },
    ],
    publicTestcases: [], hiddenTestcases: [],

    starterCode: `\`timescale 1ns / 1ps

module seq_detect_1011_moore (
    input  wire clk,
    input  wire rst,
    input  wire x,
    output wire y
);

    // State encoding (you choose: binary, one-hot, etc.)
    // Minimum 4 states + 1 detection state = 5 states
    // parameter IDLE = 3'b000, S1 = 3'b001, S10 = 3'b010, S101 = 3'b011, DETECT = 3'b100;
    // OR use one-hot if you prefer
    
    reg [2:0] q, next_q;

    // Block 1: State register (sequential)
    always @(posedge clk or posedge rst) begin
        if (rst)
            q <= 3'b000;  // TODO: use your IDLE state
        else
            q <= next_q;
    end

    // Block 2: Next-state logic (combinational)
    always @(*) begin
        next_q = q;  // default: hold state
        // TODO: implement state transitions based on x and current state q
    end

    // Block 3: Output logic (combinational, Moore)
    // y is high only when in the detection state
    assign y = 1'b0;  // TODO: y = 1 when q == DETECT state

endmodule
`,

    publicTestbench: `\`timescale 1ns / 1ps
module tb_seq_detect_1011_moore;
    reg clk, rst, x;
    wire y;
    seq_detect_1011_moore dut (.clk(clk),.rst(rst),.x(x),.y(y));
    initial clk = 0;
    always #5 clk = ~clk;
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_seq_detect_1011_moore); end
    initial begin
        $display("=== Sequence Detector 1011 Moore Test ===");
        rst=1; @(posedge clk); #1; rst=0;
        // Test: 1 1 0 1 1 → detect on 5th bit
        $display("sending 1 1 0 1 1:");
        x=1; @(posedge clk); #1; $display("  bit 1: y=%b (expect 0)", y);
        x=1; @(posedge clk); #1; $display("  bit 2: y=%b (expect 0)", y);
        x=0; @(posedge clk); #1; $display("  bit 3: y=%b (expect 0)", y);
        x=1; @(posedge clk); #1; $display("  bit 4: y=%b (expect 0)", y);
        x=1; @(posedge clk); #1; $display("  bit 5: y=%b (expect 1 DETECT)", y);
        x=0; @(posedge clk); #1; $display("  bit 6: y=%b (expect 0 back to IDLE)", y);
        // Second pattern
        $display("sending 1 0 1 1:");
        x=1; @(posedge clk); #1;
        x=0; @(posedge clk); #1;
        x=1; @(posedge clk); #1;
        x=1; @(posedge clk); #1; $display("  bit 4: y=%b (expect 1 DETECT)", y);
        $finish;
    end
endmodule
`,

    hiddenTestbench: `\`timescale 1ns / 1ps
module tb_seq_detect_1011_moore_hidden;
    reg clk, rst, x;
    wire y;
    integer errors, i;
    seq_detect_1011_moore dut (.clk(clk),.rst(rst),.x(x),.y(y));
    initial clk = 0;
    always #5 clk = ~clk;
    initial begin
        errors = 0;
        rst=1; @(posedge clk); #1; rst=0;
        // Test 1: pattern at start
        $display("Test 1: 1011 at position 0");
        x=1; @(posedge clk); #1; if(y!==0) begin errors=errors+1; $display("FAIL: pos1 y=%b",y); end
        x=1; @(posedge clk); #1; if(y!==0) begin errors=errors+1; $display("FAIL: pos2 y=%b",y); end
        x=0; @(posedge clk); #1; if(y!==0) begin errors=errors+1; $display("FAIL: pos3 y=%b",y); end
        x=1; @(posedge clk); #1; if(y!==0) begin errors=errors+1; $display("FAIL: pos4 y=%b",y); end
        x=1; @(posedge clk); #1; if(y!==1) begin errors=errors+1; $display("FAIL: pos5 y=%b exp 1",y); end
        x=0; @(posedge clk); #1; if(y!==0) begin errors=errors+1; $display("FAIL: pos6 y=%b",y); end
        // Test 2: back-to-back patterns
        $display("Test 2: 1011 then 1011");
        x=1; @(posedge clk); #1;
        x=0; @(posedge clk); #1;
        x=1; @(posedge clk); #1;
        x=1; @(posedge clk); #1; if(y!==1) begin errors=errors+1; $display("FAIL: first pattern y=%b",y); end
        x=1; @(posedge clk); #1; if(y!==0) begin errors=errors+1; end
        x=0; @(posedge clk); #1; if(y!==0) begin errors=errors+1; end
        x=1; @(posedge clk); #1; if(y!==0) begin errors=errors+1; end
        x=1; @(posedge clk); #1; if(y!==1) begin errors=errors+1; $display("FAIL: second pattern y=%b",y); end
        // Test 3: partial match then reset
        $display("Test 3: 1010 (partial 101, then reset)");
        x=1; @(posedge clk); #1;
        x=0; @(posedge clk); #1;
        x=1; @(posedge clk); #1; if(y!==0) begin errors=errors+1; end
        x=0; @(posedge clk); #1; if(y!==0) begin errors=errors+1; end
        // Should be back at IDLE or early state, 1011 won't match
        x=1; @(posedge clk); #1;
        x=1; @(posedge clk); #1;
        x=0; @(posedge clk); #1;
        x=1; @(posedge clk); #1;
        x=1; @(posedge clk); #1; if(y!==1) begin errors=errors+1; $display("FAIL: recovery pattern y=%b",y); end
        if (errors == 0) $display("ALL TESTS PASSED");
        else $display("TESTS FAILED: %0d error(s)", errors);
        $finish;
    end
endmodule
`,
  },

  // ─── 11.02 — Sequence Detector "1011" (Mealy, Overlapping) ────────────────
  {
    id: "seq-detect-1011-mealy", slug: "seq-detect-1011-mealy",
    title: `Sequence Detector "1011" (Mealy, Overlapping)`,
    difficulty: "advanced", category: "state_machine",
    tags: ["FSM", "Mealy", "sequence-detect", "interview", "overlapping"],
    learningLevel: "Verilog Advanced",
    moduleId: "mod_fsm_basics", orderIndex: 36,
    xpReward: 220, waveformRequired: true,
    expectedOutputMode: "stdout_compare",

    statement: `## Sequence Detector "1011" — Mealy FSM, Overlapping

Same pattern detection as 11.01, but using a **Mealy FSM** with **overlapping** matches. The output asserts **combinationally** (same cycle as the last input bit) when the pattern is complete. Crucially, after a match, the FSM does **not** reset to IDLE — it stays in a state that allows the last bit(s) of the current match to become the start of the next match.

**Example (overlapping):**
\`\`\`
Input:  1 0 1 1 1 0 1 1
Output: 0 0 0 1 0 0 0 1
           ↑     ↑
         Matches at positions 4 and 8.
         Note position 4 matches 1011.
         Position 8 also matches 1011 — the 1 from position 4 is reused as the 1 at position 1.
\`\`\`

**Interface** (same as 11.01)

| Port | Direction | Description                |
|------|-----------|----------------------------|
| \`clk\` | input   | Clock                      |
| \`rst\` | input   | Async reset                |
| \`x\`   | input   | Serial bit                 |
| \`y\`   | output  | Detection output (Mealy)   |

**State Diagram:** 3 states minimum (vs 4+ for Moore):
- \`IDLE\`: no progress
- \`S1\`: last bit was \`1\`
- \`S10\`: last 2 bits were \`10\`
- \`S101\`: last 3 bits were \`101\`

On input \`x=1\` in state \`S101\`, output \`y=1\` **combinationally** (not registered), and **stay in S1** or a state that allows overlapping.

**Key difference from Moore:** output is **combinational from state + input**, and asserts **one cycle earlier** than Moore (in the same cycle as the 4th bit, not in a dedicated state).`,

    constraints: [
      "Use 3-block FSM: State Register, Next-State (Block 2), Output (Block 3, combinational Mealy).",
      "Output y = f(state, x) — combinational, not registered.",
      "After detecting pattern, FSM transitions to a state allowing pattern overlap (typically back to the state corresponding to the last 1 bit).",
      "y asserts for exactly 1 cycle (via combinational logic), not a dedicated state.",
    ],
    examples: [
      { input: "x: 1, 0, 1, 1", output: "y asserts on 4th clock (same cycle as 4th input)", explanation: "Mealy output is combinational" },
      { input: "x: 1, 0, 1, 1, 1, 0, 1, 1", output: "y pulses at cycles 4 and 8 (overlapping)", explanation: "Second match reuses the 1 from first match" },
    ],
    hints: [
      { tier: 1, content: "Same state diagram as Moore (IDLE, S1, S10, S101), but output logic is `assign y = (state==S101 && x==1)`. After detecting, move to the state corresponding to the new input (if x=1, go to S1)." },
      { tier: 2, content: "After match, set next_state to the state you would be in if you just saw the output-causing bit. After you output (on the 4th bit=1), that 1 becomes the start of the next potential pattern, so go to S1." },
      { tier: 3, content: "```\nalways @(*) begin\n  next_q = IDLE; // default\n  case(q)\n    IDLE:   next_q = (x) ? S1 : IDLE;\n    S1:     next_q = (x) ? S1 : S10;\n    S10:    next_q = (x) ? S101 : IDLE;\n    S101:   next_q = (x) ? S1 : S10;  // Key: after match, treat x as new input\n  endcase\nend\nassign y = (q==S101) && x;  // Mealy: combinational output\n```" },
    ],
    publicTestcases: [], hiddenTestcases: [],

    starterCode: `\`timescale 1ns / 1ps

module seq_detect_1011_mealy (
    input  wire clk,
    input  wire rst,
    input  wire x,
    output wire y
);

    reg [2:0] q, next_q;

    always @(posedge clk or posedge rst) begin
        if (rst)
            q <= 3'b000;  // TODO: use your IDLE state
        else
            q <= next_q;
    end

    always @(*) begin
        next_q = q;
        // TODO: next-state logic for overlapping Mealy FSM
    end

    // Mealy output: combinational from state and input
    assign y = 1'b0;  // TODO: y = 1 when in state S101 and x=1

endmodule
`,

    publicTestbench: `\`timescale 1ns / 1ps
module tb_seq_detect_1011_mealy;
    reg clk, rst, x;
    wire y;
    integer i;
    reg [7:0] stream = 8'b10111011;   // sent MSB first
    seq_detect_1011_mealy dut (.clk(clk),.rst(rst),.x(x),.y(y));
    initial clk = 0;
    always #5 clk = ~clk;
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_seq_detect_1011_mealy); end
    initial begin
        $display("=== Sequence Detector 1011 Mealy Overlapping Test ===");
        rst=1; x=0; @(posedge clk); #1; rst=0;
        $display("sending overlapping patterns: 10111011 (expect y=1 on bits 4 and 8)");
        for (i = 7; i >= 0; i = i - 1) begin
            x = stream[i]; #1;            // Mealy output reacts before the clock edge
            $display("bit%0d: x=%b y=%b", 8 - i, x, y);
            @(posedge clk); #1;
        end
        $finish;
    end
endmodule
`,

    hiddenTestbench: `\`timescale 1ns / 1ps
module tb_seq_detect_1011_mealy_hidden;
    reg clk, rst, x;
    wire y;
    integer errors;
    seq_detect_1011_mealy dut (.clk(clk),.rst(rst),.x(x),.y(y));
    initial clk = 0;
    always #5 clk = ~clk;
    task bit_in(input b, input expect_y, input integer n);
        begin
            x = b; #1;                       // Mealy: y reacts to x before the edge
            if (y !== expect_y) begin
                errors = errors + 1;
                $display("FAIL: bit %0d y=%b exp %b", n, y, expect_y);
            end
            @(posedge clk); #1;
        end
    endtask

    initial begin
        errors = 0;
        rst=1; x=0; @(posedge clk); #1; rst=0;
        // Overlapping: 10111011 matches at bits 4 and 8
        bit_in(1'b1, 1'b0, 1);
        bit_in(1'b0, 1'b0, 2);
        bit_in(1'b1, 1'b0, 3);
        bit_in(1'b1, 1'b1, 4);
        bit_in(1'b1, 1'b0, 5);
        bit_in(1'b0, 1'b0, 6);
        bit_in(1'b1, 1'b0, 7);
        bit_in(1'b1, 1'b1, 8);

        // A match followed by zeros: no second match
        rst=1; @(posedge clk); #1; rst=0;
        bit_in(1'b1, 1'b0, 1);
        bit_in(1'b0, 1'b0, 2);
        bit_in(1'b1, 1'b0, 3);
        bit_in(1'b1, 1'b1, 4);
        bit_in(1'b0, 1'b0, 5);
        bit_in(1'b0, 1'b0, 6);
        bit_in(1'b0, 1'b0, 7);
        bit_in(1'b0, 1'b0, 8);

        if (errors == 0) $display("ALL TESTS PASSED");
        else $display("TESTS FAILED: %0d error(s)", errors);
        $finish;
    end
endmodule
`,
  },

  // ─── 11.03 — Lemmings Controller ──────────────────────────────────────────
  {
    id: "lemmings-controller", slug: "lemmings-controller",
    title: "Lemmings Controller FSM",
    difficulty: "advanced", category: "state_machine",
    tags: ["FSM", "multi-condition", "game-logic", "interview"],
    learningLevel: "Verilog Advanced",
    moduleId: "mod_fsm_basics", orderIndex: 37,
    xpReward: 240, waveformRequired: true,
    expectedOutputMode: "stdout_compare",

    statement: `## Lemmings Controller FSM

A state machine that models a cartoon character (Lemming) with four possible behaviours, each outputting a control signal. The FSM must respond to environment inputs and remember state across transitions.

**States & Outputs**

| State       | Output Signals                         | Triggers                                   |
|-------------|----------------------------------------|--------------------------------------------|
| WALK_L      | \`walk_l=1, walk_r=0, aaah=0, digging=0\` | walking left (default)                    |
| WALK_R      | \`walk_l=0, walk_r=1, aaah=0, digging=0\` | walking right                             |
| FALL        | \`walk_l=0, walk_r=0, aaah=1, digging=0\` | in air (ground=0)                         |
| DIG         | \`walk_l=0, walk_r=0, aaah=0, digging=1\` | digging (manual action)                    |

**Transition Rules**

1. **Direction reversal:** \`bump_left\` signal → reverse direction (WALK_L ↔ WALK_R)
2. **Falling:** \`ground=0\` → enter FALL state (suspend current walk direction)
3. **Landing:** \`ground=1\` in FALL state → resume previous walk direction (must remember which!)
4. **Digging:** \`dig=1\` while walking → enter DIG state
5. **Resume:** \`dig=0\` or \`ground=0\` (falling while digging) → exit DIG, resume walk
6. **Bump priority:** bump signals override normal movement (test priority carefully)

**Inputs**

| Port        | Type | Desc                                         |
|-------------|------|----------------------------------------------|
| \`clk\`       | 1b   | Clock                                        |
| \`rst\`       | 1b   | Sync reset → WALK_L                          |
| \`ground\`    | 1b   | 1=on ground, 0=in air (no gravity sim)       |
| \`bump_left\` | 1b   | Hit left wall: reverse direction             |
| \`bump_right\`| 1b   | Hit right wall: reverse direction            |
| \`dig\`       | 1b   | Start digging (toggle action)                |

**Outputs**

\`walk_l, walk_r, aaah (falling), digging\` (all 1-bit registered)

**Key insight:** This tests **state retention** (remembering walk direction across a fall), **priority** (ground takes precedence), and **multi-input conditioning** (all three inputs must be checked simultaneously).`,

    constraints: [
      "Use at least 6 states: WALK_L, WALK_R, FALL, FALL_L (falling but was walking left), FALL_R (falling but was walking right), DIG.",
      "Falling (ground=0) takes priority — immediately transition to FALL state regardless of walk direction.",
      "Landing (ground=1 after fall) must resume the walk direction that was active before the fall.",
      "Bumps reverse walk direction immediately; if falling, change the \"next walk\" direction.",
      "Digging ends on any of: dig=0 (manual cancel), ground=0 (fall during dig), or bump signals.",
    ],
    examples: [
      { input: "WALK_R, then bump_left=1", output: "→ WALK_L", explanation: "Direction reversal" },
      { input: "WALK_R, ground=0", output: "→ FALL (was walking right)", explanation: "Fall while walking" },
      { input: "FALL (was right), ground=1", output: "→ WALK_R", explanation: "Resume correct direction after landing" },
      { input: "WALK_L, dig=1", output: "→ DIG", explanation: "Start digging" },
      { input: "DIG, ground=0", output: "→ FALL (was walking left)", explanation: "Fall cancels dig; resume left on land" },
    ],
    hints: [
      { tier: 1, content: "Design states: WALK_L, WALK_R, DIG, FALL, and two sub-states FALL_L, FALL_R to remember the walk direction during the fall." },
      { tier: 2, content: "Transition priority: (1) if ground=0, go to FALL or FALL_L/FALL_R; (2) if ground=1 and in FALL state, return to remembered walk; (3) if bump, toggle walk direction; (4) if dig, enter DIG." },
      { tier: 3, content: "```\nif (!ground) next_state = (walk_dir==LEFT) ? FALL_L : FALL_R;\nelse if (ground && (state==FALL_L || state==FALL_R)) next_state = (state==FALL_L) ? WALK_L : WALK_R;\nelse if (bump_left || bump_right) next_state = (next_dir==LEFT) ? WALK_L : WALK_R;  // toggle walk_dir\nelse if (dig && (state==WALK_L || state==WALK_R)) next_state = DIG;\n```" },
    ],
    publicTestcases: [], hiddenTestcases: [],

    starterCode: `\`timescale 1ns / 1ps

module lemmings_controller (
    input  wire clk,
    input  wire rst,
    input  wire ground,
    input  wire bump_left,
    input  wire bump_right,
    input  wire dig,
    output reg  walk_l,
    output reg  walk_r,
    output reg  aaah,
    output reg  digging
);

    // State encoding
    localparam WALK_L = 3'd0, WALK_R = 3'd1, DIG = 3'd2;
    localparam FALL = 3'd3, FALL_L = 3'd4, FALL_R = 3'd5;
    
    reg [2:0] state, next_state;

    always @(posedge clk) begin
        if (rst)
            state <= WALK_L;
        else
            state <= next_state;
    end

    always @(*) begin
        next_state = state;  // default: hold state
        // TODO: implement state transitions and priority logic
    end

    always @(*) begin
        // Default: all outputs off
        walk_l  = 0;
        walk_r  = 0;
        aaah    = 0;
        digging = 0;
        
        case(state)
            WALK_L: begin walk_l = 1; end
            WALK_R: begin walk_r = 1; end
            DIG:    begin digging = 1; end
            FALL, FALL_L, FALL_R: begin aaah = 1; end
        endcase
    end

endmodule
`,

    publicTestbench: `\`timescale 1ns / 1ps
module tb_lemmings_controller;
    reg clk, rst, ground, bump_left, bump_right, dig;
    wire walk_l, walk_r, aaah, digging;
    lemmings_controller dut (.clk(clk),.rst(rst),.ground(ground),
                             .bump_left(bump_left),.bump_right(bump_right),.dig(dig),
                             .walk_l(walk_l),.walk_r(walk_r),.aaah(aaah),.digging(digging));
    initial clk = 0;
    always #5 clk = ~clk;
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_lemmings_controller); end
    initial begin
        $display("=== Lemmings Controller Test ===");
        rst=1; ground=1; bump_left=0; bump_right=0; dig=0; @(posedge clk); #1; rst=0;
        $display("after reset: walk_l=%b walk_r=%b", walk_l, walk_r);
        // Bump left → reverse to WALK_L
        bump_left=1; @(posedge clk); #1; bump_left=0;
        $display("after bump_left: walk_l=%b walk_r=%b (expect 1 0)", walk_l, walk_r);
        // Walk right → ground=0 (fall)
        bump_right=1; @(posedge clk); #1; bump_right=0;
        @(posedge clk); #1; $display("now walking right: walk_r=%b", walk_r);
        ground=0; @(posedge clk); #1;
        $display("ground=0 (fall): aaah=%b", aaah);
        ground=1; @(posedge clk); #1;
        $display("land (ground=1): walk_r=%b (expect 1, resumed)", walk_r);
        // Start digging
        dig=1; @(posedge clk); #1;
        $display("dig=1: digging=%b", digging);
        dig=0; @(posedge clk); #1;
        $display("dig=0: walk_r=%b (resume walk)", walk_r);
        $finish;
    end
endmodule
`,

    hiddenTestbench: `\`timescale 1ns / 1ps
module tb_lemmings_controller_hidden;
    reg clk, rst, ground, bump_left, bump_right, dig;
    wire walk_l, walk_r, aaah, digging;
    integer errors;
    lemmings_controller dut (.clk(clk),.rst(rst),.ground(ground),
                             .bump_left(bump_left),.bump_right(bump_right),.dig(dig),
                             .walk_l(walk_l),.walk_r(walk_r),.aaah(aaah),.digging(digging));
    initial clk = 0;
    always #5 clk = ~clk;
    initial begin
        errors = 0;
        rst=1; ground=1; bump_left=0; bump_right=0; dig=0; @(posedge clk); #1; rst=0;
        // Reset → WALK_L
        if (walk_l!==1 || walk_r!==0) begin errors=errors+1; $display("FAIL: reset walk_l=%b walk_r=%b",walk_l,walk_r); end
        // Bump right → WALK_R
        bump_right=1; @(posedge clk); #1; bump_right=0;
        if (walk_r!==1 || walk_l!==0) begin errors=errors+1; $display("FAIL: bump_right"); end
        // Fall while walking right
        ground=0; @(posedge clk); #1;
        if (aaah!==1) begin errors=errors+1; $display("FAIL: fall aaah=%b",aaah); end
        // Land → resume WALK_R
        ground=1; @(posedge clk); #1;
        if (walk_r!==1 || aaah!==0) begin errors=errors+1; $display("FAIL: land walk_r=%b aaah=%b",walk_r,aaah); end
        // Bump left → WALK_L
        bump_left=1; @(posedge clk); #1; bump_left=0;
        if (walk_l!==1 || walk_r!==0) begin errors=errors+1; end
        // Dig
        dig=1; @(posedge clk); #1;
        if (digging!==1) begin errors=errors+1; $display("FAIL: dig digging=%b",digging); end
        // Fall while digging
        ground=0; @(posedge clk); #1;
        if (aaah!==1) begin errors=errors+1; $display("FAIL: fall during dig"); end
        // Land → resume WALK_L (was walking left before dig)
        dig=0; ground=1; @(posedge clk); #1;
        if (walk_l!==1 || aaah!==0 || digging!==0) begin errors=errors+1; $display("FAIL: resume after dig fall"); end
        if (errors == 0) $display("ALL TESTS PASSED");
        else $display("TESTS FAILED: %0d error(s)", errors);
        $finish;
    end
endmodule
`,
  },

  // ─── 11.04 — PS/2 Keyboard Packet Parser ──────────────────────────────────
  {
    id: "ps2-keyboard-parser", slug: "ps2-keyboard-parser",
    title: "PS/2 Keyboard Packet Parser",
    difficulty: "advanced", category: "state_machine",
    tags: ["FSM", "PS/2", "protocol", "interview", "parity"],
    learningLevel: "Verilog Advanced",
    moduleId: "mod_fsm_basics", orderIndex: 38,
    xpReward: 250, waveformRequired: true,
    expectedOutputMode: "stdout_compare",

    statement: `## PS/2 Keyboard Packet Parser FSM

The PS/2 protocol is a **bi-directional synchronous protocol** used by legacy keyboards and mice. Your FSM must parse an 11-bit PS/2 frame:

**Frame structure (1 frame):**
\`\`\`
START bit (0) — always 0
DATA bits (8 bits, LSB first) — keyboard scan code
PARITY bit (1 bit, odd parity) — ensures odd number of 1s across data+parity
STOP bit (1) — always 1
\`\`\`

**Interface**

| Port       | Direction | Description                        |
|------------|-----------|-------------------------------------|
| \`clk\`      | input   | System clock (sampling clock)      |
| \`ps2_clk\`  | input   | PS/2 serial clock                  |
| \`ps2_data\` | input   | PS/2 data line                     |
| \`byte_out\` | output  | Decoded 8-bit scan code (reg)      |
| \`byte_valid\`| output | 1-cycle pulse on valid frame       |
| \`error\`    | output | 1-cycle pulse on parity/stop error |

**FSM Behaviour**

1. **IDLE:** Wait for START bit (ps2_data=0 on a ps2_clk edge)
2. **SHIFT (bits 0–7):** Capture 8 data bits, shifting LSB-first
3. **PARITY:** Capture parity bit; compute \`byte[8:0]\` parity (all 9 bits)
4. **STOP:** Check stop bit (must be 1)
5. **VALIDATE:** On correct parity and stop bit, assert \`byte_valid\` for 1 cycle; on error, assert \`error\` for 1 cycle
6. Return to IDLE

**Parity Check:** Sum all 9 bits (data + parity). Must be **odd** (odd number of 1s). If even, parity error.

**Error cases:**
- \`ps2_data ≠ 1\` at STOP state → \`frame_err\`
- Parity bit fails odd-parity check → \`parity_err\`
- Both reported as single \`error\` output pulse`,

    constraints: [
      "Detect ps2_clk rising edges (or falling edges, depending on design — choose one and stick with it).",
      "Shift data LSB-first into a register.",
      "Implement odd-parity check: XOR all data bits + parity bit should equal 1.",
      "Both parity and framing errors trigger a single `error` pulse; return to IDLE.",
    ],
    examples: [
      { input: "PS/2 packet: 0_10101011_1_1 (8'hAB with correct parity)", output: "byte_out=8'hAB, byte_valid=1", explanation: "Valid frame" },
      { input: "PS/2 packet: 0_10101010_0_1 (bad parity, even number of 1s)", output: "error=1", explanation: "Parity error" },
      { input: "PS/2 packet: 0_10101011_1_0 (stop bit = 0)", output: "error=1", explanation: "Framing error" },
    ],
    hints: [
      { tier: 1, content: "Detect ps2_clk edges. In SHIFT state (bits 0–7), capture ps2_data and shift. After 8 bits, move to PARITY. After parity bit, move to STOP. Check parity: `parity = ^byte[7:0] ^ parity_bit` should equal 1 for valid (odd parity)." },
      { tier: 2, content: "Use `wire parity_ok = ^(byte[7:0] | {parity_bit});` — XOR of all 9 bits. Should be 1 (odd). Frame is valid if parity_ok AND ps2_data=1 at stop." },
      { tier: 3, content: "States: IDLE, SHIFT (with shift counter mod 8), PARITY, STOP, VALIDATE. On valid: `byte_valid <= 1` for one cycle, then back to IDLE. On error: `error <= 1` for one cycle." },
    ],
    publicTestcases: [], hiddenTestcases: [],

    starterCode: `\`timescale 1ns / 1ps

module ps2_keyboard_parser (
    input  wire       clk,
    input  wire       ps2_clk,
    input  wire       ps2_data,
    output reg  [7:0] byte_out,
    output reg        byte_valid,
    output reg        error
);

    localparam IDLE = 3'd0, SHIFT = 3'd1, PARITY = 3'd2, STOP = 3'd3, VALIDATE = 3'd4;
    
    reg [2:0] state, next_state;
    reg [7:0] shift_reg;
    reg [3:0] bit_count;
    reg parity_bit;
    reg ps2_clk_prev;
    wire ps2_clk_edge = ~ps2_clk_prev & ps2_clk;  // rising edge

    always @(posedge clk) begin
        ps2_clk_prev <= ps2_clk;
        byte_valid <= 0;  // default: pulse only 1 cycle
        error <= 0;       // default: pulse only 1 cycle
        
        if (ps2_clk_edge) begin
            case(state)
                IDLE: begin
                    if (!ps2_data) begin
                        next_state = SHIFT;
                        bit_count = 0;
                    end
                end
                SHIFT: begin
                    // TODO: capture ps2_data into shift_reg, increment bit_count
                    // when bit_count == 8, move to PARITY
                end
                PARITY: begin
                    // TODO: capture parity bit, move to STOP
                end
                STOP: begin
                    // TODO: check stop bit (ps2_data should be 1)
                    // validate parity and stop bit
                    // set byte_valid or error
                    next_state = IDLE;
                end
            endcase
        end
    end

endmodule
`,

    publicTestbench: `\`timescale 1ns / 1ps
module tb_ps2_keyboard_parser;
    reg clk, ps2_clk, ps2_data;
    wire [7:0] byte_out;
    wire byte_valid, error;
    ps2_keyboard_parser dut (.clk(clk),.ps2_clk(ps2_clk),.ps2_data(ps2_data),
                             .byte_out(byte_out),.byte_valid(byte_valid),.error(error));
    initial clk = 0;
    always #5 clk = ~clk;
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_ps2_keyboard_parser); end
    task send_ps2_byte(input [7:0] byte_in);
        integer i;
        reg parity;
        $display("Sending PS/2 byte: %h", byte_in);
        parity = ^byte_in;  // odd parity
        // START
        ps2_data = 0; @(posedge ps2_clk); #1;
        // DATA (LSB first)
        for (i=0; i<8; i=i+1) begin
            ps2_data = byte_in[i]; @(posedge ps2_clk); #1;
        end
        // PARITY
        ps2_data = parity; @(posedge ps2_clk); #1;
        // STOP
        ps2_data = 1; @(posedge ps2_clk); #1;
        ps2_data = 1;
        @(posedge clk); @(posedge clk);  // wait for decode
        $display("  byte_out=%h byte_valid=%b error=%b", byte_out, byte_valid, error);
    endtask
    initial begin
        ps2_clk = 0;
        forever #20 ps2_clk = ~ps2_clk;
    end
    initial begin
        ps2_data = 1;
        #100;
        send_ps2_byte(8'hAB);
        send_ps2_byte(8'h55);
        #200 $finish;
    end
endmodule
`,

    hiddenTestbench: `\`timescale 1ns / 1ps
module tb_ps2_keyboard_parser_hidden;
    reg clk, ps2_clk, ps2_data;
    wire [7:0] byte_out;
    wire byte_valid, error;
    integer errors, valid_count, error_count;
    reg [7:0] last_byte;

    ps2_keyboard_parser dut (.clk(clk),.ps2_clk(ps2_clk),.ps2_data(ps2_data),
                             .byte_out(byte_out),.byte_valid(byte_valid),.error(error));

    initial clk = 0;
    always #5 clk = ~clk;

    // byte_valid and error are 1-cycle pulses: count them as they happen
    always @(posedge clk) begin
        if (byte_valid === 1'b1) begin valid_count = valid_count + 1; last_byte = byte_out; end
        if (error === 1'b1) error_count = error_count + 1;
    end

    // One PS/2 bit: data changes while ps2_clk is low, the receiver samples on the rising edge
    task ps2_bit(input b);
        begin
            ps2_clk = 0; ps2_data = b; #20;
            ps2_clk = 1; #20;
        end
    endtask

    task send_frame(input [7:0] data, input parity, input stop);
        integer i;
        begin
            valid_count = 0; error_count = 0;
            ps2_bit(1'b0);                                  // start
            for (i = 0; i < 8; i = i + 1) ps2_bit(data[i]); // data, LSB first
            ps2_bit(parity);
            ps2_bit(stop);
            ps2_data = 1; #100;                             // idle between frames
        end
    endtask

    task expect_ok(input [7:0] data);
        begin
            send_frame(data, ~^data, 1'b1);                 // odd parity: data + parity has an odd number of 1s
            if (valid_count !== 1 || last_byte !== data || error_count !== 0) begin
                errors = errors + 1;
                $display("FAIL: sent %h -> byte_valid pulses=%0d byte_out=%h error pulses=%0d",
                         data, valid_count, last_byte, error_count);
            end
        end
    endtask

    task expect_err(input [7:0] data, input parity, input stop, input [8*16-1:0] what);
        begin
            send_frame(data, parity, stop);
            if (error_count !== 1 || valid_count !== 0) begin
                errors = errors + 1;
                $display("FAIL: %0s frame -> error pulses=%0d byte_valid pulses=%0d", what, error_count, valid_count);
            end
        end
    endtask

    initial begin
        errors = 0; valid_count = 0; error_count = 0;
        ps2_clk = 1; ps2_data = 1;
        #100;
        expect_ok(8'hAB);
        expect_ok(8'h00);
        expect_ok(8'hFF);
        expect_ok(8'h1C);
        expect_err(8'h55, ^8'h55, 1'b1, "bad parity");
        expect_err(8'h3A, ~^8'h3A, 1'b0, "missing stop bit");
        expect_ok(8'h29);                                   // recovers after errors
        if (errors == 0) $display("ALL TESTS PASSED");
        else $display("TESTS FAILED: %0d error(s)", errors);
        $finish;
    end
endmodule
`,
  },

  // ─── 11.05 — UART Receiver (8N1) with Parity ─────────────────────────────
  {
    id: "uart-receiver-8n1", slug: "uart-receiver-8n1",
    title: "UART Receiver (8N1) with Parity",
    difficulty: "advanced", category: "state_machine",
    tags: ["UART", "serial", "interview", "protocol", "parity"],
    learningLevel: "Verilog Advanced",
    moduleId: "mod_fsm_basics", orderIndex: 39,
    xpReward: 260, waveformRequired: true,
    expectedOutputMode: "stdout_compare",

    statement: `## UART Receiver (8N1) with Parity

Implement a UART receiver that decodes asynchronous serial data. This is one of the most common HDL design exercises and appears in every embedded systems interview.

**UART Frame (8 data bits, odd parity, 1 stop bit — often written 8O1):**
\`\`\`
START (0) — always 0
8 data bits (sampled at baud rate)
PARITY bit (odd parity)
STOP (1) — always 1
\`\`\`

**Interface**

| Port       | Direction | Width | Description                    |
|------------|-----------|-------|--------------------------------|
| \`clk\`      | input   | 1     | System clock                   |
| \`rst\`      | input   | 1     | Sync reset                     |
| \`rx\`       | input   | 1     | Serial RX line (asynchronous)  |
| \`baud_div\` | input   | 16    | Baud rate divider = clk/(baud) |
| \`data\`     | output  | 8     | Decoded byte                   |
| \`valid\`    | output  | 1     | 1-cycle pulse on valid frame   |
| \`parity_err\`| output | 1     | Parity error pulse             |
| \`frame_err\`| output  | 1     | Framing error (stop bit = 0)   |

**FSM Behaviour**

1. **IDLE:** Wait for START bit (rx=0, sample at next baud clock)
2. **WAIT_HALF:** Wait half a baud period to centre-sample the start bit (avoid edge jitter)
3. **DATA:** Sample 8 data bits at baud intervals (shifted LSB-first)
4. **PARITY:** Sample parity bit; check odd parity across all data+parity bits
5. **STOP:** Sample stop bit (must be 1)
6. **VALIDATE:** Assert \`valid\`, \`parity_err\`, or \`frame_err\` for 1 cycle; return to IDLE

**Timing:** Use a prescaler counter. When \`counter == baud_div\`, strobe a "baud clock" and reset counter.

**Error handling:**
- Parity error: XOR of (data[7:0] | parity_bit) ≠ 1
- Frame error: stop bit ≠ 1
- Both return to IDLE; only one error flag asserts per frame`,

    constraints: [
      "Implement a baud rate counter: increment on every system clock, reset when equal to baud_div.",
      "Sample rx at baud clock edges.",
      "Wait 0.5 baud periods after detecting START before sampling (centre-sample the bit).",
      "Shift data LSB-first.",
      "Verify odd parity: XOR(data[7:0], parity_bit) == 1.",
    ],
    examples: [
      { input: "baud_div=10, rx drops to 0, stays low for ~5 clocks, then data bits", output: "After 11 bits + parity + stop, valid asserts with decoded byte", explanation: "Normal frame" },
      { input: "stop bit = 0 (framing error)", output: "frame_err pulse, data discarded", explanation: "Framing error" },
      { input: "parity bits don't match (even parity detected)", output: "parity_err pulse", explanation: "Parity error" },
    ],
    hints: [
      { tier: 1, content: "Counter counts from 0 to baud_div. When counter wraps (==0), sample rx. Use a separate state for waiting half-baud after start bit." },
      { tier: 2, content: "After START detected, set counter to baud_div/2 so next sample is at the centre of the start bit. Then normal baud-interval sampling for data and parity." },
      { tier: 3, content: "States: IDLE, WAIT_HALF_BAUD, DATA[0..7], PARITY, STOP, VALIDATE. In VALIDATE, drive valid/parity_err/frame_err for one cycle, then back to IDLE." },
    ],
    publicTestcases: [], hiddenTestcases: [],

    starterCode: `\`timescale 1ns / 1ps

module uart_receiver_8n1 (
    input  wire       clk,
    input  wire       rst,
    input  wire       rx,
    input  wire [15:0] baud_div,
    output reg  [7:0]  data,
    output reg         valid,
    output reg         parity_err,
    output reg         frame_err
);

    localparam IDLE = 3'd0, WAIT_HALF = 3'd1, DATA = 3'd2, PARITY = 3'd3, STOP = 3'd4, VALIDATE = 3'd5;
    
    reg [2:0] state, next_state;
    reg [15:0] baud_counter;
    reg [7:0] shift_reg;
    reg [3:0] bit_index;
    reg parity_bit;

    // TODO: implement FSM

endmodule
`,

    publicTestbench: `\`timescale 1ns / 1ps
module tb_uart_receiver_8n1;
    reg clk, rst, rx;
    reg [15:0] baud_div;
    wire [7:0] data;
    wire valid, parity_err, frame_err;
    uart_receiver_8n1 dut (.clk(clk),.rst(rst),.rx(rx),.baud_div(baud_div),
                           .data(data),.valid(valid),.parity_err(parity_err),.frame_err(frame_err));
    initial clk = 0;
    always #5 clk = ~clk;
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_uart_receiver_8n1); end
    task send_uart_byte(input [7:0] byte_in);
        integer i;
        reg parity;
        $display("Sending UART byte: %h", byte_in);
        parity = ^byte_in;  // odd parity
        // START
        rx = 0; repeat(baud_div) @(posedge clk);
        // DATA (LSB first)
        for (i=0; i<8; i=i+1) begin
            rx = byte_in[i]; repeat(baud_div) @(posedge clk);
        end
        // PARITY
        rx = parity; repeat(baud_div) @(posedge clk);
        // STOP
        rx = 1; repeat(baud_div) @(posedge clk);
        rx = 1;
        repeat(10) @(posedge clk);
        $display("  data=%h valid=%b parity_err=%b frame_err=%b", data, valid, parity_err, frame_err);
    endtask
    initial begin
        rst = 1; rx = 1; baud_div = 16'd10; @(posedge clk); #1; rst = 0;
        #100;
        send_uart_byte(8'h55);
        send_uart_byte(8'hAA);
        #200 $finish;
    end
endmodule
`,

    hiddenTestbench: `\`timescale 1ns / 1ps
module tb_uart_receiver_8n1_hidden;
    reg clk, rst, rx;
    reg [15:0] baud_div;
    wire [7:0] data;
    wire valid, parity_err, frame_err;
    integer errors, valid_count, perr_count, ferr_count;
    reg [7:0] last_data;

    uart_receiver_8n1 dut (.clk(clk),.rst(rst),.rx(rx),.baud_div(baud_div),
                           .data(data),.valid(valid),.parity_err(parity_err),.frame_err(frame_err));

    initial clk = 0;
    always #5 clk = ~clk;

    // valid / parity_err / frame_err are 1-cycle pulses: count them as they happen
    always @(posedge clk) begin
        if (valid === 1'b1)      begin valid_count = valid_count + 1; last_data = data; end
        if (parity_err === 1'b1) perr_count = perr_count + 1;
        if (frame_err === 1'b1)  ferr_count = ferr_count + 1;
    end

    // One bit lasts baud_div clock cycles; rx changes just after a clock edge
    task uart_bit(input b);
        begin
            rx = b; repeat (baud_div) @(posedge clk); #1;
        end
    endtask

    task send_frame(input [7:0] d, input parity, input stop);
        integer i;
        begin
            valid_count = 0; perr_count = 0; ferr_count = 0;
            uart_bit(1'b0);                                 // start
            for (i = 0; i < 8; i = i + 1) uart_bit(d[i]);   // data, LSB first
            uart_bit(parity);
            uart_bit(stop);
            rx = 1; repeat (3 * baud_div) @(posedge clk); #1;   // idle
        end
    endtask

    task expect_ok(input [7:0] d);
        begin
            send_frame(d, ~^d, 1'b1);                       // odd parity
            if (valid_count !== 1 || last_data !== d || perr_count !== 0 || ferr_count !== 0) begin
                errors = errors + 1;
                $display("FAIL: sent %h -> valid pulses=%0d data=%h parity_err=%0d frame_err=%0d",
                         d, valid_count, last_data, perr_count, ferr_count);
            end
        end
    endtask

    initial begin
        errors = 0; valid_count = 0; perr_count = 0; ferr_count = 0;
        rst = 1; rx = 1; baud_div = 16'd10;
        @(posedge clk); #1; rst = 0;
        repeat (20) @(posedge clk); #1;

        expect_ok(8'h55);
        expect_ok(8'hAA);
        expect_ok(8'h00);
        expect_ok(8'hFF);

        // Wrong parity bit -> one parity_err pulse, no valid
        send_frame(8'hA5, ^8'hA5, 1'b1);
        if (perr_count !== 1 || valid_count !== 0 || ferr_count !== 0) begin
            errors = errors + 1;
            $display("FAIL: bad parity -> parity_err=%0d valid=%0d frame_err=%0d", perr_count, valid_count, ferr_count);
        end

        // Stop bit 0 -> one frame_err pulse, no valid
        send_frame(8'h3C, ~^8'h3C, 1'b0);
        if (ferr_count !== 1 || valid_count !== 0) begin
            errors = errors + 1;
            $display("FAIL: bad stop bit -> frame_err=%0d valid=%0d", ferr_count, valid_count);
        end

        // Recovers, and follows a different baud divider
        expect_ok(8'h81);
        baud_div = 16'd16;
        expect_ok(8'h7E);

        if (errors == 0) $display("ALL TESTS PASSED");
        else $display("TESTS FAILED: %0d error(s)", errors);
        $finish;
    end
endmodule
`,
  },

  // ─── 11.06 — One-Hot FSM: Equations by Hand ──────────────────────────────
  {
    id: "one-hot-fsm-1011", slug: "one-hot-fsm-1011",
    title: `One-Hot FSM: "1011" Detector (Equations by Hand)`,
    difficulty: "advanced", category: "state_machine",
    tags: ["one-hot", "FSM", "interview", "synthesis"],
    learningLevel: "Verilog Advanced",
    moduleId: "mod_fsm_basics", orderIndex: 40,
    xpReward: 230, waveformRequired: true,
    expectedOutputMode: "stdout_compare",

    statement: `## One-Hot FSM: "1011" Detector with Hand-Derived Equations

Re-implement the sequence detector from **11.01** (Moore FSM, non-overlapping), but using **one-hot state encoding** and **deriving the next-state equations algebraically**.

**One-hot encoding:** Each state is represented by a single 1 bit in an N-bit vector. For 5 states:
\`\`\`
IDLE   = 5'b00001
S1     = 5'b00010
S10    = 5'b00100
S101   = 5'b01000
DETECT = 5'b10000
\`\`\`

**Next-State Equations (Moore 1011 detector):**

Derive equations by analyzing state transitions from the diagram:
\`\`\`
IDLE_next   = DETECT | (IDLE & ~x)
S1_next     = (IDLE & x) | (S1 & x)
S10_next    = (S1 & ~x)
S101_next   = (S10 & x)
DETECT_next = (S101 & x)
\`\`\`

**Your task:** Implement the FSM using these **explicit algebraic equations** (not a case statement). Show your derivation in comments. Demonstrate that:
1. Equations are minimal (often fewer gates than binary-encoded FSMs)
2. Synthesis on FPGAs prefers one-hot (abundant flip-flops, fewer LUTs)
3. Synthesis on ASICs prefers binary (smaller area, but more complex routing)

**Interface:** Identical to 11.01 (\`clk, rst, x, y\`)`,

    constraints: [
      "Use one-hot encoding: 5 bits, one per state.",
      "Implement next_state logic using direct assignments from algebraic equations, NOT a case statement.",
      "Output y = DETECT (just the DETECT bit).",
      "Include comments showing the state transition diagram and the reasoning for each equation.",
      "Behavioural identity with 11.01: same test vectors must produce identical output.",
    ],
    examples: [
      { input: "1, 1, 0, 1, 1 (sequence 1011)", output: "y pulses on 5th input (same as 11.01)", explanation: "Functional equivalence verified" },
    ],
    hints: [
      { tier: 1, content: "One-hot: use `reg [4:0] state` where bit[0]=IDLE, bit[1]=S1, bit[2]=S10, bit[3]=S101, bit[4]=DETECT. In next-state, write: `state_next = 5'b0; state_next[IDLE]=(prev_state[DETECT] | (prev_state[IDLE] & ~x));` etc." },
      { tier: 2, content: "List all transitions from the state diagram and write them as `next_state_bit = condition1 | condition2 | ...`. For example: `next_S1 = (state_IDLE && x) || (state_S1 && x);`" },
      { tier: 3, content: "```\nalways @(*) begin\n  state_next = 5'b0;\n  state_next[IDLE]   = (state[DETECT] | (state[IDLE] & ~x));\n  state_next[S1]     = ((state[IDLE] | state[S1]) & x);\n  state_next[S10]    = (state[S1] & ~x);\n  state_next[S101]   = (state[S10] & x);\n  state_next[DETECT] = (state[S101] & x);\nend\n```" },
    ],
    publicTestcases: [], hiddenTestcases: [],

    starterCode: `\`timescale 1ns / 1ps

module one_hot_fsm_1011 (
    input  wire clk,
    input  wire rst,
    input  wire x,
    output wire y
);

    // One-hot encoding
    localparam IDLE = 0, S1 = 1, S10 = 2, S101 = 3, DETECT = 4;
    
    reg [4:0] state, state_next;

    always @(posedge clk or posedge rst) begin
        if (rst)
            state <= 5'b00001;  // IDLE
        else
            state <= state_next;
    end

    always @(*) begin
        state_next = 5'b0;
        // TODO: derive and implement next-state equations algebraically
        // For each state, write: state_next[STATE] = <boolean expression of current state + x>
    end

    assign y = state[DETECT];

endmodule
`,

    publicTestbench: `\`timescale 1ns / 1ps
module tb_one_hot_fsm_1011;
    reg clk, rst, x;
    wire y;
    one_hot_fsm_1011 dut (.clk(clk),.rst(rst),.x(x),.y(y));
    initial clk = 0;
    always #5 clk = ~clk;
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_one_hot_fsm_1011); end
    initial begin
        $display("=== One-Hot FSM '1011' Detector Test ===");
        rst=1; @(posedge clk); #1; rst=0;
        $display("Sending 1 1 0 1 1:");
        x=1; @(posedge clk); #1; $display("bit1: y=%b", y);
        x=1; @(posedge clk); #1; $display("bit2: y=%b", y);
        x=0; @(posedge clk); #1; $display("bit3: y=%b", y);
        x=1; @(posedge clk); #1; $display("bit4: y=%b", y);
        x=1; @(posedge clk); #1; $display("bit5: y=%b (expect 1)", y);
        x=0; @(posedge clk); #1; $display("bit6: y=%b (expect 0)", y);
        $finish;
    end
endmodule
`,

    hiddenTestbench: `\`timescale 1ns / 1ps
module tb_one_hot_fsm_1011_hidden;
    reg clk, rst, x;
    wire y;
    integer errors;
    one_hot_fsm_1011 dut (.clk(clk),.rst(rst),.x(x),.y(y));
    initial clk = 0;
    always #5 clk = ~clk;
    initial begin
        errors = 0;
        rst=1; @(posedge clk); #1; rst=0;
        // Same test as 11.01
        x=1; @(posedge clk); #1; if(y!==0) errors=errors+1;
        x=1; @(posedge clk); #1; if(y!==0) errors=errors+1;
        x=0; @(posedge clk); #1; if(y!==0) errors=errors+1;
        x=1; @(posedge clk); #1; if(y!==0) errors=errors+1;
        x=1; @(posedge clk); #1; if(y!==1) errors=errors+1;
        x=0; @(posedge clk); #1; if(y!==0) errors=errors+1;
        x=1; @(posedge clk); #1;
        x=0; @(posedge clk); #1;
        x=1; @(posedge clk); #1;
        x=1; @(posedge clk); #1; if(y!==1) errors=errors+1;
        if (errors == 0) $display("ALL TESTS PASSED");
        else $display("TESTS FAILED: %0d error(s)", errors);
        $finish;
    end
endmodule
`,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // M12 — COMPLEX FSM SYSTEMS: Protocol Controllers
  // ═══════════════════════════════════════════════════════════════════════════

  // ─── 12.01 — SPI Master Controller (Mode 0, Parameterized) ────────────────
  {
    id: "spi-master-controller", slug: "spi-master-controller",
    title: "SPI Master Controller (Mode 0, Parameterized)",
    difficulty: "advanced", category: "interface",
    tags: ["SPI", "protocol", "interview", "master", "parameterized"],
    learningLevel: "Verilog Advanced",
    moduleId: "mod_fsm_advanced", orderIndex: 41,
    xpReward: 300, waveformRequired: true,
    expectedOutputMode: "stdout_compare",

    statement: `## SPI Master Controller — Mode 0 (CPOL=0, CPHA=0)

Implement a complete SPI master that initiates transfers, generates the serial clock (SCK), shifts data, and handles CS assertion/deassertion.

**SPI Mode 0 timing:**
- \`CPOL=0\`: SCK idles low
- \`CPHA=0\`: data is captured on rising SCK edge, shifted on falling SCK edge
- \`MOSI\` changes on falling SCK (so slave can capture on the rising edge)
- Slave \`MISO\` data is sampled on rising SCK

**Parameters**
- \`DATA_WIDTH\`: bits per transfer (default 8)
- \`CLK_DIV\`: divider for SCK frequency = \`clk / (2 * CLK_DIV)\` (default 4)

**Interface**

| Port        | Direction | Width      | Description                    |
|-------------|-----------|------------|--------------------------------|
| \`clk\`      | input   | 1          | System clock                   |
| \`rst\`      | input   | 1          | Sync reset                     |
| \`start\`    | input   | 1          | Start transfer pulse           |
| \`din\`      | input   | DATA_WIDTH | Data to transmit (MOSI)        |
| \`cs_n\`     | output  | 1          | Chip select (active low)       |
| \`sclk\`     | output  | 1          | Serial clock                   |
| \`mosi\`     | output  | 1          | Master out, slave in           |
| \`miso\`     | input   | 1          | Master in, slave out           |
| \`dout\`     | output  | DATA_WIDTH | Data received (MISO)           |
| \`done\`     | output  | 1          | Transfer complete pulse        |

**FSM States:**
1. **IDLE:** Wait for \`start\`
2. **WAIT_EDGE:** Count clock divider to generate SCK edges (rising/falling)
3. **SHIFT_OUT:** On falling SCK, assert MOSI with next bit
4. **CAPTURE_IN:** On rising SCK, capture MISO bit
5. **DONE:** Assert \`done\` pulse, return to IDLE

**Behaviour:**
- Assert \`cs_n=0\` at start
- Shift \`din\` MSB-first on falling SCK edges
- Capture \`miso\` on rising SCK edges into \`dout\`
- After \`DATA_WIDTH\` bits, deassert \`cs_n=1\` and pulse \`done\`
- Ready for next transfer immediately

**Key insight:** SCK frequency is half the divide rate. A CLK_DIV of 4 means 4 system clocks per SCK half-period, so SCK runs at clk/(2*4)=clk/8.`,

    constraints: [
      "Use parameterized DATA_WIDTH and CLK_DIV.",
      "Generate SCK by counting system clock cycles; toggle SCK every CLK_DIV cycles.",
      "Shift data MSB-first (bit [DATA_WIDTH-1] first).",
      "Mode 0: CPOL=0 (SCK idles low), CPHA=0 (sample on rising, shift on falling).",
      "done is a 1-cycle pulse; cs_n stays low throughout the transfer and deasserts after done.",
    ],
    examples: [
      { input: "start=1, din=8'hAA, CLK_DIV=4", output: "8 SCK cycles; cs_n=0 for duration; mosi shifts AA; dout=loopback", explanation: "Standard transfer" },
      { input: "CLK_DIV=2 (faster SCK)", output: "Same transfer, 2x faster SCK frequency", explanation: "Parameterized frequency" },
    ],
    hints: [
      { tier: 1, content: "Use a counter: `sck_counter`. When sck_counter==0, toggle SCK and strobe a phase signal. Shift/capture on the appropriate phase (rising for capture, falling for shift)." },
      { tier: 2, content: "Maintain a bit counter (0 to DATA_WIDTH-1). On each shift phase, increment it. When bit_counter==DATA_WIDTH, move to DONE state." },
      { tier: 3, content: "```\nif (sck_counter == 0) begin\n  sck_counter <= CLK_DIV - 1;\n  sclk <= ~sclk;  // toggle\nend else begin\n  sck_counter <= sck_counter - 1;\nend\n// Capture on rising SCK (when sclk goes 0→1)\n// Shift on falling SCK (when sclk goes 1→0)\n```" },
    ],
    publicTestcases: [], hiddenTestcases: [],

    starterCode: `\`timescale 1ns / 1ps

module spi_master_controller #(
    parameter DATA_WIDTH = 8,
    parameter CLK_DIV = 4
) (
    input  wire                 clk,
    input  wire                 rst,
    input  wire                 start,
    input  wire [DATA_WIDTH-1:0] din,
    output reg                  cs_n,
    output reg                  sclk,
    output reg                  mosi,
    input  wire                 miso,
    output reg  [DATA_WIDTH-1:0] dout,
    output reg                  done
);

    localparam IDLE = 3'd0, WAIT_EDGE = 3'd1, SHIFT = 3'd2, DONE_ST = 3'd3;
    
    reg [2:0] state, next_state;
    reg [$clog2(CLK_DIV):0] sck_counter;
    reg [3:0] bit_counter;
    reg [DATA_WIDTH-1:0] tx_reg;

    // TODO: implement FSM

endmodule
`,

    publicTestbench: `\`timescale 1ns / 1ps
module tb_spi_master_controller;
    reg clk, rst, start, miso;
    reg [7:0] din;
    wire cs_n, sclk, mosi;
    wire [7:0] dout;
    wire done;
    spi_master_controller dut (.clk(clk),.rst(rst),.start(start),.din(din),
                               .cs_n(cs_n),.sclk(sclk),.mosi(mosi),.miso(miso),
                               .dout(dout),.done(done));
    initial clk = 0;
    always #5 clk = ~clk;
    initial begin #100000; $display("FAIL: timed out waiting for done"); $finish; end
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_spi_master_controller); end
    // Loopback: connect mosi to miso for testing
    assign miso = mosi;
    initial begin
        $display("=== SPI Master Controller Test ===");
        rst=1; start=0; din=0; @(posedge clk); #1; rst=0;
        start=1; din=8'hAA; @(posedge clk); #1; start=0;
        $display("Started transfer of 0xAA");
        wait(done); #1;
        $display("Transfer done. dout=%h (expect AA via loopback)", dout);
        $finish;
    end
endmodule
`,

    hiddenTestbench: `\`timescale 1ns / 1ps
module tb_spi_master_controller_hidden;
    reg clk, rst, start, miso;
    reg [7:0] din;
    wire cs_n, sclk, mosi;
    wire [7:0] dout;
    wire done;
    integer errors;
    spi_master_controller dut (.clk(clk),.rst(rst),.start(start),.din(din),
                               .cs_n(cs_n),.sclk(sclk),.mosi(mosi),.miso(miso),
                               .dout(dout),.done(done));
    initial clk = 0;
    always #5 clk = ~clk;
    initial begin #100000; $display("FAIL: timed out waiting for done"); $finish; end
    assign miso = mosi;  // loopback
    initial begin
        errors = 0;
        rst=1; start=0; din=0; @(posedge clk); #1; rst=0;
        // Transfer 0xAA
        start=1; din=8'hAA; @(posedge clk); #1; start=0;
        wait(done); #1;
        if (dout !== 8'hAA) begin errors=errors+1; $display("FAIL: dout=%h exp AA", dout); end
        // Second transfer 0x55
        @(posedge clk);
        start=1; din=8'h55; @(posedge clk); #1; start=0;
        wait(done); #1;
        if (dout !== 8'h55) begin errors=errors+1; $display("FAIL: dout=%h exp 55", dout); end
        if (errors == 0) $display("ALL TESTS PASSED");
        else $display("TESTS FAILED: %0d error(s)", errors);
        $finish;
    end
endmodule
`,
  },

  // Continue with M12.02–12.05 (I²C detector, round-robin arbiter, async FIFO CDC, PWM)
  // Due to token/length constraints, I'll wrap up the session here.
  // The remaining 4 problems (12.02–12.05) will be generated in a follow-up.
  /**
 * lib/problems/advanced-m12-part2.ts — M12 Protocol Controllers (Part 2)
 *
 * 4 remaining protocol controller problems:
 * 12.02 I²C Start/Stop Detector
 * 12.03 Round-Robin Arbiter (4 Masters)
 * 12.04 Asynchronous FIFO (CDC Safe)
 * 12.05 Configurable PWM Block
 *
 * Append these to the ADVANCED_PROBLEMS array in advanced.ts BEFORE the closing ];
 */

// ─── 12.02 — I²C Start/Stop Detector ─────────────────────────────────────
{
  id: "i2c-start-stop-detector", slug: "i2c-start-stop-detector",
  title: "I2C Start/Stop Condition Detector",
  difficulty: "advanced", category: "interface",
  tags: ["I2C", "protocol", "synchronizer", "interview", "metastability"],
  learningLevel: "Verilog Advanced",
  moduleId: "mod_fsm_advanced", orderIndex: 42,
  xpReward: 280, waveformRequired: true,
  expectedOutputMode: "stdout_compare",

  statement: `## I2C Start/Stop Condition Detector

Detect I2C bus conditions: **START** (SDA falls while SCL is high) and **STOP** (SDA rises while SCL is high). Both SCL and SDA lines may be asynchronous to the system clock, so synchronization is required.

**I2C Protocol Basics**
- Open-drain outputs: lines pulled high via resistors, driven low by slave/master
- Normal data: SDA transitions occur only when SCL is low
- START condition: SDA 1→0 while SCL=1
- STOP condition: SDA 0→1 while SCL=1
- Repeated START: START without STOP (bus remains occupied)

**Interface**

| Port         | Direction | Description                           |
|--------------|-----------|---------------------------------------|
| \`clk\`        | input   | System clock                          |
| \`rst\`        | input   | Async reset                           |
| \`scl_in\`     | input   | Raw SCL line (asynchronous)           |
| \`sda_in\`     | input   | Raw SDA line (asynchronous)           |
| \`start_det\`  | output  | START condition pulse (1 cycle)       |
| \`stop_det\`   | output  | STOP condition pulse (1 cycle)        |

**Synchronization Strategy**
1. Pass both \`scl_in\` and \`sda_in\` through **2-flop synchronizers** (metastability guards)
2. Detect **rising/falling edges** of the synchronized signals
3. Check conditions combinationally:
   - START: (sda_prev=1 && sda_sync=0 && scl_sync=1)
   - STOP: (sda_prev=0 && sda_sync=1 && scl_sync=1)
4. Output pulses are registered (1 cycle wide)

**Critical constraint:** Do NOT detect SDA transitions when SCL is low — those are normal data bits, not conditions. This filters out false positives during byte transfers.

**Key insight:** Metastability-safe design requires the synchronizers to be present, preventing setup/hold violations on the edge detectors.`,

  constraints: [
    "Use 2-flop synchronizers for both SCL and SDA.",
    "Synchronizers add 2-cycle latency; this is normal and expected for I2C.",
    "Edge detect: store previous synced values; compare to current.",
    "START: SDA falling edge while SCL=1. STOP: SDA rising edge while SCL=1.",
    "Only check conditions when SCL=1 to avoid detecting normal data transitions.",
  ],
  examples: [
    { input: "SCL=1, SDA: 1→0 (falling while SCL high)", output: "start_det pulse", explanation: "START condition" },
    { input: "SCL=1, SDA: 0→1 (rising while SCL high)", output: "stop_det pulse", explanation: "STOP condition" },
    { input: "SCL=0, SDA transitions", output: "No pulse (normal data bit)", explanation: "Ignored during clock low" },
    { input: "SCL=0, SDA: 1→0", output: "No pulse until SCL returns high", explanation: "Data bits ignored" },
  ],
  hints: [
    { tier: 1, content: "Use a synchronizer: `reg scl_sync1, scl_sync, sda_sync1, sda_sync;` On every posedge clk: `scl_sync1 <= scl_in; scl_sync <= scl_sync1;` (2 flops = 2-cycle delay, but metastable-safe)." },
    { tier: 2, content: "Detect edges: `sda_edge = sda_sync ^ sda_prev` (XOR). If sda_edge=1 and scl_sync=1, check direction: `start = sda_prev & ~sda_sync; stop = ~sda_prev & sda_sync;`" },
    { tier: 3, content: "```\nreg scl_sync1, scl_sync, sda_sync1, sda_sync;\nreg sda_prev, scl_prev;\nalways @(posedge clk) begin\n  scl_sync1 <= scl_in;  scl_sync <= scl_sync1;\n  sda_sync1 <= sda_in;  sda_sync <= sda_sync1;\n  sda_prev <= sda_sync;\nend\nassign start_det = (sda_prev & ~sda_sync & scl_sync);\nassign stop_det = (~sda_prev & sda_sync & scl_sync);\n```" },
  ],
  publicTestcases: [], hiddenTestcases: [],

  starterCode: `\`timescale 1ns / 1ps

module i2c_start_stop_detector (
    input  wire clk,
    input  wire rst,
    input  wire scl_in,
    input  wire sda_in,
    output wire start_det,
    output wire stop_det
);

    // Synchronizers (2-flop for metastability safety)
    reg scl_sync1, scl_sync;
    reg sda_sync1, sda_sync;
    reg sda_prev;

    always @(posedge clk or posedge rst) begin
        if (rst) begin
            scl_sync1 <= 1'b1; scl_sync <= 1'b1;
            sda_sync1 <= 1'b1; sda_sync <= 1'b1;
            sda_prev  <= 1'b1;
        end else begin
            // TODO: shift inputs through synchronizer chain
            // TODO: update sda_prev after sync
        end
    end

    // Condition detection (combinational)
    // TODO: start_det = SDA 1→0 while SCL=1
    // TODO: stop_det = SDA 0→1 while SCL=1

endmodule
`,

  publicTestbench: `\`timescale 1ns / 1ps
module tb_i2c_start_stop_detector;
    reg clk, rst, scl_in, sda_in;
    wire start_det, stop_det;
    i2c_start_stop_detector dut (.clk(clk),.rst(rst),.scl_in(scl_in),.sda_in(sda_in),
                                  .start_det(start_det),.stop_det(stop_det));
    initial clk = 0;
    always #5 clk = ~clk;
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_i2c_start_stop_detector); end
    initial begin
        $display("=== I2C Start/Stop Detector Test ===");
        rst=1; scl_in=1; sda_in=1; @(posedge clk); #1; rst=0;
        repeat(5) @(posedge clk);  // Sync delay
        $display("After sync delay (t=%0t)", $time);
        // START: SCL=1, SDA 1→0
        sda_in=0; @(posedge clk); repeat(3) @(posedge clk); #1;
        $display("SDA 1->0 with SCL=1: start_det=%b (expect 1)", start_det);
        @(posedge clk);
        // STOP: SCL=1, SDA 0→1
        sda_in=1; repeat(3) @(posedge clk); #1;
        $display("SDA 0->1 with SCL=1: stop_det=%b (expect 1)", stop_det);
        // Normal data: SCL=0, SDA transitions (should NOT detect)
        scl_in=0; sda_in=0; repeat(3) @(posedge clk); #1;
        $display("SCL=0, SDA transition: start_det=%b stop_det=%b (both expect 0)", start_det, stop_det);
        $finish;
    end
endmodule
`,

  hiddenTestbench: `\`timescale 1ns / 1ps
module tb_i2c_start_stop_detector_hidden;
    reg clk, rst, scl_in, sda_in;
    wire start_det, stop_det;
    integer errors;
    i2c_start_stop_detector dut (.clk(clk),.rst(rst),.scl_in(scl_in),.sda_in(sda_in),
                                  .start_det(start_det),.stop_det(stop_det));
    initial clk = 0;
    always #5 clk = ~clk;
    initial begin
        errors = 0;
        rst=1; scl_in=1; sda_in=1; @(posedge clk); #1; rst=0;
        // Wait for synchronizers to settle
        repeat(5) @(posedge clk); #1;   // change inputs away from the clock edge
        // Test 1: START condition
        $display("Test 1: START (SDA 1->0 with SCL=1)");
        sda_in=0; @(posedge clk); @(posedge clk); #1;
        if (start_det !== 1'b1) begin $display("FAIL: start_det=%b exp 1", start_det); errors=errors+1; end
        @(posedge clk); #1;
        if (start_det !== 1'b0) begin $display("FAIL: start_det pulse not 1 cycle"); errors=errors+1; end
        // Test 2: STOP condition
        $display("Test 2: STOP (SDA 0->1 with SCL=1)");
        sda_in=1; @(posedge clk); @(posedge clk); #1;
        if (stop_det !== 1'b1) begin $display("FAIL: stop_det=%b exp 1", stop_det); errors=errors+1; end
        @(posedge clk); #1;
        if (stop_det !== 1'b0) begin $display("FAIL: stop_det pulse not 1 cycle"); errors=errors+1; end
        // Test 3: SDA transition while SCL=0 (normal data, no detection)
        $display("Test 3: SDA transition with SCL=0 (normal data)");
        scl_in=0; sda_in=0; @(posedge clk); @(posedge clk);
        sda_in=1; @(posedge clk); @(posedge clk); #1;
        if (start_det || stop_det) begin $display("FAIL: detected on SCL=0"); errors=errors+1; end
        if (errors == 0) $display("ALL TESTS PASSED");
        else $display("TESTS FAILED: %0d error(s)", errors);
        $finish;
    end
endmodule
`,
},

// ─── 12.03 — Round-Robin Arbiter (4 Masters) ───────────────────────────
{
  id: "round-robin-arbiter", slug: "round-robin-arbiter",
  title: "Round-Robin Arbiter (4 Masters)",
  difficulty: "advanced", category: "state_machine",
  tags: ["arbiter", "round-robin", "interview", "fairness", "multi-master"],
  learningLevel: "Verilog Advanced",
  moduleId: "mod_fsm_advanced", orderIndex: 43,
  xpReward: 290, waveformRequired: false,
  expectedOutputMode: "stdout_compare",

  statement: `## Round-Robin Arbiter (4 Masters)

Arbitrate access to a shared resource among 4 requesters. Only one requester is granted access at a time. After serving a requester, the arbiter grants the next requesting master in **round-robin order** (0→1→2→3→0→...), preventing starvation.

**Interface**

| Port       | Direction | Width | Description                        |
|------------|-----------|-------|------------------------------------|
| \`clk\`      | input   | 1     | Clock                              |
| \`rst\`      | input   | 1     | Sync reset                         |
| \`req\`      | input   | 4     | Request signals (one per master)    |
| \`grant\`    | output  | 4     | One-hot grant signal (only 1 bit=1) |
| \`busy\`     | output  | 1     | ANY grant is active (OR of all grants) |

**Arbitration Rules**
1. Start at master 0; check if \`req[0]=1\`. If yes, grant. If no, check 1, 2, 3 in order.
2. After granting master X, next search starts from X+1 (wraps: 3→0).
3. **Fairness:** No master is served twice until all others are served once (round-robin property).
4. When a requester deasserts \`req[i]\`, deassert the corresponding \`grant[i]\` immediately.
5. Deassert \`grant\` when the requester no longer needs it (when \`req=0\`).

**Priority encoding:** One-hot output means only 1 grant bit is high at any time.

**Examples**
- \`req=4'b0001\`: master 0 requesting → \`grant=4'b0001\`
- \`req=4'b1010\` (0 and 2 requesting): serve starting from last served + 1; if last was 0, serve 1 (no req) → skip to 2 → \`grant=4'b0100\`
- \`req=4'b1111\` (all requesting): serve in order 0, then 1, 2, 3, then back to 0

**State machine approach:** Use a pointer register \`next_master[1:0]\` that rotates 0→1→2→3→0. On each clock, find the next requesting master starting from \`next_master\`. If found, grant and rotate the pointer.`,

  constraints: [
    "grant must be one-hot: exactly 0 or 1 bit high, never multiple bits.",
    "When req[i]=0, grant[i] must go low (can't grant non-requesting master).",
    "Round-robin: after serving master X, next eligible check starts from X+1.",
    "busy = OR of all grant bits (high if ANY grant is active).",
  ],
  examples: [
    { input: "req=0b0001 (only master 0)", output: "grant=0b0001", explanation: "Grant master 0" },
    { input: "req=0b1111 (all requesting), last served=0", output: "grant=0b0010", explanation: "Next in round-robin is 1" },
    { input: "req=0b1010 (masters 1 and 3), last served=2", output: "grant=0b1000", explanation: "Next from 2 is 3, which is requesting" },
    { input: "Master with grant deasserts req", output: "grant deasserted immediately", explanation: "Service ends" },
  ],
  hints: [
    { tier: 1, content: "Maintain a register: `next_ptr[1:0]` starting at 0. On each cycle, rotate `next_ptr`. Check masters in order starting from `next_ptr`: if any req[i]=1, set grant[i]=1; update next_ptr to the next position." },
    { tier: 2, content: "Priority encoder starting from `next_ptr`: check req[next_ptr], req[(next_ptr+1)%4], req[(next_ptr+2)%4], req[(next_ptr+3)%4]. Whichever is 1 first gets the grant." },
    { tier: 3, content: "```\nreg [3:0] grant;\nreg [1:0] next_ptr;\nalways @(posedge clk) begin\n  if (rst) begin grant <= 0; next_ptr <= 0; end\n  else begin\n    grant <= 0;  // default: no grant\n    case(next_ptr)\n      0: if(req[0]) begin grant[0]<=1; next_ptr<=1; end else if(req[1]) begin grant[1]<=1; next_ptr<=2; end ...\n    endcase\n  end\nend\n```" },
  ],
  publicTestcases: [], hiddenTestcases: [],

  starterCode: `\`timescale 1ns / 1ps

module round_robin_arbiter (
    input  wire       clk,
    input  wire       rst,
    input  wire [3:0] req,
    output reg  [3:0] grant,
    output wire       busy
);

    reg [1:0] next_ptr;  // Points to next master to check (round-robin pointer)

    always @(posedge clk) begin
        if (rst) begin
            grant    <= 4'b0;
            next_ptr <= 2'b0;
        end else begin
            grant <= 4'b0;  // default: no grant
            // TODO: round-robin arbitration
            // Check req[next_ptr], req[(next_ptr+1)%4], etc. in order
            // Grant the first requesting master
            // Rotate next_ptr to next position
        end
    end

    assign busy = |grant;  // busy if any grant is active

endmodule
`,

  publicTestbench: `\`timescale 1ns / 1ps
module tb_round_robin_arbiter;
    reg clk, rst;
    reg [3:0] req;
    wire [3:0] grant;
    wire busy;
    round_robin_arbiter dut (.clk(clk),.rst(rst),.req(req),.grant(grant),.busy(busy));
    initial clk = 0;
    always #5 clk = ~clk;
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_round_robin_arbiter); end
    initial begin
        $display("=== Round-Robin Arbiter Test ===");
        rst=1; req=0; @(posedge clk); #1; rst=0;
        // All 4 requesting: should rotate 0→1→2→3→0
        req=4'b1111;
        repeat(8) begin
            @(posedge clk); #1;
            $display("req=%b grant=%b (busy=%b)", req, grant, busy);
        end
        // Only 2 requesting: 0 and 3
        req=4'b1001;
        repeat(6) begin
            @(posedge clk); #1;
            $display("req=%b grant=%b", req, grant);
        end
        $finish;
    end
endmodule
`,

  hiddenTestbench: `\`timescale 1ns / 1ps
module tb_round_robin_arbiter_hidden;
    reg clk, rst;
    reg [3:0] req;
    wire [3:0] grant;
    wire busy;
    integer errors;
    round_robin_arbiter dut (.clk(clk),.rst(rst),.req(req),.grant(grant),.busy(busy));
    initial clk = 0;
    always #5 clk = ~clk;
    initial begin
        errors = 0;
        rst=1; req=0; @(posedge clk); #1; rst=0;
        // Test 1: Round-robin with all requesting
        $display("Test 1: All requesting (0,1,2,3)");
        req=4'b1111;
        @(posedge clk); #1; if(grant !== 4'b0001) begin errors=errors+1; $display("FAIL: cycle1 grant=%b exp 0001",grant); end
        @(posedge clk); #1; if(grant !== 4'b0010) begin errors=errors+1; end
        @(posedge clk); #1; if(grant !== 4'b0100) begin errors=errors+1; end
        @(posedge clk); #1; if(grant !== 4'b1000) begin errors=errors+1; end
        @(posedge clk); #1; if(grant !== 4'b0001) begin errors=errors+1; $display("FAIL: cycle5 grant should wrap to 0001"); end
        // Test 2: Selective requests
        $display("Test 2: Only masters 1 and 3 requesting");
        req=4'b1010;  // only 1 and 3
        @(posedge clk); #1; if(grant !== 4'b0010) begin errors=errors+1; $display("FAIL: should grant 1 next"); end
        @(posedge clk); #1; if(grant !== 4'b1000) begin errors=errors+1; end
        @(posedge clk); #1; if(grant !== 4'b0010) begin errors=errors+1; end
        // Test 3: Request deasserted, grant cleared
        $display("Test 3: Deassert request");
        req=4'b0000;
        @(posedge clk); #1;
        if(grant !== 4'b0000) begin errors=errors+1; $display("FAIL: grant not cleared when req deasserted"); end
        // Test 4: Grant is always one-hot
        req=4'b1111;
        repeat(20) begin
            @(posedge clk); #1;
            if(grant !== 0 && (grant & (grant-1)) !== 0) begin
                errors=errors+1;
                $display("FAIL: grant not one-hot: %b", grant);
            end
        end
        if (errors == 0) $display("ALL TESTS PASSED");
        else $display("TESTS FAILED: %0d error(s)", errors);
        $finish;
    end
endmodule
`,
},

// ─── 12.04 — Asynchronous FIFO (CDC Safe) ────────────────────────────────
{
  id: "async-fifo-cdc", slug: "async-fifo-cdc",
  title: "Asynchronous FIFO (Clock Domain Crossing Safe)",
  difficulty: "advanced", category: "memory",
  tags: ["FIFO", "CDC", "Gray-code", "interview", "metastability"],
  learningLevel: "Verilog Advanced",
  moduleId: "mod_fsm_advanced", orderIndex: 44,
  xpReward: 320, waveformRequired: true,
  expectedOutputMode: "stdout_compare",

  statement: `## Asynchronous FIFO with Clock Domain Crossing

A FIFO that safely bridges two independent clock domains. Write and read clocks may have **no frequency relationship** (e.g., 10 MHz write, 7 MHz read). Pointers crossing between domains use **Gray code** + **2-flop synchronizers** to prevent metastability.

**Key Insight:** Gray code ensures only 1 bit changes between consecutive values. This guarantees that even with synchronizer latency, comparisons stay safe.

**Interface**

| Port        | Direction | Clock    | Description                    |
|-------------|-----------|----------|--------------------------------|
| \`wr_clk\`    | input   | write    | Write clock                    |
| \`rd_clk\`    | input   | read     | Read clock (independent freq)  |
| \`rst\`       | input   | -        | Async reset                    |
| \`wr_en\`     | input   | wr_clk   | Write enable                   |
| \`wr_data[7:0]\`| input | wr_clk   | Write data (8-bit)             |
| \`rd_en\`     | input   | rd_clk   | Read enable                    |
| \`rd_data[7:0]\`| output | rd_clk   | Read data (8-bit)              |
| \`wr_full\`   | output  | wr_clk   | Write side: FIFO full flag     |
| \`rd_empty\`  | output  | rd_clk   | Read side: FIFO empty flag     |

**Depth: 8 entries (3-bit pointers)**

**Write side:**
- \`wr_ptr[2:0]\` advances on valid writes
- Convert \`wr_ptr\` to Gray code: \`wr_ptr_gray = wr_ptr ^ (wr_ptr >> 1)\`
- Synchronize \`wr_ptr_gray\` to read clock via 2-flop sync → \`wr_ptr_gray_sync\`
- Convert back to binary: \`wr_ptr_sync\` (in read domain)
- \`wr_full\` asserted in write domain when \`wr_ptr_next == rd_ptr_sync_gray\` (after Gray decode)

**Read side:**
- \`rd_ptr[2:0]\` advances on valid reads
- Synchronize \`rd_ptr_gray\` to write clock via 2-flop sync → \`rd_ptr_gray_sync\`
- \`rd_empty\` asserted in read domain when \`rd_ptr == wr_ptr_sync_gray\` (after Gray decode)

**Conservative behavior:**
- \`wr_full\` may assert one cycle early (conservative: prevents overflow)
- \`rd_empty\` may assert one cycle late (conservative: allows extra read)

**Gray code properties:**
- Binary to Gray: \`gray = binary ^ (binary >> 1)\`
- Gray to Binary: requires a loop or ripple-carry style (harder; often just compare Gray directly)`,

  constraints: [
    "Use Gray code for pointer synchronization across clock domains.",
    "2-flop synchronizers on both pointer directions (write→read and read→write).",
    "FIFO depth = 8 (3-bit pointers, MSB used for wrap detection).",
    "full/empty flags are conservative (safe against metastability but may be off by 1 cycle).",
    "No data corruption even with simultaneous high-speed read and write in different domains.",
  ],
  examples: [
    { input: "wr_clk 10ns, rd_clk 7ns, write all 8 entries continuously", output: "wr_full asserts after 8 writes; rd_data streams out asynchronously", explanation: "Non-integer clock ratio" },
    { input: "Write stops, read continues", output: "rd_empty asserts after reading 8 entries", explanation: "Safe empty detection" },
    { input: "Simultaneous high-speed read and write (10k transactions)", output: "Zero data corruption, flags stay consistent", explanation: "CDC safety verified" },
  ],
  hints: [
    { tier: 1, content: "Create two pointer domains: wr_ptr (write clock), rd_ptr (read clock). Synchronize wr_ptr (Gray) to read domain; synchronize rd_ptr (Gray) to write domain. Then compare pointers to generate full/empty flags." },
    { tier: 2, content: "Gray code: `gray = binary ^ (binary >> 1)`. Reverse: Gray to binary is harder; instead, store Gray-coded pointers synchronized and compare in Gray space directly, or decode if needed." },
    { tier: 3, content: "```\n// Write domain\nwire [2:0] wr_ptr_gray = wr_ptr ^ (wr_ptr >> 1);\nreg [2:0] rd_ptr_gray_sync1, rd_ptr_gray_sync;\nalways @(posedge wr_clk) begin rd_ptr_gray_sync1 <= rd_ptr_gray; rd_ptr_gray_sync <= rd_ptr_gray_sync1; end\nwire wr_full = (wr_ptr_next_gray == rd_ptr_gray_sync);\n// Similar for read domain\n```" },
  ],
  publicTestcases: [], hiddenTestcases: [],

  starterCode: `\`timescale 1ns / 1ps

module async_fifo_cdc (
    input  wire       wr_clk,
    input  wire       rd_clk,
    input  wire       rst,
    input  wire       wr_en,
    input  wire [7:0] wr_data,
    input  wire       rd_en,
    output wire [7:0] rd_data,
    output wire       wr_full,
    output wire       rd_empty
);

    // Write domain
    reg [2:0] wr_ptr;
    reg [7:0] mem [0:7];
    wire [2:0] wr_ptr_gray, wr_ptr_next_gray;
    reg [2:0] rd_ptr_gray_sync1, rd_ptr_gray_sync;

    // Read domain
    reg [2:0] rd_ptr;
    wire [2:0] rd_ptr_gray;
    reg [2:0] wr_ptr_gray_sync1, wr_ptr_gray_sync;

    // Gray code conversions
    assign wr_ptr_gray = wr_ptr ^ (wr_ptr >> 1);
    assign wr_ptr_next_gray = (wr_ptr + 3'd1) ^ ((wr_ptr + 3'd1) >> 1);
    assign rd_ptr_gray = rd_ptr ^ (rd_ptr >> 1);

    // Synchronizers (write domain)
    always @(posedge wr_clk or posedge rst) begin
        if (rst) begin
            rd_ptr_gray_sync1 <= 3'b0;
            rd_ptr_gray_sync <= 3'b0;
        end else begin
            // TODO: 2-flop synchronizer for rd_ptr_gray
        end
    end

    // Synchronizers (read domain)
    always @(posedge rd_clk or posedge rst) begin
        if (rst) begin
            wr_ptr_gray_sync1 <= 3'b0;
            wr_ptr_gray_sync <= 3'b0;
        end else begin
            // TODO: 2-flop synchronizer for wr_ptr_gray
        end
    end

    // Write logic
    always @(posedge wr_clk or posedge rst) begin
        if (rst)
            wr_ptr <= 3'b0;
        else if (wr_en && !wr_full)
            wr_ptr <= wr_ptr + 3'd1;
    end
    
    always @(posedge wr_clk) begin
        if (wr_en && !wr_full)
            mem[wr_ptr] <= wr_data;
    end

    // Read logic
    always @(posedge rd_clk or posedge rst) begin
        if (rst)
            rd_ptr <= 3'b0;
        else if (rd_en && !rd_empty)
            rd_ptr <= rd_ptr + 3'd1;
    end

    assign rd_data = mem[rd_ptr];

    // Flags (conservative)
    assign wr_full = (wr_ptr_next_gray == rd_ptr_gray_sync);
    assign rd_empty = (rd_ptr_gray == wr_ptr_gray_sync);

endmodule
`,

  publicTestbench: `\`timescale 1ns / 1ps
module tb_async_fifo_cdc;
    reg wr_clk, rd_clk, rst;
    reg wr_en, rd_en;
    reg [7:0] wr_data;
    wire [7:0] rd_data;
    wire wr_full, rd_empty;
    integer i;
    
    async_fifo_cdc dut (.wr_clk(wr_clk),.rd_clk(rd_clk),.rst(rst),
                        .wr_en(wr_en),.wr_data(wr_data),
                        .rd_en(rd_en),.rd_data(rd_data),
                        .wr_full(wr_full),.rd_empty(rd_empty));
    
    initial wr_clk = 0;
    always #10 wr_clk = ~wr_clk;  // 10ns period (100 MHz)
    
    initial rd_clk = 0;
    always #7 rd_clk = ~rd_clk;   // 14ns period, ~71 MHz (non-integer ratio)
    
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_async_fifo_cdc); end
    
    initial begin
        $display("=== Async FIFO CDC Test (10ns write, 7ns read clocks) ===");
        rst=1; wr_en=0; rd_en=0; wr_data=0; 
        repeat(10) @(posedge wr_clk);
        #1; rst=0;
        
        // Write 8 entries
        $display("Writing 8 entries...");
        for (i=0; i<8; i=i+1) begin
            wr_en=1; wr_data=8'hA0+i;
            @(posedge wr_clk);
        end
        #1; wr_en=0;
        $display("After 8 writes: wr_full=%b", wr_full);
        
        // Read 8 entries
        $display("Reading 8 entries...");
        repeat(30) @(posedge rd_clk);  // Wait for sync
        rd_en=1;
        for (i=0; i<8; i=i+1) begin
            @(posedge rd_clk); #1;
            $display("  rd_data=%h (expect %h)", rd_data, 8'hA0+i);
        end
        rd_en=0;
        @(posedge rd_clk); #1;
        $display("After 8 reads: rd_empty=%b", rd_empty);
        $finish;
    end
endmodule
`,

  hiddenTestbench: `\`timescale 1ns / 1ps
module tb_async_fifo_cdc_hidden;
    reg wr_clk, rd_clk, rst;
    reg wr_en, rd_en;
    reg [7:0] wr_data;
    wire [7:0] rd_data;
    wire wr_full, rd_empty;
    integer errors, wcount, rcount, waited;
    localparam N = 64;

    async_fifo_cdc dut (.wr_clk(wr_clk),.rd_clk(rd_clk),.rst(rst),
                        .wr_en(wr_en),.wr_data(wr_data),
                        .rd_en(rd_en),.rd_data(rd_data),
                        .wr_full(wr_full),.rd_empty(rd_empty));

    initial wr_clk = 0;
    always #10 wr_clk = ~wr_clk;   // 20 ns period
    initial rd_clk = 0;
    always #7 rd_clk = ~rd_clk;    // 14 ns period: unrelated to the write clock

    function [7:0] value(input integer k);
        value = k * 37 + 5;
    endfunction

    initial begin
        errors = 0; wcount = 0; rcount = 0;
        rst = 1; wr_en = 0; rd_en = 0; wr_data = 0;
        repeat (5) @(posedge wr_clk);
        #1; rst = 0;
        #1;
        if (rd_empty !== 1'b1) begin errors = errors + 1; $display("FAIL: rd_empty=%b after reset (exp 1)", rd_empty); end
        if (wr_full  !== 1'b0) begin errors = errors + 1; $display("FAIL: wr_full=%b after reset (exp 0)", wr_full); end

        fork
            // Writer: push N values, stalling while the FIFO is full
            begin : writer
                while (wcount < N) begin
                    @(negedge wr_clk);
                    if (wr_full === 1'b0) begin
                        wr_data = value(wcount); wr_en = 1;
                        @(posedge wr_clk); #1; wr_en = 0;
                        wcount = wcount + 1;
                    end
                end
            end
            // Reader: start late so the FIFO fills up, then drain it in order
            begin : reader
                repeat (60) @(posedge rd_clk);
                waited = 0;
                while (rcount < N && waited < 4000) begin
                    @(negedge rd_clk);
                    waited = waited + 1;
                    if (rd_empty === 1'b0) begin
                        if (rd_data !== value(rcount)) begin
                            errors = errors + 1;
                            if (errors < 6) $display("FAIL: read %0d = %h, exp %h", rcount, rd_data, value(rcount));
                        end
                        rd_en = 1;
                        @(posedge rd_clk); #1; rd_en = 0;
                        rcount = rcount + 1;
                    end
                end
            end
        join

        if (rcount != N) begin
            errors = errors + 1;
            $display("FAIL: read back %0d of %0d values (wrote %0d)", rcount, N, wcount);
        end
        if (errors == 0) $display("ALL TESTS PASSED");
        else $display("TESTS FAILED: %0d error(s)", errors);
        $finish;
    end

    // Writer stuck on wr_full forever = the FIFO never drains
    initial begin #400000; $display("FAIL: timed out (wrote %0d, read %0d)", wcount, rcount); $finish; end
endmodule
`,
},

// ─── 12.05 — Configurable PWM Block ──────────────────────────────────────
{
  id: "configurable-pwm", slug: "configurable-pwm",
  title: "Configurable PWM Block",
  difficulty: "advanced", category: "interface",
  tags: ["PWM", "configurable", "interview", "control", "timing"],
  learningLevel: "Verilog Advanced",
  moduleId: "mod_fsm_advanced", orderIndex: 45,
  xpReward: 270, waveformRequired: true,
  expectedOutputMode: "stdout_compare",

  statement: `## Configurable PWM Block

A **Pulse-Width Modulation** generator with programmable period and duty cycle. Internal counter counts 0 to \`period\`; output is high while counter < \`duty\`. New period/duty values are captured at the **start of a new period** (shadow register technique) to prevent glitches.

**Registers** (written via write-enable interface)

| Register      | Width | Description                            |
|---------------|-------|----------------------------------------|
| \`period\`      | 8     | Counter max value (period−1)           |
| \`duty\`        | 8     | Duty cycle threshold (0 = always low)  |

**Interface**

| Port       | Direction | Width | Description                     |
|------------|-----------|-------|---------------------------------|
| \`clk\`      | input   | 1     | System clock                    |
| \`rst\`      | input   | 1     | Sync reset                      |
| \`wr_period\`| input   | 1     | Write enable for period         |
| \`wr_duty\`  | input   | 1     | Write enable for duty           |
| \`wr_data\`  | input   | 8     | Data for writes                 |
| \`pwm_out\`  | output  | 1     | PWM output signal               |

**Timing & Glitch Prevention**

1. **Shadow registers:** Store new values in temporary registers when written
2. **Period transition:** At counter = \`period_current\`, load shadow values into active registers
3. **No mid-period glitches:** Changes take effect only at period boundaries

**Behavior**
- Counter counts 0 to \`period\` continuously
- \`pwm_out = (counter < duty)\`
- When \`counter == period\`, reset to 0 and load any pending shadow updates
- If \`duty > period\`, PWM is always high (saturated)
- If \`duty = 0\`, PWM is always low

**Duty cycle examples**
- Period=100 (0–100, 101 values), Duty=50 → 50% duty cycle (high for 0–49)
- Period=100, Duty=0 → 0% (always low)
- Period=100, Duty=100+ → 100% (always high)

**Glitch-free updates:** A write to period or duty while PWM is running takes effect at the next period start, not immediately.`,

  constraints: [
    "Shadow register technique: new values latched but not applied until counter reaches period.",
    "Counter counts from 0 to period (inclusive); total period = period + 1 clocks.",
    "pwm_out = (counter < duty), computed combinationally from active registers.",
    "Updates are synchronous and glitch-free (no mid-period changes).",
    "If duty = 0, pwm_out is always 0. If duty > period, pwm_out is always 1.",
  ],
  examples: [
    { input: "period=9 (10 counts), duty=3", output: "pwm_out high for counts 0–2, low for 3–9 (30% duty)", explanation: "Normal PWM" },
    { input: "period=99, duty=0", output: "pwm_out always low", explanation: "0% duty cycle" },
    { input: "period=99, duty=100", output: "pwm_out always high", explanation: "Oversaturation (100% duty)" },
    { input: "Change period during operation", output: "New period takes effect at next counter wrap", explanation: "Glitch-free" },
    { input: "Rapid duty changes: 25%, 50%, 75%", output: "Duty changes smoothly at period boundaries", explanation: "No glitches" },
  ],
  hints: [
    { tier: 1, content: "Use two sets of registers: active (period_act, duty_act) and shadow (period_shd, duty_shd). On write, update shadow. On counter==period, transfer shadow to active and reset counter to 0." },
    { tier: 2, content: "Counter increments every cycle. When counter == period_act, next cycle: counter <= 0 and {period_act, duty_act} <= {period_shd, duty_shd}. Then `assign pwm_out = (counter < duty_act);`" },
    { tier: 3, content: "```\nalways @(posedge clk) begin\n  if (counter == period_act) begin\n    counter <= 0;\n    period_act <= period_shd;\n    duty_act <= duty_shd;\n  end else begin\n    counter <= counter + 1;\n  end\nend\nalways @(*) begin\n  if (wr_period) period_shd <= wr_data;\n  if (wr_duty) duty_shd <= wr_data;\nend\nassign pwm_out = (counter < duty_act);\n```" },
  ],
  publicTestcases: [], hiddenTestcases: [],

  starterCode: `\`timescale 1ns / 1ps

module configurable_pwm (
    input  wire       clk,
    input  wire       rst,
    input  wire       wr_period,
    input  wire       wr_duty,
    input  wire [7:0] wr_data,
    output wire       pwm_out
);

    // Shadow registers (written by user)
    reg [7:0] period_shd, duty_shd;
    
    // Active registers (used for PWM generation)
    reg [7:0] period_act, duty_act;
    
    // Counter
    reg [7:0] counter;

    // Write logic (shadow registers)
    always @(posedge clk) begin
        if (wr_period)
            period_shd <= wr_data;
        if (wr_duty)
            duty_shd <= wr_data;
    end

    // Counter and period transition logic
    always @(posedge clk) begin
        if (rst) begin
            counter    <= 8'd0;
            period_act <= 8'd99;   // default 100-count period
            duty_act   <= 8'd50;   // default 50% duty
        end else begin
            // TODO: increment counter
            // TODO: at period end, reset counter and load shadow registers
        end
    end

    // PWM output (combinational)
    // TODO: assign pwm_out

endmodule
`,

  publicTestbench: `\`timescale 1ns / 1ps
module tb_configurable_pwm;
    reg clk, rst, wr_period, wr_duty;
    reg [7:0] wr_data;
    wire pwm_out;
    integer i;
    
    configurable_pwm dut (.clk(clk),.rst(rst),
                          .wr_period(wr_period),.wr_duty(wr_duty),
                          .wr_data(wr_data),.pwm_out(pwm_out));
    
    initial clk = 0;
    always #5 clk = ~clk;
    
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_configurable_pwm); end
    
    initial begin
        $display("=== Configurable PWM Test ===");
        rst=1; wr_period=0; wr_duty=0; wr_data=0; @(posedge clk); #1; rst=0;
        
        // Test 1: 50% duty, period=9
        $display("Test 1: period=9 (10 counts), duty=5");
        wr_period=1; wr_data=8'd9; @(posedge clk); #1; wr_period=0;
        wr_duty=1;   wr_data=8'd5; @(posedge clk); #1; wr_duty=0;
        repeat(30) @(posedge clk);  // Let shadow load
        for (i=0; i<20; i=i+1) begin
            @(posedge clk); #1;
            $display("  clock %0d: pwm=%b", i, pwm_out);
        end
        
        // Test 2: Duty change mid-operation
        $display("Test 2: Change duty to 8 at period boundary");
        wr_duty=1; wr_data=8'd8; @(posedge clk); #1; wr_duty=0;
        repeat(20) @(posedge clk);
        #1; $display("After duty update: pwm should reflect 80%% duty");
        
        // Test 3: 0% duty (always low)
        $display("Test 3: Set duty=0 (always low)");
        wr_duty=1; wr_data=8'd0; @(posedge clk); #1; wr_duty=0;
        repeat(20) @(posedge clk);
        #1; $display("pwm_out=%b (expect 0 always)", pwm_out);
        
        $finish;
    end
endmodule
`,

  hiddenTestbench: `\`timescale 1ns / 1ps
module tb_configurable_pwm_hidden;
    reg clk, rst, wr_period, wr_duty;
    reg [7:0] wr_data;
    wire pwm_out;
    integer errors, h, prev, j;

    configurable_pwm dut (.clk(clk),.rst(rst),
                          .wr_period(wr_period),.wr_duty(wr_duty),
                          .wr_data(wr_data),.pwm_out(pwm_out));

    initial clk = 0;
    always #5 clk = ~clk;

    // Number of high samples over the next n clock cycles
    task count_high(input integer n, output integer high);
        integer k;
        begin
            high = 0;
            for (k = 0; k < n; k = k + 1) begin
                @(posedge clk); #1;
                if (pwm_out === 1'b1) high = high + 1;
            end
        end
    endtask

    task write_reg(input is_period, input [7:0] value);
        begin
            wr_data = value;
            if (is_period) wr_period = 1; else wr_duty = 1;
            @(posedge clk); #1;
            wr_period = 0; wr_duty = 0;
        end
    endtask

    task expect_high(input integer n, input integer want, input [8*40-1:0] what);
        begin
            count_high(n, h);
            if (h !== want) begin
                errors = errors + 1;
                $display("FAIL: %0s: %0d high cycles out of %0d, exp %0d", what, h, n, want);
            end
        end
    endtask

    initial begin
        errors = 0; wr_period = 0; wr_duty = 0; wr_data = 0;
        rst = 1; @(posedge clk); #1; rst = 0;

        // Defaults after reset: period 99 (100 counts), duty 50 -> 50%
        expect_high(100, 50, "defaults 99/50");

        // duty = 0: always low once the next period starts
        write_reg(0, 8'd0);
        repeat (110) @(posedge clk); #1;
        expect_high(100, 0, "duty 0");

        // period 9 (10 counts), duty 3 -> 3 of every 10 cycles
        write_reg(1, 8'd9);
        write_reg(0, 8'd3);
        repeat (110) @(posedge clk); #1;
        expect_high(100, 30, "period 9 duty 3");

        // Glitch-free: find the start of a period (pwm rises), write duty = 7
        // during it, and check the rest of this period still uses duty 3
        prev = 1;
        for (j = 0; j < 40; j = j + 1) begin
            @(posedge clk); #1;
            if (pwm_out === 1'b1 && prev == 0) j = 40;   // counter is 0 now
            else prev = (pwm_out === 1'b1);
        end
        write_reg(0, 8'd7);                                // counter is 1 now
        expect_high(8, 1, "rest of period after duty write");   // counts 2..9: only 2 < 3
        expect_high(10, 7, "next period with duty 7");

        // duty > period saturates high
        write_reg(0, 8'd20);
        repeat (25) @(posedge clk); #1;
        expect_high(50, 50, "duty > period");

        if (errors == 0) $display("ALL TESTS PASSED");
        else $display("TESTS FAILED: %0d error(s)", errors);
        $finish;
    end
endmodule
`,
},
/**
 * lib/problems/advanced-m14-capstones-part1.ts — M14 Capstone Problems (Part 1)
 *
 * 3 expert-tier problems for final integration:
 * 14.01 Serial Two's Complement Converter (Moore & Mealy compare)
 * 14.05 Gshare Branch Predictor
 * 14.06 3-Stage Pipelined Multiplier
 *
 * NO STARTER CODE. NO HINTS. User writes module skeleton from scratch.
 *
 * Append these to ADVANCED_PROBLEMS in advanced.ts BEFORE the closing ];
 */

// ─── 14.01 — Serial Two's Complement Converter (Moore & Mealy) ────────────
{
  id: "twos-comp-serial-converter", slug: "twos-comp-serial-converter",
  title: "Serial Two's Complement Converter (Moore & Mealy)",
  difficulty: "advanced", category: "state_machine",
  tags: ["capstone", "Moore", "Mealy", "interview", "two's-complement"],
  learningLevel: "Verilog Advanced",
  moduleId: "mod_capstone", orderIndex: 48,
  xpReward: 350, waveformRequired: true,
  expectedOutputMode: "stdout_compare",

  statement: `## Serial Two's Complement Converter — Moore & Mealy FSMs

A **serial bit stream** arrives LSB-first. Output the two's complement of that number, also bit-serial.

**Algorithm:** Pass bits unchanged until the first 1 is seen. After that, invert all subsequent bits.

**Example:** \`8'h05 = 0b00000101\`
- Bits in (LSB first): 1, 0, 1, 0, 0, 0, 0, 0
- Process: 1 (first 1, pass) → 0 (after first 1, invert) → 0 (invert) → 1 (invert) → 1 (invert) → 1 (invert) → 1 (invert) → 1 (invert)
- Bits out: 1, 1, 1, 1, 1, 1, 1, 1 = \`0xFB\` (two's complement of 5)

**Your task:**
1. **Part A:** Implement as a **Moore FSM**
2. **Part B:** Implement as a **Mealy FSM**
3. **Compare:** Count states. Explain why Mealy needs fewer states.

**Interface (same for both)**

| Port       | Direction | Description                          |
|------------|-----------|--------------------------------------|
| \`clk\`      | input   | Clock                                |
| \`rst\`      | input   | Async reset (both FSMs)              |
| \`bit_in\`   | input   | Serial input (LSB first)             |
| \`bit_out\`  | output  | Serial output (Moore or Mealy)       |

**Testbench:** Send \`8'h05, 8'hFF, 8'h00\` and 50 random 8-bit values. Verify output matches expected two's complement.

**Professional note:** This exact problem appears verbatim in Qualcomm and MediaTek interviews.`,

  constraints: [
    "Input is LSB-first (bit 0 first, then bit 1, etc.)",
    "Output is also LSB-first (same timing as input).",
    "Algorithm: pass until first 1, then invert all following bits.",
    "Implement both Moore and Mealy versions.",
    "For Moore: output depends only on state. For Mealy: output depends on state + input.",
  ],
  examples: [
    { input: "8'h05 (LSB-first: 1,0,1,0,0,0,0,0)", output: "8'hFB (LSB-first: 1,1,1,1,1,1,1,1)", explanation: "Two's complement of 5" },
    { input: "8'hFF (all 1s: 1,1,1,1,1,1,1,1)", output: "8'h01 (LSB-first: 1,0,0,0,0,0,0,0)", explanation: "Two's complement of -1 is 1" },
    { input: "8'h00 (all 0s: 0,0,0,0,0,0,0,0)", output: "8'h00 (all 0s)", explanation: "Zero's two's complement is zero" },
  ],
  hints: [],  // NO HINTS - expert problem

  starterCode: `\`timescale 1ns / 1ps

module twos_comp_moore (
    input  wire clk,
    input  wire rst,
    input  wire bit_in,
    output wire bit_out
);

    // Implement Moore FSM here
    
endmodule

module twos_comp_mealy (
    input  wire clk,
    input  wire rst,
    input  wire bit_in,
    output wire bit_out
);

    // Implement Mealy FSM here
    
endmodule
`,  // NO STARTER CODE - expert problem

  publicTestbench: `\`timescale 1ns / 1ps
module tb_twos_comp_serial;
    reg clk, rst, bit_in;
    wire bit_out;
    integer i, j;
    reg [7:0] input_val, expected_val, output_bits;
    
    // Instantiate both Moore and Mealy for comparison
    twos_comp_moore moore_dut (.clk(clk),.rst(rst),.bit_in(bit_in),.bit_out(bit_out));
    // twos_comp_mealy mealy_dut (.clk(clk),.rst(rst),.bit_in(bit_in),.bit_out(bit_out_mealy));
    
    initial clk = 0;
    always #5 clk = ~clk;
    
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_twos_comp_serial); end
    
    task send_byte_and_collect(input [7:0] byte_val);
        reg [7:0] received;
        $display("Input: 0x%h", byte_val);
        received = 8'h00;
        for (i=0; i<8; i=i+1) begin
            bit_in = byte_val[i];
            @(posedge clk); #1;
            received[i] = bit_out;
        end
        $display("  Output: 0x%h (expect 0x%h)", received, -byte_val);
    endtask
    
    initial begin
        $display("=== Two's Complement Converter Test ===");
        rst=1; bit_in=0; @(posedge clk); #1; rst=0;
        send_byte_and_collect(8'h05);
        send_byte_and_collect(8'hFF);
        send_byte_and_collect(8'h00);
        send_byte_and_collect(8'h80);
        $finish;
    end
endmodule
`,

  hiddenTestbench: `\`timescale 1ns / 1ps
module tb_twos_comp_serial_hidden;
    reg clk, rst, bit_in;
    wire moore_out, mealy_out;
    integer i, errors, test_idx;
    reg [7:0] test_vals [0:19];
    reg [7:0] input_val, moore_bits, mealy_bits, expected;

    twos_comp_moore moore (.clk(clk),.rst(rst),.bit_in(bit_in),.bit_out(moore_out));
    twos_comp_mealy mealy (.clk(clk),.rst(rst),.bit_in(bit_in),.bit_out(mealy_out));

    initial clk = 0;
    always #5 clk = ~clk;

    initial begin
        errors = 0;
        test_vals[0] = 8'h05; test_vals[1] = 8'hFF; test_vals[2] = 8'h00; test_vals[3] = 8'h80;
        test_vals[4] = 8'h01; test_vals[5] = 8'h55; test_vals[6] = 8'hAA; test_vals[7] = 8'h7F;
        for (i = 8; i < 20; i = i + 1) test_vals[i] = $random;
        bit_in = 0; rst = 0;
        @(posedge clk); #1;

        for (test_idx = 0; test_idx < 20; test_idx = test_idx + 1) begin
            input_val = test_vals[test_idx];
            expected  = -input_val;
            rst = 1; #2; rst = 0;            // each number is a new stream (async reset)
            for (i = 0; i < 8; i = i + 1) begin
                bit_in = input_val[i];       // LSB first
                #1 mealy_bits[i] = mealy_out;   // Mealy: output for this bit, before the edge
                @(posedge clk); #1;
                moore_bits[i] = moore_out;   // Moore: output once the bit has been clocked in
            end
            if (moore_bits !== expected) begin
                errors = errors + 1;
                $display("FAIL Moore: input=0x%h output=0x%h expected=0x%h", input_val, moore_bits, expected);
            end
            if (mealy_bits !== expected) begin
                errors = errors + 1;
                $display("FAIL Mealy: input=0x%h output=0x%h expected=0x%h", input_val, mealy_bits, expected);
            end
        end
        if (errors == 0) $display("ALL TESTS PASSED");
        else $display("TESTS FAILED: %0d error(s)", errors);
        $finish;
    end
endmodule
`,
},

// ─── 14.05 — Gshare Branch Predictor ─────────────────────────────────────
{
  id: "gshare-branch-predictor", slug: "gshare-branch-predictor",
  title: "Gshare Branch Predictor",
  difficulty: "advanced", category: "state_machine",
  tags: ["capstone", "branch-predictor", "interview", "machine-learning", "CPU"],
  learningLevel: "Verilog Advanced",
  moduleId: "mod_capstone", orderIndex: 49,
  xpReward: 360, waveformRequired: false,
  expectedOutputMode: "stdout_compare",

  statement: `## Gshare Branch Predictor

Implement a **Gshare predictor** for a 5-bit PC and 5-bit global history register (GHR). The PHT (Pattern History Table) is indexed by \`PC[4:0] XOR GHR[4:0]\`, with 32 entries of 2-bit saturating counters.

**Counters:**
- \`2'b00\` = strongly not taken
- \`2'b01\` = weakly not taken
- \`2'b10\` = weakly taken
- \`2'b11\` = strongly taken

**On each cycle:**
1. Compute index: \`pht_idx = pc[4:0] XOR ghr[4:0]\`
2. Read PHT[pht_idx] to make prediction
3. Input actual outcome (\`branch_taken\`)
4. Update counter at PHT[pht_idx]:
   - If actual=taken and counter<3: increment
   - If actual=not-taken and counter>0: decrement
5. Update GHR (shift left, insert new bit): \`ghr = {ghr[3:0], branch_taken}\`

**Interface**

| Port           | Direction | Description                         |
|----------------|-----------|-------------------------------------|
| \`clk\`          | input   | Clock                               |
| \`rst\`          | input   | Reset (initializes PHT to 2'b10)    |
| \`pc\`           | input   | Program counter (5 bits)            |
| \`branch_taken\` | input   | Actual branch outcome (1=taken)     |
| \`prediction\`   | output  | Predicted outcome (1=predict taken) |

**Prediction rule:** \`prediction = pht[pht_idx][1]\` (MSB of counter)

**Testbench notes:**
- Always-taken branch: counter saturates to \`2'b11\`, prediction always 1
- Always-not-taken: counter saturates to \`2'b00\`, prediction always 0
- Alternating branch: prediction accuracy oscillates, eventually settles
- Reset: verify PHT initialized to \`2'b10\` (weakly taken) across all 32 entries

This problem appears in RISC-V processor design interviews and ARM CPU design courses.`,

  constraints: [
    "PHT: 32 entries (5-bit index), each 2-bit saturating counter.",
    "GHR: 5-bit shift register updated on every branch.",
    "Index: pht_idx = pc XOR ghr (bit-wise).",
    "Prediction: MSB of counter (pht[idx][1]).",
    "Counter update: saturating increment/decrement (don't overflow/underflow).",
  ],
  examples: [
    { input: "Always branch taken (pc=0, branch_taken=1 for 100 cycles)", output: "Counter at PHT[0] saturates to 2'b11; prediction=1 after 3 cycles", explanation: "Strong prediction converges" },
    { input: "Branch at pc=5, outcome alternates (1,0,1,0...)", output: "Prediction lags actual by ~1 cycle; accuracy stabilizes at ~50%", explanation: "Alternating pattern" },
    { input: "Reset", output: "PHT[0..31] all 2'b10, GHR=0", explanation: "Initialization" },
  ],
  hints: [],  // NO HINTS

  starterCode: `\`timescale 1ns / 1ps

module gshare_branch_predictor (
    input  wire       clk,
    input  wire       rst,
    input  wire [4:0] pc,
    input  wire       branch_taken,
    output wire       prediction
);

    // PHT: 32×2-bit counters
    // GHR: 5-bit global history register
    // Index: pc XOR ghr
    // Prediction: MSB of counter at PHT[index]
    
endmodule
`,  // NO STARTER CODE

  publicTestbench: `\`timescale 1ns / 1ps
module tb_gshare_branch_predictor;
    reg clk, rst;
    reg [4:0] pc;
    reg branch_taken;
    wire prediction;
    integer i, cycle;
    
    gshare_branch_predictor dut (.clk(clk),.rst(rst),.pc(pc),.branch_taken(branch_taken),.prediction(prediction));
    
    initial clk = 0;
    always #5 clk = ~clk;
    
    initial begin
        $display("=== Gshare Branch Predictor Test ===");
        rst=1; pc=0; branch_taken=0; @(posedge clk); #1; rst=0;
        
        // Test 1: Always taken
        $display("Test 1: Always-taken branch at PC=0");
        pc=5'h00;
        for (i=0; i<10; i=i+1) begin
            branch_taken=1;
            @(posedge clk); #1;
            $display("  cycle %0d: pred=%b (expect converge to 1)", i, prediction);
        end
        
        // Test 2: Alternating
        $display("Test 2: Alternating branch at PC=5");
        pc=5'h05;
        for (i=0; i<8; i=i+1) begin
            branch_taken = (i%2);
            @(posedge clk); #1;
            $display("  cycle %0d: actual=%b pred=%b", i, (i%2), prediction);
        end
        
        $finish;
    end
endmodule
`,

  hiddenTestbench: `\`timescale 1ns / 1ps
module tb_gshare_branch_predictor_hidden;
    reg clk, rst;
    reg [4:0] pc;
    reg branch_taken;
    wire prediction;
    integer i, errors;
    reg [1:0] m_pht [0:31];     // model of the predictor
    reg [4:0] m_ghr;
    reg [4:0] idx;

    gshare_branch_predictor dut (.clk(clk),.rst(rst),.pc(pc),.branch_taken(branch_taken),.prediction(prediction));

    initial clk = 0;
    always #5 clk = ~clk;

    // Present one branch: check the prediction, then clock in the real outcome
    task step(input [4:0] p, input t);
        begin
            pc = p; branch_taken = t; #1;
            idx = p ^ m_ghr;
            if (prediction !== m_pht[idx][1]) begin
                errors = errors + 1;
                if (errors < 6) $display("FAIL: pc=%0d ghr=%b prediction=%b exp %b", p, m_ghr, prediction, m_pht[idx][1]);
            end
            @(posedge clk); #1;
            if (t && m_pht[idx] != 2'b11)       m_pht[idx] = m_pht[idx] + 2'b01;
            else if (!t && m_pht[idx] != 2'b00) m_pht[idx] = m_pht[idx] - 2'b01;
            m_ghr = {m_ghr[3:0], t};
        end
    endtask

    initial begin
        errors = 0;
        for (i = 0; i < 32; i = i + 1) m_pht[i] = 2'b10;    // reset value: weakly taken
        m_ghr = 5'b0;
        rst = 1; pc = 0; branch_taken = 0; @(posedge clk); #1; rst = 0;

        for (i = 0; i < 12; i = i + 1) step(5'h00, 1'b1);           // always taken
        for (i = 0; i < 12; i = i + 1) step(5'h0A, 1'b0);           // always not taken
        for (i = 0; i < 20; i = i + 1) step(5'h15, i[0]);           // alternating
        for (i = 0; i < 100; i = i + 1) step($random, $random);     // anything goes

        if (errors == 0) $display("ALL TESTS PASSED");
        else $display("TESTS FAILED: %0d error(s)", errors);
        $finish;
    end
endmodule
`,
},

// ─── 14.06 — 3-Stage Pipelined Multiplier ────────────────────────────────
{
  id: "pipelined-multiplier-3stage", slug: "pipelined-multiplier-3stage",
  title: "3-Stage Pipelined Multiplier (8x8)",
  difficulty: "advanced", category: "pipeline",
  tags: ["capstone", "multiplier", "pipeline", "interview", "datapath"],
  learningLevel: "Verilog Advanced",
  moduleId: "mod_capstone", orderIndex: 50,
  xpReward: 370, waveformRequired: true,
  expectedOutputMode: "stdout_compare",

  statement: `## 3-Stage Pipelined 8×8 Multiplier

Design an **8-bit unsigned multiplier** with **3 pipeline stages** for 1 result per cycle throughput after pipeline fills.

**Stages:**
1. **Stage 1:** Generate 8 partial products (8 x 8-bit values = 64 bits total)
2. **Stage 2:** Reduce partial products using a 4-2 adder tree, produce 2 rows
3. **Stage 3:** Final add of 2 rows → 16-bit product

**Interface**

| Port        | Direction | Width | Description                         |
|-------------|-----------|-------|-------------------------------------|
| \`clk\`       | input   | 1     | Clock                               |
| \`rst\`       | input   | 1     | Sync reset                          |
| \`valid_in\`  | input   | 1     | Input valid (start multiplication)  |
| \`a\`         | input   | 8     | Multiplicand                        |
| \`b\`         | input   | 8     | Multiplier                          |
| \`product\`   | output  | 16    | 16-bit result                       |
| \`valid_out\` | output  | 1     | Output valid (pipelined)            |

**Key properties:**
- **Latency:** 3 cycles (from valid_in to valid_out)
- **Throughput:** 1 result per cycle (after pipeline fills)
- **Correctness:** \`8'hFF × 8'hFF = 16'hFE01\` (255 × 255 = 65025 = 0xFE01)

**Why 4-2 adder tree?** A 4-2 compressor (or Dadda multiplier tree) reduces 8 rows → 2 rows in logarithmic depth, keeping Stage 2 fast. Stage 3 is a simple 16-bit final adder.

This is a classic interview problem that tests pipeline design, partial product generation, and datapath optimization.`,

  constraints: [
    "Stage 1: Compute 8 partial products (one per bit of b); latch in registers.",
    "Stage 2: Reduce 8 rows to 2 rows using a 4-2 adder tree or Wallace tree logic; latch in registers.",
    "Stage 3: Final 16-bit addition; latch result in registers.",
    "valid_out is registered; valid_out[t] = valid_in[t-3].",
    "Throughput: one new result available every cycle (once pipeline is full).",
    "Support flushing: set valid_in=0 for 3 cycles, output should settle with last valid result.",
  ],
  examples: [
    { input: "valid_in=1, a=8'h02, b=8'h03 at t=0", output: "valid_out=1, product=0x0006 at t=3", explanation: "2×3=6, 3-cycle latency" },
    { input: "Back-to-back inputs: valid_in pulses every cycle", output: "valid_out pulses every cycle starting at t=3", explanation: "Sustained throughput" },
    { input: "a=8'hFF, b=8'hFF", output: "product=16'hFE01 (65025)", explanation: "255×255 test case" },
  ],
  hints: [],  // NO HINTS

  starterCode: `\`timescale 1ns / 1ps

module pipelined_multiplier_3stage (
    input  wire       clk,
    input  wire       rst,
    input  wire       valid_in,
    input  wire [7:0] a,
    input  wire [7:0] b,
    output wire [15:0] product,
    output wire       valid_out
);

    // Stage 1: Partial products (8 rows)
    // Stage 2: 4-2 adder tree reduction → 2 rows
    // Stage 3: Final 16-bit addition
    // Latency: 3 cycles
    
endmodule
`,  // NO STARTER CODE

  publicTestbench: `\`timescale 1ns / 1ps
module tb_pipelined_multiplier_3stage;
    reg clk, rst, valid_in;
    reg [7:0] a, b;
    wire [15:0] product;
    wire valid_out;
    integer i;
    
    pipelined_multiplier_3stage dut (.clk(clk),.rst(rst),.valid_in(valid_in),
                                      .a(a),.b(b),.product(product),.valid_out(valid_out));
    
    initial clk = 0;
    always #5 clk = ~clk;
    
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_pipelined_multiplier_3stage); end
    
    initial begin
        $display("=== 3-Stage Pipelined Multiplier Test ===");
        rst=1; valid_in=0; a=0; b=0; @(posedge clk); #1; rst=0;
        
        // Single input
        $display("Test 1: Single input (2 × 3)");
        valid_in=1; a=8'h02; b=8'h03; @(posedge clk); #1; valid_in=0;
        for (i=0; i<5; i=i+1) begin
            @(posedge clk); #1;
            $display("  cycle %0d: valid_out=%b product=0x%h (expect 0x0006 at cycle 3)", i, valid_out, product);
        end
        
        // Sustained throughput
        $display("Test 2: Back-to-back inputs");
        for (i=0; i<10; i=i+1) begin
            valid_in=1; a=i; b=i+1;
            @(posedge clk); #1;
            $display("  cycle %0d: valid_out=%b product=0x%h (expect %0d)", i, valid_out, product, i*(i+1));
        end
        valid_in=0;
        repeat(5) @(posedge clk);
        
        $finish;
    end
endmodule
`,

  hiddenTestbench: `\`timescale 1ns / 1ps
module tb_pipelined_multiplier_3stage_hidden;
    reg clk, rst, valid_in;
    reg [7:0] a, b;
    wire [15:0] product;
    wire valid_out;
    integer i, errors;
    reg [15:0] expected;
    
    pipelined_multiplier_3stage dut (.clk(clk),.rst(rst),.valid_in(valid_in),
                                      .a(a),.b(b),.product(product),.valid_out(valid_out));
    
    initial clk = 0;
    always #5 clk = ~clk;
    
    initial begin
        errors = 0;
        rst=1; valid_in=0; a=0; b=0; @(posedge clk); #1; rst=0;
        
        // Test 1: Latency test (3 cycles)
        $display("Test 1: 3-cycle latency");
        valid_in=1; a=8'h05; b=8'h07; @(posedge clk); #1; valid_in=0;
        expected = 8'h05 * 8'h07;  // 35
        @(posedge clk); #1; if(valid_out!==1'b0) begin errors=errors+1; $display("FAIL: valid_out at cycle 1"); end
        @(posedge clk); #1; if(valid_out!==1'b0) begin errors=errors+1; $display("FAIL: valid_out at cycle 2"); end
        @(posedge clk); #1; if(valid_out!==1'b1) begin errors=errors+1; $display("FAIL: valid_out at cycle 3"); end
        if(product !== expected) begin errors=errors+1; $display("FAIL: product=%h exp %h", product, expected); end
        
        // Test 2: FF × FF = FE01
        $display("Test 2: 255×255=65025 (0xFE01)");
        valid_in=1; a=8'hFF; b=8'hFF; @(posedge clk); #1; valid_in=0;
        repeat(3) @(posedge clk);
        #1;
        if(product !== 16'hFE01) begin errors=errors+1; $display("FAIL: 255×255 got %h exp FE01", product); end
        
        // Test 3: Throughput (back-to-back)
        $display("Test 3: Sustained throughput");
        for (i=0; i<12; i=i+1) begin
            valid_in = (i < 10) ? 1 : 0;
            a = i; b = i+1;
            @(posedge clk); #1;
            if (i >= 3) begin
                expected = (i-3) * (i-2);
                if (valid_out && product !== expected) begin
                    errors=errors+1;
                    $display("FAIL: i=%0d product=%h exp %h", i, product, expected);
                end
            end
        end
        
        if (errors == 0) $display("ALL TESTS PASSED");
        else $display("TESTS FAILED: %0d error(s)", errors);
        $finish;
    end
endmodule
`,
},
/**
 * lib/problems/advanced-m14-final.ts — M14 Capstone Problems (Final 2 of 5)
 *
 * 14.02 HDLC Bit-Stuffing Receiver
 * 14.04 Conway's Game of Life (16×16 Torus)
 *
 * Expert tier, NO hints, complete testbenches.
 * Append to ADVANCED_PROBLEMS before ];
 */

// ─── 14.02 — HDLC Bit-Stuffing Receiver ──────────────────────────────────
{
  id: "hdlc-bit-stuffing-receiver", slug: "hdlc-bit-stuffing-receiver",
  title: "HDLC Bit-Stuffing Receiver",
  difficulty: "advanced", category: "state_machine",
  tags: ["capstone", "HDLC", "protocol", "bit-stuffing", "interview"],
  learningLevel: "Verilog Advanced",
  moduleId: "mod_capstone", orderIndex: 51,
  xpReward: 380, waveformRequired: true,
  expectedOutputMode: "stdout_compare",

  statement: `## HDLC Bit-Stuffing Receiver

Implement a receiver for **High-Level Data Link Control** frames. HDLC uses the flag sequence **01111110** to mark frame boundaries. To prevent data from accidentally matching this pattern, a **0 is inserted after every five consecutive 1 bits** in the data stream (bit stuffing).

Your receiver must:
1. **Detect frame start/end:** Recognize \`01111110\` (flag)
2. **Strip inserted zeros:** Remove the stuffed 0 after every five consecutive 1s
3. **Output clean bytes:** Assemble and output data bytes with \`byte_valid\` pulse (bits arrive LSB first)
4. **Flag abort:** If seven or more consecutive 1s are seen, declare protocol error (\`abort\`)

**Interface**

| Port        | Direction | Description                             |
|-------------|-----------|------------------------------------------|
| \`clk\`       | input   | Clock                                    |
| \`rst\`       | input   | Async reset                              |
| \`bit_in\`    | input   | Serial bit input (1 bit per cycle)       |
| \`byte_out\`  | output  | Decoded byte output                      |
| \`byte_valid\`| output  | 1-cycle pulse when byte ready            |
| \`frame_start\`| output | 1-cycle pulse on flag (start)            |
| \`frame_end\` | output  | 1-cycle pulse on flag (end)              |
| \`abort\`     | output  | 1-cycle pulse on protocol error (7+ones) |

**Example frame:**
\`\`\`
Bitstream (with flags and stuffing):
01111110 [data bits with stuffed 0s] 01111110

Data: 1111_1111 (8 ones)
Transmitted: 1111 1 0 111 (5 ones, then stuff 0, then 3 more)
Received: 11111[0]111 → receiver strips [0] → outputs 1111_1111
\`\`\`

**State machine:**
- **IDLE:** Wait for flag (01111110)
- **FRAME_ACTIVE:** Receive bits, count consecutive ones
  - After 5 consecutive ones: expect a 0 (and discard it)
  - If 6th bit is 0: stuff bit, continue
  - If 6th bit is 1: could be flag (check 7th)
  - If 7 or more ones: abort
- **FLAG_DETECTED:** On flag, pulse \`frame_end\`, return to IDLE

**Bit counting logic:**
- Counter increments for each 1 bit received
- Counter resets to 0 on each 0 bit
- After counter reaches 5 and next bit is 0: discard the 0 (stuff bit)
- After counter reaches 6 and next bit is 1: check if 7th bit is also 1 (abort condition)

This appears in networking hardware (SONET, ISDN, legacy serial protocols) and embedded systems interviews.`,

  constraints: [
    "Flag sequence: 01111110 marks frame boundaries.",
    "Bit stuffing: 0 inserted after every five consecutive 1s (removed on receive).",
    "Abort: Seven or more consecutive 1s = protocol error.",
    "byte_valid: 1-cycle pulse when 8 bits assembled into byte.",
    "frame_start/frame_end: 1-cycle pulses on flag detection.",
  ],
  examples: [
    { input: "Flag-data-flag: 01111110 11111011 01111110", output: "byte_valid pulse for 0xFB after removing stuffed 0", explanation: "Data extraction" },
    { input: "Two consecutive flags: 01111110 01111110", output: "frame_start, then frame_end (empty frame)", explanation: "Empty frame allowed" },
    { input: "Seven ones: ...0111111 1...", output: "abort pulse", explanation: "Protocol violation detected" },
  ],
  hints: [],

  starterCode: `\`timescale 1ns / 1ps

module hdlc_bit_stuffing_receiver (
    input  wire       clk,
    input  wire       rst,
    input  wire       bit_in,
    output reg  [7:0] byte_out,
    output reg        byte_valid,
    output reg        frame_start,
    output reg        frame_end,
    output reg        abort
);

    // State machine for frame detection and bit stuffing
    // Counter for consecutive 1s
    // Shift register for byte assembly
    
endmodule
`,

  publicTestbench: `\`timescale 1ns / 1ps
module tb_hdlc_bit_stuffing_receiver;
    reg clk, rst, bit_in;
    wire [7:0] byte_out;
    wire byte_valid, frame_start, frame_end, abort;
    integer i;
    
    hdlc_bit_stuffing_receiver dut (.clk(clk),.rst(rst),.bit_in(bit_in),
                                     .byte_out(byte_out),.byte_valid(byte_valid),
                                     .frame_start(frame_start),.frame_end(frame_end),.abort(abort));
    
    initial clk = 0;
    always #5 clk = ~clk;
    
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_hdlc_bit_stuffing_receiver); end
    
    task send_bits(input [31:0] bits, input [5:0] count);
        integer i;
        for (i=0; i<count; i=i+1) begin
            bit_in = bits[i];
            @(posedge clk);
        end
    endtask
    
    initial begin
        $display("=== HDLC Bit-Stuffing Receiver Test ===");
        rst=1; bit_in=0; @(posedge clk); #1; rst=0;
        
        // Test 1: Flag detection
        $display("Test 1: Flag (01111110)");
        send_bits(32'b01111110, 8);
        @(posedge clk); #1;
        $display("  frame_start=%b (expect 1)", frame_start);
        
        // Test 2: Data with stuff bit
        $display("Test 2: Data 0xFB with stuffing");
        // 1111_1011 → transmit as 11111[0]011
        send_bits(32'b111110011, 9);  // 5 ones, stuff 0, 3 bits
        repeat(5) @(posedge clk);  // Wait for byte assembly
        #1; $display("  byte_out=%h (expect FB)", byte_out);
        
        // Test 3: Flag end
        send_bits(32'b01111110, 8);
        @(posedge clk); #1;
        $display("  frame_end=%b (expect 1)", frame_end);
        
        $finish;
    end
endmodule
`,

  hiddenTestbench: `\`timescale 1ns / 1ps
module tb_hdlc_bit_stuffing_receiver_hidden;
    reg clk, rst, bit_in;
    wire [7:0] byte_out;
    wire byte_valid, frame_start, frame_end, abort;
    integer errors, nbytes, nstart, nend, nabort, tx_ones;
    reg [7:0] got [0:15];

    hdlc_bit_stuffing_receiver dut (.clk(clk),.rst(rst),.bit_in(bit_in),
                                     .byte_out(byte_out),.byte_valid(byte_valid),
                                     .frame_start(frame_start),.frame_end(frame_end),.abort(abort));

    initial clk = 0;
    always #5 clk = ~clk;

    // All outputs are 1-cycle pulses: collect them as they happen
    always @(posedge clk) begin
        if (byte_valid === 1'b1)  begin if (nbytes < 16) got[nbytes] = byte_out; nbytes = nbytes + 1; end
        if (frame_start === 1'b1) nstart = nstart + 1;
        if (frame_end === 1'b1)   nend = nend + 1;
        if (abort === 1'b1)       nabort = nabort + 1;
    end

    task send_bit(input b);
        begin
            bit_in = b; @(posedge clk); #1;
        end
    endtask

    task send_flag;                       // 01111110, never stuffed
        integer k;
        begin
            for (k = 0; k < 8; k = k + 1) send_bit(k != 0 && k != 7);
            tx_ones = 0;
        end
    endtask

    task send_data(input [7:0] v);        // LSB first, a 0 stuffed after five 1s
        integer k;
        begin
            for (k = 0; k < 8; k = k + 1) begin
                send_bit(v[k]);
                tx_ones = v[k] ? tx_ones + 1 : 0;
                if (tx_ones == 5) begin send_bit(1'b0); tx_ones = 0; end
            end
        end
    endtask

    task idle;
        begin
            repeat (4) send_bit(1'b0);
            nbytes = 0; nstart = 0; nend = 0; nabort = 0;
        end
    endtask

    task expect_counts(input integer s, input integer b, input integer e, input integer a, input [8*24-1:0] what);
        begin
            repeat (3) send_bit(1'b0);
            if (nstart !== s || nbytes !== b || nend !== e || nabort !== a) begin
                errors = errors + 1;
                $display("FAIL %0s: frame_start=%0d bytes=%0d frame_end=%0d abort=%0d (exp %0d/%0d/%0d/%0d)",
                         what, nstart, nbytes, nend, nabort, s, b, e, a);
            end
        end
    endtask

    task expect_byte(input integer n, input [7:0] v);
        begin
            if (got[n] !== v) begin
                errors = errors + 1;
                $display("FAIL: byte %0d = %h exp %h", n, got[n], v);
            end
        end
    endtask

    initial begin
        errors = 0; nbytes = 0; nstart = 0; nend = 0; nabort = 0; tx_ones = 0;
        rst = 1; bit_in = 0; @(posedge clk); #1; rst = 0;

        // Test 1: plain frame
        idle;
        send_flag; send_data(8'hAA); send_data(8'h55); send_flag;
        expect_counts(1, 2, 1, 0, "plain frame");
        expect_byte(0, 8'hAA); expect_byte(1, 8'h55);

        // Test 2: runs of ones that need stuffing (including a flag-like byte)
        idle;
        send_flag; send_data(8'hFF); send_data(8'h7E); send_data(8'hF8); send_data(8'h3F); send_flag;
        expect_counts(1, 4, 1, 0, "stuffed frame");
        expect_byte(0, 8'hFF); expect_byte(1, 8'h7E); expect_byte(2, 8'hF8); expect_byte(3, 8'h3F);

        // Test 3: seven 1s in a row aborts the frame
        idle;
        send_flag; repeat (7) send_bit(1'b1);
        expect_counts(1, 0, 0, 1, "abort");

        // Test 4: a new frame after the abort works
        idle;
        send_flag; send_data(8'h12); send_flag;
        expect_counts(1, 1, 1, 0, "frame after abort");
        expect_byte(0, 8'h12);

        if (errors == 0) $display("ALL TESTS PASSED");
        else $display("TESTS FAILED: %0d error(s)", errors);
        $finish;
    end
endmodule
`,
},

// ─── 14.04 — Conway's Game of Life (16×16 Torus) ─────────────────────────
{
  id: "game-of-life-16x16", slug: "game-of-life-16x16",
  title: "Conway's Game of Life (16x16 Torus)",
  difficulty: "advanced", category: "state_machine",
  tags: ["capstone", "cellular-automaton", "generate", "interview", "combinational"],
  learningLevel: "Verilog Advanced",
  moduleId: "mod_capstone", orderIndex: 52,
  xpReward: 390, waveformRequired: true,
  expectedOutputMode: "stdout_compare",

  statement: `## Conway's Game of Life — 16×16 Torus Grid

Implement the full **Conway's Game of Life** on a 16×16 grid with **toroidal wrapping** (edges connect to opposite edges). Each cell updates simultaneously based on its 8 neighbors.

**Rules:**
- **Live cell with 2–3 neighbors:** survives
- **Dead cell with exactly 3 neighbors:** born
- **All other cells:** die or stay dead

**Grid topology:** Torus (wrap-around):
- Cell [0][0] neighbors include [15][15], [15][0], [15][1], [0][15], [0][1], [1][15], [1][0], [1][1]
- Cell [15][15] neighbors include [14][14], [14][15], [14][0], [15][14], [15][0], [0][14], [0][15], [0][0]

**Interface**

| Port       | Direction | Width | Description                       |
|------------|-----------|-------|-----------------------------------|
| \`clk\`      | input   | 1     | Clock                             |
| \`rst\`      | input   | 1     | Sync reset (all dead)             |
| \`load\`     | input   | 1     | Load initial state                |
| \`load_data\`| input   | 256   | 256-bit grid (packed 16×16)       |
| \`grid_out\` | output  | 256   | Current grid state (packed)       |
| \`generation\`| output | 32   | Generation counter                |

**Packing:** \`load_data[y*16 + x]\` = cell state at [y][x]
- 0 = dead, 1 = alive

**Neighbor counting:** For each cell [y][x]:
- Count alive neighbors from 8-neighborhood (with wrap-around)
- Combinational logic using \`generate\` loops preferred

**Next-state logic:**
\`\`\`
next_grid[y][x] = (grid[y][x] && (neighbors==2 || neighbors==3)) ||
                  (!grid[y][x] && neighbors==3)
\`\`\`

**Registers:**
- \`grid[15:0][15:0]\` current state
- \`next_grid[15:0][15:0]\` computed next state (combinational)
- \`generation[31:0]\` incremented every clock

On every clock: \`grid <= next_grid; generation <= generation + 1\`

**Test patterns:**
- **Blinker:** Period 2 (oscillates every 2 generations)
- **Block:** Static 2×2 square (never changes)
- **Glider:** Period 4, moves diagonally
- **Random seed:** Evolve for 100 generations, verify no crashes

This is a classic interview problem testing Verilog \`generate\`, parameterization, and combinational logic design.`,

  constraints: [
    "16×16 grid with toroidal boundary conditions (wrap-around).",
    "Each cell: (alive && (n==2||n==3)) || (!alive && n==3).",
    "Use `generate` loops for neighbor counting (strongly preferred).",
    "All cells update simultaneously (synchronous).",
    "load_data: 256-bit packed array [y*16+x] = grid[y][x].",
  ],
  examples: [
    { input: "Blinker (vertical line at x=5): [y=5..7][x=5] = 111", output: "Period 2: generation odd = horizontal, generation even = vertical", explanation: "Oscillator" },
    { input: "Block (2×2 square): [y=0..1][x=0..1] = 1111", output: "Unchanged forever", explanation: "Still life" },
    { input: "Glider at [0,0], evolves for 4 generations", output: "Returns to same pattern, translated diagonally", explanation: "Spaceship" },
  ],
  hints: [],

  starterCode: `\`timescale 1ns / 1ps

module game_of_life_16x16 (
    input  wire       clk,
    input  wire       rst,
    input  wire       load,
    input  wire [255:0] load_data,
    output wire [255:0] grid_out,
    output reg  [31:0]  generation
);

    // Grid state: grid[y][x]
    reg grid[15:0][15:0];
    
    // Next state (computed combinationally)
    wire next_grid[15:0][15:0];
    
    // Neighbor counters (computed combinationally for each cell)
    // Use generate loops to avoid repetition
    
    // Sequential logic: update grid every clock
    always @(posedge clk) begin
        if (rst) begin
            generation <= 32'b0;
            // Clear all cells
        end else if (load) begin
            // Load initial state from load_data
            generation <= 32'b0;
        end else begin
            // Update grid and increment generation
            generation <= generation + 1;
        end
    end
    
    // Pack grid state for output
    generate
        genvar y, x;
        for (y=0; y<16; y=y+1) begin
            for (x=0; x<16; x=x+1) begin
                assign grid_out[y*16 + x] = grid[y][x];
            end
        end
    endgenerate

endmodule
`,

  publicTestbench: `\`timescale 1ns / 1ps
module tb_game_of_life_16x16;
    reg clk, rst, load;
    reg [255:0] load_data;
    wire [255:0] grid_out;
    wire [31:0] generation;
    integer i;
    
    game_of_life_16x16 dut (.clk(clk),.rst(rst),.load(load),.load_data(load_data),
                             .grid_out(grid_out),.generation(generation));
    
    initial clk = 0;
    always #5 clk = ~clk;
    
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_game_of_life_16x16); end
    
    initial begin
        $display("=== Conway's Game of Life Test ===");
        rst=1; load=0; load_data=0; @(posedge clk); #1; rst=0;
        
        // Test 1: Blinker (vertical → horizontal → vertical)
        $display("Test 1: Blinker pattern");
        // Vertical: row 5, cols 4,5,6
        load_data = 256'h0;
        load_data[5*16 + 4] = 1;
        load_data[5*16 + 5] = 1;
        load_data[5*16 + 6] = 1;
        load=1; @(posedge clk); #1; load=0;
        
        // Generation 0: vertical (just loaded)
        $display("  gen 0: display vertical");
        
        // Generation 1: should be horizontal
        @(posedge clk); #1;
        $display("  gen 1: display horizontal");
        
        // Generation 2: back to vertical
        @(posedge clk); #1;
        $display("  gen 2: display vertical (period 2 confirmed)");
        
        // Test 2: Still life (block)
        $display("Test 2: Block (still life)");
        rst=1; @(posedge clk); #1; rst=0;
        load_data = 256'h0;
        // 2x2 block at top-left: [0,0], [0,1], [1,0], [1,1]
        load_data[0*16 + 0] = 1;
        load_data[0*16 + 1] = 1;
        load_data[1*16 + 0] = 1;
        load_data[1*16 + 1] = 1;
        load=1; @(posedge clk); #1; load=0;
        
        repeat(10) @(posedge clk);
        #1; $display("  After 10 gens: block should be unchanged");
        
        $finish;
    end
endmodule
`,

  hiddenTestbench: `\`timescale 1ns / 1ps
module tb_game_of_life_16x16_hidden;
    reg clk, rst, load;
    reg [255:0] load_data;
    wire [255:0] grid_out;
    wire [31:0] generation;
    integer i, y, x, errors;
    reg [255:0] start, expect_grid;

    game_of_life_16x16 dut (.clk(clk),.rst(rst),.load(load),.load_data(load_data),
                             .grid_out(grid_out),.generation(generation));

    initial clk = 0;
    always #5 clk = ~clk;

    task load_grid(input [255:0] g);
        begin
            load_data = g; load = 1; @(posedge clk); #1; load = 0;
        end
    endtask

    task check(input [255:0] want, input [8*48-1:0] what);
        begin
            if (grid_out !== want) begin
                errors = errors + 1;
                $display("FAIL: %0s", what);
            end
        end
    endtask

    initial begin
        errors = 0;
        rst = 1; load = 0; load_data = 0; @(posedge clk); #1; rst = 0;

        // Test 1: load, then a horizontal blinker turns vertical and back
        start = 256'h0;
        start[5*16+4] = 1; start[5*16+5] = 1; start[5*16+6] = 1;
        load_grid(start);
        check(start, "grid_out after load");
        expect_grid = 256'h0;
        expect_grid[4*16+5] = 1; expect_grid[5*16+5] = 1; expect_grid[6*16+5] = 1;
        @(posedge clk); #1; check(expect_grid, "blinker generation 1");
        @(posedge clk); #1; check(start, "blinker generation 2");

        // Test 2: a block in the corner never changes
        start = 256'h0;
        start[0] = 1; start[1] = 1; start[16] = 1; start[17] = 1;
        load_grid(start);
        repeat (20) @(posedge clk);
        #1; check(start, "block changed");

        // Test 3: a glider moves (+1,+1) every 4 generations and, on a 16x16
        // torus, is back where it started after 64
        start = 256'h0;
        start[0*16+1] = 1; start[1*16+2] = 1; start[2*16+0] = 1; start[2*16+1] = 1; start[2*16+2] = 1;
        load_grid(start);
        repeat (4) @(posedge clk);
        #1;
        expect_grid = 256'h0;
        for (y = 0; y < 16; y = y + 1)
            for (x = 0; x < 16; x = x + 1)
                if (start[y*16+x]) expect_grid[((y+1)%16)*16 + (x+1)%16] = 1;
        check(expect_grid, "glider after 4 generations");
        repeat (60) @(posedge clk);
        #1; check(start, "glider after 64 generations (wrap-around)");

        // Test 4: reset clears the grid; generation counts clocks after a load
        rst = 1; @(posedge clk); #1; rst = 0;
        check(256'h0, "grid not cleared by reset");
        load_grid(start);
        for (i = 0; i < 10; i = i + 1) begin
            @(posedge clk); #1;
            if (generation !== i + 1) begin
                errors = errors + 1;
                $display("FAIL: generation=%0d exp %0d", generation, i + 1);
            end
        end

        if (errors == 0) $display("ALL TESTS PASSED");
        else $display("TESTS FAILED: %0d error(s)", errors);
        $finish;
    end
endmodule
`,
},
/**
 * TWO NEW ADVANCED PROBLEMS
 * Insert BEFORE closing ]; in /lib/problems/advanced.ts
 * orderIndex: 51 (Traffic Light), 52 (Vending Machine)
 * Module: mod_fsm_advanced
 */

// ─── Traffic Light FSM Controller ────────────────────────────────────────
{
  id: "traffic-light-controller", slug: "traffic-light-controller",
  title: "Traffic Light FSM Controller",
  difficulty: "advanced", category: "state_machine",
  tags: ["FSM", "control", "interview", "timer", "sequential"],
  learningLevel: "Verilog Advanced",
  moduleId: "mod_fsm_advanced", orderIndex: 46,
  xpReward: 310, waveformRequired: true,
  expectedOutputMode: "stdout_compare",

  statement: `## Traffic Light FSM Controller

Implement a 3-state **traffic light controller** with **configurable timer durations**. Supports RED → GREEN → YELLOW → RED cycle.

**States & Durations**
- RED: \`red_duration\` cycles (default 30)
- GREEN: \`green_duration\` cycles (default 20)
- YELLOW: \`yellow_duration\` cycles (default 5)

**Interface**

| Port             | Direction | Width | Description                        |
|------------------|-----------|-------|-------------------------------------|
| \`clk\`            | input   | 1     | Clock                              |
| \`rst\`            | input   | 1     | Sync reset (start at RED)          |
| \`red_duration\`   | input   | 8     | RED light duration (cycles)        |
| \`green_duration\` | input   | 8     | GREEN light duration (cycles)      |
| \`yellow_duration\`| input   | 8     | YELLOW light duration (cycles)     |
| \`red\`            | output  | 1     | RED light on                       |
| \`green\`          | output  | 1     | GREEN light on                     |
| \`yellow\`         | output  | 1     | YELLOW light on                    |

**Behavior:**
1. Reset → RED state, counter = 0
2. Count cycles; when counter == red_duration, transition to GREEN
3. Count cycles; when counter == green_duration, transition to YELLOW
4. Count cycles; when counter == yellow_duration, transition to RED
5. Cycle repeats

**Outputs:** One light on at a time (one-hot).

**Example:** red=30, green=20, yellow=5 → 55-cycle period`,

  constraints: [
    "One-hot output: exactly one light on at a time.",
    "Synchronous state transitions (on clock edge).",
    "Reset initializes to RED with counter=0.",
    "Configurable durations via input ports.",
  ],
  examples: [
    { input: "red_duration=30, green_duration=20, yellow_duration=5", output: "RED for 30 cycles, GREEN for 20, YELLOW for 5, repeat", explanation: "Normal cycle" },
    { input: "rst=1", output: "red=1, green=0, yellow=0", explanation: "Reset to RED" },
  ],
  hints: [],

  starterCode: `\`timescale 1ns / 1ps

module traffic_light_controller (
    input  wire       clk,
    input  wire       rst,
    input  wire [7:0] red_duration,
    input  wire [7:0] green_duration,
    input  wire [7:0] yellow_duration,
    output reg        red,
    output reg        green,
    output reg        yellow
);

    // State machine: RED, GREEN, YELLOW
    // Timer counter
    
endmodule
`,

  publicTestbench: `\`timescale 1ns / 1ps
module tb_traffic_light_controller;
    reg clk, rst;
    reg [7:0] red_dur, green_dur, yellow_dur;
    wire red, green, yellow;
    integer i;
    
    traffic_light_controller dut (.clk(clk),.rst(rst),
                                   .red_duration(red_dur),.green_duration(green_dur),.yellow_duration(yellow_dur),
                                   .red(red),.green(green),.yellow(yellow));
    
    initial clk = 0;
    always #5 clk = ~clk;
    
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_traffic_light_controller); end
    
    initial begin
        $display("=== Traffic Light Controller Test ===");
        rst=1; red_dur=3; green_dur=2; yellow_dur=1; @(posedge clk); #1; rst=0;
        
        for (i=0; i<12; i=i+1) begin
            @(posedge clk); #1;
            $display("cycle %0d: red=%b green=%b yellow=%b", i, red, green, yellow);
        end
        $finish;
    end
endmodule
`,

  hiddenTestbench: `\`timescale 1ns / 1ps
module tb_traffic_light_controller_hidden;
    reg clk, rst;
    reg [7:0] red_dur, green_dur, yellow_dur;
    wire red, green, yellow;
    integer i, errors;
    
    traffic_light_controller dut (.clk(clk),.rst(rst),
                                   .red_duration(red_dur),.green_duration(green_dur),.yellow_duration(yellow_dur),
                                   .red(red),.green(green),.yellow(yellow));
    
    initial clk = 0;
    always #5 clk = ~clk;
    
    initial begin
        errors = 0;
        rst=1; red_dur=3; green_dur=2; yellow_dur=1; @(posedge clk); #1; rst=0;
        
        // RED for 3 cycles
        for (i=0; i<3; i=i+1) begin
            @(posedge clk); #1;
            if (red !== 1'b1 || green !== 1'b0 || yellow !== 1'b0) begin
                errors=errors+1; $display("FAIL: RED cycle %0d", i);
            end
        end
        
        // GREEN for 2 cycles
        for (i=0; i<2; i=i+1) begin
            @(posedge clk); #1;
            if (green !== 1'b1 || red !== 1'b0 || yellow !== 1'b0) begin
                errors=errors+1; $display("FAIL: GREEN cycle %0d", i);
            end
        end
        
        // YELLOW for 1 cycle
        @(posedge clk); #1;
        if (yellow !== 1'b1 || red !== 1'b0 || green !== 1'b0) begin
            errors=errors+1; $display("FAIL: YELLOW");
        end
        
        // Should loop back to RED
        @(posedge clk); #1;
        if (red !== 1'b1) begin errors=errors+1; $display("FAIL: loop back to RED"); end
        
        if (errors == 0) $display("ALL TESTS PASSED");
        else $display("TESTS FAILED: %0d error(s)", errors);
        $finish;
    end
endmodule
`,
},

// ─── Vending Machine FSM ──────────────────────────────────────────────────
{
  id: "vending-machine-fsm", slug: "vending-machine-fsm",
  title: "Vending Machine FSM",
  difficulty: "advanced", category: "state_machine",
  tags: ["FSM", "control", "multi-condition", "interview", "combinational"],
  learningLevel: "Verilog Advanced",
  moduleId: "mod_fsm_advanced", orderIndex: 47,
  xpReward: 330, waveformRequired: true,
  expectedOutputMode: "stdout_compare",

  statement: `## Vending Machine FSM

Implement a **vending machine** that accepts coins, dispenses items, and gives change. Price is fixed at **$0.50** (50 cents). Accepts nickels ($0.05), dimes ($0.10), quarters ($0.25).

**States**
- IDLE: Waiting for coins
- ACCEPTING: Coins inserted, tracking balance
- DISPENSE: Item dispensed
- CHANGE: Returning excess coins

**Interface**

| Port           | Direction | Width | Description                        |
|----------------|-----------|-------|-------------------------------------|
| \`clk\`          | input   | 1     | Clock                              |
| \`rst\`          | input   | 1     | Sync reset (IDLE, balance=0)       |
| \`nickel\`       | input   | 1     | Nickel inserted (5 cents)          |
| \`dime\`         | input   | 1     | Dime inserted (10 cents)           |
| \`quarter\`      | input   | 1     | Quarter inserted (25 cents)        |
| \`balance\`      | output  | 8     | Current balance in cents           |
| \`dispense\`     | output  | 1     | Item dispensed (1-cycle pulse)     |
| \`change_due\`   | output  | 8     | Change to return (in cents)        |

**Logic:**
1. IDLE: balance=0, wait for coin
2. ACCEPTING: accumulate coins
3. When balance >= 50: 
   - DISPENSE item (pulse output)
   - Calculate change = balance - 50
   - CHANGE state: output change amount
   - Return to IDLE

**Rules:**
- One coin per cycle (nickel XOR dime XOR quarter)
- balance saturates at 255
- change_due only valid during CHANGE state

**Example:** Insert quarter + dime + quarter → balance=60 → dispense → change_due=10`,

  constraints: [
    "One-hot coin inputs: only one coin per cycle.",
    "Price: fixed at 50 cents.",
    "Accumulate balance across cycles.",
    "Dispense when balance >= 50.",
    "Calculate and output change.",
  ],
  examples: [
    { input: "Quarter (25) + Quarter (50) + Dime (10)", output: "After 2 cycles: dispense=1, change_due=10 (balance=60, price=50)", explanation: "Change returned" },
    { input: "Nickel + Nickel + Dime + Dime + Dime", output: "After 5 cycles: balance=50, dispense=1, change_due=0", explanation: "Exact amount" },
  ],
  hints: [],

  starterCode: `\`timescale 1ns / 1ps

module vending_machine_fsm (
    input  wire       clk,
    input  wire       rst,
    input  wire       nickel,
    input  wire       dime,
    input  wire       quarter,
    output reg  [7:0] balance,
    output reg        dispense,
    output reg  [7:0] change_due
);

    // States: IDLE, ACCEPTING, DISPENSE, CHANGE
    // Balance accumulation
    // Change calculation
    
endmodule
`,

  publicTestbench: `\`timescale 1ns / 1ps
module tb_vending_machine_fsm;
    reg clk, rst, nickel, dime, quarter;
    wire [7:0] balance;
    wire dispense;
    wire [7:0] change_due;
    integer i;
    
    vending_machine_fsm dut (.clk(clk),.rst(rst),.nickel(nickel),.dime(dime),.quarter(quarter),
                              .balance(balance),.dispense(dispense),.change_due(change_due));
    
    initial clk = 0;
    always #5 clk = ~clk;
    
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_vending_machine_fsm); end
    
    initial begin
        $display("=== Vending Machine Test ===");
        rst=1; nickel=0; dime=0; quarter=0; @(posedge clk); #1; rst=0;
        
        // Insert 2 quarters (50 cents)
        $display("Test 1: 2 Quarters");
        quarter=1; @(posedge clk); #1; quarter=0;
        $display("  After quarter 1: balance=%0d", balance);
        @(posedge clk); #1;
        quarter=1; @(posedge clk); #1; quarter=0;
        $display("  After quarter 2: balance=%0d, dispense=%b, change=%0d", balance, dispense, change_due);
        @(posedge clk); #1;
        
        // Insert 60 cents
        $display("Test 2: Quarter + Dime + Quarter + Dime");
        quarter=1; @(posedge clk); #1; quarter=0;
        @(posedge clk); #1;
        dime=1; @(posedge clk); #1; dime=0;
        @(posedge clk); #1;
        $display("  balance=%0d, dispense=%b, change=%0d", balance, dispense, change_due);
        
        $finish;
    end
endmodule
`,

  hiddenTestbench: `\`timescale 1ns / 1ps
module tb_vending_machine_fsm_hidden;
    reg clk, rst, nickel, dime, quarter;
    wire [7:0] balance;
    wire dispense;
    wire [7:0] change_due;
    integer errors;
    
    vending_machine_fsm dut (.clk(clk),.rst(rst),.nickel(nickel),.dime(dime),.quarter(quarter),
                              .balance(balance),.dispense(dispense),.change_due(change_due));
    
    initial clk = 0;
    always #5 clk = ~clk;
    
    initial begin
        errors = 0;
        rst=1; nickel=0; dime=0; quarter=0; @(posedge clk); #1; rst=0;
        
        // Test 1: Exact amount (2 quarters = 50 cents)
        $display("Test 1: Exact amount (50 cents)");
        quarter=1; @(posedge clk); #1; quarter=0;
        @(posedge clk); #1;
        if (balance !== 8'd25) begin errors=errors+1; $display("FAIL: after q1 balance=%0d", balance); end
        quarter=1; @(posedge clk); #1; quarter=0;
        @(posedge clk); #1;
        if (balance !== 8'd50) begin errors=errors+1; end
        if (dispense !== 1'b1) begin errors=errors+1; $display("FAIL: dispense not set"); end
        if (change_due !== 8'd0) begin errors=errors+1; end
        
        // Test 2: Excess (60 cents)
        $display("Test 2: Excess amount (60 cents: quarter, dime, quarter)");
        rst=1; @(posedge clk); #1; rst=0;
        quarter=1; @(posedge clk); #1; quarter=0;
        @(posedge clk); #1;
        dime=1; @(posedge clk); #1; dime=0;
        @(posedge clk); #1;
        quarter=1; @(posedge clk); #1; quarter=0;
        @(posedge clk); #1;
        if (dispense !== 1'b1) begin errors=errors+1; end
        if (change_due !== 8'd10) begin errors=errors+1; $display("FAIL: change=%0d exp 10", change_due); end
        
        // Test 3: Multiple small coins
        $display("Test 3: 5 Dimes = 50 cents");
        rst=1; @(posedge clk); #1; rst=0;
        repeat(5) begin
            dime=1; @(posedge clk); #1; dime=0;
            @(posedge clk); #1;
        end
        if (dispense !== 1'b1) begin errors=errors+1; end
        
        if (errors == 0) $display("ALL TESTS PASSED");
        else $display("TESTS FAILED: %0d error(s)", errors);
        $finish;
    end
endmodule
`,
},

];