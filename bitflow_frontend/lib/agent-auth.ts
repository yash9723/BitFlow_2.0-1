/**
 * lib/agent-auth.ts — the short-lived tokens between BitFlow and the tutor agent (agents/tutor/).
 *
 * BitFlow signs a token for one student and one problem (ES256, 2 minutes). The agent checks it with the PUBLIC key,
 * and sends the same token back to BitFlow's tool routes (app/api/ai/tools/[tool]/route.ts) when it looks something up,
 * so a tool can only ever read what that one student may see on that one problem. The agent holds no database access,
 * no secret that can mint tokens, and no other student's data.
 *
 *   AGENT_JWT_PRIVATE_KEY   ES256 PEM (literal \n allowed), Vercel only. The agent gets the matching public key.
 *   AGENT_URL               where the deployed agent listens (https, no trailing slash)
 */
import crypto from "node:crypto";
import jwt from "jsonwebtoken";

export const AGENT_AUDIENCE = "bitflow-tutor";
const ISSUER = "bitflow-frontend";
const TTL_S = 120;

export interface AgentClaims { sub: string; slug: string }

const privateKey = () => {
  const k = process.env.AGENT_JWT_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!k) throw new Error("AGENT_JWT_PRIVATE_KEY is not set");
  return k;
};

/** A token for this student on this problem. `sub` is the user id: it never leaves BitFlow's own routes and Google's agent logs. */
export function signAgentToken(claims: AgentClaims, key = privateKey()): string {
  return jwt.sign({ slug: claims.slug }, key, { algorithm: "ES256", subject: claims.sub, issuer: ISSUER, audience: AGENT_AUDIENCE, expiresIn: TTL_S });
}

/** The claims, or null for anything wrong: bad signature, expired, wrong audience or issuer, missing fields. */
export function verifyAgentToken(token: string | null | undefined, key = privateKey()): AgentClaims | null {
  if (!token) return null;
  try {
    const pub = crypto.createPublicKey(key).export({ type: "spki", format: "pem" }).toString();
    const p = jwt.verify(token, pub, { algorithms: ["ES256"], issuer: ISSUER, audience: AGENT_AUDIENCE }) as jwt.JwtPayload;
    return typeof p.sub === "string" && p.sub && typeof p.slug === "string" && p.slug ? { sub: p.sub, slug: p.slug } : null;
  } catch { return null; }
}

/** "Bearer <token>" from a request's Authorization header. */
export const bearer = (header: string | null) => (header && /^Bearer\s+\S+$/.test(header) ? header.split(/\s+/)[1] : null);
