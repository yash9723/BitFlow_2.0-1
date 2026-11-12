/**
 * lib/ai-providers.ts — Provider abstraction for BitFlow AI Assistant
 *
 * Architecture: thin adapter pattern.
 * Each provider exposes the same interface so the API route
 * (app/api/ai/route.ts) can swap between them with one env var.
 *
 * Environment variables (set in .env.local):
 *   BITFLOW_AI_PROVIDER=openai | gemini | anthropic | groq   (default: openai)
 *   OPENAI_API_KEY=sk-...
 *   GEMINI_API_KEY=AI...
 *   ANTHROPIC_API_KEY=sk-ant-...
 *   GROQ_API_KEY=gsk_...
 *   GROQ_MODEL=llama-3.3-70b-versatile   (optional, this is the default)
 *
 * TODO (Oogway AI phase):
 *   - Add OogwayProvider pointing to fine-tuned VLSI model endpoint
 *   - Add credit/token deduction call before each request
 *   - Add multi-agent orchestration: separate agents for
 *       lint → suggest → verify → apply workflow
 *
 * IMPORTANT: This file runs SERVER-SIDE only (imported by app/api/ai/route.ts).
 * API keys are never sent to the browser.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface AIMessage {
  role:    "user" | "assistant" | "system";
  content: string;
}

export interface AIResponse {
  content:       string;
  /** Actual tokens used; null if provider doesn't report it. */
  tokensUsed:    number | null;
  /** Which provider handled this request. */
  provider:      string;
  /** The model that answered and its token split, when the provider reports them (lib/ai-budget.ts prices them). */
  model?:        string;
  usage?:        TokenUsage;
}

import { signAgentToken } from "@/lib/agent-auth";
import type { BudgetState, TokenUsage } from "@/lib/ai-budget";

/** Thrown when the selected provider has no API key configured (→ HTTP 503). */
export class AINotConfiguredError extends Error {}

/**
 * Who is asking and about which problem (the tutor agent mints its scoped token from these), plus the route's choice
 * of model (Gemini only) and whether to skip the agent, from pickModel below.
 */
export interface AIChatMeta { userId: string; problemSlug?: string; model?: string; skipAgent?: boolean }

export const FLASH_MODEL = () => process.env.GEMINI_MODEL ?? "gemini-3.8-flash";
export const LITE_MODEL  = () => process.env.GEMINI_LITE_MODEL ?? "gemini-3.5-flash-lite";

/**
 * The cheapest model that does the job. A quick action (one fixed, well-scoped question) and anything past today's
 * soft budget use Lite; a tutoring conversation uses Flash. Past the soft budget the tutor agent is skipped too.
 */
export function pickModel(kind: "quick" | "sandbox" | "tutor", budget: BudgetState): { model: string; skipAgent: boolean } {
  const lite = kind === "quick" || budget !== "ok";
  return { model: lite ? LITE_MODEL() : FLASH_MODEL(), skipAgent: budget !== "ok" };
}

export interface AIProvider {
  name:    string;
  chat(messages: AIMessage[], systemPrompt: string, meta?: AIChatMeta): Promise<AIResponse>;
}

// ─────────────────────────────────────────────────────────────────────────────
// OpenAI adapter
// ─────────────────────────────────────────────────────────────────────────────

function openaiProvider(): AIProvider {
  return {
    name: "openai",

    async chat(messages, systemPrompt) {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) throw new AINotConfiguredError("OPENAI_API_KEY not set in environment.");

      // gpt-4o-mini shuts down 2027-01-14 (OpenAI recommends gpt-6-luna; set
      // OPENAI_MODEL). max_completion_tokens + default temperature work on both
      // old and new chat models — newer ones reject max_tokens / custom temperature.
      const body = {
        model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        max_completion_tokens: 4096,
      };

      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method:  "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`OpenAI API error ${res.status}: ${err}`);
      }

      const data = await res.json();
      return {
        content:    data.choices[0].message.content as string,
        tokensUsed: data.usage?.total_tokens ?? null,
        provider:   "openai",
      };
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Google Gemini adapter
// ─────────────────────────────────────────────────────────────────────────────

function geminiProvider(): AIProvider {
  return {
    name: "gemini",

    async chat(messages, systemPrompt, meta) {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) throw new AINotConfiguredError("GEMINI_API_KEY not set in environment.");

      // The route picks Flash or Flash-Lite per request (pickModel); GEMINI_MODEL is the default.
      const model = meta?.model ?? FLASH_MODEL();

      // Gemini uses a different message format — merge system into first user message
      const contents = messages.map((m) => ({
        role:  m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));

      const body = {
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents,
        // Newer Gemini models think before answering and that counts toward
        // maxOutputTokens, so leave headroom; keep the default temperature.
        generationConfig: { maxOutputTokens: 8192 },
      };

      // The key goes in a header, not the URL, so it can't end up in a proxy or access log.
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

      const res = await fetch(url, {
        method:  "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body:    JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Gemini API error ${res.status}: ${err}`);
      }

      const data = await res.json();
      const parts: Array<{ text?: string; thought?: boolean }> =
        data.candidates?.[0]?.content?.parts ?? [];
      const text = parts.filter((p) => !p.thought && p.text).map((p) => p.text).join("");
      const u = data.usageMetadata ?? {};
      return {
        content:    text,
        tokensUsed: u.totalTokenCount ?? null,
        provider:   "gemini",
        model,
        // Thinking tokens bill as output.
        usage: { input: u.promptTokenCount ?? 0, output: (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0), cached: u.cachedContentTokenCount ?? 0 },
      };
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Anthropic adapter
// ─────────────────────────────────────────────────────────────────────────────

function anthropicProvider(): AIProvider {
  return {
    name: "anthropic",

    async chat(messages, systemPrompt) {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) throw new AINotConfiguredError("ANTHROPIC_API_KEY not set in environment.");

      const model = process.env.ANTHROPIC_MODEL ?? "claude-haiku-5-5";

      // Anthropic API: system is a top-level field, not a message role
      // Claude Haiku 5.5 thinks by default; thinking shares max_tokens with the
      // answer, so leave headroom. Low effort suits short tutoring replies.
      const body = {
        model,
        system:        systemPrompt,
        messages:      messages.filter((m) => m.role !== "system"),
        max_tokens:    8192,
        output_config: { effort: "low" },
      };

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method:  "POST",
        headers: {
          "Content-Type":      "application/json",
          "x-api-key":         apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Anthropic API error ${res.status}: ${err}`);
      }

      const data = await res.json();
      // Safety classifiers can decline (HTTP 200, stop_reason "refusal").
      // Otherwise the answer is in the "text" blocks — the first block may be
      // a "thinking" block, so never just read content[0].
      const text = data.stop_reason === "refusal"
        ? "Sorry — I can't help with that request."
        : (data.content ?? [])
            .filter((b: { type: string }) => b.type === "text")
            .map((b: { text: string }) => b.text)
            .join("");
      return {
        content:    text,
        tokensUsed: (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0),
        provider:   "anthropic",
      };
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Groq adapter
// Groq exposes an OpenAI-compatible endpoint, so the request/response shape
// is identical to the OpenAI adapter — only the base URL and key name differ.
// ─────────────────────────────────────────────────────────────────────────────

function groqProvider(): AIProvider {
  return {
    name: "groq",

    async chat(messages, systemPrompt) {
      const apiKey = process.env.GROQ_API_KEY;
      if (!apiKey) throw new AINotConfiguredError("GROQ_API_KEY not set in environment.");

      const body = {
        model: process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        max_tokens:  1500,
        temperature: 0.2,
      };

      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method:  "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Groq API error ${res.status}: ${err}`);
      }

      const data = await res.json();
      return {
        content:    data.choices[0].message.content as string,
        tokensUsed: data.usage?.total_tokens ?? null,
        provider:   "groq",
      };
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory — pick provider from BITFLOW_AI_PROVIDER env var
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the active AI provider based on the BITFLOW_AI_PROVIDER environment
 * variable.  Throws if the provider name is unrecognised.
 *
 * TODO: Add "oogway" case pointing to fine-tuned VLSI endpoint when ready.
 */
export function getProvider(): AIProvider {
  const name = (process.env.BITFLOW_AI_PROVIDER ?? "openai").toLowerCase();
  return name === "agent" ? agentProvider(directProvider(process.env.BITFLOW_AI_FALLBACK_PROVIDER ?? "gemini")) : directProvider(name);
}

// ─────────────────────────────────────────────────────────────────────────────
// Tutor agent (agents/tutor/, Google ADK on Cloud Run): looks things up itself, then answers
// ─────────────────────────────────────────────────────────────────────────────

const AGENT_TIMEOUT_MS = 25_000;

/**
 * Sends a graded-problem conversation to the tutor agent with a short-lived token for this student and problem
 * (lib/agent-auth.ts). The agent is an extra, never a single point of failure: with no problem (the Sandbox), no
 * AGENT_URL, a timeout or any error, the plain provider answers instead, so the tutor keeps working.
 */
export function agentProvider(fallback: AIProvider): AIProvider {
  return {
    name: "agent",
    async chat(messages, systemPrompt, meta) {
      const url = process.env.AGENT_URL?.replace(/\/+$/, "");
      if (!url || !meta?.problemSlug || meta.skipAgent) return fallback.chat(messages, systemPrompt, meta);
      try {
        const token = signAgentToken({ sub: meta.userId, slug: meta.problemSlug });
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), AGENT_TIMEOUT_MS);
        try {
          const res = await fetch(`${url}/chat`, {
            method: "POST", signal: ctl.signal,
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ system_prompt: systemPrompt, messages }),
          });
          if (!res.ok) throw new Error(`agent answered ${res.status}`);
          const data = await res.json();
          if (typeof data?.content !== "string" || !data.content.trim()) throw new Error("agent returned no text");
          const total = typeof data.tokens_used === "number" ? data.tokens_used : null;
          // ponytail: the agent reports only a total; split it 70/30 input/output until it reports both.
          const usage = total === null ? undefined : { input: Math.round(total * 0.7), output: Math.round(total * 0.3) };
          return { content: data.content, tokensUsed: total, provider: "agent", model: FLASH_MODEL(), usage };
        } finally { clearTimeout(timer); }
      } catch (err) {
        console.warn("[ai] tutor agent unavailable, using the plain provider:", err instanceof Error ? err.message : err);
        return fallback.chat(messages, systemPrompt, meta);
      }
    },
  };
}

function directProvider(name: string): AIProvider {
  switch (name) {
    case "openai":    return openaiProvider();
    case "gemini":    return geminiProvider();
    case "anthropic": return anthropicProvider();
    case "groq":      return groqProvider();
    // Testing only: replies with the exact system prompt and messages the model would
    // get, so tests can check the context without an API key. Never set it in production.
    case "echo":      return {
      name: "echo",
      async chat(messages, systemPrompt) {
        return { content: [systemPrompt, ...messages.map((m) => `[${m.role}]\n${m.content}`)].join("\n\n"), tokensUsed: null, provider: "echo" };
      },
    };
    default:
      throw new Error(
        `Unknown BITFLOW_AI_PROVIDER: "${name}". ` +
        `Valid values: openai, gemini, anthropic, groq, agent.`,
      );
  }
}