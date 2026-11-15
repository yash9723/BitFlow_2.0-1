/**
 * scripts/walkthrough.check.ts — tests the Academy's code walkthroughs (npx tsx scripts/walkthrough.check.ts):
 * every step points at real lines and carries a sentence and a value for every signal, the drawn circuit's values come
 * from the circuit engine, and, when Icarus Verilog is installed, the same Verilog run in a real simulator gives
 * the values the walkthrough shows at every step.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { type Walk, WALKS, WALK_IDS, X, halfAdderWalk, partLines } from "../lib/academy/walkthrough";
import { ANIM_IDS } from "../lib/academy/anim";

for (const id of WALK_IDS) assert.ok(ANIM_IDS.includes(id), `${id} is not a registered animation`);

const walks = Object.fromEntries(WALK_IDS.map((id) => [id, WALKS[id]()])) as Record<(typeof WALK_IDS)[number], Walk>;

for (const id of WALK_IDS) {
  const w = walks[id];
  assert.ok(w.steps.length >= 4, `${id}: too short to be a walkthrough`);
  assert.equal(w.stimulus.length, w.steps.length, `${id}: one stimulus per step`);
  w.steps.forEach((st, i) => {
    const at = `${id} step ${i}`;
    assert.ok(st.caption.trim().length > 20, `${at}: needs a sentence`);
    for (const l of st.lines) assert.ok(Number.isInteger(l) && l >= 0 && l < w.code.length, `${at}: line ${l} is outside the code`);
    assert.equal(new Set(st.lines).size, st.lines.length, `${at}: duplicate lines`);
    for (const s of w.signals) assert.ok(typeof st.values[s.name] === "number", `${at}: no value for ${s.name}`);
    for (const s of w.signals) if (s.bits > 1 && st.values[s.name] !== X) assert.ok(st.values[s.name] >= 0 && st.values[s.name] < 2 ** s.bits, `${at}: ${s.name} does not fit in ${s.bits} bits`);
  });
  console.log("ok  ", id, `(${w.steps.length} steps)`);
}

// The drawn circuit: Verilog lines found for every part, values from the circuit engine, and the half adder's own arithmetic.
const ha = halfAdderWalk();
for (const label of ["a", "b", "s_xor", "c_and", "sum", "carry"]) assert.ok(partLines(ha.code, label).length > 0, `no Verilog line for ${label}`);
ha.steps.forEach((st, i) => {
  const { a, b, sum, carry } = st.values;
  assert.equal(sum, a ^ b, `half adder step ${i}: sum`);
  assert.equal(carry, a & b, `half adder step ${i}: carry`);
  assert.deepEqual(ha.forced[i], { a, b });
});
// After the first step, only the input that moved lights up on the input side.
ha.steps.slice(1).forEach((st, i) => {
  const prev = ha.steps[i].values, moved = st.values.a !== prev.a ? "a" : "b", other = moved === "a" ? "b" : "a";
  for (const l of partLines(ha.code, other)) if (!partLines(ha.code, "sum").includes(l) && !partLines(ha.code, "carry").includes(l)) assert.ok(!st.lines.includes(l), `half adder step ${i + 1}: ${other} did not move`);
});
console.log("ok   circuit walk matches the circuit engine");

// Real simulator cross-check.
const have = spawnSync("iverilog", ["-V"], { encoding: "utf8" }).status === 0;
if (!have) console.log("skip Icarus Verilog not installed: not cross-checking against a real simulator");
else {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "walk-"));
  for (const id of WALK_IDS) {
    const w = walks[id], module = w.code.join("\n"), name = /module\s+(\w+)/.exec(module)![1];
    const ins = w.signals.filter((s) => s.dir === "in" && s.name !== "clk"), outs = w.signals.filter((s) => s.dir !== "in");
    const hasClk = /input\s+clk\b/.test(module);
    const decl = [...ins.map((s) => `reg ${s.bits > 1 ? `[${s.bits - 1}:0] ` : ""}${s.name};`), hasClk ? "reg clk = 0;" : ""].join(" ");
    const wires = outs.filter((s) => s.dir === "out").map((s) => `wire ${s.bits > 1 ? `[${s.bits - 1}:0] ` : ""}${s.name};`).join(" ");
    const conn = [...ins, ...outs.filter((s) => s.dir === "out")].map((s) => `.${s.name}(${s.name})`).concat(hasClk ? [".clk(clk)"] : []).join(", ");
    const read = (s: (typeof outs)[number]) => (s.dir === "state" ? `dut.${s.name}` : s.name);
    const show = (list: typeof outs) => list.map((s) => `$display("${s.name} %b", ${read(s)});`).join(" ");
    const before = new Set(w.sampleBefore ?? []);
    const body = w.steps.map((st, i) => {
      const set = ins.map((s) => `${s.name} = ${w.stimulus[i][s.name]};`).join(" ");
      if (w.style === "levels") {
        const clk = hasClk ? `clk = ${w.stimulus[i].clk};` : "";
        return `${set} ${clk} #1; $display("STEP ${i}"); ${show(outs)}`;
      }
      const edge = st.lines.length > 0;
      const pre = outs.filter((s) => before.has(s.name)), post = outs.filter((s) => !before.has(s.name));
      return `clk = 0; ${set} #1; ${pre.length ? show(pre) : ""} ${edge ? "clk = 1; #1;" : ""} $display("STEP ${i}"); ${show(post)}`;
    }).join("\n    ");
    const tb = `${module}\nmodule tb; ${decl} ${wires}\n  ${name} dut(${conn});\n  initial begin\n    ${body}\n    $finish;\n  end\nendmodule\n`;
    const f = path.join(dir, `${id}.v`), out = path.join(dir, `${id}.vvp`);
    fs.writeFileSync(f, tb);
    const c = spawnSync("iverilog", ["-g2012", "-o", out, f], { encoding: "utf8" });
    assert.equal(c.status, 0, `${id}: Icarus could not compile the walkthrough's Verilog:\n${c.stderr}\n${tb}`);
    const run = spawnSync("vvp", [out], { encoding: "utf8" });
    assert.equal(run.status, 0, `${id}: vvp failed: ${run.stderr}`);
    // "pre" values come before their STEP marker and are kept for that step.
    const got: Record<string, number>[] = [], pending: Record<string, number> = {};
    const num = (b: string) => (/[xz]/i.test(b) ? X : parseInt(b, 2));
    for (const line of run.stdout.split("\n")) {
      const m = /^STEP (\d+)/.exec(line);
      if (m) { got[Number(m[1])] = { ...pending, ...(got[Number(m[1])] ?? {}) }; Object.keys(pending).forEach((k) => delete pending[k]); continue; }
      const v = /^(\w+) ([01xz]+)$/.exec(line.trim());
      if (!v) continue;
      const lastStep = got.length ? got.length - 1 : -1;
      // a value printed before its step marker belongs to the next step, one after belongs to the last marker
      (before.has(v[1]) ? pending : (got[lastStep] ??= {}))[v[1]] = num(v[2]);
    }
    w.steps.forEach((st, i) => {
      for (const s of w.signals) {
        if (s.dir === "in") continue;
        assert.equal(got[i]?.[s.name], st.values[s.name], `${id} step ${i}: ${s.name} is ${got[i]?.[s.name]} in Icarus but the walkthrough shows ${st.values[s.name]}`);
      }
    });
    console.log("ok   ", id, "matches Icarus Verilog at every step");
  }
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log("\nwalkthroughs OK");
