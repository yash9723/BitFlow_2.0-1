/**
 * lib/studio/share.ts — Studio share links: a tool's drafts (its localStorage entries) as
 * JSON, deflated and base64url-encoded into the URL fragment (#s=…). Nothing is stored on
 * a server, and the fragment never reaches one. Used by components/studio/ShareControl.tsx.
 * Self-check: scripts/share.check.ts.
 */

/** Longest fragment we hand out: links much longer than this break in chat apps and some browsers. */
export const MAX_SHARE_CHARS = 8000;

const toB64url = (bytes: Uint8Array) => {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

/** Encode drafts (key -> value) for the #s= fragment. */
export async function encodeShare(drafts: Record<string, unknown>): Promise<string> {
  return toB64url(await pipe(new TextEncoder().encode(JSON.stringify(drafts)), new CompressionStream("deflate-raw")));
}

/** Decode a #s= fragment, keeping only the `allowed` keys. Null if it isn't a valid share. */
export async function decodeShare(s: string, allowed: string[]): Promise<Record<string, unknown> | null> {
  if (!/^[A-Za-z0-9_-]+$/.test(s) || s.length > 4 * MAX_SHARE_CHARS) return null;
  try {
    const data: unknown = JSON.parse(new TextDecoder().decode(await pipe(fromB64url(s), new DecompressionStream("deflate-raw"))));
    if (!data || typeof data !== "object" || Array.isArray(data)) return null;
    const kept = Object.fromEntries(Object.entries(data).filter(([k]) => allowed.includes(k)));
    return Object.keys(kept).length ? kept : null;
  } catch {
    return null;
  }
}
