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

export const SITE_URL = (process.env.SITE_URL || "http://localhost:3000").replace(/\/+$/, "");
export const CONTACT_EMAIL = process.env.CONTACT_EMAIL || null;
