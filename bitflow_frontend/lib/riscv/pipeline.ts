/**
 * lib/riscv/pipeline.ts — a cycle-accurate classic 5-stage RV32I pipeline (IF ID EX
 * MEM WB) for the pipeline animator. Branches and jumps resolve in EX (predict not
 * taken; a taken one flushes the two younger instructions). The register file is
 * written in the first half of a cycle and read in the second, so WB → ID needs no
 * stall. Data hazards, by mode:
 *   forward  forwarding from EX/MEM and MEM/WB; a load followed by a user stalls one cycle
 *   stall    no forwarding; a reader waits in ID until its producers have written back
 *   none     no data-hazard handling at all: readers can see stale values (for teaching)
 * With forward or stall it must end in the same state as the ISS (lib/riscv/iss.ts);
 * scripts/riscv.check.ts checks that on random programs.
 */

import { type Decoded, MEM_WORDS, decode, execute, fetch } from "./iss";

export type HazardMode = "forward" | "stall" | "none";
export const STAGES = ["IF", "ID", "EX", "MEM", "WB"] as const;
export type Stage = (typeof STAGES)[number];

interface Slot {
  id: number; pc: number; word: number; d: Decoded;
  a: number; b: number;           // operands read in ID
  res?: number; nextPc?: number; index?: number;
}

export interface InFlight { id: number; pc: number; word: number }
export interface Forward { operand: "rs1" | "rs2"; reg: number; from: "MEM" | "WB"; value: number }
export interface Cycle {
  /** 1-based cycle number. */
  n: number;
  /** What each stage holds during this cycle (null = bubble). */
  stages: Record<Stage, InFlight | null>;
  /** ID held its instruction (and IF its fetch) because of a data hazard. */
  stall: boolean;
  /** Instructions squashed at the end of this cycle by a taken branch/jump in EX. */
  flushed: InFlight[];
  forwards: Forward[];
  regWrite?: { rd: number; value: number };
  memWrite?: { index: number; value: number };
  /** A data hazard went unhandled (mode "none"): the reader in ID got a stale register. */
  stale?: { reg: number; used: number; correct?: number };
}

export interface PipelineRun {
  cycles: Cycle[];
  retired: number;
  stalls: number;
  flushes: number;
  halted: boolean;
  regs: number[];
  dmem: number[];
}

const view = (s: Slot | null): InFlight | null => (s ? { id: s.id, pc: s.pc, word: s.word } : null);

export function simulate(words: number[], mode: HazardMode, maxCycles = 3000): PipelineRun {
  const regs = new Array<number>(32).fill(0), dmem = new Array<number>(MEM_WORDS).fill(0);
  let pc = 0, nextId = 0, fetching = true;
  let ifS: Slot | null = null, idS: Slot | null = null, exS: Slot | null = null, memS: Slot | null = null, wbS: Slot | null = null;
  const cycles: Cycle[] = [];
  let retired = 0, stalls = 0, flushes = 0, halted = false;

  for (let n = 1; n <= maxCycles; n++) {
    if (!ifS && fetching) {
      const word = fetch(words, pc);
      ifS = { id: nextId++, pc, word, d: decode(word), a: 0, b: 0 };
      pc = (pc + 4) >>> 0;
    }
    if (!ifS && !idS && !exS && !memS && !wbS) break;
    const c: Cycle = {
      n, stall: false, flushed: [], forwards: [],
      stages: { IF: view(ifS), ID: view(idS), EX: view(exS), MEM: view(memS), WB: view(wbS) },
    };

    // WB (first half of the cycle)
    if (wbS) {
      retired++;
      if (wbS.d.writes && wbS.res !== undefined) {
        regs[wbS.d.writes] = wbS.res;
        c.regWrite = { rd: wbS.d.writes, value: wbS.res };
      }
      if (wbS.nextPc === wbS.pc) halted = true;
    }

    // MEM
    if (memS?.d.load) memS.res = dmem[memS.index!];
    if (memS?.d.store) {
      dmem[memS.index!] = memS.b;
      c.memWrite = { index: memS.index!, value: memS.b };
    }

    // EX: operands, with forwarding from the instructions now in MEM and WB (the newer one wins)
    let redirect: number | null = null;
    if (exS) {
      for (const operand of ["rs1", "rs2"] as const) {
        const r = exS.d[operand];
        if (mode !== "forward" || !exS.d.reads.includes(r)) continue;
        const from = memS?.d.writes === r && !memS.d.load ? memS : wbS?.d.writes === r ? wbS : null;
        if (from?.res === undefined) continue;
        c.forwards.push({ operand, reg: r, from: from === memS ? "MEM" : "WB", value: from.res });
        if (operand === "rs1") exS.a = from.res; else exS.b = from.res;
      }
      const e = execute(exS.d, exS.pc, exS.a, exS.b);
      Object.assign(exS, e);
      if (e.nextPc !== exS.pc + 4) redirect = e.nextPc;
      if (e.nextPc === exS.pc) fetching = false;           // halt: stop fetching and let the pipeline drain
    }

    // ID: hazard check, then read the register file (after this cycle's WB write)
    let stall = false;
    if (idS) {
      const src = idS.d.reads;
      if (mode === "forward") stall = !!exS?.d.load && src.includes(exS.d.writes);
      else if (mode === "stall") stall = [exS, memS].some((p) => !!p?.d.writes && src.includes(p.d.writes));
      if (!stall) {
        idS.a = regs[idS.d.rs1];
        idS.b = regs[idS.d.rs2];
        if (mode === "none") {
          // A producer still in EX or MEM has not written back yet: this read is stale
          const p = [exS, memS].find((s) => !!s?.d.writes && src.includes(s.d.writes));
          if (p) c.stale = { reg: p.d.writes, used: regs[p.d.writes], correct: p.res };
        }
      }
    }

    // Advance the latches
    const toMem = exS, toWb = memS;
    if (redirect !== null) {
      c.flushed = [idS, ifS].filter((s): s is Slot => !!s).map((s) => view(s)!);
      flushes += c.flushed.length;
      exS = null; idS = null; ifS = null;
      pc = redirect;
    } else if (stall) {
      c.stall = true;
      stalls++;
      exS = null;                                           // a bubble goes into EX; ID and IF hold
    } else {
      exS = idS; idS = ifS; ifS = null;
    }
    memS = toMem; wbS = toWb;
    cycles.push(c);
    if (halted && !ifS && !idS && !exS && !memS && !wbS) break;
  }
  return { cycles, retired, stalls, flushes, halted, regs, dmem };
}

/** Starter programs for the animator; each shows one pipeline effect. */
export const PIPELINE_EXAMPLES: { name: string; about: string; src: string }[] = [
  {
    name: "Forwarding chain",
    about: "Each instruction needs the one before it. Forwarding hands results straight to EX, so nothing waits; turn it off to see stalls, or wrong answers with no hazard handling.",
    src: `# Back-to-back dependencies: forwarding removes every stall
        addi t0, zero, 1
        add  t1, t0, t0      # t0 comes from EX/MEM
        add  t2, t1, t0      # t1 from EX/MEM, t0 from MEM/WB
        add  t3, t2, t1
        sub  t4, t3, t0
        sw   t4, 0(zero)
        halt
`,
  },
  {
    name: "Load-use hazard",
    about: "A load's value only exists after MEM, one cycle too late for the next instruction's EX. Even with forwarding the pipeline stalls once.",
    src: `# The add uses t1 right after it is loaded: one stall, then a MEM/WB forward
        li   t0, 7
        sw   t0, 4(zero)
        lw   t1, 4(zero)
        add  t2, t1, t1
        addi t3, t2, 1
        sw   t3, 8(zero)
        halt
`,
  },
  {
    name: "Sum 1 to 10",
    about: "A loop. Every taken branch is found in EX, after two younger instructions were fetched: they are flushed, costing two cycles per iteration.",
    src: `# Sum 10 + 9 + ... + 1 into a0, then store it at address 0
        li   t0, 10          # counter
        li   a0, 0           # sum
loop:   add  a0, a0, t0
        addi t0, t0, -1
        bnez t0, loop
        sw   a0, 0(zero)
        halt
`,
  },
  {
    name: "Count the 1 bits",
    about: "Branch-heavy code: a conditional exit and a jump back on every iteration. Compare the CPI with the straight-line examples.",
    src: `# Count the 1 bits of a0 into a1
        li   a0, 0xB5
        li   a1, 0
loop:   beqz a0, done
        andi t0, a0, 1
        add  a1, a1, t0
        srli a0, a0, 1
        j    loop
done:   sw   a1, 0(zero)
        halt
`,
  },
];
