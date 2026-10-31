"use client";
/** The header's bell: links to /announcements, with the signed-in learner's unread count. */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { badgeText } from "@/lib/announcements";

export const ANNOUNCEMENTS_SEEN = "bitflow:announcements-seen";

export default function AnnouncementBell() {
  const { user } = useAuth();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!user) { setUnread(0); return; }
    let live = true;
    fetch("/api/announcements").then((r) => (r.ok ? r.json() : null)).then((d) => { if (live && d) setUnread(d.unread ?? 0); }).catch(() => {});
    const clear = () => setUnread(0);
    window.addEventListener(ANNOUNCEMENTS_SEEN, clear);
    return () => { live = false; window.removeEventListener(ANNOUNCEMENTS_SEEN, clear); };
  }, [user]);

  return (
    <Link href="/announcements" aria-label={unread ? `Announcements, ${unread} unread` : "Announcements"} title="Announcements"
          className="relative w-8 h-8 shrink-0 flex items-center justify-center rounded-lg border border-rim text-pale hover:text-bright hover:border-muted transition-colors">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
      {unread > 0 && (
        <span aria-hidden className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-[#e0241b] text-white text-[9px] font-bold leading-4 text-center">
          {badgeText(unread)}
        </span>
      )}
    </Link>
  );
}
