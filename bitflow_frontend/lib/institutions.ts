/**
 * lib/institutions.ts — the database side of institutions (college departments):
 * seats in use, the department dashboard's numbers, and the plan banner for a class.
 * The pure rules are in lib/institution-plan.ts.
 */

import { prisma } from "@/lib/prisma";
import { classProgress, csvCell } from "@/lib/classes";
import { planStatus, type PlanStatus } from "@/lib/institution-plan";

const WEEK = 7 * 86_400_000;

/** Distinct students across an institution's classes (what seats count). */
export async function seatsUsed(institutionId: string): Promise<number> {
  const rows = await prisma.classMember.findMany({
    where:    { role: "STUDENT", classroom: { institutionId } },
    distinct: ["userId"],
    select:   { userId: true },
  });
  return rows.length;
}

/** The plan banner for a class's teachers, or null for a personal class or a plan in good standing. */
export async function classPlanNotice(classId: string): Promise<string | null> {
  const classroom = await prisma.classroom.findUnique({
    where:  { id: classId },
    select: { institution: { select: { id: true, plan: true, validUntil: true, seatLimit: true } } },
  });
  const inst = classroom?.institution;
  if (!inst) return null;
  return planStatus(inst, await seatsUsed(inst.id)).message;
}

export interface DepartmentClass {
  id: string;
  name: string;
  teacher: string;
  students: number;
  assignments: number;
  /** Share of assigned problems solved (on time or late), across students; null with nothing assigned. */
  solvedRate: number | null;
  onTimeRate: number | null;
  missing: number;
  /** Students who ran or submitted code in the last 7 days. */
  active7d: number;
}

export interface DepartmentSummary {
  institution: { id: string; name: string; slug: string; plan: string; seatLimit: number | null; validUntil: Date | null };
  status: PlanStatus;
  seatsUsed: number;
  teachers: { username: string; role: string }[];
  classes: DepartmentClass[];
  totals: { classes: number; students: number; assignments: number; active7d: number; solvedRate: number | null };
}

/**
 * The department dashboard. ponytail: one classProgress per class (a few queries each) —
 * fine for a department's tens of classes; aggregate in SQL if one reaches hundreds.
 */
export async function departmentSummary(slug: string): Promise<DepartmentSummary | null> {
  const inst = await prisma.institution.findUnique({
    where:  { slug },
    select: {
      id: true, name: true, slug: true, plan: true, seatLimit: true, validUntil: true,
      members:    { orderBy: { createdAt: "asc" }, select: { role: true, user: { select: { username: true } } } },
      classrooms: { orderBy: { createdAt: "asc" }, select: { id: true, name: true, owner: { select: { username: true } } } },
    },
  });
  if (!inst) return null;

  const since = new Date(Date.now() - WEEK);
  const classes: DepartmentClass[] = [];
  const allStudents = new Set<string>(), activeStudents = new Set<string>();
  let cells = 0, solvedCells = 0, assignmentsTotal = 0;

  for (const c of inst.classrooms) {
    const p = await classProgress(c.id);
    const ids = p.students.map((s) => s.id);
    ids.forEach((id) => allStudents.add(id));
    const statuses = p.students.flatMap((s) => p.assignments.flatMap((a) => a.problems.map((q) => p.status[s.id]?.[a.id]?.[q.slug] ?? "pending")));
    const count = (st: string) => statuses.filter((x) => x === st).length;
    const active = ids.length
      ? await prisma.submission.groupBy({ by: ["userId"], where: { userId: { in: ids }, createdAt: { gte: since } } })
      : [];
    active.forEach((a) => a.userId && activeStudents.add(a.userId));
    cells += statuses.length;
    solvedCells += count("on_time") + count("late");
    assignmentsTotal += p.assignments.length;
    classes.push({
      id: c.id, name: c.name, teacher: c.owner.username, students: ids.length, assignments: p.assignments.length,
      solvedRate: statuses.length ? (count("on_time") + count("late")) / statuses.length : null,
      onTimeRate: statuses.length ? count("on_time") / statuses.length : null,
      missing: count("missing"),
      active7d: active.length,
    });
  }

  const { members, classrooms: _classrooms, ...institution } = inst;
  return {
    institution,
    status: planStatus(institution, allStudents.size),
    seatsUsed: allStudents.size,
    teachers: members.map((m) => ({ username: m.user.username, role: m.role })),
    classes,
    totals: {
      classes: classes.length, students: allStudents.size, assignments: assignmentsTotal,
      active7d: activeStudents.size, solvedRate: cells ? solvedCells / cells : null,
    },
  };
}

/** The department summary as CSV: one row per class. */
export function departmentCsv(d: DepartmentSummary): string {
  const pct = (v: number | null) => (v === null ? "" : `${Math.round(v * 100)}%`);
  const rows = [["Class", "Teacher", "Students", "Assignments", "Solved", "On time", "Missing", "Active (7 days)"]];
  for (const c of d.classes) {
    rows.push([c.name, c.teacher, String(c.students), String(c.assignments), pct(c.solvedRate), pct(c.onTimeRate), String(c.missing), String(c.active7d)]);
  }
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
