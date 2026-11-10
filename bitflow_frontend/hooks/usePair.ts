"use client";
/**
 * hooks/usePair.ts — pair mode in the Sandbox (lib/pair.ts): connects to the link's room on BitFlow's sync server
 * (y-websocket to api/routes/pair.py) and keeps the shared Yjs document and the Sandbox's editors in step.
 *
 *  - Owner: while the open project has a session (/api/pair/<id>) it joins the room; when the room is empty,
 *    the project as saved here becomes the shared text. A new link moves it to the new link's room. Its autosave (components/ProjectsMenu.tsx) carries on.
 *  - Partner (/sandbox?pair=<code>): asked first, then their editors show the shared text. Their open-project
 *    pointer is cleared so nothing they type is saved into a project of theirs.
 *
 * Text you type goes to the document through the editor binding (lib/pair-binding.ts); everything else that changes
 * the editors (a template, a new file, the language) is written here. The partner's changes arrive through
 * `load`. Yjs and y-websocket load only when a session starts.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type * as YT from "yjs";
import type { SandboxProject } from "@/hooks/useSimulation";
import type { EditorContent } from "@/components/ProjectsMenu";
import { CURRENT_KEY } from "@/components/ProjectsMenu";
import { PAIR_KEYS, PAIR_PARAM, keysOf, parseInvite, safeColor, writeContent as write, type PairDoc } from "@/lib/pair";
import type { PairAwareness } from "@/lib/pair-binding";

export interface Peer { name: string; color: string; owner: boolean }
export interface PairCursor { clientID: number; name: string; color: string }
export type PairStatus = "off" | "connecting" | "waiting" | "live" | "ended";
type Shared = PairDoc & { awareness: PairAwareness };
interface OwnerState { enabled: boolean; session: { expiresAt: string } | null; code?: string }

const SEEN = 8;   // recent document values per file: content equal to one of them came from the document

export function usePair(projectId: string | null, content: EditorContent, load: (p: SandboxProject) => void) {
  const [invite, setInvite] = useState<string | null>(null);   // the partner's invite code, from the URL
  const [accepted, setAccepted] = useState(false);
  const [owner, setOwner] = useState<OwnerState | null>(null);
  const [shared, setShared] = useState<Shared | null>(null);
  const [status, setStatus] = useState<PairStatus>("off");
  const [error, setError] = useState<string | null>(null);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [cursors, setCursors] = useState<PairCursor[]>([]);
  const seen = useRef(new Map<string, string[]>());
  const prevKeys = useRef<Set<string> | null>(null);
  const loadRef = useRef(load); loadRef.current = load;
  const contentRef = useRef(content); contentRef.current = content;

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get(PAIR_PARAM);
    if (parseInvite(code)) setInvite(code);
  }, []);

  // Owner: is there a session for the open project?
  useEffect(() => {
    setOwner(null);
    if (!projectId || invite) return;
    let stale = false;
    fetch(`/api/pair/${projectId}`).then((r) => (r.ok ? r.json() : null)).then((j) => { if (!stale && j) setOwner(j); }).catch(() => {});
    return () => { stale = true; };
  }, [projectId, invite]);

  const target = invite ? (accepted ? { projectId: parseInvite(invite)!.projectId, invite } : null)
                        : projectId && owner?.session ? { projectId, invite: null } : null;
  const targetKey = target ? `${target.projectId}|${target.invite ?? owner?.session?.expiresAt ?? ""}` : "";

  useEffect(() => {
    if (!target) return;
    let cancelled = false, cleanup: (() => void) | null = null;
    setStatus("connecting"); setError(null);
    (async () => {
      const res = await fetch("/api/pair/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId: target.projectId, invite: target.invite }) });
      const access = await res.json().catch(() => ({ reason: "Couldn't reach BitFlow." }));
      if (cancelled) return;
      if (!res.ok) { setError(access.reason ?? "Couldn't join."); setStatus("ended"); return; }
      const [Y, { WebsocketProvider }] = await Promise.all([import("yjs"), import("y-websocket")]);
      if (cancelled) return;
      const doc = new Y.Doc();
      // disableBc: every edit goes through the server, so ending a room really stops it
      const provider = new WebsocketProvider(access.server, access.room, doc, { params: { token: access.token }, disableBc: true });
      const me = { name: String(access.name), color: safeColor(access.color), owner: !!access.owner };
      provider.awareness.setLocalStateField("user", me);
      const awareness = provider.awareness as unknown as PairAwareness;
      const files = doc.getMap<YT.Text>("files"), meta = doc.getMap<unknown>("meta");
      const remember = (key: string, value: string) => {
        const s = seen.current.get(key) ?? [];
        if (s[s.length - 1] !== value) { s.push(value); if (s.length > SEEN) s.shift(); seen.current.set(key, s); }
      };
      const rememberAll = () => {
        files.forEach((t, k) => remember(k, t.toString()));
        remember("#meta", JSON.stringify([meta.get("designLanguage"), meta.get("testbenchLanguage"), meta.get("order")]));
      };

      /** The document into the editors. */
      const fromDoc = () => {
        const get = (k: string) => files.get(k)?.toString();
        const design = get(PAIR_KEYS.design), testbench = get(PAIR_KEYS.testbench);
        if (design === undefined || testbench === undefined) return false;
        const order = (meta.get("order") as string[] | undefined) ?? [];
        const rank = (n: string) => { const i = order.indexOf(n); return i < 0 ? order.length : i; };
        const names = [...files.keys()].filter((k) => k.startsWith("file:")).map((k) => k.slice(5)).sort((a, b) => rank(a) - rank(b));
        const c = contentRef.current;
        loadRef.current({
          design, testbench, files: names.map((name) => ({ name, content: get(PAIR_KEYS.file(name)) ?? "" })),
          designLanguage: (meta.get("designLanguage") as EditorContent["designLanguage"]) ?? c.designLanguage,
          testbenchLanguage: (meta.get("testbenchLanguage") as EditorContent["testbenchLanguage"]) ?? c.testbenchLanguage,
        });
        return true;
      };
      let ready = false;
      const becomeReady = () => {
        if (ready || cancelled) return;
        ready = true;
        prevKeys.current = new Set(keysOf(contentRef.current).keys());
        setShared({ Y, doc, files, meta, awareness });
        setStatus("live");
      };
      const onDoc = (_: unknown, tr: YT.Transaction) => {
        rememberAll();
        if (!tr.local && fromDoc()) becomeReady();
      };
      files.observeDeep(onDoc);
      meta.observe(onDoc);

      // The server drops a room when its last person leaves, so a document that's already full means the partner
      // is there: take it. Empty: the owner's saved project becomes the text; the partner waits for the owner.
      const onSync = (synced: boolean) => {
        if (!synced || cancelled || ready) return;
        const empty = !files.has(PAIR_KEYS.design);
        if (!target.invite && empty) {
          write({ Y, doc, files, meta }, contentRef.current, null, true, seen.current);
          becomeReady();
        } else if (empty) setStatus("waiting");
        else { rememberAll(); fromDoc(); becomeReady(); }
      };
      provider.on("sync", onSync);
      const onClosed = () => { if (!cancelled) { setError("This pair session has ended."); setStatus("ended"); } };
      provider.on("closed", onClosed);

      type User = { name?: unknown; color?: unknown; owner?: unknown };
      const onAwareness = ({ added }: { added: number[] }) => {
        const others = [...provider.awareness.getStates()].flatMap(([id, s]) => {
          const user = (s as { user?: User }).user;
          return id !== doc.clientID && user?.name ? [{ id, name: String(user.name), color: safeColor(user.color), owner: !!user.owner }] : [];
        });
        setPeers(others.map(({ name, color, owner }) => ({ name, color, owner })));
        setCursors(others.map(({ id, name, color }) => ({ clientID: id, name, color })));
        // someone new: send our state now, so they see us at once rather than at the next 15 s renewal
        if (added.some((id) => id !== doc.clientID)) provider.awareness.setLocalStateField("user", me);
      };
      provider.awareness.on("change", onAwareness);
      cleanup = () => {
        provider.awareness.off("change", onAwareness);
        files.unobserveDeep(onDoc); meta.unobserve(onDoc);
        provider.off("sync", onSync); provider.off("closed", onClosed);
        provider.destroy(); doc.destroy();
      };
    })().catch((err) => { if (!cancelled) { setError(String((err as Error)?.message ?? err)); setStatus("ended"); } });
    return () => {
      cancelled = true; cleanup?.();
      setShared(null); setPeers([]); setCursors([]); setStatus("off"); seen.current.clear();
    };
  }, [targetKey]);  // eslint-disable-line react-hooks/exhaustive-deps

  // Changes made here that didn't come through an editor binding (a template, a new or deleted file, the language).
  useEffect(() => {
    if (!shared) return;
    write(shared, content, prevKeys.current, false, seen.current);
    prevKeys.current = new Set(keysOf(content).keys());
  }, [shared, content]);

  const text = useCallback((key: string) => shared?.files.get(key) ?? null, [shared]);

  const startSession = useCallback(async () => {
    if (!projectId) return;
    setError(null);
    const res = await fetch(`/api/pair/${projectId}`, { method: "POST" });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) { setError(j.error ?? "Couldn't start pairing."); return; }
    setOwner((o) => ({ enabled: true, ...o, session: { expiresAt: j.expiresAt }, code: j.code }));
  }, [projectId]);
  const endSession = useCallback(async () => {
    if (!projectId) return;
    await fetch(`/api/pair/${projectId}`, { method: "DELETE" }).catch(() => null);
    setOwner((o) => (o ? { ...o, session: null, code: undefined } : o));
    setError(null);
  }, [projectId]);
  const join = useCallback(() => {
    try { localStorage.removeItem(CURRENT_KEY); } catch { /* storage off */ }
    setAccepted(true);
  }, []);
  const leaveSession = useCallback(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete(PAIR_PARAM);
    window.history.replaceState(null, "", url);
    setInvite(null); setAccepted(false); setError(null);
  }, []);

  return {
    role: invite ? ("guest" as const) : ("owner" as const),
    invited: !!invite && !accepted,
    enabled: !!owner?.enabled,
    session: owner?.session ?? null,
    code: owner?.code ?? null,
    status, error, peers, cursors,
    awareness: shared?.awareness ?? null,
    text, startSession, endSession, join, leave: leaveSession,
  };
}
export type Pair = ReturnType<typeof usePair>;
