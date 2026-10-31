/**
 * lib/arena/index.ts — HDL Arena registry
 *
 * Completely independent of lib/problems/index.ts.
 * No learning path, no modules, no XP unlock gates.
 * Problems are looked up by slug only.
 */

import type { ArenaProblem, ArenaCategory, ArenaDifficulty } from "./types";
import { FSM_PROBLEMS } from "./fsm";
import { VERIFICATION_PROBLEMS } from "./verification";
import { FORMAL_PROBLEMS } from "./formal";
import { TIMING_PROBLEMS } from "./timing";
import { PRACTICE_ARENA } from "./practice";
import { COMBINATIONAL_PROBLEMS } from "./combinational";
import { SEQUENTIAL_PROBLEMS } from "./sequential";
import { PROTOCOL_PROBLEMS } from "./protocol";

// ─────────────────────────────────────────────────────────────────────────────
// Flat registry — all arena problems across all categories
// ─────────────────────────────────────────────────────────────────────────────

export const ALL_ARENA_PROBLEMS: ArenaProblem[] = [
  ...FSM_PROBLEMS,
  ...VERIFICATION_PROBLEMS,
  ...FORMAL_PROBLEMS,
  ...TIMING_PROBLEMS,
  ...PRACTICE_ARENA,
  ...COMBINATIONAL_PROBLEMS,
  ...SEQUENTIAL_PROBLEMS,
  ...PROTOCOL_PROBLEMS,
];

/** O(1) slug lookup */
const BY_SLUG = new Map<string, ArenaProblem>(
  ALL_ARENA_PROBLEMS.map((p) => [p.slug, p]),
);

/** O(1) id lookup */
const BY_ID = new Map<string, ArenaProblem>(
  ALL_ARENA_PROBLEMS.map((p) => [p.id, p]),
);

export function getArenaProblemBySlug(slug: string): ArenaProblem | undefined {
  return BY_SLUG.get(slug);
}

export function getArenaProblemById(id: string): ArenaProblem | undefined {
  return BY_ID.get(id);
}

// ─────────────────────────────────────────────────────────────────────────────
// Filtered views — used by the Arena hub page
// ─────────────────────────────────────────────────────────────────────────────

export function getArenaByCategory(category: ArenaCategory): ArenaProblem[] {
  return ALL_ARENA_PROBLEMS.filter((p) => p.category === category);
}

export function getArenaByDifficulty(difficulty: ArenaDifficulty): ArenaProblem[] {
  return ALL_ARENA_PROBLEMS.filter((p) => p.difficulty === difficulty);
}

/** All unique categories that have at least one problem */
export function getArenaCategories(): ArenaCategory[] {
  const seen = new Set<ArenaCategory>();
  ALL_ARENA_PROBLEMS.forEach((p) => seen.add(p.category));
  return Array.from(seen);
}

/** Stats for the hub page header */
export function getArenaStats() {
  return {
    total:  ALL_ARENA_PROBLEMS.length,
    easy:   ALL_ARENA_PROBLEMS.filter((p) => p.difficulty === "Easy").length,
    medium: ALL_ARENA_PROBLEMS.filter((p) => p.difficulty === "Medium").length,
    hard:   ALL_ARENA_PROBLEMS.filter((p) => p.difficulty === "Hard").length,
    expert: ALL_ARENA_PROBLEMS.filter((p) => p.difficulty === "Expert").length,
  };
}