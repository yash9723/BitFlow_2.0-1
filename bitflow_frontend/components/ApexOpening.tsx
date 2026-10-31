"use client";
/**
 * components/ApexOpening.tsx — the 3D opening film on /announcements (source: tools/apex-opening).
 * Plays once per release in each browser, with Skip always on screen and a Replay by the title.
 * It never traps anyone: a film that fails, or hasn't started in two seconds, just gives way to the page.
 * When it plays is decided in lib/announcements.ts.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { OPENING_HOLD_CLASS, OPENING_KEY, OPENING_VERSION, shouldPlayOpening } from "@/lib/announcements";

const REPLAY = "bitflow:apex-opening-replay";
const START_WITHIN_MS = 2000;
const FADE_MS = 400;

const videoFile = () => `/apex-opening/${OPENING_VERSION}-${window.matchMedia("(orientation: portrait)").matches ? "portrait" : "landscape"}.mp4`;

export function ReplayOpening() {
  return (
    <button type="button" onClick={() => window.dispatchEvent(new Event(REPLAY))} className="apex-opening-replay">
      Replay opening
    </button>
  );
}

export default function ApexOpening() {
  const [src, setSrc] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const started = useRef(false);

  // Before paint, so a student arriving from a link inside the site never sees the page flash first.
  useLayoutEffect(() => {
    let seen: string | null = OPENING_VERSION;   // no storage means no memory of it: don't replay it on every visit
    try { seen = localStorage.getItem(OPENING_KEY); } catch { /* blocked */ }
    const saveData = !!(navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (shouldPlayOpening(seen, OPENING_VERSION, { reducedMotion, saveData })) {
      try { localStorage.setItem(OPENING_KEY, OPENING_VERSION); } catch { /* blocked */ }
      setSrc(videoFile());
    }
    document.documentElement.classList.remove(OPENING_HOLD_CLASS);
  }, []);

  useEffect(() => {
    const replay = () => { started.current = false; setLeaving(false); setSrc(videoFile()); };
    window.addEventListener(REPLAY, replay);
    return () => window.removeEventListener(REPLAY, replay);
  }, []);

  useEffect(() => {
    if (!src) return;
    const finish = () => setLeaving(true);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") finish(); };
    window.addEventListener("keydown", onKey);
    video.current?.play().catch(finish);   // e.g. a phone in low-power mode refuses to autoplay
    const giveUp = setTimeout(() => { if (!started.current) finish(); }, START_WITHIN_MS);
    return () => { window.removeEventListener("keydown", onKey); clearTimeout(giveUp); };
  }, [src]);

  useEffect(() => {
    if (!leaving) return;
    const gone = setTimeout(() => { setSrc(null); setLeaving(false); }, FADE_MS);
    return () => clearTimeout(gone);
  }, [leaving]);

  if (!src) return null;
  return (
    <div className={`apex-opening ${leaving ? "apex-opening-leaving" : ""}`}>
      <video
        ref={video}
        src={src}
        muted
        playsInline
        preload="auto"
        aria-label="BitFlow 3.0 APEX opening film"
        onPlaying={() => { started.current = true; }}
        onEnded={() => setLeaving(true)}
        onError={() => setLeaving(true)}
      />
      <button type="button" onClick={() => setLeaving(true)} className="apex-opening-skip">Skip</button>
    </div>
  );
}
