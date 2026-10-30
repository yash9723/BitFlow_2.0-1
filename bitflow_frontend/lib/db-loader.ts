/**
 * lib/problems/db-loader.ts
 *
 * Drop-in replacement for the hardcoded problem arrays.
 * All functions mirror the API of lib/problems/index.ts
 * but read from the database instead.
 *
 * Server-side only (uses prisma directly).
 */

import { cache } from "react";
import { prisma } from "@/lib/prisma";

// ─────────────────────────────────────────────────────────────────────────────
// Types (mirrors problem-types.ts)
// ─────────────────────────────────────────────────────────────────────────────

export interface DbProblem {
  id:                 string;
  slug:               string;
  title:              string;
  difficulty:         string;
  category:           string;
  tags:               string[];
  learningLevel:      string;
  orderIndex:         number;
  moduleId:           string;
  statement:          string;
  constraints:        string[];
  examples:           unknown[];
  hints:              unknown[];
  starterCode:        string;
  testbenchSkeleton:  string | null;
  publicTestbench:    string;
  publicTestcases:    unknown[];
  expectedOutputMode: string;
  waveformRequired:   boolean;
  xpReward:           number;
  xpBonusNoHints:     number | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function safeParseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try { return JSON.parse(value) as T; }
  catch { return fallback; }
}

// Rows from here end up in pages sent to the browser (e.g. the Arena hub), so the
// hidden tests and the reference solution are dropped: grading reads them
// directly in app/api/problems/[slug]/submit.
function parseQuestion(q: Record<string, unknown>): DbProblem {
  const { hiddenTestbench: _hb, hiddenTestcases: _ht, referenceSolution: _ref, mutants: _mut, editorial: _ed, ...pub } = q;
  return {
    ...(pub as unknown as DbProblem),
    tags:            safeParseJson(q.tags as string,            []),
    constraints:     safeParseJson(q.constraints as string,     []),
    examples:        safeParseJson(q.examples as string,        []),
    hints:           safeParseJson(q.hints as string,           []),
    publicTestcases: safeParseJson(q.publicTestcases as string, []),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get a single problem by slug.
 * Returns null if not found.
 */
export async function getProblemBySlugFromDb(slug: string): Promise<DbProblem | null> {
  const q = await prisma.question.findUnique({ where: { slug } });
  if (!q || q.archived) return null;
  return parseQuestion(q as unknown as Record<string, unknown>);
}

/**
 * Get all problems for a specific learning level.
 * level: "Beginner" | "Intermediate" | "Advanced" | "Arena"
 */
export async function getProblemsByLevel(level: string): Promise<DbProblem[]> {
  const questions = await prisma.question.findMany({
    where:   { learningLevel: level, archived: false },
    orderBy: { orderIndex: "asc" },
  });
  return questions.map(q => parseQuestion(q as unknown as Record<string, unknown>));
}

/**
 * Get all problems for a specific module.
 */
export async function getProblemsByModule(moduleId: string): Promise<DbProblem[]> {
  const questions = await prisma.question.findMany({
    where:   { moduleId, archived: false },
    orderBy: { orderIndex: "asc" },
  });
  return questions.map(q => parseQuestion(q as unknown as Record<string, unknown>));
}

/**
 * Get all problems grouped by moduleId.
 * Returns a Map: moduleId → DbProblem[]
 */
export async function getProblemsByModuleGrouped(
  level: string
): Promise<Map<string, DbProblem[]>> {
  const problems = await getProblemsByLevel(level);
  const map = new Map<string, DbProblem[]>();

  for (const p of problems) {
    const existing = map.get(p.moduleId) ?? [];
    existing.push(p);
    map.set(p.moduleId, existing);
  }

  return map;
}

/**
 * Get all Arena problems (learningLevel = "Arena")
 */
/**
 * The Arena hub's list: only the columns it shows. Full rows carry hidden testbenches,
 * reference solutions and mutants, which made the hub slow to load.
 */
export function getArenaHubRows() {
  return prisma.question.findMany({
    where:   { learningLevel: "Arena", archived: false },
    orderBy: { orderIndex: "asc" },
    select:  { slug: true, title: true, difficulty: true, category: true, xpReward: true, statement: true, unlockAfter: true },
  });
}

/**
 * Get a single Arena problem by slug.
 */
export const getArenaProblemBySlugFromDb = cache(async (slug: string): Promise<DbProblem | null> => {
  // cache(): generateMetadata and the page both ask for it; one query per request
  const q = await prisma.question.findUnique({
    where: { slug },
  });
  if (!q || q.archived || q.learningLevel !== "Arena") return null;
  return parseQuestion(q as unknown as Record<string, unknown>);
});

/**
 * Get total problem count by level.
 */
export async function getProblemCounts() {
  const [beginner, intermediate, advanced, arena] = await Promise.all([
    prisma.question.count({ where: { learningLevel: "Beginner" } }),
    prisma.question.count({ where: { learningLevel: "Intermediate" } }),
    prisma.question.count({ where: { learningLevel: "Advanced" } }),
    prisma.question.count({ where: { learningLevel: "Arena" } }),
  ]);

  return { beginner, intermediate, advanced, arena, total: beginner + intermediate + advanced + arena };
}