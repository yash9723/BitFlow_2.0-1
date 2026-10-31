/**
 * scripts/interview.check.ts — self-check for lib/interview.ts (npx tsx scripts/interview.check.ts).
 */
import assert from "node:assert/strict";
import { fitsMock, isInterviewProblem, mockClosesAt, mockResults, pickMockProblems, tierOf, TOP_25, TOPICS, type InterviewProblem } from "../lib/interview";
import { LEARNING_PATH } from "../lib/problems/index";
import { ALL_ARENA_PROBLEMS } from "../lib/arena/index";

const toProblem = (p: any, learningLevel: string): InterviewProblem => ({
  slug: p.slug, title: p.title, difficulty: p.difficulty ?? "Easy", category: p.category ?? "General", tags: p.tags ?? [],
  learningLevel, problemType: p.problemType ?? "design", unlockAfter: p.unlockAfter ?? null,
});
const real: InterviewProblem[] = [
  ...LEARNING_PATH.levels.flatMap((l) => l.modules.flatMap((m) => m.problems.map((p: any) => toProblem(p, l.title)))),
  ...ALL_ARENA_PROBLEMS.map((p) => toProblem(p, "Arena")),
];
const bySlug = new Map(real.filter(isInterviewProblem).map((p) => [p.slug, p]));

// The real problem bank backs every list.
for (const s of TOP_25) assert.ok(bySlug.has(s), `Top 25 names ${s}, which isn't an interview problem`);
assert.equal(new Set(TOP_25).size, 25);
for (const t of TOPICS) assert.ok(real.filter(isInterviewProblem).filter(t.match).length >= 5, `topic ${t.id} is thin`);
for (const tier of ["Easy", "Medium", "Hard"]) assert.ok(real.filter(fitsMock).filter((p) => tierOf(p.difficulty) === tier).length >= 5, `few ${tier} problems for mocks`);

// Levels from both difficulty scales.
assert.equal(tierOf("beginner"), "Easy");
assert.equal(tierOf("Advanced"), "Hard");
assert.equal(tierOf("Expert"), null);

// What a mock may and may not use.
const base = toProblem({ slug: "x", title: "X", tags: ["interview"], difficulty: "Easy" }, "Verilog Beginner");
assert.equal(fitsMock(base), true);
assert.equal(fitsMock({ ...base, tags: [] }), false);                         // not tagged, not Arena
assert.equal(fitsMock({ ...base, tags: ["interview", "capstone"] }), false);
assert.equal(fitsMock({ ...base, problemType: "testbench" }), false);
assert.equal(fitsMock({ ...base, unlockAfter: "y" }), false);
assert.equal(fitsMock({ ...base, learningLevel: "Arena", category: "Pipeline" }), false);  // Fmax targets
assert.equal(fitsMock({ ...base, difficulty: "Expert" }), false);

// One per tier, unsolved first, falling back to solved ones when a tier is used up.
const p = (slug: string, difficulty: string) => ({ ...base, slug, difficulty });
const pool = [p("e1", "Easy"), p("e2", "beginner"), p("m1", "Medium"), p("h1", "Hard"), p("h2", "advanced")];
const pickFirst = () => 0;
assert.deepEqual(pickMockProblems(pool, new Set(), pickFirst), ["e1", "m1", "h1"]);
assert.deepEqual(pickMockProblems(pool, new Set(["e1", "h1"]), pickFirst), ["e2", "m1", "h2"]);
assert.deepEqual(pickMockProblems(pool, new Set(["m1"]), pickFirst), ["e1", "m1", "h1"]);
assert.deepEqual(pickMockProblems(pool, new Set(), () => 0.99), ["e2", "m1", "h2"]);
assert.equal(pickMockProblems(real, new Set()).length, 3);

// The window: nothing before the start or after the close counts.
const start = new Date("2026-10-31T10:00:00Z");
const at = (min: number) => new Date(start.getTime() + min * 60_000);
const end = at(45);
assert.deepEqual(mockClosesAt({ endsAt: end, finishedAt: null }), end);
assert.deepEqual(mockClosesAt({ endsAt: end, finishedAt: at(20) }), at(20));
assert.deepEqual(mockClosesAt({ endsAt: end, finishedAt: at(50) }), end);

const sub = (slug: string, min: number, accepted: boolean, gateCount: number | null = null) => ({ slug, accepted, createdAt: at(min), gateCount });
const results = mockResults(["a", "b", "c", "d"], start, end, [
  sub("a", -5, true, 1),                         // solved before the mock: doesn't count
  sub("a", 5, false), sub("a", 12, true, 42), sub("a", 20, true, 7), sub("a", 21, false),  // later Submits ignored
  sub("b", 45, true, 9),                         // exactly at the limit: too late
  sub("b", 46, true, 9),
  sub("c", 30, false),
  sub("zzz", 3, true),                           // not in this mock
]);
assert.deepEqual(results, [
  { slug: "a", solved: true,  attempts: 2, minutes: 12,  gateCount: 42 },
  { slug: "b", solved: false, attempts: 0, minutes: null, gateCount: null },
  { slug: "c", solved: false, attempts: 1, minutes: null, gateCount: null },
  { slug: "d", solved: false, attempts: 0, minutes: null, gateCount: null },
]);
// Ending early closes the window for later Submits.
assert.equal(mockResults(["a"], start, at(10), [sub("a", 12, true)])[0].solved, false);

console.log("interview: OK");
