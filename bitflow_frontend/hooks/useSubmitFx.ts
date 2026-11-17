"use client";
/**
 * hooks/useSubmitFx.ts — Signal FX for a toolbar's Run and Submit buttons (ProblemToolbar,
 * ArenaToolbar). Only clicks react: Ctrl+Enter runs, used many times a day, stay quiet. After a
 * clicked Submit, the next graded submission plays PASS (and XP bits into `xpRef`, if shown) or
 * FAIL n/m.
 */
import { useEffect, useRef } from "react";
import { signal } from "@/lib/signalfx";

export function useSubmitFx(submission: { accepted: boolean; passed: number; total: number } | null | undefined) {
  const runRef = useRef<HTMLButtonElement>(null), submitRef = useRef<HTMLButtonElement>(null), xpRef = useRef<HTMLSpanElement>(null);
  const clicked = useRef(false);
  useEffect(() => {
    if (!submission || !clicked.current) return;
    clicked.current = false;
    if (submission.accepted) {
      signal.pass(submitRef.current);
      const r = submitRef.current?.getBoundingClientRect();
      signal.xp(r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null, xpRef.current);
    } else signal.fail(submitRef.current, submission.passed, submission.total);
  }, [submission]);
  return {
    runRef, submitRef, xpRef,
    onRunClick: () => signal.run(runRef.current),
    onSubmitClick: () => { clicked.current = true; },
  };
}
