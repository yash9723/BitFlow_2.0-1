/**
 * scripts/riscv.check.ts — self-check for lib/riscv (npx tsx scripts/riscv.check.ts):
 * the assembler's encodings against scripts/riscv/rv.py's known machine code, the ISS,
 * and the pipeline model ending in the same state as the ISS on random hazard-heavy
 * programs. Set RV_DUMP=file.json to also write the random programs and their ISS
 * results, for a cross-check against rv.py's run().
 */
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { assemble } from "../lib/riscv/asm";
import { disasm, immOf, run } from "../lib/riscv/iss";
import { PIPELINE_EXAMPLES, simulate } from "../lib/riscv/pipeline";

const words = (src: string) => {
  const a = assemble(src);
  assert.deepEqual(a.errors, [], `${src}: ${JSON.stringify(a.errors)}`);
  return a.words;
};

// Encodings (the same cases as rv.py's self-check)
for (const [src, want] of [
  ["addi x1, x0, 5", 0x00500093], ["add x3, x1, x2", 0x002081b3], ["sub x3, x1, x2", 0x402081b3],
  ["srai x5, x6, 3", 0x40335293], ["lui x1, 0x12345", 0x123450b7], ["sw x2, 8(x1)", 0x0020a423],
  ["lw x2, 8(x1)", 0x0080a103], ["beq x1, x2, 8", 0x00208463], ["jal x1, 16", 0x010000ef],
  ["jalr x0, x1, 0", 0x00008067], ["jal x0, 0", 0x0000006f], ["halt", 0x0000006f], ["ret", 0x00008067],
  ["addi a0, zero, 1", 0x00100513], ["mv s0, sp", 0x00010413], ["nop", 0x00000013],
] as const) assert.equal(words(src)[0], want, src);

// li covers the sign-carry case of lui+addi
for (const v of [0, 1, -1, 0x7ff, 0x800, 0xfff, 0x12345678, 0x80000000, 0xdeadbeef]) {
  const r = run(words(`li x5, ${v < 0 ? v : `0x${v.toString(16)}`}\nhalt`));
  assert.ok(r.halted);
  assert.equal(r.regs[5], v >>> 0, `li ${v}`);
}
// The decoder's immediate round-trips every format
for (const [src, want] of [["addi x1, x2, -7", -7], ["sw x1, -20(x2)", -20], ["bne x1, x2, -64", -64],
  ["jal x1, -2048", -2048], ["lui x1, 0xFFFFF", -4096], ["auipc x1, 0x1", 4096]] as const) {
  assert.equal(immOf(words(src)[0]), want, src);
}
// Labels after a two-word li resolve correctly
assert.equal(run(words("li x1, 3\nloop: addi x1, x1, -1\nbne x1, x0, loop\nhalt")).regs[1], 0);
// Errors name the line
const bad = assemble("addi x1, x0, 1\naddi x1, x0\nlw x1, 4\nj nowhere\nfrob x1\naddi x1, x0, 5000");
assert.deepEqual(bad.errors.map((e) => e.line), [2, 3, 4, 5, 6]);
assert.match(bad.errors[3].message, /unknown instruction/);
assert.equal(disasm(words("beq x1, x2, 8")[0], 0x10, { 0x18: "out" }), "beq x1, x2, out");
console.log("asm + iss: ok");

// The examples: the pipeline agrees with the ISS, and each shows its effect
const same = (src: string, label: string) => {
  const w = words(src), iss = run(w);
  assert.ok(iss.halted, `${label} halts`);
  for (const mode of ["forward", "stall"] as const) {
    const p = simulate(w, mode);
    assert.ok(p.halted, `${label} ${mode} halts`);
    assert.deepEqual(p.regs, iss.regs, `${label} ${mode} registers`);
    assert.deepEqual(p.dmem, iss.dmem, `${label} ${mode} memory`);
    assert.equal(p.retired, iss.steps, `${label} ${mode} retires every instruction once`);
  }
  return w;
};
const ex = Object.fromEntries(PIPELINE_EXAMPLES.map((e) => [e.name, same(e.src, e.name)]));
const chain = ex["Forwarding chain"], loadUse = ex["Load-use hazard"], loop = ex["Sum 1 to 10"];
assert.equal(simulate(chain, "forward").stalls, 0, "forwarding removes every stall");
assert.ok(simulate(chain, "forward").cycles.some((c) => c.forwards.some((f) => f.from === "MEM")), "an EX/MEM forward");
assert.ok(simulate(chain, "forward").cycles.some((c) => c.forwards.some((f) => f.from === "WB")), "a MEM/WB forward");
assert.ok(simulate(chain, "stall").stalls > 4, "without forwarding it stalls");
assert.notDeepEqual(simulate(chain, "none").regs, run(chain).regs, "no hazard handling gives wrong results");
assert.ok(simulate(chain, "none").cycles.some((c) => c.stale), "the stale read is reported");
assert.equal(simulate(loadUse, "forward").stalls, 1, "a load-use stall");
assert.equal(run(loop).regs[10], 55);
assert.equal(simulate(loop, "forward").flushes, 2 * 9 + 2, "two flushed per taken branch (9 loop-backs and the halt jump)");
// Straight-line code with no hazards: 5 + (n - 1) cycles
const straight = words("addi x1, x0, 1\naddi x2, x0, 2\naddi x3, x0, 3\naddi x4, x0, 4\nhalt");
assert.equal(simulate(straight, "forward").cycles.length, 5 + 4);
console.log("examples: ok");

// Random hazard-heavy programs (forward control flow only, so they all halt)
let seed = 12345;
const rnd = (n: number) => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) % n);
const pick = <T,>(xs: readonly T[]) => xs[rnd(xs.length)];
const R = ["add", "sub", "sll", "slt", "sltu", "xor", "srl", "sra", "or", "and"] as const;
const I = ["addi", "slti", "sltiu", "xori", "ori", "andi"] as const;
const SH = ["slli", "srli", "srai"] as const;
const B = ["beq", "bne", "blt", "bge", "bltu", "bgeu"] as const;
const x = () => `x${rnd(5) + 1}`;            // x1..x5: lots of dependencies
const dump: { words: number[]; regs: number[]; dmem: number[] }[] = [];
let staleRuns = 0;
for (let t = 0; t < 300; t++) {
  const n = 6 + rnd(25), lines: string[] = [], targets = new Set<number>();
  for (let i = 0; i < n; i++) {
    const k = rnd(100);
    if (k < 25) lines.push(`${pick(R)} ${x()}, ${x()}, ${x()}`);
    else if (k < 45) lines.push(`${pick(I)} ${x()}, ${x()}, ${rnd(41) - 20}`);
    else if (k < 52) lines.push(`${pick(SH)} ${x()}, ${x()}, ${rnd(6)}`);
    else if (k < 64) lines.push(`lw ${x()}, ${4 * rnd(8)}(x0)`);
    else if (k < 74) lines.push(`sw ${x()}, ${4 * rnd(8)}(x0)`);
    else if (k < 78) lines.push(`li ${x()}, ${rnd(2000) - 1000}`);
    else if (k < 80) lines.push(`lui ${x()}, ${rnd(16)}`);
    else if (k < 81) lines.push(`auipc ${x()}, ${rnd(4)}`);
    else {
      const to = i + 1 + rnd(n - i);         // a later line, or the final halt
      targets.add(to);
      lines.push(k < 95 ? `${pick(B)} ${x()}, ${x()}, L${to}` : `jal ${x()}, L${to}`);
    }
  }
  lines.push("halt");
  const src = lines.map((l, i) => (targets.has(i) ? `L${i}: ${l}` : l)).join("\n");
  const w = same(src, `random #${t}`);
  const iss = run(w);
  if (JSON.stringify(simulate(w, "none").regs) !== JSON.stringify(iss.regs)) staleRuns++;
  dump.push({ words: w, regs: iss.regs, dmem: iss.dmem });
}
assert.ok(staleRuns > 50, `no hazard handling should often go wrong (${staleRuns}/300)`);
if (process.env.RV_DUMP) writeFileSync(process.env.RV_DUMP, JSON.stringify(dump));
console.log(`random programs: ok (300 agree with the ISS in forward and stall modes; ${staleRuns} go wrong without hazard handling)`);
console.log("riscv: all checks passed");
