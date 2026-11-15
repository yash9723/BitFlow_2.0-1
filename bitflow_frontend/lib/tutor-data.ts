/**
 * lib/tutor-data.ts — what the tutor agent's tools may read (app/api/ai/tools/[tool]/route.ts).
 * Pure functions, so scripts/tutor-agent.check.ts can prove nothing withheld ever gets out. The rule is an allow-list:
 * a field is sent only if it is named here. Hidden tests, the reference solution, mutants, the editorial, the worked
 * solution and any hint the student has not unlocked are never in the output, whatever the question row contains.
 */
import { lastResultLines, problemLines, type TutorLastSubmission } from "@/lib/ai-prompts";

export interface QuestionRow {
  title: string; difficulty: string; category: string; statement: string; constraints: string; examples: string;
  hints: string; publicTestcases?: string; unlockAfter?: string | null; archived?: boolean;
  // Present on the row, never read below:
  hiddenTestbench?: unknown; hiddenTestcases?: unknown; referenceSolution?: unknown; mutants?: unknown; editorial?: unknown; solutionExplanation?: unknown; starterCode?: unknown;
}

const parse = <T>(json: string | null | undefined, fallback: T): T => { try { const v = JSON.parse(json || ""); return v ?? fallback; } catch { return fallback; } };

/** get_problem: the statement, constraints and worked examples, as text. */
export function problemView(q: QuestionRow): string {
  const lines = problemLines({ title: q.title, statement: q.statement, constraints: q.constraints });
  lines.splice(1, 0, `Difficulty: ${q.difficulty}`, `Topic: ${q.category}`);
  const examples = parse<{ input?: string; output?: string; explanation?: string }[]>(q.examples, []);
  if (examples.length) {
    lines.push("", "Examples:");
    for (const e of examples) lines.push(`- Input: ${e.input ?? ""} -> Output: ${e.output ?? ""}${e.explanation ? ` (${e.explanation})` : ""}`);
  }
  return lines.join("\n");
}

/** get_last_result: the student's latest graded submission, in the same words the tutor prompt already uses. */
export const lastResultView = (last: TutorLastSubmission | null): string => lastResultLines(last).join("\n");

/** get_hint: the text of one tier, only if the student has already unlocked it (their own record decides, never the caller). */
export function hintView(q: QuestionRow, unlocked: number[], tier: number): { ok: true; text: string } | { ok: false; reason: string } {
  if (![1, 2, 3].includes(tier)) return { ok: false, reason: "Tier must be 1, 2 or 3." };
  const hints = parse<{ tier: number; content: string }[]>(q.hints, []);
  const hint = hints.find((h) => h.tier === tier);
  if (!hint) return { ok: false, reason: `This problem has no tier ${tier} hint.` };
  if (!unlocked.includes(tier)) return { ok: false, reason: `The student has not unlocked tier ${tier}. Do not reveal it: give your own smaller hint instead.` };
  return { ok: true, text: hint.content };
}

/** Which tiers exist and which are unlocked, without any text. */
export function hintStatus(q: QuestionRow, unlocked: number[]): string {
  const tiers = parse<{ tier: number }[]>(q.hints, []).map((h) => h.tier).sort();
  return tiers.length ? tiers.map((t) => `tier ${t}: ${unlocked.includes(t) ? "unlocked" : "locked"}`).join(", ") : "no hints for this problem";
}

/** A tutor may only look at a problem that is live and not a "find the bug" follow-up (its code is one edit from another problem's answer). */
export const tutorMayRead = (q: Pick<QuestionRow, "archived" | "unlockAfter"> | null): boolean => !!q && !q.archived && !q.unlockAfter;
