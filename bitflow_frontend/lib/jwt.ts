/**
 * lib/jwt.ts — Server-side JWT generation for backend auth
 *
 * This module runs ONLY on the server (Next.js API routes).
 * The JWT_SECRET never reaches the browser.
 *
 * Each token is short-lived (60 seconds) and used for a single
 * simulation request from Next.js → FastAPI.
 */

import jwt from "jsonwebtoken";

/**
 * Generate a short-lived JWT for authenticating with the FastAPI backend.
 * Called server-side only (from Next.js API routes).
 *
 *   JWT_PRIVATE_KEY (ES256 PEM, literal \n allowed) — the API then only needs
 *     the matching public key (JWT_PUBLIC_KEY), so no secret is shared.
 *   JWT_SECRET (HS256) — the same value must be set on the API.
 *
 * There is deliberately no default secret: a public default lets anyone mint tokens.
 */
export function generateBackendJwt(): string {
  const privateKey = process.env.JWT_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const secret = process.env.JWT_SECRET;
  if (!privateKey && !secret) {
    throw new Error("Set JWT_PRIVATE_KEY (ES256) or JWT_SECRET (must match the backend's)");
  }
  return jwt.sign(
    {
      iss: "bitflow-frontend",
      purpose: "simulate",
    },
    privateKey || secret!,
    {
      algorithm: privateKey ? "ES256" : "HS256",
      expiresIn: "60s",
    }
  );
}

/** True when a backend signing key is set (pair mode, lib/pair-server.ts, needs one). */
export const hasBackendKey = () => !!(process.env.JWT_PRIVATE_KEY || process.env.JWT_SECRET);

/**
 * A token for one pair-mode room on the backend's sync server (api/routes/pair.py). It goes to the browser, so it
 * carries the audience "bitflow-pair": the backend accepts it for that room's socket and nothing else.
 */
export function generatePairJwt(room: string, expiresAt: Date): string {
  const privateKey = process.env.JWT_PRIVATE_KEY?.replace(/\n/g, "\n");
  const key = privateKey || process.env.JWT_SECRET;
  if (!key) throw new Error("Set JWT_PRIVATE_KEY (ES256) or JWT_SECRET (must match the backend's)");
  return jwt.sign({ iss: "bitflow-frontend", room }, key, {
    algorithm: privateKey ? "ES256" : "HS256",
    audience: "bitflow-pair",
    expiresIn: Math.max(60, Math.floor((expiresAt.getTime() - Date.now()) / 1000)),
  });
}
