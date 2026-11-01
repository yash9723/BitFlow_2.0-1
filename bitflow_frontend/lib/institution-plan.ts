/**
 * lib/institution-plan.ts — the pure rules for institutions (college departments on a plan):
 * what an admin may enter, and whether a plan is active, ending, lapsed or over its seats.
 * Safe for pages and checks (no database); lib/institutions.ts has the database side.
 * Self-check: scripts/institutions.check.ts.
 *
 * Plans are enforced softly: a lapsed or full plan shows a banner to the department's
 * teachers and heads. Students are never locked out.
 */

export const PLANS = ["pilot", "department"] as const;
export type Plan = (typeof PLANS)[number];
export const PLAN_LABEL: Record<Plan, string> = { pilot: "Free pilot", department: "Department plan" };

/** Days before the end when the banner starts reminding about renewal. */
export const ENDING_SOON_DAYS = 30;
const DAY = 86_400_000;

export interface InstitutionInput {
  name: string;
  slug: string;
  plan: Plan;
  seatLimit: number | null;
  validUntil: Date | null;
  notes: string | null;
}

export function slugProblem(slug: string): string | null {
  return /^[a-z0-9][a-z0-9-]{1,59}$/.test(slug) ? null : "The address must be 2-60 lower-case letters, digits and dashes, e.g. eit-ece.";
}

/** "2027-05-31" → the end of that day in India (the plan's last day). */
export function lastDay(date: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const noon = new Date(`${date}T12:00:00Z`);
  // Rejects impossible dates such as 2027-02-30, which Date would roll over.
  if (isNaN(noon.getTime()) || noon.toISOString().slice(0, 10) !== date) return null;
  return new Date(`${date}T23:59:59.999+05:30`);
}

/** The plan's last day as "YYYY-MM-DD" (India time), for forms. */
export function lastDayString(d: Date | string | null): string {
  if (!d) return "";
  return new Date(new Date(d).getTime() + 5.5 * 3_600_000).toISOString().slice(0, 10);
}

/**
 * Reads and checks an admin's institution form. With `partial`, missing fields are left out
 * (for edits); otherwise name and slug are required.
 */
export function readInstitution(body: Record<string, unknown>, partial = false):
  { data: Partial<InstitutionInput> } | { error: string } {
  const data: Partial<InstitutionInput> = {};
  const has = (k: string) => body[k] !== undefined;

  if (!partial || has("name")) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name || name.length > 150) return { error: "The name must be 1 to 150 characters." };
    data.name = name;
  }
  if (!partial || has("slug")) {
    const slug = typeof body.slug === "string" ? body.slug.trim().toLowerCase() : "";
    const problem = slugProblem(slug);
    if (problem) return { error: problem };
    data.slug = slug;
  }
  if (!partial || has("plan")) {
    const plan = body.plan ?? "pilot";
    if (!(PLANS as readonly unknown[]).includes(plan)) return { error: "The plan must be a pilot or a department plan." };
    data.plan = plan as Plan;
  }
  if (!partial || has("seatLimit")) {
    const v = body.seatLimit;
    if (v === null || v === "" || v === undefined) data.seatLimit = null;
    else if (Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 100_000) data.seatLimit = v as number;
    else return { error: "Seats must be a whole number from 1 to 100000, or empty for no limit." };
  }
  if (!partial || has("validUntil")) {
    const v = body.validUntil;
    if (v === null || v === "" || v === undefined) data.validUntil = null;
    else {
      const d = typeof v === "string" ? lastDay(v) : null;
      if (!d) return { error: "The end date must be a date like 2027-05-31, or empty for none." };
      data.validUntil = d;
    }
  }
  if (!partial || has("notes")) {
    const notes = typeof body.notes === "string" ? body.notes.trim() : "";
    if (notes.length > 1000) return { error: "Notes can be at most 1000 characters." };
    data.notes = notes || null;
  }
  return { data };
}

export interface PlanStatus {
  state: "active" | "ending" | "lapsed";
  /** Whole days until the plan's last day ends; null for an open-ended plan. */
  daysLeft: number | null;
  overSeats: boolean;
  /** The banner for the department's teachers and heads, or null when all is well (pages add the contact link). */
  message: string | null;
}

export function planStatus(
  inst: { plan: string; validUntil: Date | string | null; seatLimit: number | null },
  seatsUsed: number,
  now = new Date(),
): PlanStatus {
  const end = inst.validUntil ? new Date(inst.validUntil) : null;
  const daysLeft = end ? Math.ceil((end.getTime() - now.getTime()) / DAY) : null;
  const state = end && end < now ? "lapsed" : daysLeft !== null && daysLeft <= ENDING_SOON_DAYS ? "ending" : "active";
  const overSeats = inst.seatLimit !== null && seatsUsed > inst.seatLimit;
  const label = PLAN_LABEL[inst.plan as Plan] ?? "plan";
  const ended = end ? end.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" }) : "";

  const parts: string[] = [];
  if (state === "lapsed") parts.push(`Your department's ${label.toLowerCase()} ended on ${ended}. Everything keeps working while you renew.`);
  else if (state === "ending") parts.push(`Your department's ${label.toLowerCase()} ends on ${ended} (${daysLeft} day${daysLeft === 1 ? "" : "s"} left).`);
  if (overSeats) parts.push(`${seatsUsed} students are using ${inst.seatLimit} seats.`);
  return { state, daysLeft, overSeats, message: parts.length ? parts.join(" ") : null };
}

export const INSTITUTION_ROLES = ["HEAD", "TEACHER"] as const;
export type InstitutionRole = (typeof INSTITUTION_ROLES)[number];
