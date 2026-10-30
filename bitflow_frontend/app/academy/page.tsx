"use client";

/**
 * app/academy/page.tsx — Digital Electronics Academy hub + VLSI Career Roadmap
 */

import React, { useState } from "react";
import Link from "next/link";
import ScrollUnlock from "@/components/ScrollUnlock";
import AuthGate from "@/components/AuthGate";
import VLSIRoadmap from "@/components/VLSIRoadmap";
import {
  ACADEMY_TOPIC_META,
  DIFFICULTY_LABELS,
  DIFFICULTY_STYLES,
} from "@/lib/academy-content";
import SiteHeader from "@/components/SiteHeader";

export default function AcademyHubPage() {
  const [activeTab, setActiveTab] = useState<"topics" | "roadmap">("topics");

  return (
    <AuthGate>
      <div className="min-h-screen bg-void text-bright flex flex-col">
        <ScrollUnlock />

        {/* ambient glow */}
        <div
          className="fixed inset-0 pointer-events-none opacity-60"
          style={{
            background:
              "radial-gradient(ellipse 60% 40% at 50% 0%, rgba(77,184,255,.06), transparent 60%)",
          }}
        />

        <SiteHeader />

        {/* Hero Header */}
        <div className="relative z-[1] px-6 py-10 border-b border-rim/30">
          <div className="max-w-5xl mx-auto flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div className="space-y-3 max-w-xl">
              <span className="inline-block font-mono text-[10px] text-info uppercase tracking-widest border border-info/25 bg-info/10 backdrop-blur-md px-3 py-1 rounded-full">
                Digital Electronics Academy
              </span>
              <h1 className="font-serif text-[30px] md:text-[34px] text-bright leading-tight">
                Learn digital logic,<br />
                <span className="text-info">explore VLSI career tracks.</span>
              </h1>
              <p className="font-mono text-[12px] text-ghost leading-relaxed">
                Curated academic topics from Boolean algebra through memory systems, plus an interactive career roadmap for RTL, DV, DFT, and Physical Design.
              </p>
            </div>

            {/* View Switcher Tabs */}
            <div className="flex items-center gap-1.5 p-1.5 rounded-xl border border-rim/60 bg-pit/50 backdrop-blur-md shrink-0">
              <button
                type="button"
                onClick={() => setActiveTab("topics")}
                className={`font-mono text-[11px] px-4 py-2 rounded-lg border transition-all ${
                  activeTab === "topics"
                    ? "bg-info/15 border-info/40 text-info font-bold shadow-[0_0_15px_rgba(77,184,255,0.2)]"
                    : "bg-transparent border-transparent text-dim hover:text-bright"
                }`}
              >
                📖 Academy Modules
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("roadmap")}
                className={`font-mono text-[11px] px-4 py-2 rounded-lg border transition-all ${
                  activeTab === "roadmap"
                    ? "bg-info/15 border-info/40 text-info font-bold shadow-[0_0_15px_rgba(77,184,255,0.2)]"
                    : "bg-transparent border-transparent text-dim hover:text-bright"
                }`}
              >
                🗺️ VLSI Career Roadmap
              </button>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <main className="relative z-[1] max-w-5xl w-full mx-auto px-6 py-8 flex-1">
          {activeTab === "topics" ? (
            <div className="space-y-6 max-w-4xl mx-auto">
              {/* Featured Banner for Roadmap */}
              <div
                onClick={() => setActiveTab("roadmap")}
                className="group cursor-pointer p-6 rounded-xl border border-phosphor/30 bg-gradient-to-r from-phosphor/10 via-pit/50 to-info/10 backdrop-blur-md hover:border-phosphor/60 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-[0_0_20px_rgba(0,232,122,0.1)]"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[9px] uppercase tracking-widest px-2 py-0.5 rounded bg-phosphor/20 text-phosphor font-bold">
                      NEW FEATURE
                    </span>
                    <span className="font-mono text-[10px] text-ghost">
                      ECE Career Guidance
                    </span>
                  </div>
                  <h3 className="font-display text-[16px] font-bold text-bright group-hover:text-phosphor transition-colors">
                    🗺️ Interactive VLSI Career &amp; Role-Based Learning Roadmap
                  </h3>
                  <p className="font-mono text-[11px] text-dim max-w-xl">
                    Explore chip design roles: RTL Design, Design Verification (DV), DFT, Physical Design (PD), and Analog Layout.
                  </p>
                </div>
                <span className="shrink-0 font-mono text-[11px] px-4 py-2 rounded-lg bg-phosphor/20 text-phosphor border border-phosphor/40 group-hover:bg-phosphor group-hover:text-void transition-all font-bold">
                  Explore Roadmap →
                </span>
              </div>

              {/* Academy Topics Grid */}
              <div className="grid gap-4">
                {ACADEMY_TOPIC_META.map((topic) => (
                  <Link
                    key={topic.slug}
                    href={`/academy/${topic.slug}`}
                    className="group flex items-start gap-4 p-5 rounded-xl
                               border border-rim/60 border-t-white/10 bg-pit/40 backdrop-blur-md
                               transition-all duration-300 hover:-translate-y-0.5 hover:border-info/40
                               hover:shadow-[0_10px_24px_rgba(0,0,0,.35),0_0_20px_rgba(77,184,255,.15)]"
                  >
                    <span className="shrink-0 w-12 h-12 rounded-xl border border-rim/60 bg-info/10 flex items-center justify-center font-mono text-lg text-info group-hover:border-info/50 transition-colors">
                      {topic.icon}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1.5">
                        <span className="font-mono text-[10px] text-dim tabular-nums">
                          {String(topic.order).padStart(2, "0")}
                        </span>
                        <h2 className="font-mono text-sm text-bright font-semibold group-hover:text-info transition-colors">
                          {topic.title}
                        </h2>
                        <span
                          className={`font-mono text-[9px] px-2 py-0.5 rounded-full border uppercase tracking-wider ${
                            DIFFICULTY_STYLES[topic.difficulty] ?? ""
                          }`}
                        >
                          {DIFFICULTY_LABELS[topic.difficulty]}
                        </span>
                      </div>
                      <p className="font-mono text-xs text-ghost leading-relaxed">
                        {topic.summary}
                      </p>
                      <p className="font-mono text-[10px] text-dim mt-1.5">
                        ~{topic.estimatedMinutes} min
                      </p>
                    </div>
                    <svg
                      viewBox="0 0 8 8"
                      className="w-2.5 h-2.5 text-dim/40 group-hover:text-info shrink-0 mt-2 fill-none stroke-current transition-colors"
                      strokeWidth="1.2"
                    >
                      <path d="M1 4h6M4 1l3 3-3 3" />
                    </svg>
                  </Link>
                ))}
              </div>
            </div>
          ) : (
            <VLSIRoadmap />
          )}
        </main>

        <footer className="relative z-[1] px-6 py-6 border-t border-rim/30 text-center mt-auto">
          <p className="font-mono text-[10px] text-dim">
            BitFlow · Digital Electronics Academy
            <span className="mx-2">·</span>
            8 modules · articles · quizzes · flashcards · interactives · VLSI career roadmap
          </p>
        </footer>
      </div>
    </AuthGate>
  );
}