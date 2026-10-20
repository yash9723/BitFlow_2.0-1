/**
 * lib/debug-problems.ts — "find the bug" Arena problems made from a solved
 * problem's reference solution: one line changed (lib/mutants.ts), graded by
 * the same hidden tests as the original. A change qualifies only if the design
 * still compiles and runs to the end of the public testbench, but fails the
 * hidden tests. The new problem is locked until its parent is solved
 * (lib/unlock.ts): its starter is one edit from the parent's answer.
 * Generated on the server (POST /api/admin/debug-problems), so the reference
 * and the changed copy never leave it.
 */
import { prisma } from "@/lib/prisma";
import { gradeDesign, parseDataFiles, simulate } from "@/lib/grading";
import { generateMutants, pickMutants, type Mutant } from "@/lib/mutants";
import { problemHref } from "@/lib/problem-href";

export const DEBUG_PREFIX = "debug-";
export const DEBUG_CATEGORY = "Debug";

/** Bugs worth hunting first; a changed constant is often too easy to spot or too subtle. */
const KIND_ORDER = ["compare", "logic", "bitwise", "arith", "condition", "clock", "ternary", "negation", "constant"];
const MAX_TRIES = 6;

type Parent = NonNullable<Awaited<ReturnType<typeof prisma.question.findUnique>>>;

export function canHaveDebugVersion(q: { problemType: string; referenceSolution: string | null; slug: string; unlockAfter: string | null }) {
  return q.problemType === "design" && !!q.referenceSolution && !q.slug.startsWith(DEBUG_PREFIX) && !q.unlockAfter;
}

function difficultyOf(p: Parent): string {
  if (p.learningLevel === "Arena") return p.difficulty;
  if (/Beginner/i.test(p.learningLevel)) return "Easy";
  if (/Intermediate/i.test(p.learningLevel)) return "Medium";
  return "Hard";
}

/** Changes in the order to try: preferred kinds first, then by line. */
function candidates(reference: string): Mutant[] {
  const rank = (m: Mutant) => { const i = KIND_ORDER.indexOf(m.kind); return i < 0 ? KIND_ORDER.length : i; };
  return pickMutants(generateMutants(reference), 24).sort((a, b) => rank(a) - rank(b) || a.line - b.line);
}

/** A testbench the design can run against: the public one, the Arena skeleton, or the first hidden test. */
function runnableTestbench(p: Parent): string {
  if (p.publicTestbench.trim()) return p.publicTestbench;
  if (p.testbenchSkeleton?.trim()) return p.testbenchSkeleton;
  try { return JSON.parse(p.hiddenTestcases)[0]?.testbench ?? p.hiddenTestbench ?? ""; } catch { return p.hiddenTestbench ?? ""; }
}

/** A fair bug compiles and runs to the end of a testbench, and the hidden tests catch it. */
async function isFairBug(parent: Parent, mutant: Mutant): Promise<boolean> {
  const run = await simulate(mutant.code, runnableTestbench(parent), parseDataFiles(parent.dataFiles));
  if (run.status !== "success") return false;
  return !(await gradeDesign(asArena(parent), mutant.code)).accepted;
}

/** The copy is an Arena problem, which grades by comparing output: check it the way it will be graded. */
const asArena = (p: Parent) => ({ ...p, learningLevel: "Arena" });

export type DebugResult =
  | { ok: true; slug: string; created: boolean; line: number }
  | { ok: false; error: string };

/** Create (or refresh) the find-the-bug version of a problem. */
export async function createDebugProblem(parentSlug: string): Promise<DebugResult> {
  const parent = await prisma.question.findUnique({ where: { slug: parentSlug } });
  if (!parent) return { ok: false, error: "No such problem." };
  if (!canHaveDebugVersion(parent)) return { ok: false, error: "Only design problems with a stored reference solution can have a find-the-bug version." };

  if (!(await gradeDesign(asArena(parent), parent.referenceSolution!)).accepted) {
    return { ok: false, error: "The reference solution doesn't pass these tests when graded as an Arena problem." };
  }
  let bug: Mutant | null = null;
  for (const m of candidates(parent.referenceSolution!).slice(0, MAX_TRIES)) {
    if (await isFairBug(parent, m)) { bug = m; break; }
  }
  if (!bug) return { ok: false, error: "No single-line change both runs and fails the hidden tests." };

  const slug = `${DEBUG_PREFIX}${parent.slug}`;
  const statement =
    `**Fix the bug.** This design was written for [${parent.title}](${problemHref(parent)}), which you have solved. ` +
    `It compiles, but one line is wrong, so it fails the tests. Find that line and fix it.\n\n` +
    `Run the testbench and compare the waveform with what the design should do. Submit grades it against ` +
    `the same hidden tests as the original.\n\n---\n\n## The original problem\n\n${parent.statement}`;
  const data = {
    title: `Fix the bug: ${parent.title}`,
    difficulty: difficultyOf(parent),
    category: DEBUG_CATEGORY,
    tags: JSON.stringify(["debugging", ...JSON.parse(parent.tags || "[]")].slice(0, 6)),
    learningLevel: "Arena",
    orderIndex: parent.orderIndex,
    moduleId: "arena_debug",
    statement,
    constraints: "[]", examples: "[]", hints: "[]",
    starterCode: bug.code,
    testbenchSkeleton: parent.testbenchSkeleton,
    publicTestbench: parent.publicTestbench,
    hiddenTestcases: parent.hiddenTestcases,
    hiddenTestbench: parent.hiddenTestbench,
    dataFiles: parent.dataFiles,
    referenceSolution: parent.referenceSolution,
    problemType: "design",
    publicTestcases: parent.publicTestcases,
    expectedOutputMode: parent.expectedOutputMode,
    waveformRequired: parent.waveformRequired,
    xpReward: Math.max(20, Math.round(parent.xpReward / 2)),
    unlockAfter: parent.slug,
  };
  const existing = await prisma.question.findUnique({ where: { slug }, select: { id: true } });
  if (existing) await prisma.question.update({ where: { slug }, data });
  else await prisma.question.create({ data: { slug, ...data } });
  return { ok: true, slug, created: !existing, line: bug.line };
}
