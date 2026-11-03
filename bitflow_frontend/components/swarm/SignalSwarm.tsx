"use client";

/**
 * components/swarm/SignalSwarm.tsx — the landing page's first-visit intro.
 *
 * A boot terminal types itself out, then a swarm of pixel-art hacker cursors (root@bitflow:~#,
 * 0xB17F10, yosys synth_ice40, …) builds the page: Manhattan wires routed out of finished blocks,
 * boxes dragged out with a live W×H readout, text typed or decrypted, blocks pixel-dissolving
 * in. The rest of the page builds as it is scrolled into view. See session.ts for the run itself
 * and lib/swarm/ for the pure timeline.
 *
 * Mark elements to build with `data-swarm-target="place"` or `data-swarm-target="type"`
 * (+ `data-swarm-decrypt` on headlines). `<SwarmPrelude />` must render before them: its inline
 * script hides them before first paint — only on the first visit of a session, never for
 * reduced motion, bots or a scrolled page, unless the URL asks for it with ?intro=1.
 * Replays: lib/swarm/replay.ts.
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { REPLAY_EVENT, scrollToTop } from "@/lib/swarm/replay";
import { OVERLAY_CSS } from "./overlay";
import { SEEN_KEY, startSession } from "./session";

const PRELUDE = `(function(){try{
var d=document.documentElement;
var forced=/[?&]intro=1(&|$)/.test(location.search);
if(!forced){
if(sessionStorage.getItem("${SEEN_KEY}"))return;
if(matchMedia("(prefers-reduced-motion: reduce)").matches)return;
if(/bot|crawl|spider|slurp|preview|lighthouse|headlesschrome/i.test(navigator.userAgent)&&!/swarm-test/.test(location.search))return;
}
if(location.hash||window.scrollY>0||(document.body&&document.body.scrollTop>0))return;
d.setAttribute("data-swarm","pending");
setTimeout(function(){if(d.getAttribute("data-swarm")==="pending")d.removeAttribute("data-swarm")},3000);
}catch(e){}})();`;

/** Inline script + CSS that hide the swarm's targets before the first paint. Render it above them. */
export function SwarmPrelude() {
  return (
    <>
      <style>{`html[data-swarm=pending] [data-swarm-target],html[data-swarm=running] [data-swarm-target]{visibility:hidden}html[data-swarm] .animate-fade_up{animation:none}`}</style>
      <script dangerouslySetInnerHTML={{ __html: PRELUDE }} />
    </>
  );
}

// before paint on the client (so a client-side visit to /?intro=1 never flashes the page first); a no-op on the server
const useBeforePaint = typeof window === "undefined" ? useEffect : useLayoutEffect;

export default function SignalSwarm() {
  const [run, setRun] = useState<{ id: number; replay: boolean } | null>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const session = useRef<ReturnType<typeof startSession> | null>(null);
  // read once: the first run strips ?intro=1 from the URL, and StrictMode runs effects twice in dev
  const forcedAtLoad = useRef<boolean | null>(null);

  useBeforePaint(() => {
    const root = document.documentElement;
    const url = new URL(window.location.href);
    if (forcedAtLoad.current === null) forcedAtLoad.current = url.searchParams.get("intro") === "1";
    const forced = forcedAtLoad.current;
    // a full page load ran the prelude; a client-side navigation (command palette) did not
    if (forced && root.getAttribute("data-swarm") !== "pending") {
      scrollToTop();
      root.setAttribute("data-swarm", "pending");
    }
    if (root.getAttribute("data-swarm") === "pending") {
      if (url.searchParams.has("intro")) {
        url.searchParams.delete("intro");
        window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
      }
      setRun({ id: 1, replay: forced });
    }
    const onReplay = () => {
      session.current?.destroy();
      scrollToTop();
      root.setAttribute("data-swarm", "pending");
      setRun({ id: Date.now(), replay: true });
    };
    window.addEventListener(REPLAY_EVENT, onReplay);
    return () => window.removeEventListener(REPLAY_EVENT, onReplay);
  }, []);

  useEffect(() => {
    if (!run || !layerRef.current) return;
    const s = startSession(layerRef.current, {
      replay: run.replay,
      onEnd: () => {
        if (session.current === s) session.current = null;
        setRun((r) => (r?.id === run.id ? null : r));
      },
    });
    session.current = s;
    return () => s.destroy();
  }, [run]);

  if (!run) return null;
  return (
    <div className="bf-swarm">
      <style>{`${OVERLAY_CSS}.bf-swarm[data-phase=scroll] .bf-swarm-skip{display:none}`}</style>
      <div ref={layerRef} className="absolute inset-0" aria-hidden="true" />
      <button
        type="button"
        onClick={() => session.current?.skip()}
        className="bf-swarm-skip pointer-events-auto absolute bottom-12 right-4 px-3 py-1.5 rounded-md border border-rim bg-pit/90 text-[12px] text-pale hover:text-bright hover:border-muted transition-colors font-mono"
      >
        Skip intro <span className="text-dim">Esc</span>
      </button>
    </div>
  );
}
