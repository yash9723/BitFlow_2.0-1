"use client";
/**
 * components/PairBar.tsx — pair mode in the Sandbox (hooks/usePair.ts, lib/pair.ts).
 * PairButton: in the action bar, for the owner of the open project when pair mode is available.
 * PairBar: the strip under the toolbar while pairing: the link to send, who's here, leave or end; for someone
 * who opened a link, the question first. It also colours and names the partner's cursor (lib/pair-binding.ts).
 */
import { useState } from "react";
import type { Pair } from "@/hooks/usePair";
import { PAIR_INVITE_HOURS, PAIR_PARAM, cssString } from "@/lib/pair";

export function PairButton({ pair }: { pair: Pair }) {
  if (pair.role !== "owner" || !pair.enabled || pair.session) return null;
  return (
    <button onClick={pair.startSession} aria-label="Pair: invite someone to edit this project with you, live"
            title={`Invite someone to edit this project with you, live. The link works for ${PAIR_INVITE_HOURS} hours.`}
            className="text-[11px] px-2 py-0.5 rounded border border-rim text-ghost hover:text-phosphor hover:border-phosphor/50">
      Pair
    </button>
  );
}

export default function PairBar({ pair }: { pair: Pair }) {
  const [copied, setCopied] = useState(false);
  const cursorCss = pair.cursors.map(({ clientID: id, name, color }) =>
    `.bf-pair-head-${id}{border-color:${color}}.bf-pair-head-${id}::after{content:${cssString(name)};background:${color}}.bf-pair-sel-${id}{background:${color}33}`).join("");

  if (pair.invited) {
    return (
      <Strip>
        <span className="text-pale">You&apos;ve been invited to edit a project together.</span>
        <span className="text-ghost">Joining shows its code in your editors, and you both type at once. Your own saved projects aren&apos;t touched.</span>
        <button onClick={pair.join} className="px-2 py-0.5 rounded border border-phosphor/60 text-phosphor hover:bg-phosphor/10">Join</button>
        <button onClick={pair.leave} className="text-ghost hover:text-bright underline">No thanks</button>
      </Strip>
    );
  }
  const active = pair.role === "guest" || pair.session;
  if (!active && !pair.error) return null;

  const link = pair.code ? `${window.location.origin}/sandbox?${PAIR_PARAM}=${encodeURIComponent(pair.code)}` : null;
  const copy = async () => {
    if (!link) return;
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* select it by hand */ }
  };
  const others = pair.peers.map((p) => p.name).join(", ");
  return (
    <Strip>
      <style>{cursorCss}</style>
      {pair.status === "live" && <span className="text-phosphor">● Pairing</span>}
      {pair.status === "connecting" && <span className="text-ghost">Connecting…</span>}
      {pair.status === "waiting" && <span className="text-ghost">Waiting for the project&apos;s owner to open it…</span>}
      {pair.status === "live" && (others ? <span className="text-pale">with {others}</span> : <span className="text-ghost">nobody else here yet</span>)}
      {pair.role === "owner" && link && (
        <>
          <input readOnly value={link} onFocus={(e) => e.target.select()} aria-label="Pair link"
                 className="h-6 w-72 max-w-full px-2 bg-void border border-rim rounded text-[11px] text-pale" />
          <button onClick={copy} className="px-2 py-0.5 rounded border border-phosphor/60 text-phosphor hover:bg-phosphor/10">{copied ? "Copied" : "Copy link"}</button>
          <span className="text-ghost">Send it to one person; it works for {PAIR_INVITE_HOURS} hours. Your project keeps saving as usual.</span>
        </>
      )}
      {pair.role === "owner" && pair.session && !link && (
        <button onClick={pair.startSession} className="text-ghost hover:text-bright underline" title="Makes a new link; the old one stops working">New link</button>
      )}
      {pair.role === "owner" && pair.session && (
        <button onClick={pair.endSession} className="ml-auto px-2 py-0.5 rounded border border-danger/50 text-danger hover:bg-danger/10">End pairing</button>
      )}
      {pair.role === "guest" && (
        <>
          <span className="text-ghost">Runs show only on your screen. The project is saved by its owner.</span>
          <button onClick={pair.leave} className="ml-auto text-ghost hover:text-bright underline">Leave</button>
        </>
      )}
      {pair.error && <p role="alert" className="basis-full text-danger">{pair.error}</p>}
    </Strip>
  );
}

function Strip({ children }: { children: React.ReactNode }) {
  return (
    <div className="shrink-0 border-b border-info/30 bg-info/5 px-3 py-1.5 font-mono text-[11px] flex flex-wrap items-center gap-x-3 gap-y-1" aria-live="polite">
      {children}
    </div>
  );
}
