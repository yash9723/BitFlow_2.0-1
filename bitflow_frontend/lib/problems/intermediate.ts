/**
 * lib/problems/intermediate.ts — Intermediate curriculum problems
 *
 * Pedagogical sequence:
 *   Latches (level-sensitive) → Flip-Flops (edge-triggered) → Shift Registers → Counters
 *
 * Verilog-2001 strict rules:
 *   - No inline variable initialization (integer e=0 → declare then assign)
 *   - No `logic`, no `always_ff` / `always_comb`
 *   - No ternary in $display — use if/else $display
 *   - No `reg clk=0` inline init — use `initial clk=0;`
 *   - $finish must always be called
 */

import type { Problem } from "@/lib/problem-types";

// ─────────────────────────────────────────────────────────────────────────────
// Module definitions (referenced by moduleId field):
//   mod_latches          — SR Latch, D Latch
//   mod_flip_flops       — SR FF, JK FF, D FF, T FF
//   mod_shift_registers  — SISO, SIPO, PISO, PIPO, Bidirectional, Universal
//   mod_sequential_design — Counters
// ─────────────────────────────────────────────────────────────────────────────

export const INTERMEDIATE_PROBLEMS: Problem[] = [

  // ═══════════════════════════════════════════════════════════════════════════
  // MODULE: Latches (level-sensitive storage)
  // ═══════════════════════════════════════════════════════════════════════════

  // ─── 1. SR Latch ──────────────────────────────────────────────────────────
  {
    id: "sr-latch", slug: "sr-latch", title: "SR Latch",
    difficulty: "intermediate", category: "sequential",
    tags: ["latch", "sequential", "level-sensitive", "SR"],
    learningLevel: "Verilog Intermediate",
    moduleId: "mod_latches", orderIndex: 1,
    xpReward: 100, waveformRequired: true,
    expectedOutputMode: "stdout_compare",

    statement: `## SR Latch

The SR (Set-Reset) latch is the most fundamental memory element. It is **level-sensitive** — the output changes whenever S or R changes while the enable is active (or immediately for an unclocked latch).

Implement an **active-high SR latch** (no clock, no enable):

- S=1, R=0 → Q=1, Qn=0 (Set)
- S=0, R=1 → Q=0, Qn=1 (Reset)
- S=0, R=0 → Q holds previous state (memory)
- S=1, R=1 → **Forbidden** (undefined/invalid — both outputs forced to 0)

**Interface**

| Port | Direction | Description        |
|------|-----------|---------------------|
| \`s\`  | input     | Set (active-high)  |
| \`r\`  | input     | Reset (active-high)|
| \`q\`  | output    | State output       |
| \`qn\` | output    | Complement output  |

**Implementation note:** Use cross-coupled NOR gates (structural style) or a behavioural \`always @(*)\` with if-else. For synthesis, avoid the S=R=1 case.`,

    constraints: [
      "Implement with always @(*) behavioural style.",
      "When S=1, R=1: assign q=0, qn=0 (treat as forbidden).",
      "When S=0, R=0: q and qn must hold (use reg).",
    ],
    examples: [
      { input: "s=1, r=0", output: "q=1, qn=0", explanation: "Set" },
      { input: "s=0, r=1", output: "q=0, qn=1", explanation: "Reset" },
      { input: "s=0, r=0", output: "q=prev, qn=prev_n", explanation: "Hold" },
    ],
    hints: [
      { tier: 1, content: "Use `always @(*)` with if/else if/else. Declare q and qn as reg." },
      { tier: 2, content: "Hold state means: the else branch simply doesn't assign — but that creates a latch, which is intentional here!" },
      { tier: 3, content: "```\nalways @(*) begin\n  if (s && !r)      begin q=1; qn=0; end\n  else if (!s && r) begin q=0; qn=1; end\n  else if (s && r)  begin q=0; qn=0; end\n  // else: hold (no assign needed — latch behaviour)\nend\n```" },
    ],
    publicTestcases: [], hiddenTestcases: [],

    starterCode: `\`timescale 1ns / 1ps

module sr_latch (
    input  wire s,
    input  wire r,
    output reg  q,
    output reg  qn
);

    // SR Latch — level-sensitive, no clock
    // S=1,R=0 → Set   | S=0,R=1 → Reset
    // S=0,R=0 → Hold  | S=1,R=1 → Forbidden (q=0,qn=0)
    always @(*) begin
        // TODO: implement SR latch behaviour
    end

endmodule
`,

    publicTestbench: `\`timescale 1ns / 1ps
module tb_sr_latch;
    reg s, r; wire q, qn;
    sr_latch dut (.s(s),.r(r),.q(q),.qn(qn));
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_sr_latch); end
    initial begin
        $display("=== SR Latch Test ===");
        s=0; r=0; #10; $display("s=0 r=0 => q=%b qn=%b (hold/init)", q, qn);
        s=1; r=0; #10; $display("s=1 r=0 => q=%b qn=%b (expect q=1)", q, qn);
        s=0; r=0; #10; $display("s=0 r=0 => q=%b qn=%b (hold, expect q=1)", q, qn);
        s=0; r=1; #10; $display("s=0 r=1 => q=%b qn=%b (expect q=0)", q, qn);
        s=0; r=0; #10; $display("s=0 r=0 => q=%b qn=%b (hold, expect q=0)", q, qn);
        s=1; r=1; #10; $display("s=1 r=1 => q=%b qn=%b (forbidden)", q, qn);
        $finish;
    end
endmodule
`,

    hiddenTestbench: `\`timescale 1ns / 1ps
module tb_sr_latch_hidden;
    reg s, r; wire q, qn;
    integer errors;
    sr_latch dut (.s(s),.r(r),.q(q),.qn(qn));
    initial begin
        errors = 0;
        // Set
        s=1; r=0; #10;
        if (q!==1'b1 || qn!==1'b0) begin $display("FAIL Set: exp q=1,qn=0 got q=%b,qn=%b",q,qn); errors=errors+1; end
        // Hold after set
        s=0; r=0; #10;
        if (q!==1'b1 || qn!==1'b0) begin $display("FAIL Hold(1): exp q=1,qn=0 got q=%b,qn=%b",q,qn); errors=errors+1; end
        // Reset
        s=0; r=1; #10;
        if (q!==1'b0 || qn!==1'b1) begin $display("FAIL Reset: exp q=0,qn=1 got q=%b,qn=%b",q,qn); errors=errors+1; end
        // Hold after reset
        s=0; r=0; #10;
        if (q!==1'b0 || qn!==1'b1) begin $display("FAIL Hold(0): exp q=0,qn=1 got q=%b,qn=%b",q,qn); errors=errors+1; end
        // Forbidden
        s=1; r=1; #10;
        if (q!==1'b0 || qn!==1'b0) begin $display("FAIL Forbidden: exp q=0,qn=0 got q=%b,qn=%b",q,qn); errors=errors+1; end
        if (errors==0) $display("ALL TESTS PASSED");
        else $display("TESTS FAILED: %0d error(s)", errors);
        $finish;
    end
endmodule
`,
  },

  // ─── 2. D Latch ───────────────────────────────────────────────────────────
  {
    id: "d-latch", slug: "d-latch", title: "D Latch",
    difficulty: "intermediate", category: "sequential",
    tags: ["latch", "sequential", "level-sensitive", "enable"],
    learningLevel: "Verilog Intermediate",
    moduleId: "mod_latches", orderIndex: 2,
    xpReward: 100, waveformRequired: true,
    expectedOutputMode: "stdout_compare",

    statement: `## D Latch

The D (Data) latch fixes the SR latch's forbidden state problem by using a single data input. It is **transparent** when enabled — the output tracks the input directly.

- \`en=1\`: Q follows D continuously (transparent)
- \`en=0\`: Q holds its last value (opaque/latched)

**Interface**

| Port | Direction | Description         |
|------|-----------|---------------------|
| \`d\`  | input     | Data input          |
| \`en\` | input     | Level-sensitive enable (active-high) |
| \`q\`  | output    | Data output         |
| \`qn\` | output    | Complement output   |

**Key difference from D Flip-Flop:** The latch responds to the **level** of \`en\`, not its edge. When \`en\` goes low, whatever value was on D at that moment is captured.

**Use in RTL:** Latches appear in clock-gating cells and asynchronous interfaces. Unintentional latches (from incomplete if-else) are bugs.`,

    constraints: [
      "Use always @(*) — level-sensitive, no clock.",
      "When en=0: q must hold (latch behaviour).",
      "Declare q and qn as reg.",
    ],
    examples: [
      { input: "en=1, d=1", output: "q=1, qn=0", explanation: "Transparent — follows D" },
      { input: "en=1, d=0", output: "q=0, qn=1" },
      { input: "en=0, d=X", output: "q=prev", explanation: "Latched — holds" },
    ],
    hints: [
      { tier: 1, content: "Use `always @(*)` with `if (en) begin q=d; qn=~d; end` — the else branch is intentionally absent (creates latch)." },
    ],
    publicTestcases: [], hiddenTestcases: [],

    starterCode: `\`timescale 1ns / 1ps

module d_latch (
    input  wire d,
    input  wire en,
    output reg  q,
    output reg  qn
);

    // D Latch — transparent when en=1, holds when en=0
    always @(*) begin
        // TODO: when en=1, q=d and qn=~d
        //       when en=0, hold (no assignment — intentional latch)
    end

endmodule
`,

    publicTestbench: `\`timescale 1ns / 1ps
module tb_d_latch;
    reg d, en; wire q, qn;
    d_latch dut (.d(d),.en(en),.q(q),.qn(qn));
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_d_latch); end
    initial begin
        $display("=== D Latch Test ===");
        en=1; d=0; #10; $display("en=1 d=0 => q=%b qn=%b (expect 0,1)", q, qn);
        en=1; d=1; #10; $display("en=1 d=1 => q=%b qn=%b (expect 1,0)", q, qn);
        en=0; d=0; #10; $display("en=0 d=0 => q=%b qn=%b (hold, expect 1,0)", q, qn);
        en=0; d=1; #10; $display("en=0 d=1 => q=%b qn=%b (hold, expect 1,0)", q, qn);
        en=1; d=0; #10; $display("en=1 d=0 => q=%b qn=%b (transparent, expect 0,1)", q, qn);
        $finish;
    end
endmodule
`,

    hiddenTestbench: `\`timescale 1ns / 1ps
module tb_d_latch_hidden;
    reg d, en; wire q, qn;
    integer errors;
    d_latch dut (.d(d),.en(en),.q(q),.qn(qn));
    initial begin
        errors = 0;
        en=1; d=0; #10;
        if (q!==0||qn!==1) begin $display("FAIL en=1 d=0 exp q=0,qn=1 got %b,%b",q,qn); errors=errors+1; end
        en=1; d=1; #10;
        if (q!==1||qn!==0) begin $display("FAIL en=1 d=1 exp q=1,qn=0 got %b,%b",q,qn); errors=errors+1; end
        en=0; d=0; #10;
        if (q!==1||qn!==0) begin $display("FAIL hold(1): d changed but en=0, exp q=1,qn=0 got %b,%b",q,qn); errors=errors+1; end
        en=0; d=1; #10;
        if (q!==1||qn!==0) begin $display("FAIL hold(2): exp q=1,qn=0 got %b,%b",q,qn); errors=errors+1; end
        en=1; d=0; #10;
        if (q!==0||qn!==1) begin $display("FAIL transparent again: exp q=0,qn=1 got %b,%b",q,qn); errors=errors+1; end
        if (errors==0) $display("ALL TESTS PASSED");
        else $display("TESTS FAILED: %0d error(s)", errors);
        $finish;
    end
endmodule
`,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // MODULE: Flip-Flops (edge-triggered storage)
  // ═══════════════════════════════════════════════════════════════════════════

  // ─── 3. SR Flip-Flop ──────────────────────────────────────────────────────
  {
    id: "sr-flip-flop", slug: "sr-flip-flop", title: "SR Flip-Flop",
    difficulty: "intermediate", category: "sequential",
    tags: ["flip-flop", "sequential", "SR", "edge-triggered"],
    learningLevel: "Verilog Intermediate",
    moduleId: "mod_flip_flops", orderIndex: 3,
    xpReward: 110, waveformRequired: true,
    expectedOutputMode: "stdout_compare",

    statement: `## SR Flip-Flop

The SR Flip-Flop is the edge-triggered version of the SR latch. The outputs only change on the **rising edge of the clock**, making it immune to glitches between clock edges.

- On \`posedge clk\`:
  - S=0, R=0 → Q holds
  - S=1, R=0 → Q=1 (Set)
  - S=0, R=1 → Q=0 (Reset)
  - S=1, R=1 → Q holds (undefined/forbidden — treat as no-op)

**Interface**

| Port  | Direction | Description                     |
|-------|-----------|---------------------------------|
| \`clk\` | input   | Clock (rising-edge triggered)   |
| \`s\`   | input   | Set input                       |
| \`r\`   | input   | Reset input                     |
| \`q\`   | output  | State output                    |
| \`qn\`  | output  | Complement output               |

**Note:** Use \`always @(posedge clk)\` with non-blocking assignments (\`<=\`). This is what distinguishes a flip-flop from a latch.`,

    constraints: [
      "Use always @(posedge clk) — edge-triggered.",
      "Use non-blocking assignments (<=).",
      "S=1,R=1: hold current state (no change).",
    ],
    examples: [
      { input: "clk↑, s=1, r=0", output: "q=1, qn=0" },
      { input: "clk↑, s=0, r=1", output: "q=0, qn=1" },
      { input: "clk↑, s=0, r=0", output: "q=prev" },
    ],
    hints: [
      { tier: 1, content: "Use `always @(posedge clk)` with non-blocking `<=`. Check S and R with if/else if." },
      { tier: 2, content: "Four cases: SR=00 (hold), SR=10 (set), SR=01 (reset), SR=11 (hold/undefined)." },
    ],
    publicTestcases: [], hiddenTestcases: [],

    starterCode: `\`timescale 1ns / 1ps

module sr_ff (
    input  wire clk,
    input  wire s,
    input  wire r,
    output reg  q,
    output reg  qn
);

    // SR Flip-Flop — edge-triggered on posedge clk
    always @(posedge clk) begin
        // TODO: check S and R, update q and qn with non-blocking <=
        // SR=10: set   SR=01: reset   SR=00/11: hold
    end

endmodule
`,

    publicTestbench: `\`timescale 1ns / 1ps
module tb_sr_ff;
    reg clk, s, r; wire q, qn;
    sr_ff dut (.clk(clk),.s(s),.r(r),.q(q),.qn(qn));
    initial clk = 0;
    always #5 clk = ~clk;
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_sr_ff); end
    initial begin
        $display("=== SR Flip-Flop Test ===");
        s=0; r=1; @(posedge clk); #1; $display("rst: s=0 r=1 => q=%b qn=%b (expect 0,1)", q, qn);
        s=1; r=0; @(posedge clk); #1; $display("set: s=1 r=0 => q=%b qn=%b (expect 1,0)", q, qn);
        s=0; r=0; @(posedge clk); #1; $display("hold: s=0 r=0 => q=%b qn=%b (expect 1,0)", q, qn);
        s=0; r=1; @(posedge clk); #1; $display("rst: s=0 r=1 => q=%b qn=%b (expect 0,1)", q, qn);
        s=1; r=1; @(posedge clk); #1; $display("forb: s=1 r=1 => q=%b qn=%b (hold)", q, qn);
        $finish;
    end
endmodule
`,

    hiddenTestbench: `\`timescale 1ns / 1ps
module tb_sr_ff_hidden;
    reg clk, s, r; wire q, qn;
    integer errors;
    sr_ff dut (.clk(clk),.s(s),.r(r),.q(q),.qn(qn));
    initial clk = 0;
    always #5 clk = ~clk;
    initial begin
        errors = 0;
        s=0; r=1; @(posedge clk); #1;
        if (q!==0||qn!==1) begin $display("FAIL Reset: exp q=0,qn=1 got %b,%b",q,qn); errors=errors+1; end
        s=1; r=0; @(posedge clk); #1;
        if (q!==1||qn!==0) begin $display("FAIL Set: exp q=1,qn=0 got %b,%b",q,qn); errors=errors+1; end
        s=0; r=0; @(posedge clk); #1;
        if (q!==1||qn!==0) begin $display("FAIL Hold(1): exp q=1,qn=0 got %b,%b",q,qn); errors=errors+1; end
        s=0; r=1; @(posedge clk); #1;
        if (q!==0||qn!==1) begin $display("FAIL Reset2: exp q=0,qn=1 got %b,%b",q,qn); errors=errors+1; end
        s=0; r=0; @(posedge clk); #1;
        if (q!==0||qn!==1) begin $display("FAIL Hold(0): exp q=0,qn=1 got %b,%b",q,qn); errors=errors+1; end
        // S=R=1: must hold, not change
        s=1; r=1; @(posedge clk); #1;
        if (q!==0||qn!==1) begin $display("FAIL Forbidden: must hold q=0,qn=1 got %b,%b",q,qn); errors=errors+1; end
        if (errors==0) $display("ALL TESTS PASSED");
        else $display("TESTS FAILED: %0d error(s)", errors);
        $finish;
    end
endmodule
`,
  },

  // ─── 4. JK Flip-Flop ──────────────────────────────────────────────────────
  {
    id: "jk-flip-flop", slug: "jk-flip-flop", title: "JK Flip-Flop",
    difficulty: "intermediate", category: "sequential",
    tags: ["flip-flop", "sequential", "JK", "toggle"],
    learningLevel: "Verilog Intermediate",
    moduleId: "mod_flip_flops", orderIndex: 4,
    xpReward: 120, waveformRequired: true,
    expectedOutputMode: "stdout_compare",

    statement: `## JK Flip-Flop

The JK flip-flop eliminates the forbidden state of the SR flip-flop. When J=K=1, the output **toggles** instead of being undefined.

On every \`posedge clk\`:

| J | K | Action        |
|---|---|---------------|
| 0 | 0 | Hold (no change) |
| 0 | 1 | Reset → Q=0   |
| 1 | 0 | Set → Q=1     |
| 1 | 1 | Toggle → Q=~Q |

**Interface**

| Port  | Direction | Description               |
|-------|-----------|---------------------------|
| \`clk\` | input   | Clock (rising-edge)       |
| \`j\`   | input   | J input                   |
| \`k\`   | input   | K input                   |
| \`q\`   | output  | State output              |
| \`qn\`  | output  | Complement output         |

The JK is the most versatile single-bit flip-flop and was widely used in TTL-era designs. The T flip-flop is a special case where J=K=1 always.`,

    constraints: [
      "Use always @(posedge clk).",
      "Use non-blocking assignments (<=).",
      "J=K=1 must toggle Q.",
    ],
    examples: [
      { input: "clk↑, j=1, k=0 (Q was 0)", output: "q=1" },
      { input: "clk↑, j=1, k=1 (Q was 1)", output: "q=0 (toggled)" },
      { input: "clk↑, j=0, k=0", output: "q=prev" },
    ],
    hints: [
      { tier: 1, content: "Four cases in always @(posedge clk): JK=00 hold, JK=01 reset, JK=10 set, JK=11 toggle." },
      { tier: 2, content: "Toggle: `q <= ~q; qn <= ~qn;` or `q <= qn; qn <= q;`" },
    ],
    publicTestcases: [], hiddenTestcases: [],

    starterCode: `\`timescale 1ns / 1ps

module jk_ff (
    input  wire clk,
    input  wire j,
    input  wire k,
    output reg  q,
    output reg  qn
);

    // JK Flip-Flop
    // JK=00: hold | JK=01: reset | JK=10: set | JK=11: toggle
    initial begin q = 0; qn = 1; end

    always @(posedge clk) begin
        // TODO: implement all four JK cases with non-blocking <=
    end

endmodule
`,

    publicTestbench: `\`timescale 1ns / 1ps
module tb_jk_ff;
    reg clk, j, k; wire q, qn;
    jk_ff dut (.clk(clk),.j(j),.k(k),.q(q),.qn(qn));
    initial clk = 0;
    always #5 clk = ~clk;
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_jk_ff); end
    initial begin
        $display("=== JK Flip-Flop Test ===");
        j=0; k=0; @(posedge clk); #1; $display("JK=00 hold  => q=%b (expect 0)", q);
        j=1; k=0; @(posedge clk); #1; $display("JK=10 set   => q=%b (expect 1)", q);
        j=0; k=0; @(posedge clk); #1; $display("JK=00 hold  => q=%b (expect 1)", q);
        j=0; k=1; @(posedge clk); #1; $display("JK=01 reset => q=%b (expect 0)", q);
        j=1; k=1; @(posedge clk); #1; $display("JK=11 toggle=> q=%b (expect 1)", q);
        j=1; k=1; @(posedge clk); #1; $display("JK=11 toggle=> q=%b (expect 0)", q);
        j=1; k=1; @(posedge clk); #1; $display("JK=11 toggle=> q=%b (expect 1)", q);
        $finish;
    end
endmodule
`,

    hiddenTestbench: `\`timescale 1ns / 1ps
module tb_jk_ff_hidden;
    reg clk, j, k; wire q, qn;
    integer errors;
    reg prev_q;
    jk_ff dut (.clk(clk),.j(j),.k(k),.q(q),.qn(qn));
    initial clk = 0;
    always #5 clk = ~clk;
    initial begin
        errors = 0;
        // Reset first
        j=0; k=1; @(posedge clk); #1;
        if (q!==0||qn!==1) begin $display("FAIL Reset: exp q=0,qn=1 got %b,%b",q,qn); errors=errors+1; end
        // Set
        j=1; k=0; @(posedge clk); #1;
        if (q!==1||qn!==0) begin $display("FAIL Set: exp q=1,qn=0 got %b,%b",q,qn); errors=errors+1; end
        // Hold
        j=0; k=0; @(posedge clk); #1;
        if (q!==1||qn!==0) begin $display("FAIL Hold: exp q=1 got %b",q); errors=errors+1; end
        // Toggle x4
        j=1; k=1; @(posedge clk); #1;
        if (q!==0) begin $display("FAIL Toggle1: exp q=0 got %b",q); errors=errors+1; end
        j=1; k=1; @(posedge clk); #1;
        if (q!==1) begin $display("FAIL Toggle2: exp q=1 got %b",q); errors=errors+1; end
        j=1; k=1; @(posedge clk); #1;
        if (q!==0) begin $display("FAIL Toggle3: exp q=0 got %b",q); errors=errors+1; end
        // Verify qn is always complement
        j=1; k=0; @(posedge clk); #1;
        if (q!==~qn) begin $display("FAIL qn not complement: q=%b qn=%b",q,qn); errors=errors+1; end
        if (errors==0) $display("ALL TESTS PASSED");
        else $display("TESTS FAILED: %0d error(s)", errors);
        $finish;
    end
endmodule
`,
  },

  // ─── 5. D Flip-Flop (Intermediate — with async reset) ────────────────────
  {
    id: "d-ff-async", slug: "d-ff-async", title: "D Flip-Flop with Async Reset",
    difficulty: "intermediate", category: "sequential",
    tags: ["flip-flop", "sequential", "D", "async-reset"],
    learningLevel: "Verilog Intermediate",
    moduleId: "mod_flip_flops", orderIndex: 5,
    xpReward: 110, waveformRequired: true,
    expectedOutputMode: "stdout_compare",

    statement: `## D Flip-Flop with Asynchronous Reset

You implemented a D flip-flop with **synchronous** reset in the beginner level. Now implement one with **asynchronous** reset — the reset takes effect immediately, regardless of the clock edge.

**Interface**

| Port     | Direction | Description                          |
|----------|-----------|--------------------------------------|
| \`clk\`  | input     | Clock (rising-edge)                  |
| \`rst_n\`| input     | Async reset, **active-low**          |
| \`d\`    | input     | Data input                           |
| \`q\`    | output    | Data output                          |

**Behaviour**
- \`rst_n=0\` (any time): Q → 0 immediately (async, no clock needed)
- \`rst_n=1\` + \`posedge clk\`: Q → D

**Sensitivity list difference:**
- Sync reset:  \`always @(posedge clk)\`
- Async reset: \`always @(posedge clk or negedge rst_n)\`

Active-low async reset is the industry standard — it matches most real flip-flop cells in standard cell libraries.`,

    constraints: [
      "Use always @(posedge clk or negedge rst_n).",
      "rst_n is active-low: reset when rst_n=0.",
      "Use non-blocking assignments (<=).",
    ],
    examples: [
      { input: "rst_n=0 (any time)", output: "q=0 immediately", explanation: "Async" },
      { input: "rst_n=1, clk↑, d=1", output: "q=1" },
    ],
    hints: [
      { tier: 1, content: "Sensitivity list: `always @(posedge clk or negedge rst_n)`" },
      { tier: 2, content: "Inside: `if (!rst_n) q <= 0; else q <= d;`" },
    ],
    publicTestcases: [], hiddenTestcases: [],

    starterCode: `\`timescale 1ns / 1ps

module d_ff_async (
    input  wire clk,
    input  wire rst_n,  // active-low async reset
    input  wire d,
    output reg  q
);

    // Async reset: fires on negedge rst_n OR posedge clk
    always @(posedge clk or negedge rst_n) begin
        // TODO: if rst_n is low, reset q; else capture d
    end

endmodule
`,

    publicTestbench: `\`timescale 1ns / 1ps
module tb_d_ff_async;
    reg clk, rst_n, d; wire q;
    d_ff_async dut (.clk(clk),.rst_n(rst_n),.d(d),.q(q));
    initial clk = 0;
    always #5 clk = ~clk;
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_d_ff_async); end
    initial begin
        $display("=== D FF Async Reset Test ===");
        rst_n=0; d=1; #3; $display("async rst_n=0 mid-cycle => q=%b (expect 0)", q);
        rst_n=1; @(posedge clk); #1; $display("clk d=1 => q=%b (expect 1)", q);
        d=0; @(posedge clk); #1; $display("clk d=0 => q=%b (expect 0)", q);
        d=1; @(posedge clk); #1;
        rst_n=0; #2; $display("async rst mid-cycle => q=%b (expect 0)", q);
        rst_n=1; @(posedge clk); #1; $display("recovered => q=%b (expect 1, d=1)", q);
        $finish;
    end
endmodule
`,

    hiddenTestbench: `\`timescale 1ns / 1ps
module tb_d_ff_async_hidden;
    reg clk, rst_n, d; wire q;
    integer errors;
    d_ff_async dut (.clk(clk),.rst_n(rst_n),.d(d),.q(q));
    initial clk = 0;
    always #5 clk = ~clk;
    initial begin
        errors = 0;
        // Async reset at non-clock instant
        rst_n=0; d=1; #3;
        if (q!==0) begin $display("FAIL async rst: exp q=0 got %b",q); errors=errors+1; end
        // Normal capture after release
        rst_n=1; @(posedge clk); #1;
        if (q!==1) begin $display("FAIL capture d=1: exp q=1 got %b",q); errors=errors+1; end
        d=0; @(posedge clk); #1;
        if (q!==0) begin $display("FAIL capture d=0: exp q=0 got %b",q); errors=errors+1; end
        // Async reset overrides clock
        d=1; @(posedge clk); #1;
        if (q!==1) begin $display("FAIL pre-reset: exp q=1 got %b",q); errors=errors+1; end
        rst_n=0; #2;
        if (q!==0) begin $display("FAIL async mid: exp q=0 immediately got %b",q); errors=errors+1; end
        rst_n=1; @(posedge clk); #1;
        if (q!==1) begin $display("FAIL post-reset capture: exp q=1 got %b",q); errors=errors+1; end
        if (errors==0) $display("ALL TESTS PASSED");
        else $display("TESTS FAILED: %0d error(s)", errors);
        $finish;
    end
endmodule
`,
  },

  // ─── 6. T Flip-Flop ───────────────────────────────────────────────────────
  {
    id: "t-flip-flop", slug: "t-flip-flop", title: "T Flip-Flop",
    difficulty: "intermediate", category: "sequential",
    tags: ["flip-flop", "sequential", "T", "toggle", "counter"],
    learningLevel: "Verilog Intermediate",
    moduleId: "mod_flip_flops", orderIndex: 6,
    xpReward: 110, waveformRequired: true,
    expectedOutputMode: "stdout_compare",

    statement: `## T Flip-Flop

The T (Toggle) flip-flop toggles its output on every clock edge when T=1, and holds when T=0. It is a special case of the JK flip-flop where J=K=T.

On every \`posedge clk\`:
- \`t=0\`: Q holds
- \`t=1\`: Q toggles (Q = ~Q)

**Interface**

| Port  | Direction | Description               |
|-------|-----------|---------------------------|
| \`clk\` | input   | Clock (rising-edge)       |
| \`rst\` | input   | Synchronous reset (active-high) |
| \`t\`   | input   | Toggle enable             |
| \`q\`   | output  | State output              |

**Why T flip-flops matter:** A T flip-flop with T=1 permanently divides the clock by 2. Chain N of them to build a ripple counter that divides by 2^N. They are the core of every binary counter.`,

    constraints: [
      "Use always @(posedge clk).",
      "Synchronous reset has priority over T.",
      "Use non-blocking assignments (<=).",
    ],
    examples: [
      { input: "rst=1, clk↑", output: "q=0" },
      { input: "rst=0, t=1, clk↑ (q was 0)", output: "q=1" },
      { input: "rst=0, t=1, clk↑ (q was 1)", output: "q=0" },
      { input: "rst=0, t=0, clk↑", output: "q=prev" },
    ],
    hints: [
      { tier: 1, content: "Inside always @(posedge clk): `if(rst) q<=0; else if(t) q<=~q;`" },
    ],
    publicTestcases: [], hiddenTestcases: [],

    starterCode: `\`timescale 1ns / 1ps

module t_ff (
    input  wire clk,
    input  wire rst,  // synchronous reset, active-high
    input  wire t,
    output reg  q
);

    // T Flip-Flop: toggle when t=1, hold when t=0
    always @(posedge clk) begin
        // TODO: rst > t > hold
    end

endmodule
`,

    publicTestbench: `\`timescale 1ns / 1ps
module tb_t_ff;
    reg clk, rst, t; wire q;
    t_ff dut (.clk(clk),.rst(rst),.t(t),.q(q));
    initial clk = 0;
    always #5 clk = ~clk;
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_t_ff); end
    initial begin
        $display("=== T Flip-Flop Test ===");
        rst=1; t=0; @(posedge clk); #1; $display("rst=1 => q=%b (expect 0)", q);
        rst=0; t=1; @(posedge clk); #1; $display("t=1 toggle => q=%b (expect 1)", q);
        t=1; @(posedge clk); #1; $display("t=1 toggle => q=%b (expect 0)", q);
        t=1; @(posedge clk); #1; $display("t=1 toggle => q=%b (expect 1)", q);
        t=0; @(posedge clk); #1; $display("t=0 hold   => q=%b (expect 1)", q);
        t=0; @(posedge clk); #1; $display("t=0 hold   => q=%b (expect 1)", q);
        $finish;
    end
endmodule
`,

    hiddenTestbench: `\`timescale 1ns / 1ps
module tb_t_ff_hidden;
    reg clk, rst, t; wire q;
    integer errors;
    integer i;
    t_ff dut (.clk(clk),.rst(rst),.t(t),.q(q));
    initial clk = 0;
    always #5 clk = ~clk;
    initial begin
        errors = 0;
        rst=1; t=1; @(posedge clk); #1;
        if (q!==0) begin $display("FAIL rst: exp q=0 got %b",q); errors=errors+1; end
        rst=0; t=0; @(posedge clk); #1;
        if (q!==0) begin $display("FAIL hold(0): exp q=0 got %b",q); errors=errors+1; end
        t=1; @(posedge clk); #1;
        if (q!==1) begin $display("FAIL toggle0to1: exp q=1 got %b",q); errors=errors+1; end
        t=1; @(posedge clk); #1;
        if (q!==0) begin $display("FAIL toggle1to0: exp q=0 got %b",q); errors=errors+1; end
        t=0; @(posedge clk); #1;
        if (q!==0) begin $display("FAIL hold after toggle: exp q=0 got %b",q); errors=errors+1; end
        // Toggle 8 times — must end at same state
        t=1;
        for (i=0;i<8;i=i+1) @(posedge clk);
        #1;
        if (q!==0) begin $display("FAIL 8 toggles exp back to 0 got %b",q); errors=errors+1; end
        if (errors==0) $display("ALL TESTS PASSED");
        else $display("TESTS FAILED: %0d error(s)", errors);
        $finish;
    end
endmodule
`,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // MODULE: Shift Registers
  // ═══════════════════════════════════════════════════════════════════════════

  // ─── 7. SISO Shift Register ───────────────────────────────────────────────
  {
    id: "shift-reg-siso", slug: "shift-reg-siso", title: "Shift Register (SISO)",
    difficulty: "intermediate", category: "sequential",
    tags: ["shift-register", "SISO", "serial"],
    learningLevel: "Verilog Intermediate",
    moduleId: "mod_shift_registers", orderIndex: 7,
    xpReward: 125, waveformRequired: true,
    expectedOutputMode: "stdout_compare",

    statement: `## Shift Register — SISO (Serial-In Serial-Out)

A 4-bit SISO shift register. Data enters one bit at a time from \`si\` and exits one bit at a time from \`so\`.

On every \`posedge clk\`:
- The register shifts left: \`reg[3:1] <= reg[2:0]\`
- New data enters at LSB: \`reg[0] <= si\`
- Serial output: \`so = reg[3]\` (MSB leaves first)

**Interface**

| Port  | Direction | Description               |
|-------|-----------|---------------------------|
| \`clk\`| input    | Clock                     |
| \`rst\`| input    | Synchronous reset         |
| \`si\` | input    | Serial input              |
| \`so\` | output   | Serial output (MSB first) |

**Use case:** UART transmit, SPI interfaces, pipeline delay lines.

After loading 4 bits, the first bit appears at \`so\` after 4 clock cycles.`,

    constraints: [
      "4-bit internal register.",
      "Shift direction: si enters at bit 0, so exits from bit 3.",
      "Use non-blocking assignments (<=).",
    ],
    examples: [
      { input: "Send 1,0,1,1 serially (LSB first)", output: "so outputs 1,0,1,1 four cycles later" },
    ],
    hints: [
      { tier: 1, content: "Declare `reg [3:0] sr;`. On posedge clk: `sr <= {sr[2:0], si};` then `assign so = sr[3];`" },
    ],
    publicTestcases: [], hiddenTestcases: [],

    starterCode: `\`timescale 1ns / 1ps

module siso (
    input  wire clk,
    input  wire rst,
    input  wire si,
    output wire so
);

    reg [3:0] sr;

    // Shift register: si enters at bit 0, MSB exits as so
    always @(posedge clk) begin
        if (rst) sr <= 4'b0;
        else     sr <= {sr[2:0], si};  // TODO: shift and insert si
    end

    assign so = sr[3];  // MSB is serial output

endmodule
`,

    publicTestbench: `\`timescale 1ns / 1ps
module tb_siso;
    reg clk, rst, si; wire so;
    siso dut (.clk(clk),.rst(rst),.si(si),.so(so));
    initial clk = 0;
    always #5 clk = ~clk;
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_siso); end
    initial begin
        $display("=== SISO Shift Register Test ===");
        rst=1; si=0; @(posedge clk); #1; rst=0;
        // Shift in 1011 (LSB first: 1,1,0,1)
        si=1; @(posedge clk); #1; $display("si=1 so=%b", so);
        si=1; @(posedge clk); #1; $display("si=1 so=%b", so);
        si=0; @(posedge clk); #1; $display("si=0 so=%b", so);
        si=1; @(posedge clk); #1; $display("si=1 so=%b (expect first bit out)", so);
        si=0; @(posedge clk); #1; $display("si=0 so=%b", so);
        $finish;
    end
endmodule
`,

    hiddenTestbench: `\`timescale 1ns / 1ps
module tb_siso_hidden;
    reg clk, rst, si; wire so;
    integer errors;
    integer i;
    reg [3:0] expected_out;
    reg [3:0] got_out;
    siso dut (.clk(clk),.rst(rst),.si(si),.so(so));
    initial clk = 0;
    always #5 clk = ~clk;
    initial begin
        errors = 0;
        rst=1; si=0; @(posedge clk); #1; rst=0;
        // Shift in 4'b1011 (bit0 first: 1,1,0,1)
        // After 4 clocks so should produce: 1,1,0,1 (the input in order)
        si=1; @(posedge clk); #1; got_out[0]=so;
        si=1; @(posedge clk); #1; got_out[1]=so;
        si=0; @(posedge clk); #1; got_out[2]=so;
        si=1; @(posedge clk); #1; got_out[3]=so;
        // After 4 clocks the first bit (1) should be at so
        // Then drain remaining
        si=0; @(posedge clk); #1;
        if (got_out[3]!==1'b1) begin $display("FAIL: first bit out exp 1 got %b",got_out[3]); errors=errors+1; end
        // Reset test
        si=1; si=1; si=1; si=1;
        repeat(4) @(posedge clk);
        rst=1; @(posedge clk); #1; rst=0;
        if (so!==0) begin $display("FAIL: after reset so exp 0 got %b",so); errors=errors+1; end
        if (errors==0) $display("ALL TESTS PASSED");
        else $display("TESTS FAILED: %0d error(s)", errors);
        $finish;
    end
endmodule
`,
  },

  // ─── 8. SIPO Shift Register ───────────────────────────────────────────────
  {
    id: "shift-reg-sipo", slug: "shift-reg-sipo", title: "Shift Register (SIPO)",
    difficulty: "intermediate", category: "sequential",
    tags: ["shift-register", "SIPO", "serial-to-parallel"],
    learningLevel: "Verilog Intermediate",
    moduleId: "mod_shift_registers", orderIndex: 8,
    xpReward: 125, waveformRequired: true,
    expectedOutputMode: "stdout_compare",

    statement: `## Shift Register — SIPO (Serial-In Parallel-Out)

A 4-bit SIPO shift register. Data is clocked in serially via \`si\`, and after 4 clock cycles all 4 bits are available simultaneously on \`po[3:0]\`.

On every \`posedge clk\`: shift and insert \`si\` at bit 0.

**Interface**

| Port      | Direction | Description               |
|-----------|-----------|---------------------------|
| \`clk\`   | input     | Clock                     |
| \`rst\`   | input     | Synchronous reset         |
| \`si\`    | input     | Serial input              |
| \`po[3:0]\`| output   | Parallel output (all bits)|

**Use case:** SPI receiver — the master sends 8 bits serially and the slave accumulates them into a parallel byte. UART receivers use this pattern.

After clocking in \`si = 1,0,1,1\` (bit 0 first): \`po = 4'b1101\` (bit 3 contains the first bit received).`,

    constraints: [
      "4-bit internal shift register exposed as parallel output.",
      "si enters at bit 0; po[3] holds the oldest bit.",
      "Use non-blocking assignments (<=).",
    ],
    examples: [
      { input: "si sequence: 1,0,1,1", output: "po=4'b1101 after 4 cycles" },
    ],
    hints: [
      { tier: 1, content: "`sr <= {sr[2:0], si};` then `assign po = sr;`" },
    ],
    publicTestcases: [], hiddenTestcases: [],

    starterCode: `\`timescale 1ns / 1ps

module sipo (
    input  wire       clk,
    input  wire       rst,
    input  wire       si,
    output wire [3:0] po
);

    reg [3:0] sr;

    always @(posedge clk) begin
        if (rst) sr <= 4'b0;
        else     sr <= {sr[2:0], si};
    end

    assign po = sr;  // all bits available in parallel

endmodule
`,

    publicTestbench: `\`timescale 1ns / 1ps
module tb_sipo;
    reg clk, rst, si; wire [3:0] po;
    sipo dut (.clk(clk),.rst(rst),.si(si),.po(po));
    initial clk = 0;
    always #5 clk = ~clk;
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_sipo); end
    initial begin
        $display("=== SIPO Shift Register Test ===");
        rst=1; si=0; @(posedge clk); #1; rst=0;
        si=1; @(posedge clk); #1; $display("after si=1: po=%b", po);
        si=0; @(posedge clk); #1; $display("after si=0: po=%b", po);
        si=1; @(posedge clk); #1; $display("after si=1: po=%b", po);
        si=1; @(posedge clk); #1; $display("after si=1: po=%b (expect 1101)", po);
        $finish;
    end
endmodule
`,

    hiddenTestbench: `\`timescale 1ns / 1ps
module tb_sipo_hidden;
    reg clk, rst, si; wire [3:0] po;
    integer errors;
    sipo dut (.clk(clk),.rst(rst),.si(si),.po(po));
    initial clk = 0;
    always #5 clk = ~clk;
    initial begin
        errors = 0;
        rst=1; si=0; @(posedge clk); #1; rst=0;
        si=1; @(posedge clk); #1;
        si=0; @(posedge clk); #1;
        si=1; @(posedge clk); #1;
        si=1; @(posedge clk); #1;
        if (po!==4'b1101) begin $display("FAIL: exp po=1101 got %b",po); errors=errors+1; end
        // Reset check
        rst=1; @(posedge clk); #1; rst=0;
        if (po!==4'b0000) begin $display("FAIL: after reset exp 0000 got %b",po); errors=errors+1; end
        // Another sequence: 4'b1010 (si: 0,1,0,1)
        si=0; @(posedge clk); #1;
        si=1; @(posedge clk); #1;
        si=0; @(posedge clk); #1;
        si=1; @(posedge clk); #1;
        if (po!==4'b1010) begin $display("FAIL: exp po=1010 got %b",po); errors=errors+1; end
        if (errors==0) $display("ALL TESTS PASSED");
        else $display("TESTS FAILED: %0d error(s)", errors);
        $finish;
    end
endmodule
`,
  },

  // ─── 9. PISO Shift Register ───────────────────────────────────────────────
  {
    id: "shift-reg-piso", slug: "shift-reg-piso", title: "Shift Register (PISO)",
    difficulty: "intermediate", category: "sequential",
    tags: ["shift-register", "PISO", "parallel-to-serial"],
    learningLevel: "Verilog Intermediate",
    moduleId: "mod_shift_registers", orderIndex: 9,
    xpReward: 135, waveformRequired: true,
    expectedOutputMode: "stdout_compare",

    statement: `## Shift Register — PISO (Parallel-In Serial-Out)

A 4-bit PISO shift register. A parallel word is loaded all at once when \`load=1\`, then shifted out one bit at a time via \`so\`.

**Interface**

| Port      | Direction | Description                        |
|-----------|-----------|------------------------------------|
| \`clk\`   | input     | Clock                              |
| \`rst\`   | input     | Synchronous reset                  |
| \`load\`  | input     | 1=load parallel data, 0=shift      |
| \`pi[3:0]\`| input    | Parallel input data                |
| \`so\`    | output    | Serial output (MSB exits first)    |

**Operation:**
- \`load=1\`: \`sr <= pi\` (load all 4 bits at once)
- \`load=0\`: \`sr <= {sr[2:0], 1'b0}\` (shift left, MSB exits)
- \`so = sr[3]\` always

**Use case:** SPI transmitter — CPU writes a byte, hardware shifts it out bit-by-bit. Keyboard scan matrices use PISO registers.`,

    constraints: [
      "load=1 has priority over shifting.",
      "MSB (sr[3]) exits first via so.",
      "Fill LSB with 0 during shift.",
    ],
    examples: [
      { input: "load=1, pi=4'b1011, then load=0 x4", output: "so outputs: 1,0,1,1" },
    ],
    hints: [
      { tier: 1, content: "In always @(posedge clk): `if(rst) sr<=0; else if(load) sr<=pi; else sr<={sr[2:0],1'b0};`" },
    ],
    publicTestcases: [], hiddenTestcases: [],

    starterCode: `\`timescale 1ns / 1ps

module piso (
    input  wire       clk,
    input  wire       rst,
    input  wire       load,
    input  wire [3:0] pi,
    output wire       so
);

    reg [3:0] sr;

    always @(posedge clk) begin
        if (rst)       sr <= 4'b0;
        else if (load) sr <= pi;          // load parallel data
        else           sr <= {sr[2:0], 1'b0}; // shift MSB out
    end

    assign so = sr[3];

endmodule
`,

    publicTestbench: `\`timescale 1ns / 1ps
module tb_piso;
    reg clk, rst, load; reg [3:0] pi; wire so;
    piso dut (.clk(clk),.rst(rst),.load(load),.pi(pi),.so(so));
    initial clk = 0;
    always #5 clk = ~clk;
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_piso); end
    initial begin
        $display("=== PISO Shift Register Test ===");
        rst=1; load=0; pi=0; @(posedge clk); #1; rst=0;
        // Load 4'b1011
        pi=4'b1011; load=1; @(posedge clk); #1; load=0;
        $display("after load: so=%b (expect 1, MSB of 1011)", so);
        @(posedge clk); #1; $display("shift1: so=%b (expect 0)", so);
        @(posedge clk); #1; $display("shift2: so=%b (expect 1)", so);
        @(posedge clk); #1; $display("shift3: so=%b (expect 1)", so);
        $finish;
    end
endmodule
`,

    hiddenTestbench: `\`timescale 1ns / 1ps
module tb_piso_hidden;
    reg clk, rst, load; reg [3:0] pi; wire so;
    integer errors;
    reg [3:0] captured;
    piso dut (.clk(clk),.rst(rst),.load(load),.pi(pi),.so(so));
    initial clk = 0;
    always #5 clk = ~clk;
    initial begin
        errors = 0;
        rst=1; load=0; pi=0; @(posedge clk); #1; rst=0;
        // Test 1: load 4'b1011, shift out MSB first → expect 1,0,1,1
        pi=4'b1011; load=1; @(posedge clk); #1; load=0;
        captured[3]=so; @(posedge clk); #1;
        captured[2]=so; @(posedge clk); #1;
        captured[1]=so; @(posedge clk); #1;
        captured[0]=so;
        if (captured!==4'b1011) begin $display("FAIL: exp 1011 got %b",captured); errors=errors+1; end
        // Test 2: load 4'b0110
        pi=4'b0110; load=1; @(posedge clk); #1; load=0;
        captured[3]=so; @(posedge clk); #1;
        captured[2]=so; @(posedge clk); #1;
        captured[1]=so; @(posedge clk); #1;
        captured[0]=so;
        if (captured!==4'b0110) begin $display("FAIL: exp 0110 got %b",captured); errors=errors+1; end
        if (errors==0) $display("ALL TESTS PASSED");
        else $display("TESTS FAILED: %0d error(s)", errors);
        $finish;
    end
endmodule
`,
  },

  // ─── 10. PIPO Shift Register ──────────────────────────────────────────────
  {
    id: "shift-reg-pipo", slug: "shift-reg-pipo", title: "Shift Register (PIPO)",
    difficulty: "intermediate", category: "sequential",
    tags: ["shift-register", "PIPO", "parallel", "register"],
    learningLevel: "Verilog Intermediate",
    moduleId: "mod_shift_registers", orderIndex: 10,
    xpReward: 115, waveformRequired: true,
    expectedOutputMode: "stdout_compare",

    statement: `## Shift Register — PIPO (Parallel-In Parallel-Out)

A 4-bit PIPO register. Data is loaded in parallel and available in parallel. This is essentially a **D-type register** — a bank of D flip-flops sharing a clock.

**Interface**

| Port      | Direction | Description                   |
|-----------|-----------|-------------------------------|
| \`clk\`   | input     | Clock                         |
| \`rst\`   | input     | Synchronous reset             |
| \`load\`  | input     | 1=capture input, 0=hold       |
| \`pi[3:0]\`| input    | Parallel input                |
| \`po[3:0]\`| output   | Parallel output               |

**Operation:**
- \`load=1\` on clk↑: \`po <= pi\`
- \`load=0\` on clk↑: \`po\` holds
- \`rst=1\` on clk↑: \`po <= 0\`

**Use case:** Pipeline registers, bus latches, output holding registers in CPUs and FPGAs.`,

    constraints: [
      "All 4 bits load and output simultaneously.",
      "rst > load > hold priority.",
      "Use non-blocking assignments (<=).",
    ],
    examples: [
      { input: "load=1, pi=4'hA", output: "po=4'hA on next clk" },
      { input: "load=0", output: "po holds" },
    ],
    hints: [
      { tier: 1, content: "In always @(posedge clk): `if(rst) po<=0; else if(load) po<=pi;`" },
    ],
    publicTestcases: [], hiddenTestcases: [],

    starterCode: `\`timescale 1ns / 1ps

module pipo (
    input  wire       clk,
    input  wire       rst,
    input  wire       load,
    input  wire [3:0] pi,
    output reg  [3:0] po
);

    always @(posedge clk) begin
        // TODO: rst > load > hold
    end

endmodule
`,

    publicTestbench: `\`timescale 1ns / 1ps
module tb_pipo;
    reg clk, rst, load; reg [3:0] pi; wire [3:0] po;
    pipo dut (.clk(clk),.rst(rst),.load(load),.pi(pi),.po(po));
    initial clk = 0;
    always #5 clk = ~clk;
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_pipo); end
    initial begin
        $display("=== PIPO Register Test ===");
        rst=1; load=0; pi=4'hA; @(posedge clk); #1;
        $display("rst: po=%h (expect 0)", po);
        rst=0; load=1; pi=4'hA; @(posedge clk); #1;
        $display("load A: po=%h (expect A)", po);
        load=0; pi=4'hF; @(posedge clk); #1;
        $display("hold:   po=%h (expect A, pi=F ignored)", po);
        load=1; pi=4'h5; @(posedge clk); #1;
        $display("load 5: po=%h (expect 5)", po);
        $finish;
    end
endmodule
`,

    hiddenTestbench: `\`timescale 1ns / 1ps
module tb_pipo_hidden;
    reg clk, rst, load; reg [3:0] pi; wire [3:0] po;
    integer errors;
    pipo dut (.clk(clk),.rst(rst),.load(load),.pi(pi),.po(po));
    initial clk = 0;
    always #5 clk = ~clk;
    initial begin
        errors = 0;
        rst=1; load=1; pi=4'hF; @(posedge clk); #1;
        if (po!==4'h0) begin $display("FAIL rst: exp 0 got %h",po); errors=errors+1; end
        rst=0; load=1; pi=4'hA; @(posedge clk); #1;
        if (po!==4'hA) begin $display("FAIL load A: exp A got %h",po); errors=errors+1; end
        load=0; pi=4'hF; @(posedge clk); #1;
        if (po!==4'hA) begin $display("FAIL hold: exp A got %h",po); errors=errors+1; end
        load=1; pi=4'h5; @(posedge clk); #1;
        if (po!==4'h5) begin $display("FAIL load 5: exp 5 got %h",po); errors=errors+1; end
        load=0; @(posedge clk); #1;
        if (po!==4'h5) begin $display("FAIL hold5: exp 5 got %h",po); errors=errors+1; end
        rst=1; @(posedge clk); #1;
        if (po!==4'h0) begin $display("FAIL rst2: exp 0 got %h",po); errors=errors+1; end
        if (errors==0) $display("ALL TESTS PASSED");
        else $display("TESTS FAILED: %0d error(s)", errors);
        $finish;
    end
endmodule
`,
  },

  // ─── 11. Bidirectional Shift Register ─────────────────────────────────────
  {
    id: "shift-reg-bidir", slug: "shift-reg-bidir", title: "Bidirectional Shift Register",
    difficulty: "intermediate", category: "sequential",
    tags: ["shift-register", "bidirectional", "left-right"],
    learningLevel: "Verilog Intermediate",
    moduleId: "mod_shift_registers", orderIndex: 11,
    xpReward: 150, waveformRequired: true,
    expectedOutputMode: "stdout_compare",

    statement: `## Bidirectional Shift Register

A 4-bit shift register that can shift **left or right** depending on a direction control.

**Interface**

| Port      | Direction | Description                         |
|-----------|-----------|-------------------------------------|
| \`clk\`   | input     | Clock                               |
| \`rst\`   | input     | Synchronous reset                   |
| \`dir\`   | input     | 0=shift left, 1=shift right         |
| \`si_l\`  | input     | Serial input for left-shift (enters LSB) |
| \`si_r\`  | input     | Serial input for right-shift (enters MSB) |
| \`q[3:0]\`| output    | Register contents                   |

**Left shift (dir=0):** MSB exits, \`si_l\` enters at bit 0.
\`q <= {q[2:0], si_l}\`

**Right shift (dir=1):** LSB exits, \`si_r\` enters at bit 3.
\`q <= {si_r, q[3:1]}\``,

    constraints: [
      "Two shift directions controlled by dir.",
      "Different serial inputs for each direction.",
      "Use non-blocking assignments (<=).",
    ],
    examples: [
      { input: "dir=0, si_l=1, q=4'b1010", output: "q=4'b0101 (left shift)" },
      { input: "dir=1, si_r=0, q=4'b1010", output: "q=4'b0101 (right shift)" },
    ],
    hints: [
      { tier: 1, content: "Use if(dir) for right shift, else for left shift inside always@(posedge clk)." },
      { tier: 2, content: "Left: `q<={q[2:0],si_l};`  Right: `q<={si_r,q[3:1]};`" },
    ],
    publicTestcases: [], hiddenTestcases: [],

    starterCode: `\`timescale 1ns / 1ps

module bidir_shift (
    input  wire       clk,
    input  wire       rst,
    input  wire       dir,    // 0=left, 1=right
    input  wire       si_l,   // serial in for left shift
    input  wire       si_r,   // serial in for right shift
    output reg  [3:0] q
);

    always @(posedge clk) begin
        if (rst)     q <= 4'b0;
        else if (!dir) q <= {q[2:0], si_l};  // left shift
        else           q <= {si_r, q[3:1]};  // right shift
    end

endmodule
`,

    publicTestbench: `\`timescale 1ns / 1ps
module tb_bidir_shift;
    reg clk, rst, dir, si_l, si_r; wire [3:0] q;
    bidir_shift dut (.clk(clk),.rst(rst),.dir(dir),.si_l(si_l),.si_r(si_r),.q(q));
    initial clk = 0;
    always #5 clk = ~clk;
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_bidir_shift); end
    initial begin
        $display("=== Bidirectional Shift Register Test ===");
        rst=1; dir=0; si_l=0; si_r=0; @(posedge clk); #1; rst=0;
        // Left shift in 1111
        dir=0; si_l=1; repeat(4) @(posedge clk); #1;
        $display("left shift in 4x1: q=%b (expect 1111)", q);
        // Right shift
        dir=1; si_r=0; @(posedge clk); #1;
        $display("right shift si_r=0: q=%b (expect 0111)", q);
        dir=1; si_r=0; @(posedge clk); #1;
        $display("right shift si_r=0: q=%b (expect 0011)", q);
        $finish;
    end
endmodule
`,

    hiddenTestbench: `\`timescale 1ns / 1ps
module tb_bidir_hidden;
    reg clk, rst, dir, si_l, si_r; wire [3:0] q;
    integer errors;
    bidir_shift dut (.clk(clk),.rst(rst),.dir(dir),.si_l(si_l),.si_r(si_r),.q(q));
    initial clk = 0;
    always #5 clk = ~clk;
    initial begin
        errors = 0;
        rst=1; dir=0; si_l=0; si_r=0; @(posedge clk); #1; rst=0;
        // Left shift: shift in 4'b1011 (bit 0 first)
        dir=0; si_l=1; @(posedge clk); #1;
        dir=0; si_l=1; @(posedge clk); #1;
        dir=0; si_l=0; @(posedge clk); #1;
        dir=0; si_l=1; @(posedge clk); #1;
        if (q!==4'b1101) begin $display("FAIL left shift: exp 1101 got %b",q); errors=errors+1; end
        // Right shift: shift in 0 from right
        dir=1; si_r=0; @(posedge clk); #1;
        if (q!==4'b0110) begin $display("FAIL right1: exp 0110 got %b",q); errors=errors+1; end
        dir=1; si_r=1; @(posedge clk); #1;
        if (q!==4'b1011) begin $display("FAIL right2(si_r=1): exp 1011 got %b",q); errors=errors+1; end
        if (errors==0) $display("ALL TESTS PASSED");
        else $display("TESTS FAILED: %0d error(s)", errors);
        $finish;
    end
endmodule
`,
  },

  // ─── 12. Universal Shift Register ─────────────────────────────────────────
  {
    id: "universal-shift-register", slug: "universal-shift-register", title: "Universal Shift Register",
    difficulty: "intermediate", category: "sequential",
    tags: ["shift-register", "universal", "interview", "74194"],
    learningLevel: "Verilog Intermediate",
    moduleId: "mod_shift_registers", orderIndex: 12,
    xpReward: 175, waveformRequired: true,
    expectedOutputMode: "stdout_compare",

    statement: `## Universal Shift Register

A 4-bit universal shift register supports **all four modes** via a 2-bit mode select \`s[1:0]\`. This mirrors the real **74HC194** IC.

| s | Mode                  |
|---|-----------------------|
| 00 | Hold (no change)     |
| 01 | Right shift (si_r → MSB) |
| 10 | Left shift  (si_l → LSB) |
| 11 | Parallel load (pi → q)  |

**Interface**

| Port      | Direction | Description                     |
|-----------|-----------|---------------------------------|
| \`clk\`   | input     | Clock                           |
| \`rst\`   | input     | Synchronous reset               |
| \`s[1:0]\`| input     | Mode select                     |
| \`si_r\`  | input     | Right-shift serial input (→MSB) |
| \`si_l\`  | input     | Left-shift serial input (→LSB)  |
| \`pi[3:0]\`| input    | Parallel data input             |
| \`q[3:0]\`| output    | Register output                 |

This is the capstone shift register problem — it combines load, left, right, and hold in one module.`,

    constraints: [
      "Use case(s) inside always @(posedge clk).",
      "rst overrides all modes.",
      "Use non-blocking assignments (<=).",
    ],
    examples: [
      { input: "s=11, pi=4'hA", output: "q=4'hA (load)" },
      { input: "s=01, si_r=1", output: "q={1,q[3:1]} (right shift)" },
      { input: "s=10, si_l=0", output: "q={q[2:0],0} (left shift)" },
      { input: "s=00", output: "q=prev (hold)" },
    ],
    hints: [
      { tier: 1, content: "Use case(s) with 4 arms: 00=hold, 01=right, 10=left, 11=load." },
      { tier: 2, content: "Right shift: `q<={si_r, q[3:1]};`  Left shift: `q<={q[2:0], si_l};`" },
    ],
    publicTestcases: [], hiddenTestcases: [],

    starterCode: `\`timescale 1ns / 1ps

module universal_sr (
    input  wire       clk,
    input  wire       rst,
    input  wire [1:0] s,      // 00=hold, 01=right, 10=left, 11=load
    input  wire       si_r,   // serial input for right shift
    input  wire       si_l,   // serial input for left shift
    input  wire [3:0] pi,     // parallel input
    output reg  [3:0] q
);

    always @(posedge clk) begin
        if (rst) q <= 4'b0;
        else case (s)
            2'b00: q <= q;                    // hold
            2'b01: q <= {si_r, q[3:1]};      // right shift
            2'b10: q <= {q[2:0], si_l};      // left shift
            2'b11: q <= pi;                   // parallel load
        endcase
    end

endmodule
`,

    publicTestbench: `\`timescale 1ns / 1ps
module tb_universal_sr;
    reg clk, rst, si_r, si_l; reg [1:0] s; reg [3:0] pi; wire [3:0] q;
    universal_sr dut (.clk(clk),.rst(rst),.s(s),.si_r(si_r),.si_l(si_l),.pi(pi),.q(q));
    initial clk = 0;
    always #5 clk = ~clk;
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_universal_sr); end
    initial begin
        $display("=== Universal Shift Register Test ===");
        rst=1; s=2'b00; si_r=0; si_l=0; pi=0; @(posedge clk); #1; rst=0;
        // Load
        s=2'b11; pi=4'hA; @(posedge clk); #1; $display("load A: q=%h (expect A)", q);
        // Hold
        s=2'b00; pi=4'hF; @(posedge clk); #1; $display("hold:   q=%h (expect A)", q);
        // Right shift
        s=2'b01; si_r=1; @(posedge clk); #1; $display("right:  q=%b (expect 1101)", q);
        // Left shift
        s=2'b10; si_l=0; @(posedge clk); #1; $display("left:   q=%b (expect 1010)", q);
        $finish;
    end
endmodule
`,

    hiddenTestbench: `\`timescale 1ns / 1ps
module tb_universal_sr_hidden;
    reg clk, rst, si_r, si_l; reg [1:0] s; reg [3:0] pi; wire [3:0] q;
    integer errors;
    universal_sr dut (.clk(clk),.rst(rst),.s(s),.si_r(si_r),.si_l(si_l),.pi(pi),.q(q));
    initial clk = 0;
    always #5 clk = ~clk;
    initial begin
        errors = 0;
        rst=1; s=2'b00; si_r=0; si_l=0; pi=0; @(posedge clk); #1; rst=0;
        // Load test
        s=2'b11; pi=4'b1010; @(posedge clk); #1;
        if (q!==4'b1010) begin $display("FAIL load: exp 1010 got %b",q); errors=errors+1; end
        // Hold test
        s=2'b00; pi=4'hF; @(posedge clk); #1;
        if (q!==4'b1010) begin $display("FAIL hold: exp 1010 got %b",q); errors=errors+1; end
        // Right shift x2 (si_r=1)
        s=2'b01; si_r=1; @(posedge clk); #1;
        if (q!==4'b1101) begin $display("FAIL right1: exp 1101 got %b",q); errors=errors+1; end
        s=2'b01; si_r=0; @(posedge clk); #1;
        if (q!==4'b0110) begin $display("FAIL right2: exp 0110 got %b",q); errors=errors+1; end
        // Left shift x2 (si_l=1)
        s=2'b10; si_l=1; @(posedge clk); #1;
        if (q!==4'b1101) begin $display("FAIL left1: exp 1101 got %b",q); errors=errors+1; end
        s=2'b10; si_l=0; @(posedge clk); #1;
        if (q!==4'b1010) begin $display("FAIL left2: exp 1010 got %b",q); errors=errors+1; end
        // Reset
        rst=1; @(posedge clk); #1;
        if (q!==4'b0000) begin $display("FAIL rst: exp 0000 got %b",q); errors=errors+1; end
        if (errors==0) $display("ALL TESTS PASSED");
        else $display("TESTS FAILED: %0d error(s)", errors);
        $finish;
    end
endmodule
`,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // MODULE: Sequential Design — Counters
  // ═══════════════════════════════════════════════════════════════════════════

  // ─── 13. 4-bit Synchronous Counter (preserved, fixed) ─────────────────────
  {
    id: "prob_005", slug: "4-bit-counter", title: "4-bit Synchronous Counter",
    difficulty: "intermediate", category: "sequential",
    tags: ["sequential", "counter", "enable", "reset"],
    learningLevel: "Verilog Intermediate",
    moduleId: "mod_sequential_design", orderIndex: 13,
    xpReward: 150, waveformRequired: true,
    expectedOutputMode: "stdout_compare",
    xpBonusNoHints: 75,

    statement: `## 4-bit Synchronous Counter

Implement a 4-bit synchronous up-counter with synchronous reset and enable.

### Interface

| Port     | Direction | Width | Description                         |
|----------|-----------|-------|-------------------------------------|
| \`clk\`  | input     | 1     | Clock — active on rising edge        |
| \`rst\`  | input     | 1     | Synchronous reset — forces count = 0 |
| \`en\`   | input     | 1     | Enable — counter only increments when high |
| \`count\`| output    | 4     | Current count value (0–15)           |

### Behaviour

- On rising edge:
  - If \`rst=1\`: count → 0
  - Else if \`en=1\`: count → count + 1
  - Else: count holds
- The counter wraps from 15 → 0 naturally (4-bit overflow)

### Notes
The enable input is critical in real hardware — it allows the counter to pause without losing state. This pattern is used in frequency dividers, timers, and pipeline stall logic.`,

    constraints: [
      "Use always @(posedge clk) with synchronous reset.",
      "Use non-blocking assignments (<=).",
      "rst has higher priority than en.",
      "Output must be declared as output reg [3:0].",
    ],
    examples: [
      { input: "clk↑, rst=1, en=X", output: "count=0", explanation: "Reset always wins" },
      { input: "clk↑, rst=0, en=1", output: "count=prev+1" },
      { input: "clk↑, rst=0, en=0", output: "count=prev", explanation: "Hold" },
    ],
    hints: [
      { tier: 1, content: "Start with `always @(posedge clk)` — only the clock in sensitivity list." },
      { tier: 2, content: "Inside: first check rst, then en. Non-blocking: count <= count + 1;" },
      { tier: 3, content: "if(rst) count<=0; else if(en) count<=count+1;" },
    ],
    publicTestcases: [
      { id: "tc_005_pub_1", description: "Reset, count, hold, wrap", testbench: "", expected: "ALL TESTS PASSED", weight: 100 },
    ],
    hiddenTestcases: [],
    

    starterCode: `\`timescale 1ns / 1ps

module counter (
    input  wire        clk,
    input  wire        rst,
    input  wire        en,
    output reg  [3:0]  count
);

    // TODO: 4-bit synchronous up-counter
    // Priority: rst > en > hold
    // Use non-blocking assignments (<=)

endmodule
`,

    publicTestbench: `\`timescale 1ns / 1ps
module tb_counter;
    reg        clk, rst, en;
    wire [3:0] count;
    integer errors;
    counter dut (.clk(clk), .rst(rst), .en(en), .count(count));
    initial clk = 0;
    always #5 clk = ~clk;
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_counter); end
    initial begin
        errors = 0;
        $display("=== 4-bit Counter Test ===");
        rst=1; en=0; repeat(3) @(posedge clk); #1;
        if (count !== 0) begin $display("FAIL reset: got %0d", count); errors=errors+1; end
        else $display("PASS reset => count=0");
        rst=0; en=1; repeat(5) @(posedge clk); #1;
        if (count !== 5) begin $display("FAIL count: got %0d exp 5", count); errors=errors+1; end
        else $display("PASS count 5 cycles => count=%0d", count);
        en=0; repeat(3) @(posedge clk); #1;
        if (count !== 5) begin $display("FAIL hold: got %0d exp 5", count); errors=errors+1; end
        else $display("PASS hold => count=%0d", count);
        en=1; repeat(11) @(posedge clk); #1;
        if (count !== 0) begin $display("FAIL wrap: got %0d exp 0", count); errors=errors+1; end
        else $display("PASS wrap => count=0");
        if (errors == 0) $display("ALL TESTS PASSED");
        else $display("TESTS FAILED: %0d error(s)", errors);
        $finish;
    end
endmodule
`,

    hiddenTestbench: `\`timescale 1ns / 1ps
module tb_counter_hidden;
    reg clk, rst, en; wire [3:0] count;
    integer errors;
    counter dut (.clk(clk),.rst(rst),.en(en),.count(count));
    initial clk = 0;
    always #5 clk = ~clk;
    initial begin
        errors = 0;
        rst=1; en=0; @(posedge clk); #1;
        if (count!==0) begin $display("FAIL rst: exp 0 got %0d",count); errors=errors+1; end
        rst=0; en=1; repeat(8) @(posedge clk); #1;
        if (count!==8) begin $display("FAIL count8: exp 8 got %0d",count); errors=errors+1; end
        rst=1; en=1; @(posedge clk); #1;
        if (count!==0) begin $display("FAIL rst>en: exp 0 got %0d",count); errors=errors+1; end
        rst=0; en=0; repeat(3) @(posedge clk); #1;
        if (count!==0) begin $display("FAIL hold0: exp 0 got %0d",count); errors=errors+1; end
        en=1; repeat(16) @(posedge clk); #1;
        if (count!==0) begin $display("FAIL wrap: exp 0 got %0d",count); errors=errors+1; end
        if (errors==0) $display("ALL TESTS PASSED");
        else $display("TESTS FAILED: %0d error(s)", errors);
        $finish;
    end
endmodule
`,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // MODULE: mod_sequential_design — Counters (continued)
  // ═══════════════════════════════════════════════════════════════════════════

  // ─── 14. Up Counter — Asynchronous (Ripple) ───────────────────────────────
  {
    id: "up-counter-async", slug: "up-counter-async", title: "Up Counter — Asynchronous (Ripple)",
    difficulty: "intermediate", category: "sequential",
    tags: ["counter", "async", "ripple", "negedge"],
    learningLevel: "Verilog Intermediate",
    moduleId: "mod_sequential_design", orderIndex: 14,
    xpReward: 140, waveformRequired: true,
    expectedOutputMode: "stdout_compare",

    statement: `## Up Counter — Asynchronous (Ripple)

Unlike the synchronous counter where all FFs share a clock, a **ripple counter** chains T flip-flops so each stage's output drives the next stage's clock. This creates **propagation delay** through the chain — the counter is asynchronous.

Implement a **4-bit ripple up-counter**:
- Each stage is a T flip-flop with T=1 (toggles on every trigger)
- Stage 0 toggles on \`negedge clk\`
- Stage N toggles on \`negedge q[N-1]\`
- Count increases by 1 each clock cycle

**Interface**

| Port      | Direction | Width | Description          |
|-----------|-----------|-------|----------------------|
| \`clk\`   | input     | 1     | Master clock         |
| \`rst\`   | input     | 1     | **Async** active-high reset (each FF resets immediately) |
| \`count[3:0]\` | output | 4  | Current count (0–15) |

**Key insight:** Using \`negedge\` for the ripple makes it an up-counter. Using \`posedge\` would make it a down-counter.

**Trade-off vs synchronous:** Ripple counters use less power and fewer resources but have timing glitches between clock edges that make them unsuitable for high-speed logic.`,

    constraints: [
      "Use four always blocks, one per bit.",
      "Each stage triggers on negedge of the previous stage's output.",
      "rst is asynchronous (in sensitivity list).",
      "T=1 for all stages (always toggle on trigger).",
    ],
    examples: [
      { input: "clk cycle 1", output: "count=1" },
      { input: "clk cycle 15", output: "count=15" },
      { input: "clk cycle 16", output: "count=0 (wrap)" },
    ],
    hints: [
      { tier: 1, content: "Four separate always blocks. FF0: `always @(negedge clk or posedge rst)`. FF1: `always @(negedge count[0] or posedge rst)`." },
      { tier: 2, content: "Each always block: `if(rst) count[N]<=0; else count[N]<=~count[N];`" },
    ],
    publicTestcases: [], hiddenTestcases: [],

    starterCode: `\`timescale 1ns / 1ps

module ripple_up_counter (
    input  wire       clk,
    input  wire       rst,    // async reset, active-high
    output reg  [3:0] count
);

    // Ripple (async) up-counter — 4 chained T flip-flops
    // Each stage toggles on the falling edge of the previous stage

    // Stage 0: triggered by master clock
    always @(negedge clk or posedge rst) begin
        if (rst) count[0] <= 1'b0;
        else     count[0] <= ~count[0];
    end

    // Stage 1: triggered by falling edge of count[0]
    always @(negedge count[0] or posedge rst) begin
        if (rst) count[1] <= 1'b0;
        else     count[1] <= ~count[1];
    end

    // TODO: add stages 2 and 3 following the same pattern

endmodule
`,

    publicTestbench: `\`timescale 1ns / 1ps
module tb_ripple_up_counter;
    reg clk, rst; wire [3:0] count;
    ripple_up_counter dut (.clk(clk),.rst(rst),.count(count));
    initial clk = 0;
    always #5 clk = ~clk;
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_ripple_up_counter); end
    initial begin
        $display("=== Ripple Up Counter Test ===");
        rst=1; #12; rst=0;
        repeat(16) begin
            @(negedge clk); #1;
            $display("count = %0d (%b)", count, count);
        end
        $finish;
    end
endmodule
`,

    hiddenTestbench: `\`timescale 1ns / 1ps
module tb_ripple_up_hidden;
    reg clk, rst; wire [3:0] count;
    integer errors;
    integer i;
    ripple_up_counter dut (.clk(clk),.rst(rst),.count(count));
    initial clk = 0;
    always #5 clk = ~clk;
    initial begin
        errors = 0;
        rst=1; #12; rst=0;
        for (i=0; i<16; i=i+1) begin
            @(negedge clk); #2;
            if (count !== i[3:0]) begin
                $display("FAIL cycle %0d: exp %0d got %0d", i, i, count);
                errors = errors + 1;
            end
        end
        // Wrap: cycle 16 should give 0
        @(negedge clk); #2;
        if (count !== 4'd0) begin
            $display("FAIL wrap: exp 0 got %0d", count);
            errors = errors + 1;
        end
        // Async reset mid-count
        repeat(3) @(negedge clk);
        rst=1; #3;
        if (count !== 4'd0) begin
            $display("FAIL async rst: exp 0 got %0d", count);
            errors = errors + 1;
        end
        rst=0;
        if (errors==0) $display("ALL TESTS PASSED");
        else $display("TESTS FAILED: %0d error(s)", errors);
        $finish;
    end
endmodule
`,
  },

  // ─── 15. Down Counter — Synchronous ───────────────────────────────────────
  {
    id: "down-counter-sync", slug: "down-counter-sync", title: "Down Counter — Synchronous",
    difficulty: "intermediate", category: "sequential",
    tags: ["counter", "down", "synchronous", "reset"],
    learningLevel: "Verilog Intermediate",
    moduleId: "mod_sequential_design", orderIndex: 15,
    xpReward: 130, waveformRequired: true,
    expectedOutputMode: "stdout_compare",

    statement: `## Down Counter — Synchronous

Implement a 4-bit **synchronous down-counter**. Instead of incrementing, it decrements by 1 each enabled clock cycle and wraps from 0 → 15 (natural 4-bit underflow).

**Interface**

| Port      | Direction | Width | Description                        |
|-----------|-----------|-------|------------------------------------|
| \`clk\`   | input     | 1     | Clock — rising edge                |
| \`rst\`   | input     | 1     | Synchronous reset — loads max value (15) |
| \`en\`    | input     | 1     | Enable — decrement only when high  |
| \`count[3:0]\`| output | 4   | Current count (15 → 0 → 15 → ...) |

**Behaviour on posedge clk:**
- rst=1 → count = 4'hF (reset to max)
- rst=0, en=1 → count = count - 1
- rst=0, en=0 → count holds

Note: 0 - 1 naturally wraps to 15 in 4-bit arithmetic — no special case needed.`,

    constraints: [
      "Use always @(posedge clk) — synchronous.",
      "rst loads 4'hF (max value), not 0.",
      "Use non-blocking assignments (<=).",
    ],
    examples: [
      { input: "rst=1, clk↑", output: "count=15" },
      { input: "en=1, count=5, clk↑", output: "count=4" },
      { input: "en=1, count=0, clk↑", output: "count=15 (wrap)" },
    ],
    hints: [
      { tier: 1, content: "Almost identical to the up-counter — just change `+1` to `-1` and reset to `4'hF`." },
    ],
    publicTestcases: [], hiddenTestcases: [],

    starterCode: `\`timescale 1ns / 1ps

module down_counter_sync (
    input  wire        clk,
    input  wire        rst,
    input  wire        en,
    output reg  [3:0]  count
);

    // Synchronous down-counter
    // rst → count=15 (max)  |  en=1 → count-1  |  en=0 → hold
    always @(posedge clk) begin
        // TODO: implement
    end

endmodule
`,

    publicTestbench: `\`timescale 1ns / 1ps
module tb_down_counter_sync;
    reg clk, rst, en; wire [3:0] count;
    down_counter_sync dut (.clk(clk),.rst(rst),.en(en),.count(count));
    initial clk = 0;
    always #5 clk = ~clk;
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_down_counter_sync); end
    initial begin
        $display("=== Sync Down Counter Test ===");
        rst=1; en=0; @(posedge clk); #1;
        $display("rst: count=%0d (expect 15)", count);
        rst=0; en=1;
        repeat(5) begin @(posedge clk); #1; $display("count=%0d", count); end
        en=0; @(posedge clk); #1; $display("hold: count=%0d (expect 10)", count);
        $finish;
    end
endmodule
`,

    hiddenTestbench: `\`timescale 1ns / 1ps
module tb_down_sync_hidden;
    reg clk, rst, en; wire [3:0] count;
    integer errors;
    integer i;
    down_counter_sync dut (.clk(clk),.rst(rst),.en(en),.count(count));
    initial clk = 0;
    always #5 clk = ~clk;
    initial begin
        errors = 0;
        rst=1; en=0; @(posedge clk); #1;
        if (count!==4'hF) begin $display("FAIL rst: exp 15 got %0d",count); errors=errors+1; end
        rst=0; en=1;
        for (i=14; i>=0; i=i-1) begin
            @(posedge clk); #1;
            if (count!==i[3:0]) begin $display("FAIL count=%0d exp %0d",count,i); errors=errors+1; end
        end
        // Wrap: 0 → 15
        @(posedge clk); #1;
        if (count!==4'hF) begin $display("FAIL wrap: exp 15 got %0d",count); errors=errors+1; end
        // Hold
        en=0; @(posedge clk); #1;
        if (count!==4'hF) begin $display("FAIL hold: exp 15 got %0d",count); errors=errors+1; end
        // rst>en
        en=1; rst=1; @(posedge clk); #1;
        if (count!==4'hF) begin $display("FAIL rst>en: exp 15 got %0d",count); errors=errors+1; end
        if (errors==0) $display("ALL TESTS PASSED");
        else $display("TESTS FAILED: %0d error(s)", errors);
        $finish;
    end
endmodule
`,
  },

  // ─── 16. Down Counter — Asynchronous (Ripple) ─────────────────────────────
  {
    id: "down-counter-async", slug: "down-counter-async", title: "Down Counter — Asynchronous (Ripple)",
    difficulty: "intermediate", category: "sequential",
    tags: ["counter", "down", "async", "ripple", "posedge"],
    learningLevel: "Verilog Intermediate",
    moduleId: "mod_sequential_design", orderIndex: 16,
    xpReward: 140, waveformRequired: true,
    expectedOutputMode: "stdout_compare",

    statement: `## Down Counter — Asynchronous (Ripple)

A **ripple down-counter** is the same as a ripple up-counter but each stage triggers on the **rising edge** (posedge) of the previous stage's output instead of the falling edge.

**Why posedge = down?**
- In an up-counter, Q toggles on the falling edge → Q goes 0→1 only when the lower bit falls 1→0 (carry propagation upward)
- In a down-counter, Q toggles on the rising edge → Q goes 1→0 when the lower bit rises 0→1 (borrow propagation upward)

**Interface**

| Port      | Direction | Width | Description                 |
|-----------|-----------|-------|-----------------------------|
| \`clk\`   | input     | 1     | Master clock                |
| \`rst\`   | input     | 1     | Async active-high reset (loads 0) |
| \`count[3:0]\`| output | 4   | Current count (15 → 14 → ... → 0 → 15) |

Stage 0 triggers on \`posedge clk\`. Stage N triggers on \`posedge count[N-1]\`.`,

    constraints: [
      "Use four always blocks, one per bit.",
      "Each stage triggers on posedge of the previous output (not negedge).",
      "rst is asynchronous.",
      "After reset, count should start at 0 and count down (15, 14, 13...).",
    ],
    examples: [
      { input: "clk cycle 1 (from 0)", output: "count=15" },
      { input: "clk cycle 2", output: "count=14" },
    ],
    hints: [
      { tier: 1, content: "Same structure as ripple up-counter but use `posedge` instead of `negedge` for all trigger edges." },
    ],
    publicTestcases: [], hiddenTestcases: [],

    starterCode: `\`timescale 1ns / 1ps

module ripple_down_counter (
    input  wire       clk,
    input  wire       rst,    // async reset, active-high
    output reg  [3:0] count
);

    // Ripple down-counter: posedge trigger on each stage
    // Stage 0: posedge clk
    always @(posedge clk or posedge rst) begin
        if (rst) count[0] <= 1'b0;
        else     count[0] <= ~count[0];
    end

    // TODO: stages 1, 2, 3 — use posedge count[N-1]

endmodule
`,

    publicTestbench: `\`timescale 1ns / 1ps
module tb_ripple_down_counter;
    reg clk, rst; wire [3:0] count;
    ripple_down_counter dut (.clk(clk),.rst(rst),.count(count));
    initial clk = 0;
    always #5 clk = ~clk;
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_ripple_down_counter); end
    initial begin
        $display("=== Ripple Down Counter Test ===");
        rst=1; #12; rst=0;
        repeat(16) begin
            @(posedge clk); #2;
            $display("count = %0d (%b)", count, count);
        end
        $finish;
    end
endmodule
`,

    hiddenTestbench: `\`timescale 1ns / 1ps
module tb_ripple_down_hidden;
    reg clk, rst; wire [3:0] count;
    integer errors;
    integer i;
    integer expected;
    ripple_down_counter dut (.clk(clk),.rst(rst),.count(count));
    initial clk = 0;
    always #5 clk = ~clk;
    initial begin
        errors = 0;
        rst=1; #12; rst=0;
        for (i=0; i<16; i=i+1) begin
            @(posedge clk); #2;
            expected = (-i - 1) & 15;
            if (count !== expected[3:0]) begin
                $display("FAIL cycle %0d: exp %0d got %0d", i+1, expected, count);
                errors = errors + 1;
            end
        end
        // Async reset mid-sequence
        repeat(3) @(posedge clk);
        rst=1; #3;
        if (count !== 4'd0) begin
            $display("FAIL async rst: exp 0 got %0d", count);
            errors = errors + 1;
        end
        rst=0;
        if (errors==0) $display("ALL TESTS PASSED");
        else $display("TESTS FAILED: %0d error(s)", errors);
        $finish;
    end
endmodule
`,
  },

  // ─── 17. Up-Down Counter ──────────────────────────────────────────────────
  {
    id: "up-down-counter", slug: "up-down-counter", title: "Up-Down Counter",
    difficulty: "intermediate", category: "sequential",
    tags: ["counter", "up-down", "bidirectional", "synchronous"],
    learningLevel: "Verilog Intermediate",
    moduleId: "mod_sequential_design", orderIndex: 17,
    xpReward: 145, waveformRequired: true,
    expectedOutputMode: "stdout_compare",

    statement: `## Up-Down Counter

A **synchronous up-down counter** that counts up or down depending on a direction control input.

**Interface**

| Port      | Direction | Width | Description                        |
|-----------|-----------|-------|------------------------------------|
| \`clk\`   | input     | 1     | Clock — rising edge                |
| \`rst\`   | input     | 1     | Synchronous reset → count=0        |
| \`en\`    | input     | 1     | Enable                             |
| \`up\`    | input     | 1     | 1=count up, 0=count down           |
| \`count[3:0]\`| output | 4   | Current count value                |

**Behaviour on posedge clk:**
- rst=1 → count = 0
- en=1, up=1 → count = count + 1
- en=1, up=0 → count = count - 1
- en=0 → count holds

Both overflow (15→0) and underflow (0→15) wrap naturally in 4-bit arithmetic.`,

    constraints: [
      "Synchronous design — always @(posedge clk).",
      "rst > en priority.",
      "up=1 increments, up=0 decrements.",
      "Use non-blocking assignments (<=).",
    ],
    examples: [
      { input: "up=1, en=1, count=14, clk↑", output: "count=15" },
      { input: "up=0, en=1, count=0, clk↑", output: "count=15 (underflow)" },
    ],
    hints: [
      { tier: 1, content: "Inside always@(posedge clk): `if(rst) count<=0; else if(en) count <= up ? count+1 : count-1;`" },
    ],
    publicTestcases: [], hiddenTestcases: [],

    starterCode: `\`timescale 1ns / 1ps

module up_down_counter (
    input  wire        clk,
    input  wire        rst,
    input  wire        en,
    input  wire        up,    // 1=up, 0=down
    output reg  [3:0]  count
);

    always @(posedge clk) begin
        // TODO: rst > en priority
        // when en=1: count up or down based on 'up' signal
    end

endmodule
`,

    publicTestbench: `\`timescale 1ns / 1ps
module tb_up_down_counter;
    reg clk, rst, en, up; wire [3:0] count;
    up_down_counter dut (.clk(clk),.rst(rst),.en(en),.up(up),.count(count));
    initial clk = 0;
    always #5 clk = ~clk;
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_up_down_counter); end
    initial begin
        $display("=== Up-Down Counter Test ===");
        rst=1; en=0; up=1; @(posedge clk); #1; $display("rst: count=%0d (expect 0)", count);
        rst=0; en=1; up=1;
        repeat(5) begin @(posedge clk); #1; $display("up: count=%0d", count); end
        up=0;
        repeat(3) begin @(posedge clk); #1; $display("dn: count=%0d", count); end
        en=0; @(posedge clk); #1; $display("hold: count=%0d (expect 2)", count);
        $finish;
    end
endmodule
`,

    hiddenTestbench: `\`timescale 1ns / 1ps
module tb_updown_hidden;
    reg clk, rst, en, up; wire [3:0] count;
    integer errors;
    integer i;
    up_down_counter dut (.clk(clk),.rst(rst),.en(en),.up(up),.count(count));
    initial clk = 0;
    always #5 clk = ~clk;
    initial begin
        errors = 0;
        rst=1; en=1; up=1; @(posedge clk); #1;
        if (count!==0) begin $display("FAIL rst: exp 0 got %0d",count); errors=errors+1; end
        // Count up 0..7
        rst=0; en=1; up=1;
        for (i=1; i<=7; i=i+1) begin
            @(posedge clk); #1;
            if (count!==i[3:0]) begin $display("FAIL up %0d: exp %0d got %0d",i,i,count); errors=errors+1; end
        end
        // Count down 7..4
        up=0;
        for (i=6; i>=4; i=i-1) begin
            @(posedge clk); #1;
            if (count!==i[3:0]) begin $display("FAIL dn %0d: exp %0d got %0d",i,i,count); errors=errors+1; end
        end
        // Hold
        en=0; @(posedge clk); #1;
        if (count!==4'd4) begin $display("FAIL hold: exp 4 got %0d",count); errors=errors+1; end
        // Underflow: count down from 0
        rst=1; @(posedge clk); #1; rst=0;
        en=1; up=0; @(posedge clk); #1;
        if (count!==4'hF) begin $display("FAIL underflow: exp 15 got %0d",count); errors=errors+1; end
        // Overflow: count up from 15
        up=1; @(posedge clk); #1;
        if (count!==4'd0) begin $display("FAIL overflow: exp 0 got %0d",count); errors=errors+1; end
        if (errors==0) $display("ALL TESTS PASSED");
        else $display("TESTS FAILED: %0d error(s)", errors);
        $finish;
    end
endmodule
`,
  },

  // ─── 18. Mod-N Counter ────────────────────────────────────────────────────
  {
    id: "mod-n-counter", slug: "mod-n-counter", title: "Mod-N Counter",
    difficulty: "intermediate", category: "sequential",
    tags: ["counter", "mod-n", "modulo", "interview", "frequency-divider"],
    learningLevel: "Verilog Intermediate",
    moduleId: "mod_sequential_design", orderIndex: 18,
    xpReward: 150, waveformRequired: true,
    expectedOutputMode: "stdout_compare",

    statement: `## Mod-N Counter

A **Mod-N counter** counts from 0 to N-1 and then resets back to 0. Unlike a power-of-2 counter, it can count to any arbitrary modulus.

Implement a **Mod-6 counter** (counts 0→1→2→3→4→5→0→...):

**Interface**

| Port      | Direction | Width | Description              |
|-----------|-----------|-------|--------------------------|
| \`clk\`   | input     | 1     | Clock                    |
| \`rst\`   | input     | 1     | Synchronous reset        |
| \`count[3:0]\`| output | 4   | Current count (0 to 5)   |

**Behaviour:**
- Counts 0 → 5, then wraps to 0 on the next clock
- When count reaches N-1 (5), the **next** clock resets to 0

**Use case:** Divide-by-6 clock divider (the output toggles every 3 counts → 6 count period). BCD counters are Mod-10. Seconds/minutes are Mod-60 chains.

**Generalisation:** Replace the constant 6 with a parameter for a fully generic Mod-N counter.`,

    constraints: [
      "Synchronous design — always @(posedge clk).",
      "Count must not exceed 5 at any time.",
      "Wrap from 5 → 0 on the next clock edge.",
    ],
    examples: [
      { input: "After 6 clocks from reset", output: "count=0 (wrapped)" },
      { input: "After 11 clocks from reset", output: "count=5" },
    ],
    hints: [
      { tier: 1, content: "Inside always@(posedge clk): `if(rst || count==5) count<=0; else count<=count+1;`" },
    ],
    publicTestcases: [], hiddenTestcases: [],

    starterCode: `\`timescale 1ns / 1ps

module mod_n_counter #(
    parameter N = 6    // Modulus — default Mod-6
)(
    input  wire        clk,
    input  wire        rst,
    output reg  [3:0]  count
);

    // Count 0 to N-1 then wrap to 0
    always @(posedge clk) begin
        // TODO: if rst or count reached N-1, reset; else increment
    end

endmodule
`,

    publicTestbench: `\`timescale 1ns / 1ps
module tb_mod_n_counter;
    reg clk, rst; wire [3:0] count;
    mod_n_counter #(.N(6)) dut (.clk(clk),.rst(rst),.count(count));
    initial clk = 0;
    always #5 clk = ~clk;
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_mod_n_counter); end
    initial begin
        $display("=== Mod-6 Counter Test ===");
        rst=1; @(posedge clk); #1; rst=0;
        repeat(14) begin
            @(posedge clk); #1;
            $display("count=%0d", count);
        end
        $finish;
    end
endmodule
`,

    hiddenTestbench: `\`timescale 1ns / 1ps
module tb_modn_hidden;
    reg clk, rst; wire [3:0] count;
    integer errors;
    integer i;
    integer expected;
    mod_n_counter #(.N(6)) dut (.clk(clk),.rst(rst),.count(count));
    initial clk = 0;
    always #5 clk = ~clk;
    initial begin
        errors = 0;
        rst=1; @(posedge clk); #1; rst=0;
        // Run 18 cycles (3 full mod-6 cycles)
        for (i=0; i<18; i=i+1) begin
            @(posedge clk); #1;
            expected = (i+1) % 6;
            if (count !== expected[3:0]) begin
                $display("FAIL cycle %0d: exp %0d got %0d", i+1, expected, count);
                errors = errors + 1;
            end
        end
        // Count must never exceed 5
        rst=1; @(posedge clk); #1; rst=0;
        for (i=0; i<30; i=i+1) begin
            @(posedge clk); #1;
            if (count > 5) begin
                $display("FAIL: count exceeded N-1: got %0d", count);
                errors = errors + 1;
            end
        end
        if (errors==0) $display("ALL TESTS PASSED");
        else $display("TESTS FAILED: %0d error(s)", errors);
        $finish;
    end
endmodule
`,
  },

  // ─── 19. Ring Counter ─────────────────────────────────────────────────────
  {
    id: "ring-counter", slug: "ring-counter", title: "Ring Counter",
    difficulty: "intermediate", category: "sequential",
    tags: ["counter", "ring", "one-hot", "shift-register"],
    learningLevel: "Verilog Intermediate",
    moduleId: "mod_sequential_design", orderIndex: 19,
    xpReward: 140, waveformRequired: true,
    expectedOutputMode: "stdout_compare",

    statement: `## Ring Counter

A **ring counter** is a circular shift register where the output of the last flip-flop is fed back into the input of the first. Exactly **one bit is high at a time** (one-hot), and it rotates around the register on each clock cycle.

Implement a 4-bit ring counter:

| Cycle | q[3:0] |
|-------|--------|
| Reset | 0001   |
| 1     | 0010   |
| 2     | 0100   |
| 3     | 1000   |
| 4     | 0001   | ← wrapped back

**Interface**

| Port      | Direction | Width | Description             |
|-----------|-----------|-------|-------------------------|
| \`clk\`   | input     | 1     | Clock                   |
| \`rst\`   | input     | 1     | Synchronous reset       |
| \`q[3:0]\`| output    | 4     | One-hot state output    |

**Key property:** Unlike a binary counter, the ring counter has only N states for N bits (not 2^N), but its outputs are **already decoded** — each bit directly indicates which state is active. Used in control sequencers and state machines.`,

    constraints: [
      "Reset loads 4'b0001 (LSB high).",
      "Each clock: shift left, MSB wraps to LSB.",
      "Exactly one bit is high at all times.",
    ],
    examples: [
      { input: "After reset", output: "q=4'b0001" },
      { input: "1 clock later", output: "q=4'b0010" },
      { input: "4 clocks later", output: "q=4'b0001 (full rotation)" },
    ],
    hints: [
      { tier: 1, content: "On each clock: `q <= {q[2:0], q[3]};` — shift left and wrap MSB to LSB." },
      { tier: 2, content: "Reset to `4'b0001`, not `4'b0000`." },
    ],
    publicTestcases: [], hiddenTestcases: [],

    starterCode: `\`timescale 1ns / 1ps

module ring_counter (
    input  wire       clk,
    input  wire       rst,
    output reg  [3:0] q
);

    // Ring counter: one-hot, rotates left each clock
    // Reset → 4'b0001
    always @(posedge clk) begin
        if (rst) q <= 4'b0001;
        else     q <= {q[2:0], q[3]};  // TODO: rotate — MSB wraps to LSB
    end

endmodule
`,

    publicTestbench: `\`timescale 1ns / 1ps
module tb_ring_counter;
    reg clk, rst; wire [3:0] q;
    ring_counter dut (.clk(clk),.rst(rst),.q(q));
    initial clk = 0;
    always #5 clk = ~clk;
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_ring_counter); end
    initial begin
        $display("=== Ring Counter Test ===");
        rst=1; @(posedge clk); #1; $display("rst:    q=%b (expect 0001)", q);
        rst=0;
        @(posedge clk); #1; $display("cycle1: q=%b (expect 0010)", q);
        @(posedge clk); #1; $display("cycle2: q=%b (expect 0100)", q);
        @(posedge clk); #1; $display("cycle3: q=%b (expect 1000)", q);
        @(posedge clk); #1; $display("cycle4: q=%b (expect 0001)", q);
        $finish;
    end
endmodule
`,

    hiddenTestbench: `\`timescale 1ns / 1ps
module tb_ring_hidden;
    reg clk, rst; wire [3:0] q;
    integer errors;
    integer i;
    reg [3:0] expected;
    ring_counter dut (.clk(clk),.rst(rst),.q(q));
    initial clk = 0;
    always #5 clk = ~clk;
    initial begin
        errors = 0;
        rst=1; @(posedge clk); #1;
        if (q!==4'b0001) begin $display("FAIL rst: exp 0001 got %b",q); errors=errors+1; end
        rst=0;
        expected = 4'b0001;
        for (i=0; i<12; i=i+1) begin
            expected = {expected[2:0], expected[3]};
            @(posedge clk); #1;
            if (q!==expected) begin $display("FAIL cycle %0d: exp %b got %b",i+1,expected,q); errors=errors+1; end
        end
        // One-hot check — popcount must always be 1
        rst=1; @(posedge clk); #1; rst=0;
        for (i=0; i<8; i=i+1) begin
            @(posedge clk); #1;
            if (q!==4'b0001 && q!==4'b0010 && q!==4'b0100 && q!==4'b1000) begin
                $display("FAIL not one-hot: q=%b",q); errors=errors+1;
            end
        end
        if (errors==0) $display("ALL TESTS PASSED");
        else $display("TESTS FAILED: %0d error(s)", errors);
        $finish;
    end
endmodule
`,
  },

  // ─── 20. Johnson Counter ──────────────────────────────────────────────────
  {
    id: "johnson-counter", slug: "johnson-counter", title: "Johnson Counter",
    difficulty: "intermediate", category: "sequential",
    tags: ["counter", "johnson", "twisted-ring", "gray-code-like"],
    learningLevel: "Verilog Intermediate",
    moduleId: "mod_sequential_design", orderIndex: 20,
    xpReward: 150, waveformRequired: true,
    expectedOutputMode: "stdout_compare",

    statement: `## Johnson Counter

The **Johnson counter** (also called a twisted-ring or switch-tail counter) is a shift register where the **inverted MSB** feeds back to the LSB. A 4-bit Johnson counter has **8 unique states** (2×N), compared to only N states for a ring counter.

| Cycle | q[3:0] |
|-------|--------|
| Reset | 0000   |
| 1     | 0001   |
| 2     | 0011   |
| 3     | 0111   |
| 4     | 1111   |
| 5     | 1110   |
| 6     | 1100   |
| 7     | 1000   |
| 8     | 0000   | ← back to start

**Interface**

| Port      | Direction | Width | Description         |
|-----------|-----------|-------|---------------------|
| \`clk\`   | input     | 1     | Clock               |
| \`rst\`   | input     | 1     | Synchronous reset → 4'b0000 |
| \`q[3:0]\`| output    | 4     | Johnson counter state |

**Key property:** Adjacent states differ by exactly one bit — like Gray code, but with a different sequence. This makes it glitch-free for state machine applications.`,

    constraints: [
      "Reset loads 4'b0000.",
      "Each clock: shift right, inverted MSB (q[3]) feeds into q[3].",
      "The twisted connection: new bit = ~q[3].",
    ],
    examples: [
      { input: "After reset (q=0000), clk↑", output: "q=0001 (~q[3]=1 enters at MSB... wait — shift right)" },
    ],
    hints: [
      { tier: 1, content: "Shift right: `q <= {~q[0], q[3:1]};` — inverted LSB enters at MSB." },
      { tier: 2, content: "Check the state table: from 0000, ~q[0]=1 enters MSB → 1000? No — shift right means MSB gets the new bit. Try: `q<={~q[0],q[3:1]}`." },
      { tier: 3, content: "From 0000: `{~q[0], q[3:1]} = {1, 000} = 1000`... that's not right. The standard Johnson is left-shift with ~MSB to LSB: `q<={q[2:0],~q[3]}`." },
    ],
    publicTestcases: [], hiddenTestcases: [],

    starterCode: `\`timescale 1ns / 1ps

module johnson_counter (
    input  wire       clk,
    input  wire       rst,
    output reg  [3:0] q
);

    // Johnson (twisted-ring) counter
    // Left shift: new LSB = ~q[3] (inverted MSB feeds back to LSB)
    // q <= {q[2:0], ~q[3]}
    // Sequence: 0000 → 0001 → 0011 → 0111 → 1111 → 1110 → 1100 → 1000 → 0000
    always @(posedge clk) begin
        if (rst) q <= 4'b0000;
        else     q <= {q[2:0], ~q[3]};  // TODO: implement Johnson feedback
    end

endmodule
`,

    publicTestbench: `\`timescale 1ns / 1ps
module tb_johnson_counter;
    reg clk, rst; wire [3:0] q;
    johnson_counter dut (.clk(clk),.rst(rst),.q(q));
    initial clk = 0;
    always #5 clk = ~clk;
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_johnson_counter); end
    initial begin
        $display("=== Johnson Counter Test ===");
        rst=1; @(posedge clk); #1; $display("rst:    q=%b (expect 0000)", q);
        rst=0;
        @(posedge clk); #1; $display("cycle1: q=%b (expect 0001)", q);
        @(posedge clk); #1; $display("cycle2: q=%b (expect 0011)", q);
        @(posedge clk); #1; $display("cycle3: q=%b (expect 0111)", q);
        @(posedge clk); #1; $display("cycle4: q=%b (expect 1111)", q);
        @(posedge clk); #1; $display("cycle5: q=%b (expect 1110)", q);
        @(posedge clk); #1; $display("cycle6: q=%b (expect 1100)", q);
        @(posedge clk); #1; $display("cycle7: q=%b (expect 1000)", q);
        @(posedge clk); #1; $display("cycle8: q=%b (expect 0000)", q);
        $finish;
    end
endmodule
`,

    hiddenTestbench: `\`timescale 1ns / 1ps
module tb_johnson_hidden;
    reg clk, rst; wire [3:0] q;
    integer errors;
    integer i;
    reg [3:0] expected_seq [0:7];
    johnson_counter dut (.clk(clk),.rst(rst),.q(q));
    initial clk = 0;
    always #5 clk = ~clk;
    initial begin
        expected_seq[0] = 4'b0000;
        expected_seq[1] = 4'b0001;
        expected_seq[2] = 4'b0011;
        expected_seq[3] = 4'b0111;
        expected_seq[4] = 4'b1111;
        expected_seq[5] = 4'b1110;
        expected_seq[6] = 4'b1100;
        expected_seq[7] = 4'b1000;
    end
    initial begin
        errors = 0;
        rst=1; @(posedge clk); #1;
        if (q!==4'b0000) begin $display("FAIL rst: exp 0000 got %b",q); errors=errors+1; end
        rst=0;
        // Test two full cycles (16 clocks)
        for (i=0; i<16; i=i+1) begin
            @(posedge clk); #1;
            if (q!==expected_seq[(i+1)%8]) begin
                $display("FAIL cycle %0d: exp %b got %b",i+1,expected_seq[(i+1)%8],q);
                errors=errors+1;
            end
        end
        if (errors==0) $display("ALL TESTS PASSED");
        else $display("TESTS FAILED: %0d error(s)", errors);
        $finish;
    end
endmodule
`,
  },
// ─────────────────────────────────────────────────────────────────────────────
// PASTE THIS BLOCK BEFORE THE CLOSING `];` IN intermediate.ts
// Part 1 of 2 — Problems: FF.01, FF.02, SU.01, SU.02, SU.03, CC.01, CC.02
// New moduleIds needed in index.ts:
//   mod_flip_flops_ext   — FF.01, FF.02
//   mod_sequential_utils — SU.01, SU.02, SU.03
//   mod_counters_advanced — CC.01, CC.02
// ─────────────────────────────────────────────────────────────────────────────

  // ═══════════════════════════════════════════════════════════════════════════
  // MODULE: Flip-Flop Variants (mod_flip_flops_ext)
  // ═══════════════════════════════════════════════════════════════════════════

  // ─── FF.01 — D Flip-Flop with Synchronous Reset ──────────────────────────
  {
    id: "dff-sync-reset", slug: "dff-sync-reset",
    title: "D Flip-Flop with Synchronous Reset",
    difficulty: "intermediate", category: "sequential",
    tags: ["flip-flop", "DFF", "synchronous-reset", "interview"],
    learningLevel: "Verilog Intermediate",
    moduleId: "mod_flip_flops_ext", orderIndex: 21,
    xpReward: 120, waveformRequired: true,
    expectedOutputMode: "stdout_compare",

    statement: `## D Flip-Flop with Synchronous Reset

A **synchronous reset** flip-flop only resets on the rising clock edge — not immediately when \`rst\` goes high. The sensitivity list is \`always @(posedge clk)\` only; \`rst\` is checked as a regular condition inside the block.

**Interface**

| Port | Direction | Description                        |
|------|-----------|------------------------------------|
| \`clk\` | input   | Clock (rising-edge triggered)      |
| \`rst\` | input   | Reset (synchronous, active-high)   |
| \`d\`   | input   | Data input                         |
| \`q\`   | output  | Registered output                  |

**Key insight:** assert \`rst=1\` mid-cycle — the output does **not** change until the next rising edge. Compare against the async-reset DFF: the outputs will diverge at the exact moment \`rst\` is asserted between edges.

In your comments, explain which reset style a synchronous design methodology prefers and why.`,

    constraints: [
      "Sensitivity list must be `always @(posedge clk)` only — no `rst` in the sensitivity list.",
      "On posedge clk: if rst=1, q <= 0; else q <= d.",
      "No async behaviour — rst mid-cycle must not affect q.",
    ],
    examples: [
      { input: "rst=1 asserted mid-cycle", output: "q unchanged until next posedge clk", explanation: "Synchronous reset waits for clock edge" },
      { input: "posedge clk with rst=1", output: "q=0", explanation: "Reset takes effect on the clock edge" },
      { input: "posedge clk with rst=0, d=1", output: "q=1", explanation: "Normal D capture" },
    ],
    hints: [
      { tier: 1, content: "The sensitivity list is `always @(posedge clk)` only. No `or posedge rst`." },
      { tier: 2, content: "Inside the block: `if (rst) q <= 0; else q <= d;` — rst is just a regular signal checked after the clock edge." },
      { tier: 3, content: "```\nalways @(posedge clk) begin\n  if (rst)\n    q <= 1'b0;\n  else\n    q <= d;\nend\n```" },
    ],
    publicTestcases: [], hiddenTestcases: [],

    starterCode: `\`timescale 1ns / 1ps

module dff_sync_reset (
    input  wire clk,
    input  wire rst,
    input  wire d,
    output reg  q
);

    // Synchronous reset: only resets on posedge clk
    // Sensitivity list: always @(posedge clk) only
    always @(posedge clk) begin
        // TODO: implement synchronous reset DFF
    end

endmodule
`,

    publicTestbench: `\`timescale 1ns / 1ps
module tb_dff_sync_reset;
    reg clk, rst, d;
    wire q;
    dff_sync_reset dut (.clk(clk),.rst(rst),.d(d),.q(q));
    initial clk = 0;
    always #5 clk = ~clk;
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_dff_sync_reset); end
    initial begin
        $display("=== DFF Synchronous Reset Test ===");
        rst=1; d=0; #3;
        $display("rst=1 mid-cycle (t=3):  q=%b (expect unchanged=x)", q);
        @(posedge clk); #1;
        $display("posedge clk, rst=1:     q=%b (expect 0)", q);
        rst=0; d=1;
        @(posedge clk); #1;
        $display("posedge clk, rst=0,d=1: q=%b (expect 1)", q);
        d=0;
        @(posedge clk); #1;
        $display("posedge clk, d=0:       q=%b (expect 0)", q);
        d=1;
        @(posedge clk); #1;
        rst=1; #2;
        $display("rst=1 mid-cycle (t+2):  q=%b (expect 1, not yet reset)", q);
        @(posedge clk); #1;
        $display("posedge clk, rst=1:     q=%b (expect 0)", q);
        $finish;
    end
endmodule
`,

    hiddenTestbench: `\`timescale 1ns / 1ps
module tb_dff_sync_reset_hidden;
    reg clk, rst, d;
    wire q;
    integer errors;
    dff_sync_reset dut (.clk(clk),.rst(rst),.d(d),.q(q));
    initial clk = 0;
    always #5 clk = ~clk;
    initial begin
        errors = 0;
        rst=1; d=0;
        // Test 1: rst=1 mid-cycle — q must not change
        @(posedge clk); #1;
        if (q !== 1'b0) begin $display("FAIL: rst on posedge, exp q=0 got %b", q); errors=errors+1; end
        // Test 2: rst deasserted, d=1 captured
        rst=0; d=1;
        @(posedge clk); #1;
        if (q !== 1'b1) begin $display("FAIL: d=1 capture, exp q=1 got %b", q); errors=errors+1; end
        // Test 3: rst mid-cycle does NOT affect q
        rst=1; #3;  // assert rst but no clock edge yet
        if (q !== 1'b1) begin $display("FAIL: rst mid-cycle changed q, exp 1 got %b", q); errors=errors+1; end
        // Test 4: rst takes effect on next posedge
        @(posedge clk); #1;
        if (q !== 1'b0) begin $display("FAIL: sync rst on edge, exp q=0 got %b", q); errors=errors+1; end
        // Test 5: d=1 while rst=0
        rst=0; d=1;
        @(posedge clk); #1;
        if (q !== 1'b1) begin $display("FAIL: d capture after rst, exp q=1 got %b", q); errors=errors+1; end
        // Test 6: rst deasserted just before edge — captures d
        rst=0; d=0;
        @(posedge clk); #1;
        if (q !== 1'b0) begin $display("FAIL: d=0, exp q=0 got %b", q); errors=errors+1; end
        if (errors == 0) $display("ALL TESTS PASSED");
        else $display("TESTS FAILED: %0d error(s)", errors);
        $finish;
    end
endmodule
`,
  },

  // ─── FF.02 — D Flip-Flop with Enable ─────────────────────────────────────
  {
    id: "dff-enable", slug: "dff-enable",
    title: "D Flip-Flop with Enable",
    difficulty: "intermediate", category: "sequential",
    tags: ["flip-flop", "DFF", "enable", "interview"],
    learningLevel: "Verilog Intermediate",
    moduleId: "mod_flip_flops_ext", orderIndex: 22,
    xpReward: 120, waveformRequired: true,
    expectedOutputMode: "stdout_compare",

    statement: `## D Flip-Flop with Enable

A D flip-flop that only captures \`d\` when the enable signal \`en\` is high. When \`en=0\`, \`q\` holds its current value regardless of what \`d\` does.

This is the **most common flip-flop variant in real RTL**. Every pipeline register, every configuration register, every write-gated storage element is this circuit. Synthesisers map it to a flip-flop with a dedicated clock-enable pin (CE on Xilinx, ENA on Intel/Altera) — saving power by stopping unnecessary switching.

**Interface**

| Port  | Direction | Description                      |
|-------|-----------|----------------------------------|
| \`clk\` | input   | Clock (rising-edge triggered)    |
| \`rst\` | input   | Async reset (active-high)        |
| \`en\`  | input   | Clock enable                     |
| \`d\`   | input   | Data input                       |
| \`q\`   | output  | Registered output                |

Implement for 1-bit. Verify that toggling \`d\` rapidly while \`en=0\` produces zero output transitions.`,

    constraints: [
      "Reset is asynchronous: `always @(posedge clk or posedge rst)`.",
      "When rst=1: q <= 0 (async, immediate).",
      "When rst=0 and en=1: q <= d on posedge clk.",
      "When rst=0 and en=0: q holds its current value.",
    ],
    examples: [
      { input: "en=0, d toggles every cycle", output: "q stays constant", explanation: "Enable gates the capture" },
      { input: "en=1, d=1", output: "q=1 on next posedge clk", explanation: "Normal capture when enabled" },
      { input: "rst=1 (async)", output: "q=0 immediately", explanation: "Async reset overrides enable" },
    ],
    hints: [
      { tier: 1, content: "Use `always @(posedge clk or posedge rst)`. Inside: rst check first, then en check." },
      { tier: 2, content: "`if (rst) q <= 0; else if (en) q <= d;` — no else needed; q holds implicitly (it's a register)." },
      { tier: 3, content: "```\nalways @(posedge clk or posedge rst) begin\n  if (rst)     q <= 1'b0;\n  else if (en) q <= d;\nend\n```" },
    ],
    publicTestcases: [], hiddenTestcases: [],

    starterCode: `\`timescale 1ns / 1ps

module dff_enable (
    input  wire clk,
    input  wire rst,
    input  wire en,
    input  wire d,
    output reg  q
);

    // DFF with async reset and clock enable
    // rst=1 → q=0 immediately (async)
    // en=1  → q captures d on posedge clk
    // en=0  → q holds current value
    always @(posedge clk or posedge rst) begin
        // TODO: implement enabled DFF
    end

endmodule
`,

    publicTestbench: `\`timescale 1ns / 1ps
module tb_dff_enable;
    reg clk, rst, en, d;
    wire q;
    dff_enable dut (.clk(clk),.rst(rst),.en(en),.d(d),.q(q));
    initial clk = 0;
    always #5 clk = ~clk;
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_dff_enable); end
    initial begin
        $display("=== DFF with Enable Test ===");
        rst=1; en=0; d=0; #3; rst=0;
        @(posedge clk); #1; $display("after rst:          q=%b (expect 0)", q);
        // en=0, d toggles — q must not change
        en=0; d=1; @(posedge clk); #1; $display("en=0,d=1:           q=%b (expect 0)", q);
        d=0;        @(posedge clk); #1; $display("en=0,d=0:           q=%b (expect 0)", q);
        d=1;        @(posedge clk); #1; $display("en=0,d=1 again:     q=%b (expect 0)", q);
        // en=1 — q captures d
        en=1; d=1; @(posedge clk); #1; $display("en=1,d=1:           q=%b (expect 1)", q);
        d=0;        @(posedge clk); #1; $display("en=1,d=0:           q=%b (expect 0)", q);
        // async reset while en=0
        en=0; d=1; rst=1; #2; $display("async rst (mid):    q=%b (expect 0 async)", q);
        rst=0;
        @(posedge clk); #1; $display("after rst release:  q=%b (expect 0)", q);
        $finish;
    end
endmodule
`,

    hiddenTestbench: `\`timescale 1ns / 1ps
module tb_dff_enable_hidden;
    reg clk, rst, en, d;
    wire q;
    integer errors;
    dff_enable dut (.clk(clk),.rst(rst),.en(en),.d(d),.q(q));
    initial clk = 0;
    always #5 clk = ~clk;
    initial begin
        errors = 0;
        rst=1; en=0; d=0; #3; rst=0;
        @(posedge clk); #1;
        if (q !== 1'b0) begin $display("FAIL: post-rst q=%b exp 0", q); errors=errors+1; end
        // en=0, d=1 for 5 cycles — q must not change
        en=0; d=1;
        repeat(5) @(posedge clk);
        #1;
        if (q !== 1'b0) begin $display("FAIL: en=0 d=1 5cycles, q=%b exp 0", q); errors=errors+1; end
        // en=1, d=1
        en=1; d=1; @(posedge clk); #1;
        if (q !== 1'b1) begin $display("FAIL: en=1 d=1, q=%b exp 1", q); errors=errors+1; end
        // en=0 again, d toggles
        en=0; d=0; @(posedge clk); #1;
        if (q !== 1'b1) begin $display("FAIL: en=0 after en=1, q=%b exp 1", q); errors=errors+1; end
        // async reset fires while en=0
        rst=1; #2;
        if (q !== 1'b0) begin $display("FAIL: async rst, q=%b exp 0", q); errors=errors+1; end
        rst=0;
        // en=1 and rst together — rst wins
        en=1; d=1; @(posedge clk); #1;
        if (q !== 1'b1) begin $display("FAIL: re-capture after rst, q=%b exp 1", q); errors=errors+1; end
        rst=1; @(posedge clk); #1; rst=0;
        if (q !== 1'b0) begin $display("FAIL: rst wins over en, q=%b exp 0", q); errors=errors+1; end
        if (errors == 0) $display("ALL TESTS PASSED");
        else $display("TESTS FAILED: %0d error(s)", errors);
        $finish;
    end
endmodule
`,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // MODULE: Sequential Utilities (mod_sequential_utils)
  // ═══════════════════════════════════════════════════════════════════════════

  // ─── SU.01 — Edge Detector ───────────────────────────────────────────────
  {
    id: "edge-detector", slug: "edge-detector",
    title: "Edge Detector",
    difficulty: "intermediate", category: "sequential",
    tags: ["edge-detect", "sequential", "interview", "pulse"],
    learningLevel: "Verilog Intermediate",
    moduleId: "mod_sequential_utils", orderIndex: 23,
    xpReward: 130, waveformRequired: true,
    expectedOutputMode: "stdout_compare",

    statement: `## Edge Detector

Detect the rising edge, falling edge, and either edge of an input signal, producing a **single-cycle pulse** for each event.

The technique: store the previous value of the signal in a 1-bit register, then compare against the current value.

**Interface**

| Port      | Direction | Description                              |
|-----------|-----------|------------------------------------------|
| \`clk\`     | input   | Clock                                    |
| \`rst\`     | input   | Async reset (active-high)                |
| \`sig\`     | input   | Input signal (may be async to clk)       |
| \`rising\`  | output  | 1-cycle pulse on 0→1 transition          |
| \`falling\` | output  | 1-cycle pulse on 1→0 transition          |
| \`either\`  | output  | 1-cycle pulse on any transition          |

**Logic:**
\`\`\`
sig_d   = sig delayed one cycle via DFF
rising  = sig & ~sig_d     // was 0, now 1
falling = ~sig & sig_d     // was 1, now 0
either  = sig ^ sig_d      // changed in either direction
\`\`\`

The output pulse is exactly **one clock cycle wide** regardless of how long the input stays high or low. This circuit appears in every interrupt controller, debouncer, handshake detector, and edge-sensitive protocol trigger.`,

    constraints: [
      "Store previous value of sig in a register sig_d.",
      "rising/falling/either are purely combinational from sig and sig_d.",
      "rst clears sig_d to prevent spurious pulse on first cycle.",
    ],
    examples: [
      { input: "sig 0→1", output: "rising=1 for exactly 1 cycle", explanation: "Rising edge detected" },
      { input: "sig 1→0", output: "falling=1 for exactly 1 cycle", explanation: "Falling edge detected" },
      { input: "sig held high for 10 cycles", output: "rising=1 once, then 0 for 9 cycles", explanation: "Pulse width is exactly 1 cycle" },
    ],
    hints: [
      { tier: 1, content: "You need one register: `reg sig_d`. On posedge clk: `sig_d <= sig`. Then use combinational assigns for rising/falling/either." },
      { tier: 2, content: "`assign rising = sig & ~sig_d;` — current is 1, previous was 0. `assign falling = ~sig & sig_d;`" },
      { tier: 3, content: "```\nreg sig_d;\nalways @(posedge clk or posedge rst)\n  if (rst) sig_d <= 0;\n  else     sig_d <= sig;\nassign rising  = sig & ~sig_d;\nassign falling = ~sig & sig_d;\nassign either  = sig ^ sig_d;\n```" },
    ],
    publicTestcases: [], hiddenTestcases: [],

    starterCode: `\`timescale 1ns / 1ps

module edge_detector (
    input  wire clk,
    input  wire rst,
    input  wire sig,
    output wire rising,
    output wire falling,
    output wire either
);

    reg sig_d;  // delayed (previous) value of sig

    // Register: capture sig on each clock edge
    always @(posedge clk or posedge rst) begin
        if (rst) sig_d <= 1'b0;
        else     sig_d <= sig;
    end

    // Combinational edge detection
    // TODO: assign rising, falling, either using sig and sig_d

endmodule
`,

    publicTestbench: `\`timescale 1ns / 1ps
module tb_edge_detector;
    reg clk, rst, sig;
    wire rising, falling, either;
    edge_detector dut (.clk(clk),.rst(rst),.sig(sig),.rising(rising),.falling(falling),.either(either));
    initial clk = 0;
    always #5 clk = ~clk;
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_edge_detector); end
    initial begin
        $display("=== Edge Detector Test ===");
        rst=1; sig=0; @(posedge clk); #1; rst=0;
        $display("rst:                    rising=%b falling=%b either=%b (all 0)", rising, falling, either);
        // Rising edge
        sig=1; @(posedge clk); #1;
        $display("sig 0->1 (rising edge): rising=%b falling=%b either=%b (1 0 1)", rising, falling, either);
        // Held high — no more pulses
        @(posedge clk); #1;
        $display("sig held high:          rising=%b falling=%b either=%b (0 0 0)", rising, falling, either);
        @(posedge clk); #1;
        $display("sig held high again:    rising=%b falling=%b either=%b (0 0 0)", rising, falling, either);
        // Falling edge
        sig=0; @(posedge clk); #1;
        $display("sig 1->0 (fall edge):   rising=%b falling=%b either=%b (0 1 1)", rising, falling, either);
        // Held low
        @(posedge clk); #1;
        $display("sig held low:           rising=%b falling=%b either=%b (0 0 0)", rising, falling, either);
        $finish;
    end
endmodule
`,

    hiddenTestbench: `\`timescale 1ns / 1ps
module tb_edge_detector_hidden;
    reg clk, rst, sig;
    wire rising, falling, either;
    integer errors;
    edge_detector dut (.clk(clk),.rst(rst),.sig(sig),.rising(rising),.falling(falling),.either(either));
    initial clk = 0;
    always #5 clk = ~clk;
    initial begin
        errors = 0;
        rst=1; sig=0; @(posedge clk); #1; rst=0;
        // No spurious pulse after reset
        if (rising||falling||either) begin $display("FAIL: spurious pulse after rst"); errors=errors+1; end
        // Rising edge — rising and either pulse for 1 cycle
        sig=1; @(posedge clk); #1;
        if (rising!==1'b1) begin $display("FAIL: rising=0 on 0->1"); errors=errors+1; end
        if (falling!==1'b0) begin $display("FAIL: falling=1 on 0->1"); errors=errors+1; end
        if (either!==1'b1)  begin $display("FAIL: either=0 on 0->1"); errors=errors+1; end
        // Held high for 10 cycles — no more pulses
        repeat(10) begin
            @(posedge clk); #1;
            if (rising!==1'b0) begin $display("FAIL: rising pulse while held high"); errors=errors+1; end
        end
        // Falling edge — falling and either pulse for 1 cycle
        sig=0; @(posedge clk); #1;
        if (falling!==1'b1) begin $display("FAIL: falling=0 on 1->0"); errors=errors+1; end
        if (rising!==1'b0)  begin $display("FAIL: rising=1 on 1->0"); errors=errors+1; end
        if (either!==1'b1)  begin $display("FAIL: either=0 on 1->0"); errors=errors+1; end
        // Held low — no pulses
        @(posedge clk); #1;
        if (falling||rising||either) begin $display("FAIL: spurious pulse while held low"); errors=errors+1; end
        // Rapid toggling — alternating rising/falling
        sig=1; @(posedge clk); #1;
        if (rising!==1'b1) begin $display("FAIL: rapid toggle rising"); errors=errors+1; end
        sig=0; @(posedge clk); #1;
        if (falling!==1'b1) begin $display("FAIL: rapid toggle falling"); errors=errors+1; end
        if (errors == 0) $display("ALL TESTS PASSED");
        else $display("TESTS FAILED: %0d error(s)", errors);
        $finish;
    end
endmodule
`,
  },

  // ─── SU.02 — Blocking vs Non-Blocking Bug Hunt ───────────────────────────
  {
    id: "blocking-vs-nonblocking", slug: "blocking-vs-nonblocking",
    title: "Blocking vs Non-Blocking: The Bug Hunt",
    difficulty: "intermediate", category: "sequential",
    tags: ["blocking", "non-blocking", "debug", "interview", "pipeline"],
    learningLevel: "Verilog Intermediate",
    moduleId: "mod_sequential_utils", orderIndex: 24,
    xpReward: 140, waveformRequired: false,
    expectedOutputMode: "stdout_compare",

    statement: `## Blocking vs Non-Blocking: The Bug Hunt

You are given two nearly identical modules. Both are supposed to implement a **3-stage pipeline shift register**: data enters at \`a\`, passes through \`b\`, then \`c\`, shifting one stage per clock.

**Module A (buggy) — uses blocking assignments:**
\`\`\`verilog
always @(posedge clk) begin
  b = a;   // blocking
  c = b;   // blocking — BUT b is already the NEW value!
end
\`\`\`

**Module B (correct) — uses non-blocking assignments:**
\`\`\`verilog
always @(posedge clk) begin
  b <= a;  // non-blocking
  c <= b;  // non-blocking — b is still the OLD value
end
\`\`\`

**Your task:** Implement both modules inside a single top-level wrapper. The wrapper outputs \`c_buggy\` (from Module A) and \`c_correct\` (from Module B) for comparison.

In Module A: by the time the second line executes, \`b\` already holds the new value of \`a\`, so \`c\` gets \`a\` directly — the pipeline collapses to zero delay. In Module B: all RHS values are captured before the clock edge, so \`c\` correctly lags \`a\` by two cycles.

This is not a style preference — it is the **single most important correctness rule** in RTL design.`,

    constraints: [
      "Implement module shift_buggy using blocking assignments (=).",
      "Implement module shift_correct using non-blocking assignments (<=).",
      "Top module shift_compare instantiates both and exposes c_buggy and c_correct.",
      "For input sequence a=1,0,0,0,0: c_correct must show the value 2 cycles later than c_buggy.",
    ],
    examples: [
      { input: "a sequence: 1,0,0,0,0 applied cycle by cycle", output: "c_buggy: 1,0,0,0,0 (zero delay) | c_correct: 0,0,1,0,0 (2-cycle delay)", explanation: "Blocking collapses the pipeline; non-blocking preserves it" },
    ],
    hints: [
      { tier: 1, content: "Write two separate always blocks (or modules) — one using `=` and one using `<=`. The key difference shows up when you chain B=A then C=B." },
      { tier: 2, content: "In blocking: after `b = a`, b is already updated. So `c = b` sees the NEW a, not the old b. In non-blocking: all RHS are sampled simultaneously at the clock edge, so b's old value is used for c." },
      { tier: 3, content: "```\n// Buggy:\nalways @(posedge clk) begin b = a; c = b; end\n// Correct:\nalways @(posedge clk) begin b <= a; c <= b; end\n```\nWrap both in shift_compare with ports: clk, rst, a, c_buggy, c_correct." },
    ],
    publicTestcases: [], hiddenTestcases: [],

    starterCode: `\`timescale 1ns / 1ps

// Buggy shift register (blocking assignments)
module shift_buggy (
    input  wire clk,
    input  wire rst,
    input  wire a,
    output reg  c
);
    reg b;
    always @(posedge clk) begin
        if (rst) begin b = 0; c = 0; end
        else begin
            b = a;   // blocking — b updates immediately
            c = b;   // blocking — c gets NEW b (which is a!)
        end
    end
endmodule

// Correct shift register (non-blocking assignments)
module shift_correct (
    input  wire clk,
    input  wire rst,
    input  wire a,
    output reg  c
);
    reg b;
    always @(posedge clk) begin
        if (rst) begin b <= 0; c <= 0; end
        else begin
            b <= a;  // non-blocking — scheduled, not yet done
            c <= b;  // non-blocking — uses OLD b
        end
    end
endmodule

// Top wrapper — instantiate both for comparison
module shift_compare (
    input  wire clk,
    input  wire rst,
    input  wire a,
    output wire c_buggy,
    output wire c_correct
);
    // TODO: instantiate shift_buggy and shift_correct here

endmodule
`,

    publicTestbench: `\`timescale 1ns / 1ps
module tb_shift_compare;
    reg clk, rst, a;
    wire c_buggy, c_correct;
    shift_compare dut (.clk(clk),.rst(rst),.a(a),.c_buggy(c_buggy),.c_correct(c_correct));
    initial clk = 0;
    always #5 clk = ~clk;
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_shift_compare); end
    initial begin
        $display("=== Blocking vs Non-Blocking Comparison ===");
        rst=1; a=0; @(posedge clk); #1; rst=0;
        a=1; @(posedge clk); #1;
        $display("cycle1 a=1: buggy_c=%b correct_c=%b (buggy=1 correct=0)", c_buggy, c_correct);
        a=0; @(posedge clk); #1;
        $display("cycle2 a=0: buggy_c=%b correct_c=%b (buggy=0 correct=0)", c_buggy, c_correct);
        @(posedge clk); #1;
        $display("cycle3 a=0: buggy_c=%b correct_c=%b (buggy=0 correct=1)", c_buggy, c_correct);
        @(posedge clk); #1;
        $display("cycle4 a=0: buggy_c=%b correct_c=%b (buggy=0 correct=0)", c_buggy, c_correct);
        $finish;
    end
endmodule
`,

    hiddenTestbench: `\`timescale 1ns / 1ps
module tb_shift_compare_hidden;
    reg clk, rst, a;
    wire c_buggy, c_correct;
    integer errors;
    shift_compare dut (.clk(clk),.rst(rst),.a(a),.c_buggy(c_buggy),.c_correct(c_correct));
    initial clk = 0;
    always #5 clk = ~clk;
    initial begin
        errors = 0;
        rst=1; a=0; @(posedge clk); #1; rst=0;
        // Apply sequence 1,0,0,0,0
        a=1; @(posedge clk); #1;
        // Buggy: c_buggy should already be 1 (zero delay through blocking)
        if (c_buggy !== 1'b1) begin $display("FAIL: buggy cycle1 c=%b exp 1", c_buggy); errors=errors+1; end
        // Correct: c_correct should be 0 (a just arrived at b)
        if (c_correct !== 1'b0) begin $display("FAIL: correct cycle1 c=%b exp 0", c_correct); errors=errors+1; end
        a=0; @(posedge clk); #1;
        // Buggy: a=0, b=0, c=0
        if (c_buggy !== 1'b0) begin $display("FAIL: buggy cycle2 c=%b exp 0", c_buggy); errors=errors+1; end
        // Correct: c should still be 0 (the 1 is at b)
        if (c_correct !== 1'b0) begin $display("FAIL: correct cycle2 c=%b exp 0", c_correct); errors=errors+1; end
        @(posedge clk); #1;
        // Correct: now the 1 reaches c (2-cycle delay confirmed)
        if (c_correct !== 1'b1) begin $display("FAIL: correct cycle3 c=%b exp 1", c_correct); errors=errors+1; end
        if (c_buggy !== 1'b0) begin $display("FAIL: buggy cycle3 c=%b exp 0", c_buggy); errors=errors+1; end
        @(posedge clk); #1;
        if (c_correct !== 1'b0) begin $display("FAIL: correct cycle4 c=%b exp 0", c_correct); errors=errors+1; end
        if (errors == 0) $display("ALL TESTS PASSED");
        else $display("TESTS FAILED: %0d error(s)", errors);
        $finish;
    end
endmodule
`,
  },

  // ─── SU.03 — 8×8 Register File ───────────────────────────────────────────
  {
    id: "register-file-8x8", slug: "register-file-8x8",
    title: "8×8 Register File",
    difficulty: "intermediate", category: "sequential",
    tags: ["register-file", "sequential", "interview", "RISC", "memory"],
    learningLevel: "Verilog Intermediate",
    moduleId: "mod_sequential_utils", orderIndex: 25,
    xpReward: 150, waveformRequired: false,
    expectedOutputMode: "stdout_compare",

    statement: `## 8×8 Register File

A small register file with **8 registers, each 8 bits wide**. Two independent read ports and one write port, all operating in the same clock cycle.

This is the standard RISC register file architecture: read two operands while writing one result back — all simultaneously.

**Interface**

| Port        | Direction | Description                       |
|-------------|-----------|-----------------------------------|
| \`clk\`       | input   | Clock                             |
| \`we\`        | input   | Write enable                      |
| \`waddr[2:0]\`| input   | Write address (selects register)  |
| \`wdata[7:0]\`| input   | Write data                        |
| \`raddr1[2:0]\`| input  | Read port 1 address               |
| \`rdata1[7:0]\`| output | Read port 1 data (combinational)  |
| \`raddr2[2:0]\`| input  | Read port 2 address               |
| \`rdata2[7:0]\`| output | Read port 2 data (combinational)  |

**Write:** synchronous — updates on \`posedge clk\` when \`we=1\`.
**Read:** asynchronous — combinational, no clock: \`rdata = mem[raddr]\` always.

**Read-during-write:** If \`waddr == raddr\` in the same cycle, the read returns the **old** value (reads are combinational from pre-write memory). Document this in comments.`,

    constraints: [
      "Use `reg [7:0] mem [0:7]` as storage.",
      "Write is synchronous (posedge clk, we=1).",
      "Reads are asynchronous/combinational: `assign rdata1 = mem[raddr1];`",
      "Read-during-write returns old value (not new value).",
    ],
    examples: [
      { input: "we=1, waddr=3, wdata=8'hAB on posedge clk", output: "mem[3]=8'hAB after edge", explanation: "Synchronous write" },
      { input: "raddr1=3 same cycle as write to addr 3", output: "rdata1=old value of mem[3]", explanation: "Async read sees pre-write value" },
      { input: "raddr1=2, raddr2=5 simultaneously", output: "rdata1=mem[2], rdata2=mem[5]", explanation: "Independent dual read ports" },
    ],
    hints: [
      { tier: 1, content: "Declare storage: `reg [7:0] mem [0:7];`. Write uses `always @(posedge clk)`. Read uses `assign rdata1 = mem[raddr1];`" },
      { tier: 2, content: "Both read assigns are always active (combinational). The write only happens on posedge clk when we=1. Because reads are combinational and non-blocking write hasn't resolved yet, reads see the old value." },
      { tier: 3, content: "```\nreg [7:0] mem [0:7];\nalways @(posedge clk)\n  if (we) mem[waddr] <= wdata;\nassign rdata1 = mem[raddr1];\nassign rdata2 = mem[raddr2];\n```" },
    ],
    publicTestcases: [], hiddenTestcases: [],

    starterCode: `\`timescale 1ns / 1ps

module register_file_8x8 (
    input  wire       clk,
    input  wire       we,
    input  wire [2:0] waddr,
    input  wire [7:0] wdata,
    input  wire [2:0] raddr1,
    output wire [7:0] rdata1,
    input  wire [2:0] raddr2,
    output wire [7:0] rdata2
);

    reg [7:0] mem [0:7];  // 8 registers × 8 bits

    // Synchronous write port
    always @(posedge clk) begin
        // TODO: write mem[waddr] when we=1
    end

    // Asynchronous (combinational) read ports
    // Note: if waddr==raddr in the same cycle, read returns OLD value
    // TODO: assign rdata1 and rdata2

endmodule
`,

    publicTestbench: `\`timescale 1ns / 1ps
module tb_register_file_8x8;
    reg clk, we;
    reg [2:0] waddr, raddr1, raddr2;
    reg [7:0] wdata;
    wire [7:0] rdata1, rdata2;
    integer i;
    register_file_8x8 dut (.clk(clk),.we(we),.waddr(waddr),.wdata(wdata),
                            .raddr1(raddr1),.rdata1(rdata1),
                            .raddr2(raddr2),.rdata2(rdata2));
    initial clk = 0;
    always #5 clk = ~clk;
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_register_file_8x8); end
    initial begin
        $display("=== 8x8 Register File Test ===");
        we=0; waddr=0; wdata=0; raddr1=0; raddr2=0;
        // Write all 8 registers
        for (i=0; i<8; i=i+1) begin
            we=1; waddr=i; wdata=i*16+i;
            @(posedge clk); #1;
        end
        we=0;
        // Read back
        raddr1=0; raddr2=7; #1;
        $display("reg[0]=%h reg[7]=%h (exp 00 77)", rdata1, rdata2);
        raddr1=3; raddr2=5; #1;
        $display("reg[3]=%h reg[5]=%h (exp 33 55)", rdata1, rdata2);
        // Read-during-write same address: read returns OLD value
        we=1; waddr=3'h2; wdata=8'hFF; raddr1=3'h2;
        #1; $display("read-during-write addr=2: rdata1=%h (exp 22 old value)", rdata1);
        @(posedge clk); #1; we=0;
        raddr1=3'h2; #1;
        $display("after write completes: reg[2]=%h (exp FF)", rdata1);
        $finish;
    end
endmodule
`,

    hiddenTestbench: `\`timescale 1ns / 1ps
module tb_register_file_8x8_hidden;
    reg clk, we;
    reg [2:0] waddr, raddr1, raddr2;
    reg [7:0] wdata;
    wire [7:0] rdata1, rdata2;
    integer errors, i;
    register_file_8x8 dut (.clk(clk),.we(we),.waddr(waddr),.wdata(wdata),
                            .raddr1(raddr1),.rdata1(rdata1),
                            .raddr2(raddr2),.rdata2(rdata2));
    initial clk = 0;
    always #5 clk = ~clk;
    initial begin
        errors = 0;
        we=0; waddr=0; wdata=0; raddr1=0; raddr2=0;
        // Write all 8 registers with unique values
        for (i=0; i<8; i=i+1) begin
            we=1; waddr=i; wdata=8'hA0+i;
            @(posedge clk);
        end
        #1; we=0;
        // Verify all 8 read back correctly
        for (i=0; i<8; i=i+1) begin
            raddr1=i; #1;
            if (rdata1 !== (8'hA0+i)) begin
                $display("FAIL: reg[%0d]=%h exp %h", i, rdata1, 8'hA0+i);
                errors=errors+1;
            end
        end
        // Simultaneous dual-port read
        raddr1=3'd2; raddr2=3'd5; #1;
        if (rdata1 !== 8'hA2) begin $display("FAIL: dual-read port1=%h exp A2", rdata1); errors=errors+1; end
        if (rdata2 !== 8'hA5) begin $display("FAIL: dual-read port2=%h exp A5", rdata2); errors=errors+1; end
        // Read-during-write: read returns OLD value
        raddr1=3'd3; we=1; waddr=3'd3; wdata=8'hBB; #1;
        if (rdata1 !== 8'hA3) begin $display("FAIL: read-during-write=%h exp A3 (old)", rdata1); errors=errors+1; end
        @(posedge clk); #1; we=0;
        raddr1=3'd3; #1;
        if (rdata1 !== 8'hBB) begin $display("FAIL: post-write reg[3]=%h exp BB", rdata1); errors=errors+1; end
        // Write-enable=0 should not update memory
        we=0; waddr=3'd0; wdata=8'hFF; @(posedge clk); #1;
        raddr1=3'd0; #1;
        if (rdata1 !== 8'hA0) begin $display("FAIL: we=0 corrupted reg[0]=%h exp A0", rdata1); errors=errors+1; end
        if (errors == 0) $display("ALL TESTS PASSED");
        else $display("TESTS FAILED: %0d error(s)", errors);
        $finish;
    end
endmodule
`,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // MODULE: Counter Capstones (mod_counters_advanced)
  // ═══════════════════════════════════════════════════════════════════════════

  // ─── CC.01 — BCD Decade Counter with Carry ───────────────────────────────
  {
    id: "bcd-decade-counter", slug: "bcd-decade-counter",
    title: "BCD Decade Counter with Carry",
    difficulty: "intermediate", category: "sequential",
    tags: ["counter", "BCD", "decade", "carry", "sequential"],
    learningLevel: "Verilog Intermediate",
    moduleId: "mod_counters_advanced", orderIndex: 26,
    xpReward: 140, waveformRequired: true,
    expectedOutputMode: "stdout_compare",

    statement: `## BCD Decade Counter with Carry

A BCD (Binary-Coded Decimal) counter counts in decimal: **0, 1, 2, 3, 4, 5, 6, 7, 8, 9**, then resets to 0. It **never** reaches binary values 10–15.

The \`carry\` output is a single-cycle pulse at the 9→0 rollover, allowing decade counters to be chained: carry of the units digit clocks the tens digit, carry of the tens clocks the hundreds, and so on.

**Interface**

| Port       | Direction | Description                                  |
|------------|-----------|----------------------------------------------|
| \`clk\`      | input   | Clock (rising-edge)                          |
| \`rst\`      | input   | Synchronous reset (active-high)              |
| \`en\`       | input   | Count enable                                 |
| \`q[3:0]\`   | output  | BCD digit output (0–9)                       |
| \`carry\`    | output  | 1-cycle pulse on 9→0 rollover                |

**Key:** reset condition is \`q == 4'd9\`, **not** \`q == 4'd10\` — the counter must never reach 10.`,

    constraints: [
      "q must never reach 4'd10 or above.",
      "carry fires for exactly one cycle on the 9→0 transition.",
      "carry does not fire when en=0, even when q=9.",
      "Reset is synchronous.",
    ],
    examples: [
      { input: "Count from 0 with en=1", output: "0,1,2,3,4,5,6,7,8,9,0,1,...", explanation: "BCD sequence" },
      { input: "q=9, en=1, posedge clk", output: "q=0, carry=1", explanation: "Rollover with carry" },
      { input: "q=9, en=0, posedge clk", output: "q=9, carry=0", explanation: "No carry when disabled" },
    ],
    hints: [
      { tier: 1, content: "Check `if (q == 4'd9)` to reset to 0. Use `else q <= q + 1`. Carry is a combinational assign from q and en." },
      { tier: 2, content: "`assign carry = (q == 4'd9) && en;` — this pulses combinationally in the same cycle q=9 and en=1. On the next clock edge q goes to 0." },
      { tier: 3, content: "```\nalways @(posedge clk) begin\n  if (rst || (en && q==4'd9)) q <= 4'd0;\n  else if (en)                q <= q + 4'd1;\nend\nassign carry = (q == 4'd9) && en;\n```" },
    ],
    publicTestcases: [], hiddenTestcases: [],

    starterCode: `\`timescale 1ns / 1ps

module bcd_decade_counter (
    input  wire       clk,
    input  wire       rst,
    input  wire       en,
    output reg  [3:0] q,
    output wire       carry
);

    // BCD counter: counts 0-9 then wraps to 0
    // carry = combinational pulse when q==9 and en=1
    always @(posedge clk) begin
        if (rst)
            q <= 4'd0;
        else if (en) begin
            // TODO: count 0-9, wrap at 9 (not 10!)
        end
    end

    // carry fires when about to roll over
    // TODO: assign carry

endmodule
`,

    publicTestbench: `\`timescale 1ns / 1ps
module tb_bcd_decade_counter;
    reg clk, rst, en;
    wire [3:0] q;
    wire carry;
    integer i;
    bcd_decade_counter dut (.clk(clk),.rst(rst),.en(en),.q(q),.carry(carry));
    initial clk = 0;
    always #5 clk = ~clk;
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_bcd_decade_counter); end
    initial begin
        $display("=== BCD Decade Counter Test ===");
        rst=1; en=0; @(posedge clk); #1; rst=0;
        en=1;
        for (i=0; i<12; i=i+1) begin
            $display("q=%0d carry=%b", q, carry);
            @(posedge clk); #1;
        end
        // Test en=0 when q=9
        rst=1; @(posedge clk); #1; rst=0;
        en=1; repeat(9) @(posedge clk);
        #1; $display("at q=%0d with en=1: carry=%b", q, carry);
        en=0; @(posedge clk); #1;
        $display("en=0 at q=%0d: carry=%b (expect 0)", q, carry);
        $finish;
    end
endmodule
`,

    hiddenTestbench: `\`timescale 1ns / 1ps
module tb_bcd_decade_counter_hidden;
    reg clk, rst, en;
    wire [3:0] q;
    wire carry;
    integer errors, i;
    bcd_decade_counter dut (.clk(clk),.rst(rst),.en(en),.q(q),.carry(carry));
    initial clk = 0;
    always #5 clk = ~clk;
    initial begin
        errors = 0;
        rst=1; en=0; @(posedge clk); #1; rst=0;
        // Full count 0-9 and wrap
        en=1;
        for (i=0; i<10; i=i+1) begin
            if (q !== i) begin $display("FAIL: step %0d q=%0d exp %0d", i, q, i); errors=errors+1; end
            if (q > 4'd9) begin $display("FAIL: q exceeded 9: q=%0d", q); errors=errors+1; end
            if (i==9) begin
                if (carry !== 1'b1) begin $display("FAIL: carry not set at q=9"); errors=errors+1; end
            end else begin
                if (carry !== 1'b0) begin $display("FAIL: carry set at q=%0d", q); errors=errors+1; end
            end
            @(posedge clk); #1;
        end
        // Should have wrapped to 0
        if (q !== 4'd0) begin $display("FAIL: after wrap q=%0d exp 0", q); errors=errors+1; end
        // Run two more full cycles to confirm
        repeat(20) @(posedge clk);
        #1;
        if (q > 4'd9) begin $display("FAIL: q exceeded 9 after extended run: %0d", q); errors=errors+1; end
        // carry must not fire when en=0
        rst=1; @(posedge clk); #1; rst=0; en=1;
        repeat(9) @(posedge clk);
        #1; en=0; @(posedge clk); #1;
        if (carry !== 1'b0) begin $display("FAIL: carry fired when en=0 at q=9"); errors=errors+1; end
        if (q !== 4'd9) begin $display("FAIL: q changed when en=0, q=%0d exp 9", q); errors=errors+1; end
        // Reset from mid-sequence
        rst=1; @(posedge clk); #1; rst=0;
        if (q !== 4'd0) begin $display("FAIL: rst, q=%0d exp 0", q); errors=errors+1; end
        if (errors == 0) $display("ALL TESTS PASSED");
        else $display("TESTS FAILED: %0d error(s)", errors);
        $finish;
    end
endmodule
`,
  },

  // ─── CC.02 — 12-Hour Digital Clock ───────────────────────────────────────
  {
    id: "digital-clock-12hr", slug: "digital-clock-12hr",
    title: "12-Hour Digital Clock",
    difficulty: "intermediate", category: "sequential",
    tags: ["counter", "BCD", "capstone", "clock", "sequential"],
    learningLevel: "Verilog Intermediate",
    moduleId: "mod_counters_advanced", orderIndex: 27,
    xpReward: 200, waveformRequired: true,
    expectedOutputMode: "stdout_compare",

    statement: `## 12-Hour Digital Clock

Chain BCD decade counters to build a complete **HH:MM:SS digital clock**. This is the capstone of the counter section — it requires parameterised counters, carry chaining, BCD, and rollover logic with non-standard boundaries.

**Interface**

| Port      | Direction | Width | Description        |
|-----------|-----------|-------|--------------------|
| \`clk\`     | input   | 1     | 1 Hz clock (1 tick/second) |
| \`rst\`     | input   | 1     | Synchronous reset  |
| \`s0[3:0]\` | output  | 4     | Seconds units (0–9) |
| \`s1[3:0]\` | output  | 4     | Seconds tens (0–5) |
| \`m0[3:0]\` | output  | 4     | Minutes units (0–9) |
| \`m1[3:0]\` | output  | 4     | Minutes tens (0–5) |
| \`h0[3:0]\` | output  | 4     | Hours units (combined with h1) |
| \`h1[3:0]\` | output  | 4     | Hours tens (0 or 1) |

**Rollover rules:**
- \`s0\`: 0–9 → carry to s1
- \`s1\`: 0–5 → carry to m0 (seconds tens max = 5)
- \`m0\`: 0–9 → carry to m1
- \`m1\`: 0–5 → carry to hours
- **Hours: 01–12 → rolls to 01** (never 00, never 13)

On reset, clock starts at **12:00:00**.

**The 12→01 rollover** is the tricky part. Implement \`h1\` and \`h0\` separately. The rollover fires when \`h1==1 && h0==2\` (i.e. 12) — and rolls to h1=0, h0=1 (01:00:00).`,

    constraints: [
      "00:00:00 must never appear.",
      "13:00:00 must never appear.",
      "Hours roll 12→01, not 12→00.",
      "Reset must initialise to 12:00:00.",
      "s1 and m1 max out at 5 (0–5 only).",
    ],
    examples: [
      { input: "After reset", output: "h1=1, h0=2, m1=0, m0=0, s1=0, s0=0 (12:00:00)", explanation: "Reset value" },
      { input: "At 12:59:59, next clk", output: "h1=0, h0=1 → 01:00:00", explanation: "12→01 rollover" },
      { input: "At 01:00:00, next clk", output: "01:00:01", explanation: "Normal increment from 01" },
    ],
    hints: [
      { tier: 1, content: "Build a carry chain: s0 carry → enables s1; s1 carry → enables m0; etc. Each digit is a separate counter with its own max value." },
      { tier: 2, content: "For hours, use a combined check: `hour_rollover = (h1==1 && h0==2)`. On rollover set h1=0, h0=1. Increment h0 normally 0–9, but carry from h0 to h1 only when the full hour is not 12." },
      { tier: 3, content: "Build each digit as a separate always block. carry_s0 = (s0==9); carry_s1 = (s1==5)&&carry_s0; carry_m0 = (m0==9)&&carry_s1; etc. Hour block: if hour_rollover set {h1,h0}={0,1}, else normal BCD increment gated by minute carry." },
    ],
    publicTestcases: [], hiddenTestcases: [],

    starterCode: `\`timescale 1ns / 1ps

module digital_clock_12hr (
    input  wire       clk,
    input  wire       rst,
    output reg  [3:0] s0,  // seconds units (0-9)
    output reg  [3:0] s1,  // seconds tens  (0-5)
    output reg  [3:0] m0,  // minutes units (0-9)
    output reg  [3:0] m1,  // minutes tens  (0-5)
    output reg  [3:0] h0,  // hours units
    output reg  [3:0] h1   // hours tens (0 or 1)
);

    // Carry signals
    wire carry_s0, carry_s1, carry_m0, carry_m1, hour_rollover;

    assign carry_s0      = (s0 == 4'd9);
    assign carry_s1      = (s1 == 4'd5) && carry_s0;
    assign carry_m0      = (m0 == 4'd9) && carry_s1;
    assign carry_m1      = (m1 == 4'd5) && carry_m0;
    assign hour_rollover = (h1 == 4'd1) && (h0 == 4'd2) && carry_m1;

    // Seconds units (0-9)
    always @(posedge clk) begin
        if (rst)           s0 <= 4'd0;
        else if (carry_s0) s0 <= 4'd0;
        else               s0 <= s0 + 4'd1;
    end

    // Seconds tens (0-5)
    always @(posedge clk) begin
        if (rst)                      s1 <= 4'd0;
        else if (carry_s0 && carry_s1) s1 <= 4'd0;
        else if (carry_s0)             s1 <= s1 + 4'd1;
    end

    // TODO: implement m0, m1, h0, h1 similarly
    // Reset must start at 12:00:00 → h1=1, h0=2 on rst

endmodule
`,

    publicTestbench: `\`timescale 1ns / 1ps
module tb_digital_clock_12hr;
    reg clk, rst;
    wire [3:0] s0,s1,m0,m1,h0,h1;
    integer i;
    digital_clock_12hr dut (.clk(clk),.rst(rst),.s0(s0),.s1(s1),.m0(m0),.m1(m1),.h0(h0),.h1(h1));
    initial clk = 0;
    always #5 clk = ~clk;
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_digital_clock_12hr); end
    initial begin
        $display("=== 12-Hour Digital Clock Test ===");
        rst=1; @(posedge clk); #1; rst=0;
        $display("after rst:  %0d%0d:%0d%0d:%0d%0d (expect 12:00:00)", h1,h0,m1,m0,s1,s0);
        // Tick 10 seconds
        repeat(10) @(posedge clk);
        #1; $display("10 ticks:   %0d%0d:%0d%0d:%0d%0d (expect 12:00:10)", h1,h0,m1,m0,s1,s0);
        // Fast-forward to 12:00:59
        repeat(49) @(posedge clk);
        #1; $display("59 ticks:   %0d%0d:%0d%0d:%0d%0d (expect 12:00:59)", h1,h0,m1,m0,s1,s0);
        @(posedge clk); #1;
        $display("60 ticks:   %0d%0d:%0d%0d:%0d%0d (expect 12:01:00)", h1,h0,m1,m0,s1,s0);
        $finish;
    end
endmodule
`,

    hiddenTestbench: `\`timescale 1ns / 1ps
module tb_digital_clock_12hr_hidden;
    reg clk, rst;
    wire [3:0] s0,s1,m0,m1,h0,h1;
    integer errors;
    integer i;
    digital_clock_12hr dut (.clk(clk),.rst(rst),.s0(s0),.s1(s1),.m0(m0),.m1(m1),.h0(h0),.h1(h1));
    initial clk = 0;
    always #5 clk = ~clk;
    task check_time;
        input [3:0] eh1, eh0, em1, em0, es1, es0;
        input [63:0] label;
        begin
            if (h1!==eh1||h0!==eh0||m1!==em1||m0!==em0||s1!==es1||s0!==es0) begin
                $display("FAIL at %0d: got %0d%0d:%0d%0d:%0d%0d exp %0d%0d:%0d%0d:%0d%0d",
                    label, h1,h0,m1,m0,s1,s0, eh1,eh0,em1,em0,es1,es0);
                errors=errors+1;
            end
        end
    endtask
    initial begin
        errors = 0;
        rst=1; @(posedge clk); #1; rst=0;
        // Reset → 12:00:00
        check_time(1,2,0,0,0,0, 0);
        // Never show 00:00:00
        if (h1==0 && h0==0) begin $display("FAIL: 00:xx:xx appeared"); errors=errors+1; end
        // Tick 59 seconds → 12:00:59
        repeat(59) @(posedge clk);
        #1; check_time(1,2,0,0,5,9, 59);
        // Next tick → 12:01:00
        @(posedge clk); #1; check_time(1,2,0,1,0,0, 60);
        // Fast-forward to 12:59:59 (need 59min 59sec = 3599 more ticks)
        repeat(3538) @(posedge clk);
        #1; check_time(1,2,5,9,5,9, 3599);
        // 12→01 rollover
        @(posedge clk); #1; check_time(0,1,0,0,0,0, 3600);
        // Never reach 13:00:00
        if (h1==1 && h0==3) begin $display("FAIL: 13:00:00 appeared"); errors=errors+1; end
        // Seconds tens max is 5
        if (s1 > 4'd5) begin $display("FAIL: s1=%0d > 5", s1); errors=errors+1; end
        if (m1 > 4'd5) begin $display("FAIL: m1=%0d > 5", m1); errors=errors+1; end
        if (errors == 0) $display("ALL TESTS PASSED");
        else $display("TESTS FAILED: %0d error(s)", errors);
        $finish;
    end
endmodule
`,
  },
// ─────────────────────────────────────────────────────────────────────────────
// PASTE THIS BLOCK BEFORE THE CLOSING `];` IN intermediate.ts  (AFTER Part 1)
// Part 2 of 2 — Problems: MEM.01–MEM.07
// New moduleId needed in index.ts:
//   mod_memory  — MEM.01 through MEM.07
// ─────────────────────────────────────────────────────────────────────────────

  // ═══════════════════════════════════════════════════════════════════════════
  // MODULE: Memory (mod_memory)
  // ═══════════════════════════════════════════════════════════════════════════

  // ─── MEM.01 — Synchronous SRAM Write-First ───────────────────────────────
  {
    id: "sram-write-first", slug: "sram-write-first",
    title: "Synchronous SRAM (Write-First)",
    difficulty: "intermediate", category: "memory",
    tags: ["SRAM", "memory", "interview", "BRAM", "write-first"],
    learningLevel: "Verilog Intermediate",
    moduleId: "mod_memory", orderIndex: 28,
    xpReward: 150, waveformRequired: false,
    expectedOutputMode: "stdout_compare",

    statement: `## Synchronous SRAM — Write-First

A 256-location × 8-bit synchronous RAM with a single port. **Write-first** (read-during-write = new data): when a read and write occur to the same address in the same cycle, the output reflects the **newly written value**.

Both read and write are **synchronous** — \`dout\` is a registered output, updated on \`posedge clk\`.

**Interface**

| Port       | Direction | Description              |
|------------|-----------|--------------------------|
| \`clk\`      | input   | Clock                    |
| \`we\`       | input   | Write enable             |
| \`addr[7:0]\`| input   | Address (256 locations)  |
| \`din[7:0]\` | input   | Write data               |
| \`dout[7:0]\`| output  | Read data (registered)   |

This pattern maps to **Xilinx BRAM write-first mode**. Getting it right means the synthesiser infers a block RAM primitive instead of a flip-flop array.`,

    constraints: [
      "Both read and write are synchronous (posedge clk).",
      "Write-first: simultaneous read+write to same address → dout = new (din) value.",
      "Use `reg [7:0] mem [0:255]` as storage.",
      "dout is a registered output (not combinational).",
    ],
    examples: [
      { input: "we=1, addr=8'h10, din=8'hAB", output: "mem[0x10]=0xAB, dout=0xAB", explanation: "Write-first: dout captures new value" },
      { input: "we=0, addr=8'h10", output: "dout=mem[0x10]", explanation: "Normal synchronous read" },
    ],
    hints: [
      { tier: 1, content: "For write-first: in the always block, when we=1, write mem[addr]<=din AND set dout<=din. When we=0, just dout<=mem[addr]." },
      { tier: 2, content: "`if (we) begin mem[addr] <= din; dout <= din; end else begin dout <= mem[addr]; end` — the key is dout<=din (not mem[addr]) in the write branch." },
      { tier: 3, content: "```\nalways @(posedge clk) begin\n  if (we) begin\n    mem[addr] <= din;\n    dout <= din;       // write-first\n  end else begin\n    dout <= mem[addr];\n  end\nend\n```" },
    ],
    publicTestcases: [], hiddenTestcases: [],

    starterCode: `\`timescale 1ns / 1ps

module sram_write_first (
    input  wire       clk,
    input  wire       we,
    input  wire [7:0] addr,
    input  wire [7:0] din,
    output reg  [7:0] dout
);

    reg [7:0] mem [0:255];

    // Synchronous write-first RAM
    // When we=1 and read+write to same address: dout = din (new value)
    always @(posedge clk) begin
        if (we) begin
            mem[addr] <= din;
            // TODO: assign dout for write-first behaviour
        end else begin
            // TODO: normal synchronous read
        end
    end

endmodule
`,

    publicTestbench: `\`timescale 1ns / 1ps
module tb_sram_write_first;
    reg clk, we;
    reg [7:0] addr, din;
    wire [7:0] dout;
    integer i;
    sram_write_first dut (.clk(clk),.we(we),.addr(addr),.din(din),.dout(dout));
    initial clk = 0;
    always #5 clk = ~clk;
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_sram_write_first); end
    initial begin
        $display("=== SRAM Write-First Test ===");
        we=0; addr=0; din=0;
        // Write 4 locations
        we=1; addr=8'h00; din=8'hAA; @(posedge clk); #1;
        $display("write addr=00 din=AA: dout=%h (expect AA write-first)", dout);
        addr=8'h01; din=8'hBB; @(posedge clk); #1;
        addr=8'h02; din=8'hCC; @(posedge clk); #1;
        addr=8'h03; din=8'hDD; @(posedge clk); #1;
        we=0;
        // Read back
        addr=8'h00; @(posedge clk); #1; $display("read addr=00: dout=%h (expect AA)", dout);
        addr=8'h03; @(posedge clk); #1; $display("read addr=03: dout=%h (expect DD)", dout);
        // Write-first: simultaneous read+write same address
        we=1; addr=8'h01; din=8'hFF; @(posedge clk); #1;
        $display("write-first addr=01 din=FF: dout=%h (expect FF)", dout);
        $finish;
    end
endmodule
`,

    hiddenTestbench: `\`timescale 1ns / 1ps
module tb_sram_write_first_hidden;
    reg clk, we;
    reg [7:0] addr, din;
    wire [7:0] dout;
    integer errors, i;
    sram_write_first dut (.clk(clk),.we(we),.addr(addr),.din(din),.dout(dout));
    initial clk = 0;
    always #5 clk = ~clk;
    initial begin
        errors = 0;
        we=0; addr=0; din=0;
        // Write all 256 locations
        we=1;
        for (i=0; i<256; i=i+1) begin
            addr=i; din=255-i; @(posedge clk);
        end
        #1; we=0;
        // Read back all
        for (i=0; i<256; i=i+1) begin
            addr=i; @(posedge clk); #1;
            if (dout !== (255-i)) begin
                $display("FAIL: addr=%0d dout=%h exp %h", i, dout, 255-i);
                errors=errors+1;
            end
        end
        // Write-first: same address read+write in same cycle
        we=1; addr=8'h42; din=8'hAB; @(posedge clk); #1;
        if (dout !== 8'hAB) begin $display("FAIL: write-first dout=%h exp AB", dout); errors=errors+1; end
        // Verify it is stored
        we=0; addr=8'h42; @(posedge clk); #1;
        if (dout !== 8'hAB) begin $display("FAIL: read-back after write-first dout=%h exp AB", dout); errors=errors+1; end
        // we=0 for several cycles — verify no corruption
        addr=8'h10; @(posedge clk); @(posedge clk); @(posedge clk); #1;
        if (dout !== (255-8'h10)) begin $display("FAIL: corruption after idle reads"); errors=errors+1; end
        if (errors == 0) $display("ALL TESTS PASSED");
        else $display("TESTS FAILED: %0d error(s)", errors);
        $finish;
    end
endmodule
`,
  },

  // ─── MEM.02 — Synchronous SRAM Read-First ────────────────────────────────
  {
    id: "sram-read-first", slug: "sram-read-first",
    title: "Synchronous SRAM (Read-First)",
    difficulty: "intermediate", category: "memory",
    tags: ["SRAM", "memory", "read-first", "BRAM"],
    learningLevel: "Verilog Intermediate",
    moduleId: "mod_memory", orderIndex: 29,
    xpReward: 150, waveformRequired: false,
    expectedOutputMode: "stdout_compare",

    statement: `## Synchronous SRAM — Read-First

Same as the write-first SRAM, but with **read-first behaviour**: when a read and write occur to the same address in the same cycle, \`dout\` returns the **old** value (what was there before the write).

This is the **default BRAM mode** on most FPGAs and the natural behaviour of most SRAM macros on ASICs.

**Interface** (identical to MEM.01)

| Port       | Direction | Description              |
|------------|-----------|--------------------------|
| \`clk\`      | input   | Clock                    |
| \`we\`       | input   | Write enable             |
| \`addr[7:0]\`| input   | Address                  |
| \`din[7:0]\` | input   | Write data               |
| \`dout[7:0]\`| output  | Read data (registered)   |

**The subtle difference from MEM.01:** \`dout\` is assigned from \`mem[addr]\` unconditionally, and because the non-blocking write hasn't taken effect yet when the read evaluates, \`dout\` sees the old value.

In your comments, describe a real-world scenario where the choice between write-first and read-first matters.`,

    constraints: [
      "dout is always assigned from mem[addr] (unconditionally).",
      "Simultaneous read+write to same address → dout = old value.",
      "Write still happens synchronously when we=1.",
      "Use non-blocking assignments to get correct read-first simulation.",
    ],
    examples: [
      { input: "we=1, addr=0x10, din=0xFF (addr previously held 0xAA)", output: "dout=0xAA (old value)", explanation: "Read-first returns old data" },
      { input: "Next cycle: we=0, addr=0x10", output: "dout=0xFF", explanation: "Write has now completed" },
    ],
    hints: [
      { tier: 1, content: "The key: `dout <= mem[addr]` runs unconditionally. Because the write uses non-blocking `mem[addr] <= din`, the read evaluates mem[addr] *before* the write updates it." },
      { tier: 2, content: "```\nif (we) mem[addr] <= din;\ndout <= mem[addr];  // always; non-blocking write hasn't fired yet\n```\nBoth on posedge clk." },
      { tier: 3, content: "```\nalways @(posedge clk) begin\n  if (we)\n    mem[addr] <= din;\n  dout <= mem[addr];  // reads old value even when we=1\nend\n```" },
    ],
    publicTestcases: [], hiddenTestcases: [],

    starterCode: `\`timescale 1ns / 1ps

module sram_read_first (
    input  wire       clk,
    input  wire       we,
    input  wire [7:0] addr,
    input  wire [7:0] din,
    output reg  [7:0] dout
);

    reg [7:0] mem [0:255];

    // Synchronous read-first RAM
    // dout always gets mem[addr] — reads the OLD value even during a write
    always @(posedge clk) begin
        if (we)
            mem[addr] <= din;       // write (non-blocking)
        // TODO: assign dout — should see old value even when we=1
    end

endmodule
`,

    publicTestbench: `\`timescale 1ns / 1ps
module tb_sram_read_first;
    reg clk, we;
    reg [7:0] addr, din;
    wire [7:0] dout;
    sram_read_first dut (.clk(clk),.we(we),.addr(addr),.din(din),.dout(dout));
    initial clk = 0;
    always #5 clk = ~clk;
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_sram_read_first); end
    initial begin
        $display("=== SRAM Read-First Test ===");
        we=0; addr=0; din=0;
        // Pre-fill addr 0x10 with 0xAA
        we=1; addr=8'h10; din=8'hAA; @(posedge clk); #1; we=0;
        addr=8'h10; @(posedge clk); #1;
        $display("read addr=10: dout=%h (expect AA)", dout);
        // Now write 0xFF to same addr in same cycle as read
        we=1; addr=8'h10; din=8'hFF; @(posedge clk); #1;
        $display("write-then-read addr=10 din=FF: dout=%h (expect AA old value)", dout);
        // Next read should return the new value
        we=0; addr=8'h10; @(posedge clk); #1;
        $display("read after write: dout=%h (expect FF)", dout);
        $finish;
    end
endmodule
`,

    hiddenTestbench: `\`timescale 1ns / 1ps
module tb_sram_read_first_hidden;
    reg clk, we;
    reg [7:0] addr, din;
    wire [7:0] dout;
    integer errors, i;
    sram_read_first dut (.clk(clk),.we(we),.addr(addr),.din(din),.dout(dout));
    initial clk = 0;
    always #5 clk = ~clk;
    initial begin
        errors = 0;
        we=0; addr=0; din=0;
        // Write all 256 locations
        we=1;
        for (i=0; i<256; i=i+1) begin addr=i; din=i; @(posedge clk); end
        #1; we=0;
        // Read back all
        for (i=0; i<256; i=i+1) begin
            addr=i; @(posedge clk); #1;
            if (dout !== i[7:0]) begin $display("FAIL: readback addr=%0d got %h exp %h",i,dout,i); errors=errors+1; end
        end
        // Read-first: simultaneous read+write — dout must be OLD value
        we=1; addr=8'h55; din=8'hDE; @(posedge clk); #1;
        if (dout !== 8'h55) begin $display("FAIL: read-first dout=%h exp 55 (old)", dout); errors=errors+1; end
        // After write, new value is stored
        we=0; addr=8'h55; @(posedge clk); #1;
        if (dout !== 8'hDE) begin $display("FAIL: post-write dout=%h exp DE", dout); errors=errors+1; end
        // we=0 for several idle cycles — no corruption
        repeat(5) @(posedge clk);
        #1;
        addr=8'h20; @(posedge clk); #1;
        if (dout !== 8'h20) begin $display("FAIL: idle corruption addr=20 got %h", dout); errors=errors+1; end
        if (errors == 0) $display("ALL TESTS PASSED");
        else $display("TESTS FAILED: %0d error(s)", errors);
        $finish;
    end
endmodule
`,
  },

  // ─── MEM.03 — Simple Dual-Port SRAM ──────────────────────────────────────
  {
    id: "sram-simple-dual-port", slug: "sram-simple-dual-port",
    title: "Simple Dual-Port SRAM",
    difficulty: "intermediate", category: "memory",
    tags: ["SRAM", "dual-port", "interview", "register-file", "memory"],
    learningLevel: "Verilog Intermediate",
    moduleId: "mod_memory", orderIndex: 30,
    xpReward: 160, waveformRequired: false,
    expectedOutputMode: "stdout_compare",

    statement: `## Simple Dual-Port SRAM

A 256 × 8-bit RAM with **two separate ports**: one dedicated write port and one dedicated read port, both operating simultaneously every cycle.

**Interface**

| Port         | Direction | Description                        |
|--------------|-----------|------------------------------------|
| \`clk\`        | input   | Clock                              |
| \`we\`         | input   | Write enable                       |
| \`waddr[7:0]\` | input   | Write address                      |
| \`wdata[7:0]\` | input   | Write data                         |
| \`raddr[7:0]\` | input   | Read address                       |
| \`rdata[7:0]\` | output  | Read data (**asynchronous/combinational**) |

**Write:** synchronous (posedge clk, we=1).
**Read:** asynchronous — combinational: \`rdata = mem[raddr]\` always, no clock.

If \`waddr == raddr\` in the same cycle: the async read returns the **old** value (before the write completes), because it reads combinationally from the array before the synchronous write resolves.

This is the standard RISC register file: write one result while reading two operands.`,

    constraints: [
      "Write port is synchronous (posedge clk).",
      "Read port is asynchronous: `assign rdata = mem[raddr];`",
      "Simultaneous read+write to same address → rdata = old value.",
    ],
    examples: [
      { input: "we=1, waddr=5, wdata=0xAB; raddr=7 simultaneously", output: "rdata=mem[7] (independent)", explanation: "Different addresses — independent" },
      { input: "we=1, waddr=5, wdata=0xFF; raddr=5 simultaneously", output: "rdata=old mem[5]", explanation: "Same address — async read sees old value" },
    ],
    hints: [
      { tier: 1, content: "Write: `always @(posedge clk) if (we) mem[waddr] <= wdata;` Read: `assign rdata = mem[raddr];` That's it." },
      { tier: 2, content: "The async read sees the old value during a simultaneous write because `assign` is combinational and resolves before the non-blocking write takes effect at the end of the clock edge." },
      { tier: 3, content: "```\nreg [7:0] mem [0:255];\nalways @(posedge clk)\n  if (we) mem[waddr] <= wdata;\nassign rdata = mem[raddr];\n```" },
    ],
    publicTestcases: [], hiddenTestcases: [],

    starterCode: `\`timescale 1ns / 1ps

module sram_simple_dual_port (
    input  wire       clk,
    input  wire       we,
    input  wire [7:0] waddr,
    input  wire [7:0] wdata,
    input  wire [7:0] raddr,
    output wire [7:0] rdata
);

    reg [7:0] mem [0:255];

    // Synchronous write port
    always @(posedge clk) begin
        // TODO: write when we=1
    end

    // Asynchronous (combinational) read port
    // TODO: assign rdata

endmodule
`,

    publicTestbench: `\`timescale 1ns / 1ps
module tb_sram_simple_dual_port;
    reg clk, we;
    reg [7:0] waddr, wdata, raddr;
    wire [7:0] rdata;
    integer i;
    sram_simple_dual_port dut (.clk(clk),.we(we),.waddr(waddr),.wdata(wdata),.raddr(raddr),.rdata(rdata));
    initial clk = 0;
    always #5 clk = ~clk;
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_sram_simple_dual_port); end
    initial begin
        $display("=== Simple Dual-Port SRAM Test ===");
        we=0;
        // Write 4 entries
        for (i=0; i<4; i=i+1) begin we=1; waddr=i; wdata=i*0x11; @(posedge clk); end
        #1; we=0;
        // Read two simultaneously
        raddr=8'h00; #1; $display("read addr=0: %h (expect 00)", rdata);
        raddr=8'h03; #1; $display("read addr=3: %h (expect 33)", rdata);
        // Write and read to same address
        we=1; waddr=8'h02; wdata=8'hFF; raddr=8'h02;
        #1; $display("same-addr write+read: rdata=%h (expect 22 old)", rdata);
        @(posedge clk); #1; we=0;
        raddr=8'h02; #1; $display("after write: addr=2=%h (expect FF)", rdata);
        $finish;
    end
endmodule
`,

    hiddenTestbench: `\`timescale 1ns / 1ps
module tb_sram_simple_dual_port_hidden;
    reg clk, we;
    reg [7:0] waddr, wdata, raddr;
    wire [7:0] rdata;
    integer errors, i;
    sram_simple_dual_port dut (.clk(clk),.we(we),.waddr(waddr),.wdata(wdata),.raddr(raddr),.rdata(rdata));
    initial clk = 0;
    always #5 clk = ~clk;
    initial begin
        errors = 0; we=0;
        // Write all 256 locations
        we=1;
        for (i=0; i<256; i=i+1) begin waddr=i; wdata=i^8'hA5; @(posedge clk); end
        #1; we=0;
        // Read all back via read port
        for (i=0; i<256; i=i+1) begin
            raddr=i; #1;
            if (rdata !== (i^8'hA5)) begin $display("FAIL: addr=%0d rdata=%h exp %h",i,rdata,(i^8'hA5)); errors=errors+1; end
        end
        // Write to A, read from B simultaneously — independent
        we=1; waddr=8'h10; wdata=8'hCC; raddr=8'h20; #1;
        if (rdata !== (8'h20^8'hA5)) begin $display("FAIL: independent ports, rdata=%h", rdata); errors=errors+1; end
        @(posedge clk); #1;
        // Same-address: read must return OLD value
        we=1; waddr=8'h30; wdata=8'hBB; raddr=8'h30; #1;
        if (rdata !== (8'h30^8'hA5)) begin $display("FAIL: same-addr old val, rdata=%h exp %h", rdata, (8'h30^8'hA5)); errors=errors+1; end
        @(posedge clk); #1; we=0;
        // Now new value is readable
        raddr=8'h30; #1;
        if (rdata !== 8'hBB) begin $display("FAIL: post-write rdata=%h exp BB", rdata); errors=errors+1; end
        // we=0 — verify no writes
        we=0; waddr=8'h05; wdata=8'hFF; @(posedge clk); #1;
        raddr=8'h05; #1;
        if (rdata !== (8'h05^8'hA5)) begin $display("FAIL: we=0 corrupted addr=5, got %h", rdata); errors=errors+1; end
        if (errors == 0) $display("ALL TESTS PASSED");
        else $display("TESTS FAILED: %0d error(s)", errors);
        $finish;
    end
endmodule
`,
  },

  // ─── MEM.04 — True Dual-Port SRAM ────────────────────────────────────────
  {
    id: "sram-true-dual-port", slug: "sram-true-dual-port",
    title: "True Dual-Port SRAM",
    difficulty: "intermediate", category: "memory",
    tags: ["SRAM", "dual-port", "BRAM", "memory"],
    learningLevel: "Verilog Intermediate",
    moduleId: "mod_memory", orderIndex: 31,
    xpReward: 170, waveformRequired: false,
    expectedOutputMode: "stdout_compare",

    statement: `## True Dual-Port SRAM

A 256 × 8-bit RAM where **both ports are fully symmetric** — each can independently read or write on every clock edge.

**Interface** (Port A and Port B, fully mirrored)

| Port         | Direction | Description                   |
|--------------|-----------|-------------------------------|
| \`clk\`        | input   | Shared clock                  |
| \`we_a\`       | input   | Port A write enable           |
| \`addr_a[7:0]\`| input   | Port A address                |
| \`din_a[7:0]\` | input   | Port A write data             |
| \`dout_a[7:0]\`| output  | Port A read data (registered) |
| \`we_b\`       | input   | Port B write enable           |
| \`addr_b[7:0]\`| input   | Port B address                |
| \`din_b[7:0]\` | input   | Port B write data             |
| \`dout_b[7:0]\`| output  | Port B read data (registered) |

Both writes are **synchronous**. Both reads are **synchronous** (registered dout).

**Write-write conflict rule:** If both ports write to the **same address** in the same cycle, **Port A wins**. Port B's data is silently discarded. Document this in comments.

Each port uses **read-first** behaviour for its own simultaneous read/write.`,

    constraints: [
      "Both ports have synchronous registered reads (dout updated on posedge clk).",
      "Simultaneous writes to same address: Port A wins.",
      "Each port uses read-first for own same-address read/write.",
      "This maps to Xilinx True Dual-Port BRAM or Intel M20K primitives.",
    ],
    examples: [
      { input: "A writes addr=5, B reads addr=7 simultaneously", output: "Independent — no conflict", explanation: "Different addresses" },
      { input: "A and B both write addr=5 in same cycle", output: "mem[5] = A's value, B's value lost", explanation: "Port A wins conflict" },
    ],
    hints: [
      { tier: 1, content: "Write conflict: check `(we_a && we_b && addr_a==addr_b)` in the always block and prioritise Port A. Otherwise apply both writes independently." },
      { tier: 2, content: "Read-first for each port: always read `dout_x <= mem[addr_x]` unconditionally (the old value), separate from the write." },
      { tier: 3, content: "```\nalways @(posedge clk) begin\n  // Resolve write-write conflict\n  if (we_a && we_b && addr_a==addr_b)\n    mem[addr_a] <= din_a;  // A wins\n  else begin\n    if (we_a) mem[addr_a] <= din_a;\n    if (we_b) mem[addr_b] <= din_b;\n  end\n  dout_a <= mem[addr_a]; // read-first\n  dout_b <= mem[addr_b];\nend\n```" },
    ],
    publicTestcases: [], hiddenTestcases: [],

    starterCode: `\`timescale 1ns / 1ps

module sram_true_dual_port (
    input  wire       clk,
    input  wire       we_a,
    input  wire [7:0] addr_a,
    input  wire [7:0] din_a,
    output reg  [7:0] dout_a,
    input  wire       we_b,
    input  wire [7:0] addr_b,
    input  wire [7:0] din_b,
    output reg  [7:0] dout_b
);

    reg [7:0] mem [0:255];

    always @(posedge clk) begin
        // TODO: handle write-write conflict (Port A wins)
        // TODO: independent writes when no conflict
        // TODO: registered reads (read-first) for both ports
    end

endmodule
`,

    publicTestbench: `\`timescale 1ns / 1ps
module tb_sram_true_dual_port;
    reg clk, we_a, we_b;
    reg [7:0] addr_a, din_a, addr_b, din_b;
    wire [7:0] dout_a, dout_b;
    sram_true_dual_port dut (.clk(clk),.we_a(we_a),.addr_a(addr_a),.din_a(din_a),.dout_a(dout_a),
                              .we_b(we_b),.addr_b(addr_b),.din_b(din_b),.dout_b(dout_b));
    initial clk = 0;
    always #5 clk = ~clk;
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_sram_true_dual_port); end
    initial begin
        $display("=== True Dual-Port SRAM Test ===");
        we_a=0; we_b=0;
        // Port A writes, Port B reads different address
        we_a=1; addr_a=8'h10; din_a=8'hAA;
        we_b=1; addr_b=8'h20; din_b=8'hBB;
        @(posedge clk); #1;
        $display("A write 10=AA, B write 20=BB");
        we_a=0; we_b=0;
        addr_a=8'h10; addr_b=8'h20; @(posedge clk); #1;
        $display("read A[10]=%h B[20]=%h (expect AA BB)", dout_a, dout_b);
        // Write-write conflict: both write to addr 0x30
        we_a=1; addr_a=8'h30; din_a=8'hCC;
        we_b=1; addr_b=8'h30; din_b=8'hDD;
        @(posedge clk); #1; we_a=0; we_b=0;
        addr_a=8'h30; addr_b=8'h30; @(posedge clk); #1;
        $display("conflict addr=30: dout_a=%h dout_b=%h (A wins: expect CC CC)", dout_a, dout_b);
        $finish;
    end
endmodule
`,

    hiddenTestbench: `\`timescale 1ns / 1ps
module tb_sram_true_dual_port_hidden;
    reg clk, we_a, we_b;
    reg [7:0] addr_a, din_a, addr_b, din_b;
    wire [7:0] dout_a, dout_b;
    integer errors, i;
    sram_true_dual_port dut (.clk(clk),.we_a(we_a),.addr_a(addr_a),.din_a(din_a),.dout_a(dout_a),
                              .we_b(we_b),.addr_b(addr_b),.din_b(din_b),.dout_b(dout_b));
    initial clk = 0;
    always #5 clk = ~clk;
    initial begin
        errors = 0; we_a=0; we_b=0;
        // Port A writes first 128 locations
        we_a=1; we_b=0;
        for (i=0; i<128; i=i+1) begin addr_a=i; din_a=i; @(posedge clk); end
        #1; we_a=0;
        // Port B writes next 128 locations
        we_b=1;
        for (i=128; i<256; i=i+1) begin addr_b=i; din_b=i; @(posedge clk); end
        #1; we_b=0;
        // Read all back via Port A
        for (i=0; i<256; i=i+1) begin
            addr_a=i; @(posedge clk); #1;
            if (dout_a !== i[7:0]) begin $display("FAIL: A read addr=%0d got %h exp %h",i,dout_a,i); errors=errors+1; end
        end
        // Simultaneous reads to same address — both return same
        addr_a=8'h40; addr_b=8'h40; @(posedge clk); #1;
        if (dout_a !== dout_b) begin $display("FAIL: simultaneous reads differ: %h vs %h", dout_a, dout_b); errors=errors+1; end
        // Write-write conflict: A wins
        we_a=1; we_b=1; addr_a=8'h50; din_a=8'hAA; addr_b=8'h50; din_b=8'hBB;
        @(posedge clk); #1; we_a=0; we_b=0;
        addr_a=8'h50; @(posedge clk); #1;
        if (dout_a !== 8'hAA) begin $display("FAIL: A should win conflict, got %h exp AA", dout_a); errors=errors+1; end
        // Port A write, Port B reads different address simultaneously
        we_a=1; addr_a=8'h60; din_a=8'hCC;
        we_b=0; addr_b=8'h70; @(posedge clk); #1; we_a=0;
        if (dout_b !== 8'h70) begin $display("FAIL: independent B read=%h exp 70", dout_b); errors=errors+1; end
        if (errors == 0) $display("ALL TESTS PASSED");
        else $display("TESTS FAILED: %0d error(s)", errors);
        $finish;
    end
endmodule
`,
  },

  // ─── MEM.05 — ROM with $readmemh ─────────────────────────────────────────
  {
    id: "rom-readmemh", slug: "rom-readmemh",
    title: "ROM with $readmemh",
    difficulty: "intermediate", category: "memory",
    tags: ["ROM", "readmemh", "memory", "LUT", "sine"],
    learningLevel: "Verilog Intermediate",
    moduleId: "mod_memory", orderIndex: 32,
    xpReward: 130, waveformRequired: false,
    expectedOutputMode: "stdout_compare",

    statement: `## ROM with \$readmemh

A 256-entry × 8-bit **read-only memory** initialised from an external hex file. No write port — this memory never changes after initialisation.

Read is **asynchronous** (combinational, no clock needed).

**Interface**

| Port        | Direction | Description                         |
|-------------|-----------|-------------------------------------|
| \`addr[7:0]\` | input   | Address (0–255)                     |
| \`dout[7:0]\` | output  | Data (combinational — no clock)     |

**The hex file:** BitFlow provides \`sine_lut.hex\` — 256 samples of one full sine wave cycle, unsigned, scaled to 0–255:
- Address 0   = 8'h80 (128 — zero crossing, rising)
- Address 64  = 8'hFF (255 — peak)
- Address 128 = 8'h80 (128 — zero crossing, falling)
- Address 192 = 8'h01 (1   — trough)

This is the architecture of every **DDS oscillator**, CRC lookup table, trig approximation unit, and gamma correction table in display hardware.`,

    constraints: [
      "Use `$readmemh(\"sine_lut.hex\", mem)` inside an `initial` block.",
      "Read is purely combinational: `assign dout = mem[addr];`",
      "No write port — the memory is read-only after init.",
      "Output changes same cycle as address (no clock delay).",
    ],
    examples: [
      { input: "addr=8'h00", output: "dout=8'h80", explanation: "Zero crossing (rising)" },
      { input: "addr=8'h40 (64)", output: "dout=8'hFF", explanation: "Sine peak" },
      { input: "addr=8'h80 (128)", output: "dout=8'h80", explanation: "Zero crossing (falling)" },
      { input: "addr=8'hC0 (192)", output: "dout=8'h01", explanation: "Sine trough" },
    ],
    hints: [
      { tier: 1, content: "Declare `reg [7:0] mem [0:255];` and load it with `initial $readmemh(\"sine_lut.hex\", mem);`. Then `assign dout = mem[addr];`" },
      { tier: 2, content: "The `initial` block runs at time zero during simulation. $readmemh reads a text file where each line is a hex byte (80, FF, etc.). The assign makes the output combinational." },
      { tier: 3, content: "```\nreg [7:0] mem [0:255];\ninitial $readmemh(\"sine_lut.hex\", mem);\nassign dout = mem[addr];\n```\nThe testbench environment provides the hex file." },
    ],
    publicTestcases: [], hiddenTestcases: [],

    starterCode: `\`timescale 1ns / 1ps

module rom_readmemh (
    input  wire [7:0] addr,
    output wire [7:0] dout
);

    reg [7:0] mem [0:255];

    // Load ROM contents from hex file at simulation start
    initial begin
        $readmemh("sine_lut.hex", mem);
    end

    // Combinational (asynchronous) read — no clock needed
    // TODO: assign dout

endmodule
`,

    publicTestbench: `\`timescale 1ns / 1ps
module tb_rom_readmemh;
    reg [7:0] addr;
    wire [7:0] dout;
    rom_readmemh dut (.addr(addr),.dout(dout));
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_rom_readmemh); end
    initial begin
        $display("=== ROM readmemh Test ===");
        addr=8'h00; #1; $display("addr=00: dout=%h (expect 80)", dout);
        addr=8'h40; #1; $display("addr=40: dout=%h (expect FF)", dout);
        addr=8'h80; #1; $display("addr=80: dout=%h (expect 80)", dout);
        addr=8'hC0; #1; $display("addr=C0: dout=%h (expect 01)", dout);
        // Combinational: no clock delay
        addr=8'h20; #1; $display("addr=20: dout=%h", dout);
        addr=8'h60; #1; $display("addr=60: dout=%h", dout);
        $finish;
    end
endmodule
`,

    hiddenTestbench: `\`timescale 1ns / 1ps
module tb_rom_readmemh_hidden;
    reg [7:0] addr;
    wire [7:0] dout;
    integer errors;
    rom_readmemh dut (.addr(addr),.dout(dout));
    initial begin
        errors = 0;
        // Verify 4 anchor points
        addr=8'h00; #1;
        if (dout !== 8'h80) begin $display("FAIL: addr=00 got %h exp 80", dout); errors=errors+1; end
        addr=8'h40; #1;
        if (dout !== 8'hFF) begin $display("FAIL: addr=40 got %h exp FF", dout); errors=errors+1; end
        addr=8'h80; #1;
        if (dout !== 8'h80) begin $display("FAIL: addr=80 got %h exp 80", dout); errors=errors+1; end
        addr=8'hC0; #1;
        if (dout !== 8'h01) begin $display("FAIL: addr=C0 got %h exp 01", dout); errors=errors+1; end
        // Verify output is purely combinational (changes same #1 as addr)
        addr=8'h00; #1;
        if (dout !== 8'h80) begin $display("FAIL: not combinational at addr=00"); errors=errors+1; end
        addr=8'h40; #1;
        if (dout !== 8'hFF) begin $display("FAIL: not combinational at addr=40"); errors=errors+1; end
        // Spot check mid-range values are not all zero (ROM was loaded)
        addr=8'h10; #1;
        if (dout === 8'h00 && dout === 8'hFF) begin $display("FAIL: ROM appears uninitialised"); errors=errors+1; end
        if (errors == 0) $display("ALL TESTS PASSED");
        else $display("TESTS FAILED: %0d error(s)", errors);
        $finish;
    end
endmodule
`,
  },

  // ─── MEM.06 — Synchronous FIFO with Full/Empty ───────────────────────────
  {
    id: "fifo-sync", slug: "fifo-sync",
    title: "Synchronous FIFO with Full/Empty Flags",
    difficulty: "intermediate", category: "memory",
    tags: ["FIFO", "memory", "interview", "flow-control", "sequential"],
    learningLevel: "Verilog Intermediate",
    moduleId: "mod_memory", orderIndex: 33,
    xpReward: 180, waveformRequired: false,
    expectedOutputMode: "stdout_compare",

    statement: `## Synchronous FIFO with Full/Empty Flags

A **First-In First-Out** buffer: data written to the write port emerges from the read port in the same order, after a variable delay. Single clock domain.

**Depth: 8 entries. Width: 8 bits.**

**Interface**

| Port        | Direction | Description                         |
|-------------|-----------|-------------------------------------|
| \`clk\`       | input   | Clock                               |
| \`rst\`       | input   | Synchronous reset                   |
| \`wr_en\`     | input   | Write enable                        |
| \`rd_en\`     | input   | Read enable                         |
| \`din[7:0]\`  | input   | Write data                          |
| \`dout[7:0]\` | output  | Read data (synchronous)             |
| \`full\`      | output  | FIFO is full (count == 8)           |
| \`empty\`     | output  | FIFO is empty (count == 0)          |
| \`count[3:0]\`| output  | Current number of entries           |

**Rules:**
- Writes are ignored (no-op) when \`full=1\`
- Reads are ignored (no-op) when \`empty=1\`
- Simultaneous valid read + valid write: count stays constant, data flows through
- \`dout\` is registered (synchronous read)`,

    constraints: [
      "Use write pointer wr_ptr[2:0] and read pointer rd_ptr[2:0], both wrapping mod 8.",
      "count[3:0] tracks number of entries: increment on write, decrement on read.",
      "full = (count == 4'd8). empty = (count == 4'd0).",
      "Write when full: no-op. Read when empty: no-op.",
    ],
    examples: [
      { input: "Write 8 entries", output: "full=1, count=8", explanation: "FIFO full" },
      { input: "Write 8, then read 8", output: "Data emerges in same order, empty=1 after last read", explanation: "FIFO ordering preserved" },
      { input: "Simultaneous wr_en=1, rd_en=1 when half-full", output: "count unchanged, data flows", explanation: "Simultaneous read+write" },
    ],
    hints: [
      { tier: 1, content: "You need: `reg [7:0] mem[0:7]`, `reg [2:0] wr_ptr, rd_ptr`, `reg [3:0] count`. On write (not full): `mem[wr_ptr] <= din; wr_ptr <= wr_ptr+1; count <= count+1`. On read (not empty): `dout <= mem[rd_ptr]; rd_ptr <= rd_ptr+1; count <= count-1`." },
      { tier: 2, content: "Simultaneous valid read+write: both pointers advance, count stays same. Handle this case first: `if (wr_valid && rd_valid) begin ... end` before individual cases." },
      { tier: 3, content: "Use a single always block. Define `wr_valid = wr_en && !full`, `rd_valid = rd_en && !empty`. Then handle: both valid, write only, read only, neither." },
    ],
    publicTestcases: [], hiddenTestcases: [],

    starterCode: `\`timescale 1ns / 1ps

module fifo_sync (
    input  wire       clk,
    input  wire       rst,
    input  wire       wr_en,
    input  wire       rd_en,
    input  wire [7:0] din,
    output reg  [7:0] dout,
    output wire       full,
    output wire       empty,
    output wire [3:0] count
);

    reg [7:0] mem  [0:7];
    reg [2:0] wr_ptr;
    reg [2:0] rd_ptr;
    reg [3:0] cnt;

    assign full  = (cnt == 4'd8);
    assign empty = (cnt == 4'd0);
    assign count = cnt;

    wire wr_valid = wr_en && !full;
    wire rd_valid = rd_en && !empty;

    always @(posedge clk) begin
        if (rst) begin
            wr_ptr <= 3'd0;
            rd_ptr <= 3'd0;
            cnt    <= 4'd0;
            dout   <= 8'd0;
        end else begin
            // TODO: handle simultaneous read+write, write-only, read-only
        end
    end

endmodule
`,

    publicTestbench: `\`timescale 1ns / 1ps
module tb_fifo_sync;
    reg clk, rst, wr_en, rd_en;
    reg [7:0] din;
    wire [7:0] dout;
    wire full, empty;
    wire [3:0] count;
    integer i;
    fifo_sync dut (.clk(clk),.rst(rst),.wr_en(wr_en),.rd_en(rd_en),
                   .din(din),.dout(dout),.full(full),.empty(empty),.count(count));
    initial clk = 0;
    always #5 clk = ~clk;
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_fifo_sync); end
    initial begin
        $display("=== Synchronous FIFO Test ===");
        rst=1; wr_en=0; rd_en=0; din=0; @(posedge clk); #1; rst=0;
        $display("reset: empty=%b full=%b count=%0d", empty, full, count);
        // Fill to full
        wr_en=1;
        for (i=0; i<8; i=i+1) begin din=i*11; @(posedge clk); #1; end
        wr_en=0;
        $display("full:  empty=%b full=%b count=%0d (expect 0 1 8)", empty, full, count);
        // Drain
        rd_en=1;
        for (i=0; i<8; i=i+1) begin @(posedge clk); #1;
            $display("  dout=%0d (expect %0d)", dout, i*11);
        end
        rd_en=0;
        $display("empty: empty=%b full=%b count=%0d (expect 1 0 0)", empty, full, count);
        $finish;
    end
endmodule
`,

    hiddenTestbench: `\`timescale 1ns / 1ps
module tb_fifo_sync_hidden;
    reg clk, rst, wr_en, rd_en;
    reg [7:0] din;
    wire [7:0] dout;
    wire full, empty;
    wire [3:0] count;
    integer errors, i;
    fifo_sync dut (.clk(clk),.rst(rst),.wr_en(wr_en),.rd_en(rd_en),
                   .din(din),.dout(dout),.full(full),.empty(empty),.count(count));
    initial clk = 0;
    always #5 clk = ~clk;
    initial begin
        errors = 0;
        rst=1; wr_en=0; rd_en=0; din=0; @(posedge clk); #1; rst=0;
        if (!empty) begin $display("FAIL: not empty after rst"); errors=errors+1; end
        if (full)   begin $display("FAIL: full after rst"); errors=errors+1; end
        if (count !== 0) begin $display("FAIL: count=%0d after rst exp 0", count); errors=errors+1; end
        // Fill entry by entry — verify count increments and full asserts at 8
        wr_en=1;
        for (i=0; i<8; i=i+1) begin
            din=8'hA0+i; @(posedge clk); #1;
            if (count !== i+1) begin $display("FAIL: count=%0d exp %0d after %0d writes",count,i+1,i+1); errors=errors+1; end
        end
        wr_en=0;
        if (!full)  begin $display("FAIL: full not asserted at count=8"); errors=errors+1; end
        if (count !== 4'd8) begin $display("FAIL: count=%0d exp 8 when full", count); errors=errors+1; end
        // Write when full — no-op
        wr_en=1; din=8'hFF; @(posedge clk); #1; wr_en=0;
        if (count !== 4'd8) begin $display("FAIL: count changed on write-when-full: %0d", count); errors=errors+1; end
        // Drain and verify order
        rd_en=1;
        for (i=0; i<8; i=i+1) begin
            @(posedge clk); #1;
            if (dout !== 8'hA0+i) begin $display("FAIL: drain order i=%0d dout=%h exp %h",i,dout,8'hA0+i); errors=errors+1; end
        end
        rd_en=0;
        if (!empty) begin $display("FAIL: empty not asserted after drain"); errors=errors+1; end
        if (count !== 0) begin $display("FAIL: count=%0d exp 0 when empty", count); errors=errors+1; end
        // Read when empty — no-op, count stays 0
        rd_en=1; @(posedge clk); #1; rd_en=0;
        if (count !== 0) begin $display("FAIL: count changed on read-when-empty: %0d", count); errors=errors+1; end
        // Simultaneous read+write when half-full
        wr_en=1; din=8'hB0; repeat(4) @(posedge clk);
        #1; wr_en=0;  // count=4
        wr_en=1; rd_en=1; din=8'hC0; @(posedge clk); #1; wr_en=0; rd_en=0;
        if (count !== 4'd4) begin $display("FAIL: sim r+w count=%0d exp 4", count); errors=errors+1; end
        if (errors == 0) $display("ALL TESTS PASSED");
        else $display("TESTS FAILED: %0d error(s)", errors);
        $finish;
    end
endmodule
`,
  },

  // ─── MEM.07 — FIFO with Almost-Full / Almost-Empty ───────────────────────
  {
    id: "fifo-threshold-flags", slug: "fifo-threshold-flags",
    title: "FIFO with Almost-Full / Almost-Empty Flags",
    difficulty: "intermediate", category: "memory",
    tags: ["FIFO", "memory", "flow-control", "threshold", "sequential"],
    learningLevel: "Verilog Intermediate",
    moduleId: "mod_memory", orderIndex: 34,
    xpReward: 190, waveformRequired: false,
    expectedOutputMode: "stdout_compare",

    statement: `## FIFO with Almost-Full / Almost-Empty Flags

Extend the synchronous FIFO (MEM.06) with **two programmable early-warning threshold flags**.

**New ports (all MEM.06 ports plus):**

| Port           | Direction | Description                                  |
|----------------|-----------|----------------------------------------------|
| \`almost_full\`  | output  | Asserts when \`count >= AF_THRESH\`            |
| \`almost_empty\` | output  | Asserts when \`count <= AE_THRESH\`            |

**Parameters:** \`AF_THRESH = 6\` (default), \`AE_THRESH = 2\` (default).

These flags give producers and consumers advance warning before the FIFO reaches a critical state. A DMA controller can stop requesting data when \`almost_full\` asserts — giving 2 entries of margin before a hard \`full\` stop.

\`almost_full\` does **not** imply \`full\`. \`almost_empty\` does **not** imply \`empty\`. All four flags can be independently active.

Instantiate with non-default thresholds in your testbench (\`AF_THRESH=7\`, \`AE_THRESH=1\`) to verify parameterisation.`,

    constraints: [
      "Inherit all MEM.06 behaviour exactly.",
      "`almost_full = (count >= AF_THRESH)`",
      "`almost_empty = (count <= AE_THRESH)`",
      "AF_THRESH and AE_THRESH are module parameters.",
      "All four flags (full, empty, almost_full, almost_empty) are independent.",
    ],
    examples: [
      { input: "count=6 with AF_THRESH=6", output: "almost_full=1, full=0", explanation: "Almost-full before actual full" },
      { input: "count=2 with AE_THRESH=2", output: "almost_empty=1, empty=0", explanation: "Almost-empty before actual empty" },
      { input: "count=0", output: "empty=1, almost_empty=1", explanation: "Both assert at empty" },
    ],
    hints: [
      { tier: 1, content: "Copy your MEM.06 implementation and add `parameter AF_THRESH = 6, AE_THRESH = 2;`. Then add two assign statements for the new flags." },
      { tier: 2, content: "`assign almost_full  = (cnt >= AF_THRESH);` and `assign almost_empty = (cnt <= AE_THRESH);` — both purely combinational from cnt." },
      { tier: 3, content: "The four flags are: `full=(cnt==8)`, `empty=(cnt==0)`, `almost_full=(cnt>=AF_THRESH)`, `almost_empty=(cnt<=AE_THRESH)`. They can all be 0, any combination can be 1 — no mutual exclusion except full&empty can't both be 1." },
    ],
    publicTestcases: [], hiddenTestcases: [],

    starterCode: `\`timescale 1ns / 1ps

module fifo_threshold_flags #(
    parameter AF_THRESH = 6,
    parameter AE_THRESH = 2
) (
    input  wire       clk,
    input  wire       rst,
    input  wire       wr_en,
    input  wire       rd_en,
    input  wire [7:0] din,
    output reg  [7:0] dout,
    output wire       full,
    output wire       empty,
    output wire [3:0] count,
    output wire       almost_full,
    output wire       almost_empty
);

    reg [7:0] mem  [0:7];
    reg [2:0] wr_ptr;
    reg [2:0] rd_ptr;
    reg [3:0] cnt;

    assign full         = (cnt == 4'd8);
    assign empty        = (cnt == 4'd0);
    assign count        = cnt;
    // TODO: assign almost_full and almost_empty using AF_THRESH and AE_THRESH

    wire wr_valid = wr_en && !full;
    wire rd_valid = rd_en && !empty;

    always @(posedge clk) begin
        if (rst) begin
            wr_ptr <= 3'd0; rd_ptr <= 3'd0; cnt <= 4'd0; dout <= 8'd0;
        end else begin
            if (wr_valid && rd_valid) begin
                mem[wr_ptr] <= din;
                dout        <= mem[rd_ptr];
                wr_ptr      <= wr_ptr + 3'd1;
                rd_ptr      <= rd_ptr + 3'd1;
            end else if (wr_valid) begin
                mem[wr_ptr] <= din;
                wr_ptr      <= wr_ptr + 3'd1;
                cnt         <= cnt + 4'd1;
            end else if (rd_valid) begin
                dout        <= mem[rd_ptr];
                rd_ptr      <= rd_ptr + 3'd1;
                cnt         <= cnt - 4'd1;
            end
        end
    end

endmodule
`,

    publicTestbench: `\`timescale 1ns / 1ps
module tb_fifo_threshold_flags;
    reg clk, rst, wr_en, rd_en;
    reg [7:0] din;
    wire [7:0] dout;
    wire full, empty, almost_full, almost_empty;
    wire [3:0] count;
    integer i;
    // Default thresholds AF=6, AE=2
    fifo_threshold_flags dut (.clk(clk),.rst(rst),.wr_en(wr_en),.rd_en(rd_en),
        .din(din),.dout(dout),.full(full),.empty(empty),.count(count),
        .almost_full(almost_full),.almost_empty(almost_empty));
    initial clk = 0;
    always #5 clk = ~clk;
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_fifo_threshold_flags); end
    initial begin
        $display("=== FIFO Threshold Flags Test (AF=6, AE=2) ===");
        rst=1; wr_en=0; rd_en=0; @(posedge clk); #1; rst=0;
        $display("empty: ae=%b af=%b empty=%b full=%b cnt=%0d", almost_empty, almost_full, empty, full, count);
        wr_en=1;
        for (i=0; i<8; i=i+1) begin
            din=i; @(posedge clk); #1;
            $display("cnt=%0d: ae=%b af=%b empty=%b full=%b", count, almost_empty, almost_full, empty, full);
        end
        wr_en=0;
        rd_en=1;
        for (i=0; i<8; i=i+1) begin
            @(posedge clk); #1;
            $display("cnt=%0d: ae=%b af=%b empty=%b full=%b", count, almost_empty, almost_full, empty, full);
        end
        rd_en=0;
        $finish;
    end
endmodule
`,

    hiddenTestbench: `\`timescale 1ns / 1ps
module tb_fifo_threshold_flags_hidden;
    reg clk, rst, wr_en, rd_en;
    reg [7:0] din;
    wire [7:0] dout_d, dout_c;
    wire full_d, empty_d, af_d, ae_d;
    wire full_c, empty_c, af_c, ae_c;
    wire [3:0] count_d, count_c;
    integer errors, i;
    // Default thresholds
    fifo_threshold_flags dut_d (.clk(clk),.rst(rst),.wr_en(wr_en),.rd_en(rd_en),
        .din(din),.dout(dout_d),.full(full_d),.empty(empty_d),.count(count_d),
        .almost_full(af_d),.almost_empty(ae_d));
    // Custom thresholds AF=7, AE=1
    fifo_threshold_flags #(.AF_THRESH(7),.AE_THRESH(1)) dut_c (.clk(clk),.rst(rst),.wr_en(wr_en),.rd_en(rd_en),
        .din(din),.dout(dout_c),.full(full_c),.empty(empty_c),.count(count_c),
        .almost_full(af_c),.almost_empty(ae_c));
    initial clk = 0;
    always #5 clk = ~clk;
    initial begin
        errors = 0;
        rst=1; wr_en=0; rd_en=0; din=0; @(posedge clk); #1; rst=0;
        // Fill default FIFO and check flags at each level
        wr_en=1;
        for (i=0; i<8; i=i+1) begin
            din=i; @(posedge clk); #1;
            // almost_empty: count<=2
            if (count_d <= 4'd2 && ae_d !== 1'b1) begin $display("FAIL: ae not set at count=%0d",count_d); errors=errors+1; end
            if (count_d > 4'd2  && ae_d !== 1'b0) begin $display("FAIL: ae set at count=%0d>2",count_d); errors=errors+1; end
            // almost_full: count>=6
            if (count_d >= 4'd6 && af_d !== 1'b1) begin $display("FAIL: af not set at count=%0d",count_d); errors=errors+1; end
            if (count_d < 4'd6  && af_d !== 1'b0) begin $display("FAIL: af set at count=%0d<6",count_d); errors=errors+1; end
        end
        wr_en=0;
        if (!full_d)  begin $display("FAIL: full not set"); errors=errors+1; end
        if (!af_d)    begin $display("FAIL: af not set at full"); errors=errors+1; end
        // Drain and check
        rd_en=1;
        for (i=0; i<8; i=i+1) begin
            @(posedge clk); #1;
            if (count_d <= 4'd2 && ae_d !== 1'b1) begin $display("FAIL: ae drain count=%0d",count_d); errors=errors+1; end
        end
        rd_en=0;
        if (!empty_d) begin $display("FAIL: empty not set after drain"); errors=errors+1; end
        // Custom thresholds AF=7 AE=1 — verify different assertion points
        rst=1; @(posedge clk); #1; rst=0;
        wr_en=1;
        for (i=0; i<6; i=i+1) begin din=i; @(posedge clk); end
        #1; wr_en=0;
        // count=6: af_c (thresh=7) should be 0; af_d (thresh=6) should be 1
        if (af_c !== 1'b0) begin $display("FAIL: custom AF=7 at count=6 should be 0, got %b", af_c); errors=errors+1; end
        if (af_d !== 1'b1) begin $display("FAIL: default AF=6 at count=6 should be 1, got %b", af_d); errors=errors+1; end
        if (errors == 0) $display("ALL TESTS PASSED");
        else $display("TESTS FAILED: %0d error(s)", errors);
        $finish;
    end
endmodule
`,
  },
];