/**
 * components/SiteFooter.tsx — the shared footer of the public pages: links to every Studio
 * tool, the learning areas and the company pages, so each page links into the rest of the site.
 */
import Link from "next/link";
import { STUDIO_TOOLS } from "@/lib/studio/tools";
import { CookieSettingsButton } from "@/components/Analytics";

const GROUPS: { title: string; links: [href: string, label: string][] }[] = [
  { title: "Studio", links: [["/studio", "All tools"], ...STUDIO_TOOLS.map((t): [string, string] => [t.href, t.title])] },
  { title: "Learn", links: [["/learn", "Learning path"], ["/arena", "Arena"], ["/academy", "Academy"], ["/sandbox", "Sandbox IDE"], ["/leaderboard", "Leaderboard"]] },
  { title: "BitFlow", links: [["/about", "About"], ["/contact", "Contact"], ["/privacy", "Privacy"], ["/terms", "Terms"]] },
];

/** The link grid on its own (for footers with their own branding). */
export function SiteLinks() {
  return (
    <nav aria-label="Site" className="grid grid-cols-2 sm:grid-cols-3 gap-x-10 gap-y-6 text-left font-mono text-[11px]">
      {GROUPS.map((g) => (
        <div key={g.title} className="space-y-2">
          <div className="text-[10px] uppercase tracking-[0.16em] text-dim">{g.title}</div>
          <ul className="space-y-1.5">
            {g.links.map(([href, label]) => (
              <li key={href}><Link href={href} className="text-ghost hover:text-phosphor transition-colors">{label}</Link></li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export default function SiteFooter() {
  return (
    <footer className="border-t border-rim/50 mt-12">
      <div className="max-w-6xl mx-auto px-6 py-10 flex flex-col gap-8">
        <SiteLinks />
        <div className="flex flex-wrap gap-4 text-[11px] text-dim font-mono">
          <span>© {new Date().getFullYear()} BitFlow · Learn Verilog by building hardware</span>
          <CookieSettingsButton className="hover:text-bright underline" />
        </div>
      </div>
    </footer>
  );
}
