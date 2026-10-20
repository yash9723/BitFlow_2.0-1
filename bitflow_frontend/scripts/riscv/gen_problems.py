"""Build lib/problems/riscv.ts: the "Build a RISC-V CPU" track (6 steps).

    cd bitflow_frontend/scripts/riscv && python gen_problems.py

Testbenches come from gen_tbs.py, whose expected values come from rv.py (a
Python model of RV32I). Reference solutions are private (private/riscv/,
imported with scripts/import-reference-solutions.ts) and verified there.
"""
import json, os
import gen_tbs

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "..", "lib", "problems", "riscv.ts")
TS = "`timescale 1ns / 1ps\n\n"

# ── Starter stubs (compile, but do nothing) ──────────────────────────────────
ALU_STUB = """module rv_alu (
    input  wire [31:0] a,
    input  wire [31:0] b,
    input  wire [3:0]  op,
    output wire [31:0] y,
    output wire        zero
);
    assign y = 32'd0;
    assign zero = 1'b1;
endmodule
"""
REGFILE_STUB = """module rv_regfile (
    input  wire        clk,
    input  wire        we,
    input  wire [4:0]  rs1,
    input  wire [4:0]  rs2,
    input  wire [4:0]  rd,
    input  wire [31:0] wd,
    output wire [31:0] rd1,
    output wire [31:0] rd2
);
    assign rd1 = 32'd0;
    assign rd2 = 32'd0;
endmodule
"""
IMMGEN_STUB = """module rv_immgen (
    input  wire [31:0] instr,
    output wire [31:0] imm
);
    assign imm = 32'd0;
endmodule
"""
BRANCH_STUB = """module rv_branch (
    input  wire [31:0] a,
    input  wire [31:0] b,
    input  wire [2:0]  funct3,
    output wire        take
);
    assign take = 1'b0;
endmodule
"""

CPU_PORTS = """module rv_cpu (
    input  wire        clk,
    input  wire        rst,          // synchronous, active high
    output wire [31:0] imem_addr,    // address of the instruction to fetch
    input  wire [31:0] imem_data,    // the instruction (combinational read)
    output wire [31:0] dmem_addr,    // load/store byte address
    output wire [31:0] dmem_wdata,   // store data
    output wire        dmem_we,      // 1 = store this cycle
    input  wire [31:0] dmem_rdata,   // load data (combinational read)
    output wire        wb_en,        // 1 = this instruction writes register wb_rd
    output wire [4:0]  wb_rd,
    output wire [31:0] wb_data
);"""

CPU_SKELETON = CPU_PORTS + """
    localparam OP = 7'b0110011, OPIMM = 7'b0010011, LUI = 7'b0110111, AUIPC = 7'b0010111;

    reg  [31:0] pc;
    wire [31:0] instr  = imem_data;
    wire [6:0]  opcode = instr[6:0];
    wire [2:0]  funct3 = instr[14:12];
    wire [4:0]  rd = instr[11:7], rs1 = instr[19:15], rs2 = instr[24:20];

    wire [31:0] imm, rv1, rv2, alu_y;
    wire        alu_zero;
    rv_immgen  u_imm (.instr(instr), .imm(imm));
    rv_regfile u_rf  (.clk(clk), .we(wb_en), .rs1(rs1), .rs2(rs2), .rd(rd), .wd(wb_data), .rd1(rv1), .rd2(rv2));

    // TODO: choose the ALU operation and second operand from the instruction
    wire [3:0]  alu_op = 4'b0000;
    wire [31:0] alu_b  = rv2;
    rv_alu     u_alu (.a(rv1), .b(alu_b), .op(alu_op), .y(alu_y), .zero(alu_zero));

    // TODO: write back for OP, OP-IMM, LUI and AUIPC (and never while rst is high)
    assign wb_en   = 1'b0;
    assign wb_rd   = rd;
    assign wb_data = alu_y;

    assign imem_addr  = pc;
    assign dmem_addr  = 32'd0;      // memory comes in the next step
    assign dmem_wdata = 32'd0;
    assign dmem_we    = 1'b0;

    always @(posedge clk) begin
        if (rst) pc <= 32'd0;
        else     pc <= pc + 32'd4;   // straight-line code only, for now
    end
endmodule
"""

def step(slug, body):
    return f"// @step {slug}\n{body}// @end\n"

STARTERS = {
    "rv-alu": TS + """// RISC-V step 1: the ALU. op = {funct7[5], funct3}; see the table in the statement.
module rv_alu (
    input  wire [31:0] a,
    input  wire [31:0] b,
    input  wire [3:0]  op,
    output reg  [31:0] y,
    output wire        zero
);
    always @(*) begin
        case (op)
            4'b0000: y = a + b;          // ADD
            // TODO: SUB, SLL, SLT, SLTU, XOR, SRL, SRA, OR, AND
            default: y = 32'd0;
        endcase
    end

    assign zero = 1'b0;   // TODO: 1 when y is all zeros
endmodule
""",
    "rv-regfile": TS + """// RISC-V step 2: 32 registers, two read ports, one write port. x0 is always 0.
module rv_regfile (
    input  wire        clk,
    input  wire        we,
    input  wire [4:0]  rs1,
    input  wire [4:0]  rs2,
    input  wire [4:0]  rd,
    input  wire [31:0] wd,
    output wire [31:0] rd1,
    output wire [31:0] rd2
);
    reg [31:0] regs [1:31];   // x1..x31 (x0 needs no storage)

    // TODO: on the rising edge, write wd into regs[rd] when we is 1 (and rd is not x0)

    // TODO: combinational reads; x0 always reads as 0
    assign rd1 = 32'd0;
    assign rd2 = 32'd0;
endmodule
""",
    "rv-immgen": TS + """// RISC-V step 3: the 32-bit immediate of any instruction, sign-extended.
module rv_immgen (
    input  wire [31:0] instr,
    output reg  [31:0] imm
);
    always @(*) begin
        case (instr[6:0])
            7'b0010011, 7'b0000011, 7'b1100111:          // I-type: OP-IMM, LOAD, JALR
                imm = {{20{instr[31]}}, instr[31:20]};
            // TODO: S-type (STORE), B-type (BRANCH), U-type (LUI, AUIPC), J-type (JAL)
            default:
                imm = 32'd0;
        endcase
    end
endmodule
""",
    "rv-branch": TS + """// RISC-V step 4: does a branch go? funct3 picks the comparison.
module rv_branch (
    input  wire [31:0] a,
    input  wire [31:0] b,
    input  wire [2:0]  funct3,
    output reg         take
);
    always @(*) begin
        case (funct3)
            3'b000:  take = (a == b);    // BEQ
            // TODO: BNE, BLT, BGE (signed), BLTU, BGEU (unsigned)
            default: take = 1'b0;
        endcase
    end
endmodule
""",
    "rv-datapath": TS + step("rv-alu", ALU_STUB) + "\n" + step("rv-regfile", REGFILE_STUB) + "\n" + step("rv-immgen", IMMGEN_STUB)
                  + "\n// RISC-V step 5: your first CPU. Runs OP, OP-IMM, LUI and AUIPC instructions.\n" + CPU_SKELETON,
    "rv-cpu": TS + step("rv-datapath", ALU_STUB + "\n" + REGFILE_STUB + "\n" + IMMGEN_STUB + "\n" + CPU_SKELETON) + "\n" + step("rv-branch", BRANCH_STUB)
              + "\n// RISC-V step 6: extend rv_cpu above with LW, SW, the six branches, JAL and JALR.\n"
                "// Instantiate rv_branch inside it to decide branches.\n",
}

CPU_INTERFACE = """**Interface** (the same for steps 5 and 6)

| Port | Dir | Width | Meaning |
|------|-----|-------|---------|
| `clk`, `rst` | in | 1 | Clock; synchronous active-high reset (PC = 0) |
| `imem_addr` | out | 32 | Address of the instruction to execute (the PC) |
| `imem_data` | in | 32 | That instruction; instruction memory reads combinationally |
| `dmem_addr`, `dmem_wdata`, `dmem_we` | out | 32, 32, 1 | Data memory: byte address, store data, store enable |
| `dmem_rdata` | in | 32 | Data memory read data at `dmem_addr` (combinational) |
| `wb_en`, `wb_rd`, `wb_data` | out | 1, 5, 32 | Register write-back: 1 when this instruction writes `x[wb_rd] = wb_data` |

The memories live in the testbench. The write-back port is how the tests see your results: they watch every register write.
Drive your register file's write port from `wb_en`, `wb_rd` and `wb_data` so the two always agree.

**Single-cycle:** each rising edge of `clk` finishes one instruction: registers and memory are written and the PC moves on.
**While `rst` is high:** `wb_en` and `dmem_we` must be 0 and the PC goes to 0.
`dmem_addr`/`dmem_wdata` only matter while loading or storing, and `wb_rd`/`wb_data` only while `wb_en` is 1."""

PROBLEMS = [
  dict(slug="rv-alu", title="RISC-V Step 1: The ALU", order=60, xp=220, tags=["risc-v", "alu", "combinational", "cpu"],
    statement="""## RISC-V Step 1: The ALU

Welcome to the **Build a RISC-V CPU** track. Over six steps you will build a working single-cycle processor for the RV32I instruction set,
one module at a time, and finish with a CPU that runs real programs: loops, function calls and memory.

This step is its arithmetic heart: the **ALU**. It takes two 32-bit operands and an operation code and produces a 32-bit result.

**Interface**

| Port | Dir | Width | Meaning |
|------|-----|-------|---------|
| `a`, `b` | in | 32 | Operands |
| `op` | in | 4 | Operation (table below) |
| `y` | out | 32 | Result |
| `zero` | out | 1 | 1 when `y` is all zeros |

**Operations.** `op` is `{funct7[5], funct3}`, exactly the bits a RISC-V register instruction carries, so your CPU can wire the instruction straight in later.

| `op` | Name | `y` |
|------|------|-----|
| 0000 | ADD  | `a + b` |
| 1000 | SUB  | `a - b` |
| 0001 | SLL  | `a` shifted left by `b[4:0]` |
| 0010 | SLT  | 1 if `a < b` as **signed** numbers, else 0 |
| 0011 | SLTU | 1 if `a < b` as **unsigned** numbers, else 0 |
| 0100 | XOR  | `a ^ b` |
| 0101 | SRL  | `a` shifted right by `b[4:0]`, zeros shifted in |
| 1101 | SRA  | `a` shifted right by `b[4:0]`, copies of the sign bit shifted in |
| 0110 | OR   | `a \\| b` |
| 0111 | AND  | `a & b` |

Shifts use only the low 5 bits of `b` (a shift of 33 is a shift of 1). Other `op` values are never used.""",
    constraints=["Purely combinational: no clock, no registers.", "Shift amounts are b[4:0] only.",
                 "SLT/SRA treat values as two's-complement signed; SLTU/SRL as unsigned.", "zero reflects the whole 32-bit result."],
    examples=[dict(input="op=ADD, a=5, b=7", output="y=12, zero=0", explanation="Plain addition"),
              dict(input="op=SUB, a=5, b=7", output="y=0xFFFFFFFE", explanation="-2 in two's complement"),
              dict(input="op=SLT, a=0xFFFFFFFF, b=1", output="y=1", explanation="-1 < 1 when signed"),
              dict(input="op=SLTU, a=0xFFFFFFFF, b=1", output="y=0", explanation="4294967295 is not < 1 unsigned"),
              dict(input="op=SRA, a=0x80000000, b=4", output="y=0xF8000000", explanation="The sign bit is copied in"),
              dict(input="op=SRL, a=0x80000000, b=4", output="y=0x08000000", explanation="Zeros are shifted in")],
    hints=["Use `always @(*)` with a `case (op)`; each operation is one line.",
           "Verilog compares and shifts unsigned by default. `$signed(a) < $signed(b)` compares signed, and `$signed(a) >>> b[4:0]` shifts arithmetically.",
           "`assign zero = (y == 32'd0);` Remember `b[4:0]` (not `b`) for all three shifts."],
    explanation="""The opcode layout is RISC-V's own: register instructions encode the operation in `funct3`, and `funct7[5]` picks SUB over ADD
and SRA over SRL. Using `{funct7[5], funct3}` as the ALU code means the CPU later needs almost no decoding for register instructions.

Signedness is the classic trap: Verilog treats vectors as unsigned, so SLT and SRA need `$signed(...)`; without it, `-1 < 1` is false
and an arithmetic right shift fills with zeros. Shifts use `b[4:0]` because RV32I defines the shift amount as 5 bits; shifting a
32-bit value by 33 in Verilog would give 0, not a shift by 1."""),
  dict(slug="rv-regfile", title="RISC-V Step 2: Register File", order=61, xp=220, tags=["risc-v", "register-file", "sequential", "cpu"],
    statement="""## RISC-V Step 2: Register File

RV32I has 32 general-purpose registers, `x0` to `x31`, each 32 bits. An instruction like `add x3, x1, x2` reads two registers and writes
one, so the register file has **two read ports and one write port**.

**Interface**

| Port | Dir | Width | Meaning |
|------|-----|-------|---------|
| `clk` | in | 1 | Clock |
| `we` | in | 1 | Write enable |
| `rs1`, `rs2` | in | 5 | Registers to read |
| `rd` | in | 5 | Register to write |
| `wd` | in | 32 | Value to write |
| `rd1`, `rd2` | out | 32 | Values of `x[rs1]` and `x[rs2]` |

**Behaviour**
- **Reads are combinational:** `rd1`/`rd2` follow `rs1`/`rs2` immediately, with no clock.
- **Writes happen on the rising edge of `clk`** when `we` is 1: `x[rd] <= wd`. A write is visible on the read ports right after that edge.
- **`x0` is hardwired to zero:** writes to it are ignored and it always reads 0. Programs rely on this: `addi x1, x0, 5` means "x1 = 5".

Registers other than `x0` start undefined, like real hardware; the tests write a register before reading it.""",
    constraints=["Two combinational read ports, one synchronous write port.", "x0 always reads 0, whatever was written to it.",
                 "No reset is needed."],
    examples=[dict(input="we=1, rd=3, wd=0xCAFE0003, rising edge", output="x3 = 0xCAFE0003", explanation="Ordinary write"),
              dict(input="we=1, rd=0, wd=0xFFFFFFFF, rising edge; then rs1=0", output="rd1 = 0", explanation="x0 ignores writes"),
              dict(input="rs1=3, rs2=3", output="rd1 = rd2 = x3", explanation="Both ports can read the same register")],
    hints=["Store x1..x31 in an array: `reg [31:0] regs [1:31];` and write it in `always @(posedge clk)`.",
           "Guard the write: `if (we && rd != 5'd0) regs[rd] <= wd;`",
           "For each read port: `assign rd1 = (rs1 == 5'd0) ? 32'd0 : regs[rs1];`"],
    explanation="""Two read ports exist because R-type instructions need both operands in the same cycle; one write port because each
instruction produces at most one result. Reading combinationally keeps the CPU single-cycle: the operands are ready within the same
clock period as the instruction that names them.

`x0` is a design choice that pays off everywhere: it gives a free zero for `addi rd, x0, k` (load a constant), `sub rd, x0, rs` (negate)
and `jal x0, label` (jump without saving a return address). Forcing the read to 0 is the important part; whether the storage for x0
exists does not matter, because nobody can observe it."""),
  dict(slug="rv-immgen", title="RISC-V Step 3: Immediate Generator", order=62, xp=240, tags=["risc-v", "decoder", "combinational", "cpu"],
    statement="""## RISC-V Step 3: Immediate Generator

Many instructions carry a constant (an **immediate**) inside the 32-bit instruction word. RISC-V scatters its bits differently per
instruction format so that the register fields always stay in the same place. Your job: rebuild the full **sign-extended 32-bit
immediate** for every format.

**Interface:** `input [31:0] instr`, `output [31:0] imm`.

The format is chosen by the opcode, `instr[6:0]`:

| Format | Opcodes | `imm` |
|--------|---------|-------|
| I | 0010011 (OP-IMM), 0000011 (LOAD), 1100111 (JALR) | `instr[31:20]`, sign-extended |
| S | 0100011 (STORE) | `{instr[31:25], instr[11:7]}`, sign-extended |
| B | 1100011 (BRANCH) | `{instr[31], instr[7], instr[30:25], instr[11:8], 0}`, sign-extended (13 bits) |
| U | 0110111 (LUI), 0010111 (AUIPC) | `{instr[31:12], 12'b0}` |
| J | 1101111 (JAL) | `{instr[31], instr[19:12], instr[20], instr[30:21], 0}`, sign-extended (21 bits) |

"Sign-extended" means the top bit of the immediate (always `instr[31]`) is copied into all the higher bits.
B and J immediates are byte offsets that are always even, so their lowest bit is a constant 0. Other opcodes are never tested.""",
    constraints=["Purely combinational.", "The sign bit of every immediate is instr[31].",
                 "B and J immediates have bit 0 = 0."],
    examples=[dict(input="addi x1, x2, -5  (0xFFB10093)", output="imm = 0xFFFFFFFB", explanation="I-type, negative"),
              dict(input="sw x3, 40(x4)  (0x02322423)", output="imm = 40", explanation="S-type: the offset is split in two fields"),
              dict(input="beq x1, x2, -16", output="imm = 0xFFFFFFF0", explanation="B-type branch offset"),
              dict(input="lui x5, 0xABCDE", output="imm = 0xABCDE000", explanation="U-type: upper 20 bits"),
              dict(input="jal x1, 2048", output="imm = 2048", explanation="J-type: bit 11 lives in instr[20]")],
    hints=["Use `case (instr[6:0])`; list several opcodes in one case item with commas.",
           "Sign extension with replication: `{{20{instr[31]}}, instr[31:20]}` is the I-type immediate.",
           "Count the bits: I and S have 12, B has 13 (ending in 0), U has 32, J has 21 (ending in 0). Pad with copies of instr[31] to 32."],
    explanation="""RISC-V keeps `rs1`, `rs2` and `rd` at fixed positions in every format, so the register file can start reading before
the instruction is even decoded. The price is paid here: immediate bits are shuffled. `instr[31]` is always the immediate's sign bit,
so sign extension is the same wire everywhere.

B and J immediates encode multiples of 2 (instructions are at least 2-byte aligned), which is why they drop bit 0 and reach twice as far."""),
  dict(slug="rv-branch", title="RISC-V Step 4: Branch Comparator", order=63, xp=200, tags=["risc-v", "branch", "comparator", "cpu"],
    statement="""## RISC-V Step 4: Branch Comparator

Conditional branches compare two registers and jump if the condition holds. This unit decides **whether a branch is taken**.

**Interface:** `input [31:0] a, b` (the values of `rs1` and `rs2`), `input [2:0] funct3`, `output take`.

| `funct3` | Instruction | `take` when |
|----------|-------------|-------------|
| 000 | BEQ  | `a == b` |
| 001 | BNE  | `a != b` |
| 100 | BLT  | `a < b`, signed |
| 101 | BGE  | `a >= b`, signed |
| 110 | BLTU | `a < b`, unsigned |
| 111 | BGEU | `a >= b`, unsigned |

`funct3` values 010 and 011 are not branches and are never tested. Note **BGE means greater than or equal**: equal values take the branch.""",
    constraints=["Purely combinational.", "BLT/BGE compare as signed; BLTU/BGEU as unsigned."],
    examples=[dict(input="BLT, a=0xFFFFFFFF (-1), b=1", output="take=1", explanation="-1 < 1 signed"),
              dict(input="BLTU, a=0xFFFFFFFF, b=1", output="take=0", explanation="Huge unsigned value"),
              dict(input="BGE, a=5, b=5", output="take=1", explanation="Equal counts as >=")],
    hints=["A `case (funct3)` with one comparison per line.", "`$signed(a) < $signed(b)` for the signed pair.",
           "BGE is the opposite of BLT, and BGEU the opposite of BLTU."],
    explanation="""RISC-V has no flags register: branches compare registers directly, so the comparator sits next to the register file.
There is no "branch if greater than"; the assembler swaps operands (`bgt a, b` is `blt b, a`), which keeps the hardware to six cases.
The signed/unsigned split matters for loops over arrays (unsigned addresses) versus counters that can go negative."""),
  dict(slug="rv-datapath", title="RISC-V Step 5: First Datapath", order=64, xp=400, tags=["risc-v", "cpu", "datapath", "single-cycle"],
    statement="""## RISC-V Step 5: First Datapath

Time to connect the parts into a CPU, `rv_cpu`. In this step it runs the **computational instructions**:

| Group | Instructions | Result written to `rd` |
|-------|--------------|------------------------|
| OP (0110011) | ADD SUB SLL SLT SLTU XOR SRL SRA OR AND | `alu(x[rs1], x[rs2])`, op = `{funct7[5], funct3}` |
| OP-IMM (0010011) | ADDI SLTI SLTIU XORI ORI ANDI SLLI SRLI SRAI | `alu(x[rs1], imm)` |
| LUI (0110111) | `lui rd, imm` | `imm` (the U-type immediate) |
| AUIPC (0010111) | `auipc rd, imm` | `pc + imm` (pc of this instruction) |

Every instruction here writes a register and goes to `pc + 4`; there are no branches yet, so tests are straight-line programs.

""" + CPU_INTERFACE + """

**Watch out for OP-IMM:** `funct7` is not an opcode field there; for ADDI, `instr[31:25]` is part of the immediate. Only the shifts use
`instr[30]`, to tell SRAI from SRLI. Use `{instr[30], funct3}` for OP but only for SRAI/SRLI in OP-IMM.

Your starter already contains your ALU, register file and immediate generator from steps 1–3 (or stubs, if you haven't solved them yet).""",
    constraints=["One instruction per clock cycle.", "wb_en and dmem_we are 0 while rst is high.",
                 "x0 stays 0 (the register file handles it).", "Only these modules are graded: rv_alu, rv_regfile, rv_immgen, rv_cpu."],
    examples=[dict(input="addi x1, x0, 100", output="wb_en=1, wb_rd=1, wb_data=100", explanation="x1 = 100"),
              dict(input="addi x3, x0, -1024", output="x3 = 0xFFFFFC00", explanation="Not SUB: instr[30] is an immediate bit here"),
              dict(input="lui x5, 0x12345", output="x5 = 0x12345000", explanation="U-type immediate"),
              dict(input="auipc x6, 1 at pc 0x40", output="x6 = 0x1040", explanation="pc + (1 << 12)")],
    hints=["Pick `alu_op` with the opcode: `(opcode == OP) ? {instr[30], funct3} : (opcode == OPIMM) ? {(funct3 == 3'b101) ? instr[30] : 1'b0, funct3} : 4'b0000`.",
           "`alu_b` is `rv2` for OP and `imm` otherwise. `wb_data` is the ALU result, `imm` for LUI, or `pc + imm` for AUIPC.",
           "`assign wb_en = !rst && (opcode == OP || opcode == OPIMM || opcode == LUI || opcode == AUIPC);` and the PC register adds 4 every cycle."],
    explanation="""A single-cycle CPU is one big combinational path from the PC to the register write: fetch (`imem_data`), decode
(opcode, register numbers, immediate), read registers, compute, and write back on the clock edge, when the PC also advances.

The OP-IMM trap is real: RISC-V reuses bit 30 as an immediate bit in ADDI, so `addi x3, x0, -1024` has bit 30 set and would turn into
a subtraction if you decoded it like a register instruction. AUIPC uses the PC of its own instruction, which is how position-independent
code finds addresses."""),
  dict(slug="rv-cpu", title="RISC-V Step 6: Complete CPU", order=65, xp=600, tags=["risc-v", "cpu", "single-cycle", "capstone"],
    statement="""## RISC-V Step 6: Complete CPU

Finish the processor: add **memory, branches and jumps** to your `rv_cpu`. When this passes, your CPU runs real programs: loops, arrays,
function calls and returns.

| Group | Instructions | Does |
|-------|--------------|------|
| LOAD (0000011) | `lw rd, imm(rs1)` | `x[rd] = mem[x[rs1] + imm]` |
| STORE (0100011) | `sw rs2, imm(rs1)` | `mem[x[rs1] + imm] = x[rs2]` |
| BRANCH (1100011) | BEQ BNE BLT BGE BLTU BGEU | if `take`: `pc = pc + imm`, else `pc + 4` |
| JAL (1101111) | `jal rd, imm` | `x[rd] = pc + 4; pc = pc + imm` |
| JALR (1100111) | `jalr rd, rs1, imm` | `x[rd] = pc + 4; pc = (x[rs1] + imm)` with bit 0 cleared |

…plus everything from step 5. Only whole-word loads and stores (`lw`/`sw`) are used; addresses are multiples of 4.
Stores and branches don't write a register (`wb_en = 0`). Branch and JAL offsets are relative to the **current** instruction's PC.

""" + CPU_INTERFACE + """

The hidden tests run complete programs: a summing loop, an array scan with loads and stores, function calls with `jal`/`jalr`,
and every branch condition, checking all 32 registers and the whole data memory at the end.

Your starter already contains your step-5 CPU and your branch comparator (or stubs). Extend `rv_cpu` there.""",
    constraints=["One instruction per clock cycle.", "wb_en and dmem_we are 0 while rst is high.",
                 "JALR clears bit 0 of the target.", "Loads and stores use x[rs1] + imm as the byte address."],
    examples=[dict(input="sw x1, 0x100(x0)", output="dmem_we=1, dmem_addr=0x100, dmem_wdata=x1", explanation="Store"),
              dict(input="bne x2, x3, -8 with x2 != x3", output="pc = pc - 8", explanation="Taken branch, backwards"),
              dict(input="jal x1, func", output="x1 = pc + 4; pc = func", explanation="Call"),
              dict(input="jalr x0, x1, 0", output="pc = x1", explanation="Return")],
    hints=["Loads and stores use the ALU to add: keep `alu_op = 4'b0000` and `alu_b = imm` for them. `dmem_addr = alu_y`, `dmem_wdata = rv2`.",
           "Next PC: JAL → `pc + imm`; JALR → `(rv1 + imm) & ~32'd1`; BRANCH and `take` → `pc + imm`; otherwise `pc + 4`. Instantiate `rv_branch` with `rv1`, `rv2`, `funct3`.",
           "`wb_data`: `dmem_rdata` for loads, `pc + 4` for JAL/JALR, `imm` for LUI, `pc + imm` for AUIPC, else the ALU result. `wb_en` excludes STORE and BRANCH."],
    explanation="""This is the classic single-cycle RISC-V datapath from Patterson & Hennessy: one adder computes addresses for loads,
stores and JALR; a separate PC adder makes `pc + 4` and branch targets; a write-back multiplexer chooses what reaches the register file.

JAL and JALR write `pc + 4` (the return address) and that is all a function call needs: `jal x1, f` calls, `jalr x0, x1, 0` returns.
Clearing bit 0 of the JALR target is in the specification so that addresses computed with arithmetic can't land on an odd byte.
The obvious next steps are pipelining (five stages, forwarding, hazards) and byte/halfword memory access."""),
]

def ts(s):
    return json.dumps(s, ensure_ascii=False)

def main():
    tbs = gen_tbs.build()
    entries = []
    for p in PROBLEMS:
        t = tbs[p["slug"]]
        hints = ",\n".join(f"      {{ tier: {i + 1}, content: {ts(h)} }}" for i, h in enumerate(p["hints"]))
        examples = ",\n".join(f"      {{ input: {ts(e['input'])}, output: {ts(e['output'])}, explanation: {ts(e['explanation'])} }}" for e in p["examples"])
        entries.append(f"""  {{
    id: {ts(p['slug'])}, slug: {ts(p['slug'])},
    title: {ts(p['title'])},
    difficulty: "advanced", category: "riscv",
    tags: {ts(p['tags'])},
    learningLevel: "Verilog Advanced",
    moduleId: "mod_riscv", orderIndex: {p['order']},
    xpReward: {p['xp']}, waveformRequired: false,
    expectedOutputMode: "stdout_compare",
    statement: {ts(p['statement'])},
    constraints: {ts(p['constraints'])},
    examples: [
{examples}
    ],
    hints: [
{hints}
    ],
    solutionExplanation: {ts(p['explanation'])},
    publicTestcases: [], hiddenTestcases: [],
    starterCode: {ts(STARTERS[p['slug']])},
    publicTestbench: {ts(t['public'])},
    hiddenTestbench: {ts(t['hidden'])},
  }}""")
    src = f"""/**
 * lib/problems/riscv.ts — "Build a RISC-V CPU": six steps from an ALU to a
 * single-cycle RV32I processor that runs loops, memory and function calls.
 *
 * GENERATED by scripts/riscv/gen_problems.py — edit that, then rerun it.
 * Expected values in the testbenches come from scripts/riscv/rv.py, a Python
 * model of RV32I. Steps 5 and 6 carry the learner's own earlier modules in
 * through "// @step <slug>" blocks (see app/api/problems/[slug]/route.ts).
 */

import type {{ Problem }} from "@/lib/problem-types";

export const RISCV_PROBLEMS: Problem[] = [
{(",\n").join(entries)},
];
"""
    with open(OUT, "w", encoding="utf-8", newline="\n") as f:
        f.write(src)
    print(f"wrote {os.path.relpath(OUT)} ({len(src) // 1024} KB, {len(PROBLEMS)} problems)")

if __name__ == "__main__":
    main()
