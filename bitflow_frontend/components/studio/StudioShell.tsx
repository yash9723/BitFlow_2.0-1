/**
 * components/studio/StudioShell.tsx — page frame for /studio and its tools: header with a
 * breadcrumb trail (and its BreadcrumbList JSON-LD), the page's <h1>, and the site footer.
 * A server component: the tools inside load client-only (components/studio/loaders.tsx), so
 * the heading and links here are what crawlers see.
 */

import Link from "next/link";
import ScrollUnlock from "@/components/ScrollUnlock";
import SiteFooter from "@/components/SiteFooter";
import SiteHeader from "@/components/SiteHeader";
import { SITE_URL, jsonLd } from "@/lib/site";
import { SHARE_KEYS } from "@/lib/studio/tools";
import ShareControl from "@/components/studio/ShareControl";

export default function StudioShell({ title, path, children }: { title?: string; path?: string; children: React.ReactNode }) {
  const crumbs: [string, string][] = [["/", "BitFlow"], ["/studio", "Studio"], ...(title && path ? [[path, title] as [string, string]] : [])];
  const breadcrumbs = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map(([href, name], i) => ({ "@type": "ListItem", position: i + 1, name, item: `${SITE_URL}${href === "/" ? "" : href}` })),
  };
  return (
    <div className="min-h-screen bg-void text-bright flex flex-col">
      <ScrollUnlock />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbs) }} />
      <SiteHeader>{path && SHARE_KEYS[path] && <ShareControl path={path} keys={SHARE_KEYS[path]} />}</SiteHeader>
      <nav aria-label="Breadcrumb" className="w-full max-w-7xl mx-auto px-4 sm:px-6 pt-4 font-mono text-[11px]">
        <ol className="flex items-center gap-2 min-w-0">
          {crumbs.map(([href, name], i) => (
            <li key={href} className="flex items-center gap-2 min-w-0">
              {i > 0 && <span aria-hidden className="text-rim">/</span>}
              {i === crumbs.length - 1
                ? <span className="text-pale truncate" aria-current="page">{name}</span>
                : <Link href={href} className="text-ghost hover:text-bright">{name}</Link>}
            </li>
          ))}
        </ol>
      </nav>
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {title && <h1 className="font-display text-xl font-bold mb-1">{title}</h1>}
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
