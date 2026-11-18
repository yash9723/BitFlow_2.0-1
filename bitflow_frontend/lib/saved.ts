/**
 * lib/saved.ts — things a visitor starred (problems, articles), kept in this browser only
 * (localStorage, per device; nothing reaches the server). useSaved("problems") gives the list;
 * toggleSaved flips one. Every component using the same kind updates together, across tabs too.
 */
import { useSyncExternalStore } from "react";

export type SavedKind = "problems" | "articles";
const keyOf = (k: SavedKind) => `bf:saved:${k}`;
const listeners = new Set<() => void>();
const raws = new Map<SavedKind, string>();
const lists = new Map<string, string[]>();
const EMPTY: string[] = [];

/** Parse the stored list; anything malformed counts as empty. */
export function parseSaved(raw: string | null): string[] {
  try { const v = JSON.parse(raw ?? "[]"); return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []; } catch { return []; }
}

function snapshot(kind: SavedKind): string[] {
  let raw = raws.get(kind);
  if (raw === undefined) {
    try { raw = localStorage.getItem(keyOf(kind)) ?? "[]"; } catch { raw = "[]"; }
    raws.set(kind, raw);
  }
  if (!lists.has(raw)) lists.set(raw, parseSaved(raw));
  return lists.get(raw)!;
}

export function toggleSaved(kind: SavedKind, id: string) {
  const list = snapshot(kind);
  const next = JSON.stringify(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  try { localStorage.setItem(keyOf(kind), next); } catch { /* private mode: kept for this visit only */ }
  raws.set(kind, next);
  listeners.forEach((l) => l());
}

export function useSaved(kind: SavedKind): string[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      const onStorage = (e: StorageEvent) => { if (e.key === keyOf(kind)) { raws.delete(kind); l(); } };
      addEventListener("storage", onStorage);
      return () => { listeners.delete(l); removeEventListener("storage", onStorage); };
    },
    () => snapshot(kind),
    () => EMPTY,
  );
}
