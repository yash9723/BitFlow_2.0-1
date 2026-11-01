/**
 * lib/class-marks.ts — the classroom's pure helpers, safe for pages and checks (no database):
 * roll numbers, problem statuses, "marks out of N" and the progress CSV.
 * lib/classes.ts re-exports all of it. Self-check: scripts/class-marks.check.ts.
 */

export type ProblemStatus = "on_time" | "late" | "missing" | "pending";

export const STATUS_LABEL: Record<ProblemStatus, string> = {
  on_time: "on time", late: "late", missing: "missing", pending: "not yet",
};

export interface ClassProgress {
  assignments: { id: string; title: string; dueAt: string; problems: { slug: string; title: string; difficulty: string; href: string }[] }[];
  students:    { id: string; username: string; rollNumber: string | null }[];
  /** status[studentId][assignmentId][slug] */
  status:      Record<string, Record<string, Record<string, ProblemStatus>>>;
}

/** A roll number is optional; when given it is 1-30 letters, digits, spaces, ".", "/", "_" or "-". */
export const ROLL_MAX = 30;
export function normalizeRoll(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").toUpperCase() : "";
}
export function rollNumberProblem(roll: string): string | null {
  if (!roll) return null;
  if (roll.length > ROLL_MAX) return `A roll number can be at most ${ROLL_MAX} characters.`;
  return /^[A-Z0-9][A-Z0-9 ./_-]*$/.test(roll) ? null : "A roll number can have letters, digits, spaces, \".\", \"/\", \"_\" and \"-\".";
}

/** The teacher's "marks out of N": empty for none, else a whole number from 1 to 1000. */
export function maxMarksProblem(value: unknown): string | null {
  if (value === null) return null;
  return Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 1000
    ? null : "Marks must be a whole number from 1 to 1000, or empty for no marks column.";
}

/** Students with a roll number first, in roll order (numbers compared as numbers), then the rest as they joined. */
export function byRollNumber<T extends { rollNumber: string | null }>(students: T[]): T[] {
  return students
    .map((s, i) => ({ s, i }))
    .sort((x, y) => {
      const a = x.s.rollNumber, b = y.s.rollNumber;
      if (a && b) return a.localeCompare(b, "en", { numeric: true }) || x.i - y.i;
      if (a || b) return a ? -1 : 1;
      return x.i - y.i;
    })
    .map(({ s }) => s);
}

/** A late solve earns this share of a problem's marks; on time earns all of it. */
export const LATE_CREDIT = 0.5;

/** Marks out of `max` for one student's statuses, to one decimal place. */
export function marksFor(statuses: ProblemStatus[], max: number): number {
  if (!statuses.length) return 0;
  const earned = statuses.reduce((sum, st) => sum + (st === "on_time" ? 1 : st === "late" ? LATE_CREDIT : 0), 0);
  return Math.round((earned / statuses.length) * max * 10) / 10;
}

/** One spreadsheet cell; neutralises formula injection from usernames/titles. */
export function csvCell(value: string | number): string {
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * The teacher's progress grid as CSV: one row per student (in roll-number order), one
 * column per assigned problem. With `maxMarks`, a last column gives marks out of it:
 * every problem counts the same, a late solve earns LATE_CREDIT of its share.
 */
export function progressCsv(p: ClassProgress, maxMarks?: number | null): string {
  const cols = p.assignments.flatMap((a) => a.problems.map((q) => ({ a, q })));
  const rows = [["Roll number", "Student", ...cols.map(({ a, q }) => `${a.title} / ${q.title}`), "On time", "Late", "Missing",
    ...(maxMarks ? [`Marks (out of ${maxMarks})`] : [])]];
  for (const s of p.students) {
    const statuses = cols.map(({ a, q }) => p.status[s.id]?.[a.id]?.[q.slug] ?? "pending");
    const count = (st: ProblemStatus) => statuses.filter((x) => x === st).length;
    rows.push([s.rollNumber ?? "", s.username, ...statuses.map((st) => STATUS_LABEL[st]),
      String(count("on_time")), String(count("late")), String(count("missing")),
      ...(maxMarks ? [String(marksFor(statuses, maxMarks))] : [])]);
  }
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
