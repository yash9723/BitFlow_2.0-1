/**
 * lib/problems/beginner.ts — Beginner tier problems (M01–M05)
 *
 * All testbenches are strict Verilog-2001 (no SystemVerilog).
 * Rules:
 *   - No inline variable initialization (integer e=0 → declare then assign)
 *   - No `logic` type, no `always_ff` / `always_comb`
 *   - No ternary in $display — use if/else
 *   - Variable declarations only at module scope
 *   - $finish must be called to end simulation cleanly
 */

import type { Problem } from "@/lib/problem-types";

// ─────────────────────────────────────────────────────────────────────────────
// M01 — Hello, Hardware: Wires, Modules & Ports
// ─────────────────────────────────────────────────────────────────────────────

const theFirstWire: Problem = {
  id: "the-first-wire", slug: "the-first-wire", title: "The First Wire",
  difficulty: "beginner", category: "combinational",
  tags: ["wire", "module", "assign", "ports"],
  learningLevel: "Verilog Beginner", moduleId: "mod_logic_gates", orderIndex: 1,
  xpReward: 20, waveformRequired: false, expectedOutputMode: "stdout_compare",
  statement: `## The First Wire

Write a module with one 1-bit input \`in\` and one 1-bit output \`out\`. Connect them with a single \`assign\` statement. No logic — just pass the signal through.

**Interface**

| Port  | Direction | Width | Description  |
|-------|-----------|-------|--------------|
| \`in\`  | input   | 1     | Input signal |
| \`out\` | output  | 1     | Output signal |

**Notes**
- A \`wire\` has no memory — it carries whatever is driven onto it at all times.
- The \`assign\` statement creates a continuous connection.`,
  constraints: ["Use a single assign statement.", "No logic operators."],
  examples: [
    { input: "in=0", output: "out=0" },
    { input: "in=1", output: "out=1" },
  ],
  hints: [
    { tier: 1, content: "`assign out = in;` is all you need." },
  ],
  publicTestcases: [], hiddenTestcases: [],
  starterCode: `\`timescale 1ns / 1ps

module the_first_wire (
    input  wire in,
    output wire out
);

    // TODO: Connect in to out with assign
    // assign out = ...;

endmodule
`,
  publicTestbench: `\`timescale 1ns / 1ps
module tb_the_first_wire;
    reg in; wire out;
    the_first_wire dut (.in(in), .out(out));
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_the_first_wire); end
    initial begin
        $display("=== First Wire Test ===");
        in = 0; #10; $display("in=%b => out=%b (expect 0)", in, out);
        in = 1; #10; $display("in=%b => out=%b (expect 1)", in, out);
        $finish;
    end
endmodule
`,
  hiddenTestbench: `\`timescale 1ns / 1ps
module tb_first_wire_hidden;
    reg in; wire out;
    integer errors;
    the_first_wire dut (.in(in), .out(out));
    initial begin
        errors = 0;
        in = 0; #10; if (out !== 1'b0) begin $display("FAIL: in=0 expected out=0 got %b", out); errors = errors + 1; end
        in = 1; #10; if (out !== 1'b1) begin $display("FAIL: in=1 expected out=1 got %b", out); errors = errors + 1; end
        if (errors == 0) $display("ALL TESTS PASSED");
        else $display("TESTS FAILED: %0d error(s)", errors);
        $finish;
    end
endmodule
`,
};

const fourWires: Problem = {
  id: "four-wires", slug: "four-wires", title: "Four Wires",
  difficulty: "beginner", category: "combinational",
  tags: ["wire", "ports", "assign"],
  learningLevel: "Verilog Beginner", moduleId: "mod_logic_gates", orderIndex: 2,
  xpReward: 25, waveformRequired: false, expectedOutputMode: "stdout_compare",
  statement: `## Four Wires

A module with four 1-bit inputs (\`a\`, \`b\`, \`c\`, \`d\`) and four 1-bit outputs (\`w\`, \`x\`, \`y\`, \`z\`).
Assign: \`w=a\`, \`x=b\`, \`y=c\`, \`z=d\`. No logic — pure wiring.

**Interface**

| Port | Direction | Description |
|------|-----------|-------------|
| \`a,b,c,d\` | input | Four signal inputs |
| \`w,x,y,z\` | output | Four signal outputs |`,
  constraints: ["Use four separate assign statements.", "Each output tracks exactly one input."],
  examples: [{ input: "a=1,b=0,c=1,d=0", output: "w=1,x=0,y=1,z=0" }],
  hints: [{ tier: 1, content: "Four separate `assign` statements, one per output." }],
  publicTestcases: [], hiddenTestcases: [],
  starterCode: `\`timescale 1ns / 1ps

module four_wires (
    input  wire a, b, c, d,
    output wire w, x, y, z
);

    // TODO: assign each output to its corresponding input

endmodule
`,
  publicTestbench: `\`timescale 1ns / 1ps
module tb_four_wires;
    reg a,b,c,d; wire w,x,y,z;
    four_wires dut (.a(a),.b(b),.c(c),.d(d),.w(w),.x(x),.y(y),.z(z));
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_four_wires); end
    initial begin
        $display("=== Four Wires Test ===");
        a=1;b=0;c=1;d=0; #10;
        $display("a=%b b=%b c=%b d=%b => w=%b x=%b y=%b z=%b", a,b,c,d,w,x,y,z);
        a=0;b=1;c=0;d=1; #10;
        $display("a=%b b=%b c=%b d=%b => w=%b x=%b y=%b z=%b", a,b,c,d,w,x,y,z);
        $finish;
    end
endmodule
`,
  hiddenTestbench: `\`timescale 1ns / 1ps
module tb_four_wires_hidden;
    reg a,b,c,d; wire w,x,y,z;
    integer errors;
    integer i;
    four_wires dut (.a(a),.b(b),.c(c),.d(d),.w(w),.x(x),.y(y),.z(z));
    initial begin
        errors = 0;
        for (i = 0; i < 16; i = i + 1) begin
            {a,b,c,d} = i[3:0]; #5;
            if (w!==a || x!==b || y!==c || z!==d) begin
                $display("FAIL: a=%b b=%b c=%b d=%b => w=%b x=%b y=%b z=%b", a,b,c,d,w,x,y,z);
                errors = errors + 1;
            end
        end
        if (errors == 0) $display("ALL TESTS PASSED");
        else $display("TESTS FAILED: %0d error(s)", errors);
        $finish;
    end
endmodule
`,
};

const inverter: Problem = {
  id: "inverter", slug: "inverter", title: "Inverter (NOT Gate)",
  difficulty: "beginner", category: "combinational",
  tags: ["gates", "assign", "combinational"],
  learningLevel: "Verilog Beginner", moduleId: "mod_logic_gates", orderIndex: 3,
  xpReward: 25, waveformRequired: false, expectedOutputMode: "stdout_compare",
  statement: `## Inverter (NOT Gate)

Implement a NOT gate: one 1-bit input \`in\`, one 1-bit output \`out\`. Output is always the complement of the input.

**Truth Table**

| in | out |
|----|-----|
| 0  |  1  |
| 1  |  0  |

**Notes**
- Use the bitwise complement operator \`~\`.
- This represents a real physical inverter (two stacked CMOS transistors).`,
  constraints: ["Use a single assign statement with the ~ operator."],
  examples: [{ input: "in=0", output: "out=1" }, { input: "in=1", output: "out=0" }],
  hints: [{ tier: 1, content: "The NOT operator in Verilog is `~`. Use `assign out = ~in;`" }],
  publicTestcases: [], hiddenTestcases: [],
  starterCode: `\`timescale 1ns / 1ps

module inverter (
    input  wire in,
    output wire out
);

    // TODO: Implement NOT gate
    // assign out = ...;

endmodule
`,
  publicTestbench: `\`timescale 1ns / 1ps
module tb_inverter;
    reg in; wire out;
    inverter dut (.in(in), .out(out));
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_inverter); end
    initial begin
        $display("=== Inverter Test ===");
        in = 0; #10; $display("in=%b => out=%b (expect 1)", in, out);
        in = 1; #10; $display("in=%b => out=%b (expect 0)", in, out);
        $finish;
    end
endmodule
`,
  hiddenTestbench: `\`timescale 1ns / 1ps
module tb_inverter_hidden;
    reg in; wire out;
    integer errors;
    inverter dut (.in(in), .out(out));
    initial begin
        errors = 0;
        in = 0; #10; if (out !== 1'b1) begin $display("FAIL: in=0 expected out=1 got %b", out); errors = errors + 1; end
        in = 1; #10; if (out !== 1'b0) begin $display("FAIL: in=1 expected out=0 got %b", out); errors = errors + 1; end
        if (errors == 0) $display("ALL TESTS PASSED");
        else $display("TESTS FAILED: %0d error(s)", errors);
        $finish;
    end
endmodule
`,
};

// AND Gate — existing, preserved exactly
const andGate: Problem = {
  id: "and-gate", slug: "and-gate", title: "AND Gate",
  difficulty: "beginner", category: "combinational",
  tags: ["gates", "combinational", "structural"],
  learningLevel: "Verilog Beginner", moduleId: "mod_logic_gates", orderIndex: 4,
  xpReward: 30, waveformRequired: false, expectedOutputMode: "stdout_compare",
  statement: `## AND Gate

Implement a 2-input AND gate.

**Interface**

| Port | Direction | Width | Description       |
|------|-----------|-------|-------------------|
| \`a\` | input     | 1     | First operand     |
| \`b\` | input     | 1     | Second operand    |
| \`y\` | output    | 1     | \`a AND b\` result |

**Truth Table**

| a | b | y |
|---|---|---|
| 0 | 0 | 0 |
| 0 | 1 | 0 |
| 1 | 0 | 0 |
| 1 | 1 | 1 |

**Notes**
- Use a continuous assignment (\`assign\`) to implement the gate.`,
  constraints: ["Use a single assign statement.", "Do not use always blocks."],
  examples: [{ input: "a=0, b=1", output: "y=0" }, { input: "a=1, b=1", output: "y=1" }],
  hints: [
    { tier: 1, content: "The bitwise AND operator in Verilog is `&`." },
    { tier: 2, content: "Continuous assignments use the `assign` keyword." },
  ],
  publicTestcases: [], hiddenTestcases: [],
  starterCode: `\`timescale 1ns / 1ps

module and_gate (
    input  wire a,
    input  wire b,
    output wire y
);

    // TODO: Implement a 2-input AND gate using assign
    // assign y = ...;

endmodule
`,
  publicTestbench: `\`timescale 1ns / 1ps
module tb_and_gate;
    reg  a, b; wire y;
    and_gate dut (.a(a), .b(b), .y(y));
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_and_gate); end
    initial begin
        $display("=== AND Gate Test ===");
        a=0;b=0;#10; $display("a=%b b=%b => y=%b (expect 0)",a,b,y);
        a=0;b=1;#10; $display("a=%b b=%b => y=%b (expect 0)",a,b,y);
        a=1;b=0;#10; $display("a=%b b=%b => y=%b (expect 0)",a,b,y);
        a=1;b=1;#10; $display("a=%b b=%b => y=%b (expect 1)",a,b,y);
        $finish;
    end
endmodule
`,
  hiddenTestbench: `\`timescale 1ns / 1ps
module tb_and_gate_hidden;
    reg a,b; wire y;
    integer errors;
    and_gate dut (.a(a),.b(b),.y(y));
    initial begin
        errors = 0;
        a=0;b=0;#10; if(y!==1'b0) begin $display("FAIL a=0 b=0 exp 0 got %b",y); errors=errors+1; end
        a=0;b=1;#10; if(y!==1'b0) begin $display("FAIL a=0 b=1 exp 0 got %b",y); errors=errors+1; end
        a=1;b=0;#10; if(y!==1'b0) begin $display("FAIL a=1 b=0 exp 0 got %b",y); errors=errors+1; end
        a=1;b=1;#10; if(y!==1'b1) begin $display("FAIL a=1 b=1 exp 1 got %b",y); errors=errors+1; end
        if (errors==0) $display("ALL TESTS PASSED");
        else $display("TESTS FAILED: %0d error(s)",errors);
        $finish;
    end
endmodule
`,
};

const orGate: Problem = {
  id: "or-gate", slug: "or-gate", title: "OR Gate",
  difficulty: "beginner", category: "combinational",
  tags: ["gates", "combinational"],
  learningLevel: "Verilog Beginner", moduleId: "mod_logic_gates", orderIndex: 5,
  xpReward: 25, waveformRequired: false, expectedOutputMode: "stdout_compare",
  statement: `## OR Gate

Implement a 2-input OR gate. Output is high when **either or both** inputs are high.

**Truth Table**

| a | b | y |
|---|---|---|
| 0 | 0 | 0 |
| 0 | 1 | 1 |
| 1 | 0 | 1 |
| 1 | 1 | 1 |`,
  constraints: ["Use a single assign statement with the | operator."],
  examples: [{ input: "a=0, b=0", output: "y=0" }, { input: "a=1, b=0", output: "y=1" }],
  hints: [{ tier: 1, content: "The bitwise OR operator in Verilog is `|`." }],
  publicTestcases: [], hiddenTestcases: [],
  starterCode: `\`timescale 1ns / 1ps

module or_gate (
    input  wire a,
    input  wire b,
    output wire y
);

    // TODO: assign y = ...;

endmodule
`,
  publicTestbench: `\`timescale 1ns / 1ps
module tb_or_gate;
    reg a,b; wire y;
    or_gate dut (.a(a),.b(b),.y(y));
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_or_gate); end
    initial begin
        $display("=== OR Gate Test ===");
        a=0;b=0;#10; $display("a=%b b=%b => y=%b (expect 0)",a,b,y);
        a=0;b=1;#10; $display("a=%b b=%b => y=%b (expect 1)",a,b,y);
        a=1;b=0;#10; $display("a=%b b=%b => y=%b (expect 1)",a,b,y);
        a=1;b=1;#10; $display("a=%b b=%b => y=%b (expect 1)",a,b,y);
        $finish;
    end
endmodule
`,
  hiddenTestbench: `\`timescale 1ns / 1ps
module tb_or_gate_hidden;
    reg a,b; wire y;
    integer errors;
    or_gate dut (.a(a),.b(b),.y(y));
    initial begin
        errors = 0;
        a=0;b=0;#10; if(y!==1'b0) begin $display("FAIL a=0 b=0 exp 0 got %b",y); errors=errors+1; end
        a=0;b=1;#10; if(y!==1'b1) begin $display("FAIL a=0 b=1 exp 1 got %b",y); errors=errors+1; end
        a=1;b=0;#10; if(y!==1'b1) begin $display("FAIL a=1 b=0 exp 1 got %b",y); errors=errors+1; end
        a=1;b=1;#10; if(y!==1'b1) begin $display("FAIL a=1 b=1 exp 1 got %b",y); errors=errors+1; end
        if (errors==0) $display("ALL TESTS PASSED");
        else $display("TESTS FAILED: %0d error(s)",errors);
        $finish;
    end
endmodule
`,
};

const nandGate: Problem = {
  id: "nand-gate", slug: "nand-gate", title: "NAND Gate",
  difficulty: "beginner", category: "combinational",
  tags: ["gates", "combinational"],
  learningLevel: "Verilog Beginner", moduleId: "mod_logic_gates", orderIndex: 6,
  xpReward: 25, waveformRequired: false, expectedOutputMode: "stdout_compare",
  statement: `## NAND Gate

Implement a 2-input NAND gate. Output is the complement of AND: low **only** when both inputs are high.

**Truth Table**

| a | b | y |
|---|---|---|
| 0 | 0 | 1 |
| 0 | 1 | 1 |
| 1 | 0 | 1 |
| 1 | 1 | 0 |

**Notes** — NAND is functionally complete: any logic function can be built from NAND gates alone.`,
  constraints: ["Use a single assign with ~( ) around the & expression."],
  examples: [{ input: "a=1, b=1", output: "y=0" }, { input: "a=0, b=1", output: "y=1" }],
  hints: [{ tier: 1, content: "`assign y = ~(a & b);`" }],
  publicTestcases: [], hiddenTestcases: [],
  starterCode: `\`timescale 1ns / 1ps

module nand_gate (
    input  wire a,
    input  wire b,
    output wire y
);

    // TODO: assign y = ...;

endmodule
`,
  publicTestbench: `\`timescale 1ns / 1ps
module tb_nand_gate;
    reg a,b; wire y;
    nand_gate dut (.a(a),.b(b),.y(y));
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_nand_gate); end
    initial begin
        $display("=== NAND Gate Test ===");
        a=0;b=0;#10; $display("a=%b b=%b => y=%b (expect 1)",a,b,y);
        a=0;b=1;#10; $display("a=%b b=%b => y=%b (expect 1)",a,b,y);
        a=1;b=0;#10; $display("a=%b b=%b => y=%b (expect 1)",a,b,y);
        a=1;b=1;#10; $display("a=%b b=%b => y=%b (expect 0)",a,b,y);
        $finish;
    end
endmodule
`,
  hiddenTestbench: `\`timescale 1ns / 1ps
module tb_nand_gate_hidden;
    reg a,b; wire y;
    integer errors;
    nand_gate dut (.a(a),.b(b),.y(y));
    initial begin
        errors = 0;
        a=0;b=0;#10; if(y!==1'b1) begin $display("FAIL a=0 b=0 exp 1 got %b",y); errors=errors+1; end
        a=0;b=1;#10; if(y!==1'b1) begin $display("FAIL a=0 b=1 exp 1 got %b",y); errors=errors+1; end
        a=1;b=0;#10; if(y!==1'b1) begin $display("FAIL a=1 b=0 exp 1 got %b",y); errors=errors+1; end
        a=1;b=1;#10; if(y!==1'b0) begin $display("FAIL a=1 b=1 exp 0 got %b",y); errors=errors+1; end
        if (errors==0) $display("ALL TESTS PASSED");
        else $display("TESTS FAILED: %0d error(s)",errors);
        $finish;
    end
endmodule
`,
};

const norGate: Problem = {
  id: "nor-gate", slug: "nor-gate", title: "NOR Gate",
  difficulty: "beginner", category: "combinational",
  tags: ["gates", "combinational"],
  learningLevel: "Verilog Beginner", moduleId: "mod_logic_gates", orderIndex: 7,
  xpReward: 25, waveformRequired: false, expectedOutputMode: "stdout_compare",
  statement: `## NOR Gate

Implement a 2-input NOR gate. Output is high **only** when both inputs are low.

**Truth Table**

| a | b | y |
|---|---|---|
| 0 | 0 | 1 |
| 0 | 1 | 0 |
| 1 | 0 | 0 |
| 1 | 1 | 0 |`,
  constraints: ["Use a single assign with ~( ) around the | expression."],
  examples: [{ input: "a=0, b=0", output: "y=1" }, { input: "a=1, b=0", output: "y=0" }],
  hints: [{ tier: 1, content: "`assign y = ~(a | b);`" }],
  publicTestcases: [], hiddenTestcases: [],
  starterCode: `\`timescale 1ns / 1ps

module nor_gate (
    input  wire a,
    input  wire b,
    output wire y
);

    // TODO: assign y = ...;

endmodule
`,
  publicTestbench: `\`timescale 1ns / 1ps
module tb_nor_gate;
    reg a,b; wire y;
    nor_gate dut (.a(a),.b(b),.y(y));
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_nor_gate); end
    initial begin
        $display("=== NOR Gate Test ===");
        a=0;b=0;#10; $display("a=%b b=%b => y=%b (expect 1)",a,b,y);
        a=0;b=1;#10; $display("a=%b b=%b => y=%b (expect 0)",a,b,y);
        a=1;b=0;#10; $display("a=%b b=%b => y=%b (expect 0)",a,b,y);
        a=1;b=1;#10; $display("a=%b b=%b => y=%b (expect 0)",a,b,y);
        $finish;
    end
endmodule
`,
  hiddenTestbench: `\`timescale 1ns / 1ps
module tb_nor_gate_hidden;
    reg a,b; wire y;
    integer errors;
    nor_gate dut (.a(a),.b(b),.y(y));
    initial begin
        errors = 0;
        a=0;b=0;#10; if(y!==1'b1) begin $display("FAIL a=0 b=0 exp 1 got %b",y); errors=errors+1; end
        a=0;b=1;#10; if(y!==1'b0) begin $display("FAIL a=0 b=1 exp 0 got %b",y); errors=errors+1; end
        a=1;b=0;#10; if(y!==1'b0) begin $display("FAIL a=1 b=0 exp 0 got %b",y); errors=errors+1; end
        a=1;b=1;#10; if(y!==1'b0) begin $display("FAIL a=1 b=1 exp 0 got %b",y); errors=errors+1; end
        if (errors==0) $display("ALL TESTS PASSED");
        else $display("TESTS FAILED: %0d error(s)",errors);
        $finish;
    end
endmodule
`,
};

const xorGate: Problem = {
  id: "xor-gate", slug: "xor-gate", title: "XOR Gate",
  difficulty: "beginner", category: "combinational",
  tags: ["gates", "combinational"],
  learningLevel: "Verilog Beginner", moduleId: "mod_logic_gates", orderIndex: 8,
  xpReward: 25, waveformRequired: false, expectedOutputMode: "stdout_compare",
  statement: `## XOR Gate

Implement a 2-input XOR gate. Output is high when inputs are **different** — "one or the other, not both."

**Truth Table**

| a | b | y |
|---|---|---|
| 0 | 0 | 0 |
| 0 | 1 | 1 |
| 1 | 0 | 1 |
| 1 | 1 | 0 |

**Notes** — XOR is the foundation of parity generators, adders, and cryptographic operations.`,
  constraints: ["Use the ^ operator."],
  examples: [{ input: "a=0, b=1", output: "y=1" }, { input: "a=1, b=1", output: "y=0" }],
  hints: [{ tier: 1, content: "The XOR operator in Verilog is `^`." }],
  publicTestcases: [], hiddenTestcases: [],
  starterCode: `\`timescale 1ns / 1ps

module xor_gate (
    input  wire a,
    input  wire b,
    output wire y
);

    // TODO: assign y = ...;

endmodule
`,
  publicTestbench: `\`timescale 1ns / 1ps
module tb_xor_gate;
    reg a,b; wire y;
    xor_gate dut (.a(a),.b(b),.y(y));
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_xor_gate); end
    initial begin
        $display("=== XOR Gate Test ===");
        a=0;b=0;#10; $display("a=%b b=%b => y=%b (expect 0)",a,b,y);
        a=0;b=1;#10; $display("a=%b b=%b => y=%b (expect 1)",a,b,y);
        a=1;b=0;#10; $display("a=%b b=%b => y=%b (expect 1)",a,b,y);
        a=1;b=1;#10; $display("a=%b b=%b => y=%b (expect 0)",a,b,y);
        $finish;
    end
endmodule
`,
  hiddenTestbench: `\`timescale 1ns / 1ps
module tb_xor_gate_hidden;
    reg a,b; wire y;
    integer errors;
    xor_gate dut (.a(a),.b(b),.y(y));
    initial begin
        errors = 0;
        a=0;b=0;#10; if(y!==1'b0) begin $display("FAIL a=0 b=0 exp 0 got %b",y); errors=errors+1; end
        a=0;b=1;#10; if(y!==1'b1) begin $display("FAIL a=0 b=1 exp 1 got %b",y); errors=errors+1; end
        a=1;b=0;#10; if(y!==1'b1) begin $display("FAIL a=1 b=0 exp 1 got %b",y); errors=errors+1; end
        a=1;b=1;#10; if(y!==1'b0) begin $display("FAIL a=1 b=1 exp 0 got %b",y); errors=errors+1; end
        if (errors==0) $display("ALL TESTS PASSED");
        else $display("TESTS FAILED: %0d error(s)",errors);
        $finish;
    end
endmodule
`,
};

const xnorGate: Problem = {
  id: "xnor-gate", slug: "xnor-gate", title: "XNOR Gate",
  difficulty: "beginner", category: "combinational",
  tags: ["gates", "combinational"],
  learningLevel: "Verilog Beginner", moduleId: "mod_logic_gates", orderIndex: 9,
  xpReward: 25, waveformRequired: false, expectedOutputMode: "stdout_compare",
  statement: `## XNOR Gate

Implement a 2-input XNOR gate. Output is high when inputs are **equal** — this is the equivalence gate.

**Truth Table**

| a | b | y |
|---|---|---|
| 0 | 0 | 1 |
| 0 | 1 | 0 |
| 1 | 0 | 0 |
| 1 | 1 | 1 |`,
  constraints: ["Use ~(a ^ b) or (a ~^ b)."],
  examples: [{ input: "a=1, b=1", output: "y=1" }, { input: "a=0, b=1", output: "y=0" }],
  hints: [{ tier: 1, content: "XNOR is the complement of XOR: `~(a ^ b)` or use `~^` operator." }],
  publicTestcases: [], hiddenTestcases: [],
  starterCode: `\`timescale 1ns / 1ps

module xnor_gate (
    input  wire a,
    input  wire b,
    output wire y
);

    // TODO: assign y = ...;

endmodule
`,
  publicTestbench: `\`timescale 1ns / 1ps
module tb_xnor_gate;
    reg a,b; wire y;
    xnor_gate dut (.a(a),.b(b),.y(y));
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_xnor_gate); end
    initial begin
        $display("=== XNOR Gate Test ===");
        a=0;b=0;#10; $display("a=%b b=%b => y=%b (expect 1)",a,b,y);
        a=0;b=1;#10; $display("a=%b b=%b => y=%b (expect 0)",a,b,y);
        a=1;b=0;#10; $display("a=%b b=%b => y=%b (expect 0)",a,b,y);
        a=1;b=1;#10; $display("a=%b b=%b => y=%b (expect 1)",a,b,y);
        $finish;
    end
endmodule
`,
  hiddenTestbench: `\`timescale 1ns / 1ps
module tb_xnor_gate_hidden;
    reg a,b; wire y;
    integer errors;
    xnor_gate dut (.a(a),.b(b),.y(y));
    initial begin
        errors = 0;
        a=0;b=0;#10; if(y!==1'b1) begin $display("FAIL a=0 b=0 exp 1 got %b",y); errors=errors+1; end
        a=0;b=1;#10; if(y!==1'b0) begin $display("FAIL a=0 b=1 exp 0 got %b",y); errors=errors+1; end
        a=1;b=0;#10; if(y!==1'b0) begin $display("FAIL a=1 b=0 exp 0 got %b",y); errors=errors+1; end
        a=1;b=1;#10; if(y!==1'b1) begin $display("FAIL a=1 b=1 exp 1 got %b",y); errors=errors+1; end
        if (errors==0) $display("ALL TESTS PASSED");
        else $display("TESTS FAILED: %0d error(s)",errors);
        $finish;
    end
endmodule
`,
};

// ─────────────────────────────────────────────────────────────────────────────
// M02 — Vectors: Buses & Bit Manipulation
// ─────────────────────────────────────────────────────────────────────────────

const eightBitAnd: Problem = {
  id: "8bit-bitwise-and", slug: "8bit-bitwise-and", title: "8-bit Bitwise AND",
  difficulty: "beginner", category: "combinational",
  tags: ["vectors", "bitwise", "assign"],
  learningLevel: "Verilog Beginner", moduleId: "mod_combinational", orderIndex: 11,
  xpReward: 40, waveformRequired: false, expectedOutputMode: "stdout_compare",
  statement: `## 8-bit Bitwise AND

Two 8-bit inputs \`a[7:0]\` and \`b[7:0]\`. Output \`y[7:0] = a & b\`.

Vector operators work **element-wise** — a single \`&\` operates across all 8 bit-pairs simultaneously.

**Interface**

| Port     | Direction | Width | Description   |
|----------|-----------|-------|---------------|
| \`a[7:0]\` | input   | 8     | First operand |
| \`b[7:0]\` | input   | 8     | Second operand|
| \`y[7:0]\` | output  | 8     | Bitwise AND   |

**Examples**
- \`a=8'hFF, b=8'h0F → y=8'h0F\`
- \`a=8'hAA, b=8'h55 → y=8'h00\``,
  constraints: ["One assign statement. No loops required."],
  examples: [{ input: "a=8'hFF, b=8'h0F", output: "y=8'h0F" }, { input: "a=8'hAA, b=8'h55", output: "y=8'h00" }],
  hints: [{ tier: 1, content: "The same `&` operator works on vectors: `assign y = a & b;`" }],
  publicTestcases: [], hiddenTestcases: [],
  starterCode: `\`timescale 1ns / 1ps

module bitwise_and_8 (
    input  wire [7:0] a,
    input  wire [7:0] b,
    output wire [7:0] y
);

    // TODO: assign y = ...;

endmodule
`,
  publicTestbench: `\`timescale 1ns / 1ps
module tb_bitwise_and_8;
    reg [7:0] a,b; wire [7:0] y;
    bitwise_and_8 dut (.a(a),.b(b),.y(y));
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_bitwise_and_8); end
    initial begin
        $display("=== 8-bit AND Test ===");
        a=8'hFF; b=8'h0F; #10; $display("a=%h b=%h => y=%h (expect 0f)",a,b,y);
        a=8'hAA; b=8'h55; #10; $display("a=%h b=%h => y=%h (expect 00)",a,b,y);
        a=8'hA5; b=8'hA5; #10; $display("a=%h b=%h => y=%h (expect a5)",a,b,y);
        $finish;
    end
endmodule
`,
  hiddenTestbench: `\`timescale 1ns / 1ps
module tb_bitwise_and_8_hidden;
    reg [7:0] a,b; wire [7:0] y;
    integer errors;
    integer i;
    bitwise_and_8 dut (.a(a),.b(b),.y(y));
    initial begin
        errors = 0;
        a=8'hFF;b=8'h0F;#5; if(y!==8'h0F) begin $display("FAIL FF&0F exp 0F got %h",y); errors=errors+1; end
        a=8'hAA;b=8'h55;#5; if(y!==8'h00) begin $display("FAIL AA&55 exp 00 got %h",y); errors=errors+1; end
        a=8'hA5;b=8'hA5;#5; if(y!==8'hA5) begin $display("FAIL A5&A5 exp A5 got %h",y); errors=errors+1; end
        a=8'h00;b=8'hFF;#5; if(y!==8'h00) begin $display("FAIL 00&FF exp 00 got %h",y); errors=errors+1; end
        for (i=0;i<8;i=i+1) begin
            a=8'h01<<i; b=8'hFF; #5;
            if (y!==a) begin $display("FAIL bit %0d isolation got %h",i,y); errors=errors+1; end
        end
        if (errors==0) $display("ALL TESTS PASSED");
        else $display("TESTS FAILED: %0d error(s)",errors);
        $finish;
    end
endmodule
`,
};

const bitSelectPartSelect: Problem = {
  id: "bit-select-part-select", slug: "bit-select-part-select", title: "Bit-Select & Part-Select",
  difficulty: "beginner", category: "combinational",
  tags: ["vectors", "part-select", "assign"],
  learningLevel: "Verilog Beginner", moduleId: "mod_combinational", orderIndex: 12,
  xpReward: 40, waveformRequired: false, expectedOutputMode: "stdout_compare",
  statement: `## Bit-Select & Part-Select

Input: 8-bit \`data[7:0]\`. Output: upper nibble \`hi[3:0] = data[7:4]\` and lower nibble \`lo[3:0] = data[3:0]\`.

**Notes**
- Part-select syntax: \`data[7:4]\` extracts bits 7 down to 4.
- Do **not** use arithmetic — slice notation only.

**Example:** \`data=8'hA5 → hi=4'hA, lo=4'h5\``,
  constraints: ["Use slice notation only — no arithmetic or shifts."],
  examples: [{ input: "data=8'hA5", output: "hi=4'hA, lo=4'h5" }],
  hints: [{ tier: 1, content: "`assign hi = data[7:4]; assign lo = data[3:0];`" }],
  publicTestcases: [], hiddenTestcases: [],
  starterCode: `\`timescale 1ns / 1ps

module nibble_split (
    input  wire [7:0] data,
    output wire [3:0] hi,
    output wire [3:0] lo
);

    // TODO: extract upper and lower nibbles

endmodule
`,
  publicTestbench: `\`timescale 1ns / 1ps
module tb_nibble_split;
    reg [7:0] data; wire [3:0] hi,lo;
    nibble_split dut (.data(data),.hi(hi),.lo(lo));
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_nibble_split); end
    initial begin
        $display("=== Part-Select Test ===");
        data=8'hA5;#10; $display("data=%h => hi=%h lo=%h (expect A 5)",data,hi,lo);
        data=8'h12;#10; $display("data=%h => hi=%h lo=%h (expect 1 2)",data,hi,lo);
        $finish;
    end
endmodule
`,
  hiddenTestbench: `\`timescale 1ns / 1ps
module tb_nibble_split_hidden;
    reg [7:0] data; wire [3:0] hi,lo;
    integer errors;
    nibble_split dut (.data(data),.hi(hi),.lo(lo));
    initial begin
        errors = 0;
        data=8'hA5;#5; if(hi!==4'hA||lo!==4'h5) begin $display("FAIL A5 exp A,5 got %h,%h",hi,lo); errors=errors+1; end
        data=8'h12;#5; if(hi!==4'h1||lo!==4'h2) begin $display("FAIL 12 exp 1,2 got %h,%h",hi,lo); errors=errors+1; end
        data=8'hFF;#5; if(hi!==4'hF||lo!==4'hF) begin $display("FAIL FF exp F,F got %h,%h",hi,lo); errors=errors+1; end
        data=8'h00;#5; if(hi!==4'h0||lo!==4'h0) begin $display("FAIL 00 exp 0,0 got %h,%h",hi,lo); errors=errors+1; end
        data=8'h5A;#5; if(hi!==4'h5||lo!==4'hA) begin $display("FAIL 5A exp 5,A got %h,%h",hi,lo); errors=errors+1; end
        if (errors==0) $display("ALL TESTS PASSED");
        else $display("TESTS FAILED: %0d error(s)",errors);
        $finish;
    end
endmodule
`,
};

const byteSwap: Problem = {
  id: "byte-swap", slug: "byte-swap", title: "Byte Swap (Endian Reversal)",
  difficulty: "beginner", category: "combinational",
  tags: ["vectors", "concatenation", "interview"],
  learningLevel: "Verilog Beginner", moduleId: "mod_combinational", orderIndex: 13,
  xpReward: 50, waveformRequired: false, expectedOutputMode: "stdout_compare",
  statement: `## Byte Swap (Endian Reversal)

Input: 32-bit \`in[31:0]\` representing four bytes. Output: \`out[31:0]\` with bytes reversed.

\`\`\`
out = {in[7:0], in[15:8], in[23:16], in[31:24]}
\`\`\`

**Why this matters:** Big-endian systems store the most-significant byte first; little-endian store it last. When data crosses a network or bus boundary, byte-swapping converts between the two representations.

**Example:** \`in=32'h12345678 → out=32'h78563412\``,
  constraints: ["Use concatenation {} — no arithmetic operators."],
  examples: [{ input: "in=32'h12345678", output: "out=32'h78563412" }],
  hints: [{ tier: 1, content: "Concatenation: `assign out = {in[7:0], in[15:8], in[23:16], in[31:24]};`" }],
  publicTestcases: [], hiddenTestcases: [],
  starterCode: `\`timescale 1ns / 1ps

module byte_swap (
    input  wire [31:0] in,
    output wire [31:0] out
);

    // TODO: reverse the byte order using concatenation {}

endmodule
`,
  publicTestbench: `\`timescale 1ns / 1ps
module tb_byte_swap;
    reg [31:0] in; wire [31:0] out;
    byte_swap dut (.in(in),.out(out));
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_byte_swap); end
    initial begin
        $display("=== Byte Swap Test ===");
        in=32'h12345678;#10; $display("in=%h => out=%h (expect 78563412)",in,out);
        in=32'hAABBCCDD;#10; $display("in=%h => out=%h (expect DDCCBBAA)",in,out);
        $finish;
    end
endmodule
`,
  hiddenTestbench: `\`timescale 1ns / 1ps
module tb_byte_swap_hidden;
    reg [31:0] in; wire [31:0] out;
    integer errors;
    byte_swap dut (.in(in),.out(out));
    initial begin
        errors = 0;
        in=32'h12345678;#5; if(out!==32'h78563412) begin $display("FAIL 12345678 exp 78563412 got %h",out); errors=errors+1; end
        in=32'hAABBCCDD;#5; if(out!==32'hDDCCBBAA) begin $display("FAIL AABBCCDD exp DDCCBBAA got %h",out); errors=errors+1; end
        in=32'h00000000;#5; if(out!==32'h00000000) begin $display("FAIL 00000000 exp 00000000 got %h",out); errors=errors+1; end
        in=32'hFFFFFFFF;#5; if(out!==32'hFFFFFFFF) begin $display("FAIL FFFFFFFF exp FFFFFFFF got %h",out); errors=errors+1; end
        in=32'h01020304;#5; if(out!==32'h04030201) begin $display("FAIL 01020304 exp 04030201 got %h",out); errors=errors+1; end
        if (errors==0) $display("ALL TESTS PASSED");
        else $display("TESTS FAILED: %0d error(s)",errors);
        $finish;
    end
endmodule
`,
};

const signExtension: Problem = {
  id: "sign-extension", slug: "sign-extension", title: "Sign Extension",
  difficulty: "beginner", category: "combinational",
  tags: ["vectors", "replication", "interview"],
  learningLevel: "Verilog Beginner", moduleId: "mod_combinational", orderIndex: 14,
  xpReward: 50, waveformRequired: false, expectedOutputMode: "stdout_compare",
  statement: `## Sign Extension

Input: 8-bit signed number \`in[7:0]\`. Output: 16-bit sign-extended \`out[15:0]\`.

The upper 8 bits must replicate the MSB (sign bit):
\`\`\`
out = {{8{in[7]}}, in[7:0]}
\`\`\`

**Why this matters:** Every processor sign-extends when promoting 8-bit values to 16-bit or 32-bit arithmetic. Without sign extension, negative numbers become positive.

**Examples:**
- \`in=8'h7F (+127) → out=16'h007F\`
- \`in=8'hFF (-1) → out=16'hFFFF\`
- \`in=8'h80 (-128) → out=16'hFF80\``,
  constraints: ["Use the replication operator {N{bit}} for the upper byte."],
  examples: [{ input: "in=8'h7F", output: "out=16'h007F" }, { input: "in=8'hFF", output: "out=16'hFFFF" }],
  hints: [
    { tier: 1, content: "The replication syntax is `{8{in[7]}}` — replicate `in[7]` eight times." },
    { tier: 2, content: "`assign out = {{8{in[7]}}, in[7:0]};`" },
  ],
  publicTestcases: [], hiddenTestcases: [],
  starterCode: `\`timescale 1ns / 1ps

module sign_extend (
    input  wire [7:0]  in,
    output wire [15:0] out
);

    // TODO: sign-extend in[7:0] to 16 bits
    // The MSB (in[7]) fills the upper 8 bits

endmodule
`,
  publicTestbench: `\`timescale 1ns / 1ps
module tb_sign_extend;
    reg [7:0] in; wire [15:0] out;
    sign_extend dut (.in(in),.out(out));
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_sign_extend); end
    initial begin
        $display("=== Sign Extension Test ===");
        in=8'h7F;#10; $display("in=%h => out=%h (expect 007F)",in,out);
        in=8'hFF;#10; $display("in=%h => out=%h (expect FFFF)",in,out);
        in=8'h80;#10; $display("in=%h => out=%h (expect FF80)",in,out);
        in=8'h00;#10; $display("in=%h => out=%h (expect 0000)",in,out);
        $finish;
    end
endmodule
`,
  hiddenTestbench: `\`timescale 1ns / 1ps
module tb_sign_extend_hidden;
    reg [7:0] in; wire [15:0] out;
    integer errors;
    sign_extend dut (.in(in),.out(out));
    initial begin
        errors = 0;
        in=8'h7F;#5; if(out!==16'h007F) begin $display("FAIL 7F exp 007F got %h",out); errors=errors+1; end
        in=8'hFF;#5; if(out!==16'hFFFF) begin $display("FAIL FF exp FFFF got %h",out); errors=errors+1; end
        in=8'h80;#5; if(out!==16'hFF80) begin $display("FAIL 80 exp FF80 got %h",out); errors=errors+1; end
        in=8'h00;#5; if(out!==16'h0000) begin $display("FAIL 00 exp 0000 got %h",out); errors=errors+1; end
        in=8'h01;#5; if(out!==16'h0001) begin $display("FAIL 01 exp 0001 got %h",out); errors=errors+1; end
        in=8'h81;#5; if(out!==16'hFF81) begin $display("FAIL 81 exp FF81 got %h",out); errors=errors+1; end
        if (errors==0) $display("ALL TESTS PASSED");
        else $display("TESTS FAILED: %0d error(s)",errors);
        $finish;
    end
endmodule
`,
};

// ─────────────────────────────────────────────────────────────────────────────
// M03 — Modules & Hierarchy
// ─────────────────────────────────────────────────────────────────────────────

// Half Adder — existing, preserved exactly, moved to mod_combinational
const halfAdder: Problem = {
  id: "half-adder", slug: "half-adder", title: "Half Adder",
  difficulty: "beginner", category: "combinational",
  tags: ["combinational", "arithmetic"],
  learningLevel: "Verilog Beginner", moduleId: "mod_combinational", orderIndex: 17,
  xpReward: 75, waveformRequired: false, expectedOutputMode: "stdout_compare",
  statement: `## Half Adder

Implement a half adder that adds two 1-bit numbers.

**Interface**

| Port     | Direction | Width | Description     |
|----------|-----------|-------|-----------------|
| \`a\`    | input     | 1     | First operand   |
| \`b\`    | input     | 1     | Second operand  |
| \`sum\`  | output    | 1     | Sum bit (LSB)   |
| \`carry\`| output    | 1     | Carry out (MSB) |

**Truth Table**

| a | b | carry | sum |
|---|---|-------|-----|
| 0 | 0 |   0   |  0  |
| 0 | 1 |   0   |  1  |
| 1 | 0 |   0   |  1  |
| 1 | 1 |   1   |  0  |

**Notes**
- \`sum = a XOR b\`
- \`carry = a AND b\``,
  constraints: ["Use only assign statements.", "Do not use always blocks."],
  examples: [{ input: "a=1, b=1", output: "sum=0, carry=1" }, { input: "a=0, b=1", output: "sum=1, carry=0" }],
  hints: [
    { tier: 1, content: "XOR gives the sum bit: `^` operator." },
    { tier: 2, content: "AND gives the carry bit: `&` operator." },
  ],
  publicTestcases: [], hiddenTestcases: [],
  starterCode: `\`timescale 1ns / 1ps

module half_adder (
    input  wire a,
    input  wire b,
    output wire sum,
    output wire carry
);

    // TODO: Implement the half adder
    // assign sum   = ...;
    // assign carry = ...;

endmodule
`,
  publicTestbench: `\`timescale 1ns / 1ps
module tb_half_adder;
    reg a,b; wire sum,carry;
    half_adder dut (.a(a),.b(b),.sum(sum),.carry(carry));
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_half_adder); end
    initial begin
        $display("=== Half Adder Test ===");
        a=0;b=0;#10; $display("a=%b b=%b => carry=%b sum=%b (expect 0 0)",a,b,carry,sum);
        a=0;b=1;#10; $display("a=%b b=%b => carry=%b sum=%b (expect 0 1)",a,b,carry,sum);
        a=1;b=0;#10; $display("a=%b b=%b => carry=%b sum=%b (expect 0 1)",a,b,carry,sum);
        a=1;b=1;#10; $display("a=%b b=%b => carry=%b sum=%b (expect 1 0)",a,b,carry,sum);
        $finish;
    end
endmodule
`,
  hiddenTestbench: `\`timescale 1ns / 1ps
module tb_half_adder_hidden;
    reg a,b; wire sum,carry;
    integer errors;
    half_adder dut (.a(a),.b(b),.sum(sum),.carry(carry));
    initial begin
        errors = 0;
        a=0;b=0;#10; if(sum!==1'b0||carry!==1'b0) begin $display("FAIL 0+0 exp s=0 c=0 got s=%b c=%b",sum,carry); errors=errors+1; end
        a=0;b=1;#10; if(sum!==1'b1||carry!==1'b0) begin $display("FAIL 0+1 exp s=1 c=0 got s=%b c=%b",sum,carry); errors=errors+1; end
        a=1;b=0;#10; if(sum!==1'b1||carry!==1'b0) begin $display("FAIL 1+0 exp s=1 c=0 got s=%b c=%b",sum,carry); errors=errors+1; end
        a=1;b=1;#10; if(sum!==1'b0||carry!==1'b1) begin $display("FAIL 1+1 exp s=0 c=1 got s=%b c=%b",sum,carry); errors=errors+1; end
        if (errors==0) $display("ALL TESTS PASSED");
        else $display("TESTS FAILED: %0d error(s)",errors);
        $finish;
    end
endmodule
`,
};

// ─────────────────────────────────────────────────────────────────────────────
// M04 — Always Blocks: Behavioral RTL
// ─────────────────────────────────────────────────────────────────────────────

const mux2to1: Problem = {
  id: "mux-2to1", slug: "mux-2to1", title: "2-to-1 Multiplexer",
  difficulty: "beginner", category: "combinational",
  tags: ["always", "mux", "combinational"],
  learningLevel: "Verilog Beginner", moduleId: "mod_combinational", orderIndex: 21,
  xpReward: 50, waveformRequired: false, expectedOutputMode: "stdout_compare",
  statement: `## 2-to-1 Multiplexer

Implement a 2-to-1 multiplexer: two data inputs \`d0\`, \`d1\`, one select \`s\`, one output \`y\`.

- When \`s=0\`: \`y = d0\`
- When \`s=1\`: \`y = d1\`

Implement using an \`always @(*)\` block with \`if-else\`.

**Notes** — The \`always @(*)\` sensitivity list automatically includes every signal read inside the block. This is the preferred style for combinational logic in Verilog-2001.`,
  constraints: [
    "Use always @(*) with if-else.",
    "Declare y as reg.",
    "No latches — both branches must assign y.",
  ],
  examples: [{ input: "s=0, d0=1, d1=0", output: "y=1" }, { input: "s=1, d0=1, d1=0", output: "y=0" }],
  hints: [
    { tier: 1, content: "Use `always @(*)` with `if (s) y = d1; else y = d0;`" },
    { tier: 2, content: "Declare `output reg y` since it's assigned inside an always block." },
  ],
  publicTestcases: [], hiddenTestcases: [],
  starterCode: `\`timescale 1ns / 1ps

module mux2to1 (
    input  wire d0,
    input  wire d1,
    input  wire s,
    output reg  y
);

    // TODO: implement using always @(*)
    always @(*) begin
        // if (s) y = d1;
        // else   y = d0;
    end

endmodule
`,
  publicTestbench: `\`timescale 1ns / 1ps
module tb_mux2to1;
    reg d0,d1,s; wire y;
    mux2to1 dut (.d0(d0),.d1(d1),.s(s),.y(y));
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_mux2to1); end
    initial begin
        $display("=== 2-to-1 MUX Test ===");
        d0=1;d1=0;s=0;#10; $display("s=%b d0=%b d1=%b => y=%b (expect 1)",s,d0,d1,y);
        d0=1;d1=0;s=1;#10; $display("s=%b d0=%b d1=%b => y=%b (expect 0)",s,d0,d1,y);
        d0=0;d1=1;s=0;#10; $display("s=%b d0=%b d1=%b => y=%b (expect 0)",s,d0,d1,y);
        d0=0;d1=1;s=1;#10; $display("s=%b d0=%b d1=%b => y=%b (expect 1)",s,d0,d1,y);
        $finish;
    end
endmodule
`,
  hiddenTestbench: `\`timescale 1ns / 1ps
module tb_mux2to1_hidden;
    reg d0,d1,s; wire y;
    integer errors;
    mux2to1 dut (.d0(d0),.d1(d1),.s(s),.y(y));
    initial begin
        errors = 0;
        d0=1;d1=0;s=0;#5; if(y!==1'b1) begin $display("FAIL s=0 d0=1 exp 1 got %b",y); errors=errors+1; end
        d0=1;d1=0;s=1;#5; if(y!==1'b0) begin $display("FAIL s=1 d1=0 exp 0 got %b",y); errors=errors+1; end
        d0=0;d1=1;s=0;#5; if(y!==1'b0) begin $display("FAIL s=0 d0=0 exp 0 got %b",y); errors=errors+1; end
        d0=0;d1=1;s=1;#5; if(y!==1'b1) begin $display("FAIL s=1 d1=1 exp 1 got %b",y); errors=errors+1; end
        d0=1;d1=1;s=0;#5; if(y!==1'b1) begin $display("FAIL s=0 d0=1 d1=1 exp 1 got %b",y); errors=errors+1; end
        d0=0;d1=0;s=1;#5; if(y!==1'b0) begin $display("FAIL s=1 d0=0 d1=0 exp 0 got %b",y); errors=errors+1; end
        if (errors==0) $display("ALL TESTS PASSED");
        else $display("TESTS FAILED: %0d error(s)",errors);
        $finish;
    end
endmodule
`,
};

const priorityEncoder: Problem = {
  id: "priority-encoder", slug: "priority-encoder", title: "Priority Encoder (4-to-2)",
  difficulty: "beginner", category: "combinational",
  tags: ["encoder", "casez", "interview", "always"],
  learningLevel: "Verilog Beginner", moduleId: "mod_combinational", orderIndex: 31,
  xpReward: 75, waveformRequired: false, expectedOutputMode: "stdout_compare",
  statement: `## Priority Encoder (4-to-2)

Input: 4-bit \`req[3:0]\`. Output: 2-bit \`grant[1:0]\` encoding the index of the highest-priority active bit (MSB = highest priority). Output \`valid\` is high when any request is active.

**Examples**
- \`req=4'b1010 → grant=2, valid=1\` (bit 3 is highest active)
- \`req=4'b0000 → grant=0, valid=0\`
- \`req=4'b1111 → grant=3, valid=1\`

**Notes** — Use \`casez\` with \`?\` (don't-care) for clean priority matching. Always include a \`default\` branch to prevent latches.`,
  constraints: [
    "Use casez inside always @(*).",
    "Include a default branch.",
    "req[3] has highest priority.",
  ],
  examples: [
    { input: "req=4'b1010", output: "grant=2, valid=1" },
    { input: "req=4'b0001", output: "grant=0, valid=1" },
  ],
  hints: [
    { tier: 1, content: "Use `casez(req)` with patterns like `4'b1???` for req[3]." },
    { tier: 2, content: "Default branch: `grant=0; valid=0;` to avoid latches when req=0." },
  ],
  publicTestcases: [], hiddenTestcases: [],
  starterCode: `\`timescale 1ns / 1ps

module priority_enc (
    input  wire [3:0] req,
    output reg  [1:0] grant,
    output reg        valid
);

    always @(*) begin
        // TODO: implement priority encoder using casez
        // casez (req)
        //   4'b1???: begin grant = 2'd3; valid = 1; end
        //   ...
        //   default: begin grant = 2'd0; valid = 0; end
        // endcase
        grant = 0;
        valid = 0;
    end

endmodule
`,
  publicTestbench: `\`timescale 1ns / 1ps
module tb_priority_enc;
    reg [3:0] req; wire [1:0] grant; wire valid;
    priority_enc dut (.req(req),.grant(grant),.valid(valid));
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_priority_enc); end
    initial begin
        $display("=== Priority Encoder Test ===");
        req=4'b1010;#10; $display("req=%b => grant=%0d valid=%b (expect 3,1)",req,grant,valid);
        req=4'b0000;#10; $display("req=%b => grant=%0d valid=%b (expect 0,0)",req,grant,valid);
        req=4'b0001;#10; $display("req=%b => grant=%0d valid=%b (expect 0,1)",req,grant,valid);
        req=4'b1111;#10; $display("req=%b => grant=%0d valid=%b (expect 3,1)",req,grant,valid);
        $finish;
    end
endmodule
`,
  hiddenTestbench: `\`timescale 1ns / 1ps
module tb_priority_enc_hidden;
    reg [3:0] req; wire [1:0] grant; wire valid;
    integer errors;
    priority_enc dut (.req(req),.grant(grant),.valid(valid));
    initial begin
        errors = 0;
        req=4'b0000;#5; if(valid!==0) begin $display("FAIL 0000 exp valid=0 got %b",valid); errors=errors+1; end
        req=4'b0001;#5; if(grant!==0||valid!==1) begin $display("FAIL 0001 exp g=0,v=1 got g=%0d,v=%b",grant,valid); errors=errors+1; end
        req=4'b0010;#5; if(grant!==1||valid!==1) begin $display("FAIL 0010 exp g=1,v=1 got g=%0d,v=%b",grant,valid); errors=errors+1; end
        req=4'b0100;#5; if(grant!==2||valid!==1) begin $display("FAIL 0100 exp g=2,v=1 got g=%0d,v=%b",grant,valid); errors=errors+1; end
        req=4'b1000;#5; if(grant!==3||valid!==1) begin $display("FAIL 1000 exp g=3,v=1 got g=%0d,v=%b",grant,valid); errors=errors+1; end
        req=4'b1010;#5; if(grant!==3||valid!==1) begin $display("FAIL 1010 exp g=3,v=1 got g=%0d,v=%b",grant,valid); errors=errors+1; end
        req=4'b1111;#5; if(grant!==3||valid!==1) begin $display("FAIL 1111 exp g=3,v=1 got g=%0d,v=%b",grant,valid); errors=errors+1; end
        req=4'b0011;#5; if(grant!==1||valid!==1) begin $display("FAIL 0011 exp g=1,v=1 got g=%0d,v=%b",grant,valid); errors=errors+1; end
        if (errors==0) $display("ALL TESTS PASSED");
        else $display("TESTS FAILED: %0d error(s)",errors);
        $finish;
    end
endmodule
`,
};

// ─────────────────────────────────────────────────────────────────────────────
// M05 — Combinational Circuits: Real Designs
// ─────────────────────────────────────────────────────────────────────────────

const magnitudeComparator: Problem = {
  id: "magnitude-comparator", slug: "magnitude-comparator", title: "8-bit Magnitude Comparator",
  difficulty: "beginner", category: "combinational",
  tags: ["comparator", "assign", "interview"],
  learningLevel: "Verilog Beginner", moduleId: "mod_combinational", orderIndex: 36,
  xpReward: 60, waveformRequired: false, expectedOutputMode: "stdout_compare",
  statement: `## 8-bit Magnitude Comparator

Two 8-bit unsigned inputs \`a[7:0]\` and \`b[7:0]\`. Three 1-bit outputs:
- \`a_gt_b\` — high when a > b
- \`a_eq_b\` — high when a = b
- \`a_lt_b\` — high when a < b

Exactly **one** output is high at any time.

Implement using \`assign\` statements with Verilog comparison operators (\`>\`, \`==\`, \`<\`).`,
  constraints: ["Use three assign statements with comparison operators.", "Outputs must be mutually exclusive."],
  examples: [
    { input: "a=8'd10, b=8'd5", output: "a_gt_b=1, a_eq_b=0, a_lt_b=0" },
    { input: "a=8'd5, b=8'd5", output: "a_gt_b=0, a_eq_b=1, a_lt_b=0" },
  ],
  hints: [
    { tier: 1, content: "Verilog comparison operators: `>`, `<`, `==`. They return 1-bit results." },
  ],
  publicTestcases: [], hiddenTestcases: [],
  starterCode: `\`timescale 1ns / 1ps

module mag_comparator (
    input  wire [7:0] a,
    input  wire [7:0] b,
    output wire       a_gt_b,
    output wire       a_eq_b,
    output wire       a_lt_b
);

    // TODO: three assign statements

endmodule
`,
  publicTestbench: `\`timescale 1ns / 1ps
module tb_mag_comparator;
    reg [7:0] a,b; wire a_gt_b,a_eq_b,a_lt_b;
    mag_comparator dut (.a(a),.b(b),.a_gt_b(a_gt_b),.a_eq_b(a_eq_b),.a_lt_b(a_lt_b));
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_mag_comparator); end
    initial begin
        $display("=== Comparator Test ===");
        a=10;b=5;  #10; $display("a=%0d b=%0d => gt=%b eq=%b lt=%b (expect 1 0 0)",a,b,a_gt_b,a_eq_b,a_lt_b);
        a=5; b=5;  #10; $display("a=%0d b=%0d => gt=%b eq=%b lt=%b (expect 0 1 0)",a,b,a_gt_b,a_eq_b,a_lt_b);
        a=0; b=255;#10; $display("a=%0d b=%0d => gt=%b eq=%b lt=%b (expect 0 0 1)",a,b,a_gt_b,a_eq_b,a_lt_b);
        $finish;
    end
endmodule
`,
  hiddenTestbench: `\`timescale 1ns / 1ps
module tb_mag_comparator_hidden;
    reg [7:0] a,b; wire a_gt_b,a_eq_b,a_lt_b;
    integer errors;
    mag_comparator dut (.a(a),.b(b),.a_gt_b(a_gt_b),.a_eq_b(a_eq_b),.a_lt_b(a_lt_b));
    initial begin
        errors = 0;
        a=10; b=5;  #5; if(a_gt_b!==1||a_eq_b!==0||a_lt_b!==0) begin $display("FAIL 10>5  got gt=%b eq=%b lt=%b",a_gt_b,a_eq_b,a_lt_b); errors=errors+1; end
        a=5;  b=5;  #5; if(a_gt_b!==0||a_eq_b!==1||a_lt_b!==0) begin $display("FAIL 5==5  got gt=%b eq=%b lt=%b",a_gt_b,a_eq_b,a_lt_b); errors=errors+1; end
        a=0;  b=255;#5; if(a_gt_b!==0||a_eq_b!==0||a_lt_b!==1) begin $display("FAIL 0<255 got gt=%b eq=%b lt=%b",a_gt_b,a_eq_b,a_lt_b); errors=errors+1; end
        a=255;b=0;  #5; if(a_gt_b!==1||a_eq_b!==0||a_lt_b!==0) begin $display("FAIL 255>0 got gt=%b eq=%b lt=%b",a_gt_b,a_eq_b,a_lt_b); errors=errors+1; end
        a=128;b=127;#5; if(a_gt_b!==1||a_eq_b!==0||a_lt_b!==0) begin $display("FAIL 128>127 got gt=%b eq=%b lt=%b",a_gt_b,a_eq_b,a_lt_b); errors=errors+1; end
        a=0;  b=0;  #5; if(a_gt_b!==0||a_eq_b!==1||a_lt_b!==0) begin $display("FAIL 0==0  got gt=%b eq=%b lt=%b",a_gt_b,a_eq_b,a_lt_b); errors=errors+1; end
        if (errors==0) $display("ALL TESTS PASSED");
        else $display("TESTS FAILED: %0d error(s)",errors);
        $finish;
    end
endmodule
`,
};

// D Flip-Flop — existing, preserved exactly
const dFlipFlop: Problem = {
  id: "d-flip-flop", slug: "d-flip-flop", title: "D Flip-Flop",
  difficulty: "beginner", category: "sequential",
  tags: ["sequential", "flip-flop", "registers"],
  learningLevel: "Verilog Beginner", moduleId: "mod_sequential_basics", orderIndex: 40,
  xpReward: 100, waveformRequired: true, expectedOutputMode: "stdout_compare",
  statement: `## D Flip-Flop

Implement a positive-edge triggered D flip-flop with synchronous reset.

**Interface**

| Port    | Direction | Width | Description                     |
|---------|-----------|-------|---------------------------------|
| \`clk\` | input     | 1     | Clock (positive edge triggered) |
| \`rst\` | input     | 1     | Synchronous active-high reset   |
| \`d\`   | input     | 1     | Data input                      |
| \`q\`   | output    | 1     | Data output                     |

**Behaviour**
- On every rising edge of \`clk\`:
  - If \`rst\` is high → \`q\` becomes 0
  - Otherwise → \`q\` captures \`d\`

**Notes**
- Use an \`always @(posedge clk)\` block.
- Declare \`q\` as \`reg\`.`,
  constraints: [
    "Must use posedge clock trigger.",
    "Reset must be synchronous (checked inside the clocked always block).",
    "Output q must be declared as reg.",
  ],
  examples: [{ input: "rst=1 then clk↑", output: "q=0" }, { input: "d=1, rst=0 then clk↑", output: "q=1" }],
  hints: [
    { tier: 1, content: "Use `always @(posedge clk)` — this triggers only on rising clock edges." },
    { tier: 2, content: "Check rst first inside the always block for synchronous reset." },
  ],
  publicTestcases: [], hiddenTestcases: [],
  starterCode: `\`timescale 1ns / 1ps

module d_flip_flop (
    input  wire clk,
    input  wire rst,
    input  wire d,
    output reg  q
);

    // TODO: Implement synchronous D flip-flop
    // always @(posedge clk) begin
    //     if (rst) q <= 0;
    //     else     q <= d;
    // end

endmodule
`,
  publicTestbench: `\`timescale 1ns / 1ps
module tb_d_flip_flop;
    reg clk,rst,d; wire q;
    d_flip_flop dut (.clk(clk),.rst(rst),.d(d),.q(q));
    initial clk = 0;
    always #5 clk = ~clk;
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_d_flip_flop); end
    initial begin
        $display("=== D Flip-Flop Test ===");
        rst=1;d=0; @(posedge clk);#1; $display("rst=1 d=0 => q=%b (expect 0)",q);
        rst=0;d=1; @(posedge clk);#1; $display("rst=0 d=1 => q=%b (expect 1)",q);
        d=0;       @(posedge clk);#1; $display("rst=0 d=0 => q=%b (expect 0)",q);
        d=1;       @(posedge clk);#1; $display("rst=0 d=1 => q=%b (expect 1)",q);
        rst=1;     @(posedge clk);#1; $display("rst=1 d=1 => q=%b (expect 0)",q);
        $display("Run complete."); $finish;
    end
endmodule
`,
  hiddenTestbench: `\`timescale 1ns / 1ps
module tb_d_flip_flop_hidden;
    reg clk,rst,d; wire q;
    integer errors;
    d_flip_flop dut (.clk(clk),.rst(rst),.d(d),.q(q));
    initial clk = 0;
    always #5 clk = ~clk;
    initial begin
        errors = 0;
        rst=1;d=1; @(posedge clk);#1;
        if(q!==1'b0) begin $display("FAIL reset: exp q=0 got %b",q); errors=errors+1; end
        rst=0;d=0; @(posedge clk);#1;
        if(q!==1'b0) begin $display("FAIL d=0: exp q=0 got %b",q); errors=errors+1; end
        d=1; @(posedge clk);#1;
        if(q!==1'b1) begin $display("FAIL d=1: exp q=1 got %b",q); errors=errors+1; end
        d=0;#3;
        if(q!==1'b1) begin $display("FAIL hold: q changed without clk got %b",q); errors=errors+1; end
        @(posedge clk);#1;
        if(q!==1'b0) begin $display("FAIL capture d=0: exp q=0 got %b",q); errors=errors+1; end
        d=1;rst=1; @(posedge clk);#1;
        if(q!==1'b0) begin $display("FAIL sync rst mid: exp q=0 got %b",q); errors=errors+1; end
        if (errors==0) $display("ALL TESTS PASSED");
        else $display("TESTS FAILED: %0d error(s)",errors);
        $finish;
    end
endmodule
`,
};

// ─────────────────────────────────────────────────────────────────────────────
// M01 (new) — The 7458 Chip
// ─────────────────────────────────────────────────────────────────────────────

const chip7458: Problem = {
  id: "chip-7458", slug: "chip-7458", title: "The 7458 Chip",
  difficulty: "beginner", category: "combinational",
  tags: ["combinational", "gates", "datasheet"],
  learningLevel: "Verilog Beginner", moduleId: "mod_logic_gates", orderIndex: 10,
  xpReward: 35, waveformRequired: false, expectedOutputMode: "stdout_compare",
  statement: `## The 7458 Chip

The 7458 is a real IC containing two AND-OR gate structures. Implement exactly:
- \`p1y = (p1a & p1b) | (p1c & p1d)\` — two 2-input ANDs feeding an OR
- \`p2y = (p2a & p2b) | (p2c & p2d & p2e)\` — 2-AND and 3-AND feeding an OR

All inputs and both outputs are explicit ports. This mirrors a real datasheet.

**Interface**

| Port | Direction | Description |
|------|-----------|-------------|
| \`p1a,p1b,p1c,p1d\` | input | Part 1 inputs |
| \`p2a,p2b,p2c,p2d,p2e\` | input | Part 2 inputs |
| \`p1y\` | output | Part 1 result |
| \`p2y\` | output | Part 2 result |`,
  constraints: ["Use two assign statements — one per output.", "No always blocks."],
  examples: [
    { input: "p1a=1,p1b=1,p1c=0,p1d=0", output: "p1y=1" },
    { input: "p2a=1,p2b=1,p2c=1,p2d=1,p2e=1", output: "p2y=1" },
  ],
  hints: [
    { tier: 1, content: "`assign p1y = (p1a & p1b) | (p1c & p1d);`" },
  ],
  publicTestcases: [], hiddenTestcases: [],
  starterCode: `\`timescale 1ns / 1ps

module chip_7458 (
    input  wire p1a, p1b, p1c, p1d,
    input  wire p2a, p2b, p2c, p2d, p2e,
    output wire p1y,
    output wire p2y
);

    // TODO: implement both gate structures with assign

endmodule
`,
  publicTestbench: `\`timescale 1ns / 1ps
module tb_chip_7458;
    reg p1a,p1b,p1c,p1d,p2a,p2b,p2c,p2d,p2e;
    wire p1y,p2y;
    chip_7458 dut (.p1a(p1a),.p1b(p1b),.p1c(p1c),.p1d(p1d),
                   .p2a(p2a),.p2b(p2b),.p2c(p2c),.p2d(p2d),.p2e(p2e),
                   .p1y(p1y),.p2y(p2y));
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_chip_7458); end
    initial begin
        $display("=== 7458 Chip Test ===");
        p1a=1;p1b=1;p1c=0;p1d=0; p2a=0;p2b=0;p2c=0;p2d=0;p2e=0; #10;
        $display("p1a&p1b=1, p1c&p1d=0 => p1y=%b (expect 1)", p1y);
        p1a=0;p1b=0;p1c=1;p1d=1; #10;
        $display("p1a&p1b=0, p1c&p1d=1 => p1y=%b (expect 1)", p1y);
        p2a=1;p2b=1;p2c=1;p2d=1;p2e=1; #10;
        $display("p2 all 1s => p2y=%b (expect 1)", p2y);
        p2a=1;p2b=0;p2c=1;p2d=1;p2e=1; #10;
        $display("p2a&p2b=0, p2c&p2d&p2e=1 => p2y=%b (expect 1)", p2y);
        $finish;
    end
endmodule
`,
  hiddenTestbench: `\`timescale 1ns / 1ps
module tb_chip_7458_hidden;
    reg p1a,p1b,p1c,p1d,p2a,p2b,p2c,p2d,p2e;
    wire p1y,p2y;
    integer errors;
    chip_7458 dut (.p1a(p1a),.p1b(p1b),.p1c(p1c),.p1d(p1d),
                   .p2a(p2a),.p2b(p2b),.p2c(p2c),.p2d(p2d),.p2e(p2e),
                   .p1y(p1y),.p2y(p2y));
    initial begin
        errors = 0;
        // p1y tests
        p1a=1;p1b=1;p1c=0;p1d=0;p2a=0;p2b=0;p2c=0;p2d=0;p2e=0;#5;
        if(p1y!==1'b1) begin $display("FAIL p1: 1&1|0&0 exp 1 got %b",p1y); errors=errors+1; end
        p1a=0;p1b=0;p1c=1;p1d=1;#5;
        if(p1y!==1'b1) begin $display("FAIL p1: 0&0|1&1 exp 1 got %b",p1y); errors=errors+1; end
        p1a=0;p1b=1;p1c=0;p1d=1;#5;
        if(p1y!==1'b0) begin $display("FAIL p1: 0&1|0&1 exp 0 got %b",p1y); errors=errors+1; end
        p1a=1;p1b=1;p1c=1;p1d=1;#5;
        if(p1y!==1'b1) begin $display("FAIL p1: all 1s exp 1 got %b",p1y); errors=errors+1; end
        // p2y tests
        p2a=1;p2b=1;p2c=0;p2d=0;p2e=0;#5;
        if(p2y!==1'b1) begin $display("FAIL p2: 1&1|... exp 1 got %b",p2y); errors=errors+1; end
        p2a=1;p2b=0;p2c=1;p2d=1;p2e=1;#5;
        if(p2y!==1'b1) begin $display("FAIL p2: 0|1&1&1 exp 1 got %b",p2y); errors=errors+1; end
        p2a=0;p2b=0;p2c=1;p2d=1;p2e=0;#5;
        if(p2y!==1'b0) begin $display("FAIL p2: 0|0 exp 0 got %b",p2y); errors=errors+1; end
        p2a=0;p2b=0;p2c=0;p2d=0;p2e=0;#5;
        if(p2y!==1'b0) begin $display("FAIL p2: all 0s exp 0 got %b",p2y); errors=errors+1; end
        if(errors==0) $display("ALL TESTS PASSED");
        else $display("TESTS FAILED: %0d error(s)",errors);
        $finish;
    end
endmodule
`,
};

// ─────────────────────────────────────────────────────────────────────────────
// M02 (new) — Even Parity Generator & Population Count
// ─────────────────────────────────────────────────────────────────────────────

const evenParityGenerator: Problem = {
  id: "even-parity-generator", slug: "even-parity-generator", title: "Even Parity Generator",
  difficulty: "beginner", category: "combinational",
  tags: ["reduction", "parity", "interview", "vectors"],
  learningLevel: "Verilog Beginner", moduleId: "mod_combinational", orderIndex: 15,
  xpReward: 45, waveformRequired: false, expectedOutputMode: "stdout_compare",
  statement: `## Even Parity Generator

Input: 8-bit \`data[7:0]\`. Output: 9-bit \`out[8:0]\` where:
- \`out[8]\` is the **even parity bit** — the XOR of all 8 data bits
- \`out[7:0] = data\`

The parity bit makes the total number of 1s in the 9-bit output **even**.

Use the **reduction XOR operator** \`^data\`.

**Examples**
- \`data=8'hFF (8 ones) → out[8]=0\` (already even)
- \`data=8'h01 (1 one) → out[8]=1\` (need parity to make even)
- \`data=8'h03 (2 ones) → out[8]=0\``,
  constraints: ["Use the reduction XOR operator ^data for the parity bit.", "Single assign statement."],
  examples: [
    { input: "data=8'hFF", output: "out=9'h0FF (parity=0)" },
    { input: "data=8'h01", output: "out=9'h101 (parity=1)" },
  ],
  hints: [
    { tier: 1, content: "Reduction XOR: `^data` XORs all bits together, giving even parity." },
    { tier: 2, content: "`assign out = {^data, data};`" },
  ],
  publicTestcases: [], hiddenTestcases: [],
  starterCode: `\`timescale 1ns / 1ps

module parity_gen (
    input  wire [7:0] data,
    output wire [8:0] out
);

    // TODO: out[8] = even parity bit (^data), out[7:0] = data
    // assign out = {..., data};

endmodule
`,
  publicTestbench: `\`timescale 1ns / 1ps
module tb_parity_gen;
    reg [7:0] data; wire [8:0] out;
    parity_gen dut (.data(data),.out(out));
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_parity_gen); end
    initial begin
        $display("=== Parity Generator Test ===");
        data=8'hFF;#10; $display("data=%h => parity=%b out=%h (expect parity=0)",data,out[8],out);
        data=8'h01;#10; $display("data=%h => parity=%b out=%h (expect parity=1)",data,out[8],out);
        data=8'h03;#10; $display("data=%h => parity=%b out=%h (expect parity=0)",data,out[8],out);
        $finish;
    end
endmodule
`,
  hiddenTestbench: `\`timescale 1ns / 1ps
module tb_parity_gen_hidden;
    reg [7:0] data; wire [8:0] out;
    integer errors;
    integer i;
    integer ones;
    integer j;
    parity_gen dut (.data(data),.out(out));
    initial begin
        errors = 0;
        data=8'hFF;#5;
        if(out[8]!==1'b0||out[7:0]!==8'hFF) begin $display("FAIL FF: exp parity=0 data=FF got %b,%h",out[8],out[7:0]); errors=errors+1; end
        data=8'h01;#5;
        if(out[8]!==1'b1||out[7:0]!==8'h01) begin $display("FAIL 01: exp parity=1 data=01 got %b,%h",out[8],out[7:0]); errors=errors+1; end
        data=8'h03;#5;
        if(out[8]!==1'b0||out[7:0]!==8'h03) begin $display("FAIL 03: exp parity=0 data=03 got %b,%h",out[8],out[7:0]); errors=errors+1; end
        data=8'h00;#5;
        if(out[8]!==1'b0||out[7:0]!==8'h00) begin $display("FAIL 00: exp parity=0 data=00 got %b,%h",out[8],out[7:0]); errors=errors+1; end
        // verify parity makes total 1-count even for several values
        for (i=0; i<16; i=i+1) begin
            data = i[7:0]; #5;
            ones = 0;
            for (j=0; j<9; j=j+1) ones = ones + out[j];
            if (ones[0] !== 1'b0) begin
                $display("FAIL parity: data=%h total_ones=%0d not even",data,ones);
                errors=errors+1;
            end
        end
        if(errors==0) $display("ALL TESTS PASSED");
        else $display("TESTS FAILED: %0d error(s)",errors);
        $finish;
    end
endmodule
`,
};

const populationCount: Problem = {
  id: "population-count", slug: "population-count", title: "Population Count (Hamming Weight)",
  difficulty: "beginner", category: "combinational",
  tags: ["combinational", "interview", "vectors"],
  learningLevel: "Verilog Beginner", moduleId: "mod_combinational", orderIndex: 16,
  xpReward: 50, waveformRequired: false, expectedOutputMode: "stdout_compare",
  statement: `## Population Count (Hamming Weight)

Input: 8-bit \`in[7:0]\`. Output: 4-bit \`count[3:0]\` — the number of 1-bits in \`in\`.

Implement by summing all individual bits:
\`\`\`
count = in[0] + in[1] + in[2] + in[3] + in[4] + in[5] + in[6] + in[7];
\`\`\`

**Examples**
- \`in=8'h00 → count=0\`
- \`in=8'hFF → count=8\`
- \`in=8'hAA (10101010) → count=4\`
- \`in=8'h01 → count=1\`

**Note:** This operation is used in cryptography, error correction, and branch predictors. CPUs expose it as the \`POPCNT\` instruction.`,
  constraints: ["Sum all 8 bits explicitly. Output must be 4-bit wide (max value 8 fits in 4 bits)."],
  examples: [
    { input: "in=8'h00", output: "count=4'd0" },
    { input: "in=8'hFF", output: "count=4'd8" },
  ],
  hints: [
    { tier: 1, content: "Add each bit: `assign count = in[0]+in[1]+in[2]+in[3]+in[4]+in[5]+in[6]+in[7];`" },
  ],
  publicTestcases: [], hiddenTestcases: [],
  starterCode: `\`timescale 1ns / 1ps

module pop_count (
    input  wire [7:0] in,
    output wire [3:0] count
);

    // TODO: count the number of 1-bits in 'in'
    // assign count = in[0] + in[1] + ... ;

endmodule
`,
  publicTestbench: `\`timescale 1ns / 1ps
module tb_pop_count;
    reg [7:0] in; wire [3:0] count;
    pop_count dut (.in(in),.count(count));
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_pop_count); end
    initial begin
        $display("=== Population Count Test ===");
        in=8'h00;#10; $display("in=%h => count=%0d (expect 0)",in,count);
        in=8'hFF;#10; $display("in=%h => count=%0d (expect 8)",in,count);
        in=8'hAA;#10; $display("in=%h => count=%0d (expect 4)",in,count);
        in=8'h01;#10; $display("in=%h => count=%0d (expect 1)",in,count);
        $finish;
    end
endmodule
`,
  hiddenTestbench: `\`timescale 1ns / 1ps
module tb_pop_count_hidden;
    reg [7:0] in; wire [3:0] count;
    integer errors;
    integer i;
    integer expected;
    integer j;
    pop_count dut (.in(in),.count(count));
    initial begin
        errors = 0;
        in=8'h00;#5; if(count!==4'd0) begin $display("FAIL 00 exp 0 got %0d",count); errors=errors+1; end
        in=8'hFF;#5; if(count!==4'd8) begin $display("FAIL FF exp 8 got %0d",count); errors=errors+1; end
        in=8'hAA;#5; if(count!==4'd4) begin $display("FAIL AA exp 4 got %0d",count); errors=errors+1; end
        in=8'h01;#5; if(count!==4'd1) begin $display("FAIL 01 exp 1 got %0d",count); errors=errors+1; end
        in=8'h0F;#5; if(count!==4'd4) begin $display("FAIL 0F exp 4 got %0d",count); errors=errors+1; end
        in=8'h80;#5; if(count!==4'd1) begin $display("FAIL 80 exp 1 got %0d",count); errors=errors+1; end
        for (i=0; i<256; i=i+1) begin
            in = i[7:0]; #2;
            expected = 0;
            for (j=0; j<8; j=j+1) expected = expected + in[j];
            if (count !== expected[3:0]) begin
                $display("FAIL in=%h exp %0d got %0d",in,expected,count);
                errors=errors+1;
            end
        end
        if(errors==0) $display("ALL TESTS PASSED");
        else $display("TESTS FAILED: %0d error(s)",errors);
        $finish;
    end
endmodule
`,
};

// ─────────────────────────────────────────────────────────────────────────────
// M03 (new) — Modules & Hierarchy
// ─────────────────────────────────────────────────────────────────────────────

const threeInvertersChain: Problem = {
  id: "three-inverters-chain", slug: "three-inverters-chain", title: "Three Inverters in Chain",
  difficulty: "beginner", category: "combinational",
  tags: ["hierarchy", "instantiation", "structural"],
  learningLevel: "Verilog Beginner", moduleId: "mod_combinational", orderIndex: 18,
  xpReward: 50, waveformRequired: false, expectedOutputMode: "stdout_compare",
  statement: `## Three Inverters in Chain

Instantiate three \`inv\` modules (provided below) in series. Declare two internal wires for the intermediate signals.

The \`inv\` module is:
\`\`\`verilog
module inv (input wire in, output wire out);
    assign out = ~in;
endmodule
\`\`\`

Three inverters in chain gives the same result as one inverter (odd number).

**Interface**

| Port  | Direction | Description    |
|-------|-----------|----------------|
| \`in\`  | input   | Signal input   |
| \`out\` | output  | Triple-inverted output |

**Notes**
- Always connect ports by name: \`.in(wire_name)\`
- Declare internal wires at module scope before instantiation`,
  constraints: [
    "Use three inv module instantiations.",
    "Use named port connections (.port(signal)).",
    "Declare two intermediate wires.",
  ],
  examples: [
    { input: "in=0", output: "out=1 (three inversions of 0)" },
    { input: "in=1", output: "out=0" },
  ],
  hints: [
    { tier: 1, content: "Declare: `wire w1, w2;` then instantiate: `inv i1(.in(in),.out(w1));`" },
    { tier: 2, content: "Chain: i1 output → w1 → i2 input; i2 output → w2 → i3 input; i3 output → out." },
  ],
  publicTestcases: [], hiddenTestcases: [],
  starterCode: `\`timescale 1ns / 1ps

// Pre-defined inverter — do not modify
module inv (
    input  wire in,
    output wire out
);
    assign out = ~in;
endmodule

module three_inv_chain (
    input  wire in,
    output wire out
);

    // TODO: declare two internal wires and instantiate three inv modules
    // wire w1, w2;
    // inv i1 (.in(in),   .out(w1));
    // inv i2 (.in(w1),   .out(w2));
    // inv i3 (.in(w2),   .out(out));

endmodule
`,
  publicTestbench: `\`timescale 1ns / 1ps
module tb_three_inv_chain;
    reg in; wire out;
    three_inv_chain dut (.in(in),.out(out));
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_three_inv_chain); end
    initial begin
        $display("=== Three Inverter Chain Test ===");
        in=0;#10; $display("in=%b => out=%b (expect 1)",in,out);
        in=1;#10; $display("in=%b => out=%b (expect 0)",in,out);
        $finish;
    end
endmodule
`,
  hiddenTestbench: `\`timescale 1ns / 1ps
module tb_three_inv_chain_hidden;
    reg in; wire out;
    integer errors;
    three_inv_chain dut (.in(in),.out(out));
    initial begin
        errors = 0;
        in=0;#10; if(out!==1'b1) begin $display("FAIL in=0 exp 1 got %b",out); errors=errors+1; end
        in=1;#10; if(out!==1'b0) begin $display("FAIL in=1 exp 0 got %b",out); errors=errors+1; end
        if(errors==0) $display("ALL TESTS PASSED");
        else $display("TESTS FAILED: %0d error(s)",errors);
        $finish;
    end
endmodule
`,
};

const rippleCarryAdder4: Problem = {
  id: "ripple-carry-adder-4bit", slug: "ripple-carry-adder-4bit", title: "4-bit Ripple Carry Adder",
  difficulty: "beginner", category: "combinational",
  tags: ["adder", "hierarchy", "interview", "structural"],
  learningLevel: "Verilog Beginner", moduleId: "mod_combinational", orderIndex: 19,
  xpReward: 65, waveformRequired: false, expectedOutputMode: "stdout_compare",
  statement: `## 4-bit Ripple Carry Adder

Instantiate four \`full_adder\` modules to build a 4-bit ripple carry adder.

The \`full_adder\` module is:
\`\`\`verilog
module full_adder (
    input  wire a, b, cin,
    output wire sum, cout
);
    assign sum  = a ^ b ^ cin;
    assign cout = (a & b) | (b & cin) | (a & cin);
endmodule
\`\`\`

Chain the carry: \`cout\` of stage N → \`cin\` of stage N+1. The final \`cout\` is the overflow bit.

**Interface**

| Port | Direction | Width | Description |
|------|-----------|-------|-------------|
| \`a[3:0]\` | input | 4 | First operand |
| \`b[3:0]\` | input | 4 | Second operand |
| \`cin\` | input | 1 | Carry in |
| \`sum[3:0]\` | output | 4 | Sum |
| \`cout\` | output | 1 | Carry out |`,
  constraints: [
    "Use four full_adder instantiations with named ports.",
    "Carry chain must be correct (cout of each stage to cin of next).",
  ],
  examples: [
    { input: "a=4'hF, b=4'h1, cin=0", output: "sum=4'h0, cout=1" },
    { input: "a=4'h7, b=4'h8, cin=0", output: "sum=4'hF, cout=0" },
  ],
  hints: [
    { tier: 1, content: "Declare 3 carry wires: `wire c1,c2,c3;` for the internal carry chain." },
    { tier: 2, content: "FA0: cin=cin, cout=c1; FA1: cin=c1, cout=c2; FA2: cin=c2, cout=c3; FA3: cin=c3, cout=cout." },
  ],
  publicTestcases: [], hiddenTestcases: [],
  starterCode: `\`timescale 1ns / 1ps

// Pre-defined full adder — do not modify
module full_adder (
    input  wire a, b, cin,
    output wire sum, cout
);
    assign sum  = a ^ b ^ cin;
    assign cout = (a & b) | (b & cin) | (a & cin);
endmodule

module ripple_carry_adder_4 (
    input  wire [3:0] a,
    input  wire [3:0] b,
    input  wire       cin,
    output wire [3:0] sum,
    output wire       cout
);

    // TODO: instantiate four full_adder modules
    // Declare internal carry wires: wire c1, c2, c3;

endmodule
`,
  publicTestbench: `\`timescale 1ns / 1ps
module tb_ripple_carry_adder_4;
    reg [3:0] a,b; reg cin; wire [3:0] sum; wire cout;
    ripple_carry_adder_4 dut (.a(a),.b(b),.cin(cin),.sum(sum),.cout(cout));
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_ripple_carry_adder_4); end
    initial begin
        $display("=== 4-bit RCA Test ===");
        a=4'hF;b=4'h1;cin=0;#10; $display("%h+%h+%b => sum=%h cout=%b (exp 0,1)",a,b,cin,sum,cout);
        a=4'h7;b=4'h8;cin=0;#10; $display("%h+%h+%b => sum=%h cout=%b (exp F,0)",a,b,cin,sum,cout);
        a=4'h5;b=4'h3;cin=0;#10; $display("%h+%h+%b => sum=%h cout=%b (exp 8,0)",a,b,cin,sum,cout);
        $finish;
    end
endmodule
`,
  hiddenTestbench: `\`timescale 1ns / 1ps
module tb_ripple_carry_adder_4_hidden;
    reg [3:0] a,b; reg cin; wire [3:0] sum; wire cout;
    integer errors;
    integer i;
    integer j;
    reg [4:0] expected;
    ripple_carry_adder_4 dut (.a(a),.b(b),.cin(cin),.sum(sum),.cout(cout));
    initial begin
        errors = 0;
        a=4'hF;b=4'h1;cin=0;#5;
        if(sum!==4'h0||cout!==1'b1) begin $display("FAIL F+1 exp sum=0 cout=1 got %h,%b",sum,cout); errors=errors+1; end
        a=4'h7;b=4'h8;cin=0;#5;
        if(sum!==4'hF||cout!==1'b0) begin $display("FAIL 7+8 exp sum=F cout=0 got %h,%b",sum,cout); errors=errors+1; end
        a=4'h0;b=4'h0;cin=0;#5;
        if(sum!==4'h0||cout!==1'b0) begin $display("FAIL 0+0 exp 0 got %h,%b",sum,cout); errors=errors+1; end
        for (i=0;i<16;i=i+1) begin
            for (j=0;j<16;j=j+1) begin
                a=i[3:0]; b=j[3:0]; cin=0; #2;
                expected = i+j;
                if(sum!==expected[3:0]||cout!==expected[4]) begin
                    $display("FAIL %h+%h exp sum=%h cout=%b got %h,%b",i,j,expected[3:0],expected[4],sum,cout);
                    errors=errors+1;
                end
            end
        end
        if(errors==0) $display("ALL TESTS PASSED");
        else $display("TESTS FAILED: %0d error(s)",errors);
        $finish;
    end
endmodule
`,
};

const adderSubtractor: Problem = {
  id: "adder-subtractor", slug: "adder-subtractor", title: "4-bit Adder-Subtractor",
  difficulty: "beginner", category: "combinational",
  tags: ["arithmetic", "hierarchy", "interview"],
  learningLevel: "Verilog Beginner", moduleId: "mod_combinational", orderIndex: 20,
  xpReward: 70, waveformRequired: false, expectedOutputMode: "stdout_compare",
  statement: `## 4-bit Adder-Subtractor

Extend the 4-bit ripple carry adder to support subtraction.

A 1-bit mode input \`sub\`:
- When \`sub=0\`: compute \`a + b\`
- When \`sub=1\`: compute \`a - b\` by XORing each bit of \`b\` with \`sub\` before feeding into the adder, and setting \`cin = sub\`

This works because \`a - b = a + (~b) + 1\` (two's complement).

**Interface**

| Port | Direction | Width | Description |
|------|-----------|-------|-------------|
| \`a[3:0]\` | input | 4 | First operand |
| \`b[3:0]\` | input | 4 | Second operand |
| \`sub\` | input | 1 | 0=add, 1=subtract |
| \`result[3:0]\` | output | 4 | Result |
| \`cout\` | output | 1 | Carry out |`,
  constraints: [
    "XOR each bit of b with sub before the adder input.",
    "Set cin = sub.",
    "Use four full_adder instantiations.",
  ],
  examples: [
    { input: "a=4'd5, b=4'd3, sub=1", output: "result=4'd2" },
    { input: "a=4'd5, b=4'd3, sub=0", output: "result=4'd8" },
  ],
  hints: [
    { tier: 1, content: "XOR b with sub: `wire [3:0] b_xor; assign b_xor = b ^ {4{sub}};`" },
    { tier: 2, content: "Then instantiate four full_adders using b_xor instead of b, with cin = sub." },
  ],
  publicTestcases: [], hiddenTestcases: [],
  starterCode: `\`timescale 1ns / 1ps

// Pre-defined full adder — do not modify
module full_adder (
    input  wire a, b, cin,
    output wire sum, cout
);
    assign sum  = a ^ b ^ cin;
    assign cout = (a & b) | (b & cin) | (a & cin);
endmodule

module adder_subtractor_4 (
    input  wire [3:0] a,
    input  wire [3:0] b,
    input  wire       sub,
    output wire [3:0] result,
    output wire       cout
);

    // TODO:
    // 1. XOR each bit of b with sub: wire [3:0] b_in = b ^ {4{sub}};
    // 2. Instantiate four full_adders with cin = sub
    // 3. Chain carries as in ripple carry adder

endmodule
`,
  publicTestbench: `\`timescale 1ns / 1ps
module tb_adder_subtractor_4;
    reg [3:0] a,b; reg sub; wire [3:0] result; wire cout;
    adder_subtractor_4 dut (.a(a),.b(b),.sub(sub),.result(result),.cout(cout));
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_adder_subtractor_4); end
    initial begin
        $display("=== Adder-Subtractor Test ===");
        a=5;b=3;sub=0;#10; $display("5+3 => result=%0d cout=%b (expect 8)",result,cout);
        a=5;b=3;sub=1;#10; $display("5-3 => result=%0d cout=%b (expect 2)",result,cout);
        a=3;b=5;sub=1;#10; $display("3-5 => result=%0d cout=%b (expect 14 signed=-2)",result,cout);
        $finish;
    end
endmodule
`,
  hiddenTestbench: `\`timescale 1ns / 1ps
module tb_adder_subtractor_4_hidden;
    reg [3:0] a,b; reg sub; wire [3:0] result; wire cout;
    integer errors;
    adder_subtractor_4 dut (.a(a),.b(b),.sub(sub),.result(result),.cout(cout));
    initial begin
        errors = 0;
        a=5;b=3;sub=0;#5; if(result!==4'd8) begin $display("FAIL 5+3 exp 8 got %0d",result); errors=errors+1; end
        a=5;b=3;sub=1;#5; if(result!==4'd2) begin $display("FAIL 5-3 exp 2 got %0d",result); errors=errors+1; end
        a=0;b=0;sub=0;#5; if(result!==4'd0) begin $display("FAIL 0+0 exp 0 got %0d",result); errors=errors+1; end
        a=4'hF;b=4'hF;sub=0;#5; if(result!==4'hE||cout!==1'b1) begin $display("FAIL F+F exp E,cout=1 got %h,%b",result,cout); errors=errors+1; end
        a=7;b=7;sub=1;#5; if(result!==4'd0) begin $display("FAIL 7-7 exp 0 got %0d",result); errors=errors+1; end
        a=0;b=1;sub=1;#5; if(result!==4'hF) begin $display("FAIL 0-1 exp F (two's comp) got %h",result); errors=errors+1; end
        if(errors==0) $display("ALL TESTS PASSED");
        else $display("TESTS FAILED: %0d error(s)",errors);
        $finish;
    end
endmodule
`,
};

// ─────────────────────────────────────────────────────────────────────────────
// M04 (new) — Always Blocks additions
// ─────────────────────────────────────────────────────────────────────────────

const mux4to1: Problem = {
  id: "mux-4to1", slug: "mux-4to1", title: "4-to-1 MUX with case",
  difficulty: "beginner", category: "combinational",
  tags: ["case", "mux", "always"],
  learningLevel: "Verilog Beginner", moduleId: "mod_combinational", orderIndex: 22,
  xpReward: 45, waveformRequired: false, expectedOutputMode: "stdout_compare",
  statement: `## 4-to-1 MUX with case

4 data inputs \`d[3:0]\` (each 1 bit), 2-bit select \`s[1:0]\`, 1-bit output \`y\`.

Implement using \`case(s)\` inside \`always @(*)\`. Must include a \`default\` branch.

**Truth Table**

| s | y |
|---|---|
| 00 | d[0] |
| 01 | d[1] |
| 10 | d[2] |
| 11 | d[3] |

**Important:** Declare \`y\` as \`reg\` when used in an always block.`,
  constraints: [
    "Use always @(*) with a case statement.",
    "Include a default branch (y = 1'b0).",
    "No latches — default prevents them.",
  ],
  examples: [
    { input: "d=4'b1010, s=2'b01", output: "y=1 (d[1])" },
    { input: "d=4'b1010, s=2'b10", output: "y=0 (d[2])" },
  ],
  hints: [
    { tier: 1, content: "Start with `always @(*) begin case(s) ...` and list all four select values plus default." },
  ],
  publicTestcases: [], hiddenTestcases: [],
  starterCode: `\`timescale 1ns / 1ps

module mux_4to1 (
    input  wire [3:0] d,
    input  wire [1:0] s,
    output reg        y
);

    // TODO: always @(*) begin case(s) ... endcase end

endmodule
`,
  publicTestbench: `\`timescale 1ns / 1ps
module tb_mux_4to1;
    reg [3:0] d; reg [1:0] s; wire y;
    mux_4to1 dut (.d(d),.s(s),.y(y));
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_mux_4to1); end
    initial begin
        $display("=== 4-to-1 MUX Test ===");
        d=4'b1010;
        s=2'b00;#10; $display("s=%b d=%b => y=%b (expect %b)",s,d,y,d[0]);
        s=2'b01;#10; $display("s=%b d=%b => y=%b (expect %b)",s,d,y,d[1]);
        s=2'b10;#10; $display("s=%b d=%b => y=%b (expect %b)",s,d,y,d[2]);
        s=2'b11;#10; $display("s=%b d=%b => y=%b (expect %b)",s,d,y,d[3]);
        $finish;
    end
endmodule
`,
  hiddenTestbench: `\`timescale 1ns / 1ps
module tb_mux_4to1_hidden;
    reg [3:0] d; reg [1:0] s; wire y;
    integer errors;
    integer i;
    integer j;
    mux_4to1 dut (.d(d),.s(s),.y(y));
    initial begin
        errors = 0;
        for (i=0; i<16; i=i+1) begin
            d = i[3:0];
            for (j=0; j<4; j=j+1) begin
                s = j[1:0]; #5;
                if (y !== d[j]) begin
                    $display("FAIL d=%b s=%b exp %b got %b",d,s,d[j],y);
                    errors=errors+1;
                end
            end
        end
        if(errors==0) $display("ALL TESTS PASSED");
        else $display("TESTS FAILED: %0d error(s)",errors);
        $finish;
    end
endmodule
`,
};

const spotTheLatch: Problem = {
  id: "spot-the-latch", slug: "spot-the-latch", title: "Spot the Latch (Debug)",
  difficulty: "beginner", category: "combinational",
  tags: ["debug", "latch", "interview", "always"],
  learningLevel: "Verilog Beginner", moduleId: "mod_combinational", orderIndex: 29,
  xpReward: 55, waveformRequired: false, expectedOutputMode: "stdout_compare",
  statement: `## Spot the Latch (Debug Problem)

The following module has a bug — it infers a latch. Find it and fix it.

**Buggy Code:**
\`\`\`verilog
module priority_enc_buggy (
  input  [3:0] req,
  output reg [1:0] grant
);
  always @(*) begin
    if      (req[3]) grant = 2'd3;
    else if (req[2]) grant = 2'd2;
    else if (req[1]) grant = 2'd1;
    // BUG: no final else — latch inferred for req=4'b0001 and req=4'b0000
  end
endmodule
\`\`\`

**Your task:** Implement a **fixed** version called \`priority_enc_fixed\` that:
- Correctly encodes the highest-priority active request (MSB = highest)
- Has no latches (grant gets a value on every possible input)
- Outputs \`grant=2'd0\` and \`valid=1\` when \`req[0]\` is the only active bit
- Outputs \`grant=2'd0\` and \`valid=0\` when \`req=4'b0000\`

**Interface**

| Port | Direction | Width | Description |
|------|-----------|-------|-------------|
| \`req[3:0]\` | input | 4 | Request lines |
| \`grant[1:0]\` | output | 2 | Encoded grant |
| \`valid\` | output | 1 | High when any request active |`,
  constraints: [
    "Add a default assignment at the top of the always block.",
    "valid must be high when any req bit is set.",
    "No latch — grant must be assigned on all paths.",
  ],
  examples: [
    { input: "req=4'b1010", output: "grant=2, valid=1" },
    { input: "req=4'b0000", output: "grant=0, valid=0" },
  ],
  hints: [
    { tier: 1, content: "Add default assignments before the if-else chain: `grant = 2'd0; valid = 1'b0;`" },
    { tier: 2, content: "Set valid=1 in every branch where a request is active. The default covers the all-zero case." },
  ],
  publicTestcases: [], hiddenTestcases: [],
  starterCode: `\`timescale 1ns / 1ps

module priority_enc_fixed (
    input  wire [3:0] req,
    output reg  [1:0] grant,
    output reg        valid
);

    // This block infers latches: when req == 4'b0000 no branch assigns
    // grant or valid, so they keep their previous values.
    // TODO: fix it by giving grant and valid default values before the if-else chain.
    always @(*) begin
        // Priority: req[3] > req[2] > req[1] > req[0]
        if      (req[3]) begin grant = 2'd3; valid = 1'b1; end
        else if (req[2]) begin grant = 2'd2; valid = 1'b1; end
        else if (req[1]) begin grant = 2'd1; valid = 1'b1; end
        else if (req[0]) begin grant = 2'd0; valid = 1'b1; end
    end

endmodule
`,
  publicTestbench: `\`timescale 1ns / 1ps
module tb_priority_enc_fixed;
    reg [3:0] req; wire [1:0] grant; wire valid;
    priority_enc_fixed dut (.req(req),.grant(grant),.valid(valid));
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_priority_enc_fixed); end
    initial begin
        $display("=== Latch Fix Test ===");
        req=4'b1010;#10; $display("req=%b => grant=%0d valid=%b (expect 2,1)",req,grant,valid);
        req=4'b0000;#10; $display("req=%b => grant=%0d valid=%b (expect 0,0)",req,grant,valid);
        req=4'b0001;#10; $display("req=%b => grant=%0d valid=%b (expect 0,1)",req,grant,valid);
        req=4'b1111;#10; $display("req=%b => grant=%0d valid=%b (expect 3,1)",req,grant,valid);
        $finish;
    end
endmodule
`,
  hiddenTestbench: `\`timescale 1ns / 1ps
module tb_priority_enc_fixed_hidden;
    reg [3:0] req; wire [1:0] grant; wire valid;
    integer errors;
    priority_enc_fixed dut (.req(req),.grant(grant),.valid(valid));
    initial begin
        errors = 0;
        req=4'b0000;#5; if(valid!==0||grant!==0) begin $display("FAIL 0000 exp g=0,v=0 got %0d,%b",grant,valid); errors=errors+1; end
        req=4'b0001;#5; if(valid!==1||grant!==0) begin $display("FAIL 0001 exp g=0,v=1 got %0d,%b",grant,valid); errors=errors+1; end
        req=4'b0010;#5; if(valid!==1||grant!==1) begin $display("FAIL 0010 exp g=1,v=1 got %0d,%b",grant,valid); errors=errors+1; end
        req=4'b0100;#5; if(valid!==1||grant!==2) begin $display("FAIL 0100 exp g=2,v=1 got %0d,%b",grant,valid); errors=errors+1; end
        req=4'b1000;#5; if(valid!==1||grant!==3) begin $display("FAIL 1000 exp g=3,v=1 got %0d,%b",grant,valid); errors=errors+1; end
        req=4'b1010;#5; if(valid!==1||grant!==3) begin $display("FAIL 1010 exp g=3,v=1 got %0d,%b",grant,valid); errors=errors+1; end
        req=4'b0110;#5; if(valid!==1||grant!==2) begin $display("FAIL 0110 exp g=2,v=1 got %0d,%b",grant,valid); errors=errors+1; end
        req=4'b1111;#5; if(valid!==1||grant!==3) begin $display("FAIL 1111 exp g=3,v=1 got %0d,%b",grant,valid); errors=errors+1; end
        if(errors==0) $display("ALL TESTS PASSED");
        else $display("TESTS FAILED: %0d error(s)",errors);
        $finish;
    end
endmodule
`,
};

const sevenSegDecoder: Problem = {
  id: "seven-seg-decoder", slug: "seven-seg-decoder", title: "7-Segment Display Decoder",
  difficulty: "beginner", category: "combinational",
  tags: ["decoder", "BCD", "case", "display"],
  learningLevel: "Verilog Beginner", moduleId: "mod_combinational", orderIndex: 30,
  xpReward: 60, waveformRequired: false, expectedOutputMode: "stdout_compare",
  statement: `## 7-Segment Display Decoder

Input: 4-bit BCD digit \`bcd[3:0]\` (values 0–9).
Output: 7-bit \`seg[6:0]\` encoding the segments for a **common-anode** display.

Segment mapping (active-low: 0 = segment ON):
\`\`\`
 aaa
f   b
f   b
 ggg
e   c
e   c
 ddd
\`\`\`
\`seg = {a, b, c, d, e, f, g}\`

| Digit | seg[6:0] | Display |
|-------|----------|---------|
| 0 | 7'b000_0001 | 0 |
| 1 | 7'b100_1111 | 1 |
| 2 | 7'b001_0010 | 2 |
| 3 | 7'b000_0110 | 3 |
| 4 | 7'b100_1100 | 4 |
| 5 | 7'b010_0100 | 5 |
| 6 | 7'b010_0000 | 6 |
| 7 | 7'b000_1111 | 7 |
| 8 | 7'b000_0000 | 8 |
| 9 | 7'b000_0100 | 9 |
| 10–15 | 7'b111_1110 | dash (—) |

Invalid inputs 10–15 display a dash (only segment g active).`,
  constraints: [
    "Use a case statement inside always @(*).",
    "Default case must output dash: 7'b111_1110.",
  ],
  examples: [
    { input: "bcd=4'd0", output: "seg=7'b000_0001" },
    { input: "bcd=4'd15", output: "seg=7'b111_1110 (dash)" },
  ],
  hints: [
    { tier: 1, content: "Use `case(bcd)` with entries for 0–9 and a `default` for invalid inputs." },
  ],
  publicTestcases: [], hiddenTestcases: [],
  starterCode: `\`timescale 1ns / 1ps

module seven_seg_decoder (
    input  wire [3:0] bcd,
    output reg  [6:0] seg
);

    // seg = {a, b, c, d, e, f, g} — active LOW (0 = ON)
    always @(*) begin
        case (bcd)
            4'd0: seg = 7'b000_0001;
            // TODO: fill in cases 1–9 and default (dash)
            default: seg = 7'b111_1110; // dash
        endcase
    end

endmodule
`,
  publicTestbench: `\`timescale 1ns / 1ps
module tb_seven_seg_decoder;
    reg [3:0] bcd; wire [6:0] seg;
    seven_seg_decoder dut (.bcd(bcd),.seg(seg));
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_seven_seg_decoder); end
    initial begin
        $display("=== 7-Segment Decoder Test ===");
        bcd=0;#5; $display("bcd=%0d => seg=%b (expect 0000001)",bcd,seg);
        bcd=1;#5; $display("bcd=%0d => seg=%b (expect 1001111)",bcd,seg);
        bcd=5;#5; $display("bcd=%0d => seg=%b (expect 0100100)",bcd,seg);
        bcd=9;#5; $display("bcd=%0d => seg=%b (expect 0000100)",bcd,seg);
        bcd=15;#5;$display("bcd=%0d => seg=%b (expect 1111110 dash)",bcd,seg);
        $finish;
    end
endmodule
`,
  hiddenTestbench: `\`timescale 1ns / 1ps
module tb_seven_seg_decoder_hidden;
    reg [3:0] bcd; wire [6:0] seg;
    integer errors;
    reg [6:0] expected;
    seven_seg_decoder dut (.bcd(bcd),.seg(seg));
    initial begin
        errors = 0;
        // Test all 16 values
        bcd=0;  #5; expected=7'b0000001; if(seg!==expected) begin $display("FAIL bcd=0  exp %b got %b",expected,seg); errors=errors+1; end
        bcd=1;  #5; expected=7'b1001111; if(seg!==expected) begin $display("FAIL bcd=1  exp %b got %b",expected,seg); errors=errors+1; end
        bcd=2;  #5; expected=7'b0010010; if(seg!==expected) begin $display("FAIL bcd=2  exp %b got %b",expected,seg); errors=errors+1; end
        bcd=3;  #5; expected=7'b0000110; if(seg!==expected) begin $display("FAIL bcd=3  exp %b got %b",expected,seg); errors=errors+1; end
        bcd=4;  #5; expected=7'b1001100; if(seg!==expected) begin $display("FAIL bcd=4  exp %b got %b",expected,seg); errors=errors+1; end
        bcd=5;  #5; expected=7'b0100100; if(seg!==expected) begin $display("FAIL bcd=5  exp %b got %b",expected,seg); errors=errors+1; end
        bcd=6;  #5; expected=7'b0100000; if(seg!==expected) begin $display("FAIL bcd=6  exp %b got %b",expected,seg); errors=errors+1; end
        bcd=7;  #5; expected=7'b0001111; if(seg!==expected) begin $display("FAIL bcd=7  exp %b got %b",expected,seg); errors=errors+1; end
        bcd=8;  #5; expected=7'b0000000; if(seg!==expected) begin $display("FAIL bcd=8  exp %b got %b",expected,seg); errors=errors+1; end
        bcd=9;  #5; expected=7'b0000100; if(seg!==expected) begin $display("FAIL bcd=9  exp %b got %b",expected,seg); errors=errors+1; end
        bcd=10; #5; expected=7'b1111110; if(seg!==expected) begin $display("FAIL bcd=10 exp %b got %b",expected,seg); errors=errors+1; end
        bcd=15; #5; expected=7'b1111110; if(seg!==expected) begin $display("FAIL bcd=15 exp %b got %b",expected,seg); errors=errors+1; end
        if(errors==0) $display("ALL TESTS PASSED");
        else $display("TESTS FAILED: %0d error(s)",errors);
        $finish;
    end
endmodule
`,
};

// ─────────────────────────────────────────────────────────────────────────────
// M05 (new) — Combinational Circuits additions
// ─────────────────────────────────────────────────────────────────────────────

const fullAdder: Problem = {
  id: "full-adder", slug: "full-adder", title: "Full Adder",
  difficulty: "beginner", category: "combinational",
  tags: ["adder", "interview", "combinational"],
  learningLevel: "Verilog Beginner", moduleId: "mod_combinational", orderIndex: 33,
  xpReward: 45, waveformRequired: false, expectedOutputMode: "stdout_compare",
  statement: `## Full Adder

Implement a 1-bit full adder: three inputs (\`a\`, \`b\`, \`cin\`), two outputs (\`sum\`, \`cout\`).

\`\`\`
sum  = a ^ b ^ cin
cout = (a & b) | (b & cin) | (a & cin)
\`\`\`

**Truth Table**

| a | b | cin | sum | cout |
|---|---|-----|-----|------|
| 0 | 0 |  0  |  0  |   0  |
| 0 | 0 |  1  |  1  |   0  |
| 0 | 1 |  0  |  1  |   0  |
| 0 | 1 |  1  |  0  |   1  |
| 1 | 0 |  0  |  1  |   0  |
| 1 | 0 |  1  |  0  |   1  |
| 1 | 1 |  0  |  0  |   1  |
| 1 | 1 |  1  |  1  |   1  |

**Notes:** The full adder is the building block for all multi-bit adders. Carry propagates from LSB to MSB in a ripple carry adder.`,
  constraints: ["Use two assign statements — one for sum, one for cout."],
  examples: [
    { input: "a=1, b=1, cin=0", output: "sum=0, cout=1" },
    { input: "a=1, b=1, cin=1", output: "sum=1, cout=1" },
  ],
  hints: [
    { tier: 1, content: "`assign sum = a ^ b ^ cin;` — three-way XOR." },
    { tier: 2, content: "`assign cout = (a & b) | (b & cin) | (a & cin);` — majority function." },
  ],
  publicTestcases: [], hiddenTestcases: [],
  starterCode: `\`timescale 1ns / 1ps

module full_adder (
    input  wire a,
    input  wire b,
    input  wire cin,
    output wire sum,
    output wire cout
);

    // TODO: assign sum  = ...;
    // TODO: assign cout = ...;

endmodule
`,
  publicTestbench: `\`timescale 1ns / 1ps
module tb_full_adder;
    reg a,b,cin; wire sum,cout;
    full_adder dut (.a(a),.b(b),.cin(cin),.sum(sum),.cout(cout));
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_full_adder); end
    initial begin
        $display("=== Full Adder Test ===");
        a=0;b=0;cin=0;#10; $display("a=%b b=%b cin=%b => sum=%b cout=%b (exp 0,0)",a,b,cin,sum,cout);
        a=1;b=0;cin=0;#10; $display("a=%b b=%b cin=%b => sum=%b cout=%b (exp 1,0)",a,b,cin,sum,cout);
        a=1;b=1;cin=0;#10; $display("a=%b b=%b cin=%b => sum=%b cout=%b (exp 0,1)",a,b,cin,sum,cout);
        a=1;b=1;cin=1;#10; $display("a=%b b=%b cin=%b => sum=%b cout=%b (exp 1,1)",a,b,cin,sum,cout);
        $finish;
    end
endmodule
`,
  hiddenTestbench: `\`timescale 1ns / 1ps
module tb_full_adder_hidden;
    reg a,b,cin; wire sum,cout;
    integer errors;
    integer i;
    reg exp_sum;
    reg exp_cout;
    full_adder dut (.a(a),.b(b),.cin(cin),.sum(sum),.cout(cout));
    initial begin
        errors = 0;
        for (i=0;i<8;i=i+1) begin
            {a,b,cin} = i[2:0]; #5;
            exp_sum  = a ^ b ^ cin;
            exp_cout = (a & b) | (b & cin) | (a & cin);
            if(sum!==exp_sum||cout!==exp_cout) begin
                $display("FAIL a=%b b=%b cin=%b exp sum=%b cout=%b got %b,%b",a,b,cin,exp_sum,exp_cout,sum,cout);
                errors=errors+1;
            end
        end
        if(errors==0) $display("ALL TESTS PASSED");
        else $display("TESTS FAILED: %0d error(s)",errors);
        $finish;
    end
endmodule
`,
};

const decoder3to8: Problem = {
  id: "decoder-3to8", slug: "decoder-3to8", title: "3-to-8 Decoder (74138 Style)",
  difficulty: "beginner", category: "combinational",
  tags: ["decoder", "combinational", "assign"],
  learningLevel: "Verilog Beginner", moduleId: "mod_combinational", orderIndex: 32,
  xpReward: 55, waveformRequired: false, expectedOutputMode: "stdout_compare",
  statement: `## 3-to-8 Decoder (74138 Style)

Inputs: 3-bit select \`sel[2:0]\`, active-low enable \`en_n\`.
Output: 8-bit \`y[7:0]\`, **active-low** (all outputs high except the selected one, which goes low).

When \`en_n=1\` (disabled), all outputs are high.

This mirrors the real **74HC138** IC behaviour.

**Examples**
- \`en_n=0, sel=3'b000 → y=8'b1111_1110\`  (y[0] active)
- \`en_n=0, sel=3'b101 → y=8'b1101_1111\`  (y[5] active)
- \`en_n=1, sel=any   → y=8'b1111_1111\`  (disabled)`,
  constraints: [
    "Use assign with conditional operator or always @(*) with case.",
    "Active-low outputs: selected output = 0, all others = 1.",
    "When en_n=1, all outputs = 1.",
  ],
  examples: [
    { input: "en_n=0, sel=3'b000", output: "y=8'b1111_1110" },
    { input: "en_n=1, sel=3'b000", output: "y=8'b1111_1111" },
  ],
  hints: [
    { tier: 1, content: "When enabled: `y = ~(8'd1 << sel)`. When disabled: `y = 8'hFF`." },
    { tier: 2, content: "`assign y = en_n ? 8'hFF : ~(8'd1 << sel);`" },
  ],
  publicTestcases: [], hiddenTestcases: [],
  starterCode: `\`timescale 1ns / 1ps

module decoder_3to8 (
    input  wire [2:0] sel,
    input  wire       en_n,
    output wire [7:0] y
);

    // TODO: active-low one-hot decode
    // When en_n=1, all outputs high.
    // When en_n=0, y[sel] is low, all others high.

endmodule
`,
  publicTestbench: `\`timescale 1ns / 1ps
module tb_decoder_3to8;
    reg [2:0] sel; reg en_n; wire [7:0] y;
    decoder_3to8 dut (.sel(sel),.en_n(en_n),.y(y));
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_decoder_3to8); end
    initial begin
        $display("=== 3-to-8 Decoder Test ===");
        en_n=0; sel=3'b000;#10; $display("en=1 sel=0 => y=%b (expect 11111110)",y);
        en_n=0; sel=3'b011;#10; $display("en=1 sel=3 => y=%b (expect 11110111)",y);
        en_n=1; sel=3'b000;#10; $display("en=0 sel=0 => y=%b (expect 11111111)",y);
        $finish;
    end
endmodule
`,
  hiddenTestbench: `\`timescale 1ns / 1ps
module tb_decoder_3to8_hidden;
    reg [2:0] sel; reg en_n; wire [7:0] y;
    integer errors;
    integer i;
    reg [7:0] expected;
    decoder_3to8 dut (.sel(sel),.en_n(en_n),.y(y));
    initial begin
        errors = 0;
        // Disabled: all outputs high
        en_n=1;
        for (i=0;i<8;i=i+1) begin sel=i[2:0];#5; if(y!==8'hFF) begin $display("FAIL disabled sel=%0d exp FF got %h",i,y); errors=errors+1; end end
        // Enabled: active-low one-hot
        en_n=0;
        for (i=0;i<8;i=i+1) begin
            sel=i[2:0]; #5;
            expected = ~(8'd1<<i);
            if(y!==expected) begin $display("FAIL sel=%0d exp %b got %b",i,expected,y); errors=errors+1; end
        end
        if(errors==0) $display("ALL TESTS PASSED");
        else $display("TESTS FAILED: %0d error(s)",errors);
        $finish;
    end
endmodule
`,
};

const barrelShifter: Problem = {
  id: "barrel-shifter-4bit", slug: "barrel-shifter-4bit", title: "4-bit Barrel Shifter",
  difficulty: "beginner", category: "combinational",
  tags: ["shifter", "interview", "combinational", "mux"],
  learningLevel: "Verilog Beginner", moduleId: "mod_combinational", orderIndex: 34,
  xpReward: 65, waveformRequired: false, expectedOutputMode: "stdout_compare",
  statement: `## 4-bit Barrel Shifter

Input: 4-bit \`data[3:0]\`, 2-bit shift amount \`shamt[1:0]\`, 1-bit direction \`dir\` (0=left, 1=right).
Output: 4-bit \`result[3:0]\`.

Shift fills with zeros. Use \`case\` or concatenation — no \`<<\`/\`>>\` operators.

**Examples (left shift, dir=0)**
- \`data=4'hF, shamt=1 → result=4'hE\` (1111 → 1110)
- \`data=4'hF, shamt=2 → result=4'hC\` (1111 → 1100)

**Examples (right shift, dir=1)**
- \`data=4'hF, shamt=1 → result=4'h7\` (1111 → 0111)
- \`data=4'hF, shamt=2 → result=4'h3\` (1111 → 0011)`,
  constraints: [
    "No << or >> operators.",
    "Implement with case/if-else or concatenation.",
    "Zero-fill on shift.",
  ],
  examples: [
    { input: "data=4'hF, shamt=1, dir=0", output: "result=4'hE" },
    { input: "data=4'hF, shamt=1, dir=1", output: "result=4'h7" },
  ],
  hints: [
    { tier: 1, content: "Use case(shamt) inside always @(*). For left shift 1: `result = {data[2:0], 1'b0};`" },
    { tier: 2, content: "For direction, use an outer if(dir) to choose left vs right shift logic." },
  ],
  publicTestcases: [], hiddenTestcases: [],
  starterCode: `\`timescale 1ns / 1ps

module barrel_shifter_4 (
    input  wire [3:0] data,
    input  wire [1:0] shamt,
    input  wire       dir,
    output reg  [3:0] result
);

    // TODO: always @(*) begin
    //   if (dir == 0) begin // left shift
    //     case(shamt) ...
    //   end else begin      // right shift
    //     case(shamt) ...
    //   end
    // end

endmodule
`,
  publicTestbench: `\`timescale 1ns / 1ps
module tb_barrel_shifter_4;
    reg [3:0] data; reg [1:0] shamt; reg dir; wire [3:0] result;
    barrel_shifter_4 dut (.data(data),.shamt(shamt),.dir(dir),.result(result));
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_barrel_shifter_4); end
    initial begin
        $display("=== Barrel Shifter Test ===");
        data=4'hF;dir=0;
        shamt=0;#5; $display("F<<0=%h (exp F)",result);
        shamt=1;#5; $display("F<<1=%h (exp E)",result);
        shamt=2;#5; $display("F<<2=%h (exp C)",result);
        shamt=3;#5; $display("F<<3=%h (exp 8)",result);
        dir=1;
        shamt=0;#5; $display("F>>0=%h (exp F)",result);
        shamt=1;#5; $display("F>>1=%h (exp 7)",result);
        shamt=2;#5; $display("F>>2=%h (exp 3)",result);
        shamt=3;#5; $display("F>>3=%h (exp 1)",result);
        $finish;
    end
endmodule
`,
  hiddenTestbench: `\`timescale 1ns / 1ps
module tb_barrel_shifter_4_hidden;
    reg [3:0] data; reg [1:0] shamt; reg dir; wire [3:0] result;
    integer errors;
    integer i;
    integer j;
    reg [3:0] exp_r;
    barrel_shifter_4 dut (.data(data),.shamt(shamt),.dir(dir),.result(result));
    initial begin
        errors = 0;
        // Left shift
        dir=0;
        for (i=0;i<16;i=i+1) begin
            data=i[3:0];
            for (j=0;j<4;j=j+1) begin
                shamt=j[1:0]; #3;
                exp_r = (i<<j) & 4'hF;
                if(result!==exp_r) begin $display("FAIL L data=%h shamt=%0d exp %h got %h",data,j,exp_r,result); errors=errors+1; end
            end
        end
        // Right shift
        dir=1;
        for (i=0;i<16;i=i+1) begin
            data=i[3:0];
            for (j=0;j<4;j=j+1) begin
                shamt=j[1:0]; #3;
                exp_r = (i>>j) & 4'hF;
                if(result!==exp_r) begin $display("FAIL R data=%h shamt=%0d exp %h got %h",data,j,exp_r,result); errors=errors+1; end
            end
        end
        if(errors==0) $display("ALL TESTS PASSED");
        else $display("TESTS FAILED: %0d error(s)",errors);
        $finish;
    end
endmodule
`,
};

const grayCodeConverter: Problem = {
  id: "gray-code-converter", slug: "gray-code-converter", title: "Gray Code Converter",
  difficulty: "beginner", category: "combinational",
  tags: ["gray-code", "interview", "combinational"],
  learningLevel: "Verilog Beginner", moduleId: "mod_combinational", orderIndex: 35,
  xpReward: 65, waveformRequired: false, expectedOutputMode: "stdout_compare",
  statement: `## Gray Code Converter

Implement Binary-to-Gray conversion for a 4-bit input.

**Binary to Gray:** Each Gray bit is the XOR of the binary bit with the bit above it:
\`\`\`
gray[3] = bin[3]
gray[2] = bin[3] ^ bin[2]
gray[1] = bin[2] ^ bin[1]
gray[0] = bin[1] ^ bin[0]
\`\`\`

**Interface**

| Port | Direction | Width | Description |
|------|-----------|-------|-------------|
| \`bin[3:0]\` | input | 4 | Binary input |
| \`gray[3:0]\` | output | 4 | Gray code output |

**Why it matters:** Adjacent Gray codes differ in exactly one bit. Used in rotary encoders, ADCs, and CDC pointer generation (async FIFOs).

**Verification:** Sweep 0→15 and check that each consecutive Gray output differs in exactly one bit.`,
  constraints: ["Use four assign statements (one per output bit)."],
  examples: [
    { input: "bin=4'b0001", output: "gray=4'b0001" },
    { input: "bin=4'b0010", output: "gray=4'b0011" },
    { input: "bin=4'b0011", output: "gray=4'b0010" },
  ],
  hints: [
    { tier: 1, content: "`assign gray[3] = bin[3]; assign gray[2] = bin[3]^bin[2]; ...`" },
    { tier: 2, content: "Or concisely: `assign gray = bin ^ (bin >> 1);`" },
  ],
  publicTestcases: [], hiddenTestcases: [],
  starterCode: `\`timescale 1ns / 1ps

module bin_to_gray (
    input  wire [3:0] bin,
    output wire [3:0] gray
);

    // TODO: assign gray[3] = bin[3];
    //        assign gray[2] = bin[3] ^ bin[2];
    //        assign gray[1] = bin[2] ^ bin[1];
    //        assign gray[0] = bin[1] ^ bin[0];

endmodule
`,
  publicTestbench: `\`timescale 1ns / 1ps
module tb_bin_to_gray;
    reg [3:0] bin; wire [3:0] gray;
    bin_to_gray dut (.bin(bin),.gray(gray));
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_bin_to_gray); end
    initial begin
        $display("=== Gray Code Test ===");
        bin=4'b0000;#5; $display("bin=%b => gray=%b (exp 0000)",bin,gray);
        bin=4'b0001;#5; $display("bin=%b => gray=%b (exp 0001)",bin,gray);
        bin=4'b0010;#5; $display("bin=%b => gray=%b (exp 0011)",bin,gray);
        bin=4'b0011;#5; $display("bin=%b => gray=%b (exp 0010)",bin,gray);
        bin=4'b1111;#5; $display("bin=%b => gray=%b (exp 1000)",bin,gray);
        $finish;
    end
endmodule
`,
  hiddenTestbench: `\`timescale 1ns / 1ps
module tb_bin_to_gray_hidden;
    reg [3:0] bin; wire [3:0] gray;
    integer errors;
    integer i;
    reg [3:0] expected;
    reg [3:0] prev_gray;
    integer diff_bits;
    integer j;
    bin_to_gray dut (.bin(bin),.gray(gray));
    initial begin
        errors = 0;
        // Check all 16 values against formula
        for (i=0;i<16;i=i+1) begin
            bin=i[3:0]; #5;
            expected = i[3:0] ^ (i[3:0]>>1);
            if(gray!==expected) begin $display("FAIL bin=%b exp gray=%b got %b",bin,expected,gray); errors=errors+1; end
        end
        // Check single-bit change property
        prev_gray = 4'b0;
        bin=4'b0; #5; prev_gray=gray;
        for (i=1;i<16;i=i+1) begin
            bin=i[3:0]; #5;
            diff_bits=0;
            for(j=0;j<4;j=j+1) if(gray[j]!==prev_gray[j]) diff_bits=diff_bits+1;
            if(diff_bits!==1) begin $display("FAIL: gray diff not 1 bit at i=%0d prev=%b curr=%b",i,prev_gray,gray); errors=errors+1; end
            prev_gray=gray;
        end
        if(errors==0) $display("ALL TESTS PASSED");
        else $display("TESTS FAILED: %0d error(s)",errors);
        $finish;
    end
endmodule
`,
};

const kmapRTL3var: Problem = {
  id: "kmap-3var", slug: "kmap-3var", title: "K-Map to RTL (3 Variables)",
  difficulty: "beginner", category: "combinational",
  tags: ["K-map", "interview", "combinational", "assign"],
  learningLevel: "Verilog Beginner", moduleId: "mod_combinational", orderIndex: 37,
  xpReward: 55, waveformRequired: false, expectedOutputMode: "stdout_compare",
  statement: `## K-Map to RTL (3 Variables)

A 3-variable K-map has minterms at positions **{1, 3, 5, 7}**.

Variables: \`a\` (MSB), \`b\`, \`c\` (LSB). Minterm \`m\` = input combination \`{a,b,c}=m\`.

**K-Map:**
\`\`\`
     bc
a  | 00 | 01 | 11 | 10 |
---|----|----|----|----|
 0 |  0 |  1 |  1 |  0 |
 1 |  0 |  1 |  1 |  0 |
\`\`\`

Group all four 1-cells into one quad. The minimized expression is simply: **y = c**

Implement as a single \`assign\`. Add comments explaining your K-map grouping.`,
  constraints: ["Single assign statement.", "Add comment showing the K-map grouping and derived expression."],
  examples: [
    { input: "a=0, b=0, c=1", output: "y=1 (minterm 1)" },
    { input: "a=1, b=1, c=0", output: "y=0 (minterm 6, not in set)" },
  ],
  hints: [
    { tier: 1, content: "The minterms {1,3,5,7} are all odd numbers — they all have c=1. So y=c." },
  ],
  publicTestcases: [], hiddenTestcases: [],
  starterCode: `\`timescale 1ns / 1ps

module kmap_3var (
    input  wire a,
    input  wire b,
    input  wire c,
    output wire y
);

    // K-Map minterms: {1, 3, 5, 7}
    // Grouping: all minterms have c=1 → quad covering entire c=1 column
    // Minimized SOP: y = c
    // TODO: assign y = ...;

endmodule
`,
  publicTestbench: `\`timescale 1ns / 1ps
module tb_kmap_3var;
    reg a,b,c; wire y;
    kmap_3var dut (.a(a),.b(b),.c(c),.y(y));
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_kmap_3var); end
    initial begin
        $display("=== K-Map 3var Test ===");
        {a,b,c}=3'd1;#5; $display("{a,b,c}=%b => y=%b (expect 1)",{a,b,c},y);
        {a,b,c}=3'd3;#5; $display("{a,b,c}=%b => y=%b (expect 1)",{a,b,c},y);
        {a,b,c}=3'd0;#5; $display("{a,b,c}=%b => y=%b (expect 0)",{a,b,c},y);
        {a,b,c}=3'd6;#5; $display("{a,b,c}=%b => y=%b (expect 0)",{a,b,c},y);
        $finish;
    end
endmodule
`,
  hiddenTestbench: `\`timescale 1ns / 1ps
module tb_kmap_3var_hidden;
    reg a,b,c; wire y;
    integer errors;
    integer i;
    reg expected;
    kmap_3var dut (.a(a),.b(b),.c(c),.y(y));
    initial begin
        errors = 0;
        for (i=0;i<8;i=i+1) begin
            {a,b,c}=i[2:0]; #5;
            // minterms 1,3,5,7 → all odd → c=1
            expected = (i==1||i==3||i==5||i==7) ? 1'b1 : 1'b0;
            if(y!==expected) begin $display("FAIL m%0d exp %b got %b",i,expected,y); errors=errors+1; end
        end
        if(errors==0) $display("ALL TESTS PASSED");
        else $display("TESTS FAILED: %0d error(s)",errors);
        $finish;
    end
endmodule
`,
};

const kmapRTL4var: Problem = {
  id: "kmap-4var", slug: "kmap-4var", title: "K-Map to RTL (4 Variables)",
  difficulty: "beginner", category: "combinational",
  tags: ["K-map", "interview", "combinational"],
  learningLevel: "Verilog Beginner", moduleId: "mod_combinational", orderIndex: 38,
  xpReward: 60, waveformRequired: false, expectedOutputMode: "stdout_compare",
  statement: `## K-Map to RTL (4 Variables)

A 4-variable K-map has minterms at **{0, 1, 2, 3, 8, 9, 10, 11}**.

Variables: \`a\` (MSB), \`b\`, \`c\`, \`d\` (LSB). Minterm \`m\` = input \`{a,b,c,d}=m\`.

**K-Map:**
\`\`\`
      cd
ab  | 00 | 01 | 11 | 10 |
----|----|----|----|----|
 00 |  1 |  1 |  1 |  1 |
 01 |  0 |  0 |  0 |  0 |
 11 |  0 |  0 |  0 |  0 |
 10 |  1 |  1 |  1 |  1 |
\`\`\`

Group the two rows of 1s. The minimized expression is: **y = ~b**

Implement as a single \`assign\`. Show groupings in comments.`,
  constraints: ["Single assign statement.", "Add grouping comment."],
  examples: [
    { input: "a=0, b=0, c=0, d=0 (m=0)", output: "y=1" },
    { input: "a=0, b=1, c=0, d=0 (m=4)", output: "y=0" },
  ],
  hints: [{ tier: 1, content: "Minterms {0-3} have b=0; minterms {8-11} have b=0 (a=1,b=0). All 1-cells share b=0. So y=~b." }],
  publicTestcases: [], hiddenTestcases: [],
  starterCode: `\`timescale 1ns / 1ps

module kmap_4var (
    input  wire a,
    input  wire b,
    input  wire c,
    input  wire d,
    output wire y
);

    // K-Map minterms: {0,1,2,3,8,9,10,11}
    // Grouping: two octet rows where b=0
    // Minimized expression: y = ~b
    // TODO: assign y = ...;

endmodule
`,
  publicTestbench: `\`timescale 1ns / 1ps
module tb_kmap_4var;
    reg a,b,c,d; wire y;
    kmap_4var dut (.a(a),.b(b),.c(c),.d(d),.y(y));
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_kmap_4var); end
    initial begin
        $display("=== K-Map 4var Test ===");
        a=0;b=0;c=0;d=0;#5; $display("m0 => y=%b (expect 1)",y);
        a=0;b=1;c=0;d=0;#5; $display("m4 => y=%b (expect 0)",y);
        a=1;b=0;c=1;d=1;#5; $display("m11 => y=%b (expect 1)",y);
        a=1;b=1;c=0;d=0;#5; $display("m12 => y=%b (expect 0)",y);
        $finish;
    end
endmodule
`,
  hiddenTestbench: `\`timescale 1ns / 1ps
module tb_kmap_4var_hidden;
    reg a,b,c,d; wire y;
    integer errors;
    integer i;
    reg expected;
    kmap_4var dut (.a(a),.b(b),.c(c),.d(d),.y(y));
    initial begin
        errors = 0;
        for (i=0;i<16;i=i+1) begin
            {a,b,c,d}=i[3:0]; #5;
            expected = (i==0||i==1||i==2||i==3||i==8||i==9||i==10||i==11) ? 1'b1 : 1'b0;
            if(y!==expected) begin $display("FAIL m%0d exp %b got %b",i,expected,y); errors=errors+1; end
        end
        if(errors==0) $display("ALL TESTS PASSED");
        else $display("TESTS FAILED: %0d error(s)",errors);
        $finish;
    end
endmodule
`,
};

const kmapDontCares: Problem = {
  id: "kmap-dont-cares", slug: "kmap-dont-cares", title: "K-Map with Don't Cares",
  difficulty: "beginner", category: "combinational",
  tags: ["K-map", "interview", "combinational", "don't-care"],
  learningLevel: "Verilog Beginner", moduleId: "mod_combinational", orderIndex: 39,
  xpReward: 65, waveformRequired: false, expectedOutputMode: "stdout_compare",
  statement: `## K-Map with Don't Cares

A 4-variable K-map has:
- **Minterms (output=1):** {1, 3, 7, 11, 15}
- **Don't-cares (X):** {0, 2, 5}

Variables: \`a\` (MSB), \`b\`, \`c\`, \`d\` (LSB).

**K-Map (X = don't care):**
\`\`\`
      cd
ab  | 00 | 01 | 11 | 10 |
----|----|----|----|----|
 00 |  X |  1 |  1 |  X |
 01 |  0 |  X |  1 |  0 |
 11 |  0 |  0 |  1 |  0 |
 10 |  0 |  0 |  1 |  0 |
\`\`\`

Using don't-cares to make the groups as large as possible gives two groups:
- the \`cd = 11\` column (minterms 3, 7, 11, 15) → \`c & d\`
- the \`ab = 00\` row (minterms 1, 3 plus don't-cares 0, 2) → \`~a & ~b\`

Minimized expression: **y = (c & d) | (~a & ~b)**

Watch out: \`y = d\` is *not* correct. It would also output 1 for minterms 9 and 13, which are 0 in the map.

Implement as a single assign. Verify only against the true minterms (don't-cares can be 0 or 1).`,
  constraints: ["Single assign statement.", "Show don't-care grouping in a comment."],
  examples: [
    { input: "any input with d=1", output: "y=1" },
    { input: "any input with d=0 (not a minterm)", output: "y=0" },
  ],
  hints: [
    { tier: 1, content: "All minterms {1,3,7,11,15} have d=1. Don't-cares {0,2,5} allow maximally grouping. The simplest cover is y=d." },
  ],
  publicTestcases: [], hiddenTestcases: [],
  starterCode: `\`timescale 1ns / 1ps

module kmap_dont_cares (
    input  wire a,
    input  wire b,
    input  wire c,
    input  wire d,
    output wire y
);

    // Minterms: {1,3,7,11,15}  Don't-cares: {0,2,5}
    // Group the 1s, using don't-cares only where they make a group bigger
    // TODO: assign y = ...;

endmodule
`,
  publicTestbench: `\`timescale 1ns / 1ps
module tb_kmap_dont_cares;
    reg a,b,c,d; wire y;
    kmap_dont_cares dut (.a(a),.b(b),.c(c),.d(d),.y(y));
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_kmap_dont_cares); end
    initial begin
        $display("=== K-Map Don't Cares Test ===");
        a=0;b=0;c=0;d=1;#5; $display("m1  => y=%b (expect 1)",y);
        a=0;b=0;c=1;d=1;#5; $display("m3  => y=%b (expect 1)",y);
        a=0;b=1;c=1;d=1;#5; $display("m7  => y=%b (expect 1)",y);
        a=1;b=0;c=1;d=1;#5; $display("m11 => y=%b (expect 1)",y);
        a=1;b=1;c=1;d=1;#5; $display("m15 => y=%b (expect 1)",y);
        a=0;b=1;c=0;d=0;#5; $display("m4  => y=%b (expect 0)",y);
        $finish;
    end
endmodule
`,
  hiddenTestbench: `\`timescale 1ns / 1ps
module tb_kmap_dont_cares_hidden;
    reg a,b,c,d; wire y;
    integer errors;
    integer i;
    kmap_dont_cares dut (.a(a),.b(b),.c(c),.d(d),.y(y));
    initial begin
        errors = 0;
        // Test definite minterms (must be 1)
        for (i=0;i<16;i=i+1) begin
            {a,b,c,d}=i[3:0]; #5;
            if (i==1||i==3||i==7||i==11||i==15) begin
                if(y!==1'b1) begin $display("FAIL minterm m%0d exp 1 got %b",i,y); errors=errors+1; end
            end else if (i!=0&&i!=2&&i!=5) begin
                // Not a minterm, not a don't-care → must be 0
                if(y!==1'b0) begin $display("FAIL off-set m%0d exp 0 got %b",i,y); errors=errors+1; end
            end
        end
        if(errors==0) $display("ALL TESTS PASSED");
        else $display("TESTS FAILED: %0d error(s)",errors);
        $finish;
    end
endmodule
`,
};

// ─────────────────────────────────────────────────────────────────────────────
// Export
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// NEW — MUX 8:1, DEMUX family, Octal Encoder, 2:4 Decoder
// ─────────────────────────────────────────────────────────────────────────────

const mux8to1: Problem = {
  id: "mux-8to1", slug: "mux-8to1", title: "8-to-1 Multiplexer",
  difficulty: "beginner", category: "combinational",
  tags: ["case", "mux", "always"],
  learningLevel: "Verilog Beginner", moduleId: "mod_combinational", orderIndex: 23,
  xpReward: 50, waveformRequired: false, expectedOutputMode: "stdout_compare",
  statement: `## 8-to-1 Multiplexer

8 data inputs \`d[7:0]\` (1-bit each), 3-bit select \`s[2:0]\`, 1-bit output \`y\`.

The select picks which input passes to the output — the same pattern as 4:1 MUX, extended to a 3-bit select.

| s   | y    |
|-----|------|
| 000 | d[0] |
| 001 | d[1] |
| 010 | d[2] |
| 011 | d[3] |
| 100 | d[4] |
| 101 | d[5] |
| 110 | d[6] |
| 111 | d[7] |

Use \`case(s)\` inside \`always @(*)\` with a \`default\` branch.`,
  constraints: ["Use case inside always @(*) with 8 arms + default.", "Declare y as output reg."],
  examples: [
    { input: "d=8'b10110100, s=3'b010", output: "y=1 (d[2])" },
    { input: "d=8'b10110100, s=3'b000", output: "y=0 (d[0])" },
  ],
  hints: [
    { tier: 1, content: "Eight case arms: `3'd0: y=d[0];` through `3'd7: y=d[7];` plus default." },
  ],
  publicTestcases: [], hiddenTestcases: [],
  starterCode: `\`timescale 1ns / 1ps

module mux_8to1 (
    input  wire [7:0] d,
    input  wire [2:0] s,
    output reg        y
);

    always @(*) begin
        case (s)
            // TODO: 8 cases
            // 3'd0: y = d[0];
            // 3'd1: y = d[1];
            // ...
            default: y = 1'b0;
        endcase
    end

endmodule
`,
  publicTestbench: `\`timescale 1ns / 1ps
module tb_mux_8to1;
    reg [7:0] d; reg [2:0] s; wire y;
    integer i;
    mux_8to1 dut (.d(d),.s(s),.y(y));
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_mux_8to1); end
    initial begin
        $display("=== 8-to-1 MUX Test ===");
        d = 8'b10110100;
        for (i=0; i<8; i=i+1) begin
            s = i[2:0]; #10;
            $display("s=%0d => y=%b (expect d[%0d]=%b)", s, y, i, d[i]);
        end
        $finish;
    end
endmodule
`,
  hiddenTestbench: `\`timescale 1ns / 1ps
module tb_mux_8to1_hidden;
    reg [7:0] d; reg [2:0] s; wire y;
    integer errors;
    integer i;
    integer j;
    mux_8to1 dut (.d(d),.s(s),.y(y));
    initial begin
        errors = 0;
        for (i=0; i<16; i=i+1) begin
            d = i[7:0];
            for (j=0; j<8; j=j+1) begin
                s = j[2:0]; #5;
                if (y !== d[j]) begin
                    $display("FAIL d=%b s=%0d exp %b got %b",d,j,d[j],y);
                    errors = errors + 1;
                end
            end
        end
        if (errors==0) $display("ALL TESTS PASSED");
        else $display("TESTS FAILED: %0d error(s)",errors);
        $finish;
    end
endmodule
`,
};

const demux1to2: Problem = {
  id: "demux-1to2", slug: "demux-1to2", title: "1-to-2 Demultiplexer",
  difficulty: "beginner", category: "combinational",
  tags: ["demux", "assign", "combinational"],
  learningLevel: "Verilog Beginner", moduleId: "mod_combinational", orderIndex: 24,
  xpReward: 40, waveformRequired: false, expectedOutputMode: "stdout_compare",
  statement: `## 1-to-2 Demultiplexer

A DEMUX is the **inverse of a MUX**: it routes one input to one of several outputs. Unselected outputs are 0.

Input: 1-bit \`in\`, 1-bit select \`s\`. Outputs: \`y0\`, \`y1\`.

- \`s=0\`: \`y0=in\`, \`y1=0\`
- \`s=1\`: \`y0=0\`,  \`y1=in\`

Implement with two \`assign\` statements using AND and NOT.`,
  constraints: ["Two assign statements. Unselected output must be 0.", "No always block needed."],
  examples: [
    { input: "in=1, s=0", output: "y0=1, y1=0" },
    { input: "in=1, s=1", output: "y0=0, y1=1" },
    { input: "in=0, s=0", output: "y0=0, y1=0" },
  ],
  hints: [
    { tier: 1, content: "`assign y0 = in & ~s;  assign y1 = in & s;`" },
  ],
  publicTestcases: [], hiddenTestcases: [],
  starterCode: `\`timescale 1ns / 1ps

module demux_1to2 (
    input  wire in,
    input  wire s,
    output wire y0,
    output wire y1
);

    // When s=0: y0=in, y1=0
    // When s=1: y0=0,  y1=in
    // assign y0 = in & ~s;
    // assign y1 = in &  s;

endmodule
`,
  publicTestbench: `\`timescale 1ns / 1ps
module tb_demux_1to2;
    reg in, s; wire y0, y1;
    demux_1to2 dut (.in(in),.s(s),.y0(y0),.y1(y1));
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_demux_1to2); end
    initial begin
        $display("=== DEMUX 1:2 Test ===");
        in=1; s=0; #10; $display("in=%b s=%b => y0=%b y1=%b (expect 1 0)",in,s,y0,y1);
        in=1; s=1; #10; $display("in=%b s=%b => y0=%b y1=%b (expect 0 1)",in,s,y0,y1);
        in=0; s=0; #10; $display("in=%b s=%b => y0=%b y1=%b (expect 0 0)",in,s,y0,y1);
        in=0; s=1; #10; $display("in=%b s=%b => y0=%b y1=%b (expect 0 0)",in,s,y0,y1);
        $finish;
    end
endmodule
`,
  hiddenTestbench: `\`timescale 1ns / 1ps
module tb_demux_1to2_hidden;
    reg in, s; wire y0, y1;
    integer errors;
    demux_1to2 dut (.in(in),.s(s),.y0(y0),.y1(y1));
    initial begin
        errors = 0;
        in=1; s=0; #5; if(y0!==1||y1!==0) begin $display("FAIL in=1 s=0 exp y0=1,y1=0 got %b,%b",y0,y1); errors=errors+1; end
        in=1; s=1; #5; if(y0!==0||y1!==1) begin $display("FAIL in=1 s=1 exp y0=0,y1=1 got %b,%b",y0,y1); errors=errors+1; end
        in=0; s=0; #5; if(y0!==0||y1!==0) begin $display("FAIL in=0 s=0 exp 0,0 got %b,%b",y0,y1); errors=errors+1; end
        in=0; s=1; #5; if(y0!==0||y1!==0) begin $display("FAIL in=0 s=1 exp 0,0 got %b,%b",y0,y1); errors=errors+1; end
        if (errors==0) $display("ALL TESTS PASSED");
        else $display("TESTS FAILED: %0d error(s)",errors);
        $finish;
    end
endmodule
`,
};

const demux1to4: Problem = {
  id: "demux-1to4", slug: "demux-1to4", title: "1-to-4 Demultiplexer",
  difficulty: "beginner", category: "combinational",
  tags: ["demux", "case", "always"],
  learningLevel: "Verilog Beginner", moduleId: "mod_combinational", orderIndex: 25,
  xpReward: 45, waveformRequired: false, expectedOutputMode: "stdout_compare",
  statement: `## 1-to-4 Demultiplexer

Input: 1-bit \`in\`, 2-bit select \`s[1:0]\`. Outputs: \`y[3:0]\`.

The selected output gets \`in\`; all others are 0.

- \`s=00 → y[0]=in, y[3:1]=0\`
- \`s=01 → y[1]=in, y[3:2]=0, y[0]=0\`
- \`s=10 → y[2]=in, others=0\`
- \`s=11 → y[3]=in, y[2:0]=0\`

Use \`always @(*)\` with \`case\`. Default all outputs to 0 first, then set the active one.`,
  constraints: [
    "Use case inside always @(*).",
    "Default y=4\'b0000 at top of always block to prevent latches.",
    "Declare y as output reg [3:0].",
  ],
  examples: [
    { input: "in=1, s=2\'b10", output: "y=4\'b0100" },
    { input: "in=0, s=2\'b10", output: "y=4\'b0000" },
  ],
  hints: [
    { tier: 1, content: "Set `y=4\'b0000;` first, then case(s) to set the active bit: `2\'b00: y[0]=in;`" },
  ],
  publicTestcases: [], hiddenTestcases: [],
  starterCode: `\`timescale 1ns / 1ps

module demux_1to4 (
    input  wire       in,
    input  wire [1:0] s,
    output reg  [3:0] y
);

    always @(*) begin
        y = 4'b0000; // default all outputs to 0
        case (s)
            // TODO: route in to the selected output bit
            // 2'b00: y[0] = in;
            // 2'b01: y[1] = in;
            // 2'b10: y[2] = in;
            // 2'b11: y[3] = in;
            default: ;
        endcase
    end

endmodule
`,
  publicTestbench: `\`timescale 1ns / 1ps
module tb_demux_1to4;
    reg in; reg [1:0] s; wire [3:0] y;
    demux_1to4 dut (.in(in),.s(s),.y(y));
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_demux_1to4); end
    initial begin
        $display("=== DEMUX 1:4 Test ===");
        in=1; s=2'b00;#10; $display("s=00 in=1 => y=%b (expect 0001)",y);
        in=1; s=2'b01;#10; $display("s=01 in=1 => y=%b (expect 0010)",y);
        in=1; s=2'b10;#10; $display("s=10 in=1 => y=%b (expect 0100)",y);
        in=1; s=2'b11;#10; $display("s=11 in=1 => y=%b (expect 1000)",y);
        in=0; s=2'b10;#10; $display("s=10 in=0 => y=%b (expect 0000)",y);
        $finish;
    end
endmodule
`,
  hiddenTestbench: `\`timescale 1ns / 1ps
module tb_demux_1to4_hidden;
    reg in; reg [1:0] s; wire [3:0] y;
    integer errors;
    integer i;
    demux_1to4 dut (.in(in),.s(s),.y(y));
    initial begin
        errors = 0;
        in = 1;
        for (i=0; i<4; i=i+1) begin
            s = i[1:0]; #5;
            if (y !== (4'b0001 << i)) begin
                $display("FAIL in=1 s=%0d exp %b got %b",i,(4'b0001<<i),y);
                errors = errors + 1;
            end
        end
        in = 0;
        for (i=0; i<4; i=i+1) begin
            s = i[1:0]; #5;
            if (y !== 4'b0000) begin
                $display("FAIL in=0 s=%0d exp 0000 got %b",i,y);
                errors = errors + 1;
            end
        end
        if (errors==0) $display("ALL TESTS PASSED");
        else $display("TESTS FAILED: %0d error(s)",errors);
        $finish;
    end
endmodule
`,
};

const demux1to8: Problem = {
  id: "demux-1to8", slug: "demux-1to8", title: "1-to-8 Demultiplexer",
  difficulty: "beginner", category: "combinational",
  tags: ["demux", "case", "always"],
  learningLevel: "Verilog Beginner", moduleId: "mod_combinational", orderIndex: 26,
  xpReward: 45, waveformRequired: false, expectedOutputMode: "stdout_compare",
  statement: `## 1-to-8 Demultiplexer

Input: 1-bit \`in\`, 3-bit select \`s[2:0]\`. Outputs: \`y[7:0]\`.

Routes \`in\` to \`y[s]\`; all other outputs are 0. Same pattern as 1:4, extended to 3-bit select and 8 outputs.`,
  constraints: [
    "Use case inside always @(*).",
    "Default y=8\'b0 to prevent latches.",
    "Declare y as output reg [7:0].",
  ],
  examples: [
    { input: "in=1, s=3\'b101", output: "y=8\'b00100000" },
    { input: "in=0, s=3\'b101", output: "y=8\'b00000000" },
  ],
  hints: [
    { tier: 1, content: "Default `y=8\'b0;` then eight case arms: `3\'d0: y[0]=in;` through `3\'d7: y[7]=in;`" },
  ],
  publicTestcases: [], hiddenTestcases: [],
  starterCode: `\`timescale 1ns / 1ps

module demux_1to8 (
    input  wire       in,
    input  wire [2:0] s,
    output reg  [7:0] y
);

    always @(*) begin
        y = 8'b00000000;
        case (s)
            // TODO: route in to the selected output bit
            // 3'd0: y[0] = in;
            // 3'd1: y[1] = in;
            // ...
            default: ;
        endcase
    end

endmodule
`,
  publicTestbench: `\`timescale 1ns / 1ps
module tb_demux_1to8;
    reg in; reg [2:0] s; wire [7:0] y;
    integer i;
    demux_1to8 dut (.in(in),.s(s),.y(y));
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_demux_1to8); end
    initial begin
        $display("=== DEMUX 1:8 Test ===");
        in=1;
        for (i=0; i<8; i=i+1) begin
            s=i[2:0]; #10;
            $display("s=%0d => y=%b",s,y);
        end
        $finish;
    end
endmodule
`,
  hiddenTestbench: `\`timescale 1ns / 1ps
module tb_demux_1to8_hidden;
    reg in; reg [2:0] s; wire [7:0] y;
    integer errors;
    integer i;
    demux_1to8 dut (.in(in),.s(s),.y(y));
    initial begin
        errors = 0;
        in = 1;
        for (i=0; i<8; i=i+1) begin
            s = i[2:0]; #5;
            if (y !== (8'b00000001 << i)) begin
                $display("FAIL in=1 s=%0d exp %b got %b",i,(8'b1<<i),y);
                errors = errors + 1;
            end
        end
        in = 0;
        for (i=0; i<8; i=i+1) begin
            s = i[2:0]; #5;
            if (y !== 8'b0) begin
                $display("FAIL in=0 s=%0d exp 0 got %b",i,y);
                errors = errors + 1;
            end
        end
        if (errors==0) $display("ALL TESTS PASSED");
        else $display("TESTS FAILED: %0d error(s)",errors);
        $finish;
    end
endmodule
`,
};

const octalEncoder: Problem = {
  id: "octal-encoder", slug: "octal-encoder", title: "Octal-to-Binary Encoder",
  difficulty: "beginner", category: "combinational",
  tags: ["encoder", "case", "always", "one-hot"],
  learningLevel: "Verilog Beginner", moduleId: "mod_combinational", orderIndex: 27,
  xpReward: 45, waveformRequired: false, expectedOutputMode: "stdout_compare",
  statement: `## Octal-to-Binary Encoder

An encoder converts a **one-hot** input to a compact binary code. The inverse of a decoder.

Input: 8-bit one-hot \`in[7:0]\` (exactly one bit is high). Output: 3-bit binary \`out[2:0]\`.

| in (one-hot)  | out |
|---------------|-----|
| 8'b00000001  | 000 |
| 8'b00000010  | 001 |
| 8'b00000100  | 010 |
| 8'b00001000  | 011 |
| 8'b00010000  | 100 |
| 8'b00100000  | 101 |
| 8'b01000000  | 110 |
| 8'b10000000  | 111 |

Use \`case(in)\` with one-hot input patterns. Default output: \`3'b000\`.`,
  constraints: ["Use case inside always @(*). Include a default branch."],
  examples: [
    { input: "in=8\'b00001000", output: "out=3\'b011 (decimal 3)" },
    { input: "in=8\'b10000000", output: "out=3\'b111 (decimal 7)" },
  ],
  hints: [
    { tier: 1, content: "case(in) with one-hot input values: `8\'b00000001: out=3\'d0;` through `8\'b10000000: out=3\'d7;`" },
  ],
  publicTestcases: [], hiddenTestcases: [],
  starterCode: `\`timescale 1ns / 1ps

module octal_encoder (
    input  wire [7:0] in,
    output reg  [2:0] out
);

    always @(*) begin
        case (in)
            8'b00000001: out = 3'd0;
            8'b00000010: out = 3'd1;
            // TODO: add cases for 3'd2 through 3'd7
            default: out = 3'd0;
        endcase
    end

endmodule
`,
  publicTestbench: `\`timescale 1ns / 1ps
module tb_octal_encoder;
    reg [7:0] in; wire [2:0] out;
    integer i;
    octal_encoder dut (.in(in),.out(out));
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_octal_encoder); end
    initial begin
        $display("=== Octal Encoder Test ===");
        for (i=0; i<8; i=i+1) begin
            in = 8'b00000001 << i; #10;
            $display("in=%b => out=%0d (expect %0d)", in, out, i);
        end
        $finish;
    end
endmodule
`,
  hiddenTestbench: `\`timescale 1ns / 1ps
module tb_octal_encoder_hidden;
    reg [7:0] in; wire [2:0] out;
    integer errors;
    integer i;
    octal_encoder dut (.in(in),.out(out));
    initial begin
        errors = 0;
        for (i=0; i<8; i=i+1) begin
            in = 8'b00000001 << i; #5;
            if (out !== i[2:0]) begin
                $display("FAIL in=%b exp %0d got %0d", in, i, out);
                errors = errors + 1;
            end
        end
        if (errors==0) $display("ALL TESTS PASSED");
        else $display("TESTS FAILED: %0d error(s)",errors);
        $finish;
    end
endmodule
`,
};

const decoder2to4: Problem = {
  id: "decoder-2to4", slug: "decoder-2to4", title: "2-to-4 Decoder",
  difficulty: "beginner", category: "combinational",
  tags: ["decoder", "case", "always", "enable"],
  learningLevel: "Verilog Beginner", moduleId: "mod_combinational", orderIndex: 28,
  xpReward: 45, waveformRequired: false, expectedOutputMode: "stdout_compare",
  statement: `## 2-to-4 Decoder

A decoder converts a binary address to a one-hot output — exactly one output is active.

Inputs: 2-bit \`in[1:0]\`, 1-bit active-high enable \`en\`. Output: 4-bit \`y[3:0]\` (one-hot, active-high).

When \`en=0\`, all outputs are 0.

| en | in | y    |
|----|----|------|
| 1  | 00 | 0001 |
| 1  | 01 | 0010 |
| 1  | 10 | 0100 |
| 1  | 11 | 1000 |
| 0  | XX | 0000 |`,
  constraints: [
    "Use always @(*) with case. Check en first.",
    "Default y=4\'b0000 to prevent latches.",
  ],
  examples: [
    { input: "en=1, in=2\'b10", output: "y=4\'b0100" },
    { input: "en=0, in=2\'b10", output: "y=4\'b0000" },
  ],
  hints: [
    { tier: 1, content: "Set `y=4\'b0000;` first. Then `if(en) case(in)` to activate the selected output." },
    { tier: 2, content: "`2\'b00: y=4\'b0001; 2\'b01: y=4\'b0010; 2\'b10: y=4\'b0100; 2\'b11: y=4\'b1000;`" },
  ],
  publicTestcases: [], hiddenTestcases: [],
  starterCode: `\`timescale 1ns / 1ps

module decoder_2to4 (
    input  wire [1:0] in,
    input  wire       en,
    output reg  [3:0] y
);

    always @(*) begin
        y = 4'b0000; // default: all off
        if (en) begin
            case (in)
                // TODO: 4 cases — activate the selected output
                // 2'b00: y = 4'b0001;
                // 2'b01: y = 4'b0010;
                // 2'b10: y = 4'b0100;
                // 2'b11: y = 4'b1000;
                default: y = 4'b0000;
            endcase
        end
    end

endmodule
`,
  publicTestbench: `\`timescale 1ns / 1ps
module tb_decoder_2to4;
    reg [1:0] in; reg en; wire [3:0] y;
    decoder_2to4 dut (.in(in),.en(en),.y(y));
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_decoder_2to4); end
    initial begin
        $display("=== 2:4 Decoder Test ===");
        en=1; in=2'b00;#10; $display("en=1 in=00 => y=%b (expect 0001)",y);
        en=1; in=2'b01;#10; $display("en=1 in=01 => y=%b (expect 0010)",y);
        en=1; in=2'b10;#10; $display("en=1 in=10 => y=%b (expect 0100)",y);
        en=1; in=2'b11;#10; $display("en=1 in=11 => y=%b (expect 1000)",y);
        en=0; in=2'b10;#10; $display("en=0 in=10 => y=%b (expect 0000)",y);
        $finish;
    end
endmodule
`,
  hiddenTestbench: `\`timescale 1ns / 1ps
module tb_decoder_2to4_hidden;
    reg [1:0] in; reg en; wire [3:0] y;
    integer errors;
    integer i;
    decoder_2to4 dut (.in(in),.en(en),.y(y));
    initial begin
        errors = 0;
        en = 1;
        for (i=0; i<4; i=i+1) begin
            in = i[1:0]; #5;
            if (y !== (4'b0001 << i)) begin
                $display("FAIL en=1 in=%0d exp %b got %b",i,(4'b0001<<i),y);
                errors = errors + 1;
            end
        end
        en = 0;
        for (i=0; i<4; i=i+1) begin
            in = i[1:0]; #5;
            if (y !== 4'b0000) begin
                $display("FAIL en=0 in=%0d exp 0000 got %b",i,y);
                errors = errors + 1;
            end
        end
        if (errors==0) $display("ALL TESTS PASSED");
        else $display("TESTS FAILED: %0d error(s)",errors);
        $finish;
    end
endmodule
`,
};

export const BEGINNER_PROBLEMS: Problem[] = [
  // ── M01: Hello Hardware (Logic Gates) ── orderIndex 1–10
  theFirstWire,          // 1  — wire passthrough, assign
  fourWires,             // 2  — multi-port wiring
  inverter,              // 3  — NOT gate, ~ operator
  andGate,               // 4  — AND gate
  orGate,                // 5  — OR gate
  nandGate,              // 6  — NAND: functional completeness
  norGate,               // 7  — NOR gate
  xorGate,               // 8  — XOR gate
  xnorGate,              // 9  — XNOR / equivalence gate
  chip7458,              // 10 — real datasheet, compound AND-OR

  // ── M02: Vectors & Bit Manipulation ── orderIndex 11–16
  eightBitAnd,           // 11 — 8-bit bitwise AND, vector operators
  bitSelectPartSelect,   // 12 — part-select, nibble extraction
  byteSwap,              // 13 — concatenation {}, endian reversal
  signExtension,         // 14 — replication {N{x}}, sign extend
  evenParityGenerator,   // 15 — reduction XOR ^data, parity
  populationCount,       // 16 — for loop in always@(*), popcount

  // ── M03: Modules & Hierarchy ── orderIndex 17–20
  halfAdder,             // 17 — first arithmetic module, XOR+AND
  threeInvertersChain,   // 18 — instantiation syntax, named ports
  rippleCarryAdder4,     // 19 — chain 4 full_adders, carry propagation
  adderSubtractor,       // 20 — XOR trick, two's complement subtraction

  // ── M04: Always Blocks & Combinational Decisions ── orderIndex 21–32
  mux2to1,               // 21 — always@(*) if-else, first always block
  mux4to1,               // 22 — case statement, 4 arms
  mux8to1,               // 23 — case statement, 8 arms (wider select)
  demux1to2,             // 24 — DEMUX concept, inverse of MUX
  demux1to4,             // 25 — DEMUX 1:4 with 2-bit select
  demux1to8,             // 26 — DEMUX 1:8 with 3-bit select
  octalEncoder,          // 27 — one-hot to binary, case with one-hot inputs
  decoder2to4,           // 28 — binary to one-hot, enable signal
  spotTheLatch,          // 29 — debug: find & fix missing else/latch
  sevenSegDecoder,       // 30 — BCD decoder, large case table
  priorityEncoder,       // 31 — casez, don't-care matching
  decoder3to8,           // 32 — 74138 style, active-low outputs

  // ── M05: Real Combinational Designs ── orderIndex 33–39
  fullAdder,             // 33 — full adder (structural + behavioral)
  barrelShifter,         // 34 — MUX-based shifter, no << >> operators
  grayCodeConverter,     // 35 — Gray code: XOR chain + for loop
  magnitudeComparator,   // 36 — comparison operators, mutual exclusion
  kmapRTL3var,           // 37 — K-map minimization, 3 variables
  kmapRTL4var,           // 38 — K-map minimization, 4 variables
  kmapDontCares,         // 39 — don't-cares for optimal grouping

  // ── Sequential: Gateway to Intermediate ── orderIndex 40
  dFlipFlop,             // 40 — posedge, non-blocking, synchronous reset
];