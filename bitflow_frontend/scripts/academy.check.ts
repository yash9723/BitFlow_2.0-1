/**
 * scripts/academy.check.ts — tests the Academy's content (npx tsx scripts/academy.check.ts):
 * every live circuit runs and does what its chapter says, K-map answers are the real minimal
 * forms, worked figures match the arithmetic, and links and the chapter list are right.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ACADEMY_TOPICS } from "../lib/academy-content";
import { ACADEMY_TOPIC_META } from "../lib/academy-meta";
import type { AcademyBlock, AcademyTopic } from "../lib/academy-types";
import { GateSim, toNumber } from "../lib/gate-sim";
import { getProblemBySlug } from "../lib/problems/index";
import { compile, toBits, validate } from "../lib/studio/circuit";
import { challengeById } from "../lib/studio/circuit-challenges";
import { crossesPart, routeAll } from "../lib/studio/circuit-route";
import { wireRoute } from "../lib/studio/circuit-edit";
import { minimizePos, minimizeSop, posText, sopText } from "../lib/studio/logic-min";

const ROOT = process.cwd();
const blocksOf = (t: AcademyTopic) => t.sections.flatMap((s) => s.blocks ?? []);
const rewritten = (t: AcademyTopic) => blocksOf(t).length > 0;

function checkCircuit(where: string, b: Extract<AcademyBlock, { kind: "circuit" }>) {
  const errors = validate(b.circuit).filter((i) => i.level === "error");
  assert.deepEqual(errors, [], `${where}: circuit has errors`);
  const { net } = compile(b.circuit);
  assert.ok(b.checks.length > 0, `${where}: circuit has no checks`);
  // One simulator across the checks, so a sequential circuit's checks can walk through its states.
  const sim = new GateSim(net);
  for (const c of b.checks) {
    for (const [port, v] of Object.entries(c.set)) {
      assert.ok(sim.ports[port], `${where}: no input ${port}`);
      sim.set(port, toBits(v, sim.ports[port].bits.length));
    }
    for (const [port, v] of Object.entries(c.expect)) {
      assert.ok(sim.ports[port], `${where}: no output ${port}`);
      assert.equal(toNumber(sim.get(port)), v, `${where}: with ${JSON.stringify(c.set)}, ${port}`);
    }
  }
  // It has to be readable: no wire runs through a part it doesn't connect to.
  const routed = routeAll(b.circuit), byId = new Map(routed.parts.map((p) => [p.id, p]));
  for (const w of routed.wires) {
    const pts = wireRoute(w, byId.get(w.from.part)!, byId.get(w.to.part)!);
    for (const p of routed.parts) {
      if (p.id === w.from.part || p.id === w.to.part) continue;
      assert.ok(!crossesPart(pts, p), `${where}: wire ${w.from.part}.${w.from.pin} → ${w.to.part}.${w.to.pin} runs through ${p.label}`);
    }
  }
}

function checkLink(where: string, href: string) {
  const [, area, rest] = href.match(/^\/([^/]+)\/?(.*)$/) ?? [];
  assert.ok(area, `${where}: bad link ${href}`);
  if (area === "academy" && rest && !rest.includes("/") && rest !== "roadmap") return assert.ok(ACADEMY_TOPICS.some((t) => t.slug === rest), `${where}: no chapter ${href}`);
  if (area === "problems" && rest) return assert.ok(getProblemBySlug(rest), `${where}: no problem ${href}`);
  if (area === "studio" && rest.startsWith("challenges/")) return assert.ok(challengeById(rest.slice(11)), `${where}: no challenge ${href}`);
  assert.ok(fs.existsSync(path.join(ROOT, "app", area, rest, "page.tsx")), `${where}: no page ${href}`);
}

let circuits = 0, kmaps = 0, practice = 0;
const topicIds = new Set<string>();
for (const t of ACADEMY_TOPICS) {
  assert.ok(!topicIds.has(t.slug), `duplicate chapter ${t.slug}`);
  topicIds.add(t.slug);
  for (const s of t.prerequisites ?? []) assert.ok(ACADEMY_TOPICS.some((x) => x.slug === s), `${t.slug}: unknown prerequisite ${s}`);

  const ids = (list: { id: string }[], what: string) => assert.equal(new Set(list.map((x) => x.id)).size, list.length, `${t.slug}: duplicate ${what} id`);
  ids(t.sections, "section"); ids(t.quiz, "quiz"); ids(t.flashcards, "flashcard"); ids(t.videos, "video");
  for (const q of t.quiz) {
    assert.ok(q.correctIndex >= 0 && q.correctIndex < q.options.length, `${t.slug}/${q.id}: answer out of range`);
    assert.equal(new Set(q.options).size, q.options.length, `${t.slug}/${q.id}: repeated option`);
  }

  if (!rewritten(t)) continue;
  assert.ok(t.quiz.length >= 10, `${t.slug}: needs at least 10 quiz questions`);
  assert.ok(t.flashcards.length >= 8, `${t.slug}: needs at least 8 flashcards`);
  // Text supports **bold** and `code` only: a stray * or ` would show up literally on the page.
  for (const m of JSON.stringify({ sections: t.sections.map((s) => (s.blocks ?? []).map((b) => (b.kind === "circuit" ? b.caption : b))), quiz: t.quiz, cards: t.flashcards })
    .replace(/`[^`]*`/g, "").replace(/\*\*[^*]+\*\*/g, "").matchAll(/.{0,30}[*`].{0,30}/g)) assert.fail(`${t.slug}: stray markup in "${m[0]}"`);
  for (const s of t.sections) {
    const where = `${t.slug}/${s.id}`;
    assert.ok(s.blocks?.length, `${where}: empty section`);
    s.blocks!.forEach((b, i) => {
      const at = `${where}[${i}]`;
      switch (b.kind) {
        case "circuit": circuits++; checkCircuit(at, b); break;
        case "kmap": {
          kmaps++;
          assert.equal(b.cells.length, 2 ** b.names.length, `${at}: wrong number of K-map cells`);
          const text = b.form === "pos" ? posText(minimizePos(b.names.length, b.cells), b.names, "math") : sopText(minimizeSop(b.names.length, b.cells), b.names, "math");
          assert.equal(text, b.expect, `${at}: K-map answer`);
          break;
        }
        case "practice":
          practice++;
          assert.ok(b.correctIndex >= 0 && b.correctIndex < b.options.length, `${at}: answer out of range`);
          assert.equal(new Set(b.options).size, b.options.length, `${at}: repeated option`);
          break;
        case "table": for (const r of b.rows) assert.equal(r.length, b.headers.length, `${at}: row width`); break;
        case "link": checkLink(at, b.href); break;
        case "timing": for (const sig of b.diagram.signals) assert.ok(sig.dir === "clock" || sig.values.length === b.diagram.cycles, `${at}: ${sig.name} needs ${b.diagram.cycles} values`); break;
      }
    });
  }
}
assert.ok(circuits >= 6 && kmaps >= 1 && practice >= 10, "chapters lost their circuits or practice questions");

// ── Worked figures in the text are computed here, not trusted ─────────────────
function says(slug: string, ...facts: string[]) {
  const t = ACADEMY_TOPICS.find((x) => x.slug === slug)!;
  const words = JSON.stringify({ sections: t.sections, quiz: t.quiz });
  for (const f of facts) assert.ok(words.includes(f), `${slug} should say "${f}"`);
}
const bin = (n: number, w = 0) => n.toString(2).padStart(w, "0");
const parity = (n: number) => bin(n).split("").filter((c) => c === "1").length % 2;
const gray = (n: number) => n ^ (n >> 1);
const unsigned = (s: string, base = 2) => parseInt(s, base);
const signed = (s: string) => unsigned(s) - (s[0] === "1" ? 2 ** s.length : 0);

says("what-is-digital", `2⁵ = ${2 ** 5}`, `2¹⁰ = ${2 ** 10}`, `${(2.4 - 2).toFixed(1)} V`, `0.7 − 0.2 = **${(0.7 - 0.2).toFixed(1)} V**`);
says("number-systems",
  `101101₂`, `**${unsigned("101101")}**`, bin(45), `D6₁₆ = 13×16 + 6 = ${0xd6}`, `110101₂ = ${unsigned("110101").toString(8)}₈`,
  `(212)₃`, `= ${unsigned("212", 3)}.`, `**1657**`, `${0x3af}`, `13.25`, `**r = ${Math.sqrt(144) - 1}**`);
assert.equal(unsigned("1657", 8), 0x3af);
assert.equal(bin(13) + ".01", "1101.01");
assert.equal(unsigned("23", 6) + unsigned("14", 6), unsigned("41", 6));     // the "find r" practice question
says("binary-arithmetic",
  `**${bin(11 + 6)}**, which is ${11 + 6}`, `**${bin(13 * 5)}**, which is ${13 * 5}`, `**${bin(256 - 104, 8).replace(/(.{4})/, "$1 ")}**`,
  `1011 = −8 + 2 + 1 = ${signed("1011")}`.replace("-", "−"), `**${"−106"}**`, `**−20**`, `**7642**`, `**7643**`);
assert.equal(signed("11111011"), -5);
assert.equal(signed(bin(100 + 50, 8)), -106);
assert.equal(signed("101100"), -20);
assert.equal(9999 - 2357, 7642);
says("codes",
  `${bin(59)}`, `${bin(5, 4)} ${bin(9, 4)}`, `${bin(5 + 3, 4)} ${bin(9 + 3, 4)}`, `${bin(gray(0b1011), 4)}`, `**0110011**`);
for (let i = 0; i < 8; i++) says("codes", `"${i}","${bin(i, 3)}","${bin(gray(i), 3)}"`);
assert.equal(parity(0b1011), 1);
// Hamming(7,4): positions 1..7 of the codeword, computed from the data, and the checks that find a flipped bit.
{
  const code = (d: string) => { const c = [0, 0, 0, +d[0], 0, +d[1], +d[2], +d[3]];
    for (const pp of [1, 2, 4]) c[pp] = [1, 2, 3, 4, 5, 6, 7].filter((i) => i & pp && i !== pp).reduce((a, i) => a ^ c[i], 0);
    return c.slice(1).join(""); };
  const syndrome = (w: string) => [1, 2, 3, 4, 5, 6, 7].reduce((s, i) => (w[i - 1] === "1" ? s ^ i : s), 0);
  assert.equal(code("1011"), "0110011");
  assert.equal(syndrome("0110011"), 0);
  assert.equal(syndrome("0110111"), 5);
  says("codes", "0110111");
}
{
  const words = [0b00000, 0b01011, 0b10101, 0b11110];                       // the distance practice question
  const dist = words.flatMap((a, i) => words.slice(i + 1).map((b) => bin(a ^ b).split("").filter((c) => c === "1").length));
  assert.equal(Math.min(...dist), 3);
}

// ── The chapter list that client pages use ────────────────────────────────────
assert.deepEqual(
  ACADEMY_TOPIC_META,
  ACADEMY_TOPICS.map(({ slug, title, summary, icon, difficulty, order, estimatedMinutes }) => ({ slug, title, summary, icon, difficulty, order, estimatedMinutes })),
  "lib/academy-meta.ts is out of step with the chapters",
);

// Chapters are heavy: no client code may import them directly.
function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== "node_modules") walk(f, out); }
    else if (/\.tsx?$/.test(e.name)) out.push(f);
  }
  return out;
}
for (const f of ["app", "components", "hooks"].flatMap((d) => (fs.existsSync(path.join(ROOT, d)) ? walk(path.join(ROOT, d)) : []))) {
  const src = fs.readFileSync(f, "utf8");
  if (/^\s*["']use client["']/.test(src)) assert.ok(!src.includes("academy-content"), `${path.relative(ROOT, f)} is client code importing lib/academy-content`);
}

console.log(`academy: ${ACADEMY_TOPICS.length} chapters OK (${circuits} circuits, ${kmaps} K-maps, ${practice} practice questions tested)`);
