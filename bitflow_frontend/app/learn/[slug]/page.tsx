/**
 * app/learn/[slug]/page.tsx
 *
 * Problem solver page for learning path.
 * Loads problem from Prisma database by slug.
 * Renders the ProblemSolver client component.
 */

import { notFound } from "next/navigation";
import { permanentRedirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

interface PageProps {
  params: Promise<{ slug: string }>;
}

// The lookup also runs here: metadata resolves before app/loading.tsx streams, so a missing slug gets a real 404.
export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const q = await prisma.question.findUnique({ where: { slug }, select: { slug: true } });
  if (!q) notFound();
  return {};
}

export default async function LearnPage({ params }: PageProps) {
  const { slug } = await params;

  const question = await prisma.question.findUnique({
    where:  { slug },
    select: { slug: true },
  });

  if (!question) {
    notFound();
  }

  permanentRedirect(`/problems/${question.slug}`);
}
