"use client";
/**
 * components/LiveLabBanner.tsx — at the top of the Sandbox when one of your classes runs a live lab
 * (lib/live-lab.ts). Join to share this Sandbox (code and last run) with the class's teachers; while joined it
 * sends your latest state a few seconds after you stop typing or run, and shows your teacher's note.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { SNAPSHOT_EVERY_MS, runSummary } from "@/lib/live-lab";
import type { SimulateResponse } from "@/lib/types";

interface Lab { classId: string; className: string; joined: boolean; note: string | null }
const CHECK_MS = 30_000;

export default function LiveLabBanner({ designCode, testbenchCode, files, result }: {
  designCode: string; testbenchCode: string; files: { name: string; content: string }[]; result: SimulateResponse | null;
}) {
  const [labs, setLabs] = useState<Lab[]>([]);
  const [canJoin, setCanJoin] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const check = useCallback(async () => {
    const res = await fetch("/api/live/mine").catch(() => null);
    if (!res?.ok) return;
    const j = await res.json();
    setLabs(j.labs ?? []);
    setCanJoin(j.canJoin !== false);
  }, []);
  useEffect(() => {
    check();
    const t = setInterval(() => { if (document.visibilityState === "visible") check(); }, CHECK_MS);
    return () => clearInterval(t);
  }, [check]);

  // While joined: the latest state a few seconds after the last change (or run).
  const joinedIds = labs.filter((l) => l.joined).map((l) => l.classId).join();
  const state = useRef({ designCode, testbenchCode, files, result });
  state.current = { designCode, testbenchCode, files, result };
  useEffect(() => {
    if (!joinedIds) return;
    const t = setTimeout(async () => {
      const s = state.current;
      for (const classId of joinedIds.split(",")) {
        const res = await fetch(`/api/classes/${classId}/live`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "snapshot", designCode: s.designCode, testbenchCode: s.testbenchCode, files: s.files,
                                 run: s.result ? runSummary(s.result) : undefined }),
        }).catch(() => null);
        if (res?.status === 409) { check(); continue; }            // the lab ended, or we were removed
        const j = await res?.json().catch(() => null);
        if (j && "note" in j) setLabs((ls) => ls.map((l) => (l.classId === classId ? { ...l, note: j.note } : l)));
      }
    }, SNAPSHOT_EVERY_MS);
    return () => clearTimeout(t);
  }, [designCode, testbenchCode, files, result, joinedIds, check]);

  const act = async (lab: Lab, method: "POST" | "DELETE") => {
    setError(null);
    const res = await fetch(`/api/classes/${lab.classId}/live`, {
      method, headers: { "Content-Type": "application/json" }, body: method === "POST" ? JSON.stringify({ action: "join" }) : undefined,
    });
    if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? "Something went wrong.");
    await check();
  };

  if (!labs.length) return null;
  return (
    <div className="shrink-0 border-b border-phosphor/30 bg-phosphor/5 px-3 py-1.5 font-mono text-[11px] space-y-1" aria-live="polite">
      {labs.map((lab) => (
        <div key={lab.classId} className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {lab.joined ? (
            <>
              <span className="text-phosphor">● Live lab · {lab.className}</span>
              <span className="text-ghost">Your teacher can see this Sandbox&apos;s code and your last run.</span>
              <button onClick={() => act(lab, "DELETE")} className="text-ghost hover:text-bright underline">Leave</button>
            </>
          ) : (
            <>
              <span className="text-pale">{lab.className} has a live lab running.</span>
              <span className="text-ghost">Joining lets the class&apos;s teachers see this Sandbox&apos;s code and runs until you leave or the lab ends.</span>
              {canJoin
                ? <button onClick={() => act(lab, "POST")} className="px-2 py-0.5 rounded border border-phosphor/60 text-phosphor hover:bg-phosphor/10">Join</button>
                : <span className="text-warn">A parent or guardian needs to approve your account first.</span>}
            </>
          )}
          {lab.joined && lab.note && <span className="basis-full text-info">Note from your teacher: {lab.note}</span>}
        </div>
      ))}
      {error && <p role="alert" className="text-danger">{error}</p>}
    </div>
  );
}
