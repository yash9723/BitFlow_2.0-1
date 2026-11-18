"use client";
/**
 * components/SimulatorWakeNotice.tsx — explains the wait while the simulator
 * wakes from sleep (lib/sim-status.ts), then confirms briefly. Rendered once
 * in the root layout; invisible unless a simulator request is slow.
 * The wait is a pixel "install bar" (after a loading bar seen on designeer.xyz): Bitzy at work over a
 * conveyor of chips, and the real seconds waited. No made-up percentage: we can't know how long a cold start takes.
 */

import { useEffect, useState } from "react";
import { useSimStatus } from "@/lib/sim-status";
import PixelSprite from "@/components/pixel/PixelSprite";

export default function SimulatorWakeNotice() {
  const status = useSimStatus();
  const [showReady, setShowReady] = useState(false);
  const [wasWaking, setWasWaking] = useState(false);
  const [secs, setSecs] = useState(0);

  useEffect(() => {
    if (status !== "waking") return;
    setSecs(0);
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [status]);

  useEffect(() => {
    if (status === "waking") setWasWaking(true);
    if (status === "ready" && wasWaking) {
      setWasWaking(false);
      setShowReady(true);
      const t = setTimeout(() => setShowReady(false), 2500);
      return () => clearTimeout(t);
    }
  }, [status, wasWaking]);

  if (status !== "waking" && !showReady) return null;
  const waking = status === "waking";
  return (
    <div role="status" aria-live="polite"
         className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 max-w-[calc(100vw-2rem)] flex items-center gap-2.5 px-4 py-2.5 rounded-full border border-rim bg-surface/95 backdrop-blur shadow-lg text-[12.5px]">
      {waking ? (
        <>
          <span className="wake-window relative shrink-0 w-24 h-7 overflow-hidden rounded-full border border-rim bg-pit" aria-hidden>
            <span className="wake-belt absolute left-0 bottom-1 h-1.5 w-[200%]" />
            <PixelSprite anim="work" size={20} className="absolute left-1/2 -translate-x-1/2 bottom-1.5" />
          </span>
          <span className="text-pale">Waking up the simulator. The first run after a quiet spell takes up to a minute.</span>
          <span className="font-term text-[11px] text-phosphor tabular-nums shrink-0">{secs}s</span>
        </>
      ) : (
        <>
          <span className="w-2 h-2 rounded-full bg-phosphor shrink-0" />
          <span className="text-pale">Simulator ready</span>
        </>
      )}
    </div>
  );
}
