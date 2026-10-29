/**
 * app/robots.ts — /robots.txt. Keeps crawlers out of the API and the private
 * pages; points them at the sitemap.
 */

import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules:   { userAgent: "*", allow: "/", disallow: ["/api/", "/admin", "/dashboard", "/profile", "/classes", "/s/", "/reset-password", "/guardian/"] },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
