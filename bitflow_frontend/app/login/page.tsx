"use client";

import React, { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../../hooks/useAuth";
import ConsentFields, { type ConsentValue } from "@/components/ConsentFields";
import LoginBackground from "@/components/login/LoginBackground";
import Bitzy, { type Mood } from "@/components/login/Bitzy";
import PasswordInput from "@/components/login/PasswordInput";
import { safeNext } from "@/lib/site";

type Field = "username" | "password" | "secret" | null;
type Status = "idle" | "loading" | "success" | "error";

/** What /api/auth/oauth/<provider>/callback's ?error= codes mean. */
const OAUTH_ERRORS: Record<string, string> = {
  cancelled: "Sign-in was cancelled.",
  state: "That sign-in expired or was started in another browser. Please try again.",
  provider: "We couldn't finish signing in with that account. Please try again.",
  banned: "This account has been suspended. Use the contact form if you think that's a mistake.",
  disabled: "That sign-in option isn't available right now.",
  busy: "Too many sign-in attempts. Please wait a moment and try again.",
  signin: "Sign in first, then connect the account from your profile.",
};

const PROVIDER_LABEL: Record<string, string> = { google: "Google", github: "GitHub" };

function ProviderMark({ provider }: { provider: string }) {
  return provider === "google" ? (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.9z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C36.9 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z" />
    </svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { login, register } = useAuth();

  // The URL is the source of truth: /login, /login?mode=register, /login?mode=register&as=admin.
  const isSignUp = params.get("mode") === "register";
  const asAdmin = isSignUp && params.get("as") === "admin";
  const tabHref = (signUp: boolean) => {
    const p = new URLSearchParams(params.toString());
    if (signUp) p.set("mode", "register");
    else { p.delete("mode"); p.delete("as"); }
    const q = p.toString();
    return q ? `/login?${q}` : "/login";
  };

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [secretPassword, setSecretPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");

  // What Bitzy reacts to.
  const [focus, setFocus] = useState<Field>(null);
  const [shown, setShown] = useState({ password: false, secret: false });
  const [capsLock, setCapsLock] = useState(false);
  const [hoverSubmit, setHoverSubmit] = useState(false);

  // Sign-up spam protection (lib/bot-check.ts): a timed form token + honeypot.
  const [formToken, setFormToken] = useState("");
  const [website, setWebsite] = useState("");
  // DPDP: month/year of birth and acceptance of the notice (components/ConsentFields.tsx).
  const [consent, setConsent] = useState<ConsentValue>({ consent: false });

  useEffect(() => {
    setErrorMsg(null);
    if (!isSignUp) return;
    fetch("/api/auth/register").then((r) => r.json()).then((d) => setFormToken(d.formToken ?? "")).catch(() => {});
  }, [isSignUp]);

  const fail = (message: string) => {
    setErrorMsg(message);
    setStatus("error");
    setTimeout(() => setStatus((s) => (s === "error" ? "idle" : s)), 1200);
  };

  // Google/GitHub: which buttons to show, and why a sign-in came back here (?error=).
  const [providers, setProviders] = useState<string[]>([]);
  useEffect(() => {
    fetch("/api/auth/oauth").then((r) => r.json()).then((d) => setProviders(d.providers ?? [])).catch(() => {});
  }, []);
  const oauthError = params.get("error");
  useEffect(() => {
    if (oauthError) fail(OAUTH_ERRORS[oauthError] ?? "Sign-in didn't work. Please try again.");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oauthError]);
  const next = params.get("next");
  const oauthHref = (p: string) => `/api/auth/oauth/${p}${next ? `?next=${encodeURIComponent(next)}` : ""}`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setStatus("loading");
    try {
      const res = isSignUp
        ? await register(username, password, asAdmin ? "ADMIN" : "STUDENT", asAdmin ? secretPassword : undefined, { formToken, website }, consent)
        : await login(username, password);
      if (res.error || !res.user) {
        if (asAdmin && res.error?.toLowerCase().includes("secret password")) setSecretPassword("");
        return fail(res.error ?? "Login failed");
      }
      setStatus("success");
      const go = safeNext(params.get("next"), res.user.role);
      // Let Bitzy celebrate for a moment, unless motion is reduced.
      const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      setTimeout(() => router.push(go), still ? 0 : 650);
    } catch {
      fail("An unexpected error occurred. Please try again.");
    }
  };

  const inPassword = focus === "password" || focus === "secret";
  const mood: Mood =
    status === "error" ? "error"
    : status === "success" ? "success"
    : status === "loading" ? "loading"
    : inPassword && capsLock ? "surprised"
    : inPassword && shown[focus] ? "peek"
    : inPassword ? "shy"
    : hoverSubmit ? "excited"
    : focus === "username" && username ? "curious"
    : "idle";

  const caption = {
    error: "Access denied!",
    success: isSignUp ? "Profile compiled!" : "Access granted!",
    loading: "Decrypting…",
    surprised: "Caps Lock detected!",
    peek: "Just a peek…",
    shy: "Encrypting input…",
    excited: isSignUp ? "Ready to register!" : "Ready to authorize!",
    curious: "Scanning ID…",
    idle: "Hey Hello!! I'm Bitzy 👋",
  }[mood];

  const busy = status === "loading" || status === "success";
  const tab = (active: boolean) =>
    `flex-1 py-1.5 rounded-md text-center text-caption font-semibold tracking-wider uppercase transition-colors duration-150 ${
      active ? "bg-phosphor/10 text-phosphor border border-phosphor/30" : "text-ghost hover:text-pale border border-transparent"
    }`;

  return (
    <div className="relative min-h-screen bg-void overflow-hidden font-ui flex flex-col items-center justify-center px-4 sm:px-6 py-12 text-bright">
      <style>{`
        .bf-input:-webkit-autofill,
        .bf-input:-webkit-autofill:hover,
        .bf-input:-webkit-autofill:focus,
        .bf-input:-webkit-autofill:active {
          -webkit-text-fill-color: #e8eaf6;
          -webkit-box-shadow: 0 0 0px 1000px #141a15 inset;
          box-shadow: 0 0 0px 1000px #141a15 inset;
          transition: background-color 9999s ease-in-out 0s;
          caret-color: #e8eaf6;
        }
      `}</style>
      <LoginBackground />

      <Link href="/" className="relative z-10 font-display font-bold text-lg text-bright hover:text-phosphor transition-colors mb-8">
        BitFlow
      </Link>

      <div className="relative z-10 w-full max-w-4xl grid grid-cols-1 md:grid-cols-[0.85fr_1fr] bg-pit/90 backdrop-blur-xl border border-phosphor/25 rounded-[20px] overflow-hidden shadow-[0_30px_80px_rgba(0,0,0,0.6),0_0_60px_rgba(0,232,122,0.08)]">
        <Bitzy mood={mood} lookX={username.length / 12 - 1} caption={caption} />

        <div className="p-6 sm:p-8 md:p-10 flex flex-col">
          <nav aria-label="Sign in or register" className="flex bg-shaft border border-rim/60 rounded-lg p-1 mb-6">
            <Link href={tabHref(false)} scroll={false} aria-current={!isSignUp ? "page" : undefined} className={tab(!isSignUp)}>
              Sign in
            </Link>
            <Link href={tabHref(true)} scroll={false} aria-current={isSignUp ? "page" : undefined} className={tab(isSignUp)}>
              Register
            </Link>
          </nav>

          <h1 className="text-heading-sm text-bright mb-1">
            {asAdmin ? "Admin registration" : isSignUp ? "Create your account" : "Welcome back!"}
          </h1>
          <p className="text-small text-ghost mb-6">
            {asAdmin ? "Initialise admin credentials with the system key" : isSignUp ? "Set up a new BitFlow profile" : "Enter your login details to continue to BitFlow"}
          </p>

          {errorMsg && (
            <div role="alert" className="p-3 rounded-lg border border-danger/30 bg-danger/10 text-danger text-small mb-5 flex gap-2">
              <span className="font-bold">⚠ ERROR:</span>
              <span className="flex-1">{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="username" className="block text-caption text-pale mb-1.5">Username</label>
              <input
                id="username"
                type="text"
                required
                autoComplete="username"
                {...(isSignUp && {
                  minLength: 3,
                  maxLength: 24,
                  pattern: "(?:[A-Za-z0-9_.]|-){3,24}",   // = usernameProblem(); no "-" inside the class (v-flag rules)
                  title: "3–24 characters: letters, numbers, dots, dashes and underscores",
                })}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onFocus={() => setFocus("username")}
                onBlur={() => setFocus(null)}
                placeholder="e.g. system_operator"
                className="bf-input w-full bg-[#141a15] border border-rim rounded-lg px-3.5 py-2.5 text-body text-bright placeholder-dim/50 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] focus:outline-none focus:border-phosphor transition-colors"
              />
            </div>

            <div>
              <PasswordInput
                id="password"
                label="Password"
                required
                autoComplete={isSignUp ? "new-password" : "current-password"}
                {...(isSignUp && { minLength: 8, maxLength: 200 })}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onFocus={() => setFocus("password")}
                onBlur={() => setFocus(null)}
                onShownChange={(v) => setShown((s) => ({ ...s, password: v }))}
                onCapsLock={setCapsLock}
                placeholder="••••••••"
              />
              <div className="flex items-center justify-between gap-3 mt-1.5 min-h-[16px] text-caption">
                <span role="status" className="text-warn">{inPassword && capsLock ? "Caps Lock is on" : ""}</span>
                {!isSignUp && (
                  <Link href="/reset-password" className="text-phosphor hover:text-phosphor-glow transition-colors">
                    Forgot password?
                  </Link>
                )}
              </div>
            </div>

            {asAdmin && (
              <PasswordInput
                id="admin-secret"
                label="Secret Admin Key"
                admin
                required
                value={secretPassword}
                onChange={(e) => setSecretPassword(e.target.value)}
                onFocus={() => setFocus("secret")}
                onBlur={() => setFocus(null)}
                onShownChange={(v) => setShown((s) => ({ ...s, secret: v }))}
                onCapsLock={setCapsLock}
                placeholder="Enter system master password"
                hint="Required for admin credentials initialization."
              />
            )}

            {isSignUp && <ConsentFields value={consent} onChange={setConsent} />}

            {/* Honeypot: hidden from people and screen readers; bots fill it in. */}
            {isSignUp && (
              <div aria-hidden="true" className="absolute -left-[9999px] w-px h-px overflow-hidden">
                <label htmlFor="website">Website</label>
                <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off"
                       value={website} onChange={(e) => setWebsite(e.target.value)} />
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              onMouseEnter={() => setHoverSubmit(true)}
              onMouseLeave={() => setHoverSubmit(false)}
              onFocus={() => setHoverSubmit(true)}
              onBlur={() => setHoverSubmit(false)}
              className={`w-full py-3 rounded-lg text-small font-semibold tracking-wide uppercase transition-[background-color,transform] duration-150 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed ${
                asAdmin ? "bg-info text-void hover:bg-info/85" : "bg-phosphor text-void hover:bg-phosphor-glow"
              }`}
            >
              {status === "loading" ? "Decrypting..." : status === "success" ? "Access granted" : isSignUp ? "Create Profile" : "Authorize"}
            </button>
            {isSignUp && (
              <p className="text-caption text-ghost text-center">
                Using BitFlow also means following the{" "}
                <Link href="/terms" className="text-phosphor hover:underline">Terms</Link>.
              </p>
            )}
          </form>

          {!asAdmin && providers.length > 0 && (
            <div className="mt-5">
              <div className="flex items-center gap-3 text-caption uppercase tracking-[0.14em] text-dim mb-3" aria-hidden="true">
                <span className="h-px flex-1 bg-rim/60" />or<span className="h-px flex-1 bg-rim/60" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {providers.map((p) => (
                  // A plain link: the browser goes to the provider and back (app/api/auth/oauth).
                  <a
                    key={p}
                    href={oauthHref(p)}
                    className="flex items-center justify-center gap-2 py-2.5 rounded-lg border border-rim bg-[#141a15] text-small font-semibold text-pale hover:text-bright hover:border-phosphor/50 transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-phosphor"
                  >
                    <ProviderMark provider={p} />
                    Continue with {PROVIDER_LABEL[p] ?? p}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
