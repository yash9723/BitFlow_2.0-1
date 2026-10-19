/**
 * app/not-found.tsx — the page for unknown URLs (and notFound() calls), with a
 * way back into the site instead of a dead end.
 */

import Link from "next/link";

export const metadata = { title: "Page not found", robots: { index: false } };

const LINKS: [href: string, label: string][] = [["/", "Home"], ["/learn", "Learning path"], ["/arena", "Arena"], ["/sandbox", "Sandbox"]];

export default function NotFound() {
  return (
    <main className="min-h-screen bg-void text-bright flex items-center justify-center px-4">
      <div className="max-w-md text-center space-y-5">
        <div className="font-mono text-[12px] tracking-[0.2em] uppercase text-phosphor">Error 404</div>
        <h1 className="text-3xl font-semibold">This signal isn&apos;t driven</h1>
        <p className="text-[14px] text-ghost">
          The page you were looking for doesn&apos;t exist or has moved. Check the address, or pick up where you left off:
        </p>
        <nav className="flex flex-wrap justify-center gap-2" aria-label="Pages">
          {LINKS.map(([href, label]) => (
            <Link key={href} href={href}
                  className={`px-4 py-2 rounded-lg border text-[13px] transition-colors ${href === "/" ? "border-phosphor bg-phosphor text-void font-semibold" : "border-rim text-pale hover:text-bright"}`}>
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </main>
  );
}
