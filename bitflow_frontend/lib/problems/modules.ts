/**
 * lib/problems/modules.ts — the curriculum's module definitions, shared by the
 * static learning path (lib/problems/index.ts) and the Learn page, which groups
 * the problems it fetches from /api/problems. Kept apart from index.ts so the
 * page does not bundle every problem.
 */
import type { PathModule, Problem } from "@/lib/problem-types";

/**
 * Group problems by their moduleId into PathModule objects.
 * Each module gets its problems sorted by orderIndex.
 */
export function groupIntoModules(
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

export const BEGINNER_MODULE_DEFS: Omit<PathModule, "problems">[] = [
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

export const INTERMEDIATE_MODULE_DEFS: Omit<PathModule, "problems">[] = [
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
  {
    id:            "mod_sv",
    title:         "SystemVerilog Essentials",
    description:   "logic, always_comb / always_ff, enum state machines, packed structs and unique case.",
    icon:          "⧉",
    prerequisites: [],
    xpToUnlock:    200,
  },
];
export const ADVANCED_MODULE_DEFS: Omit<PathModule, "problems">[] = [
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
