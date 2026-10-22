/**
 * lib/riscv/iss.ts — RV32I decode, execute and an instruction-set simulator: the
 * reference the pipeline model (lib/riscv/pipeline.ts) must agree with. A port of
 * imm_of/alu/branch_taken/run in scripts/riscv/rv.py. Values are unsigned 32-bit numbers.
 */

import { ABI, HALT, NOP } from "./asm";

export const MEM_WORDS = 256;

/** Sign-extend the low `bits` bits of v. */
export const sext = (v: number, bits: number) => (v << (32 - bits)) >> (32 - bits);

/** The immediate the decoder produces for any supported instruction word. */
export function immOf(w: number): number {
  const op = w & 0x7f;
  if (op === 0x13 || op === 0x03 || op === 0x67) return sext(w >>> 20, 12);
  if (op === 0x23) return sext(((w >>> 25) << 5) | ((w >>> 7) & 0x1f), 12);
  if (op === 0x63) return sext((((w >>> 31) & 1) << 12) | (((w >>> 7) & 1) << 11) | (((w >>> 25) & 0x3f) << 5) | (((w >>> 8) & 0xf) << 1), 13);
  if (op === 0x37 || op === 0x17) return w & 0xfffff000;          // already sign-extended (int32)
  if (op === 0x6f) return sext((((w >>> 31) & 1) << 20) | (((w >>> 12) & 0xff) << 12) | (((w >>> 20) & 1) << 11) | (((w >>> 21) & 0x3ff) << 1), 21);
  return 0;
}

export function alu(op4: number, a: number, b: number): number {
  const sh = b & 31;
  switch (op4) {
    case 0b0000: return (a + b) >>> 0;
    case 0b1000: return (a - b) >>> 0;
    case 0b0001: return (a << sh) >>> 0;
    case 0b0010: return (a | 0) < (b | 0) ? 1 : 0;
    case 0b0011: return a >>> 0 < b >>> 0 ? 1 : 0;
    case 0b0100: return (a ^ b) >>> 0;
    case 0b0101: return a >>> sh;
    case 0b1101: return ((a | 0) >> sh) >>> 0;
    case 0b0110: return (a | b) >>> 0;
    case 0b0111: return (a & b) >>> 0;
  }
  throw new Error(`bad ALU op ${op4}`);
}

export function branchTaken(f3: number, a: number, b: number): boolean {
  switch (f3) {
    case 0: return a === b;
    case 1: return a !== b;
    case 4: return (a | 0) < (b | 0);
    case 5: return (a | 0) >= (b | 0);
    case 6: return a < b;
    case 7: return a >= b;
  }
  return false;
}

export interface Decoded {
  op: number; rd: number; f3: number; rs1: number; rs2: number; f7: number; imm: number;
  /** Registers this instruction reads (x0 left out: it never causes a hazard). */
  reads: number[];
  /** Register it writes, or 0. */
  writes: number;
  load: boolean; store: boolean;
}

const WRITERS = new Set([0x33, 0x13, 0x37, 0x17, 0x03, 0x6f, 0x67]);

export function decode(w: number): Decoded {
  const op = w & 0x7f, rd = (w >>> 7) & 31, f3 = (w >>> 12) & 7, rs1 = (w >>> 15) & 31, rs2 = (w >>> 20) & 31, f7 = w >>> 25;
  const both = op === 0x33 || op === 0x23 || op === 0x63, one = op === 0x13 || op === 0x03 || op === 0x67;
  const reads = [...(both || one ? [rs1] : []), ...(both ? [rs2] : [])].filter((r) => r !== 0);
  return { op, rd, f3, rs1, rs2, f7, imm: immOf(w), reads, writes: WRITERS.has(op) ? rd : 0, load: op === 0x03, store: op === 0x23 };
}

export interface Executed {
  /** Value for rd (for a load: filled in by the memory stage). */
  res?: number;
  nextPc: number;
  /** Data-memory word index for a load or store. */
  index?: number;
}

/** What an instruction does given its operand values (no memory access): shared by the ISS and the pipeline. */
export function execute(d: Decoded, pc: number, a: number, b: number): Executed {
  const next = (pc + 4) >>> 0;
  switch (d.op) {
    case 0x33: return { res: alu(((d.f7 >>> 5) << 3) | d.f3, a, b), nextPc: next };
    case 0x13: return { res: alu(((d.f3 === 5 ? d.f7 >>> 5 : 0) << 3) | d.f3, a, d.imm >>> 0), nextPc: next };
    case 0x37: return { res: d.imm >>> 0, nextPc: next };
    case 0x17: return { res: (pc + d.imm) >>> 0, nextPc: next };
    case 0x03: case 0x23: return { index: (((a + d.imm) >>> 0) >>> 2) % MEM_WORDS, nextPc: next };
    case 0x63: return { nextPc: branchTaken(d.f3, a, b) ? (pc + d.imm) >>> 0 : next };
    case 0x6f: return { res: next, nextPc: (pc + d.imm) >>> 0 };
    case 0x67: return { res: next, nextPc: ((a + d.imm) & ~1) >>> 0 };
  }
  return { nextPc: next };       // anything else runs as a no-op
}

export const fetch = (words: number[], pc: number) => words[(pc >>> 2) % MEM_WORDS] ?? NOP;

export interface IssResult { regs: number[]; dmem: number[]; steps: number; halted: boolean }

/** Execute from pc=0 until a self-loop (`halt`, i.e. `jal x0, 0`) or maxSteps. */
export function run(words: number[], maxSteps = 2000): IssResult {
  const x = new Array<number>(32).fill(0), dmem = new Array<number>(MEM_WORDS).fill(0);
  let pc = 0, steps = 0;
  while (steps < maxSteps) {
    steps++;
    const d = decode(fetch(words, pc));
    const e = execute(d, pc, x[d.rs1], x[d.rs2]);
    if (d.load) e.res = dmem[e.index!];
    if (d.store) dmem[e.index!] = x[d.rs2];
    if (d.writes && e.res !== undefined) x[d.writes] = e.res;
    if (e.nextPc === pc) return { regs: x, dmem, steps, halted: true };
    pc = e.nextPc;
  }
  return { regs: x, dmem, steps, halted: false };
}

const hex = (v: number) => `0x${(v >>> 0).toString(16)}`;

/** Readable text for an instruction word (x-register names; branch targets by label when known). */
export function disasm(w: number, pc = 0, labelAt: Record<number, string> = {}): string {
  if (w === NOP) return "nop";
  if (w === HALT) return "halt";
  const d = decode(w), r = (n: number) => `x${n}`;
  const to = (off: number) => labelAt[(pc + off) >>> 0] ?? hex((pc + off) >>> 0);
  const R = ["add", "sll", "slt", "sltu", "xor", "srl", "or", "and"];
  const I = ["addi", "slli", "slti", "sltiu", "xori", "srli", "ori", "andi"];
  switch (d.op) {
    case 0x33: return `${d.f7 === 0x20 ? (d.f3 === 0 ? "sub" : "sra") : R[d.f3]} ${r(d.rd)}, ${r(d.rs1)}, ${r(d.rs2)}`;
    case 0x13:
      if (d.f3 === 1 || d.f3 === 5) return `${d.f3 === 5 && d.f7 === 0x20 ? "srai" : I[d.f3]} ${r(d.rd)}, ${r(d.rs1)}, ${d.rs2}`;
      return `${I[d.f3]} ${r(d.rd)}, ${r(d.rs1)}, ${d.imm}`;
    case 0x03: return `lw ${r(d.rd)}, ${d.imm}(${r(d.rs1)})`;
    case 0x23: return `sw ${r(d.rs2)}, ${d.imm}(${r(d.rs1)})`;
    case 0x63: return `${["beq", "bne", "", "", "blt", "bge", "bltu", "bgeu"][d.f3]} ${r(d.rs1)}, ${r(d.rs2)}, ${to(d.imm)}`;
    case 0x6f: return `jal ${r(d.rd)}, ${to(d.imm)}`;
    case 0x67: return `jalr ${r(d.rd)}, ${d.imm}(${r(d.rs1)})`;
    case 0x37: return `lui ${r(d.rd)}, ${hex(d.imm >>> 12)}`;
    case 0x17: return `auipc ${r(d.rd)}, ${hex(d.imm >>> 12)}`;
  }
  return `.word ${hex(w)}`;
}

/** "x5 (t0)" */
export const regName = (n: number) => `x${n} (${ABI[n]})`;
