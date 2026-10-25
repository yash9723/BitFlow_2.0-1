/**
 * lib/bitstream-handoff.ts — pass a built bitstream from the Bitstream tab to the /flash page.
 * /flash is cross-origin isolated, so it opens in its own browsing context group: no
 * window.opener or postMessage between them, but the same IndexedDB. One record, read once.
 */
import type { BoardId } from "./synth/boards";

export interface Handoff { name: string; board: BoardId; bytes: Uint8Array; at: number }

const MAX_AGE_MS = 10 * 60_000;   // a bitstream left behind from a while ago isn't what the user means

function store(mode: IDBTransactionMode): Promise<IDBObjectStore> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("bitflow-handoff", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("bitstream");
    req.onsuccess = () => resolve(req.result.transaction("bitstream", mode).objectStore("bitstream"));
    req.onerror = () => reject(req.error);
  });
}
const done = <T>(req: IDBRequest<T>) => new Promise<T>((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });

export async function putBitstream(h: Omit<Handoff, "at">): Promise<void> {
  await done((await store("readwrite")).put({ ...h, at: Date.now() }, "pending"));
}

/** The bitstream the Bitstream tab left (removed once read), or null. */
export async function takeBitstream(): Promise<Handoff | null> {
  try {
    const s = await store("readwrite");
    const h = await done(s.get("pending")) as Handoff | undefined;
    if (h) s.delete("pending");
    return h && Date.now() - h.at < MAX_AGE_MS ? h : null;
  } catch {
    return null;   // IndexedDB off (private window, blocked storage): the page still takes a file
  }
}
