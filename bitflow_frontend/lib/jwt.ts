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
 * There is deliberately no default secret: a public default lets anyone mint tokens.
 */
export function generateBackendJwt(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not set (must match the backend's JWT_SECRET)");
  }
  return jwt.sign(
    {
      iss: "bitflow-frontend",
      purpose: "simulate",
    },
    secret,
    {
      algorithm: "HS256",
      expiresIn: "60s",
    }
  );
}
