"""Tiny RV32I assembler + instruction-set simulator for the BitFlow RISC-V track.

Supported (the track's subset): LUI AUIPC JAL JALR, BEQ BNE BLT BGE BLTU BGEU,
LW SW, ADDI SLTI SLTIU XORI ORI ANDI SLLI SRLI SRAI,
ADD SUB SLL SLT SLTU XOR SRL SRA OR AND.

Programs are lists of (mnemonic, *operands) tuples; labels are strings
ending in ':'. Registers are ints 0..31. Branch/JAL targets may be labels.
"""

MASK = 0xFFFFFFFF
NOP = 0x00000013

def s32(x):
    x &= MASK
    return x - (1 << 32) if x & 0x80000000 else x

R_OPS = {  # name: (funct7, funct3)
    "add": (0x00, 0), "sub": (0x20, 0), "sll": (0x00, 1), "slt": (0x00, 2), "sltu": (0x00, 3),
    "xor": (0x00, 4), "srl": (0x00, 5), "sra": (0x20, 5), "or": (0x00, 6), "and": (0x00, 7),
}
I_OPS = {"addi": 0, "slti": 2, "sltiu": 3, "xori": 4, "ori": 6, "andi": 7}
SH_OPS = {"slli": (0x00, 1), "srli": (0x00, 5), "srai": (0x20, 5)}
B_OPS = {"beq": 0, "bne": 1, "blt": 4, "bge": 5, "bltu": 6, "bgeu": 7}

def enc_r(f7, rs2, rs1, f3, rd, op): return (f7 << 25) | (rs2 << 20) | (rs1 << 15) | (f3 << 12) | (rd << 7) | op
def enc_i(imm, rs1, f3, rd, op):
    assert -2048 <= imm <= 2047, imm
    return ((imm & 0xFFF) << 20) | (rs1 << 15) | (f3 << 12) | (rd << 7) | op
def enc_s(imm, rs2, rs1, f3, op):
    assert -2048 <= imm <= 2047, imm
    imm &= 0xFFF
    return ((imm >> 5) << 25) | (rs2 << 20) | (rs1 << 15) | (f3 << 12) | ((imm & 0x1F) << 7) | op
def enc_b(imm, rs2, rs1, f3):
    assert imm % 2 == 0 and -4096 <= imm <= 4094, imm
    imm &= 0x1FFF
    return (((imm >> 12) & 1) << 31) | (((imm >> 5) & 0x3F) << 25) | (rs2 << 20) | (rs1 << 15) | (f3 << 12) \
        | (((imm >> 1) & 0xF) << 8) | (((imm >> 11) & 1) << 7) | 0x63
def enc_u(imm20, rd, op): return ((imm20 & 0xFFFFF) << 12) | (rd << 7) | op
def enc_j(imm, rd):
    assert imm % 2 == 0 and -(1 << 20) <= imm < (1 << 20), imm
    imm &= 0x1FFFFF
    return (((imm >> 20) & 1) << 31) | (((imm >> 1) & 0x3FF) << 21) | (((imm >> 11) & 1) << 20) \
        | (((imm >> 12) & 0xFF) << 12) | (rd << 7) | 0x6F

def assemble(prog):
    """-> list of 32-bit words. Two passes so labels can be used before they're defined."""
    labels, pc = {}, 0
    for ins in prog:
        if isinstance(ins, str) and ins.endswith(":"):
            labels[ins[:-1]] = pc
        else:
            pc += 8 if ins[0] == "li" else 4
    words, pc = [], 0
    tgt = lambda t: labels[t] - pc if isinstance(t, str) else t   # labels absolute, numbers are offsets
    for ins in prog:
        if isinstance(ins, str):
            continue
        m, *a = ins
        if m in R_OPS:   f7, f3 = R_OPS[m]; w = enc_r(f7, a[2], a[1], f3, a[0], 0x33)
        elif m in I_OPS: w = enc_i(a[2], a[1], I_OPS[m], a[0], 0x13)
        elif m in SH_OPS:
            f7, f3 = SH_OPS[m]; assert 0 <= a[2] < 32
            w = enc_r(f7, a[2], a[1], f3, a[0], 0x13)
        elif m in B_OPS: w = enc_b(tgt(a[2]), a[1], a[0], B_OPS[m])
        elif m == "lw":   w = enc_i(a[1], a[2], 2, a[0], 0x03)        # lw rd, imm(rs1) -> ("lw", rd, imm, rs1)
        elif m == "sw":   w = enc_s(a[1], a[0], a[2], 2, 0x23)        # sw rs2, imm(rs1) -> ("sw", rs2, imm, rs1)
        elif m == "jal":  w = enc_j(tgt(a[1]), a[0])
        elif m == "jalr": w = enc_i(a[2], a[1], 0, a[0], 0x67)        # jalr rd, rs1, imm
        elif m == "lui":  w = enc_u(a[1], a[0], 0x37)
        elif m == "auipc": w = enc_u(a[1], a[0], 0x17)
        elif m == "nop":  w = NOP
        elif m == "li":   # pseudo: rd = 32-bit constant as lui + addi (always 2 words)
            v = a[1] & MASK
            lo = ((v & 0xFFF) ^ 0x800) - 0x800          # sign-extended low 12 bits
            hi = ((v - lo) >> 12) & 0xFFFFF
            words.append(enc_u(hi, a[0], 0x37)); pc += 4
            w = enc_i(lo, a[0], 0, a[0], 0x13)
        else:
            raise ValueError(m)
        words.append(w & MASK)
        pc += 4
    return words

def sext(v, bits): return (v & ((1 << bits) - 1)) - ((v >> (bits - 1)) & 1) * (1 << bits)

def imm_of(w):
    """Immediate the decoder must produce for any supported instruction word."""
    op = w & 0x7F
    if op in (0x13, 0x03, 0x67): return sext(w >> 20, 12)
    if op == 0x23: return sext(((w >> 25) << 5) | ((w >> 7) & 0x1F), 12)
    if op == 0x63: return sext((((w >> 31) & 1) << 12) | (((w >> 7) & 1) << 11) | (((w >> 25) & 0x3F) << 5) | (((w >> 8) & 0xF) << 1), 13)
    if op in (0x37, 0x17): return s32(w & 0xFFFFF000)
    if op == 0x6F: return sext((((w >> 31) & 1) << 20) | (((w >> 12) & 0xFF) << 12) | (((w >> 20) & 1) << 11) | (((w >> 21) & 0x3FF) << 1), 21)
    return 0

def alu(op4, a, b):
    a &= MASK; b &= MASK; sh = b & 31
    return {
        0b0000: a + b, 0b1000: a - b, 0b0001: a << sh, 0b0010: int(s32(a) < s32(b)), 0b0011: int(a < b),
        0b0100: a ^ b, 0b0101: a >> sh, 0b1101: s32(a) >> sh, 0b0110: a | b, 0b0111: a & b,
    }[op4] & MASK

def branch_taken(f3, a, b):
    a &= MASK; b &= MASK
    return {0: a == b, 1: a != b, 4: s32(a) < s32(b), 5: s32(a) >= s32(b), 6: a < b, 7: a >= b}[f3]

def run(words, max_steps=2000, mem_words=256, dmem_init=None):
    """Execute from pc=0 until a `jal x0, 0` self-loop or max_steps. -> (regs, dmem, writes, steps)."""
    imem = words + [NOP] * (mem_words - len(words))
    dmem = list(dmem_init or [0] * mem_words)
    x = [0] * 32
    pc, writes, steps = 0, [], 0
    for steps in range(1, max_steps + 1):
        w = imem[(pc >> 2) % mem_words]
        op, rd, f3, rs1, rs2, f7 = w & 0x7F, (w >> 7) & 31, (w >> 12) & 7, (w >> 15) & 31, (w >> 20) & 31, w >> 25
        a, b, imm, nxt, res = x[rs1], x[rs2], imm_of(w), pc + 4, None
        if op == 0x33:   res = alu(((f7 >> 5) << 3) | f3, a, b)
        elif op == 0x13: res = alu((((f7 >> 5) if f3 == 5 else 0) << 3) | f3, a, imm)
        elif op == 0x37: res = imm & MASK
        elif op == 0x17: res = (pc + imm) & MASK
        elif op == 0x03: res = dmem[(((a + imm) & MASK) >> 2) % mem_words]
        elif op == 0x23: dmem[(((a + imm) & MASK) >> 2) % mem_words] = b & MASK
        elif op == 0x63:
            if branch_taken(f3, a, b): nxt = (pc + imm) & MASK
        elif op == 0x6F: res, nxt = pc + 4, (pc + imm) & MASK
        elif op == 0x67: res, nxt = pc + 4, (a + imm) & ~1 & MASK
        if res is not None and rd:
            x[rd] = res & MASK
            writes.append((rd, res & MASK))
        if nxt == pc:          # jal x0, 0 → halt
            break
        pc = nxt
    return x, dmem, writes, steps

if __name__ == "__main__":
    # Self-check: encodings against known machine code (RISC-V spec / GNU as output)
    assert assemble([("addi", 1, 0, 5)]) == [0x00500093]
    assert assemble([("add", 3, 1, 2)]) == [0x002081B3]
    assert assemble([("sub", 3, 1, 2)]) == [0x402081B3]
    assert assemble([("srai", 5, 6, 3)]) == [0x40335293]
    assert assemble([("lui", 1, 0x12345)]) == [0x123450B7]
    assert assemble([("sw", 2, 8, 1)]) == [0x0020A423]
    assert assemble([("lw", 2, 8, 1)]) == [0x0080A103]
    assert assemble([("beq", 1, 2, 8)]) == [0x00208463]
    assert assemble([("jal", 1, 16)]) == [0x010000EF]
    assert assemble([("jalr", 0, 1, 0)]) == [0x00008067]
    assert assemble([("jal", 0, 0)]) == [0x0000006F]
    # li covers the sign-carry case of lui+addi
    for v in (0, 1, -1, 0x7FF, 0x800, 0xFFF, 0x12345678, 0x80000000, 0xDEADBEEF):
        regs, _, _, _ = run(assemble([("li", 5, v), ("jal", 0, 0)]))
        assert regs[5] == v & MASK, (hex(v), hex(regs[5]))
    # imm_of round-trips every format
    for ins, want in [(("addi", 1, 2, -7), -7), (("sw", 1, -20, 2), -20), (("bne", 1, 2, -64), -64),
                      (("jal", 1, -2048), -2048), (("lui", 1, 0xFFFFF), -4096), (("auipc", 1, 0x1), 4096)]:
        assert imm_of(assemble([ins])[0]) == want, ins
    # labels with li (2 words) before them resolve correctly
    regs, _, _, _ = run(assemble([("li", 1, 3), "loop:", ("addi", 1, 1, -1), ("bne", 1, 0, "loop"), ("jal", 0, 0)]))
    assert regs[1] == 0
    print("rv.py self-check OK")
