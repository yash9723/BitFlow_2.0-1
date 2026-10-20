"use client";
/**
 * app/global-error.tsx — last-resort boundary for crashes in the root layout
 * itself (replaces the whole document, so it brings its own <html>/<body>).
 */

import { useEffect } from "react";
import { sendClientError } from "@/lib/client-error";

export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => sendClientError(error), [error]);
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100vh", display: "grid", placeItems: "center", background: "#07080a", color: "#e8eaf6", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ textAlign: "center", maxWidth: 420, padding: 16 }}>
          <h1 style={{ fontSize: 22 }}>BitFlow hit an error</h1>
          <p style={{ color: "#9598ac", fontSize: 14 }}>It has been reported. Your saved work is not affected.</p>
          <button onClick={reset} style={{ marginTop: 12, padding: "8px 16px", borderRadius: 8, border: 0, background: "#00e87a", color: "#07080a", fontWeight: 600, cursor: "pointer" }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
