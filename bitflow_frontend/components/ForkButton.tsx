"use client";
/** components/ForkButton.tsx — "Open in my Sandbox" for a shared design (/s/[id]). */

import { useRouter } from "next/navigation";
import { DESIGN_LANGUAGE_KEY, DESIGN_STORAGE_KEY, TESTBENCH_LANGUAGE_KEY, TESTBENCH_STORAGE_KEY } from "@/hooks/useSimulation";

export default function ForkButton({ designCode, testbenchCode }: { designCode: string; testbenchCode: string }) {
  const router = useRouter();
  const fork = () => {
    if (!window.confirm("Open this design in your Sandbox? It replaces the code currently in your Sandbox editors.")) return;
    try {
      localStorage.setItem(DESIGN_STORAGE_KEY, JSON.stringify(designCode));
      localStorage.setItem(TESTBENCH_STORAGE_KEY, JSON.stringify(testbenchCode));
      localStorage.setItem(DESIGN_LANGUAGE_KEY, JSON.stringify("verilog"));      // shared designs are Verilog
      localStorage.setItem(TESTBENCH_LANGUAGE_KEY, JSON.stringify("verilog"));
    } catch {
      window.alert("Your browser blocked saving to local storage, so the design can't be opened in the Sandbox.");
      return;
    }
    router.push("/sandbox");
  };
  return (
    <button onClick={fork}
            className="px-4 py-2 rounded-lg border border-phosphor/40 bg-phosphor/10 text-phosphor font-mono text-[12px] font-semibold hover:bg-phosphor/20 transition-colors">
      Open in my Sandbox
    </button>
  );
}
