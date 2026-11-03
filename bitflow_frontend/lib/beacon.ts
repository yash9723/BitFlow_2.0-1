/**
 * lib/beacon.ts — bump one of the anonymous PageView counters (app/api/analytics) from the
 * browser, e.g. "/~intro/skipped" for how the landing intro is received. Same rules as
 * components/PageViewTracker.tsx: no cookies or ids, nothing sent with Do Not Track or Global
 * Privacy Control; the server also drops bots and signed-in minors.
 */
export function sendCount(path: string) {
  try {
    const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
    if (nav.doNotTrack === "1" || nav.globalPrivacyControl) return;
    nav.sendBeacon?.("/api/analytics", JSON.stringify({ path, referrer: "" }));
  } catch {
    /* counting is best-effort */
  }
}
