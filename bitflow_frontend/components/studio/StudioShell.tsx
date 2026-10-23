/**
 * components/studio/StudioShell.tsx — page frame for /studio and its tools: header with a
 * breadcrumb trail (and its BreadcrumbList JSON-LD), the page's <h1>, and the site footer.
 * A server component: the tools inside load client-only (components/studio/loaders.tsx), so
 * the heading and links here are what crawlers see.
 */

import Image from "next/image";
import Link from "next/link";
import ScrollUnlock from "@/components/ScrollUnlock";
import SiteFooter from "@/components/SiteFooter";
import { PaletteButton } from "@/components/CommandPalette";
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
      <header className="sticky top-0 z-20 h-14 flex items-center justify-between gap-4 px-4 sm:px-6 bg-void/80 border-b border-rim/50 backdrop-blur-xl">
        <nav aria-label="Breadcrumb" className="min-w-0 font-mono text-[11px]">
          <ol className="flex items-center gap-2 min-w-0">
            <li className="shrink-0">
              <Link href="/" className="flex items-center gap-2">
                <Image src="/bitflow_logo_64.png" alt="BitFlow home" width={24} height={24} className="w-6 h-6 rounded" priority />
                <span className="font-display text-[13px] font-bold text-bright hidden sm:inline">BitFlow</span>
              </Link>
            </li>
            <li aria-hidden className="text-rim">·</li>
            <li><Link href="/studio" className="text-ghost hover:text-bright" aria-current={title ? undefined : "page"}>Studio</Link></li>
            {title && <><li aria-hidden className="text-rim">/</li><li className="text-pale truncate" aria-current="page">{title}</li></>}
          </ol>
        </nav>
        <nav className="flex items-center gap-4 font-mono text-[11px] shrink-0" aria-label="Main">
          {path && SHARE_KEYS[path] && <ShareControl path={path} keys={SHARE_KEYS[path]} />}
          <PaletteButton />
          <Link href="/sandbox" className="text-ghost hover:text-bright">Sandbox</Link>
          <Link href="/dashboard" className="text-ghost hover:text-bright hidden sm:inline">Dashboard</Link>
          <Link href="/learn" className="text-ghost hover:text-bright hidden sm:inline">Learn</Link>
        </nav>
      </header>
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {title && <h1 className="font-display text-xl font-bold mb-1">{title}</h1>}
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
