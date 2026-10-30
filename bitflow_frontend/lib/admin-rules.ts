/**
 * lib/admin-rules.ts — the checks behind the admin editing tools, kept free of the database so
 * scripts/admin.check.ts can run them.
 */
const MAX_SOURCE_CHARS = 512 * 1024;

/** Fields that decide what passes: changing one means re-checking the reference solution. */
const GRADING_FIELDS = ["starterCode", "publicTestbench", "hiddenTestbench", "hiddenTestcases"] as const;

export interface ProblemEdit {
  data: Record<string, string | number | boolean | null>;
  /** The reference must still pass and the starter must still fail before this is saved. */
  gradingChanged: boolean;
}

/** What an admin's PATCH would change, or why it can't be accepted. Unknown fields are ignored. */
export function problemEdit(body: unknown): ProblemEdit | { error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const data: ProblemEdit["data"] = {};

  for (const k of ["title", "statement", "difficulty", "category"] as const) {
    if (b[k] === undefined) continue;
    if (typeof b[k] !== "string" || !(b[k] as string).trim()) return { error: `${k} can't be empty.` };
    if ((b[k] as string).length > (k === "statement" ? MAX_SOURCE_CHARS : 200)) return { error: `${k} is too long.` };
    data[k] = b[k] as string;
  }
  if (b.tags !== undefined) {
    if (!Array.isArray(b.tags) || !b.tags.every((t) => typeof t === "string")) return { error: "tags must be a list of strings." };
    data.tags = JSON.stringify(b.tags.map((t) => t.trim()).filter(Boolean));
  }
  if (b.xpReward !== undefined) {
    if (!Number.isInteger(b.xpReward) || (b.xpReward as number) < 0 || (b.xpReward as number) > 5000) return { error: "XP must be a whole number from 0 to 5000." };
    data.xpReward = b.xpReward as number;
  }
  if (b.archived !== undefined) {
    if (typeof b.archived !== "boolean") return { error: "archived must be true or false." };
    data.archived = b.archived;
  }

  for (const k of ["starterCode", "publicTestbench"] as const) {
    if (b[k] === undefined) continue;
    if (typeof b[k] !== "string" || (k === "starterCode" && !(b[k] as string).trim())) return { error: `${k} can't be empty.` };
    if ((b[k] as string).length > MAX_SOURCE_CHARS) return { error: `${k} exceeds 512 KB.` };
    data[k] = b[k] as string;
  }
  if (b.hiddenTestbench !== undefined) {
    if (b.hiddenTestbench !== null && typeof b.hiddenTestbench !== "string") return { error: "hiddenTestbench must be text." };
    if (typeof b.hiddenTestbench === "string" && b.hiddenTestbench.length > MAX_SOURCE_CHARS) return { error: "hiddenTestbench exceeds 512 KB." };
    data.hiddenTestbench = (b.hiddenTestbench as string | null) || null;
  }
  if (b.hiddenTestcases !== undefined) {
    let cases: unknown = b.hiddenTestcases;
    if (typeof cases === "string") {
      try { cases = JSON.parse(cases); } catch { return { error: "Hidden test cases aren't valid JSON." }; }
    }
    if (!Array.isArray(cases) || !cases.every((c) => c && typeof c === "object" && typeof (c as { testbench?: unknown }).testbench === "string")) {
      return { error: "Hidden test cases must be a JSON list of objects with a testbench." };
    }
    const json = JSON.stringify(cases);
    if (json.length > MAX_SOURCE_CHARS) return { error: "Hidden test cases exceed 512 KB." };
    data.hiddenTestcases = json;
  }

  if (Object.keys(data).length === 0) return { error: "Nothing to change." };
  return { data, gradingChanged: GRADING_FIELDS.some((k) => k in data) };
}

export type UserAction = "promote" | "demote" | "ban" | "unban" | "delete";

/** Why an admin can't do this to this account, or null. The site must always keep an admin. */
export function userActionProblem(
  action: string,
  actorId: string,
  target: { id: string; role: string; minor: boolean },
  adminCount: number,
): string | null {
  if (!["promote", "demote", "ban", "unban", "delete"].includes(action)) return "Unknown action.";
  if (target.id === actorId) return "You can't change your own account here.";
  if (action === "promote" && target.minor) return "Admin accounts need an adult.";
  if (action === "promote" && target.role === "ADMIN") return "Already an admin.";
  if (action === "demote" && target.role !== "ADMIN") return "Not an admin.";
  if (target.role === "ADMIN" && ["demote", "ban", "delete"].includes(action) && adminCount <= 1) return "That is the last admin.";
  return null;
}
