/**
 * scripts/lab.check.ts — the Board Lab (lib/lab): every lesson's starter synthesizes (Yosys, as the
 * browser does) and fails at least one goal, and, where the reference solutions are on this
 * machine (private/lab-solutions.ts, git-ignored), each passes every goal; plus the parameter
 * override, top-module finder and real-board wrapper.
 * Run: YOWASP_YOSYS=<path to @yowasp/yosys> npm run check-lab   (without it, only the unit checks)
 */
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { LESSONS } from "../lib/lab/lessons";
import { boardDesign, grade, missingParts, simParams, topModule, withParams } from "../lib/lab/run";
import { synthesize, type RunYosys } from "../lib/synth/run";
import type { BoardNetlist } from "../lib/gate-sim";

// ── Unit checks ─────────────────────────────────────────────────────────────
assert.equal(withParams("module m #(parameter CLK_HZ = 27_000_000) ();", { CLK_HZ: 1000 }), "module m #(parameter CLK_HZ = 1000) ();");
assert.equal(withParams("parameter CLK_HZ = 27_000_000, BAUD = 115_200;", { CLK_HZ: 16000, BAUD: 1000 }), "parameter CLK_HZ = 16000, BAUD = 1000;");
assert.equal(withParams("wire CLK_HZ_x = 5;", { CLK_HZ: 1 }), "wire CLK_HZ_x = 5;", "only parameter declarations change");
assert.equal(topModule(LESSONS.find((l) => l.slug === "uart-hello")!.starter), "lab", "the module nobody instantiates is the top");
assert.equal(topModule("module a(); endmodule"), "a");
const wrapped = boardDesign(LESSONS[1].starter, LESSONS[1].ports, "tangnano9k");
assert.match(wrapped, /input \[1:0\] btn_n/, "Tang Nano buttons are active low");
assert.match(wrapped, /assign led = ~led_on;/, "Tang Nano LEDs are active low");
assert.match(boardDesign(LESSONS[3].starter, LESSONS[3].ports, "tangnano9k"), /CLK_HZ = 27000000/, "the board's clock");
assert.doesNotMatch(boardDesign(LESSONS[1].starter, LESSONS[1].ports, "icebreaker"), /led_on/, "iCEBreaker LEDs are active high");
assert.deepEqual(missingParts(LESSONS[2].ports, "tangnano9k"), ["switches"]);
assert.equal(LESSONS.length, 30);
assert.equal(new Set(LESSONS.map((l) => l.slug)).size, LESSONS.length, "slugs are unique");
console.log("lab: unit checks passed");

// ── Every lesson, synthesized and graded ────────────────────────────────────
async function lessons() {
  if (!process.env.YOWASP_YOSYS) return console.log("lab lessons: skipped (set YOWASP_YOSYS)");
  const { runYosys } = (await import(pathToFileURL(process.env.YOWASP_YOSYS).href)) as { runYosys: RunYosys };
  const file = join(__dirname, "..", "private", "lab-solutions.ts");
  const SOLUTIONS: Record<string, string> | null = existsSync(file) ? (await import(pathToFileURL(file).href)).SOLUTIONS : null;
  if (!SOLUTIONS) console.log("lab lessons: no private/lab-solutions.ts here, checking the starters only");
  else for (const l of LESSONS) assert.ok(SOLUTIONS[l.slug], `${l.slug} has a reference solution`);
  const netlist = async (code: string) => {
    const r: any = await synthesize(runYosys, "board", code);
    assert.ok(r.ok, `synthesis failed: ${r.error}`);
    return r as BoardNetlist;
  };
  let failed = 0;
  for (const lesson of LESSONS) {
    const ref = SOLUTIONS ? grade(lesson, await netlist(withParams(SOLUTIONS[lesson.slug], simParams(lesson)))) : [];
    const starter = grade(lesson, await netlist(withParams(lesson.starter, simParams(lesson))));
    const bad = ref.map((r, i) => (r.ok ? null : `goal ${i + 1} "${lesson.goals[i]}": ${r.message}`)).filter(Boolean);
    const starterPasses = starter.every((r) => r.ok);
    if (bad.length || starterPasses) failed++;
    console.log(`${bad.length || starterPasses ? "FAIL" : "ok  "} ${lesson.slug}${bad.length ? `\n     reference: ${bad.join("\n     reference: ")}` : ""}${starterPasses ? "\n     the starter already passes every goal" : ""}`);
    // The real-board wrapper must parse and keep the board's port names.
    const board = await netlist(boardDesign(SOLUTIONS?.[lesson.slug] ?? lesson.starter, lesson.ports, "tangnano9k"));
    if ("btn" in lesson.ports) assert.ok(board.ports.btn_n, `${lesson.slug}: wrapper has btn_n`);
  }
  assert.equal(failed, 0, `${failed} lesson(s) failed`);
  console.log(`lab lessons: all ${LESSONS.length} passed`);
}
lessons().catch((e) => { console.error(e); process.exit(1); });

// ── Real-board models: each view's model and part positions exist ───────────
{
  const { readFileSync, existsSync: has } = require("node:fs") as typeof import("node:fs");
  const { VIEWS } = require("../lib/lab/boards3d") as typeof import("../lib/lab/boards3d");
  for (const v of VIEWS.filter((x) => x.model)) {
    const dir = join(__dirname, "..", "public", "models");
    assert.ok(has(join(dir, `${v.model}.glb`)), `${v.id}: ${v.model}.glb is built (scripts/board-models.mjs)`);
    const parts = JSON.parse(readFileSync(join(dir, `${v.model}.json`), "utf8"));
    assert.ok(v.ledsAsRgb ? parts.rgb : parts.leds.length >= 1, `${v.id}: has a light the lessons can drive`);
    for (const [x, z] of [...parts.leds, ...parts.buttons, ...parts.switches, ...(parts.rgb ? [parts.rgb] : [])]) assert.ok(x > 0 && x < 1 && z > 0 && z < 1, `${v.id}: part positions are in metres`);
  }
  const credits = JSON.parse(readFileSync(join(__dirname, "..", "public", "models", "CREDITS.json"), "utf8"));
  for (const v of VIEWS.filter((x) => x.model)) assert.ok(credits.some((c: { id: string }) => c.id === v.model), `${v.id} is credited`);
  console.log("lab: board models checked");
}
