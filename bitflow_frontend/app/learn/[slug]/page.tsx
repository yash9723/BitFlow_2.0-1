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
