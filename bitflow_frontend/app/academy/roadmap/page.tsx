"use client";

import React from "react";
import Link from "next/link";
import ScrollUnlock from "@/components/ScrollUnlock";
import AuthGate from "@/components/AuthGate";
import VLSIRoadmap from "@/components/VLSIRoadmap";
import SiteHeader from "@/components/SiteHeader";

export default function AcademyRoadmapPage() {
  return (
    <AuthGate>
      <div className="min-h-screen bg-void text-bright flex flex-col selection:bg-phosphor/30">
        <ScrollUnlock />

        {/* Navigation */}
        <SiteHeader />

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
