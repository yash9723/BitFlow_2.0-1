/**
 * lib/academy-types.ts — Digital Electronics Academy content schema
 *
 * Content lives in bitflow_frontend/content/: <slug>/chapter.ts, or index.json for the
 * chapters not yet rewritten. Renderers in components/academy/ consume these types.
 */
import type { AnimId } from "./academy/anim";
import type { Circuit } from "./studio/circuit";
import type { Cell } from "./studio/logic-min";
import type { WaveDiagram } from "./studio/wave";

export type AcademyDifficulty = "foundations" | "core" | "advanced";

export type InteractiveWidgetId =
  | "boolean-algebra-builder"
  | "number-system-converter"
  | "logic-gate-playground"
  | "flip-flop-toggle"
  | "fsm-explorer"
  | "memory-visualizer";

/** One piece of a chapter. Text may use **bold** and `code`. Claims are tested by scripts/academy.check.ts. */
export type AcademyBlock =
  | { kind: "text"; text: string }
  | { kind: "list"; items: string[]; ordered?: boolean }
  | { kind: "table"; headers: string[]; rows: string[][]; caption?: string }
  | { kind: "formula"; text: string; note?: string }
  | { kind: "callout"; tone: "tip" | "warning" | "note"; text: string }
  /** A live circuit. `checks`: what it must do, tested but not shown. `slow`: start in slow motion, to show delay. */
  | { kind: "circuit"; circuit: Circuit; caption: string; tryThis?: string[]; slow?: boolean; checks: { set: Record<string, number>; expect: Record<string, number> }[] }
  /** A K-map with its grouping steps. `expect`: the minimal form the chapter claims, tested but not shown. */
  | { kind: "kmap"; names: string[]; cells: Cell[]; output: string; form?: "sop" | "pos"; caption: string; expect: string; editable?: boolean }
  | { kind: "timing"; diagram: WaveDiagram; caption: string }
  | { kind: "example"; title: string; problem: string; steps: string[]; answer: string }
  /** An original practice question; `gate` marks the GATE exam's style, not a past paper. */
  | { kind: "practice"; question: string; options: string[]; correctIndex: number; explanation: string; gate?: boolean }
  | { kind: "link"; href: string; label: string; text: string }
  | { kind: "widget"; id: InteractiveWidgetId }
  /** An interactive animation (components/academy/anim/). */
  | { kind: "anim"; id: AnimId }
  | { kind: "code"; text: string; caption?: string }
  /** An algebra derivation, played line by line. Every line is tested equal to the first. */
  | { kind: "simplify"; title: string; steps: { expr: string; law: string }[] }
  /** The full Quine-McCluskey working for a function. */
  | { kind: "qm"; names: string[]; cells: Cell[] };

export interface AcademySection {
  id: string;
  heading: string;
  /** "gate": goes beyond a first course; beginners can skip it. */
  level?: "gate";
  /** Chapters not yet rewritten use body, bullets and callout; the rest use blocks. */
  blocks?: AcademyBlock[];
  body?: string;
  /** Optional bullet points rendered below body */
  bullets?: string[];
  /** Optional callout box (tip, warning, note) */
  callout?: {
    type: "tip" | "warning" | "note";
    text: string;
  };
}

export interface AcademyQuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export interface AcademyFlashcard {
  id: string;
  front: string;
  back: string;
}

export interface AcademyVideo {
  id: string;
  title: string;
  url: string;
  duration?: string;
  channel?: string;
}

export interface AcademyTopic {
  slug: string;
  title: string;
  summary: string;
  icon: string;
  difficulty: AcademyDifficulty;
  order: number;
  estimatedMinutes: number;
  prerequisites?: string[];
  sections: AcademySection[];
  quiz: AcademyQuizQuestion[];
  flashcards: AcademyFlashcard[];
  videos: AcademyVideo[];
  /** Primary interactive widget for this topic */
  interactive?: InteractiveWidgetId;
  /** Secondary widgets shown in "More to explore" */
  extraInteractives?: InteractiveWidgetId[];
}

export interface AcademyTopicMeta {
  slug: string;
  title: string;
  summary: string;
  icon: string;
  difficulty: AcademyDifficulty;
  order: number;
  estimatedMinutes: number;
}

export interface AcademyProgress {
  completedTopics: string[];
  quizScores: Record<string, number>;
  lastVisited?: string;
}
