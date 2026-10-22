/**
 * lib/riscv/asm.ts — RV32I assembler for the pipeline animator (/studio/pipeline):
 * assembly text → 32-bit words. The encodings and the two-word `li` are a port of
 * scripts/riscv/rv.py (the RISC-V track's reference); this adds a text parser with
 * labels, ABI register names and a few pseudo-instructions. Self-check: scripts/riscv.check.ts.
 *
 * Supported: LUI AUIPC JAL JALR, BEQ BNE BLT BGE BLTU BGEU, LW SW, ADDI SLTI SLTIU XORI
 * ORI ANDI SLLI SRLI SRAI, ADD SUB SLL SLT SLTU XOR SRL SRA OR AND; pseudo: nop li mv
 * j beqz bnez ret halt (halt = `jal x0, 0`, the self-loop that stops the simulation).
 */

export const NOP = 0x00000013;
export const HALT = 0x0000006f;

const R_OPS: Record<string, [number, number]> = { // name: [funct7, funct3]
  add: [0x00, 0], sub: [0x20, 0], sll: [0x00, 1], slt: [0x00, 2], sltu: [0x00, 3],
  xor: [0x00, 4], srl: [0x00, 5], sra: [0x20, 5], or: [0x00, 6], and: [0x00, 7],
};
const I_OPS: Record<string, number> = { addi: 0, slti: 2, sltiu: 3, xori: 4, ori: 6, andi: 7 };
const SH_OPS: Record<string, [number, number]> = { slli: [0x00, 1], srli: [0x00, 5], srai: [0x20, 5] };
const B_OPS: Record<string, number> = { beq: 0, bne: 1, blt: 4, bge: 5, bltu: 6, bgeu: 7 };

/** ABI names by register number (x8 is also "fp"). */
export const ABI = ["zero", "ra", "sp", "gp", "tp", "t0", "t1", "t2", "s0", "s1", "a0", "a1", "a2", "a3", "a4", "a5",
  "a6", "a7", "s2", "s3", "s4", "s5", "s6", "s7", "s8", "s9", "s10", "s11", "t3", "t4", "t5", "t6"];

class AsmError extends Error {}
const fail = (msg: string): never => { throw new AsmError(msg); };
const u32 = (x: number) => x >>> 0;

const encR = (f7: number, rs2: number, rs1: number, f3: number, rd: number, op: number) =>
  u32((f7 << 25) | (rs2 << 20) | (rs1 << 15) | (f3 << 12) | (rd << 7) | op);
function encI(imm: number, rs1: number, f3: number, rd: number, op: number) {
  if (imm < -2048 || imm > 2047) fail(`immediate ${imm} is outside -2048..2047`);
  return u32(((imm & 0xfff) << 20) | (rs1 << 15) | (f3 << 12) | (rd << 7) | op);
}
function encS(imm: number, rs2: number, rs1: number, f3: number, op: number) {
  if (imm < -2048 || imm > 2047) fail(`offset ${imm} is outside -2048..2047`);
  imm &= 0xfff;
  return u32(((imm >> 5) << 25) | (rs2 << 20) | (rs1 << 15) | (f3 << 12) | ((imm & 0x1f) << 7) | op);
}
function encB(imm: number, rs2: number, rs1: number, f3: number) {
  if (imm % 2 || imm < -4096 || imm > 4094) fail(`branch offset ${imm} is out of range`);
  imm &= 0x1fff;
  return u32((((imm >> 12) & 1) << 31) | (((imm >> 5) & 0x3f) << 25) | (rs2 << 20) | (rs1 << 15) | (f3 << 12)
    | (((imm >> 1) & 0xf) << 8) | (((imm >> 11) & 1) << 7) | 0x63);
}
const encU = (imm20: number, rd: number, op: number) => u32(((imm20 & 0xfffff) << 12) | (rd << 7) | op);
function encJ(imm: number, rd: number) {
  if (imm % 2 || imm < -(1 << 20) || imm >= 1 << 20) fail(`jump offset ${imm} is out of range`);
  imm &= 0x1fffff;
  return u32((((imm >> 20) & 1) << 31) | (((imm >> 1) & 0x3ff) << 21) | (((imm >> 11) & 1) << 20)
    | (((imm >> 12) & 0xff) << 12) | (rd << 7) | 0x6f);
}

function reg(tok: string | undefined): number {
  const t = (tok ?? "").toLowerCase();
  const x = /^x(\d{1,2})$/.exec(t);
  if (x && Number(x[1]) < 32) return Number(x[1]);
  if (t === "fp") return 8;
  const i = ABI.indexOf(t);
  return i >= 0 ? i : fail(`"${tok ?? ""}" is not a register (x0..x31 or an ABI name like t0, a0, sp)`);
}
function num(tok: string | undefined): number {
  const m = /^([-+]?)(0x[0-9a-f]+|0b[01]+|\d+)$/i.exec(tok ?? "");
  if (!m) return fail(`"${tok ?? ""}" is not a number`);
  const v = m[2].toLowerCase().startsWith("0b") ? parseInt(m[2].slice(2), 2) : Number(m[2]);
  return m[1] === "-" ? -v : v;
}
/** A branch/jump target: a label, or a number (a byte offset from this instruction). */
const target = (tok: string | undefined): number | string => (/^[A-Za-z_.][\w.]*$/.test(tok ?? "") ? tok! : num(tok));
/** "imm(rs1)" or "(rs1)" → [imm, rs1] */
function memOperand(tok: string | undefined): [number, number] {
  const m = /^(.*)\(\s*([^)]+?)\s*\)$/.exec(tok ?? "");
  if (!m) return fail(`expected offset(register), like 8(sp), not "${tok ?? ""}"`);
  return [m[1].trim() ? num(m[1].trim()) : 0, reg(m[2])];
}

type Operand = number | string;
interface Ins { m: string; a: Operand[]; line: number }

/** One source line's instruction → canonical form (pseudo-instructions expanded, except li). */
function parseIns(m: string, ops: string[]): Pick<Ins, "m" | "a"> {
  const want = (n: number) => { if (ops.length !== n) fail(`${m} takes ${n} operand${n === 1 ? "" : "s"}, got ${ops.length}`); };
  if (m in R_OPS) { want(3); return { m, a: [reg(ops[0]), reg(ops[1]), reg(ops[2])] }; }
  if (m in I_OPS) { want(3); return { m, a: [reg(ops[0]), reg(ops[1]), num(ops[2])] }; }
  if (m in SH_OPS) {
    want(3);
    const sh = num(ops[2]);
    if (sh < 0 || sh > 31) fail(`shift amount ${sh} is outside 0..31`);
    return { m, a: [reg(ops[0]), reg(ops[1]), sh] };
  }
  if (m in B_OPS) { want(3); return { m, a: [reg(ops[0]), reg(ops[1]), target(ops[2])] }; }
  switch (m) {
    case "lw": case "sw": { want(2); const [imm, rs1] = memOperand(ops[1]); return { m, a: [reg(ops[0]), imm, rs1] }; }
    case "jal":
      if (ops.length === 1) return { m, a: [1, target(ops[0])] };
      want(2); return { m, a: [reg(ops[0]), target(ops[1])] };
    case "jalr":
      if (ops.length === 1) return { m, a: [1, reg(ops[0]), 0] };
      if (ops.length === 2) { const [imm, rs1] = memOperand(ops[1]); return { m, a: [reg(ops[0]), rs1, imm] }; }
      want(3); return { m, a: [reg(ops[0]), reg(ops[1]), num(ops[2])] };
    case "lui": case "auipc": {
      want(2);
      const v = num(ops[1]);
      if (v < -0x80000 || v > 0xfffff) fail(`upper immediate ${v} doesn't fit in 20 bits`);
      return { m, a: [reg(ops[0]), v] };
    }
    case "li": want(2); return { m, a: [reg(ops[0]), num(ops[1])] };
    case "mv": want(2); return { m: "addi", a: [reg(ops[0]), reg(ops[1]), 0] };
    case "nop": want(0); return { m: "addi", a: [0, 0, 0] };
    case "j": want(1); return { m: "jal", a: [0, target(ops[0])] };
    case "beqz": case "bnez": want(2); return { m: m === "beqz" ? "beq" : "bne", a: [reg(ops[0]), 0, target(ops[1])] };
    case "ret": want(0); return { m: "jalr", a: [0, 1, 0] };
    case "halt": want(0); return { m: "jal", a: [0, 0] };
  }
  return fail(`unknown instruction "${m}"`);
}

export interface AsmProblem { line: number; message: string }
export interface Assembled {
  words: number[];
  /** Source line (1-based) of each word. */
  lines: number[];
  /** Label → byte address. */
  labels: Record<string, number>;
  errors: AsmProblem[];
}

export function assemble(src: string): Assembled {
  const errors: AsmProblem[] = [];
  const prog: Ins[] = [];
  const labels: Record<string, number> = {};
  let pc = 0;
  src.split("\n").forEach((raw, i) => {
    const line = i + 1;
    let text = raw.replace(/(#|\/\/).*$/, "").trim();
    try {
      for (let m; (m = /^([A-Za-z_.][\w.]*)\s*:/.exec(text)); text = text.slice(m[0].length).trim()) {
        if (m[1] in labels) fail(`label "${m[1]}" is defined twice`);
        labels[m[1]] = pc;
      }
      if (!text) return;
      const [, mn, rest] = /^(\S+)\s*(.*)$/.exec(text)!;
      const ops = rest.trim() ? rest.split(",").map((s) => s.trim()) : [];
      const ins = { ...parseIns(mn.toLowerCase(), ops), line };
      prog.push(ins);
      pc += ins.m === "li" ? 8 : 4;
    } catch (e) {
      if (!(e instanceof AsmError)) throw e;
      errors.push({ line, message: e.message });
    }
  });

  const words: number[] = [], lines: number[] = [];
  pc = 0;
  for (const { m, a, line } of prog) {
    const tgt = (t: Operand) => typeof t === "number" ? t : t in labels ? labels[t] - pc : fail(`no label called "${t}"`);
    const n = a as number[];
    try {
      let w: number;
      if (m in R_OPS) w = encR(R_OPS[m][0], n[2], n[1], R_OPS[m][1], n[0], 0x33);
      else if (m in I_OPS) w = encI(n[2], n[1], I_OPS[m], n[0], 0x13);
      else if (m in SH_OPS) w = encR(SH_OPS[m][0], n[2], n[1], SH_OPS[m][1], n[0], 0x13);
      else if (m in B_OPS) w = encB(tgt(a[2]), n[1], n[0], B_OPS[m]);
      else if (m === "lw") w = encI(n[1], n[2], 2, n[0], 0x03);
      else if (m === "sw") w = encS(n[1], n[0], n[2], 2, 0x23);
      else if (m === "jal") w = encJ(tgt(a[1]), n[0]);
      else if (m === "jalr") w = encI(n[2], n[1], 0, n[0], 0x67);
      else if (m === "lui") w = encU(n[1], n[0], 0x37);
      else if (m === "auipc") w = encU(n[1], n[0], 0x17);
      else { // li: rd = 32-bit constant as lui + addi (always two words)
        const v = n[1] >>> 0;
        const lo = ((v & 0xfff) ^ 0x800) - 0x800;            // sign-extended low 12 bits
        words.push(encU(((v - lo) >>> 12) & 0xfffff, n[0], 0x37)); lines.push(line); pc += 4;
        w = encI(lo, n[0], 0, n[0], 0x13);
      }
      words.push(w); lines.push(line);
    } catch (e) {
      if (!(e instanceof AsmError)) throw e;
      errors.push({ line, message: e.message });
      words.push(NOP); lines.push(line);
    }
    pc += 4;
  }
  errors.sort((x, y) => x.line - y.line);
  return { words, lines, labels, errors };
}
