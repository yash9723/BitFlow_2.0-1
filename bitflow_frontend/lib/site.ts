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

/** A public page's title, description and canonical URL (relative: the root layout's metadataBase makes it absolute). */
export const pageMeta = (path: string, title: string, description: string) =>
  ({ title, description, alternates: { canonical: path } });

/** Pages behind sign-in: crawlers only see the sign-in redirect, so keep them out of the index (links are still followed). */
export const GATED = { robots: { index: false, follow: true } };

/** JSON for a <script type="application/ld+json">, with "<" escaped so the content can't close the tag. */
export const jsonLd = (data: unknown) => JSON.stringify(data).replace(/</g, "\\u003c");
