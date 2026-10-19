/**
 * app/sitemap.ts — /sitemap.xml: the public pages search engines should index.
 * Pages behind sign-in are left out (crawlers only see the login redirect).
 */

import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

const PAGES: [path: string, priority: number][] = [
  ["/", 1], ["/about", 0.8], ["/leaderboard", 0.6], ["/login", 0.5], ["/privacy", 0.3], ["/terms", 0.3],
];

export default function sitemap(): MetadataRoute.Sitemap {
  return PAGES.map(([path, priority]) => ({ url: `${SITE_URL}${path}`, changeFrequency: "weekly", priority }));
}
