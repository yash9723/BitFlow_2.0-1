/**
 * app/sitemap.ts — /sitemap.xml: the public pages search engines should index.
 * Pages behind sign-in are left out (crawlers only see the login redirect).
 *
 * No lastmod or changefreq: we have no real per-page modification dates, and search engines
 * ignore (or distrust a site for) a lastmod that is just "now". Priority is a hint only.
 */

import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";
import { SITE_URL } from "@/lib/site";
import { STUDIO_TOOLS } from "@/lib/studio/tools";
import { LESSONS } from "@/lib/lab/lessons";
import { ACADEMY_TOPIC_META } from "@/lib/academy-meta";

const SITEMAP_PAGES: [path: string, priority: number][] = [
  ["/", 1], ["/announcements", 0.7], ["/about", 0.8], ["/studio", 0.8], ["/lab", 0.9], ["/lab/credits", 0.3],
  ...LESSONS.map((l): [string, number] => [`/lab/${l.slug}`, 0.7]),
  ["/academy", 0.9], ["/academy/roadmap", 0.6],
  ...ACADEMY_TOPIC_META.map((t): [string, number] => [`/academy/${t.slug}`, 0.8]),
  ["/leaderboard", 0.6], ["/problems", 0.8], ["/privacy", 0.3], ["/terms", 0.3], ["/contact", 0.4], ["/flash", 0.7],
  ...STUDIO_TOOLS.map((t): [string, number] => [t.href, 0.7]),
];

// Read at request time so new problems appear without a deploy.
export const dynamic = "force-dynamic";

/** Problems a visitor can read: live, in the main path (Arena has its own pages), not a "find the bug" follow-up. */
async function problemPaths(): Promise<[string, number][]> {
  try {
    const rows = await prisma.question.findMany({
      where: { archived: false, unlockAfter: null, NOT: { learningLevel: "Arena" } },
      orderBy: { orderIndex: "asc" }, select: { slug: true },
    });
    return rows.map((r): [string, number] => [`/problems/${r.slug}`, 0.6]);
  } catch {
    return [];   // no database (a build, a test): the rest of the sitemap still works
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pages = [...SITEMAP_PAGES, ...(await problemPaths())];
  return pages.map(([path, priority]) => ({ url: `${SITE_URL}${path}`, priority }));
}
