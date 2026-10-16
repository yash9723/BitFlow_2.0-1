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
}

/** Thrown when the selected provider has no API key configured (→ HTTP 503). */
export class AINotConfiguredError extends Error {}

export interface AIProvider {
  name:    string;
  chat(messages: AIMessage[], systemPrompt: string): Promise<AIResponse>;
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

    async chat(messages, systemPrompt) {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) throw new AINotConfiguredError("GEMINI_API_KEY not set in environment.");

      // gemini-1.5-flash was shut down in Sept 2025; Google recommends 3.8 Flash for new projects.
      const model = process.env.GEMINI_MODEL ?? "gemini-3.8-flash";

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

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

      const res = await fetch(url, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
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
      return {
        content:    text,
        tokensUsed: data.usageMetadata?.totalTokenCount ?? null,
        provider:   "gemini",
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

  switch (name) {
    case "openai":    return openaiProvider();
    case "gemini":    return geminiProvider();
    case "anthropic": return anthropicProvider();
    case "groq":      return groqProvider();
    default:
      throw new Error(
        `Unknown BITFLOW_AI_PROVIDER: "${name}". ` +
        `Valid values: openai, gemini, anthropic, groq.`,
      );
  }
}