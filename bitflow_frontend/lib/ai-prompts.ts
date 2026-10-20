/**
 * lib/ai-prompts.ts — HDL-specialised prompts for BitFlow AI Assistant
 *
 * Design principles:
 *   - Never hallucinate Verilog syntax (prefer "I'm not sure" over guessing)
 *   - Encourage understanding over copy-paste
 *   - Distinguish Sandbox (free exploration) from Problem mode (constrained)
 *   - Keep responses concise — engineers scan, not read
 *
 * TODO (Oogway AI phase):
 *   - Replace SANDBOX_SYSTEM_PROMPT with Oogway persona
 *   - Add synthesis-aware prompting (target: Yosys + FPGA flow)
 *   - Add problem-mode system prompt with hint tiers
 */

// ─────────────────────────────────────────────────────────────────────────────
// System prompt — Sandbox mode
// ─────────────────────────────────────────────────────────────────────────────

export const SANDBOX_SYSTEM_PROMPT = `\
You are an expert HDL engineering assistant embedded inside BitFlow Sandbox — \
a browser-based Verilog simulation environment powered by Icarus Verilog.

YOUR ROLE:
- Help users write, debug, and understand Verilog/SystemVerilog (synthesisable subset only)
- Analyze simulation output (stdout/stderr from iverilog + vvp)
- Explain waveform behaviour and signal timing
- Suggest targeted fixes — never rewrite whole files unless explicitly asked
- Flag simulation-synthesis mismatches (blocking vs non-blocking, sensitivity lists, latches)

STRICT RULES:
1. Only output valid Verilog-2001 unless the user explicitly asks for SystemVerilog.
2. If you are unsure about syntax, say so — never hallucinate language constructs.
3. When suggesting code changes, ALWAYS return the COMPLETE modified file — not
   a partial snippet, not just the changed lines. Wrap it with the markers below:
     // --- DESIGN.V SUGGESTION ---
     <complete design.v file content>
     // --- END SUGGESTION ---
   or
     // --- TB.V SUGGESTION ---
     <complete tb.v file content>
     // --- END SUGGESTION ---
   The tool will automatically diff the complete file against the user's current
   code and apply ONLY the changed lines — like Cursor / Claude Code. The user
   never has to manually merge. You just return the full corrected file.
   IMPORTANT: Only return a suggestion block when code actually needs to change.
   For explanations and questions, reply in plain text with no suggestion blocks.
4. Never automatically overwrite the user's code. They must click "Apply" explicitly.
5. Prefer asking one clarifying question over making large assumptions.
6. Explain WHY a fix works, not just WHAT to change.

COMMON HDL TOPICS YOU HANDLE:
- Blocking (=) vs non-blocking (<=) assignments and race conditions
- Sensitivity list completeness (@(*) vs explicit lists)
- Latch inference and how to avoid it
- Metastability and CDC (Clock Domain Crossing) awareness
- Parameterized modules and generate blocks
- Testbench patterns: initial blocks, forever loops, $monitor vs $display
- VCD waveform interpretation
- Synthesis-simulation mismatch: time delays (#), tasks, system functions

CONTEXT:
Mode: Sandbox (free exploration — no grading, no constraints)
Tool: Icarus Verilog (simulation only, not synthesis)
The user sees: dual Monaco editors (design.v / tb.v), terminal output, waveform panel

TODO: In future "Problem mode", add per-problem constraints and hint tiers.
TODO: Add Oogway AI persona and VLSI-specific fine-tuned model support.
`;

// ─────────────────────────────────────────────────────────────────────────────
// Message builders — turn IDE context into AI-ready messages
// ─────────────────────────────────────────────────────────────────────────────

export interface IDEContext {
  designCode:    string;
  testbenchCode: string;
  stdout?:       string;
  stderr?:       string;
  status?:       string;
  /** Set on graded problem pages: switches the assistant to tutor mode. */
  problemSlug?:  string;
}

/**
 * Build a context preamble that the AI sees before the user's question.
 * Injected as the first user message in each conversation.
 * Kept separate so it can be updated without changing the system prompt.
 */
export function buildContextMessage(ctx: IDEContext): string {
  const lines: string[] = ["[Current IDE State]"];

  lines.push("", "--- design.v ---");
  lines.push(ctx.designCode.trim() || "(empty)");

  lines.push("", "--- tb.v ---");
  lines.push(ctx.testbenchCode.trim() || "(empty)");

  if (ctx.status) {
    lines.push("", `--- Last simulation status: ${ctx.status} ---`);
  }

  if (ctx.stdout?.trim()) {
    const out = ctx.stdout.trim().split("\n").slice(-40).join("\n"); // last 40 lines
    lines.push("", "--- stdout (last 40 lines) ---");
    lines.push(out);
  }

  if (ctx.stderr?.trim()) {
    const err = ctx.stderr.trim().split("\n").slice(-20).join("\n"); // last 20 lines
    lines.push("", "--- stderr (last 20 lines) ---");
    lines.push(err);
  }

  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Canned quick-actions — one-click prompts in the AI panel
// ─────────────────────────────────────────────────────────────────────────────

export interface QuickAction {
  label:  string;
  prompt: string;
  icon:   string;
}

export const QUICK_ACTIONS: QuickAction[] = [
  {
    label:  "Explain errors",
    icon:   "✗",
    prompt: "Explain the compilation or runtime errors in the stderr output above. Be concise.",
  },
  {
    label:  "Fix testbench",
    icon:   "⟳",
    prompt: "Review my testbench (tb.v) for correctness. Check: clock generation, reset sequence, stimulus timing, and $finish. Suggest improvements.",
  },
  {
    label:  "Find race conditions",
    icon:   "⚡",
    prompt: "Analyze my design.v for potential race conditions, incorrect blocking/non-blocking assignment usage, or incomplete sensitivity lists.",
  },
  {
    label:  "Explain waveform",
    icon:   "∿",
    prompt: "Based on the simulation output, explain what the waveform should look like and whether the signals behave as expected.",
  },
  {
    label:  "Synthesis risks",
    icon:   "▲",
    prompt: "Identify any simulation-synthesis mismatches or constructs in my design.v that would not synthesize correctly in real hardware.",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Tutor mode — on graded problem pages
// ─────────────────────────────────────────────────────────────────────────────

export const TUTOR_SYSTEM_PROMPT = `\
You are a patient Verilog tutor inside BitFlow, a platform where students solve \
graded hardware-design problems. The student is working on the problem described \
in the first message, and their submission is graded against hidden tests.

YOUR GOAL: help the student find and fix the problem themselves.

RULES:
1. Never write the solution or a corrected version of their module, not even \
partially rewritten. Do not output DESIGN.V or TB.V suggestion blocks.
2. Give one hint at a time, the smallest one that unblocks them. Prefer a guiding \
question ("What value does count hold on the cycle after reset is released?").
3. Point at specific lines or signals in THEIR code when something is wrong, and \
explain the concept behind it (blocking vs non-blocking, reset timing, latches, \
off-by-one in counters, missing default in case, etc.).
4. Use the failing test's description and their output to reason about what is \
going wrong. You do not know the hidden test's expected output; never guess or \
invent it.
5. Tiny generic syntax examples (a few lines, unrelated to this problem's logic) \
are fine when the student is stuck on syntax.
6. If the student asks for the full answer, decline kindly and give a stronger hint.
6b. When a [Where the design differs] trace is given, use it: walk the student through what their design does on that input sequence, step by step, and ask about the step where their output first differs from the expected one. The expected values in that trace are already shown to the student, so you may refer to them.
7. Keep replies short: a few sentences, plus at most one small code fragment.
`;

export interface TutorProblem {
  title:       string;
  statement:   string;
  constraints: string;   // JSON stringified string[]
}

export interface TutorLastSubmission {
  accepted:        boolean;
  numTestsPassed:  number;
  numTestsTotal:   number;
  testcaseResults: string;          // JSON: [{id, description, passed, actual, ...}]
  simStdout:       string | null;
  counterexample?: string | null;   // text table from counterexampleTable()
}

const lastLines = (s: string, n: number) => s.trim().split("\n").slice(-n).join("\n");

/**
 * Problem + latest graded result, built on the server from the DB. Hidden
 * testbench source and expected outputs are deliberately left out.
 */
export function buildTutorContext(problem: TutorProblem, last: TutorLastSubmission | null): string {
  const lines = ["[Problem]", `Title: ${problem.title}`, "", problem.statement.trim()];
  try {
    const constraints: string[] = JSON.parse(problem.constraints || "[]");
    if (constraints.length) lines.push("", "Constraints:", ...constraints.map((c) => `- ${c}`));
  } catch { /* ignore malformed constraints */ }

  lines.push("", "[Latest graded submission]");
  if (!last) {
    lines.push("Not submitted yet.");
  } else if (last.accepted) {
    lines.push("Accepted (all hidden tests passed).");
  } else {
    lines.push(`Wrong answer: ${last.numTestsPassed}/${last.numTestsTotal} hidden tests passed.`);
    let failed: { description?: string; actual?: string | null } | undefined;
    try {
      failed = (JSON.parse(last.testcaseResults || "[]") as any[]).find((t) => !t.passed);
    } catch { /* ignore */ }
    const output = failed ? failed.actual : last.simStdout;
    if (failed?.description) lines.push(`First failing test: ${failed.description}`);
    if (output?.trim()) lines.push("Student's output on that test (last 30 lines):", lastLines(output, 30));
    if (last.counterexample?.trim()) {
      lines.push(
        "", "[Where the design differs]",
        "Shortest input sequence from reset after which the student's outputs differ from a correct design.",
        "'(yours)' is the student's design, '(expected)' a correct one; the last row is the first difference.",
        last.counterexample.trim(),
      );
    }
  }
  return lines.join("\n");
}

export interface DesignScores {
  metrics?: { gates: number; depth: number; ffBits: number } | null;
  timing?:  { fmaxMhz: number | null; targetMhz: number } | null;
  rank?:    { rank: number; solvers: number } | null;
}

/**
 * After an accepted submit: ask the tutor to review the learner's own design
 * for size and speed, using the scores the grader measured (never the reference).
 */
export function designReviewPrompt(s: DesignScores): string {
  const facts: string[] = [];
  if (s.metrics) facts.push(`${s.metrics.gates} two-input gates, logic depth ${s.metrics.depth}, ${s.metrics.ffBits} flip-flop bits`);
  if (s.timing?.fmaxMhz != null) facts.push(`${s.timing.fmaxMhz} MHz on an iCE40-HX8K (target ${s.timing.targetMhz} MHz)`);
  if (s.rank) facts.push(`#${s.rank.rank} of ${s.rank.solvers} on the leaderboard`);
  return [
    "My design was accepted.",
    facts.length ? `The grader measured: ${facts.join("; ")}.` : "",
    "Review it like a senior hardware engineer: give me 2 or 3 concrete ways to make it smaller",
    s.timing ? "or faster (shorter paths between registers)," : "or shallower (less logic between registers),",
    "or clearer, each pointing at the line it applies to and saying why it helps. Don't rewrite the design;",
    "if it's already close to minimal, say so and explain what makes it efficient.",
  ].filter(Boolean).join(" ");
}

export const TUTOR_QUICK_ACTIONS: QuickAction[] = [
  { label: "Why did it fail?",   icon: "?", prompt: "My last submission failed. Help me understand why, without giving me the answer." },
  { label: "Give me a hint",     icon: "→", prompt: "Give me a small hint for the next step on this problem." },
  { label: "Explain errors",     icon: "✗", prompt: "Explain the compile or runtime errors in my last run." },
  { label: "Review my approach", icon: "◇", prompt: "Is my overall approach in design.v on the right track? Point out what to rethink, without rewriting it." },
];