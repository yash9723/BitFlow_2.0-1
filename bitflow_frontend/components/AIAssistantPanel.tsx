/**
 * components/AIAssistantPanel.tsx — BitFlow AI Assistant UI
 *
 * CURSOR-STYLE CHANGE MODEL:
 * ───────────────────────────
 * When the AI suggests code, clicking "Apply" on a suggestion:
 *   1. Writes the code into the editor immediately (user sees it live)
 *   2. Shows a PendingBanner at the top of the panel:
 *        "AI modified design.v"  [ ✓ Accept ]  [ ↩ Undo ]
 *   3. Accept → change stays, banner clears.
 *      Undo   → previous code is restored, banner clears.
 *
 * The user always has one-click escape.
 * The AI never silently overwrites code without a visible confirmation step.
 *
 * TODO: Add streaming message rendering when API route supports SSE.
 * TODO: Add Oogway branding and credit display.
 */

"use client";

import React, {
  useRef,
  useEffect,
  useState,
  useCallback,
  memo,
}                           from "react";
import { useAI }            from "@/hooks/useAI";
import { QUICK_ACTIONS, TUTOR_QUICK_ACTIONS } from "@/lib/ai-prompts";
import type { SimulateResponse } from "@/lib/types";
import type { ChatMessage, CodeSuggestion, PendingChange } from "@/hooks/useAI";

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

interface AIAssistantPanelProps {
  isOpen:          boolean;
  onClose:         () => void;
  designCode:      string;
  testbenchCode:   string;
  result:          SimulateResponse | null;
  setDesignCode:   (code: string) => void;
  setTestbenchCode:(code: string) => void;
  /** Graded problem page: tutor mode (hints only, server adds the problem). */
  problemSlug?:    string;
  /** A question to send once the panel is open (e.g. "Explain my failure"); a new id sends again. */
  ask?:            { id: number; prompt: string } | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// PendingBanner — shown when a change is live but not yet accepted
// ─────────────────────────────────────────────────────────────────────────────

const PendingBanner = memo(function PendingBanner({
  pending,
  onAccept,
  onUndo,
}: {
  pending:  PendingChange;
  onAccept: () => void;
  onUndo:   () => void;
}) {
  const fileName = pending.target === "design" ? "design.v" : "tb.v";
  const hasStats = pending.added > 0 || pending.removed > 0;

  return (
    <div className="shrink-0 mx-2 mt-2 rounded border border-warn/40 bg-warn/8 overflow-hidden">
      {/* Label row */}
      <div className="flex items-center gap-1.5 px-2 py-1 border-b border-warn/20">
        <span className="w-1.5 h-1.5 rounded-full bg-warn animate-pulse_soft shrink-0" />
        <span className="font-mono text-[9px] text-warn/90 flex-1 truncate">
          AI modified <span className="text-warn">{fileName}</span>
        </span>
        {/* Diff stats — +X −Y */}
        {hasStats && (
          <span className="font-mono text-[9px] shrink-0 flex items-center gap-1">
            {pending.added   > 0 && <span className="text-phosphor">+{pending.added}</span>}
            {pending.removed > 0 && <span className="text-danger">−{pending.removed}</span>}
          </span>
        )}
      </div>

      {/* Action row */}
      <div className="flex gap-1 px-2 py-1.5">
        <button
          onClick={onAccept}
          className={[
            "flex-1 flex items-center justify-center gap-1",
            "py-1 rounded font-mono text-[9px] uppercase tracking-wider",
            "border border-phosphor/40 bg-phosphor/10 text-phosphor",
            "hover:bg-phosphor/20 hover:border-phosphor/70",
            "transition-all duration-100 active:scale-[0.97]",
          ].join(" ")}
        >
          <span>✓</span><span>Accept</span>
        </button>
        <button
          onClick={onUndo}
          className={[
            "flex-1 flex items-center justify-center gap-1",
            "py-1 rounded font-mono text-[9px] uppercase tracking-wider",
            "border border-danger/30 bg-danger/5 text-danger/80",
            "hover:bg-danger/15 hover:border-danger/60 hover:text-danger",
            "transition-all duration-100 active:scale-[0.97]",
          ].join(" ")}
        >
          <span>↩</span><span>Undo</span>
        </button>
      </div>
    </div>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// SuggestionBlock — code preview + Apply button inside a message bubble
// ─────────────────────────────────────────────────────────────────────────────

const SuggestionBlock = memo(function SuggestionBlock({
  suggestion,
  onApplyDesign,
  onApplyTestbench,
}: {
  suggestion:       CodeSuggestion;
  onApplyDesign:    (code: string, label: string) => void;
  onApplyTestbench: (code: string, label: string) => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(suggestion.code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="mt-2 rounded border border-info/20 bg-info/5 overflow-hidden">
      {/* Header row */}
      <div className="flex items-center justify-between px-2 py-1 bg-info/10 border-b border-info/20">
        <span className="font-mono text-[9px] text-info/70 uppercase tracking-widest">
          {suggestion.target === "design" ? "design.v" : "tb.v"} suggestion
        </span>
        <button
          onClick={handleCopy}
          className="font-mono text-[9px] text-dim hover:text-ghost transition-colors"
        >
          {copied ? "copied ✓" : "copy"}
        </button>
      </div>

      {/* Code preview */}
      <pre
        className="px-2 py-2 text-[10px] font-mono text-pale leading-relaxed overflow-x-auto max-h-40"
        style={{ scrollbarWidth: "thin", scrollbarColor: "#22232d transparent" }}
      >
        {suggestion.code}
      </pre>

      {/* Apply buttons */}
      <div className="flex gap-1 px-2 pb-2">
        <button
          onClick={() => onApplyDesign(suggestion.code, suggestion.label)}
          className={[
            "flex-1 py-1 rounded font-mono text-[9px] uppercase tracking-wider",
            "border border-phosphor/30 bg-phosphor/5 text-phosphor/70",
            "hover:bg-phosphor/20 hover:border-phosphor/60 hover:text-phosphor",
            "transition-all duration-100",
            suggestion.target === "testbench" ? "opacity-40" : "",
          ].join(" ")}
          title="Apply to design.v — you can accept or undo immediately"
        >
          → design.v
        </button>
        <button
          onClick={() => onApplyTestbench(suggestion.code, suggestion.label)}
          className={[
            "flex-1 py-1 rounded font-mono text-[9px] uppercase tracking-wider",
            "border border-info/30 bg-info/5 text-info/70",
            "hover:bg-info/15 hover:border-info/60 hover:text-info",
            "transition-all duration-100",
            suggestion.target === "design" ? "opacity-40" : "",
          ].join(" ")}
          title="Apply to tb.v — you can accept or undo immediately"
        >
          → tb.v
        </button>
      </div>
    </div>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// MessageBubble
// ─────────────────────────────────────────────────────────────────────────────

const MessageBubble = memo(function MessageBubble({
  msg,
  onApplyDesign,
  onApplyTestbench,
}: {
  msg:              ChatMessage;
  onApplyDesign:    (code: string, label: string) => void;
  onApplyTestbench: (code: string, label: string) => void;
}) {
  const isUser = msg.role === "user";

  const displayText = msg.content
    .replace(/\/\/\s*---\s*(DESIGN\.V|TB\.V|END) SUGGESTION\s*---/gi, "")
    .replace(/```(?:verilog|systemverilog)?\n[\s\S]*?```/gi, "")
    .trim();

  return (
    <div className={`flex flex-col gap-1 ${isUser ? "items-end" : "items-start"}`}>
      <div className={[
        "max-w-[90%] px-2.5 py-2 rounded text-[10px] font-mono leading-relaxed",
        "whitespace-pre-wrap break-words",
        isUser
          ? "bg-info/10 border border-info/20 text-pale"
          : "bg-surface border border-rim/60 text-pale",
      ].join(" ")}>
        {displayText || (isUser ? msg.content : "…")}
      </div>

      {/* Code suggestions */}
      {!isUser && msg.suggestions && msg.suggestions.length > 0 && (
        <div className="w-full">
          {msg.suggestions.map((s, i) => (
            <SuggestionBlock
              key={i}
              suggestion={s}
              onApplyDesign={onApplyDesign}
              onApplyTestbench={onApplyTestbench}
            />
          ))}
        </div>
      )}

      {/* Timestamp + token count */}
      <span className="font-mono text-[8px] text-dim/40">
        {new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        {msg.tokensUsed ? ` · ${msg.tokensUsed}t` : ""}
      </span>
    </div>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Main panel
// ─────────────────────────────────────────────────────────────────────────────

export default function AIAssistantPanel({
  isOpen,
  onClose,
  designCode,
  testbenchCode,
  result,
  setDesignCode,
  setTestbenchCode,
  problemSlug,
  ask,
}: AIAssistantPanelProps) {
  const {
    messages,
    isLoading,
    error,
    totalTokens,
    pendingDesign,
    pendingTestbench,
    sendMessage,
    clearHistory,
    applyToDesign,
    applyToTestbench,
    acceptDesign,
    undoDesign,
    acceptTestbench,
    undoTestbench,
  } = useAI(designCode, testbenchCode, setDesignCode, setTestbenchCode);

  const [input,    setInput]    = useState("");
  const scrollRef              = useRef<HTMLDivElement>(null);
  const inputRef               = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, isLoading]);

  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 100);
  }, [isOpen]);

  const getContext = useCallback(() => ({
    designCode,
    testbenchCode,
    stdout: result?.stdout,
    stderr: result?.stderr,
    status: result?.status,
    problemSlug,
  }), [designCode, testbenchCode, result, problemSlug]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || isLoading) return;
    const prompt = input.trim();
    setInput("");
    await sendMessage(prompt, getContext());
  }, [input, isLoading, sendMessage, getContext]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const handleQuickAction = useCallback(async (prompt: string) => {
    await sendMessage(prompt, getContext());
  }, [sendMessage, getContext]);

  const askedId = useRef<number | null>(null);
  useEffect(() => {
    if (!isOpen || !ask || askedId.current === ask.id || isLoading) return;
    askedId.current = ask.id;
    sendMessage(ask.prompt, getContext());
  }, [isOpen, ask, isLoading, sendMessage, getContext]);

  if (!isOpen) return null;

  return (
    <div
      className="flex flex-col bg-pit border-l border-rim overflow-hidden"
      style={{
        position:  "fixed",
        top:       0,
        right:     0,
        height:    "100vh",
        width:     320,
        zIndex:    40,
        boxShadow: "-4px 0 24px rgba(0,0,0,0.5)",
      }}
    >
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-3 h-8 shrink-0 bg-surface border-b border-rim">
        <div className="flex items-center gap-2">
          <svg viewBox="0 0 14 14" className="w-3 h-3 text-info" fill="none" stroke="currentColor" strokeWidth="1.2">
            <circle cx="7" cy="7" r="6" />
            <path d="M4 7h6M7 4v6" strokeLinecap="round" />
          </svg>
          <span className="font-mono text-[10px] text-ghost tracking-widest uppercase">
            {problemSlug ? "AI Tutor" : "AI Assistant"}
          </span>
          {/* TODO: Oogway branding */}
        </div>
        <div className="flex items-center gap-2">
          {totalTokens > 0 && (
            <span className="font-mono text-[8px] text-dim" title="Tokens used this session">
              {totalTokens.toLocaleString()}t
            </span>
          )}
          <button onClick={clearHistory} className="font-mono text-[9px] text-dim hover:text-ghost transition-colors" title="Clear history">
            clr
          </button>
          <button onClick={onClose} className="font-mono text-[10px] text-dim hover:text-ghost transition-colors" aria-label="Close">
            ×
          </button>
        </div>
      </div>

      {/* ── Pending change banners — shown immediately when AI applies code ── */}
      {pendingDesign && (
        <PendingBanner
          pending={pendingDesign}
          onAccept={acceptDesign}
          onUndo={undoDesign}
        />
      )}
      {pendingTestbench && (
        <PendingBanner
          pending={pendingTestbench}
          onAccept={acceptTestbench}
          onUndo={undoTestbench}
        />
      )}

      {/* ── Quick actions ────────────────────────────────────────────────── */}
      <div className="shrink-0 flex flex-wrap gap-1 px-2 py-1.5 border-b border-rim/40 bg-surface/30">
        {(problemSlug ? TUTOR_QUICK_ACTIONS : QUICK_ACTIONS).map((qa) => (
          <button
            key={qa.label}
            onClick={() => handleQuickAction(qa.prompt)}
            disabled={isLoading}
            className={[
              "flex items-center gap-1 px-1.5 py-0.5 rounded",
              "font-mono text-[8px] text-dim",
              "border border-rim/60 bg-surface/60",
              "hover:border-info/40 hover:text-info/80 hover:bg-info/5",
              "transition-all duration-100 disabled:opacity-40 disabled:cursor-not-allowed",
            ].join(" ")}
            title={qa.prompt}
          >
            <span>{qa.icon}</span>
            <span>{qa.label}</span>
          </button>
        ))}
      </div>

      {/* ── Message history ──────────────────────────────────────────────── */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-2 py-2 space-y-3 min-h-0"
        style={{ scrollbarWidth: "thin", scrollbarColor: "#22232d transparent" }}
      >
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-2 py-8">
            <div className="text-2xl text-dim/30">◈</div>
            <p className="font-mono text-[10px] text-dim/60 leading-relaxed">
              Ask me anything about your Verilog design.<br />
              Use quick actions above to analyze errors.
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            msg={msg}
            onApplyDesign={applyToDesign}
            onApplyTestbench={applyToTestbench}
          />
        ))}

        {isLoading && (
          <div className="flex items-center gap-2 text-dim font-mono text-[10px]">
            <span className="w-1.5 h-1.5 rounded-full bg-info animate-pulse_soft" />
            <span className="w-1.5 h-1.5 rounded-full bg-info animate-pulse_soft" style={{ animationDelay: "0.2s" }} />
            <span className="w-1.5 h-1.5 rounded-full bg-info animate-pulse_soft" style={{ animationDelay: "0.4s" }} />
            <span className="text-dim/50">thinking…</span>
          </div>
        )}

        {error && (
          <div className="px-2 py-1.5 rounded border border-danger/30 bg-danger/10 font-mono text-[10px] text-danger">
            {error}
          </div>
        )}
      </div>

      {/* ── Input area ──────────────────────────────────────────────────── */}
      <div className="shrink-0 border-t border-rim p-2">
        <div className="flex flex-col gap-1.5">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your design… (Enter to send, Shift+Enter for newline)"
            rows={3}
            disabled={isLoading}
            className={[
              "w-full resize-none rounded px-2 py-1.5",
              "font-mono text-[10px] text-pale placeholder:text-dim/40",
              "bg-surface border border-rim",
              "focus:outline-none focus:border-info/40",
              "transition-colors duration-100 disabled:opacity-50",
            ].join(" ")}
            style={{ scrollbarWidth: "thin" }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className={[
              "w-full py-1 rounded font-mono text-[10px] tracking-widest uppercase",
              "border transition-all duration-150",
              !input.trim() || isLoading
                ? "border-rim text-dim cursor-not-allowed"
                : "border-info/40 bg-info/10 text-info/80 hover:bg-info/20 hover:border-info/70 hover:text-info active:scale-[0.98]",
            ].join(" ")}
          >
            {isLoading ? "Thinking…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
