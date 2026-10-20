/**
 * lib/sim-status.ts — is the simulator (Render free instance, sleeps after
 * ~15 min idle) awake? Requests to it go through trackWake(); if one takes a
 * while and the simulator hasn't answered recently, the status turns "waking"
 * and components/SimulatorWakeNotice.tsx explains the wait.
 */

import { useSyncExternalStore } from "react";

export type SimStatus = "idle" | "waking" | "ready";

const SLOW_MS      = 3_500;       // a cold start shows up as a request still pending after this
const AWAKE_FOR_MS = 12 * 60_000; // Render sleeps after ~15 min without traffic

let status: SimStatus = "idle";
let lastOk = 0;
const listeners = new Set<() => void>();

function set(next: SimStatus) {
  if (next === status) return;
  status = next;
  listeners.forEach((l) => l());
}

export function useSimStatus(): SimStatus {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => { listeners.delete(l); }; },
    () => status,
    () => "idle",
  );
}

/** Await a simulator request, flagging a probable cold start while it's slow. */
export async function trackWake<T>(request: Promise<T>): Promise<T> {
  const timer = setTimeout(() => {
    if (Date.now() - lastOk > AWAKE_FOR_MS) set("waking");
  }, SLOW_MS);
  try {
    const result = await request;
    lastOk = Date.now();
    set("ready");
    return result;
  } catch (err) {
    if (status === "waking") set("idle");
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
