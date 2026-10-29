"use client";
/** components/lab/LabProgress.tsx — finished-lesson marks on the /lab page (lib/lab/progress.ts). */
import { useEffect, useState } from "react";
import { doneLessons } from "@/lib/lab/progress";

function useDone() {
  const [done, setDone] = useState<string[]>([]);
  useEffect(() => setDone(doneLessons()), []);
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
