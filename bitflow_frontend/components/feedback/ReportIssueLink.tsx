"use client";
/** components/feedback/ReportIssueLink.tsx — "Report an issue" on a practice problem: opens FeedbackDialog (kind "problem"). */

import { useState } from "react";
import FeedbackDialog from "./FeedbackDialog";

export default function ReportIssueLink({ slug, className = "" }: { slug: string; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog"
              className={`text-ghost hover:text-phosphor underline-offset-2 hover:underline ${className}`}>
        Report an issue
      </button>
      {open && (
        <FeedbackDialog kind="problem" target={slug} title="Report an issue with this problem"
                        intro="Wrong tests, an unclear statement or a typo? Tell us what you saw." onClose={() => setOpen(false)} />
      )}
    </>
  );
}
