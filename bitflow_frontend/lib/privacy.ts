/**
 * lib/privacy.ts — the DPDP Act 2023 / DPDP Rules 2025 rules shared by the API and the UI
 * (no server-only imports; lib/privacy-server.ts has the database side).
 *
 * • Consent: every account accepts the notice at /privacy (CONSENT_VERSION). Bump the version
 *   when the notice changes materially and everyone is asked again at their next visit.
 * • Children: under 18 needs a parent's or guardian's consent (DPDP s.9). Month and year of
 *   birth are asked, never the full date. A minor is always in "safe mode": no analytics, no
 *   public profile, no username on public boards, no comments, the AI tutor only if the
 *   parent allowed it, and no sharing with a class until a parent has consented.
 *   ponytail: the parent's identity is declared, not DigiLocker-verified; add a verified
 *   consent provider if the Board's guidance requires it for platforms like this one.
 * Self-check: scripts/dpdp.check.ts.
 */

export const CONSENT_VERSION = "2026-10-30";
export const GRIEVANCE_DAYS = 90;      // DPDP Rules: answer grievances within 90 days
export const LOG_RETENTION_DAYS = 365; // DPDP Rules: keep processing logs at least a year
export const GUARDIAN_LINK_DAYS = 7;
export const ADULT_AGE = 18;

export interface PrivacyUser {
  id?: string;
  birthYear?: number | null;
  birthMonth?: number | null;
  guardianStatus?: string | null;
  guardianAllowAi?: boolean | null;
  consentVersion?: string | null;
}

/** Whole years since the birth month; the day is unknown, so the birthday month itself counts as "not yet". */
export function ageInYears(birthYear: number, birthMonth: number, now = new Date()): number {
  const age = now.getUTCFullYear() - birthYear;
  return now.getUTCMonth() + 1 > birthMonth ? age : age - 1;
}

/** Why a month/year of birth can't be used, or null. */
export function birthProblem(birthYear: unknown, birthMonth: unknown, now = new Date()): string | null {
  if (!Number.isInteger(birthYear) || !Number.isInteger(birthMonth)) return "Choose your month and year of birth.";
  const y = birthYear as number, m = birthMonth as number;
  if (m < 1 || m > 12 || y < 1900 || y > now.getUTCFullYear()) return "That month and year of birth isn't valid.";
  if (ageInYears(y, m, now) < 6) return "You need to be at least 6 to use BitFlow.";
  return null;
}

/** Under 18. An account that hasn't given its age yet is asked at its next visit (needsConsent). */
export function isMinor(u: PrivacyUser | null | undefined, now = new Date()): boolean {
  if (!u?.birthYear || !u.birthMonth) return false;
  return ageInYears(u.birthYear, u.birthMonth, now) < ADULT_AGE;
}

export const needsConsent = (u: PrivacyUser | null | undefined) => !!u && u.consentVersion !== CONSENT_VERSION;
export const guardianPending = (u: PrivacyUser | null | undefined) => isMinor(u) && u?.guardianStatus !== "granted";
export const canUseAi = (u: PrivacyUser | null | undefined) => !isMinor(u) || (u?.guardianStatus === "granted" && !!u.guardianAllowAi);
export const canComment = (u: PrivacyUser | null | undefined) => !isMinor(u);
export const canShareWithClass = (u: PrivacyUser | null | undefined) => !guardianPending(u);

/** The name shown to other people: minors appear as "Student xxxx" (a stable, meaningless tag). */
export function publicName(u: PrivacyUser & { id: string; username: string }, viewerId?: string | null): string {
  return isMinor(u) && u.id !== viewerId ? `Student ${u.id.replace(/-/g, "").slice(0, 4)}` : u.username;
}

/** Prisma select for the fields the helpers above need. */
export const PRIVACY_SELECT = {
  birthYear: true, birthMonth: true, guardianStatus: true, guardianAllowAi: true, consentVersion: true,
} as const;
