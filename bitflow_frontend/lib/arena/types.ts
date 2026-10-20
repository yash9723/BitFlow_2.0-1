/**
 * lib/arena/types.ts — HDL Arena type system
 *
 * Completely independent of lib/problem-types.ts and the Learning Path.
 * Arena problems are competitive, not curriculum-ordered.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Difficulty — arena-specific labels
// ─────────────────────────────────────────────────────────────────────────────

export type ArenaDifficulty = "Easy" | "Medium" | "Hard" | "Expert";

// ─────────────────────────────────────────────────────────────────────────────
// A single hidden testcase for the judge
// ─────────────────────────────────────────────────────────────────────────────

export interface ArenaTestcase {
  id:          string;
  description: string;
  /** Complete Verilog testbench source */
  testbench:   string;
  /**
   * Expected stdout — judge checks `ALL TESTS PASSED` sentinel.
   * Kept for parity with Learning Path judge logic.
   */
  expected:    string;
  weight:      number;   // 0–100, used for partial scoring in future
}

// ─────────────────────────────────────────────────────────────────────────────
// Arena problem schema
// ─────────────────────────────────────────────────────────────────────────────

export interface ArenaProblem {
  // Identity
  id:         string;
  slug:       string;
  title:      string;
  category:   ArenaCategory;
  difficulty: ArenaDifficulty;
  tags:       string[];

  // Content
  statement:   string;          // Markdown
  examples:    ArenaExample[];
  constraints: string[];

  // Code
  starterCode:      string;
  testbenchSkeleton:  string;
  hiddenTestcases:  ArenaTestcase[];

  /** "testbench": starterCode is a correct DUT and the student writes tb.v that catches its bugs.
   *  "formal": the same, but the student writes a property harness that a solver checks. */
  problemType?: "design" | "testbench" | "formal";
  /** Formal problems: clock cycles the solver searches when checking and grading (default 20). */
  formalDepth?: number;

  // Rewards
  xpReward:     number;
  /** Estimated solve time in minutes — shown in the problem card */
  estimatedMin: number;
}

export interface ArenaExample {
  input:        string;
  output:       string;
  explanation?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Category — used for filtering on the Arena hub page
// ─────────────────────────────────────────────────────────────────────────────

export type ArenaCategory =
  | "FSM"
  | "Combinational"
  | "Sequential"
  | "Arithmetic"
  | "Memory"
  | "Protocol"
  | "Pipeline"
  | "Verification"
  | "Formal";

// ─────────────────────────────────────────────────────────────────────────────
// Submission result — parallel shape to Learning Path SubmissionResult
// ─────────────────────────────────────────────────────────────────────────────

export interface ArenaVerdictItem {
  testcaseId:     string;
  description:    string;
  passed:         boolean;
  actualOutput:   string;
  expectedOutput: string;
  durationMs:     number;
  error?:         string;
}

export interface ArenaSubmissionResult {
  id:              string;
  problemId:       string;
  timestamp:       number;
  verdicts:        ArenaVerdictItem[];
  passed:          number;
  total:           number;
  accepted:        boolean;
  totalDurationMs: number;
  submittedCode:   string;
  xpEarned:        number;
  errorMessage?:   string;
  /** Your design's own signals on the first failing hidden test (wrong answers only). */
  failingWaveform?: import("@/lib/grading").FailingWaveform | null;
  /** Shortest input sequence where the design and the reference solution differ. */
  counterexample?: import("@/lib/grading").Counterexample | null;
  /** Optimization scores of an accepted design. */
  metrics?: { gates: number; depth: number; ffBits: number } | null;
}