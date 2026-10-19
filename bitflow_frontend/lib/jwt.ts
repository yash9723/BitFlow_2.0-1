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
