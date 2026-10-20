"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../hooks/useAuth";

/**
 * Wrap any protected page's content with <AuthGate>. If the session check
 * (via useAuth) comes back with no user, this redirects to /login instead
 * of rendering the page — covers direct URL entry, bookmarks, and links,
 * not just in-app navigation.
 *
 * Intentionally page-level (not Next.js middleware) — a prior middleware-based
 * version caused a redirect loop when getUser() failed on localhost HTTP.
 */
export default function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      // Come back here after signing in.
      router.replace(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
    }
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-void text-bright font-mono flex items-center justify-center">
        <span className="text-ghost text-sm">
          <span className="text-phosphor">►</span> checking access
          <span className="animate-blink">_</span>
        </span>
      </div>
    );
  }

  return <>{children}</>;
}
