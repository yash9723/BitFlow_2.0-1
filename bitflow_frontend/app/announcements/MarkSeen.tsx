"use client";
/** Opening /announcements marks everything read, and clears the bell straight away. */
import { useEffect } from "react";
import { ANNOUNCEMENTS_SEEN } from "@/components/AnnouncementBell";

export default function MarkSeen() {
  useEffect(() => {
    fetch("/api/announcements", { method: "POST" })
      .then((r) => { if (r.ok) window.dispatchEvent(new Event(ANNOUNCEMENTS_SEEN)); })
      .catch(() => {});
  }, []);
  return null;
}
