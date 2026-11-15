/**
 * app/robots.ts — /robots.txt. Keeps crawlers out of the API and the private
 * pages; points them at the sitemap.
 *
 * The AI crawlers are named so the policy is explicit: public pages (Academy, Board Lab, Studio tools) may be
 * read and cited by answer engines, the private ones stay off limits. A bot with its own group ignores the "*"
 * group, so every group repeats the same disallow list.
 */

import type { MetadataRoute } from "next";
import { AI_CRAWLERS, PRIVATE_PATHS, SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: PRIVATE_PATHS },
      { userAgent: AI_CRAWLERS, allow: "/", disallow: PRIVATE_PATHS },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
