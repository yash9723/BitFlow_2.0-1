/**
 * lib/client-error.ts — send a browser-side crash to /api/errors (admin error
 * log). Used by app/error.tsx and app/global-error.tsx. Never throws.
 */

export function sendClientError(error: Error): void {
  try {
    navigator.sendBeacon?.("/api/errors", JSON.stringify({
      location: window.location.pathname,
      message:  error.message || String(error),
      stack:    error.stack,
    }));
  } catch {
    // reporting must never throw
  }
}
