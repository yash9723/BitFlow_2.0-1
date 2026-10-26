"use client";

import React from "react";
import Link from "next/link";
import ScrollUnlock from "@/components/ScrollUnlock";
import AuthGate from "@/components/AuthGate";
import VLSIRoadmap from "@/components/VLSIRoadmap";

export default function AcademyRoadmapPage() {
  return (
    <AuthGate>
      <div className="min-h-screen bg-void text-bright flex flex-col selection:bg-phosphor/30">
        <ScrollUnlock />

        {/* Navigation */}
        <header className="sticky top-0 z-20 h-14 flex items-center justify-between gap-4 px-6 bg-void/80 border-b border-rim/50 backdrop-blur-xl">
          <div className="flex items-center gap-3 shrink-0">
            <Link href="/" className="flex items-center gap-2 group">
              <img
                src="/bitflow_logo_64.png"
                alt="BitFlow"
                className="w-6 h-6 object-contain rounded opacity-80 group-hover:opacity-100 transition-opacity"
              />
              <span className="font-display text-[13px] font-bold text-bright">BitFlow</span>
            </Link>
            <span className="hidden sm:inline text-rim">·</span>
            <span className="hidden sm:inline font-mono text-[11px] text-ghost">Academy · VLSI Career Roadmap</span>
          </div>

          <div className="flex items-center gap-4 sm:gap-5 min-w-0 overflow-x-auto whitespace-nowrap font-mono text-[11px]">
            <Link href="/academy" className="text-info font-semibold hover:text-bright transition-colors">
              ← Back to Academy Hub
            </Link>
            <Link href="/dashboard" className="text-ghost hover:text-bright transition-colors">
              Dashboard
            </Link>
            <Link href="/learn" className="text-ghost hover:text-bright transition-colors">
              Learning Path
            </Link>
            <Link href="/arena" className="text-ghost hover:text-bright transition-colors">
              Arena
            </Link>
            <Link href="/sandbox" className="text-ghost hover:text-bright transition-colors">
              Sandbox
            </Link>
          </div>
        </header>

        {/* Hero Banner */}
        <div className="relative px-6 py-12 border-b border-rim/30 bg-gradient-to-b from-surface/20 via-pit/20 to-transparent">
          <div
            className="absolute inset-0 pointer-events-none opacity-40"
            style={{
              background:
                "radial-gradient(ellipse 60% 40% at 50% 0%, rgba(77,184,255,.08), transparent 60%)",
            }}
          />
          <div className="relative max-w-5xl mx-auto space-y-3">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] text-info uppercase tracking-widest border border-info/25 bg-info/10 px-3 py-1 rounded-full">
                BitFlow Academy
              </span>
              <span className="font-mono text-[10px] text-phosphor uppercase tracking-widest border border-phosphor/25 bg-phosphor/10 px-3 py-1 rounded-full">
                ECE Career Blueprint
              </span>
            </div>
            <h1 className="font-serif text-[32px] md:text-[40px] text-bright leading-tight">
              Interactive VLSI Career &amp; <br />
              <span className="text-info">Role-Based Learning Roadmap</span>
            </h1>
            <p className="font-mono text-[12px] text-ghost leading-relaxed max-w-2xl">
              Understand the complete semiconductor chip lifecycle — from initial front-end RTL design down to physical layout, DFT, and silicon fabrication. Click any role to explore core academic theory, code languages, and industry EDA software.
            </p>
          </div>
        </div>

        {/* Main Content */}
        <main className="max-w-6xl w-full mx-auto px-6 py-10 flex-1">
          <VLSIRoadmap />
        </main>

        {/* Footer */}
        <footer className="px-6 py-6 border-t border-rim/30 text-center mt-auto">
          <p className="font-mono text-[10px] text-dim">
            BitFlow Academy · Interactive VLSI Career &amp; Role-Based Learning Blueprint
            <span className="mx-2">·</span>
            RTL Design · DV · DFT · Physical Design · Analog Layout
          </p>
        </footer>
      </div>
    </AuthGate>
  );
}
