"use client";
/**
 * components/admin/NewProblemForm.tsx — create a curriculum problem (POST /api/problems).
 * Moved out of the old single-page admin console; same fields and payload.
 */
import { useState, type ReactNode } from "react";

const input = "w-full bg-pit border border-rim/60 rounded px-3 py-1.5 text-[11px] text-bright placeholder-dim/30 focus:outline-none focus:border-info/60";
const code  = `${input} font-mono py-2 resize-y`;

function Field({ label, hint, children, className = "" }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="flex justify-between text-[9px] text-dim uppercase mb-1">{label}{hint && <span className="normal-case text-dim/60">{hint}</span>}</span>
      {children}
    </label>
  );
}

const toSlug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

export default function NewProblemForm({ onCreated }: { onCreated?: () => void }) {
  const [f, setF] = useState({
    title: "", slug: "", difficulty: "beginner", category: "combinational", expectedOutputMode: "stdout_compare",
    learningLevel: "Verilog Beginner", moduleId: "mod_logic_gates", orderIndex: "10", xpReward: "30", tags: "",
    waveformRequired: false, statement: "", starterCode: "", publicTestbench: "", hiddenTestbench: "",
  });
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF((v) => ({ ...v, [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setStatus(null);
    try {
      const res = await fetch("/api/problems", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: f.slug, slug: f.slug, title: f.title, difficulty: f.difficulty, category: f.category,
          tags: f.tags.split(",").map((t) => t.trim()).filter(Boolean),
          learningLevel: f.learningLevel, moduleId: f.moduleId, orderIndex: parseInt(f.orderIndex) || 1,
          statement: f.statement, starterCode: f.starterCode, publicTestbench: f.publicTestbench,
          hiddenTestbench: f.hiddenTestbench || null, expectedOutputMode: f.expectedOutputMode,
          waveformRequired: f.waveformRequired, xpReward: parseInt(f.xpReward) || 10,
          hiddenTestcases: [], publicTestcases: [], constraints: [], examples: [], hints: [],
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      setStatus({ ok: true, text: `Created "${f.title}". Next: upload its reference solution below.` });
      setF((v) => ({ ...v, title: "", slug: "", statement: "", starterCode: "", publicTestbench: "", hiddenTestbench: "", tags: "",
                     orderIndex: String((parseInt(v.orderIndex) || 0) + 1) }));
      onCreated?.();
    } catch (err) {
      setStatus({ ok: false, text: (err as Error).message || "Network error." });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Title"><input required className={input} value={f.title} placeholder="4-bit Ripple Carry Adder"
          onChange={(e) => setF((v) => ({ ...v, title: e.target.value, slug: toSlug(e.target.value) }))} /></Field>
        <Field label="Slug (also the id)"><input required className={input} value={f.slug} onChange={set("slug")} placeholder="4-bit-ripple-adder" /></Field>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Field label="Difficulty"><select className={input} value={f.difficulty} onChange={set("difficulty")}>
          {["beginner", "intermediate", "advanced", "arena"].map((d) => <option key={d} value={d}>{d}</option>)}</select></Field>
        <Field label="Category"><select className={input} value={f.category} onChange={set("category")}>
          {["combinational", "sequential", "state_machine", "memory", "arithmetic", "pipeline", "systemverilog", "riscv", "verification"].map((c) =>
            <option key={c} value={c}>{c.replace("_", " ")}</option>)}</select></Field>
        <Field label="Grading"><select className={input} value={f.expectedOutputMode} onChange={set("expectedOutputMode")}>
          <option value="stdout_compare">Stdout compare</option><option value="signal_compare">Signal compare</option></select></Field>
        <Field label="Level"><select className={input} value={f.learningLevel} onChange={set("learningLevel")}>
          {["Verilog Beginner", "Verilog Intermediate", "Verilog Advanced"].map((l) => <option key={l}>{l}</option>)}</select></Field>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 items-end">
        <Field label="Module id" className="col-span-2"><input required className={input} value={f.moduleId} onChange={set("moduleId")} /></Field>
        <Field label="Order"><input type="number" required className={input} value={f.orderIndex} onChange={set("orderIndex")} /></Field>
        <Field label="XP"><input type="number" required className={input} value={f.xpReward} onChange={set("xpReward")} /></Field>
        <label className="flex items-center gap-2 text-[10px] text-dim pb-2">
          <input type="checkbox" checked={f.waveformRequired} onChange={set("waveformRequired")} /> Waveform required
        </label>
      </div>
      <Field label="Tags" hint="comma-separated"><input className={input} value={f.tags} onChange={set("tags")} placeholder="adder, carry" /></Field>
      <Field label="Statement" hint="Markdown"><textarea required rows={5} className={code} value={f.statement} onChange={set("statement")} /></Field>
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Field label="Starter code (design.v)"><textarea required rows={8} className={code} value={f.starterCode} onChange={set("starterCode")} /></Field>
        <Field label="Public testbench (tb.v)"><textarea required rows={8} className={code} value={f.publicTestbench} onChange={set("publicTestbench")} /></Field>
        <Field label="Hidden testbench" hint={'prints "ALL TESTS PASSED"'}><textarea rows={8} className={code} value={f.hiddenTestbench} onChange={set("hiddenTestbench")} /></Field>
      </div>
      {status && (
        <p className={`p-3 rounded border text-[10px] ${status.ok ? "border-phosphor/30 bg-phosphor/10 text-phosphor" : "border-danger/30 bg-danger/10 text-danger"}`}>{status.text}</p>
      )}
      <button type="submit" disabled={submitting}
        className="w-full py-2.5 rounded text-[11px] font-semibold uppercase tracking-wider border border-info/60 bg-info/10 text-info hover:bg-info/20 disabled:opacity-40">
        {submitting ? "Creating…" : "Create problem"}
      </button>
    </form>
  );
}
