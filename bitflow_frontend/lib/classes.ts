/**
 * lib/classes.ts — classroom helpers shared by the /api/classes routes.
 *
 * Roles are per class (ClassMember.role); site admins can open any class as
 * a teacher. Assignment status comes from UserProgress.firstSolvedAt (server-graded
 * solves) and, for assigned lessons ("lab:blink" keys, lib/lessons.ts), from
 * LessonProgress.completedAt (self-checked in the browser).
 */

import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { problemHref } from "@/lib/problem-href";
import { LESSON_LEVEL, lessonHref, lessonKey, lessonSlugs, lessonTitle, parseLessonKey } from "@/lib/lessons";

export type ClassRole     = "TEACHER" | "STUDENT";
export type ProblemStatus = "on_time" | "late" | "missing" | "pending";

export const STATUS_LABEL: Record<ProblemStatus, string> = {
  on_time: "on time", late: "late", missing: "missing", pending: "not yet",
};

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";   // no 0/O or 1/I

/** 7 characters from 32 symbols: ~34 billion codes, so guessing one isn't practical. */
export function newJoinCode(): string {
  return Array.from({ length: 7 }, () => CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)]).join("");
}

/** The user's role in a class, or null if they're not a member. */
export async function classRole(classId: string, user: { id: string; role: string }): Promise<ClassRole | null> {
  const member = await prisma.classMember.findUnique({
    where:  { classId_userId: { classId, userId: user.id } },
    select: { role: true },
  });
  if (member) return member.role as ClassRole;
  if (user.role === "ADMIN" && (await prisma.classroom.count({ where: { id: classId } }))) return "TEACHER";
  return null;
}

export function parseSlugs(json: string): string[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function statusOf(solvedAt: Date | null | undefined, dueAt: Date, now: Date): ProblemStatus {
  if (solvedAt) return solvedAt <= dueAt ? "on_time" : "late";
  return now > dueAt ? "missing" : "pending";
}

export interface ClassProgress {
  assignments: { id: string; title: string; dueAt: string; problems: { slug: string; title: string; difficulty: string; href: string }[] }[];
  students:    { id: string; username: string }[];
  /** status[studentId][assignmentId][slug] */
  status:      Record<string, Record<string, Record<string, ProblemStatus>>>;
}

/** Assignments (with problem details) and each student's status on each problem. */
export async function classProgress(classId: string, onlyUserId?: string): Promise<ClassProgress> {
  const assignments = await prisma.assignment.findMany({ where: { classId }, orderBy: { dueAt: "asc" } });
  const slugs = [...new Set(assignments.flatMap((a) => parseSlugs(a.problemSlugs)))];
  const questions = await prisma.question.findMany({
    where:  { slug: { in: slugs } },
    select: { id: true, slug: true, title: true, difficulty: true, category: true, learningLevel: true },
  });
  const bySlug = new Map(questions.map((q) => [q.slug, q]));

  const members = await prisma.classMember.findMany({
    where:   { classId, ...(onlyUserId ? { userId: onlyUserId } : { role: "STUDENT" }) },
    orderBy: { joinedAt: "asc" },
    select:  { user: { select: { id: true, username: true } } },
  });
  const students = members.map((m) => m.user);

  const solved = await prisma.userProgress.findMany({
    where:  { userId: { in: students.map((s) => s.id) }, problemId: { in: questions.map((q) => q.id) }, solved: true },
    select: { userId: true, problemId: true, firstSolvedAt: true },
  });
  // A solve recorded without a date (pre-dates firstSolvedAt) counts as on time.
  const solvedAt = new Map(solved.map((p) => [`${p.userId}:${p.problemId}`, p.firstSolvedAt ?? new Date(0)]));
  const finished = slugs.some((s) => parseLessonKey(s))
    ? await prisma.lessonProgress.findMany({
        where:  { userId: { in: students.map((s) => s.id) }, done: true },
        select: { userId: true, kind: true, slug: true, completedAt: true },
      })
    : [];
  const finishedAt = new Map(finished.map((l) => [`${l.userId}:${l.kind}:${l.slug}`, l.completedAt ?? new Date(0)]));
  const doneAt = (studentId: string, slug: string) =>
    (bySlug.has(slug) ? solvedAt.get(`${studentId}:${bySlug.get(slug)!.id}`) : finishedAt.get(`${studentId}:${slug}`));

  const now = new Date();
  const problemsOf = (json: string) => parseSlugs(json).filter((s) => bySlug.has(s) || parseLessonKey(s));
  return {
    assignments: assignments.map((a) => ({
      id: a.id, title: a.title, dueAt: a.dueAt.toISOString(),
      problems: problemsOf(a.problemSlugs).map((slug) => {
        const q = bySlug.get(slug);
        if (q) return { slug, title: q.title, difficulty: q.difficulty, href: problemHref(q) };
        const lesson = parseLessonKey(slug)!;
        return { slug, title: lesson.title, difficulty: LESSON_LEVEL[lesson.kind], href: lessonHref(lesson.kind, lesson.slug) };
      }),
    })),
    students,
    status: Object.fromEntries(students.map((s) => [s.id, Object.fromEntries(assignments.map((a) => [
      a.id,
      Object.fromEntries(problemsOf(a.problemSlugs).map((slug) => [
        slug, statusOf(doneAt(s.id, slug), a.dueAt, now),
      ])),
    ]))])),
  };
}

/** Lab lessons and Academy chapters, for the assignment picker. */
export const lessonCatalog = () => (["lab", "academy"] as const).flatMap((kind) => lessonSlugs(kind).map((slug) => ({
  slug: lessonKey(kind, slug), title: lessonTitle(kind, slug)!, learningLevel: LESSON_LEVEL[kind], difficulty: "Lesson",
})));

/** One spreadsheet cell; neutralises formula injection from usernames/titles. */
function csvCell(value: string | number): string {
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** The teacher's progress grid as CSV: one row per student, one column per assigned problem. */
export function progressCsv(p: ClassProgress): string {
  const cols = p.assignments.flatMap((a) => a.problems.map((q) => ({ a, q })));
  const rows = [["Student", ...cols.map(({ a, q }) => `${a.title} / ${q.title}`), "On time", "Late", "Missing"]];
  for (const s of p.students) {
    const statuses = cols.map(({ a, q }) => p.status[s.id]?.[a.id]?.[q.slug] ?? "pending");
    const count = (st: ProblemStatus) => statuses.filter((x) => x === st).length;
    rows.push([s.username, ...statuses.map((st) => STATUS_LABEL[st]), String(count("on_time")), String(count("late")), String(count("missing"))]);
  }
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
