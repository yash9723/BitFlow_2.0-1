// Metadata only: the page is a client component that loads the problem itself.
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const q = await prisma.question.findUnique({ where: { slug: params.slug }, select: { title: true, difficulty: true } });
  if (!q) return { title: "Problem not found" };
  return {
    title:       q.title,
    description: `${q.title}: a ${q.difficulty.toLowerCase()} Verilog problem on BitFlow. Write the module, simulate it and get graded against hidden tests.`,
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
