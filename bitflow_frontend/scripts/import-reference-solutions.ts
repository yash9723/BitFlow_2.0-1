/**
 * scripts/import-reference-solutions.ts — load reference solutions into the DB.
 *
 *   npx tsx scripts/import-reference-solutions.ts private/reference-solutions.json
 *
 * The JSON file maps problem slug -> Verilog source. For testbench problems the
 * source is a model testbench: it must pass the DUT, and the mutants it catches are
 * stored as the bugs students must catch (Question.mutants). Each solution is graded
 * against that problem's hidden tests by the simulation backend, under the same
 * rules as a learner's Submit, and stored in Question.referenceSolution only if
 * it passes. Needs DATABASE_URL, BACKEND_URL and JWT_SECRET, so run it inside the
 * frontend container. The file holds answers: keep it out of git (private/).
 */

import { readFileSync } from "node:fs";
import { prisma } from "../lib/prisma";
import { verifyReferenceSolution } from "../lib/grading";

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("usage: npx tsx scripts/import-reference-solutions.ts <solutions.json>");
    process.exit(2);
  }
  const refs: Record<string, string> = JSON.parse(readFileSync(file, "utf8"));

  let stored = 0, rejected = 0;
  for (const [slug, code] of Object.entries(refs)) {
    const question = await prisma.question.findUnique({ where: { slug } });
    if (!question) {
      console.log(`?? ${slug}: no such problem`);
      rejected++;
      continue;
    }
    const result = await verifyReferenceSolution(question, code);
    if (!result.ok) {
      console.log(`FAIL ${slug}: ${result.error}`);
      rejected++;
      continue;
    }
    await prisma.question.update({
      where: { slug },
      data:  { referenceSolution: code, ...(result.mutants ? { mutants: JSON.stringify(result.mutants) } : {}) },
    });
    if (result.mutants) console.log(`ok   ${slug}: ${result.mutants.length} bugs to catch`);
    stored++;
  }

  console.log(`\n${stored} reference solutions stored, ${rejected} rejected`);
  await prisma.$disconnect();
  process.exit(rejected ? 1 : 0);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
