"use client";
/**
 * components/feedback/FeedbackWidget.tsx — site-wide feedback (mounted in SiteChrome, so not on /embed):
 *
 *  - a slim "Feedback" tab on the right edge that opens FeedbackDialog (bug / idea / other)
 *  - the new-user survey: once a visitor who is new to BitFlow (first seen, or account created, within
 *    NEW_DAYS) has spent SURVEY_AFTER_MS of *active* time here (tab visible), a corner card asks for an
 *    overall 1–5 rating. "Not now" snoozes it a day (at most MAX_SNOOZES times); sending it or
 *    "Don't ask again" ends it. Never shown to minors, while the cookie banner is still open, or on
 *    full-screen editors.
 *
 * Everything is kept in this browser's localStorage (no cookie, nothing sent until the visitor submits).
 */

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import FeedbackDialog from "./FeedbackDialog";

const FIRST = "bf_fb_first", ACTIVE = "bf_fb_active", SURVEY = "bf_fb_survey";
const CONSENT = "bitflow_analytics_consent";                      // components/Analytics.tsx
const TICK_MS = 15_000;
export const SURVEY_AFTER_MS = 20 * 60_000;
const NEW_DAYS = 7, MAX_SNOOZES = 2, DAY_MS = 86_400_000;

/** Full-screen editors and tools: no floating tab, no popup. */
const FULL_SCREEN = /^\/(sandbox|flash|admin)(\/|$)|^\/(problems|arena|studio)\/.+/;

interface SurveyState { done?: boolean; snoozes?: number; until?: number }
const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };
const survey = (): SurveyState => { try { return JSON.parse(read(SURVEY) ?? "{}"); } catch { return {}; } };

export default function FeedbackWidget() {
  const pathname = usePathname() ?? "/";
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [askSurvey, setAskSurvey] = useState(false);
  const fullScreen = FULL_SCREEN.test(pathname);

  // Count active time, and decide when to ask.
  useEffect(() => {
    if (!read(FIRST)) write(FIRST, String(Date.now()));
    const check = () => {
      if (document.visibilityState === "visible") write(ACTIVE, String(Number(read(ACTIVE) ?? 0) + TICK_MS));
      const s = survey(), now = Date.now();
      const since = user?.createdAt ? Date.parse(user.createdAt) : Number(read(FIRST) ?? now);
      const eligible =
        !s.done && (s.snoozes ?? 0) <= MAX_SNOOZES && now >= (s.until ?? 0) &&
        now - since <= NEW_DAYS * DAY_MS &&
        Number(read(ACTIVE) ?? 0) >= SURVEY_AFTER_MS &&
        !user?.minor && read(CONSENT) !== null;
      if (eligible) setAskSurvey(true);
    };
    check();
    const id = window.setInterval(check, TICK_MS);
    return () => window.clearInterval(id);
  }, [user]);

  const endSurvey = () => { write(SURVEY, JSON.stringify({ ...survey(), done: true })); setAskSurvey(false); };
  const snooze = () => {
    const s = survey(), snoozes = (s.snoozes ?? 0) + 1;
    write(SURVEY, JSON.stringify({ ...s, snoozes, until: Date.now() + DAY_MS, done: snoozes > MAX_SNOOZES }));
    setAskSurvey(false);
  };

  if (fullScreen) return null;
  return (
    <>
      <button onClick={() => setOpen(true)} aria-haspopup="dialog"
              className="fixed right-0 top-1/2 -translate-y-1/2 z-[60] [writing-mode:vertical-rl] rotate-180 rounded-r-md border border-l-0 border-rim bg-pit/95 px-1.5 py-3 text-[11px] font-mono text-ghost hover:text-phosphor hover:border-phosphor/50 shadow-lg print:hidden">
        Feedback
      </button>
      {open && (
        <FeedbackDialog kind="general" title="Send feedback" intro="Found a bug, or have an idea? Tell us. Every message is read."
                        onClose={() => setOpen(false)} />
      )}
      {askSurvey && !open && (
        <FeedbackDialog kind="survey" title="How's BitFlow so far?"
                        intro="You've spent a while here. A quick rating helps us make it better."
                        onClose={endSurvey} onSent={() => write(SURVEY, JSON.stringify({ ...survey(), done: true }))}
                        onLater={snooze} onNever={endSurvey} />
      )}
    </>
  );
}
