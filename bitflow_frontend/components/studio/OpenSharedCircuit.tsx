"use client";
/** components/studio/OpenSharedCircuit.tsx — "Open in the editor" for a circuit shared at /s/[id]: the editor picks it up when it opens. */

import { useRouter } from "next/navigation";
import { CIRCUIT_INCOMING_KEY } from "@/lib/studio/logic-circuit";

export default function OpenSharedCircuit({ json }: { json: string }) {
  const router = useRouter();
  const open = () => {
    try { localStorage.setItem(CIRCUIT_INCOMING_KEY, json); } catch { window.alert("Your browser blocked local storage, so the circuit can't be opened."); return; }
    router.push("/studio/circuit");
  };
  return (
    <button onClick={open} className="px-4 py-2 rounded-lg border border-phosphor/50 bg-phosphor/10 text-phosphor font-mono text-[12px] hover:bg-phosphor/20">
      Open in the circuit editor
    </button>
  );
}
