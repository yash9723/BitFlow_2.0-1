"use client";
/**
 * components/studio/loaders.tsx — the Studio tools, loaded in the browser only.
 * Their drafts live in localStorage, which a server render can't see, so rendering
 * them on the server would mismatch on hydration.
 */
import dynamic from "next/dynamic";

const loading = () => <p className="font-mono text-[12px] text-dim animate-pulse">Loading the tool…</p>;

export const LogicTool = dynamic(() => import("./LogicTool"), { ssr: false, loading });
