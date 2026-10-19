"use client";

import React, { useState, useEffect } from "react";
import ReferenceSolutionsAdmin from "@/components/ReferenceSolutionsAdmin";
import Link from "next/link";
import { useAuth } from "../../hooks/useAuth";

interface QuestionSummary {
  id: string;
  slug: string;
  title: string;
  difficulty: string;
  category: string;
  moduleId: string;
  orderIndex: number;
  xpReward: number;
}

interface UserSummary {
  id: string;
  username: string;
  role: string;
  createdAt: string;
  _count: {
    progress: number;
    submissions: number;
  };
}

interface DbHealth {
  bootId: string;
  bootedAt: string;
  databaseUrl: string | null;
  usingRenderDisk: boolean;
  counts: {
    users: number;
    submissions: number;
    progress: number;
    questions: number;
  };
  firstUser: { username: string; createdAt: string } | null;
  latestUser: { username: string; createdAt: string } | null;
  latestSubmission: { id: string; createdAt: string; accepted: boolean } | null;
}

export default function AdminDashboard() {
  const { user } = useAuth();
  
  // State for fetching list of questions & analytics
  const [questions, setQuestions] = useState<QuestionSummary[]>([]);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [totalSubmissions, setTotalSubmissions] = useState(0);
  const [dbHealth, setDbHealth] = useState<DbHealth | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingUsers, setLoadingUsers] = useState(true);
  
  // Form State
  const [id, setId] = useState("");
  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");
  const [difficulty, setDifficulty] = useState("beginner");
  const [category, setCategory] = useState("combinational");
  const [learningLevel, setLearningLevel] = useState("Verilog Beginner");
  const [moduleId, setModuleId] = useState("mod_logic_gates");
  const [orderIndex, setOrderIndex] = useState("10");
  const [statement, setStatement] = useState("");
  const [starterCode, setStarterCode] = useState("");
  const [publicTestbench, setPublicTestbench] = useState("");
  const [hiddenTestbench, setHiddenTestbench] = useState("");
  const [expectedOutputMode, setExpectedOutputMode] = useState("stdout_compare");
  const [waveformRequired, setWaveformRequired] = useState(false);
  const [xpReward, setXpReward] = useState("30");
  const [tags, setTags] = useState("");
  
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const fetchQuestions = async () => {
    try {
      setLoadingList(true);
      const res = await fetch("/api/problems");
      const data = await res.json();
      if (res.ok) {
        setQuestions(data.problems ?? data.questions ?? []);
      }
    } catch (err) {
      console.error("Failed to load questions list:", err);
    } finally {
      setLoadingList(false);
    }
  };

  const fetchUsers = async () => {
    try {
      setLoadingUsers(true);
      const res = await fetch("/api/admin/users");
      const data = await res.json();
      if (res.ok) {
        setUsers(data.users ?? []);
        setTotalUsers(data.totalUsers ?? 0);
        setTotalSubmissions(data.totalSubmissions ?? 0);
      }
    } catch (err) {
      console.error("Failed to load user list:", err);
    } finally {
      setLoadingUsers(false);
    }
  };

  const fetchDbHealth = async () => {
    try {
      const res = await fetch("/api/admin/db-health");
      const data = await res.json();
      if (res.ok) {
        setDbHealth(data);
      }
    } catch (err) {
      console.error("Failed to load DB health:", err);
    }
  };

  useEffect(() => {
    fetchQuestions();
    fetchUsers();
    fetchDbHealth();
  }, []);

  const handleAddQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setSubmitSuccess(null);
    setSubmitting(true);

    try {
      const parsedTags = tags.split(",").map(t => t.trim()).filter(Boolean);
      
      const payload = {
        id,
        slug,
        title,
        difficulty,
        category,
        tags: parsedTags,
        learningLevel,
        moduleId,
        orderIndex: parseInt(orderIndex) || 1,
        statement,
        starterCode,
        publicTestbench,
        hiddenTestbench: hiddenTestbench || null,
        expectedOutputMode,
        waveformRequired,
        xpReward: parseInt(xpReward) || 10,
        hiddenTestcases: [],
        publicTestcases: [],
        constraints: [],
        examples: [],
        hints: [],
      };

      const res = await fetch("/api/problems", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (res.ok) {
        setSubmitSuccess(`Question "${title}" created successfully!`);
        setId("");
        setSlug("");
        setTitle("");
        setStatement("");
        setStarterCode("");
        setPublicTestbench("");
        setHiddenTestbench("");
        setTags("");
        setOrderIndex(String(Number(orderIndex) + 1));
        fetchQuestions();
      } else {
        setSubmitError(data.error || "Failed to create question");
      }
    } catch (err) {
      setSubmitError("Network error occurred while submitting.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleTitleChange = (val: string) => {
    setTitle(val);
    setSlug(val.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""));
    setId(val.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""));
  };

  const totalQuestions = questions.length;
  
  const difficultyCounts = questions.reduce((acc, q) => {
    acc[q.difficulty] = (acc[q.difficulty] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const categoryCounts = questions.reduce((acc, q) => {
    acc[q.category] = (acc[q.category] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const avgXpReward = totalQuestions > 0 
    ? Math.round(questions.reduce((sum, q) => sum + q.xpReward, 0) / totalQuestions) 
    : 0;

  return (
    <div className="min-h-screen bg-void text-bright font-mono flex flex-col">
      {/* Sticky Header */}
      <header className="sticky top-0 z-20 h-12 flex items-center justify-between px-6 bg-surface/90 border-b border-rim backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2 group">
            <span className="font-display text-[13px] font-bold text-bright">BitFlow</span>
          </Link>
          <span className="text-rim">·</span>
          <span className="font-mono text-[11px] text-info uppercase tracking-widest bg-info/10 border border-info/20 px-2 py-0.5 rounded">
            Admin Console
          </span>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-[10px] text-ghost">Operator: <strong className="text-info">{user?.username || "Loading..."}</strong></span>
          <Link
            href="/"
            className="font-mono text-[10px] text-dim hover:text-ghost border border-rim/60 hover:border-rim px-2 py-1 rounded transition-colors"
          >
            ← Exit Console
          </Link>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8 min-h-0">
        
        {/* Left: Question Form */}
        <section className="lg:col-span-7 bg-surface/30 border border-rim/50 rounded-lg p-6 flex flex-col shadow-lg">
          <div className="border-b border-rim/40 pb-3 mb-6">
            <h2 className="text-[15px] font-bold text-info flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-info animate-pulse" />
              INJECT NEW CHALLENGE
            </h2>
            <p className="text-[10px] text-dim/80 mt-1">
              Construct a new curriculum problem and sync it directly to the system registry.
            </p>
          </div>

          <form onSubmit={handleAddQuestion} className="space-y-4 overflow-y-auto pr-1 flex-1">
            {/* Row 1: Title & Slug */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[9px] text-dim uppercase mb-1">Question Title</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => handleTitleChange(e.target.value)}
                  placeholder="e.g. 4-bit Ripple Carry Adder"
                  className="w-full bg-pit border border-rim/60 rounded px-3 py-1.5 text-[11px] text-bright placeholder-dim/30 focus:outline-none focus:border-info/60 transition-colors"
                />
              </div>
              <div>
                <label className="block text-[9px] text-dim uppercase mb-1">Slug / Unique ID</label>
                <input
                  type="text"
                  required
                  value={slug}
                  onChange={(e) => {
                    setSlug(e.target.value);
                    setId(e.target.value);
                  }}
                  placeholder="4-bit-ripple-adder"
                  className="w-full bg-pit border border-rim/60 rounded px-3 py-1.5 text-[11px] text-bright placeholder-dim/30 focus:outline-none focus:border-info/60 transition-colors"
                />
              </div>
            </div>

            {/* Row 2: Difficulty & Category */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-[9px] text-dim uppercase mb-1">Difficulty</label>
                <select
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value)}
                  className="w-full bg-pit border border-rim/60 rounded px-3 py-1.5 text-[11px] text-bright focus:outline-none focus:border-info/60"
                >
                  <option value="beginner">Beginner</option>
                  <option value="intermediate">Intermediate</option>
                  <option value="advanced">Advanced</option>
                  <option value="arena">Arena</option>
                </select>
              </div>
              <div>
                <label className="block text-[9px] text-dim uppercase mb-1">Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full bg-pit border border-rim/60 rounded px-3 py-1.5 text-[11px] text-bright focus:outline-none focus:border-info/60"
                >
                  <option value="combinational">Combinational</option>
                  <option value="sequential">Sequential</option>
                  <option value="state_machine">State Machine</option>
                  <option value="memory">Memory</option>
                  <option value="arithmetic">Arithmetic</option>
                  <option value="pipeline">Pipeline</option>
                  <option value="verification">Verification</option>
                </select>
              </div>
              <div>
                <label className="block text-[9px] text-dim uppercase mb-1">Expected Mode</label>
                <select
                  value={expectedOutputMode}
                  onChange={(e) => setExpectedOutputMode(e.target.value)}
                  className="w-full bg-pit border border-rim/60 rounded px-3 py-1.5 text-[11px] text-bright focus:outline-none focus:border-info/60"
                >
                  <option value="stdout_compare">Stdout Compare</option>
                  <option value="signal_compare">Signal Compare (FSM)</option>
                </select>
              </div>
            </div>

            {/* Row 3: Curriculum Mapping */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="md:col-span-2">
                <label className="block text-[9px] text-dim uppercase mb-1">Learning Level</label>
                <select
                  value={learningLevel}
                  onChange={(e) => setLearningLevel(e.target.value)}
                  className="w-full bg-pit border border-rim/60 rounded px-3 py-1.5 text-[11px] text-bright focus:outline-none focus:border-info/60"
                >
                  <option value="Verilog Beginner">Verilog Beginner</option>
                  <option value="Verilog Intermediate">Verilog Intermediate</option>
                  <option value="Verilog Advanced">Verilog Advanced</option>
                </select>
              </div>
              <div>
                <label className="block text-[9px] text-dim uppercase mb-1">Module ID</label>
                <input
                  type="text"
                  required
                  value={moduleId}
                  onChange={(e) => setModuleId(e.target.value)}
                  placeholder="mod_logic_gates"
                  className="w-full bg-pit border border-rim/60 rounded px-3 py-1.5 text-[11px] text-bright focus:outline-none focus:border-info/60"
                />
              </div>
              <div>
                <label className="block text-[9px] text-dim uppercase mb-1">Order Index</label>
                <input
                  type="number"
                  required
                  value={orderIndex}
                  onChange={(e) => setOrderIndex(e.target.value)}
                  className="w-full bg-pit border border-rim/60 rounded px-3 py-1.5 text-[11px] text-bright focus:outline-none focus:border-info/60"
                />
              </div>
            </div>

            {/* Row 4: XP, Tags, Waveform */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-[9px] text-dim uppercase mb-1">XP Reward</label>
                <input
                  type="number"
                  required
                  value={xpReward}
                  onChange={(e) => setXpReward(e.target.value)}
                  className="w-full bg-pit border border-rim/60 rounded px-3 py-1.5 text-[11px] text-bright focus:outline-none focus:border-info/60"
                />
              </div>
              <div>
                <label className="block text-[9px] text-dim uppercase mb-1">Tags (comma-separated)</label>
                <input
                  type="text"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  placeholder="adder, gates, sum"
                  className="w-full bg-pit border border-rim/60 rounded px-3 py-1.5 text-[11px] text-bright focus:outline-none focus:border-info/60"
                />
              </div>
              <div className="flex items-center pt-5">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={waveformRequired}
                    onChange={(e) => setWaveformRequired(e.target.checked)}
                    className="rounded bg-pit border-rim/60 text-info focus:ring-0 w-4 h-4"
                  />
                  <span className="text-[10px] text-dim uppercase">Waveform Required</span>
                </label>
              </div>
            </div>

            {/* Statement */}
            <div>
              <label className="block text-[9px] text-dim uppercase mb-1">Problem Statement (Markdown)</label>
              <textarea
                required
                rows={4}
                value={statement}
                onChange={(e) => setStatement(e.target.value)}
                placeholder="## Problem description..."
                className="w-full bg-pit border border-rim/60 rounded px-3 py-2 font-mono text-[11px] text-bright placeholder-dim/30 focus:outline-none focus:border-info/60 transition-colors resize-y"
              />
            </div>

            {/* Code Editors */}
            <div className="space-y-4">
              <div>
                <label className="block text-[9px] text-dim uppercase mb-1">Starter Code (design.v)</label>
                <textarea
                  required
                  rows={4}
                  value={starterCode}
                  onChange={(e) => setStarterCode(e.target.value)}
                  placeholder="module half_adder ( ... );"
                  className="w-full bg-pit border border-rim/60 rounded px-3 py-2 font-mono text-[11px] text-bright focus:outline-none focus:border-info/60 resize-y"
                />
              </div>

              <div>
                <label className="block text-[9px] text-dim uppercase mb-1">Public Testbench (tb.v)</label>
                <textarea
                  required
                  rows={4}
                  value={publicTestbench}
                  onChange={(e) => setPublicTestbench(e.target.value)}
                  placeholder="module tb_half_adder;"
                  className="w-full bg-pit border border-rim/60 rounded px-3 py-2 font-mono text-[11px] text-bright focus:outline-none focus:border-info/60 resize-y"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-[9px] text-dim uppercase">Hidden Testbench (Evaluator)</label>
                  <span className="text-[8px] text-dim/60">Must print "ALL TESTS PASSED" on success.</span>
                </div>
                <textarea
                  rows={4}
                  value={hiddenTestbench}
                  onChange={(e) => setHiddenTestbench(e.target.value)}
                  placeholder="module tb_half_adder_hidden; // runs sequentially on submit"
                  className="w-full bg-pit border border-rim/60 rounded px-3 py-2 font-mono text-[11px] text-bright focus:outline-none focus:border-info/60 resize-y"
                />
              </div>
            </div>

            {/* Error / Success Notifications */}
            {submitError && (
              <div className="p-3 bg-danger/10 border border-danger/30 rounded text-danger text-[10px]">
                ❌ SUBMISSION ERROR: {submitError}
              </div>
            )}
            {submitSuccess && (
              <div className="p-3 bg-phosphor/10 border border-phosphor/30 rounded text-phosphor text-[10px]">
                🚀 INJECTION COMPLETED: {submitSuccess}
              </div>
            )}

            {/* Submit Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 rounded font-mono text-[12px] font-semibold tracking-wider uppercase border border-info/60 bg-info/10 text-info hover:bg-info/20 disabled:opacity-40 select-none transition-all duration-150 active:scale-[0.99]"
              >
                {submitting ? "Compiling & Storing..." : "Inject to Database"}
              </button>
            </div>
          </form>
        </section>

        {/* Right: Analytics */}
        <section className="lg:col-span-5 flex flex-col gap-6 min-h-0">
          
          {/* Analytics Summary */}
          <div className="bg-surface/30 border border-rim/50 rounded-lg p-6 shadow-lg">
            <div className="border-b border-rim/40 pb-3 mb-4">
              <h2 className="text-[13px] font-bold text-info uppercase">
                Question Pattern Analytics
              </h2>
              <p className="text-[9px] text-dim/80">
                Analyze structured curriculum coverage and load balance.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-pit/40 border border-rim/30 rounded p-3">
                <span className="block text-[8px] text-dim uppercase">Total Challenges</span>
                <span className="text-2xl font-bold text-bright">{totalQuestions}</span>
              </div>
              <div className="bg-pit/40 border border-rim/30 rounded p-3">
                <span className="block text-[8px] text-dim uppercase">Average XP Reward</span>
                <span className="text-2xl font-bold text-info">{avgXpReward} XP</span>
              </div>
              <div className="bg-pit/40 border border-rim/30 rounded p-3">
                <span className="block text-[8px] text-dim uppercase">Registered Users</span>
                <span className="text-2xl font-bold text-phosphor">{totalUsers}</span>
              </div>
              <div className="bg-pit/40 border border-rim/30 rounded p-3">
                <span className="block text-[8px] text-dim uppercase">Saved Submissions</span>
                <span className="text-2xl font-bold text-warn">{totalSubmissions}</span>
              </div>
            </div>

            <div className="mb-6 rounded border border-rim/40 bg-pit/25 p-3">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div>
                  <h3 className="text-[10px] font-bold text-info uppercase tracking-wider">
                    LLM Training Exports
                  </h3>
                  <p className="text-[8px] text-dim/80 mt-1">
                    Admin-only downloads. Passwords are never exported.
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <a
                  href="/api/admin/export?dataset=submissions&format=jsonl"
                  download
                  className="text-center rounded border border-phosphor/30 bg-phosphor/5 px-3 py-2 text-[9px] text-phosphor hover:bg-phosphor/10 transition-colors"
                >
                  Submissions JSONL
                </a>
                <a
                  href="/api/admin/export?dataset=submissions&format=json"
                  download
                  className="text-center rounded border border-info/30 bg-info/5 px-3 py-2 text-[9px] text-info hover:bg-info/10 transition-colors"
                >
                  Submissions JSON
                </a>
                <a
                  href="/api/admin/export?dataset=all&format=json"
                  download
                  className="text-center rounded border border-warn/30 bg-warn/5 px-3 py-2 text-[9px] text-warn hover:bg-warn/10 transition-colors"
                >
                  Full Data JSON
                </a>
                <a
                  href="/api/admin/export?dataset=submissions&format=jsonl&includeWaveforms=true"
                  download
                  className="text-center rounded border border-rim/70 bg-surface/50 px-3 py-2 text-[9px] text-ghost hover:text-pale hover:border-rim transition-colors"
                >
                  JSONL + Waveforms
                </a>
              </div>
            </div>

            {/* Difficulty Chart */}
            <div className="space-y-3 mb-6">
              <span className="block text-[9px] text-dim uppercase tracking-wider">Difficulty Pattern</span>
              
              {["beginner", "intermediate", "advanced", "arena"].map((diff) => {
                const count = difficultyCounts[diff] || 0;
                const percent = totalQuestions > 0 ? (count / totalQuestions) * 100 : 0;
                const colors: Record<string, string> = {
                  beginner: "bg-phosphor border-phosphor",
                  intermediate: "bg-info border-info",
                  advanced: "bg-warn border-warn",
                  arena: "bg-danger border-danger",
                };
                return (
                  <div key={diff} className="space-y-1">
                    <div className="flex justify-between text-[10px]">
                      <span className="capitalize text-ghost">{diff}</span>
                      <span className="text-bright font-bold">{count} ({Math.round(percent)}%)</span>
                    </div>
                    <div className="w-full bg-pit h-2 rounded overflow-hidden border border-rim/30">
                      <div
                        className={`h-full ${colors[diff] || "bg-ghost"}`}
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Category Chart */}
            <div className="space-y-3">
              <span className="block text-[9px] text-dim uppercase tracking-wider">Category Pattern</span>
              
              <div className="max-h-[160px] overflow-y-auto pr-1 space-y-2.5">
                {Object.entries(categoryCounts).map(([cat, count]) => {
                  const percent = totalQuestions > 0 ? (count / totalQuestions) * 100 : 0;
                  return (
                    <div key={cat} className="space-y-0.5">
                      <div className="flex justify-between text-[9px]">
                        <span className="capitalize text-dim/80">{cat.replace("_", " ")}</span>
                        <span className="text-ghost">{count}</span>
                      </div>
                      <div className="w-full bg-pit h-1.5 rounded overflow-hidden">
                        <div
                          className="h-full bg-info/60"
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Beta User Visibility */}
          <div className="bg-surface/30 border border-rim/50 rounded-lg p-6 shadow-lg">
            <div className="border-b border-rim/40 pb-3 mb-4">
              <h2 className="text-[13px] font-bold text-info uppercase">
                Recent Beta Users ({totalUsers})
              </h2>
              <p className="text-[9px] text-dim/80">
                Confirms registration, progress, and submission records are reaching the database.
              </p>
            </div>

            {loadingUsers ? (
              <div className="py-6 text-center text-[10px] text-dim animate-pulse">
                Reading user registry...
              </div>
            ) : users.length === 0 ? (
              <div className="py-6 text-center text-[10px] text-dim">
                No users found in this database.
              </div>
            ) : (
              <div className="max-h-[220px] overflow-y-auto pr-1 space-y-2">
                {users.map((u) => (
                  <div
                    key={u.id}
                    className="flex items-center justify-between p-2 rounded bg-pit/20 border border-rim/30"
                  >
                    <div className="min-w-0">
                      <span className="block text-[11px] text-pale font-bold truncate">
                        {u.username}
                      </span>
                      <span className="block text-[8px] text-dim/60 mt-0.5">
                        {new Date(u.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <div className="text-right shrink-0 ml-4">
                      <span className="block text-[8px] text-info uppercase">{u.role}</span>
                      <span className="block text-[8px] text-dim/70">
                        {u._count.submissions} submits · {u._count.progress} progress
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Database Health */}
          <div className="bg-surface/30 border border-rim/50 rounded-lg p-6 shadow-lg">
            <div className="border-b border-rim/40 pb-3 mb-4">
              <h2 className="text-[13px] font-bold text-info uppercase">
                Database Health
              </h2>
              <p className="text-[9px] text-dim/80">
                Confirms whether the live service is using persistent storage.
              </p>
            </div>

            {!dbHealth ? (
              <div className="py-4 text-center text-[10px] text-dim animate-pulse">
                Checking database runtime...
              </div>
            ) : (
              <div className="space-y-3">
                <div className={[
                  "rounded border px-3 py-2 text-[10px]",
                  dbHealth.usingRenderDisk
                    ? "border-phosphor/30 bg-phosphor/5 text-phosphor"
                    : "border-danger/30 bg-danger/10 text-danger",
                ].join(" ")}>
                  {dbHealth.usingRenderDisk
                    ? "Persistent Render disk detected"
                    : "Not using /var/data persistent disk"}
                </div>

                <div className="grid grid-cols-2 gap-2 text-[9px]">
                  <div className="rounded border border-rim/30 bg-pit/30 p-2">
                    <span className="block text-dim uppercase">DB URL</span>
                    <span className="block text-ghost break-all">{dbHealth.databaseUrl ?? "not set"}</span>
                  </div>
                  <div className="rounded border border-rim/30 bg-pit/30 p-2">
                    <span className="block text-dim uppercase">Boot ID</span>
                    <span className="block text-ghost">{dbHealth.bootId}</span>
                  </div>
                  <div className="rounded border border-rim/30 bg-pit/30 p-2">
                    <span className="block text-dim uppercase">Booted</span>
                    <span className="block text-ghost">{new Date(dbHealth.bootedAt).toLocaleString()}</span>
                  </div>
                  <div className="rounded border border-rim/30 bg-pit/30 p-2">
                    <span className="block text-dim uppercase">Rows</span>
                    <span className="block text-ghost">
                      U:{dbHealth.counts.users} S:{dbHealth.counts.submissions} P:{dbHealth.counts.progress}
                    </span>
                  </div>
                </div>

                <div className="text-[9px] text-dim/80 leading-relaxed">
                  First user:{" "}
                  <span className="text-ghost">
                    {dbHealth.firstUser
                      ? `${dbHealth.firstUser.username} (${new Date(dbHealth.firstUser.createdAt).toLocaleString()})`
                      : "none"}
                  </span>
                  <br />
                  Latest user:{" "}
                  <span className="text-ghost">
                    {dbHealth.latestUser
                      ? `${dbHealth.latestUser.username} (${new Date(dbHealth.latestUser.createdAt).toLocaleString()})`
                      : "none"}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Questions List */}
          <div className="bg-surface/30 border border-rim/50 rounded-lg p-6 flex-1 flex flex-col shadow-lg min-h-0">
            <div className="border-b border-rim/40 pb-3 mb-4">
              <h2 className="text-[13px] font-bold text-info uppercase">
                Active Registry ({totalQuestions})
              </h2>
            </div>

            {loadingList ? (
              <div className="flex-1 flex items-center justify-center text-[10px] text-dim animate-pulse">
                Accessing registry database...
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto pr-1 space-y-2">
                {questions.map((q) => {
                  const diffColors: Record<string, string> = {
                    beginner: "text-phosphor border-phosphor/20 bg-phosphor/5",
                    intermediate: "text-info border-info/20 bg-info/5",
                    advanced: "text-warn border-warn/20 bg-warn/5",
                    arena: "text-danger border-danger/20 bg-danger/5",
                  };
                  return (
                    <div
                      key={q.id}
                      className="flex items-center justify-between p-2 rounded bg-pit/20 border border-rim/30 hover:bg-pit/40 transition-colors"
                    >
                      <div className="min-w-0">
                        <span className="block text-[11px] text-pale font-bold truncate">
                          {q.title}
                        </span>
                        <span className="block text-[8px] text-dim/60 mt-0.5">
                          ID: {q.id} · Module: {q.moduleId} · Order: {q.orderIndex}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 ml-4">
                        <span className={`text-[8px] border px-1.5 py-0.5 rounded uppercase tracking-wider ${diffColors[q.difficulty] || "text-ghost border-rim"}`}>
                          {q.difficulty}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <section className="lg:col-span-12 bg-surface/30 border border-rim/50 rounded-lg p-6 shadow-lg">
          <ReferenceSolutionsAdmin />
        </section>

      </main>
    </div>
  );
}
