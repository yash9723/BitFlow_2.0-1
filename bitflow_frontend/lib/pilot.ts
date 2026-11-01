/**
 * lib/pilot.ts — the college pilot request on /colleges (components/PilotForm.tsx).
 *
 * A request is stored as a ContactMessage with kind "pilot" (app/api/contact/route.ts),
 * so it shows in the admin console's Messages tab with the contact messages. The
 * structured fields are checked here and written into the subject and message.
 */

export interface PilotRequest {
  name: string;
  email: string;
  phone: string;
  role: string;
  college: string;
  department: string;
  university: string;
  city: string;
  students: number;
  semester: string;
  notes: string;
}

export const PILOT_ROLES = ["Faculty", "HOD", "Principal / Dean", "Lab in-charge", "Training & placement", "Student coordinator", "Other"] as const;
export const PILOT_SEMESTERS = ["Jan–May 2027 (even semester)", "Jul–Dec 2027 (odd semester)", "As soon as possible", "Not sure yet"] as const;

const LIMITS = { name: 100, email: 200, phone: 20, college: 150, department: 100, university: 120, city: 80, notes: 2000 };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Indian and international numbers: digits, spaces, +, -, brackets; 10 to 15 digits.
const PHONE = /^\+?[\d\s()-]{10,20}$/;

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Reads a request body into a PilotRequest (no checks yet; see pilotProblem). */
export function readPilot(body: Record<string, unknown>): PilotRequest {
  return {
    name: text(body.name), email: text(body.email), phone: text(body.phone), role: text(body.role),
    college: text(body.college), department: text(body.department), university: text(body.university),
    city: text(body.city), students: Number(body.students), semester: text(body.semester), notes: text(body.notes),
  };
}

/** What is wrong with a pilot request, in words for the form, or null when it is fine. */
export function pilotProblem(p: PilotRequest): string | null {
  const digits = p.phone.replace(/\D/g, "").length;
  return !p.name ? "Please enter your name."
    : p.name.length > LIMITS.name ? `Your name can be at most ${LIMITS.name} characters.`
    : !EMAIL.test(p.email) || p.email.length > LIMITS.email ? "Please enter a valid email address, so we can reply."
    : p.phone && (!PHONE.test(p.phone) || digits < 10 || digits > 15) ? "Please enter a valid phone number, or leave it empty."
    : !(PILOT_ROLES as readonly string[]).includes(p.role) ? "Please choose your role."
    : !p.college ? "Please enter your college's name."
    : p.college.length > LIMITS.college ? `The college name can be at most ${LIMITS.college} characters.`
    : !p.department ? "Please enter your department."
    : p.department.length > LIMITS.department ? `The department can be at most ${LIMITS.department} characters.`
    : p.university.length > LIMITS.university ? `The university can be at most ${LIMITS.university} characters.`
    : p.city.length > LIMITS.city ? `The city can be at most ${LIMITS.city} characters.`
    : !Number.isInteger(p.students) || p.students < 1 || p.students > 5000 ? "Please enter about how many students would use it (1 to 5000)."
    : !(PILOT_SEMESTERS as readonly string[]).includes(p.semester) ? "Please choose when you would like to start."
    : p.notes.length > LIMITS.notes ? `Your notes can be at most ${LIMITS.notes} characters.`
    : null;
}

/** The subject and message text the admin console shows for a pilot request. */
export function pilotMessage(p: PilotRequest): { subject: string; message: string } {
  const subject = `Pilot: ${p.college} — ${p.department}`.slice(0, 150);
  const lines = [
    `College:     ${p.college}`,
    `Department:  ${p.department}`,
    `University:  ${p.university || "—"}`,
    `City:        ${p.city || "—"}`,
    `Students:    ${p.students}`,
    `Start:       ${p.semester}`,
    `Contact:     ${p.name} (${p.role})`,
    `Phone:       ${p.phone || "—"}`,
  ];
  if (p.notes) lines.push("", p.notes);
  return { subject, message: lines.join("\n") };
}
