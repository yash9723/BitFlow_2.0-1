"use client";
/** On the dashboard: the newest unread pinned announcement, until it's read or dismissed in this browser. */
import { useEffect, useState } from "react";
import Link from "next/link";
import PixelFire from "@/components/PixelFire";

const KEY = "bitflow_announcement_dismissed";

export default function AnnouncementStrip() {
  const [post, setPost] = useState<{ id: string; title: string } | null>(null);

  useEffect(() => {
    fetch("/api/announcements").then((r) => (r.ok ? r.json() : null)).then((d) => {
      let dismissed: string | null = null;
      try { dismissed = localStorage.getItem(KEY); } catch { /* private mode */ }
      if (d?.pinned && d.pinned.id !== dismissed) setPost(d.pinned);
    }).catch(() => {});
  }, []);

  if (!post) return null;
  const dismiss = () => {
    try { localStorage.setItem(KEY, post.id); } catch { /* shows again next visit */ }
    setPost(null);
  };
  return (
    <div className="apex apex-strip relative overflow-hidden rounded-xl flex items-center gap-3 pl-4 pr-2 py-3">
      <PixelFire cell={4} className="apex-pixelfire-strip" />
      <Link href="/announcements" className="relative min-w-0 flex-1 text-[13px]">
        <span className="apex-kind font-mono text-[11px] mr-2">New</span>
        <span className="apex-bright font-semibold">{post.title}</span>
        <span className="apex-steel"> · Read more</span>
      </Link>
      <button onClick={dismiss} aria-label="Dismiss this announcement" className="relative w-8 h-8 shrink-0 rounded-lg apex-steel hover:text-white">✕</button>
    </div>
  );
}
