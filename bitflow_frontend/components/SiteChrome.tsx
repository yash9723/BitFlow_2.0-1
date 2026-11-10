"use client";
/** components/SiteChrome.tsx — the root layout's site-wide extras (notices, consent, analytics, palette), left out of /embed pages framed on other sites. */

import { usePathname } from "next/navigation";

export default function SiteChrome({ children }: { children: React.ReactNode }) {
  return usePathname()?.startsWith("/embed/") ? null : <>{children}</>;
}
