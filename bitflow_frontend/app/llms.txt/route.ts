/**
 * app/llms.txt/route.ts — /llms.txt: a plain-text map of the public site for AI assistants and answer engines
 * (https://llmstxt.org). Generated from the same lists the pages use, so it can't drift from the site.
 * Only public pages are listed; sign-in pages and the API are left out.
 */

import { LESSONS } from "@/lib/lab/lessons";
import { STUDIO_TOOLS } from "@/lib/studio/tools";
import { OPERATOR, SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE, SITE_URL } from "@/lib/site";

export const dynamic = "force-static";

const link = (path: string, title: string, note: string) => `- [${title}](${SITE_URL}${path}): ${note}`;

export function GET() {
  const body = [
    `# ${SITE_NAME}`,
    "",
    `> ${SITE_TAGLINE}. ${SITE_DESCRIPTION}`,
    "",
    `${SITE_NAME} is built by ${OPERATOR}. The pages below are public. The Academy, practice problems, classes and contests need a free account.`,
    "",
    "## Learn FPGAs hands-on (Board Lab)",
    link("/lab", "Board Lab", `${LESSONS.length} lessons: write Verilog and watch it run on a 3D FPGA board in the browser`),
    ...LESSONS.map((l) => link(`/lab/${l.slug}`, l.title, l.summary)),
    "",
    "## Free design tools (Design Studio)",
    link("/studio", "Design Studio", "visual digital-design tools that produce Verilog and self-checking testbenches"),
    ...STUDIO_TOOLS.map((t) => link(t.href, t.title, t.blurb)),
    "",
    "## Other",
    link("/problems", "Practice problems", "graded Verilog problems (sign in to solve them)"),
    link("/flash", "Flash an FPGA board", "program a supported FPGA board from the browser"),
    link("/about", "About", "who builds BitFlow and why"),
    link("/announcements", "Announcements", "what is new"),
    link("/contact", "Contact", "how to reach the team"),
    "",
  ].join("\n");

  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
