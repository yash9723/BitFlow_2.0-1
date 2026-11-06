/**
 * lib/site.ts — site-wide facts used by metadata, the sitemap, robots.txt, the
 * social preview image and the legal pages. Server-side (reads env at runtime).
 *
 *   SITE_URL       public origin, e.g. https://bitflow.example.com (absolute URLs in
 *                  the sitemap and social previews)
 *   CONTACT_EMAIL  shown on the privacy and terms pages
 */

export const SITE_NAME = "BitFlow";
export const SITE_TAGLINE = "Learn Verilog by building hardware";
export const SITE_DESCRIPTION =
  "Write, simulate and debug Verilog in your browser: guided lessons, graded problems, waveforms, " +
  "synthesis diagrams, a virtual FPGA board, contests and classrooms.";
export const OPERATOR = "NAVIEL Advanced Engineering & Technology";

export const SITE_URL = (
  process.env.SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`) ||
  "http://localhost:3000"
).replace(/\/+$/, "");
export const CONTACT_EMAIL = process.env.CONTACT_EMAIL || null;

/**
 * A public page's title, description and canonical URL (relative: the root layout's metadataBase makes it absolute),
 * plus its own social preview text. Without the openGraph/twitter part a shared link would show the home page's
 * title and "url: /" inherited from the root layout.
 */
export const pageMeta = (path: string, title: string, description: string) => {
  const full = `${title} · ${SITE_NAME}`;   // openGraph and twitter titles don't go through the root title template
  return {
    title, description, alternates: { canonical: path },
    openGraph: { type: "website" as const, siteName: SITE_NAME, title: full, description, url: path },
    twitter: { card: "summary_large_image" as const, title: full, description },
  };
};

/** Paths no crawler should fetch (app/robots.ts). */
export const PRIVATE_PATHS = ["/api/", "/admin", "/dashboard", "/profile", "/classes", "/s/", "/reset-password", "/guardian/"];

/** Crawlers that fetch pages for AI search and assistants (app/robots.ts names them so the policy is explicit). */
export const AI_CRAWLERS = [
  "GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-SearchBot", "Claude-User",
  "PerplexityBot", "Perplexity-User", "Google-Extended", "Applebot-Extended", "CCBot",
];

/** Pages behind sign-in: crawlers only see the sign-in redirect, so keep them out of the index (links are still followed). */
export const GATED = { robots: { index: false, follow: true } };

/** Where to land after signing in: ?next= when it is a path on this site (never another origin), else the role's home. */
export function safeNext(next: string | null | undefined, role: string): string {
  if (next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\")) return next;
  return role === "ADMIN" ? "/admin" : "/dashboard";
}

/** JSON for a <script type="application/ld+json">, with "<" escaped so the content can't close the tag. */
export const jsonLd = (data: unknown) => JSON.stringify(data).replace(/</g, "\\u003c");
