/**
 * lib/backend.ts — Server-side client for the FastAPI simulation backend.
 * Used by the /api/simulate proxy and by server-side grading. Never import
 * this from client components: it signs requests with JWT_SECRET.
 */

import { generateBackendJwt } from "@/lib/jwt";

export interface SimulateBody {
  design_v:    string;
  testbench_v: string;
  timeout?:    number;
}

// BACKEND_URL is read at runtime; NEXT_PUBLIC_* values are inlined at build time.
export function backendUrl(): string {
  const url = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL;
  if (url) return url;
  if (process.env.NODE_ENV === "production") {
    throw new Error("BACKEND_URL is not set");
  }
  return "http://127.0.0.1:8000";
}

/** POST /simulate on the backend. Returns the HTTP status and parsed body. */
export async function simulateOnBackend(
  body: SimulateBody
): Promise<{ status: number; data: any }> {
  const res = await fetch(`${backendUrl()}/simulate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization:  `Bearer ${generateBackendJwt()}`,
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    data = { error: text.trim() || res.statusText || "Backend error" };
  }
  return { status: res.status, data };
}
