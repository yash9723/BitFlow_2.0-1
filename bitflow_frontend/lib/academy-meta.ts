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
  { slug: "gates", title: "Logic Gates", summary: "AND, OR, NOT, NAND, NOR, XOR — the atomic building blocks of digital logic.", icon: "⊕", difficulty: "foundations", order: 5, estimatedMinutes: 30 },
  { slug: "boolean-algebra", title: "Boolean Algebra", summary: "Master the algebra of 0s and 1s — the foundation of every digital circuit.", icon: "∧", difficulty: "foundations", order: 6, estimatedMinutes: 25 },
  { slug: "combinational", title: "Combinational Circuits", summary: "Multiplexers, decoders, adders, and comparators — outputs that depend only on present inputs.", icon: "Σ", difficulty: "core", order: 11, estimatedMinutes: 35 },
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
