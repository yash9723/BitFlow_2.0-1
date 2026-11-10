/**
 * lib/pair.ts — pair mode: two people edit one Sandbox project at the same time.
 *
 * The owner of a saved project makes a link (valid PAIR_INVITE_HOURS); whoever opens it while signed in joins a
 * Liveblocks room for that project and both type into the same files, seeing each other's cursor. The text lives in
 * a Yjs document in the room (one Y.Text per file, PAIR_KEYS); the owner's browser keeps autosaving it to the
 * project as usual, the partner's never writes to it. Ending the session (or the link expiring) deletes the room,
 * so Liveblocks keeps no copy of the code (lib/pair-server.ts).
 *
 * Shared by the browser (hooks/usePair.ts) and the API (app/api/pair): no server-only imports here.
 */
import type * as YT from "yjs";
import type { EditorContent } from "@/components/ProjectsMenu";

export const PAIR_INVITE_HOURS = 24;
export const PAIR_PARAM = "pair";          // /sandbox?pair=<invite code>

const ROOM_PREFIX = "bitflow-project:";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN = /^[A-Za-z0-9_-]{32,64}$/;

export const roomFor = (projectId: string) => ROOM_PREFIX + projectId;
export function projectOfRoom(room: unknown): string | null {
  if (typeof room !== "string" || !room.startsWith(ROOM_PREFIX)) return null;
  const id = room.slice(ROOM_PREFIX.length);
  return UUID.test(id) ? id : null;
}

/** The invite as it travels in the link: "<projectId>.<token>". The server keeps only the token's hash. */
export const inviteCode = (projectId: string, token: string) => `${projectId}.${token}`;
export function parseInvite(code: unknown): { projectId: string; token: string } | null {
  if (typeof code !== "string") return null;
  const dot = code.indexOf(".");
  const projectId = code.slice(0, dot), token = code.slice(dot + 1);
  return dot > 0 && UUID.test(projectId) && TOKEN.test(token) ? { projectId, token } : null;
}

/** Keys of the files in the shared document. */
export const PAIR_KEYS = { design: "design", testbench: "testbench", file: (name: string) => `file:${name}` } as const;

/** A cursor colour per person: readable on the dark editor, stable for a user. */
const COLORS = ["#f59e0b", "#38bdf8", "#f472b6", "#a78bfa", "#34d399", "#fb7185", "#facc15", "#60a5fa"];
export function colorFor(userId: string): string {
  let h = 0;
  for (const c of userId) h = (h * 31 + c.charCodeAt(0)) | 0;
  return COLORS[Math.abs(h) % COLORS.length];
}

/** A value for CSS `content:` — the name shown on a partner's cursor. */
export const cssString = (s: string) => `"${s.slice(0, 40).replace(/[\\"]/g, "\\$&").replace(/[\n\r\f]/g, " ")}"`;
/** Only a #rrggbb colour reaches the injected CSS. */
export const safeColor = (c: unknown) => (typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c) ? c : "#9ca3af");

/** The shared document: one Y.Text per file (PAIR_KEYS), and the languages and file order in `meta`. */
export interface PairDoc { Y: typeof YT; doc: YT.Doc; files: YT.Map<YT.Text>; meta: YT.Map<unknown> }

export function keysOf(c: EditorContent): Map<string, string> {
  return new Map([[PAIR_KEYS.design, c.designCode], [PAIR_KEYS.testbench, c.testbenchCode],
                  ...c.files.map((f) => [PAIR_KEYS.file(f.name), f.content] as [string, string])]);
}

/**
 * Write the editors into the document. `force` (the owner opening the room alone) makes the document exactly
 * this content. Otherwise only what changed here goes in: a file text that isn't one the document recently held,
 * a file added or removed since `prev`, the languages and file order.
 */
export function writeContent(s: PairDoc, c: EditorContent, prev: Set<string> | null, force: boolean, seen: Map<string, string[]>) {
  const fromDoc = (key: string, value: string) => !force && (seen.get(key)?.includes(value) ?? false);
  const want = keysOf(c);
  s.doc.transact(() => {
    want.forEach((value, key) => {
      let t = s.files.get(key);
      if (!t) {
        if (!force && prev?.has(key)) return;   // was here before and gone from the document: the partner deleted it
        t = new s.Y.Text();
        s.files.set(key, t);
      } else if (t.toString() === value || fromDoc(key, value)) return;
      t.delete(0, t.length);
      t.insert(0, value);
    });
    s.files.forEach((_, key) => { if (!want.has(key) && (force || prev?.has(key))) s.files.delete(key); });
    const meta = JSON.stringify([c.designLanguage, c.testbenchLanguage, c.files.map((f) => f.name)]);
    if (force || !fromDoc("#meta", meta)) {
      if (s.meta.get("designLanguage") !== c.designLanguage) s.meta.set("designLanguage", c.designLanguage);
      if (s.meta.get("testbenchLanguage") !== c.testbenchLanguage) s.meta.set("testbenchLanguage", c.testbenchLanguage);
      if (JSON.stringify(s.meta.get("order")) !== JSON.stringify(c.files.map((f) => f.name))) s.meta.set("order", c.files.map((f) => f.name));
    }
  });
}
