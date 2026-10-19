/**
 * lib/contests.ts — timed contests over existing problems, with ICPC-style standings.
 *
 * Standings come from SUBMIT rows inside [startsAt, endsAt): rank by problems
 * solved, then by penalty = minutes from the start to each problem's first
 * accepted submit + PENALTY_MINUTES per wrong submit before it. Submits after a
 * problem is solved don't count. Self-check: scripts/contest.check.ts.
 */

export const PENALTY_MINUTES = 20;

export type ContestStatus = "upcoming" | "running" | "ended";

export function contestStatus(c: { startsAt: Date; endsAt: Date }, now: Date = new Date()): ContestStatus {
  return now < c.startsAt ? "upcoming" : now < c.endsAt ? "running" : "ended";
}

export function parseSlugs(json: string): string[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : [];
  } catch {
    return [];
  }
}

export interface ContestSubmission { userId: string; username: string; slug: string; accepted: boolean; createdAt: Date }
export interface ProblemResult { solved: boolean; wrong: number; minutes: number | null }
export interface StandingRow {
  rank: number; userId: string; username: string; solved: number; penalty: number;
  problems: Record<string, ProblemResult>;
}

export function standings(subs: ContestSubmission[], startsAt: Date): StandingRow[] {
  const rows = new Map<string, StandingRow>();
  for (const s of [...subs].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
    let row = rows.get(s.userId);
    if (!row) rows.set(s.userId, row = { rank: 0, userId: s.userId, username: s.username, solved: 0, penalty: 0, problems: {} });
    const p = row.problems[s.slug] ??= { solved: false, wrong: 0, minutes: null };
    if (p.solved) continue;
    if (!s.accepted) { p.wrong++; continue; }
    p.solved  = true;
    p.minutes = Math.floor((s.createdAt.getTime() - startsAt.getTime()) / 60_000);
    row.solved++;
    row.penalty += p.minutes + PENALTY_MINUTES * p.wrong;
  }
  const sorted = [...rows.values()].sort((a, b) => b.solved - a.solved || a.penalty - b.penalty);
  sorted.forEach((r, i) => {
    const prev = sorted[i - 1];
    r.rank = prev && prev.solved === r.solved && prev.penalty === r.penalty ? prev.rank : i + 1;
  });
  return sorted;
}
