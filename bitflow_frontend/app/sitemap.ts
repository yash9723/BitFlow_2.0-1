/**
 * app/sitemap.ts — /sitemap.xml: the public pages search engines should index.
 * Pages behind sign-in are left out (crawlers only see the login redirect).
 */

import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";
import { STUDIO_TOOLS } from "@/lib/studio/tools";

const PAGES: [path: string, priority: number][] = [
  ["/", 1], ["/about", 0.8], ["/studio", 0.8], ["/leaderboard", 0.6], ["/login", 0.5], ["/privacy", 0.3], ["/terms", 0.3], ["/contact", 0.4],
  ...STUDIO_TOOLS.map((t): [string, number] => [t.href, 0.7]),
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();   // pages change when the site is deployed
  return PAGES.map(([path, priority]) => ({ url: `${SITE_URL}${path}`, lastModified, changeFrequency: "weekly", priority }));
}
