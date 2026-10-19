/**
 * lib/problem-types.ts — BitFlow Problem Arena type system
 *
 * This file owns every type related to:
 *   - Problem definitions (schema)
 *   - Learning path structure
 *   - Submission results
 *   - Progress tracking
 *
 * Design goals:
 *   - All fields are explicit — no `any`
 *   - Database-migration-ready: IDs are strings, not auto-increment
 *   - Extensible: adding a field never breaks existing data
 *   - The same types are used on frontend and (future) backend
 *
 * TODO: Export these as a shared package when backend is introduced.
 * TODO: Add contest/arena-specific types (ranking, time limits) in Phase 2.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Enumerations — represented as union types for zero runtime overhead
// ─────────────────────────────────────────────────────────────────────────────

/** How hard the problem is. Drives badge colour and unlock requirements. */
export type Difficulty =
  | "beginner"      // No prior Verilog knowledge needed
  | "intermediate"  // Requires understanding of sequential logic
  | "advanced"      // RTL design, timing, pipelining
  | "arena";        // Competitive / timed — unlocks after Advanced completion

/** Which curriculum tier this problem belongs to. */
export type LearningLevel =
  | "Verilog Beginner"
  | "Verilog Intermediate"
  | "Verilog Advanced"
  | "Arena";

/**
 * How the judge evaluates a submission.
 *
 * stdout_compare — compare $display output line-by-line against expected output.
 *   Most reliable for combinational logic.
 *
 * signal_compare — parse waveform signals and check specific values at
 *   specific timestamps.  Used for sequential designs.
 *
 * waveform_compare — full waveform diffing (future).
 */
export type ExpectedOutputMode =
  | "stdout_compare"
  | "signal_compare"
  | "waveform_compare";

/** Problem category — used for filtering and grouping. */
export type ProblemCategory =
  | "combinational"    // AND gates, muxes, adders — no clock
  | "sequential"       // flip-flops, counters, shift registers
  | "state_machine"    // FSMs — Moore and Mealy
  | "memory"           // RAM, ROM, FIFOs
  | "arithmetic"       // ALUs, multipliers, dividers
  | "interface"        // UART, SPI, I2C protocols (future)
  | "pipeline"         // Pipelined datapaths (advanced)
  | "verification";    // Testbench writing and assertion-based verification

// ─────────────────────────────────────────────────────────────────────────────
// Testcase types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A single testcase — either public (shown to user) or hidden (judge only).
 *
 * The testbench field contains complete Verilog tb.v source.
 * For stdout_compare mode, expected is the exact stdout to match.
 * For signal_compare mode, expected is a JSON string describing signal checks.
 */
export interface Testcase {
  id:          string;
  description: string;
  /** Complete testbench Verilog source for this testcase */
  testbench:   string;
  /** Expected output (interpretation depends on expectedOutputMode) */
  expected:    string;
  /** Score weight for partial grading (0–100, defaults to equal weight) */
  weight?:     number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Problem schema
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A hint shown progressively — user unlocks tiers one at a time.
 * tier 1 = general direction, tier 2 = specific guidance, tier 3 = near-solution.
 */
export interface Hint {
  tier:    1 | 2 | 3;
  content: string;
  /** XP cost to unlock this hint (0 = free) */
  xpCost?: number;
}

/**
 * An example — shown in the problem statement.
 * Analogous to LeetCode examples.
 */
export interface ProblemExample {
  input:       string;
  output:      string;
  explanation?: string;
}

/**
 * The complete problem definition.
 *
 * Designed to be stored as static TypeScript objects for now.
 * When a database is added, this maps directly to a table row.
 */
export interface Problem {
  // ── Identity ───────────────────────────────────────────────────────────────
  id:          string;           // Stable UUID or short ID e.g. "prob_001"
  slug:        string;           // URL-safe: "half-adder", "4-bit-counter"
  title:       string;           // "Half Adder"
  difficulty:  Difficulty;
  category:    ProblemCategory;
  tags:        string[];         // ["combinational", "gates", "basic"]
  learningLevel: LearningLevel;

  // ── Curriculum position ────────────────────────────────────────────────────
  /**
   * Controls ordering within a module.
   * Lower = earlier in the learning path.
   */
  orderIndex:  number;
  /** ID of the module this problem belongs to */
  moduleId:    string;

  // ── Content ────────────────────────────────────────────────────────────────
  statement:   string;           // Markdown — full problem description
  constraints: string[];         // ["Use only structural Verilog", "No always blocks"]
  examples:    ProblemExample[];
  hints:       Hint[];
  solutionExplanation?: string;  // Markdown — shown after solve or give-up

  // ── Code ───────────────────────────────────────────────────────────────────
  /**
   * Starter code for design.v — injected into editor on first visit.
   * Should contain the module skeleton with TODO comments.
   */
  starterCode: string;
  /**
   * Public testbench — shown to user, they can inspect it.
   * Used for "Run Code" (local simulation).
   */
  publicTestbench: string;
  /**
   * Hidden testcases — NOT shown to user.
   * Used for "Submit" to evaluate correctness.
   */
  hiddenTestcases?: Testcase[];
  /**
   * Single hidden testbench string — simpler alternative to hiddenTestcases[].
   * When present and hiddenTestcases is empty, submit() runs this directly.
   * Must print "ALL TESTS PASSED" on success, "FAIL: ..." lines on failure.
   */
  hiddenTestbench?: string;
  /** Extra input files the simulator puts next to design.v (e.g. a $readmemh hex file). */
  dataFiles?: Record<string, string> | null;
  /**
   * Public testcases — shown to user as examples.
   */
  publicTestcases?:  Testcase[];

  // ── Evaluation ────────────────────────────────────────────────────────────
  expectedOutputMode: ExpectedOutputMode;
  /**
   * True if this problem's evaluation requires waveform analysis.
   * When true, the waveform panel is always shown in problem mode.
   */
  waveformRequired: boolean;

  // ── Rewards ───────────────────────────────────────────────────────────────
  /** XP awarded on first successful solve */
  xpReward:    number;
  /** Optional: bonus XP for solving without hints */
  xpBonusNoHints?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Learning path structure
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A module is a group of related problems within a level.
 * e.g. "Logic Gates", "Combinational Circuits", "Flip-Flops"
 */
export interface PathModule {
  id:          string;
  title:       string;
  description: string;
  icon:        string;           // single emoji or icon name
  problems:    Problem[];
  /**
   * IDs of modules that must be completed before this one unlocks.
   * Empty array = always unlocked.
   */
  prerequisites: string[];
  xpToUnlock:    number;         // XP threshold to unlock (0 = free)
}

/**
 * A level groups modules into a curriculum tier.
 * e.g. "Verilog Beginner" contains gates, combinational, basic sequential.
 */
export interface PathLevel {
  id:          string;
  title:       LearningLevel;
  description: string;
  difficulty:  Difficulty;
  /** Hex accent colour for this level's UI elements */
  accentColor: string;
  modules:     PathModule[];
  /** XP threshold to unlock this entire level */
  xpToUnlock:  number;
}

/** The complete learning path — all levels. */
export interface LearningPath {
  levels: PathLevel[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Submission + verdict types
// ─────────────────────────────────────────────────────────────────────────────

/** Verdict for a single testcase */
export interface TestcaseVerdict {
  testcaseId:  string;
  description: string;
  passed:      boolean;
  /** Raw stdout from simulation */
  actualOutput:   string;
  /** Expected output for comparison */
  expectedOutput: string;
  /** Execution time in milliseconds */
  durationMs:     number;
  /** Error message if compile/runtime failed */
  error?:         string;
}

/** Overall submission result */
export interface SubmissionResult {
  id:             string;
  problemId:      string;
  timestamp:      number;
  /** Verdicts for each hidden testcase */
  verdicts:       TestcaseVerdict[];
  /** Number of testcases passed */
  passed:         number;
  /** Total testcases evaluated */
  total:          number;
  /** Whether ALL testcases passed */
  accepted:       boolean;
  /** Total wall-clock time across all testcases */
  totalDurationMs: number;
  /** The design.v code that was submitted */
  submittedCode:  string;
  /** XP earned from this submission (0 if not first solve) */
  xpEarned:       number;
  /** Compile or runtime error message, if any */
  errorMessage?:  string;
  /** Your design's own signals on the first failing hidden test (wrong answers only). */
  failingWaveform?: import("@/lib/grading").FailingWaveform | null;
  /** Shortest input sequence where the design and the reference solution differ. */
  counterexample?: import("@/lib/grading").Counterexample | null;
  /** Optimization scores of an accepted design. */
  metrics?: { gates: number; depth: number; ffBits: number } | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Progress tracking types
// ─────────────────────────────────────────────────────────────────────────────

/** Per-problem progress record */
export interface ProblemProgress {
  problemId:      string;
  solved:         boolean;
  /** Timestamp of first successful solve (null if unsolved) */
  firstSolvedAt:  number | null;
  attempts:       number;
  /** Best submission result ID */
  bestSubmissionId?: string;
  /** Hints unlocked (tier numbers) */
  hintsUnlocked:  number[];
  /** XP earned (0 if unsolved, prevents duplicate XP) */
  xpEarned:       number;
}

/** User's overall progress — persisted to localStorage */
export interface ProgressRecord {
  /** Total XP across all solved problems */
  totalXp:        number;
  /** Map of problemId → ProblemProgress */
  problems:       Record<string, ProblemProgress>;
  /** IDs of modules the user has unlocked */
  unlockedModules: string[];
  /** Timestamp of last update */
  lastUpdatedAt:  number;
}

/** Completion stats for a module (computed, not stored) */
export interface ModuleStats {
  moduleId:    string;
  total:       number;
  solved:      number;
  percentage:  number;
  unlocked:    boolean;
}