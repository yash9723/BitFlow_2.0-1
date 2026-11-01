"use client";
/**
 * components/RefCapture.tsx — remembers how a visitor first arrived: the `ref` or
 * `utm_source` tag on a campaign link (a college workshop, an ambassador's link).
 * Kept in this browser only (localStorage, no cookie) for 30 days, first tag wins,
 * and sent with the sign-up form (hooks/useAuth.tsx → app/api/auth/register).
 * Rendered once in the root layout.
 */

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { REF_STORAGE_KEY, normalizeRef } from "@/lib/signup-source";

const KEEP_MS = 30 * 86_400_000;

export default function RefCapture() {
  const pathname = usePathname();
  const params = useSearchParams();
  useEffect(() => {
    const tag = normalizeRef(params?.get("ref") ?? params?.get("utm_source"));
    if (!tag) return;
    try {
      const saved = JSON.parse(localStorage.getItem(REF_STORAGE_KEY) ?? "null") as { tag: string; at: number } | null;
      if (saved && Date.now() - saved.at < KEEP_MS) return;   // the first tag wins
      localStorage.setItem(REF_STORAGE_KEY, JSON.stringify({ tag, at: Date.now() }));
    } catch {
      // storage blocked (private window): nothing to remember
    }
  }, [pathname, params]);
  return null;
}

/** The remembered tag, if any and not expired (for the sign-up request). */
export function storedRef(): string | undefined {
  try {
    const saved = JSON.parse(localStorage.getItem(REF_STORAGE_KEY) ?? "null") as { tag: string; at: number } | null;
    return saved && Date.now() - saved.at < KEEP_MS ? normalizeRef(saved.tag) || undefined : undefined;
  } catch {
    return undefined;
  }
}
