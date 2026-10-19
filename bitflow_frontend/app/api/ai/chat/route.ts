/**
 * app/api/ai/chat/route.ts — BitFlow AI Assistant API endpoint
 *
 * Path: POST /api/ai/chat
 *
 * This is the ONLY place where API keys are used.
 * They are read from server-side environment variables (.env.local).
 * API keys are NEVER sent to the browser.
 *
 * Why /api/ai/chat and not /api/ai?
 *   The useAI hook calls fetch("/api/ai/chat", ...) for semantic clarity.
 *   Next.js API routes take precedence over rewrites, so this file is
 *   handled server-side before the /api/* → FastAPI proxy rewrite fires.
 *
 * Request body (POST):
 *   {
 *     messages: AIMessage[]   // full conversation history
 *     context:  IDEContext    // current editor + simulation state
 *   }
 *
 * Tutor mode: when context.problemSlug is set (graded problem pages), the
 * server adds the problem statement and the user's latest graded result from
 * the DB and uses the hint-only TUTOR_SYSTEM_PROMPT.
 *
 * Response:
 *   {
 *     content:    string        // AI response text
 *     tokensUsed: number | null // actual usage; null if provider omits it
 *     provider:   string        // "openai" | "gemini" | "anthropic"
 *   }
 *
 * Error response:
 *   { error: string }  — with appropriate 4xx/5xx status
 *
 * Every call costs real API credits, so it requires a signed-in user and is
 * rate-limited and size-capped.
 *
 * TODO: Add credit deduction when Oogway credit system launches
 * TODO: Add streaming (ReadableStream + SSE) for long responses
 */

import { NextRequest, NextResponse } from "next/server";
import { getSessionUser }            from "@/lib/auth-utils";
import { prisma }                    from "@/lib/prisma";
import { rateLimit }                 from "@/lib/rate-limit";
import { AINotConfiguredError, getProvider } from "@/lib/ai-providers";
import {
  SANDBOX_SYSTEM_PROMPT,
  TUTOR_SYSTEM_PROMPT,
  buildContextMessage,
  buildTutorContext,
}                                    from "@/lib/ai-prompts";
import type { AIMessage }            from "@/lib/ai-providers";
import type { IDEContext }           from "@/lib/ai-prompts";

interface RequestBody {
  messages: AIMessage[];
  context:  IDEContext;
}

const MAX_MESSAGES     = 40;
const MAX_INPUT_CHARS  = 100_000; // whole conversation + IDE context

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to use the AI assistant." }, { status: 401 });
  }
  const { success } = rateLimit(req, { limit: 20, windowMs: 60_000, prefix: "ai", key: `user:${user.id}` });
  if (!success) {
    return NextResponse.json(
      { error: "Too many AI requests. Please wait a moment and try again." },
      { status: 429 },
    );
  }

  try {
    const body = (await req.json()) as RequestBody;

    // ── Input validation ────────────────────────────────────────────────────
    if (
      JSON.stringify(body ?? {}).length > MAX_INPUT_CHARS ||
      (Array.isArray(body.messages) && body.messages.length > MAX_MESSAGES)
    ) {
      return NextResponse.json(
        { error: "Conversation too long — clear the chat and try again." },
        { status: 413 },
      );
    }

    if (!Array.isArray(body.messages)) {
      return NextResponse.json(
        { error: "messages must be an array" },
        { status: 400 },
      );
    }

    if (body.messages.length === 0) {
      return NextResponse.json(
        { error: "messages array is empty" },
        { status: 400 },
      );
    }

    if (typeof body.context?.designCode !== "string" || typeof body.context?.testbenchCode !== "string") {
      return NextResponse.json(
        { error: "context.designCode and context.testbenchCode are required" },
        { status: 400 },
      );
    }

    // ── Build full message list ─────────────────────────────────────────────
    // The context message is injected before the conversation history so the
    // AI always sees the current editor state, even mid-conversation.
    // We skip injection if the history already starts with a context message
    // (identified by the [Current IDE State] prefix) to avoid duplication.
    let contextText  = buildContextMessage(body.context);
    let systemPrompt = SANDBOX_SYSTEM_PROMPT;

    const slug = body.context.problemSlug;
    if (typeof slug === "string" && slug) {
      const question = await prisma.question.findUnique({
        where:  { slug },
        select: { id: true, title: true, statement: true, constraints: true },
      });
      if (!question) {
        return NextResponse.json({ error: "Problem not found." }, { status: 404 });
      }
      const last = await prisma.submission.findFirst({
        where:   { userId: user.id, problemId: question.id, submissionType: "SUBMIT" },
        orderBy: { createdAt: "desc" },
        select:  { accepted: true, numTestsPassed: true, numTestsTotal: true, testcaseResults: true, simStdout: true, counterexample: true },
      });
      contextText  = `${buildTutorContext(question, last)}\n\n${contextText}`;
      systemPrompt = TUTOR_SYSTEM_PROMPT;
    }

    const contextMessage: AIMessage = { role: "user", content: contextText };

    const firstMsg  = body.messages[0];
    const hasContext =
      systemPrompt === SANDBOX_SYSTEM_PROMPT &&
      firstMsg?.role === "user" &&
      firstMsg.content.startsWith("[Current IDE State]");

    const messages: AIMessage[] = hasContext
      ? body.messages
      : [contextMessage, ...body.messages];

    // ── Dispatch to configured provider ─────────────────────────────────────
    const provider = getProvider();
    const response = await provider.chat(messages, systemPrompt);

    return NextResponse.json(response);

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";

    // Log server-side (never leaks API keys — we only log the message string)
    console.error("[BitFlow AI] /api/ai/chat error:", message);

    // Never forward raw provider errors (they can name the provider, model or
    // key format); the details are in the server log above.
    if (err instanceof AINotConfiguredError) {
      return NextResponse.json(
        { error: "The AI assistant isn't configured on this server." },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { error: "The AI assistant is unavailable right now. Please try again later." },
      { status: 502 },
    );
  }
}