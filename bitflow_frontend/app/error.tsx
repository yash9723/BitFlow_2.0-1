"use client";
/**
 * app/error.tsx — shown when a page crashes in the browser. Reports the error
 * (lib/client-error.ts) and offers a retry instead of a blank page.
 */

import Link from "next/link";
import { useEffect } from "react";
import { sendClientError } from "@/lib/client-error";

export default function PageError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => sendClientError(error), [error]);
  return (
    <main className="min-h-screen bg-void text-bright flex items-center justify-center px-4">
      <div className="max-w-md text-center space-y-5">
        <div className="font-mono text-[12px] tracking-[0.2em] uppercase text-danger">Something went wrong</div>
        <h1 className="text-2xl font-semibold">This page hit an error</h1>
        <p className="text-[14px] text-ghost">It has been reported. Try again, or head back home; your saved work is not affected.</p>
        <div className="flex justify-center gap-2">
          <button onClick={reset} className="px-4 py-2 rounded-lg bg-phosphor text-void text-[13px] font-semibold">Try again</button>
          <Link href="/" className="px-4 py-2 rounded-lg border border-rim text-pale text-[13px] hover:text-bright">Home</Link>
        </div>
      </div>
    </main>
  );
}
