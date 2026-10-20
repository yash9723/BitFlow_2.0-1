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

// ─────────────────────────────────────────────────────────────────────────────
// All problems flat list — used for O(1) slug/id lookups
// ─────────────────────────────────────────────────────────────────────────────

const ALL_PROBLEMS: Problem[] = [
  ...BEGINNER_PROBLEMS,
  ...INTERMEDIATE_PROBLEMS,
  ...ADVANCED_PROBLEMS,
  ...RISCV_PROBLEMS,
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

/**
 * Group problems by their moduleId into PathModule objects.
 * Each module gets its problems sorted by orderIndex.
 */
function groupIntoModules(
  problems: Problem[],
  moduleDefinitions: Omit<PathModule, "problems">[],
): PathModule[] {
  return moduleDefinitions.map((def) => ({
    ...def,
    problems: problems
      .filter((p) => p.moduleId === def.id)
      .sort((a, b) => a.orderIndex - b.orderIndex),
  }));
}

const BEGINNER_MODULE_DEFS: Omit<PathModule, "problems">[] = [
  {
    id:            "mod_logic_gates",
    title:         "Logic Gates",
    description:   "AND, OR, NOT, XOR — the building blocks of digital design.",
    icon:          "⊕",
    prerequisites: [],
    xpToUnlock:    0,
  },
  {
    id:            "mod_combinational",
    title:         "Combinational Circuits",
    description:   "Circuits whose output depends only on current inputs.",
    icon:          "⊞",
    prerequisites: ["mod_logic_gates"],
    xpToUnlock:    50,
  },
  {
    id:            "mod_sequential_basics",
    title:         "Sequential Basics",
    description:   "Flip-flops and registers — circuits with memory.",
    icon:          "⊿",
    prerequisites: ["mod_combinational"],
    xpToUnlock:    100,
  },
];

const INTERMEDIATE_MODULE_DEFS: Omit<PathModule, "problems">[] = [
  {
    id:            "mod_latches",
    title:         "Latches",
    description:   "Level-sensitive storage: SR Latch and D Latch.",
    icon:          "⊡",
    prerequisites: [],
    xpToUnlock:    0,
  },
  {
    id:            "mod_flip_flops",
    title:         "Flip-Flops",
    description:   "Edge-triggered storage: SR, JK, D, and T flip-flops.",
    icon:          "⏚",
    prerequisites: ["mod_latches"],
    xpToUnlock:    100,
  },
  {
    id:            "mod_shift_registers",
    title:         "Shift Registers",
    description:   "SISO, SIPO, PISO, PIPO, bidirectional, and universal registers.",
    icon:          "⇄",
    prerequisites: ["mod_flip_flops"],
    xpToUnlock:    200,
  },
  {
    id:            "mod_sequential_design",
    title:         "Counters & Sequential Design",
    description:   "Synchronous counters, frequency dividers, and state machines.",
    icon:          "◑",
    prerequisites: ["mod_shift_registers"],
    xpToUnlock:    300,
  },
  {
    id:            "mod_flip_flops_ext",
    title:         "Flip-Flops Extended",
    description:   "Advanced flip-flop variants and configurations.",
    icon:          "⏛",
    prerequisites: ["mod_sequential_design"],
    xpToUnlock:    400,
  },
  {
    id:            "mod_sequential_utils",
    title:         "Sequential Utilities",
    description:   "Edge detectors, synchronizers, and pipeline utilities.",
    icon:          "⟳",
    prerequisites: ["mod_flip_flops_ext"],
    xpToUnlock:    500,
  },
  {
    id:            "mod_counters_advanced",
    title:         "Advanced Counters",
    description:   "Up/down, modulo, and Gray code counters.",
    icon:          "⊞",
    prerequisites: ["mod_sequential_utils"],
    xpToUnlock:    600,
  },
  {
    id:            "mod_memory",
    title:         "Memory Elements",
    description:   "RAM, ROM, FIFOs and memory-mapped designs.",
    icon:          "▦",
    prerequisites: ["mod_counters_advanced"],
    xpToUnlock:    700,
  },
];
const ADVANCED_MODULE_DEFS: Omit<PathModule, "problems">[] = [
  {
    id:            "mod_fsm_basics",
    title:         "Finite State Machines: The Control Fabric",
    description:   "Moore vs Mealy FSMs, sequence detection, state diagrams.",
    icon:          "⟳",
    prerequisites: ["mod_memory"],
    xpToUnlock:    800,
  },
  {
    id:            "mod_fsm_advanced",
    title:         "Complex FSM Systems: Protocol Controllers",
    description:   "SPI, I²C, arbiters, clock domain crossing, PWM.",
    icon:          "⚡",
    prerequisites: ["mod_fsm_basics"],
    xpToUnlock:    1000,
  },
  // M14 Capstones (reserved for Session 2)
  {
     id:            "mod_capstone",
     title:         "Capstone Problems: Interview Tier",
     prerequisites: ["mod_fsm_advanced"],
     xpToUnlock:    1200,
     description:   "Design a complete system from scratch, with multiple modules and FSMs.",
      icon:          "🏆",
  },
  {
    id:            "mod_riscv",
    title:         "Build a RISC-V CPU",
    description:   "Six steps from an ALU to a single-cycle RV32I processor that runs loops, memory and function calls.",
    icon:          "🧠",
    prerequisites: [],
    xpToUnlock:    500,
  },
];

export const LEARNING_PATH: LearningPath = {
  levels: [
    {
      id:          "lvl_beginner",
      title:       "Verilog Beginner",
      description: "Learn Verilog from scratch. Master gates, assign statements, and your first flip-flop.",
      difficulty:  "beginner",
      accentColor: "#00e87a",   // phosphor green
      xpToUnlock:  0,
      modules:     groupIntoModules(BEGINNER_PROBLEMS, BEGINNER_MODULE_DEFS),
    },
    {
      id:          "lvl_intermediate",
      title:       "Verilog Intermediate",
      description: "Build real circuits: adders, counters, state machines, and parameterized modules.",
      difficulty:  "intermediate",
      accentColor: "#4db8ff",   // info blue
      xpToUnlock:  200,         // need 200 XP from Beginner to unlock
      modules:     groupIntoModules(INTERMEDIATE_PROBLEMS, INTERMEDIATE_MODULE_DEFS),
    },
    {
      id:          "lvl_advanced",
      title:       "Verilog Advanced",
      description: "RTL design, pipelining, timing analysis, and synthesis-ready code.",
      difficulty:  "advanced",
      accentColor: "#ffb84d",   // amber
      xpToUnlock:  500,
      modules:     groupIntoModules([...ADVANCED_PROBLEMS, ...RISCV_PROBLEMS], ADVANCED_MODULE_DEFS),
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