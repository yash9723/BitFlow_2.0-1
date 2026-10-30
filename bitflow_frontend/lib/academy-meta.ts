/**
 * lib/academy-meta.ts — the Academy's chapter list, and nothing else: what the hub, dashboard and
 * search need. Chapters are long and carry circuits, so pages that only list them import this,
 * not lib/academy-content.ts. scripts/academy.check.ts keeps it equal to the chapters themselves.
 */
import type { AcademyTopicMeta } from "./academy-types";

export const ACADEMY_TOPIC_META: AcademyTopicMeta[] = [
  { slug: "what-is-digital", title: "What Is Digital?", summary: "Why computers use only two levels, what a bit is, and how switches turn into logic. Start here if this is all new.", icon: "01", difficulty: "foundations", order: 1, estimatedMinutes: 20 },
  { slug: "number-systems", title: "Number Systems", summary: "Binary, octal and hexadecimal: reading them, converting between them, and how many bits a number needs.", icon: "0b", difficulty: "foundations", order: 2, estimatedMinutes: 30 },
  { slug: "binary-arithmetic", title: "Binary Arithmetic and Signed Numbers", summary: "Adding, subtracting and multiplying in binary, two's complement, and how to spot overflow.", icon: "±", difficulty: "foundations", order: 3, estimatedMinutes: 35 },
  { slug: "codes", title: "Codes: BCD, Gray, ASCII, Parity and Hamming", summary: "The same bits can mean different things. Codes that suit displays, sensors, text and error checking.", icon: "⌗", difficulty: "core", order: 4, estimatedMinutes: 35 },
  { slug: "gates", title: "Logic Gates", summary: "AND, OR, NOT, NAND, NOR, XOR: the building blocks of digital logic, what's inside them, and why they take time.", icon: "⊕", difficulty: "foundations", order: 5, estimatedMinutes: 35 },
  { slug: "boolean-algebra", title: "Boolean Algebra", summary: "The algebra of 0s and 1s: laws, De Morgan's theorem, and turning any truth table into an expression you can simplify.", icon: "∧", difficulty: "foundations", order: 6, estimatedMinutes: 35 },
  { slug: "karnaugh-maps", title: "Karnaugh Maps", summary: "Simplify logic by eye: draw the truth table so neighbours differ by one variable, then circle the groups.", icon: "⊞", difficulty: "core", order: 7, estimatedMinutes: 40 },
  { slug: "quine-mccluskey", title: "The Quine-McCluskey Method", summary: "K-maps stop working at about five variables. This is the same idea as a step-by-step procedure a computer can follow.", icon: "QM", difficulty: "advanced", order: 8, estimatedMinutes: 30 },
  { slug: "logic-families", title: "Logic Families", summary: "TTL, CMOS and ECL: what real gates do to voltages, how many others they can drive, how fast they go and how much power they burn.", icon: "⏚", difficulty: "core", order: 9, estimatedMinutes: 35 },
  { slug: "adders-comparators", title: "Adders, Subtractors and Comparators", summary: "Build arithmetic out of gates: half and full adders, a 4-bit adder whose carry you can watch ripple, subtraction, and magnitude comparison.", icon: "+", difficulty: "core", order: 10, estimatedMinutes: 35 },
  { slug: "combinational", title: "Multiplexers, Decoders and Encoders", summary: "The blocks that route and translate data: MUX and DEMUX, decoders, encoders, priority encoders and code converters.", icon: "Σ", difficulty: "core", order: 11, estimatedMinutes: 40 },
  { slug: "arithmetic-circuits", title: "Fast Arithmetic: Lookahead, BCD and Multipliers", summary: "Beat the ripple with carry lookahead, add in decimal, multiply in hardware, and see how Booth's algorithm handles signed numbers.", icon: "×", difficulty: "advanced", order: 12, estimatedMinutes: 45 },
  { slug: "sequential", title: "Sequential Circuits", summary: "Flip-flops, latches, and registers — circuits that remember state across clock cycles.", icon: "↻", difficulty: "core", order: 13, estimatedMinutes: 40 },
  { slug: "fsms", title: "Finite State Machines", summary: "Moore and Mealy machines — the control brains of digital systems.", icon: "◎", difficulty: "advanced", order: 16, estimatedMinutes: 45 },
  { slug: "timing", title: "Timing Concepts", summary: "Setup, hold, clock skew, and metastability — making circuits work at speed.", icon: "⏱", difficulty: "advanced", order: 17, estimatedMinutes: 35 },
  { slug: "memory", title: "Memory", summary: "SRAM, DRAM, ROM, and register files — storing bits at scale.", icon: "▦", difficulty: "advanced", order: 18, estimatedMinutes: 40 },
];

export const DIFFICULTY_LABELS: Record<string, string> = {
  foundations: "Beginner",
  core:        "Core",
  advanced:    "GATE",
};

export const DIFFICULTY_STYLES: Record<string, string> = {
  foundations: "border-phosphor/30 bg-phosphor/10 text-phosphor",
  core:        "border-info/30 bg-info/10 text-info",
  advanced:    "border-warn/30 bg-warn/10 text-warn",
};
