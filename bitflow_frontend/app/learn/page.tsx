"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import ScrollUnlock from "../../components/ScrollUnlock";
import AuthGate from "../../components/AuthGate";
import VLSIRoadmap from "@/components/VLSIRoadmap";
import type { PathLevel, PathModule, Problem, ProgressRecord } from "@/lib/problem-types";

// ─────────────────────────────────────────────────────────────────────────────
// Visual config mapping
// ─────────────────────────────────────────────────────────────────────────────
const LEVEL_CONFIG: Record<string, {
  glow:    string;
  ring:    string;
  label:   string;
  badge:   string;
  locked:  string;
}> = {
  beginner: {
    glow:   "rgba(0,232,122,0.08)",
    ring:   "#00e87a",
    label:  "text-phosphor",
    badge:  "border-phosphor/30 bg-phosphor/10 text-phosphor",
    locked: "border-phosphor/10 bg-phosphor/3 text-phosphor/30",
  },
  intermediate: {
    glow:   "rgba(77,184,255,0.08)",
    ring:   "#4db8ff",
    label:  "text-info",
    badge:  "border-info/30 bg-info/10 text-info",
    locked: "border-info/10 bg-info/3 text-info/30",
  },
  advanced: {
    glow:   "rgba(255,184,77,0.08)",
    ring:   "#ffb84d",
    label:  "text-warn",
    badge:  "border-warn/30 bg-warn/10 text-warn",
    locked: "border-warn/10 bg-warn/3 text-warn/30",
  },
  arena: {
    glow:   "rgba(255,79,79,0.08)",
    ring:   "#ff4f4f",
    label:  "text-danger",
    badge:  "border-danger/30 bg-danger/10 text-danger",
    locked: "border-danger/10 bg-danger/3 text-danger/30",
  },
};

const BEGINNER_MODULE_DEFS = [
  {
    id:            "mod_logic_gates",
    title:         "Logic Gates",
    description:   "AND, OR, NOT, XOR — the building blocks of digital design.",
    icon:          "⊕",
    prerequisites: [],
    xpToUnlock:    0,
  },
  {
    id:            "mod_combinational",
    title:         "Combinational Circuits",
    description:   "Circuits whose output depends only on current inputs.",
    icon:          "⊞",
    prerequisites: ["mod_logic_gates"],
    xpToUnlock:    50,
  },
  {
    id:            "mod_sequential_basics",
    title:         "Sequential Basics",
    description:   "Flip-flops and registers — circuits with memory.",
    icon:          "⊿",
    prerequisites: ["mod_combinational"],
    xpToUnlock:    100,
  },
];

const INTERMEDIATE_MODULE_DEFS = [
  {
    id:            "mod_latches",
    title:         "Latches",
    description:   "Level-sensitive storage: SR Latch and D Latch.",
    icon:          "⊡",
    prerequisites: [],
    xpToUnlock:    0,
  },
  {
    id:            "mod_flip_flops",
    title:         "Flip-Flops",
    description:   "Edge-triggered storage: SR, JK, D, and T flip-flops.",
    icon:          "⏚",
    prerequisites: ["mod_latches"],
    xpToUnlock:    100,
  },
  {
    id:            "mod_shift_registers",
    title:         "Shift Registers",
    description:   "SISO, SIPO, PISO, PIPO, bidirectional, and universal registers.",
    icon:          "⇄",
    prerequisites: ["mod_flip_flops"],
    xpToUnlock:    200,
  },
  {
    id:            "mod_sequential_design",
    title:         "Counters & Sequential Design",
    description:   "Synchronous counters, frequency dividers, and state machines.",
    icon:          "◑",
    prerequisites: ["mod_shift_registers"],
    xpToUnlock:    300,
  },
  {
    id:            "mod_flip_flops_ext",
    title:         "Flip-Flops Extended",
    description:   "Advanced flip-flop variants and configurations.",
    icon:          "⏛",
    prerequisites: ["mod_sequential_design"],
    xpToUnlock:    400,
  },
  {
    id:            "mod_sequential_utils",
    title:         "Sequential Utilities",
    description:   "Edge detectors, synchronizers, and pipeline utilities.",
    icon:          "⟳",
    prerequisites: ["mod_flip_flops_ext"],
    xpToUnlock:    500,
  },
  {
    id:            "mod_counters_advanced",
    title:         "Advanced Counters",
    description:   "Up/down, modulo, and Gray code counters.",
    icon:          "⊞",
    prerequisites: ["mod_sequential_utils"],
    xpToUnlock:    600,
  },
  {
    id:            "mod_memory",
    title:         "Memory Elements",
    description:   "RAM, ROM, FIFOs and memory-mapped designs.",
    icon:          "▦",
    prerequisites: ["mod_counters_advanced"],
    xpToUnlock:    700,
  },
];

const ADVANCED_MODULE_DEFS = [
  {
    id:            "mod_fsm_basics",
    title:         "Finite State Machines: The Control Fabric",
    description:   "Moore vs Mealy FSMs, sequence detection, state diagrams.",
    icon:          "⟳",
    prerequisites: ["mod_memory"],
    xpToUnlock:    800,
  },
  {
    id:            "mod_fsm_advanced",
    title:         "Complex FSM Systems: Protocol Controllers",
    description:   "SPI, I²C, arbiters, clock domain crossing, PWM.",
    icon:          "⚡",
    prerequisites: ["mod_fsm_basics"],
    xpToUnlock:    1000,
  },
  {
     id:            "mod_capstone",
     title:         "Capstone Problems: Interview Tier",
     prerequisites: ["mod_fsm_advanced"],
     xpToUnlock:    1200,
     description:   "Design a complete system from scratch, with multiple modules and FSMs.",
  },
];

// Helper to group flat problems into modules
function groupIntoModules(
  problems: Problem[],
  moduleDefinitions: any[],
): PathModule[] {
  return moduleDefinitions.map((def) => ({
    ...def,
    problems: problems
      .filter((p) => p.moduleId === def.id)
      .sort((a, b) => a.orderIndex - b.orderIndex),
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function ProblemCard({
  problem,
  progress,
}: {
  problem: Problem;
  progress: ProgressRecord | null;
}) {
  const diffColours: Record<string, string> = {
    beginner:     "text-phosphor border-phosphor/30",
    intermediate: "text-info border-info/30",
    advanced:     "text-warn border-warn/30",
    arena:        "text-danger border-danger/30",
  };
  const diffGlow: Record<string, string> = {
    beginner:     "hover:shadow-[0_8px_20px_rgba(0,0,0,.3),0_0_16px_rgba(0,232,122,.15)] hover:border-phosphor/30",
    intermediate: "hover:shadow-[0_8px_20px_rgba(0,0,0,.3),0_0_16px_rgba(77,184,255,.15)] hover:border-info/30",
    advanced:     "hover:shadow-[0_8px_20px_rgba(0,0,0,.3),0_0_16px_rgba(255,184,77,.15)] hover:border-warn/30",
    arena:        "hover:shadow-[0_8px_20px_rgba(0,0,0,.3),0_0_16px_rgba(255,79,79,.15)] hover:border-danger/30",
  };

  const solved = progress?.problems[problem.id]?.solved ?? false;

  return (
    <Link
      href={`/problems/${problem.slug}`}
      className={`group flex items-center gap-3 px-3 py-2.5 rounded-lg border border-rim/50 bg-pit/30 backdrop-blur-sm
                  transition-all duration-200 hover:bg-pit/60 hover:-translate-y-0.5 ${diffGlow[problem.difficulty] ?? "hover:border-muted"}`}
    >
      {/* Solved checkmark or order number */}
      <span
        className={`shrink-0 w-5 h-5 flex items-center justify-center rounded font-mono text-[9px] border transition-colors ${
          solved
            ? "bg-phosphor/20 text-phosphor border-phosphor/40 font-bold"
            : "text-dim border-rim/40"
        }`}
      >
        {solved ? "✓" : problem.orderIndex}
      </span>

      {/* Title */}
      <span className="flex-1 font-mono text-[11px] text-pale group-hover:text-bright transition-colors truncate">
        {problem.title}
      </span>

      {/* Category pill */}
      <span className="shrink-0 hidden sm:block font-mono text-[9px] text-dim bg-pit border border-rim/40 px-1.5 py-0.5 rounded">
        {problem.category.replace("_", " ")}
      </span>

      {/* Difficulty */}
      <span className={`shrink-0 font-mono text-[9px] border px-1.5 py-0.5 rounded-full uppercase tracking-wider ${diffColours[problem.difficulty] ?? "text-ghost border-rim"}`}>
        {problem.difficulty}
      </span>

      {/* XP */}
      <span className="shrink-0 font-mono text-[9px] text-dim">
        +{problem.xpReward} XP
      </span>

      {/* Arrow */}
      <svg viewBox="0 0 8 8" className="w-2 h-2 text-dim/40 group-hover:text-ghost transition-colors shrink-0 fill-none stroke-current" strokeWidth="1.2">
        <path d="M1 4h6M4 1l3 3-3 3" />
      </svg>
    </Link>
  );
}

function ModuleCard({
  module: mod,
  accent,
  locked,
  progress,
}: {
  module:  PathModule;
  accent:  string;
  locked:  boolean;
  progress: ProgressRecord | null;
}) {
  return (
    <div
      className={`rounded-xl border border-t-white/10 overflow-hidden backdrop-blur-md transition-all duration-200 ${
        locked ? "border-rim/30 bg-pit/20 opacity-50" : "border-rim/60 bg-pit/30"
      }`}
    >
      {/* Module header */}
      <div
        className="flex items-center gap-3 px-4 py-3 bg-pit/40 border-b border-rim/40"
        style={locked ? {} : { borderLeftWidth: 2, borderLeftColor: accent }}
      >
        <span className="text-lg shrink-0">{mod.icon || "⚙"}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] text-bright font-semibold">
              {mod.title}
            </span>
            {locked && (
              <span className="font-mono text-[9px] text-dim border border-rim/40 px-1.5 py-0.5 rounded-full uppercase">
                🔒 locked
              </span>
            )}
          </div>
          <p className="font-mono text-[10px] text-dim mt-0.5 truncate">
            {mod.description}
          </p>
        </div>
        <span className="shrink-0 font-mono text-[9px] text-dim tabular-nums">
          {mod.problems.length} problem{mod.problems.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Problems list */}
      {!locked && mod.problems.length > 0 && (
        <div className="px-3 py-2 space-y-1.5 bg-void/40">
          {mod.problems.map((p) => (
            <ProblemCard key={p.id} problem={p} progress={progress} />
          ))}
        </div>
      )}

      {!locked && mod.problems.length === 0 && (
        <div className="px-4 py-3 bg-void/30">
          <p className="font-mono text-[10px] text-dim">
            No questions in this module yet.
          </p>
        </div>
      )}

      {locked && (
        <div className="px-4 py-3 bg-void/30">
          <p className="font-mono text-[10px] text-dim">
            Complete prerequisite modules to unlock.
          </p>
        </div>
      )}
    </div>
  );
}

function LevelSection({ 
  level, 
  progress 
}: { 
  level: PathLevel; 
  progress: ProgressRecord | null; 
}) {
  const cfg      = LEVEL_CONFIG[level.difficulty] ?? LEVEL_CONFIG.beginner;
  const isArena  = level.difficulty === "arena";
  const isEmpty  = level.modules.length === 0;

  // Compute locked state of modules in this level based on progress
  const isModuleLocked = (mod: PathModule) => {
    if (!progress) return true;
    if (mod.xpToUnlock > progress.totalXp) return true;
    
    // Check prerequisites
    if (mod.prerequisites && mod.prerequisites.length > 0) {
      return !mod.prerequisites.every((prereqId: string) => {
        // Find module containing the prerequisite problems, verify they are solved
        // For simplicity, check if the module ID exists in user's unlockedModules progress
        return progress.unlockedModules.includes(prereqId);
      });
    }
    return false;
  };

  return (
    <section
      className="rounded-xl border border-rim/60 border-t-white/10 overflow-hidden backdrop-blur-md"
      style={{ boxShadow: `0 0 40px 0 ${LEVEL_CONFIG[level.difficulty]?.glow ?? "transparent"}` }}
    >
      {/* Level header */}
      <div className="px-6 py-5 bg-pit/40 border-b border-rim/60">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h2 className={`font-display text-[16px] font-bold ${cfg.label}`}>
                {level.title}
              </h2>
              {level.xpToUnlock > 0 && (
                <span className={`font-mono text-[9px] px-2 py-0.5 rounded-full border uppercase tracking-wider ${cfg.badge}`}>
                  {level.xpToUnlock} XP to unlock
                </span>
              )}
            </div>
            <p className="font-mono text-[10px] text-ghost/80 max-w-xl leading-relaxed">
              {level.description}
            </p>
          </div>

          {/* Waveform motif — purely decorative */}
          <svg
            viewBox="0 0 60 20"
            className="hidden md:block w-16 h-6 shrink-0 opacity-20"
            fill="none" stroke={level.accentColor} strokeWidth="1.2"
          >
            <polyline points="0,10 8,10 12,2 16,18 20,10 28,10 32,4 36,16 40,10 48,10 52,6 56,14 60,10" />
          </svg>
        </div>
      </div>

      {/* Modules */}
      <div className="px-5 py-4 space-y-3 bg-void/60">
        {isArena && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="font-mono text-4xl mb-3 text-danger/30">⚔</div>
            <h3 className="font-mono text-[14px] text-danger/60 font-bold mb-1">
              Arena Mode
            </h3>
            <p className="font-mono text-[10px] text-dim/60 max-w-xs leading-relaxed">
              Timed competitive challenges unlock after completing the Advanced tier.
              Ranking, contests, and leaderboards coming soon.
            </p>
            <div className="mt-4 font-mono text-[9px] text-danger/40 border border-danger/20 px-4 py-2 rounded">
              🔒 Locked until Advanced completion · 1,000 XP required
            </div>
          </div>
        )}

        {!isArena && isEmpty && (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="font-mono text-[10px] text-dim/50">
              Problems coming soon.
            </div>
          </div>
        )}

        {!isArena && level.modules.map((mod) => (
          <ModuleCard
            key={mod.id}
            module={mod}
            accent={level.accentColor}
            locked={isModuleLocked(mod)}
            progress={progress}
          />
        ))}
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function LearnPage() {
  const [questions, setQuestions] = useState<Problem[]>([]);
  const [progress, setProgress] = useState<ProgressRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"curriculum" | "roadmap">("curriculum");

  useEffect(() => {
    document.title = activeTab === "roadmap" ? "VLSI Career Roadmap — BitFlow" : "Learn — BitFlow";
    
    Promise.all([
      fetch("/api/problems").then((r) => r.json()),
      fetch("/api/progress").then((r) => r.json()),
    ])
      .then(([problemsData, progressData]) => {
        setQuestions(problemsData.problems || []);
        setProgress(progressData.progress || null);
      })
      .catch((err) => console.error("Error loading dynamic curriculum:", err))
      .finally(() => setLoading(false));
  }, [activeTab]);


  const beginnerQuestions = questions.filter(
  q => q.learningLevel === "Verilog Beginner"
);

const intermediateQuestions = questions.filter(
  q => q.learningLevel === "Verilog Intermediate"
);

const advancedQuestions = questions.filter(
  q => q.learningLevel === "Verilog Advanced"
);

  // Construct Level Path dynamically based on loaded questions
  const levels: PathLevel[] = [
    {
      id:          "lvl_beginner",
      title:       "Verilog Beginner",
      description: "Learn Verilog from scratch. Master gates, assign statements, and your first flip-flop.",
      difficulty:  "beginner",
      accentColor: "#00e87a",
      xpToUnlock:  0,
      modules:     groupIntoModules(beginnerQuestions, BEGINNER_MODULE_DEFS),
    },
    {
      id:          "lvl_intermediate",
      title:       "Verilog Intermediate",
      description: "Build real circuits: adders, counters, state machines, and parameterized modules.",
      difficulty:  "intermediate",
      accentColor: "#4db8ff",
      xpToUnlock:  200,
      modules:     groupIntoModules(intermediateQuestions, INTERMEDIATE_MODULE_DEFS),
    },
    {
      id:          "lvl_advanced",
      title:       "Verilog Advanced",
      description: "RTL design, pipelining, timing analysis, and synthesis-ready code.",
      difficulty:  "advanced",
      accentColor: "#ffb84d",
      xpToUnlock:  500,
      modules:     groupIntoModules(advancedQuestions, ADVANCED_MODULE_DEFS),
    },
    {
      id:          "lvl_arena",
      title:       "Verilog Advanced", // mapping difficulty
      description: "Timed challenges and competitive problems. Unlock after completing Advanced.",
      difficulty:  "arena",
      accentColor: "#ff4f4f",
      xpToUnlock:  1000,
      modules:     [],
    },
  ];

  return (
    <AuthGate>
    <div className="min-h-screen bg-void text-bright flex flex-col">
      <ScrollUnlock />
      
      {/* Nav */}
      <header className="sticky top-0 z-10 h-14 flex items-center justify-between px-6 bg-void/70 border-b border-rim/50 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2 group">
            <img
              src="/bitflow_logo_64.png"
              alt="BitFlow"
              className="w-6 h-6 object-contain rounded opacity-80 group-hover:opacity-100 transition-opacity"
            />
            <span className="font-display text-[13px] font-bold text-bright">BitFlow</span>
          </Link>
          <span className="text-rim">·</span>
          <span className="font-mono text-[11px] text-ghost">Learning Path</span>
        </div>

        <div className="flex items-center gap-5 font-mono text-[11px]">
          {progress && (
            <div className="text-[11px] text-phosphor bg-phosphor/10 border border-phosphor/25 backdrop-blur-md rounded-full px-3 py-1">
              🏆 {progress.totalXp} XP
            </div>
          )}
          <Link href="/dashboard" className="text-ghost hover:text-bright transition-colors">
            Dashboard
          </Link>
          <Link href="/sandbox" className="text-ghost hover:text-bright transition-colors">
            Sandbox
          </Link>
          <Link href="/arena" className="text-ghost hover:text-bright transition-colors">
            Arena
          </Link>
          <Link href="/academy" className="text-ghost hover:text-bright transition-colors">
            Academy
          </Link>
        </div>
      </header>

      {/* Hero */}
      <div className="relative px-6 py-10 border-b border-rim/30">
        <div
          className="absolute inset-0 pointer-events-none opacity-60"
          style={{ background: "radial-gradient(ellipse 60% 40% at 50% 0%, rgba(0,232,122,.06), transparent 60%)" }}
        />
        <div className="relative max-w-4xl mx-auto flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-3 max-w-xl">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] text-phosphor uppercase tracking-widest border border-phosphor/25 bg-phosphor/10 backdrop-blur-md px-3 py-1 rounded-full">
                ECE Industry Blueprint
              </span>
            </div>
            <h1 className="font-serif text-[30px] md:text-[34px] text-bright leading-tight">
              Master Digital Systems &amp; <br />
              <span className="text-phosphor">VLSI Chip Architecture.</span>
            </h1>
            <p className="font-mono text-[12px] text-ghost leading-relaxed">
              Explore structured problem-solving modules or map out your exact career path across RTL Design, Verification, DFT, and Physical Layout.
            </p>
          </div>

          {/* View Switcher Tabs */}
          <div className="flex items-center gap-1.5 p-1.5 rounded-xl border border-rim/60 bg-pit/50 backdrop-blur-md shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab("curriculum")}
              className={`font-mono text-[11px] px-4 py-2 rounded-lg border transition-all ${
                activeTab === "curriculum"
                  ? "bg-phosphor/15 border-phosphor/40 text-phosphor font-bold shadow-[0_0_15px_rgba(0,232,122,0.2)]"
                  : "bg-transparent border-transparent text-dim hover:text-bright"
              }`}
            >
              📚 Curriculum Path
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("roadmap")}
              className={`font-mono text-[11px] px-4 py-2 rounded-lg border transition-all ${
                activeTab === "roadmap"
                  ? "bg-phosphor/15 border-phosphor/40 text-phosphor font-bold shadow-[0_0_15px_rgba(0,232,122,0.2)]"
                  : "bg-transparent border-transparent text-dim hover:text-bright"
              }`}
            >
              🗺️ VLSI Career Roadmap
            </button>
          </div>
        </div>
      </div>

      {/* Main layout */}
      <main className="max-w-5xl w-full mx-auto px-6 py-8 flex-1">
        {activeTab === "curriculum" ? (
          loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-8 h-8 rounded border-2 border-t-phosphor border-rim animate-spin mb-4" />
              <p className="font-mono text-[11px] text-dim">Loading curriculum schema registry...</p>
            </div>
          ) : (
            <div className="space-y-8 animate-pulse_once max-w-4xl mx-auto">
              {levels.map((level) => (
                <LevelSection key={level.id} level={level} progress={progress} />
              ))}
            </div>
          )
        ) : (
          <VLSIRoadmap />
        )}
      </main>

      {/* Footer */}
      <footer className="px-6 py-6 border-t border-rim/30 text-center mt-auto">
        <p className="font-mono text-[10px] text-dim">
          BitFlow · Verilog Sandbox + Problem Arena
          <span className="mx-2">·</span>
          Icarus Verilog · GTKWave-style waveforms
        </p>
      </footer>
    </div>
    </AuthGate>
  );
}