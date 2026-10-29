"use client";
/**
 * components/SiteNotice.tsx — the admin's site-wide notice (app/api/notice), e.g. a data
 * breach announcement (docs/breach-runbook.md). Dismissed per browser (localStorage).
 */
import { useEffect, useState } from "react";

const KEY = "bitflow_notice_dismissed";
interface Notice { id: string; message: string; createdAt: string }

export default function SiteNotice() {
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    fetch("/api/notice").then((r) => r.json()).then((d: { notice: Notice | null }) => {
      let dismissed: string | null = null;
      try { dismissed = localStorage.getItem(KEY); } catch { /* private mode */ }
      if (d.notice && d.notice.id !== dismissed) setNotice(d.notice);
    }).catch(() => {});
  }, []);

  if (!notice) return null;
  const dismiss = () => {
    try { localStorage.setItem(KEY, notice.id); } catch { /* shows again next visit */ }
    setNotice(null);
  };
  return (
    <div role="status" className="fixed top-0 inset-x-0 z-[95] border-b border-warn/50 bg-pit/95 backdrop-blur px-4 py-2 font-mono text-[12px] text-warn flex items-start gap-3">
      <p className="flex-1 whitespace-pre-wrap leading-relaxed">
        <span className="font-bold">Notice ({new Date(notice.createdAt).toLocaleDateString()}): </span>{notice.message}
      </p>
      <button onClick={dismiss} className="shrink-0 px-2 py-0.5 rounded border border-warn/50 hover:bg-warn/10" aria-label="Dismiss the notice">Dismiss</button>
    </div>
  );
}
