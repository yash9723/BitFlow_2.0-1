/**
 * app/layout.tsx — Root layout
 *
 * In Next.js App Router, layout.tsx wraps every page.
 * This root layout:
 *   • Sets <html> and <body> attributes.
 *   • Applies CSS font variables.
 *   • Sets page metadata (title, description, viewport).
 *   • Imports globals.css (once, at the root).
 *
 * It does NOT add any visible UI — that lives in page.tsx.
 */

import type { Metadata, Viewport } from "next";
import { AuthProvider } from "@/hooks/useAuth";
import PageViewTracker from "@/components/PageViewTracker";
import SimulatorWakeNotice from "@/components/SimulatorWakeNotice";
import CommandPalette from "@/components/CommandPalette";
import Analytics from "@/components/Analytics";
import ConsentGate from "@/components/ConsentGate";
import SiteNotice from "@/components/SiteNotice";
import { inter, mono } from "@/lib/fonts";
import { OPERATOR, SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE, SITE_URL, jsonLd } from "@/lib/site";
import "./globals.css";

// ─────────────────────────────────────────────────────────────────────────────
// Metadata — affects <head> on every page
// ─────────────────────────────────────────────────────────────────────────────

// Favicon and Apple touch icon come from app/icon.png and app/apple-icon.png,
// the social preview from app/opengraph-image.tsx (Next.js file conventions).
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title:        { default: `${SITE_NAME} — ${SITE_TAGLINE}`, template: `%s · ${SITE_NAME}` },
  description:  SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  openGraph: {
    type:        "website",
    siteName:    SITE_NAME,
    title:       `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    url:         "/",
  },
  twitter: {
    card:        "summary_large_image",
    title:       `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
  },
  // Google Search Console ownership check: set GOOGLE_SITE_VERIFICATION to the token from Search Console
  ...(process.env.GOOGLE_SITE_VERIFICATION ? { verification: { google: process.env.GOOGLE_SITE_VERIFICATION } } : {}),
};

/** Organization and WebSite structured data (schema.org), on every page. */
const SITE_SCHEMA = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: SITE_NAME,
      url: SITE_URL,
      logo: `${SITE_URL}/bitflow_logo_2.png`,
      description: SITE_DESCRIPTION,
      parentOrganization: { "@type": "Organization", name: OPERATOR },
      sameAs: [
        "https://www.linkedin.com/company/bitflow-vlsi-community/",
        "https://www.instagram.com/bitflow__official",
      ],
    },
    { "@type": "WebSite", "@id": `${SITE_URL}/#website`, url: SITE_URL, name: SITE_NAME, description: SITE_TAGLINE, publisher: { "@id": `${SITE_URL}/#organization` } },
  ],
};

export const viewport: Viewport = {
  width:        "device-width",
  initialScale: 1,
  // No maximumScale: people must be able to pinch-zoom. iOS input-focus zoom is
  // avoided instead by 16px form text on small screens (globals.css).
};

// ─────────────────────────────────────────────────────────────────────────────
// Layout component
// ─────────────────────────────────────────────────────────────────────────────

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`h-full ${inter.variable} ${mono.variable}`}>
      <body className="h-full overflow-y-auto bg-void text-bright font-mono antialiased">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(SITE_SCHEMA) }} />
        <AuthProvider>
          {children}
          <PageViewTracker />
          <SimulatorWakeNotice />
          <CommandPalette />
          <Analytics />
          <SiteNotice />
          <ConsentGate />
        </AuthProvider>
      </body>
    </html>
  );
}
