import { PrismaClient } from "@prisma/client";
import { LEARNING_PATH } from "../lib/problems/index";
import { ALL_ARENA_PROBLEMS } from "../lib/arena/index";
import { RELEASE_POSTS } from "../content/announcements";

const prisma = new PrismaClient();

async function upsertProblem(problem: any, learningLevel: string) {
  const data = {
    slug: problem.slug,
    title: problem.title,
    difficulty: problem.difficulty ?? "Easy",
    category: problem.category ?? "General",
    tags: JSON.stringify(problem.tags ?? []),
    learningLevel,
    orderIndex: problem.orderIndex ?? 0,
    moduleId: problem.moduleId ?? "unknown",
    statement: problem.statement ?? "",
    constraints: JSON.stringify(problem.constraints ?? []),
    examples: JSON.stringify(problem.examples ?? []),
    hints: JSON.stringify(problem.hints ?? []),
    solutionExplanation: problem.solutionExplanation ?? null,
    starterCode: problem.starterCode ?? "",
    testbenchSkeleton: problem.testbenchSkeleton ?? null,
    publicTestbench: problem.publicTestbench ?? "",
    hiddenTestcases: JSON.stringify(problem.hiddenTestcases ?? []),
    hiddenTestbench: problem.hiddenTestbench ?? null,
    dataFiles: problem.dataFiles ? JSON.stringify(problem.dataFiles) : null,
    publicTestcases: JSON.stringify(problem.publicTestcases ?? []),
    expectedOutputMode: problem.expectedOutputMode ?? "stdout_compare",
    waveformRequired: problem.waveformRequired ?? false,
    xpReward: problem.xpReward ?? 300,
    xpBonusNoHints: problem.xpBonusNoHints ?? null,
    problemType: problem.problemType ?? "design",
  };

  // An admin edited or archived this one (app/api/admin/problems/[slug]): the database wins.
  const existing = await prisma.question.findUnique({ where: { slug: problem.slug }, select: { adminEditedAt: true } });
  if (existing?.adminEditedAt) return;

  await prisma.question.upsert({
    where: { slug: problem.slug },
    create: data,
    update: data,
  });
}

async function main() {
  console.log("🌱 Seeding database...\n");

  // Learning Path
  for (const level of LEARNING_PATH.levels) {
  for (const module of level.modules) {
    for (const p of module.problems) {
      await upsertProblem(p, level.title);
    }
  }
}

  // Arena FSM
  for (const p of ALL_ARENA_PROBLEMS) {
    await upsertProblem(p, "Arena");
  }
  console.log("✅ Arena FSM seeded\n");

  const total = await prisma.question.count();
  console.log(`✅ Total: ${total} problems`);

  // Release posts ship with their feature; an admin's edit wins.
  for (const p of RELEASE_POSTS) {
    const existing = await prisma.announcement.findUnique({ where: { id: p.id }, select: { adminEditedAt: true } });
    if (existing?.adminEditedAt) continue;
    const data = { title: p.title, body: p.body, kind: p.kind, version: p.version ?? null, pinned: p.pinned ?? false, publishedAt: new Date(p.publishedAt) };
    await prisma.announcement.upsert({ where: { id: p.id }, create: { id: p.id, ...data }, update: data });
  }
  console.log(`✅ ${RELEASE_POSTS.length} release posts`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());