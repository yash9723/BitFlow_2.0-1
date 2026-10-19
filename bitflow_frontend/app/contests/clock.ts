"use client";
/** Shared by the contest pages: a ticking clock synced to the server's time, and countdown text. */

import { useEffect, useState } from "react";

/** Current server time in ms, ticking every second; `serverNow` is the `now` from the last API response. */
export function useServerClock(serverNow?: string): number {
  const [offset, setOffset] = useState(0);
  const [, tick] = useState(0);
  useEffect(() => {
    if (serverNow) setOffset(new Date(serverNow).getTime() - Date.now());
  }, [serverNow]);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  return Date.now() + offset;
}

/** 93784000 → "1d 2h 3m 4s"; drops leading zero units. */
export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const parts: [number, string][] = [[Math.floor(s / 86400), "d"], [Math.floor(s / 3600) % 24, "h"], [Math.floor(s / 60) % 60, "m"], [s % 60, "s"]];
  const first = parts.findIndex(([n]) => n > 0);
  return first < 0 ? "0s" : parts.slice(first).map(([n, u]) => `${n}${u}`).join(" ");
}
