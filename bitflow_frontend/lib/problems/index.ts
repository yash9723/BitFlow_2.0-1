/**
 * lib/problems/index.ts — Problem registry and learning path
 *
 * Central access point for all problem data.
 *
 * PUBLIC API:
 *   getProblemBySlug(slug)   — load a single problem for the problem page
 *   getProblemById(id)       — load by ID (for submission lookup)
 *   getLearningPath()        — full path structure for the overview page
 *   getModuleStats(...)      — compute completion % for a module
 *
 * Adding a new difficulty tier:
 *   1. Create lib/problems/advanced.ts with ADVANCED_PROBLEMS array
 *   2. Add import here
 *   3. Add a new PathLevel to LEARNING_PATH
 *   That's it — no other files need to change.
 */

import type {
  Problem,
  LearningPath,
  PathLevel,
  PathModule,
  ModuleStats,
  ProgressRecord,
} from "@/lib/problem-types";
import { BEGINNER_PROBLEMS }      from "@/lib/problems/beginner";
import { INTERMEDIATE_PROBLEMS }  from "@/lib/problems/intermediate";
import { ADVANCED_PROBLEMS } from "@/lib/problems/advanced";
import { RISCV_PROBLEMS }    from "@/lib/problems/riscv";
import { groupIntoModules, BEGINNER_MODULE_DEFS, INTERMEDIATE_MODULE_DEFS, ADVANCED_MODULE_DEFS } from "@/lib/problems/modules";
import { SV_PROBLEMS }       from "@/lib/problems/systemverilog";
import { PRACTICE_BEGINNER, PRACTICE_INTERMEDIATE, PRACTICE_ADVANCED } from "@/lib/problems/practice-pack";

// ─────────────────────────────────────────────────────────────────────────────
// All problems flat list — used for O(1) slug/id lookups
// ─────────────────────────────────────────────────────────────────────────────

const ALL_PROBLEMS: Problem[] = [
  ...BEGINNER_PROBLEMS,
  ...INTERMEDIATE_PROBLEMS,
  ...ADVANCED_PROBLEMS,
  ...RISCV_PROBLEMS,
  ...SV_PROBLEMS,
  ...PRACTICE_BEGINNER,
  ...PRACTICE_INTERMEDIATE,
  ...PRACTICE_ADVANCED,
  // TODO: ...ARENA_PROBLEMS,
];

/** Lookup map: slug → Problem */
const BY_SLUG = new Map<string, Problem>(
  ALL_PROBLEMS.map((p) => [p.slug, p]),
);

/** Lookup map: id → Problem */
const BY_ID = new Map<string, Problem>(
  ALL_PROBLEMS.map((p) => [p.id, p]),
);

export function getProblemBySlug(slug: string): Problem | undefined {
  return BY_SLUG.get(slug);
}

export function getProblemById(id: string): Problem | undefined {
  return BY_ID.get(id);
}

export function getAllProblems(): Problem[] {
  return ALL_PROBLEMS;
}

// ─────────────────────────────────────────────────────────────────────────────
// Learning path definition
// ─────────────────────────────────────────────────────────────────────────────

export const LEARNING_PATH: LearningPath = {
  levels: [
    {
      id:          "lvl_beginner",
      title:       "Verilog Beginner",
      description: "Learn Verilog from scratch. Master gates, assign statements, and your first flip-flop.",
      difficulty:  "beginner",
      accentColor: "#00e87a",   // phosphor green
      xpToUnlock:  0,
      modules:     groupIntoModules([...BEGINNER_PROBLEMS, ...PRACTICE_BEGINNER], BEGINNER_MODULE_DEFS),
    },
    {
      id:          "lvl_intermediate",
      title:       "Verilog Intermediate",
      description: "Build real circuits: adders, counters, state machines, and parameterized modules.",
      difficulty:  "intermediate",
      accentColor: "#4db8ff",   // info blue
      xpToUnlock:  200,         // need 200 XP from Beginner to unlock
      modules:     groupIntoModules([...INTERMEDIATE_PROBLEMS, ...SV_PROBLEMS, ...PRACTICE_INTERMEDIATE], INTERMEDIATE_MODULE_DEFS),
    },
    {
      id:          "lvl_advanced",
      title:       "Verilog Advanced",
      description: "RTL design, pipelining, timing analysis, and synthesis-ready code.",
      difficulty:  "advanced",
      accentColor: "#ffb84d",   // amber
      xpToUnlock:  500,
      modules:     groupIntoModules([...ADVANCED_PROBLEMS, ...RISCV_PROBLEMS, ...PRACTICE_ADVANCED], ADVANCED_MODULE_DEFS),
    },
    {
      id:          "lvl_arena",
      title:       "Arena",
      description: "Timed challenges and competitive problems. Unlock after completing Advanced.",
      difficulty:  "arena",
      accentColor: "#ff4f4f",   // danger red
      xpToUnlock:  1000,
      modules:     [],          // TODO: contest problems
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Computed stats helpers — used by progress UI
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute completion stats for a single module, given the user's progress.
 * Returns percentage 0–100, solved count, and whether the module is unlocked.
 */
export function getModuleStats(
  module_:  PathModule,
  progress: ProgressRecord,
): ModuleStats {
  const total  = module_.problems.length;
  const solved = module_.problems.filter(
    (p) => progress.problems[p.id]?.solved,
  ).length;

  const unlocked =
    module_.xpToUnlock === 0 ||
    progress.totalXp >= module_.xpToUnlock ||
    module_.prerequisites.every((id) =>
      progress.unlockedModules.includes(id),
    );

  return {
    moduleId:   module_.id,
    total,
    solved,
    percentage: total > 0 ? Math.round((solved / total) * 100) : 0,
    unlocked,
  };
}

/**
 * Check if a PathLevel is unlocked for the user.
 */
export function isLevelUnlocked(
  level:    PathLevel,
  progress: ProgressRecord,
): boolean {
  return progress.totalXp >= level.xpToUnlock;
}