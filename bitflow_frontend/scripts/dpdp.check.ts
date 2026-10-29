/**
 * scripts/dpdp.check.ts — self-check for lib/privacy.ts and the DPDP data rights
 * (npx tsx scripts/dpdp.check.ts):
 *   • the age and safe-mode rules for minors;
 *   • every model that holds a user's data is deleted with the account (onDelete: Cascade, or
 *     deleted explicitly in lib/privacy-server.ts deleteAccount) and is in the data export.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ageInYears, birthProblem, canComment, canShareWithClass, canUseAi, guardianPending, isMinor, needsConsent, publicName, CONSENT_VERSION } from "../lib/privacy";

// ── Ages: the day is unknown, so the birth month itself counts as "birthday not yet" ──
const oct2026 = new Date(Date.UTC(2026, 9, 30));   // 30 October 2026
assert.equal(ageInYears(2008, 9, oct2026), 18);    // born Sep 2008: 18 already
assert.equal(ageInYears(2008, 10, oct2026), 17);   // born Oct 2008: maybe not yet, so 17
assert.equal(ageInYears(2008, 11, oct2026), 17);
assert.equal(isMinor({ birthYear: 2008, birthMonth: 9 }, oct2026), false);
assert.equal(isMinor({ birthYear: 2008, birthMonth: 10 }, oct2026), true);
assert.equal(isMinor({ birthYear: null, birthMonth: null }), false, "no age yet: asked by the consent prompt");
assert.ok(birthProblem(2008, 13), "month 13 is refused");
assert.ok(birthProblem("2008", 5), "strings are refused");
assert.ok(birthProblem(2024, 1, oct2026), "too young");
assert.equal(birthProblem(2000, 1, oct2026), null);

// ── Safe mode ──
const kid = { id: "0f1e2d3c-aaaa-bbbb-cccc-111122223333", username: "riya2010", birthYear: 2012, birthMonth: 3, guardianStatus: "pending", guardianAllowAi: false, consentVersion: CONSENT_VERSION };
const adult = { id: "9a8b7c6d-aaaa-bbbb-cccc-444455556666", username: "arjun", birthYear: 2001, birthMonth: 5, guardianStatus: "none", consentVersion: CONSENT_VERSION };
assert.equal(guardianPending(kid), true);
assert.equal(canUseAi(kid), false);
assert.equal(canUseAi({ ...kid, guardianStatus: "granted" }), false, "granted, but the parent didn't allow the AI");
assert.equal(canUseAi({ ...kid, guardianStatus: "granted", guardianAllowAi: true }), true);
assert.equal(canComment(kid), false);
assert.equal(canComment({ ...kid, guardianStatus: "granted" }), false, "comments stay off for minors even with consent");
assert.equal(canShareWithClass(kid), false);
assert.equal(canShareWithClass({ ...kid, guardianStatus: "granted" }), true);
assert.equal(canUseAi(adult), true);
assert.equal(publicName(kid), "Student 0f1e");
assert.equal(publicName(kid, kid.id), "riya2010", "you see your own name");
assert.equal(publicName(adult), "arjun");
assert.equal(needsConsent({ ...adult, consentVersion: null }), true);
assert.equal(needsConsent(adult), false);

// ── Erasure and access cover every model with a user's data ──
const root = join(__dirname, "..");
const schema = readFileSync(join(root, "prisma/schema.prisma"), "utf8");
const exportRoute = readFileSync(join(root, "app/api/profile/export/route.ts"), "utf8");
const deletion = readFileSync(join(root, "lib/privacy-server.ts"), "utf8");
// Kept on purpose without the user: Session (signing in, deleted with the user by cascade but
// never exported), Submission rows are exported; RateLimit/ErrorLog/AuditLog hold no user relation.
const NOT_EXPORTED = new Set(["Session", "CommentReport", "ProjectVersion", "Assignment"]);
const lower = (s: string) => s[0].toLowerCase() + s.slice(1);
const models = [...schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)].map(([, name, body]) => ({ name, body }));
let checked = 0;
for (const { name, body } of models) {
  const rel = body.match(/^\s+\w+\s+User\??\s+@relation\(([^)]*)\)/m);
  if (!rel) continue;
  checked++;
  const cascades = /onDelete:\s*Cascade/.test(rel[1]) || deletion.includes(`prisma.${lower(name)}.deleteMany`);
  assert.ok(cascades, `${name} keeps a user's data but isn't deleted with the account`);
  if (!NOT_EXPORTED.has(name)) assert.ok(exportRoute.includes(`prisma.${lower(name)}.`), `${name} is missing from /api/profile/export`);
}
assert.ok(checked >= 8, `expected the user-linked models to be found (got ${checked})`);
// CommentReport has no relation to cascade through, so deleteAccount removes it explicitly.
assert.ok(deletion.includes("prisma.commentReport.deleteMany"), "deleteAccount must remove comment reports");

console.log(`dpdp.check: ok (${checked} user-linked models covered by deletion and export)`);
