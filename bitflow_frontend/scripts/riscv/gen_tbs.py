"""Generate public + hidden testbenches for the RISC-V track.

Every expected value comes from rv.py (an independent Python model of RV32I),
never from the Verilog reference. Writes tbs.json: {slug: {public, hidden}}.
"""
import json, random
import rv

TS = "`timescale 1ns / 1ps\n"
h32 = lambda v: f"32'h{v & 0xFFFFFFFF:08x}"
ALU_OPS = {"ADD": 0b0000, "SUB": 0b1000, "SLL": 0b0001, "SLT": 0b0010, "SLTU": 0b0011,
           "XOR": 0b0100, "SRL": 0b0101, "SRA": 0b1101, "OR": 0b0110, "AND": 0b0111}
rnd = random.Random(20261020)
r32 = lambda: rnd.getrandbits(32)

def result(tag):
    return (f'        if (errors == 0) $display("ALL TESTS PASSED");\n'
            f'        else $display("TESTS FAILED: %0d error(s){tag}", errors);\n        $finish;\n')

# ─── 1. ALU ──────────────────────────────────────────────────────────────────
def alu_tbs():
    vecs = []
    small = [0, 1, 0xFFFFFFFF, 0x80000000, 0x7FFFFFFF, 31, 33]
    for name, op in ALU_OPS.items():
        for a in small:
            for b in small:
                vecs.append((op, a, b))
        for _ in range(8):
            b = rnd.choice([r32(), rnd.randrange(64)]) if name in ("SLL", "SRL", "SRA") else r32()
            vecs.append((op, r32(), b))
    lines = [f"        t(4'b{op:04b}, {h32(a)}, {h32(b)}, {h32(rv.alu(op, a, b))});" for op, a, b in vecs]
    hidden = TS + f"""module tb_rv_alu_hidden;
    reg  [31:0] a, b;
    reg  [3:0]  op;
    wire [31:0] y;
    wire        zero;
    integer errors = 0;
    rv_alu dut (.a(a), .b(b), .op(op), .y(y), .zero(zero));
    task t(input [3:0] o, input [31:0] x, input [31:0] z, input [31:0] want);
        begin
            op = o; a = x; b = z; #1;
            if (y !== want || zero !== (want == 32'd0)) begin
                errors = errors + 1;
                if (errors <= 12)
                    $display("FAIL: op=%b a=0x%08h b=0x%08h -> y=0x%08h zero=%b (expected y=0x%08h zero=%b)",
                             o, x, z, y, zero, want, want == 32'd0);
            end
        end
    endtask
    initial begin
{chr(10).join(lines)}
{result(f" out of {len(vecs)} checks")}    end
endmodule
"""
    demo = [("ADD", 5, 7), ("SUB", 5, 7), ("SLT", 0xFFFFFFFF, 1), ("SLTU", 0xFFFFFFFF, 1), ("SRA", 0x80000000, 4), ("SRL", 0x80000000, 4)]
    public = TS + """module tb_rv_alu;
    reg  [31:0] a, b;
    reg  [3:0]  op;
    wire [31:0] y;
    wire        zero;
    rv_alu dut (.a(a), .b(b), .op(op), .y(y), .zero(zero));
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_rv_alu); end
    task show(input [8*4:1] name, input [3:0] o, input [31:0] x, input [31:0] z, input [31:0] want);
        begin
            op = o; a = x; b = z; #10;
            $display("%-4s a=0x%08h b=0x%08h -> y=0x%08h zero=%b   %0s", name, x, z, y, zero, (y === want) ? "ok" : "differs from expected");
        end
    endtask
    initial begin
""" + "\n".join(f'        show("{n}", 4\'b{ALU_OPS[n]:04b}, {h32(a)}, {h32(b)}, {h32(rv.alu(ALU_OPS[n], a, b))});' for n, a, b in demo) + """
        $finish;
    end
endmodule
"""
    return public, hidden

# ─── 2. Register file ────────────────────────────────────────────────────────
REGFILE_PUBLIC = TS + """module tb_rv_regfile;
    reg         clk = 0, we = 0;
    reg  [4:0]  rs1 = 0, rs2 = 0, rd = 0;
    reg  [31:0] wd = 0;
    wire [31:0] rd1, rd2;
    rv_regfile dut (.clk(clk), .we(we), .rs1(rs1), .rs2(rs2), .rd(rd), .wd(wd), .rd1(rd1), .rd2(rd2));
    always #5 clk = ~clk;
    initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_rv_regfile); end
    initial begin
        @(negedge clk); we = 1; rd = 5'd3; wd = 32'hCAFE0003;      // x3 = 0xCAFE0003
        @(negedge clk); rd = 5'd0; wd = 32'hFFFFFFFF;              // writing x0 must be ignored
        @(negedge clk); we = 0; rs1 = 5'd3; rs2 = 5'd0; #1;
        $display("x3 = 0x%08h (expect 0xcafe0003), x0 = 0x%08h (expect 0x00000000)", rd1, rd2);
        $finish;
    end
endmodule
"""

def regfile_hidden():
    vals = {r: r32() for r in range(1, 32)}
    other = lambda r: 0 if r == 16 else 32 - r
    writes = "\n".join(f"        wr(5'd{r}, {h32(v)});" for r, v in vals.items())
    reads = "\n".join(f"        rd2chk(5'd{r}, 5'd{other(r)}, {h32(vals[r])}, {h32(vals.get(other(r), 0))});" for r in range(1, 32))
    return TS + f"""module tb_rv_regfile_hidden;
    reg         clk = 0, we = 0;
    reg  [4:0]  rs1 = 0, rs2 = 0, rd = 0;
    reg  [31:0] wd = 0;
    wire [31:0] rd1, rd2;
    integer errors = 0;
    rv_regfile dut (.clk(clk), .we(we), .rs1(rs1), .rs2(rs2), .rd(rd), .wd(wd), .rd1(rd1), .rd2(rd2));
    always #5 clk = ~clk;
    task wr(input [4:0] r, input [31:0] v);
        begin @(negedge clk); we = 1; rd = r; wd = v; @(negedge clk); we = 0; end
    endtask
    task rd2chk(input [4:0] a, input [4:0] b, input [31:0] wa, input [31:0] wb);
        begin
            rs1 = a; rs2 = b; #1;
            if (rd1 !== wa || rd2 !== wb) begin
                errors = errors + 1;
                $display("FAIL: read x%0d,x%0d -> 0x%08h,0x%08h (expected 0x%08h,0x%08h)", a, b, rd1, rd2, wa, wb);
            end
        end
    endtask
    initial begin
        // Every register written, then read back through both ports
{writes}
{reads}
        // x0: writes ignored, always reads 0
        wr(5'd0, 32'hDEADBEEF);
        rd2chk(5'd0, 5'd0, 32'h0, 32'h0);
        // we=0 must not write
        @(negedge clk); we = 0; rd = 5'd7; wd = 32'h0BADF00D; @(negedge clk);
        rd2chk(5'd7, 5'd7, {h32(vals[7])}, {h32(vals[7])});
        // Reads are combinational: the new value appears right after the clock edge, not before
        @(negedge clk); we = 1; rd = 5'd9; wd = 32'h99999999; rs1 = 5'd9; #1;
        if (rd1 !== {h32(vals[9])}) begin errors = errors + 1; $display("FAIL: x9 changed before the clock edge (0x%08h)", rd1); end
        @(posedge clk); #1;
        if (rd1 !== 32'h99999999) begin errors = errors + 1; $display("FAIL: x9 = 0x%08h after the edge, expected 0x99999999", rd1); end
        @(negedge clk); we = 0;
        // Writes happen only on a rising edge with we=1
        @(negedge clk); we = 1; rd = 5'd12; wd = 32'h12121212; #2 we = 0; @(posedge clk); #1; rs1 = 5'd12; #1;
        if (rd1 !== {h32(vals[12])}) begin errors = errors + 1; $display("FAIL: x12 written without a rising edge while we=1"); end
{result("")}    end
endmodule
"""

# ─── 3. Immediate generator ──────────────────────────────────────────────────
def immgen_tbs():
    progs = []
    for _ in range(14):
        rs1, rs2, rd = rnd.randrange(32), rnd.randrange(32), rnd.randrange(32)
        progs += [("addi", rd, rs1, rnd.randrange(-2048, 2048)), ("lw", rd, rnd.randrange(-2048, 2048), rs1),
                  ("jalr", rd, rs1, rnd.randrange(-2048, 2048)), ("sw", rs2, rnd.randrange(-2048, 2048), rs1),
                  ("beq", rs1, rs2, rnd.randrange(-2048, 2047) * 2), ("lui", rd, rnd.getrandbits(20)),
                  ("auipc", rd, rnd.getrandbits(20)), ("jal", rd, rnd.randrange(-(1 << 19), 1 << 19) * 2),
                  ("srai", rd, rs1, rnd.randrange(32)), ("sltiu", rd, rs1, -1)]
    edges = [("addi", 1, 2, -2048), ("addi", 1, 2, 2047), ("sw", 1, -1, 2), ("sw", 1, 2047, 2), ("bne", 1, 2, -4096),
             ("bge", 1, 2, 4094), ("jal", 1, -(1 << 20)), ("jal", 1, (1 << 20) - 2), ("lui", 1, 0x80000), ("auipc", 1, 0xFFFFF)]
    words = [rv.assemble([p])[0] for p in edges + progs]
    lines = [f"        t({h32(w)}, {h32(rv.imm_of(w))});" for w in words]
    hidden = TS + f"""module tb_rv_immgen_hidden;
    reg  [31:0] instr;
    wire [31:0] imm;
    integer errors = 0;
    rv_immgen dut (.instr(instr), .imm(imm));
    task t(input [31:0] w, input [31:0] want);
        begin
            instr = w; #1;
            if (imm !== want) begin
                errors = errors + 1;
                if (errors <= 12) $display("FAIL: instr=0x%08h (opcode %b) -> imm=0x%08h, expected 0x%08h", w, w[6:0], imm, want);
            end
        end
    endtask
    initial begin
{chr(10).join(lines)}
{result(f" out of {len(words)} instructions")}    end
endmodule
"""
    demo = [("addi x1, x2, -5", ("addi", 1, 2, -5)), ("sw x3, 40(x4)", ("sw", 3, 40, 4)), ("beq x1, x2, -16", ("beq", 1, 2, -16)),
            ("lui x5, 0xABCDE", ("lui", 5, 0xABCDE)), ("jal x1, 2048", ("jal", 1, 2048))]
    public = TS + """module tb_rv_immgen;
    reg  [31:0] instr;
    wire [31:0] imm;
    rv_immgen dut (.instr(instr), .imm(imm));
    initial begin
""" + "\n".join(
        f'        instr = {h32(rv.assemble([p])[0])}; #1; $display("{txt:<18} imm = 0x%08h (%0d), expect {rv.imm_of(rv.assemble([p])[0])}", imm, $signed(imm));'
        for txt, p in demo) + """
        $finish;
    end
endmodule
"""
    return public, hidden

# ─── 4. Branch unit ──────────────────────────────────────────────────────────
BR = {"BEQ": 0, "BNE": 1, "BLT": 4, "BGE": 5, "BLTU": 6, "BGEU": 7}
def branch_tbs():
    small = [0, 1, 0xFFFFFFFF, 0x80000000, 0x7FFFFFFF, 0xFFFFFFFE]
    vecs = [(f3, a, b) for f3 in BR.values() for a in small for b in small]
    vecs += [(rnd.choice(list(BR.values())), r32(), r32()) for _ in range(60)]
    vecs += [(f3, v, v) for f3 in BR.values() for v in (r32(), r32())]
    lines = [f"        t(3'b{f3:03b}, {h32(a)}, {h32(b)}, 1'b{int(rv.branch_taken(f3, a, b))});" for f3, a, b in vecs]
    hidden = TS + f"""module tb_rv_branch_hidden;
    reg  [31:0] a, b;
    reg  [2:0]  funct3;
    wire        take;
    integer errors = 0;
    rv_branch dut (.a(a), .b(b), .funct3(funct3), .take(take));
    task t(input [2:0] f, input [31:0] x, input [31:0] z, input want);
        begin
            funct3 = f; a = x; b = z; #1;
            if (take !== want) begin
                errors = errors + 1;
                if (errors <= 12) $display("FAIL: funct3=%b a=0x%08h b=0x%08h -> take=%b, expected %b", f, x, z, take, want);
            end
        end
    endtask
    initial begin
{chr(10).join(lines)}
{result(f" out of {len(vecs)} checks")}    end
endmodule
"""
    demo = [("BLT", 0xFFFFFFFF, 1), ("BLTU", 0xFFFFFFFF, 1), ("BGE", 5, 5), ("BNE", 3, 3)]
    public = TS + """module tb_rv_branch;
    reg  [31:0] a, b;
    reg  [2:0]  funct3;
    wire        take;
    rv_branch dut (.a(a), .b(b), .funct3(funct3), .take(take));
    initial begin
""" + "\n".join(
        f'        funct3 = 3\'b{BR[n]:03b}; a = {h32(a)}; b = {h32(b)}; #1; $display("{n:<4} a=0x%08h b=0x%08h -> take=%b (expect {int(rv.branch_taken(BR[n], a, b))})", a, b, take);'
        for n, a, b in demo) + """
        $finish;
    end
endmodule
"""
    return public, hidden

# ─── 5/6. CPU programs ───────────────────────────────────────────────────────
# Straight-line programs (datapath step): no branches or jumps, so they simply run off into NOPs.
DATAPATH_PROGRAMS = {
    "arith": [("li", 1, 100), ("li", 2, -7), ("li", 3, 0x80000000), ("li", 4, 35),
              ("add", 5, 1, 2), ("sub", 6, 2, 1), ("and", 7, 1, 2), ("or", 8, 1, 2), ("xor", 9, 1, 2),
              ("sll", 10, 1, 4), ("srl", 11, 3, 4), ("sra", 12, 3, 4), ("slt", 13, 2, 1), ("sltu", 14, 2, 1),
              ("sub", 15, 3, 1), ("add", 16, 3, 3), ("slt", 17, 3, 0), ("sltu", 18, 0, 2)],
    "immediates": [("addi", 1, 0, 2047), ("addi", 2, 0, -2048), ("addi", 3, 0, -1024), ("addi", 4, 3, 1000),
                   ("slti", 5, 3, -1), ("sltiu", 6, 3, -1), ("xori", 7, 1, -1), ("andi", 8, 2, 0x7F0),
                   ("ori", 9, 0, -16), ("slli", 10, 1, 20), ("srli", 11, 2, 4), ("srai", 12, 2, 4),
                   ("srai", 13, 3, 31), ("addi", 0, 0, 55), ("add", 14, 0, 0), ("lui", 15, 0xFEDCB),
                   ("addi", 15, 15, 0x7AB), ("auipc", 16, 0), ("auipc", 17, 1), ("lui", 18, 0)],
    "chain": [("addi", 1, 0, 1), ("addi", 2, 0, 1), ("add", 3, 1, 2), ("add", 4, 2, 3), ("add", 5, 3, 4),
              ("add", 6, 4, 5), ("add", 7, 5, 6), ("add", 8, 6, 7), ("slli", 9, 8, 3), ("sub", 10, 9, 8),
              ("xor", 11, 10, 9), ("srai", 12, 11, 2), ("sltu", 13, 12, 11), ("add", 1, 1, 1), ("add", 1, 1, 1)],
}

# Full CPU programs end in `jal x0, 0` (a self-loop the bench treats as "done").
CPU_PROGRAMS = {
    "sum_loop": [("addi", 1, 0, 0), ("addi", 2, 0, 1), ("addi", 3, 0, 21),
                 "loop:", ("add", 1, 1, 2), ("addi", 2, 2, 1), ("bne", 2, 3, "loop"),
                 ("sw", 1, 0x100, 0), ("lw", 4, 0x100, 0), ("jal", 0, 0)],
    "array": [("addi", 10, 0, 0x200), ("addi", 11, 0, 8), ("addi", 5, 0, 0), ("addi", 6, 0, -3),
              "fill:", ("sw", 6, 0, 10), ("addi", 6, 6, 7), ("addi", 10, 10, 4), ("addi", 5, 5, 1), ("blt", 5, 11, "fill"),
              ("addi", 10, 0, 0x200), ("addi", 5, 0, 0), ("addi", 12, 0, 0), ("lui", 13, 0x80000),
              "sum:", ("lw", 7, 0, 10), ("add", 12, 12, 7), ("bge", 13, 7, "nomax"), ("addi", 13, 7, 0), "nomax:",
              ("addi", 10, 10, 4), ("addi", 5, 5, 1), ("bltu", 5, 11, "sum"),
              ("sw", 12, -4, 10), ("sw", 13, 0, 10), ("lw", 14, -36, 10), ("jal", 0, 0)],
    "calls": [("addi", 2, 0, 0x3F0), ("addi", 10, 0, 6), ("jal", 1, "fact"), ("addi", 20, 10, 0),
              ("addi", 10, 0, 1), ("jal", 1, "fact"), ("addi", 21, 10, 0),
              ("auipc", 5, 0), ("jalr", 6, 5, 16), ("addi", 22, 0, 111), ("addi", 23, 0, 222), ("jal", 0, 0),
              "fact:", ("addi", 11, 0, 1), "floop:", ("beq", 10, 0, "fdone"),
              ("addi", 12, 0, 0), ("addi", 13, 10, 0), "mul:", ("add", 12, 12, 11), ("addi", 13, 13, -1), ("bne", 13, 0, "mul"),
              ("addi", 11, 12, 0), ("addi", 10, 10, -1), ("jal", 0, "floop"),
              "fdone:", ("addi", 10, 11, 0), ("jalr", 0, 1, 0)],
    "branches": [("li", 1, -1), ("addi", 2, 0, 1), ("addi", 20, 0, 0),
                 ("blt", 1, 2, "t1"), ("ori", 20, 20, 1), "t1:",
                 ("bltu", 1, 2, "t2"), ("ori", 20, 20, 2), "t2:",
                 ("bge", 1, 2, "t3"), ("ori", 20, 20, 4), "t3:",
                 ("bgeu", 1, 2, "t4"), ("ori", 20, 20, 8), "t4:",
                 ("beq", 1, 1, "t5"), ("ori", 20, 20, 16), "t5:",
                 ("bne", 2, 2, "t6"), ("ori", 20, 20, 32), "t6:",
                 # equal operands: BGE/BGEU taken, BLT/BLTU not taken
                 ("bge", 2, 2, "t7"), ("ori", 20, 20, 64), "t7:",
                 ("bgeu", 1, 1, "t8"), ("ori", 20, 20, 128), "t8:",
                 ("blt", 1, 1, "t9"), ("ori", 20, 20, 256), "t9:",
                 ("bltu", 2, 2, "t10"), ("ori", 20, 20, 512), "t10:",
                 # jalr to an odd address: the CPU must clear bit 0, so the next auipc sees an even pc
                 ("auipc", 7, 0), ("addi", 7, 7, 13), ("jalr", 8, 7, 0), ("addi", 21, 0, 9), ("auipc", 23, 0), ("jal", 0, 0)],
}

def run_prog(prog):
    words = rv.assemble(prog)
    straight = not any(isinstance(i, tuple) and i[0] in ("jal", "jalr") or isinstance(i, tuple) and i[0] in rv.B_OPS for i in prog)
    regs, dmem, writes, steps = rv.run(words, max_steps=len(words) if straight else 2000)
    return words, regs, dmem, writes, steps

def cpu_tb(module_name, programs, public=False):
    """Testbench: memories live in the bench; register results come from the write-back port.
    Hidden: every register x1..x31 and every data-memory word is compared with the model."""
    blocks = []
    for name, prog in programs.items():
        words, regs, dmem, writes, steps = run_prog(prog)
        load = "\n".join(f"        imem[{i}] = {h32(w)};" for i, w in enumerate(words))
        if public:
            blocks.append(f"""        // Program "{name}"
        clear;
{load}
        reset_cpu;
        repeat ({steps + 2}) @(posedge clk);
        #1;
        $display("--- final register values ---");
""" + "\n".join(f'        $display("x%0d = 0x%08h (expected 0x{regs[r]:08x})", {r}, shadow[{r}]);' for r in sorted({r for r, _ in writes})))
        else:
            expect = "\n".join(f"        exp_reg[{r}] = {h32(v)};" for r, v in enumerate(regs) if r and v)
            expect += "\n" + "\n".join(f"        exp_mem[{i}] = {h32(v)};" for i, v in enumerate(dmem) if v)
            blocks.append(f"""        // Program "{name}": {steps} instructions
        clear;
{load}
{expect}
        reset_cpu;
        repeat ({steps + 4}) @(posedge clk);
        #1;
        compare("{name}");""")
    trace = '\n            if (wb_en && wb_rd != 5\'d0) $display("  x%0d <= 0x%08h", wb_rd, wb_data);' if public else ""
    dump = f'    initial begin $dumpfile("wave.vcd"); $dumpvars(0, {module_name}); end\n' if public else ""
    return TS + f"""module {module_name};
    reg clk = 0, rst = 1;
    always #5 clk = ~clk;
    wire [31:0] imem_addr, dmem_addr, dmem_wdata, wb_data;
    wire        dmem_we, wb_en;
    wire [4:0]  wb_rd;
    reg  [31:0] imem [0:255];       // instruction memory (word index = imem_addr[9:2])
    reg  [31:0] dmem [0:255];       // data memory        (word index = dmem_addr[9:2])
    reg  [31:0] shadow [0:31];      // register values seen on the write-back port
    reg  [31:0] exp_reg [0:31];
    reg  [31:0] exp_mem [0:255];
    integer i, errors = 0;
    rv_cpu dut (.clk(clk), .rst(rst),
                .imem_addr(imem_addr), .imem_data(imem[imem_addr[9:2]]),
                .dmem_addr(dmem_addr), .dmem_wdata(dmem_wdata), .dmem_we(dmem_we), .dmem_rdata(dmem[dmem_addr[9:2]]),
                .wb_en(wb_en), .wb_rd(wb_rd), .wb_data(wb_data));
{dump}    always @(posedge clk) begin
        if (rst) begin
            if (wb_en !== 1'b0 || dmem_we !== 1'b0) begin
                errors = errors + 1;
                if (errors <= 3) $display("FAIL: wb_en and dmem_we must be 0 while rst is high");
            end
        end else begin
            if (dmem_we) dmem[dmem_addr[9:2]] <= dmem_wdata;
            if (wb_en && wb_rd != 5'd0) shadow[wb_rd] <= wb_data;{trace}
        end
    end
    task clear;
        begin
            for (i = 0; i < 256; i = i + 1) begin imem[i] = 32'h00000013; dmem[i] = 32'd0; exp_mem[i] = 32'd0; end
            for (i = 0; i < 32; i = i + 1) begin shadow[i] = 32'd0; exp_reg[i] = 32'd0; end
        end
    endtask
    task reset_cpu;
        begin rst = 1; @(posedge clk); @(posedge clk); #1 rst = 0; end
    endtask
    task compare(input [8*12:1] prog);
        begin
            for (i = 1; i < 32; i = i + 1)
                if (shadow[i] !== exp_reg[i]) begin
                    errors = errors + 1;
                    $display("FAIL: program %0s: x%0d = 0x%08h, expected 0x%08h", prog, i, shadow[i], exp_reg[i]);
                end
            for (i = 0; i < 256; i = i + 1)
                if (dmem[i] !== exp_mem[i]) begin
                    errors = errors + 1;
                    $display("FAIL: program %0s: mem[0x%03h] = 0x%08h, expected 0x%08h", prog, i * 4, dmem[i], exp_mem[i]);
                end
        end
    endtask
    initial begin
{(chr(10) * 2).join(blocks)}
{'        $finish;' + chr(10) if public else result("")}    end
endmodule
"""

def build():
    out = {}
    out["rv-alu"] = dict(zip(("public", "hidden"), alu_tbs()))
    out["rv-regfile"] = {"public": REGFILE_PUBLIC, "hidden": regfile_hidden()}
    out["rv-immgen"] = dict(zip(("public", "hidden"), immgen_tbs()))
    out["rv-branch"] = dict(zip(("public", "hidden"), branch_tbs()))
    out["rv-datapath"] = {"public": cpu_tb("tb_rv_datapath", {"fibonacci": DATAPATH_PROGRAMS["chain"][:8]}, public=True),
                          "hidden": cpu_tb("tb_rv_datapath_hidden", DATAPATH_PROGRAMS)}
    out["rv-cpu"] = {"public": cpu_tb("tb_rv_cpu", {"sum_loop": CPU_PROGRAMS["sum_loop"]}, public=True),
                     "hidden": cpu_tb("tb_rv_cpu_hidden", {**DATAPATH_PROGRAMS, **CPU_PROGRAMS})}
    return out

if __name__ == "__main__":
    tbs = build()
    json.dump(tbs, open("tbs.json", "w"), indent=1)
    for slug, t in tbs.items():
        print(f"{slug:12} public {len(t['public']):6} chars  hidden {len(t['hidden']):6} chars")
    for name, prog in {**DATAPATH_PROGRAMS, **CPU_PROGRAMS}.items():
        _, regs, dmem, _, steps = run_prog(prog)
        print(f"  {name:11} {steps:4} steps  " + " ".join(f"x{r}={regs[r]:#x}" for r in (1, 4, 10, 12, 13, 20, 21, 22, 23) if regs[r])[:110])
