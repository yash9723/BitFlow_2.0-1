/**
 * app/sitemap.ts — /sitemap.xml: the public pages search engines should index.
 * Pages behind sign-in are left out (crawlers only see the login redirect).
 *
 * No lastmod or changefreq: we have no real per-page modification dates, and search engines
 * ignore (or distrust a site for) a lastmod that is just "now". Priority is a hint only.
 */

import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";
import { STUDIO_TOOLS } from "@/lib/studio/tools";
import { LESSONS } from "@/lib/lab/lessons";

const SITEMAP_PAGES: [path: string, priority: number][] = [
  ["/", 1], ["/announcements", 0.7], ["/about", 0.8], ["/studio", 0.8], ["/lab", 0.9], ["/lab/credits", 0.3],
  ...LESSONS.map((l): [string, number] => [`/lab/${l.slug}`, 0.7]),
  ["/leaderboard", 0.6], ["/problems", 0.8], ["/privacy", 0.3], ["/terms", 0.3], ["/contact", 0.4], ["/flash", 0.7],
  ...STUDIO_TOOLS.map((t): [string, number] => [t.href, 0.7]),
];

export default function sitemap(): MetadataRoute.Sitemap {
  return SITEMAP_PAGES.map(([path, priority]) => ({ url: `${SITE_URL}${path}`, priority }));
}
