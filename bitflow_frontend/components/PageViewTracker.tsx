"use client";
/**
 * components/PageViewTracker.tsx — counts a page view on every route change
 * (app/api/analytics). No cookies or ids; honours Do Not Track and Global
 * Privacy Control. Rendered once in the root layout.
 */

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

export default function PageViewTracker() {
  const pathname = usePathname();
  const first = useRef(true);

  useEffect(() => {
    const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
    if (nav.doNotTrack === "1" || nav.globalPrivacyControl || pathname.startsWith("/admin")) return;
    // Only the landing page of a visit has an outside referrer.
    const referrer = first.current ? document.referrer : "";
    first.current = false;
    nav.sendBeacon?.("/api/analytics", JSON.stringify({ path: pathname, referrer }));
  }, [pathname]);

  return null;
}
