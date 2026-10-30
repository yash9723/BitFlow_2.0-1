"use client";
/** components/lab/LabProgress.tsx — finished-lesson marks on the /lab page (lib/lab/progress.ts). */
import { useEffect, useState } from "react";
import { doneLessons } from "@/lib/lab/progress";
import { LESSONS_SYNCED } from "@/lib/lesson-sync";

function useDone() {
  const [done, setDone] = useState<string[]>([]);
  useEffect(() => {
    const refresh = () => setDone(doneLessons());
    refresh();
    window.addEventListener(LESSONS_SYNCED, refresh);   // the account's progress arrives a moment later
    return () => window.removeEventListener(LESSONS_SYNCED, refresh);
  }, []);
  return done;
}

export function LabDone({ slug }: { slug: string }) {
  return useDone().includes(slug) ? <span className="font-mono text-[10px] text-phosphor" aria-label="finished">✓ done</span> : null;
}

export function LabCount({ total }: { total: number }) {
  const n = useDone().length;
  return (
    <div className="space-y-1.5 w-full sm:w-56">
      <div className="flex justify-between font-mono text-[10px] text-dim"><span>Your progress</span><span>{n} / {total}</span></div>
      <div className="h-1.5 rounded bg-rim/50 overflow-hidden"><div className="h-full bg-phosphor transition-[width]" style={{ width: `${(n / total) * 100}%` }} /></div>
    </div>
  );
}
