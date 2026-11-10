"use client";
/**
 * hooks/usePair.ts — pair mode in the Sandbox (lib/pair.ts): connects to the project's Liveblocks room and keeps
 * the shared Yjs document and the Sandbox's editors in step.
 *
 *  - Owner: while the open project has a session (/api/pair/<id>) it joins the room; when nobody else is in it,
 *    the project as saved here becomes the shared text. Its autosave (components/ProjectsMenu.tsx) carries on.
 *  - Partner (/sandbox?pair=<code>): asked first, then their editors show the shared text. Their open-project
 *    pointer is cleared so nothing they type is saved into a project of theirs.
 *
 * Text you type goes to the document through the editor binding (lib/pair-binding.ts); everything else that changes
 * the editors (a template, a new file, the language) is written here. The partner's changes arrive through
 * `load`. Liveblocks and Yjs load only when a session starts.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type * as YT from "yjs";
import type { SandboxProject } from "@/hooks/useSimulation";
import type { EditorContent } from "@/components/ProjectsMenu";
import { CURRENT_KEY } from "@/components/ProjectsMenu";
import { PAIR_KEYS, PAIR_PARAM, keysOf, parseInvite, roomFor, safeColor, writeContent as write, type PairDoc } from "@/lib/pair";
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
  const targetKey = target ? `${target.projectId}|${target.invite ?? ""}` : "";

  useEffect(() => {
    if (!target) return;
    let cancelled = false, cleanup: (() => void) | null = null;
    setStatus("connecting"); setError(null);
    (async () => {
      const [Y, { createClient }, { LiveblocksYjsProvider }] = await Promise.all([import("yjs"), import("@liveblocks/client"), import("@liveblocks/yjs")]);
      if (cancelled) return;
      const client = createClient({
        authEndpoint: async (room) => {
          const res = await fetch("/api/pair/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ room, invite: target.invite }) });
          const j = await res.json().catch(() => ({ error: "forbidden", reason: "Couldn't reach BitFlow." }));
          if (!res.ok && !cancelled) { setError(j.reason ?? "Couldn't join."); setStatus("ended"); }
          return j;
        },
      });
      const { room, leave } = client.enterRoom(roomFor(target.projectId), { initialPresence: {} });
      const doc = new Y.Doc();
      const provider = new LiveblocksYjsProvider(room, doc);
      const files = doc.getMap<YT.Text>("files"), meta = doc.getMap<unknown>("meta");
      const awareness = provider.awareness as unknown as PairAwareness;
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

      const onSync = (synced: boolean) => {
        if (!synced || cancelled || ready) return;
        const empty = !files.has(PAIR_KEYS.design);
        if (!target.invite && (empty || room.getOthers().length === 0)) {   // owner, alone: the saved project is the truth
          write({ Y, doc, files, meta }, contentRef.current, null, true, seen.current);
          becomeReady();
        } else if (empty) setStatus("waiting");                             // partner, before the owner has opened it
        else { rememberAll(); fromDoc(); becomeReady(); }
      };
      provider.on("sync", onSync);
      if (provider.synced) onSync(true);

      const updatePeers = () => setPeers(room.getOthers().map((o) => o.info as unknown as Peer).filter((p) => p?.name));
      const onAwareness = () => setCursors([...awareness.getStates()].flatMap(([clientID, s]) => {
        const user = (s as { user?: { name?: string; color?: string } } | null)?.user;
        return clientID !== doc.clientID && user?.name ? [{ clientID, name: String(user.name), color: safeColor(user.color) }] : [];
      }));
      let me = "";   // setting awareness updates presence, which fires `self` again: write only on a real change
      const subs = [
        room.events.others.subscribe(updatePeers),
        room.events.self.subscribe((self) => {
          const info = self.info as unknown as Peer | undefined;
          const key = info ? `${info.name}\n${info.color}` : "";
          if (!info || key === me) return;
          me = key;
          awareness.setLocalStateField("user", { name: info.name, color: info.color } as never);
        }),
      ];
      awareness.on("change", onAwareness);
      cleanup = () => {
        subs.forEach((u) => u());
        awareness.off("change", onAwareness);
        files.unobserveDeep(onDoc); meta.unobserve(onDoc);
        provider.off("sync", onSync);
        provider.destroy(); leave(); doc.destroy();
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
