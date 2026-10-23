"use client";
/** components/studio/StudioShell.tsx — page frame for /studio and its tools: header, links, scrolling page. */

import Link from "next/link";
import ScrollUnlock from "@/components/ScrollUnlock";
import { PaletteButton } from "@/components/CommandPalette";

export default function StudioShell({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-void text-bright flex flex-col">
      <ScrollUnlock />
      <header className="sticky top-0 z-20 h-14 flex items-center justify-between gap-4 px-4 sm:px-6 bg-void/80 border-b border-rim/50 backdrop-blur-xl">
        <div className="flex items-center gap-2 min-w-0 font-mono text-[11px]">
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <img src="/bitflow_logo_64.png" alt="BitFlow" className="w-6 h-6 rounded" />
            <span className="font-display text-[13px] font-bold text-bright hidden sm:inline">BitFlow</span>
          </Link>
          <span className="text-rim">·</span>
          <Link href="/studio" className="text-ghost hover:text-bright">Studio</Link>
          {title && <><span className="text-rim">/</span><span className="text-pale truncate">{title}</span></>}
        </div>
        <nav className="flex items-center gap-4 font-mono text-[11px] shrink-0">
          <PaletteButton />
          <Link href="/sandbox" className="text-ghost hover:text-bright">Sandbox</Link>
          <Link href="/dashboard" className="text-ghost hover:text-bright hidden sm:inline">Dashboard</Link>
          <Link href="/learn" className="text-ghost hover:text-bright hidden sm:inline">Learn</Link>
        </nav>
      </header>
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 py-6">{children}</main>
    </div>
  );
}
