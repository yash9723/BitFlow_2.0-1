"use client";
/**
 * components/Analytics.tsx — Google Analytics 4, loaded only after the visitor accepts the
 * banner. Needs NEXT_PUBLIC_GA_ID (G-XXXXXXX); without it nothing renders. The choice is kept
 * in localStorage ("granted" / "denied"); "Cookie settings" in the footer reopens the banner.
 * The built-in cookieless page counter (components/PageViewTracker.tsx) runs regardless.
 */

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Script from "next/script";
import Link from "next/link";

const RAW_ID = process.env.NEXT_PUBLIC_GA_ID ?? "";
export const GA_ID = /^G-[A-Z0-9]{4,20}$/.test(RAW_ID) ? RAW_ID : "";
const KEY = "bitflow_analytics_consent";
export const OPEN_CONSENT = "bitflow:consent";

type Consent = "granted" | "denied" | null;
declare global { interface Window { gtag?: (...args: unknown[]) => void } }

function readConsent(): Consent {
  try { const v = localStorage.getItem(KEY); return v === "granted" || v === "denied" ? v : null; } catch { return null; }
}

export default function Analytics() {
  const [consent, setConsent] = useState<Consent | "loading">("loading");
  const [banner, setBanner] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    if (!GA_ID) return;
    const c = readConsent();
    setConsent(c);
    setBanner(c === null);
    const open = () => setBanner(true);
    window.addEventListener(OPEN_CONSENT, open);
    return () => window.removeEventListener(OPEN_CONSENT, open);
  }, []);

  // Page views on client-side navigation (the first one is sent by the config call)
  useEffect(() => {
    if (consent === "granted" && window.gtag) window.gtag("event", "page_view", { page_path: pathname });
  }, [pathname, consent]);

  const choose = (c: "granted" | "denied") => {
    try { localStorage.setItem(KEY, c); } catch { /* the choice then lasts this visit */ }
    if (c === "denied" && window.gtag) window.gtag("consent", "update", { analytics_storage: "denied" });
    setConsent(c);
    setBanner(false);
  };

  if (!GA_ID) return null;
  return (
    <>
      {consent === "granted" && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
          <Script id="ga-init" strategy="afterInteractive">{`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            window.gtag = gtag;
            gtag('consent', 'default', { analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
            gtag('js', new Date());
            gtag('config', '${GA_ID}', { anonymize_ip: true });
          `}</Script>
        </>
      )}
      {banner && (
        <div role="dialog" aria-label="Cookie consent" className="fixed bottom-4 inset-x-4 sm:left-auto sm:right-4 sm:max-w-sm z-[90] rounded-xl border border-rim bg-pit/95 backdrop-blur p-4 shadow-2xl font-mono text-[12px] space-y-3">
          <p className="text-pale leading-relaxed">
            May we use Google Analytics cookies to learn how the site is used? No ads, and it stays off unless you accept.
            See our <Link href="/privacy" className="text-phosphor hover:underline">privacy policy</Link>.
          </p>
          <div className="flex gap-2">
            <button onClick={() => choose("granted")} className="px-3 py-1.5 rounded-lg bg-phosphor text-void font-bold">Accept</button>
            <button onClick={() => choose("denied")} className="px-3 py-1.5 rounded-lg border border-rim text-ghost hover:text-bright">Decline</button>
          </div>
        </div>
      )}
    </>
  );
}

/** "Cookie settings" link for footers: reopens the banner (only when GA is configured). */
export function CookieSettingsButton({ className = "" }: { className?: string }) {
  if (!GA_ID) return null;
  return <button type="button" onClick={() => window.dispatchEvent(new Event(OPEN_CONSENT))} className={className}>Cookie settings</button>;
}
